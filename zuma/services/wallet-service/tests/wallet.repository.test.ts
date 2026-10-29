import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongooseWalletRepository } from '../src/infrastructure/persistence/wallet.repository';

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
    expect(created.balanceCache).toBe('0');

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
});
