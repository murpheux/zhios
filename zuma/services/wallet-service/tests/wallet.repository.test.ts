import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongooseWalletRepository } from '../src/infrastructure/persistence/wallet.repository';
import { MongooseLedgerRepository } from '../src/infrastructure/persistence/ledger.repository';
import { WalletModel } from '../src/infrastructure/persistence/mongoose/wallet.model';
import { LedgerEntryModel } from '../src/infrastructure/persistence/mongoose/ledger-entry.model';

describe('MongooseWalletRepository', () => {
  let mongoServer: MongoMemoryServer;
  let repository: MongooseWalletRepository;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    repository = new MongooseWalletRepository();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  it('creates and retrieves a wallet by id', async () => {
    const created = await repository.create({
      label: 'Test Wallet',
      address: 'tb1qtest',
      network: 'testnet',
      type: 'hot',
      ownerUserId: 'user-1',
    });

    expect(created.id).toBeDefined();
    expect(created.balanceSats).toBe(0);

    const found = await repository.findById(created.id);
    expect(found?.address).toBe('tb1qtest');
  });

  it('paginates wallets filtered by owner', async () => {
    await repository.create({
      label: 'A',
      address: 'tb1qa',
      network: 'testnet',
      type: 'hot',
      ownerUserId: 'owner-a',
    });
    await repository.create({
      label: 'B',
      address: 'tb1qb',
      network: 'testnet',
      type: 'hot',
      ownerUserId: 'owner-b',
    });

    const result = await repository.findMany({ ownerUserId: 'owner-a' }, { page: 1, limit: 10 });
    expect(result.total).toBe(1);
    expect(result.items[0]?.ownerUserId).toBe('owner-a');
  });

  it('updates metadata for an existing wallet and returns null for unknown id', async () => {
    const created = await repository.create({
      label: 'C',
      address: 'tb1qc',
      network: 'testnet',
      type: 'hot',
      ownerUserId: 'owner-c',
    });

    const updated = await repository.updateMetadata(created.id, { label: 'Renamed' });
    expect(updated?.label).toBe('Renamed');

    const missing = await repository.updateMetadata(new mongoose.Types.ObjectId().toString(), {
      label: 'Nope',
    });
    expect(missing).toBeNull();
  });

  describe('guarded balance movements', () => {
    const newWallet = async (balanceSats: number, status: 'active' | 'suspended' = 'active') => {
      const created = await repository.create({
        label: 'M',
        address: `tb1q${new mongoose.Types.ObjectId().toString()}`,
        network: 'testnet',
        type: 'hot',
        ownerUserId: 'owner-m',
      });
      await WalletModel.updateOne({ _id: created.id }, { $set: { balanceSats, status } });
      return created.id;
    };

    it('applies a debit once even if the same movement id is replayed', async () => {
      const id = await newWallet(5000);
      const first = await repository.applyBalanceMovement({
        walletId: id,
        movementId: 'm-1',
        deltaSats: -1000,
        requireActive: true,
      });
      expect(first.outcome).toBe('applied');
      const replay = await repository.applyBalanceMovement({
        walletId: id,
        movementId: 'm-1',
        deltaSats: -1000,
        requireActive: true,
      });
      expect(replay.outcome).toBe('already-applied');
      expect((await repository.findById(id))?.balanceSats).toBe(4000);
    });

    it('never overdraws: concurrent debits exceeding the balance only partially succeed', async () => {
      const id = await newWallet(2500);
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          repository.applyBalanceMovement({
            walletId: id,
            movementId: `c-${i}`,
            deltaSats: -1000,
            requireActive: true,
          }),
        ),
      );
      expect(results.filter((r) => r.outcome === 'applied')).toHaveLength(2);
      expect(results.filter((r) => r.outcome === 'insufficient-funds')).toHaveLength(3);
      expect((await repository.findById(id))?.balanceSats).toBe(500);
    });

    it('refuses to debit a suspended wallet but still accepts credits', async () => {
      const id = await newWallet(5000, 'suspended');
      const debit = await repository.applyBalanceMovement({
        walletId: id,
        movementId: 'd-1',
        deltaSats: -1,
        requireActive: true,
      });
      expect(debit.outcome).toBe('not-active');
      const credit = await repository.applyBalanceMovement({
        walletId: id,
        movementId: 'r-1',
        deltaSats: 10,
        requireActive: false,
      });
      expect(credit.outcome).toBe('applied');
      expect((await repository.findById(id))?.balanceSats).toBe(5010);
    });

    it('reports not-found for an unknown or malformed wallet id', async () => {
      const unknown = await repository.applyBalanceMovement({
        walletId: new mongoose.Types.ObjectId().toString(),
        movementId: 'x',
        deltaSats: -1,
        requireActive: true,
      });
      expect(unknown.outcome).toBe('not-found');
      const malformed = await repository.applyBalanceMovement({
        walletId: 'not-an-id',
        movementId: 'x',
        deltaSats: -1,
        requireActive: true,
      });
      expect(malformed.outcome).toBe('not-found');
    });

    it('clearPendingMovement removes the marker', async () => {
      const id = await newWallet(10);
      await repository.applyBalanceMovement({ walletId: id, movementId: 'p-1', deltaSats: 5, requireActive: false });
      await repository.clearPendingMovement(id, 'p-1');
      expect((await WalletModel.findById(id))?.pendingLedgerIds).toEqual([]);
    });
  });

  describe('MongooseLedgerRepository', () => {
    it('returns the existing entry (inserted=false) on a duplicate (transactionId, kind, reason)', async () => {
      await LedgerEntryModel.init();
      const ledger = new MongooseLedgerRepository();
      const props = {
        walletId: 'w',
        transactionId: new mongoose.Types.ObjectId().toString(),
        kind: 'debit' as const,
        reason: 'send' as const,
        amountSats: 1000,
      };
      const [a, b] = await Promise.all([ledger.insertPending(props), ledger.insertPending(props)]);
      expect([a.inserted, b.inserted].sort()).toEqual([false, true]);
      expect(a.entry.id).toBe(b.entry.id);
    });
  });
});
