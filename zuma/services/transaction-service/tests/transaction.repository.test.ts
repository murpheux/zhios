import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongooseTransactionRepository } from '../src/infrastructure/persistence/transaction.repository';

describe('MongooseTransactionRepository', () => {
  let mongoServer: MongoMemoryServer;
  let repository: MongooseTransactionRepository;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    repository = new MongooseTransactionRepository();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  it('creates and retrieves a transaction by id', async () => {
    const created = await repository.create({
      walletId: 'wallet-1',
      ownerUserId: 'user-1',
      type: 'send',
      amount: '0.001',
      feeRate: '12',
    });

    expect(created.id).toBeDefined();
    expect(created.status).toBe('pending');

    const found = await repository.findById(created.id);
    expect(found?.walletId).toBe('wallet-1');
  });

  it('paginates transactions filtered by walletId', async () => {
    await repository.create({ walletId: 'wallet-a', ownerUserId: 'user-1', type: 'send', amount: '0.001', feeRate: '12' });
    await repository.create({ walletId: 'wallet-b', ownerUserId: 'user-1', type: 'receive', amount: '0.002', feeRate: '8' });

    const result = await repository.findMany({ walletId: 'wallet-a' }, { page: 1, limit: 10 });
    expect(result.total).toBe(1);
    expect(result.items[0]?.walletId).toBe('wallet-a');
  });

  it('updates status/txid for an existing transaction and returns null for unknown id', async () => {
    const created = await repository.create({
      walletId: 'wallet-c',
      ownerUserId: 'user-1',
      type: 'send',
      amount: '0.001',
      feeRate: '12',
    });

    const updated = await repository.update(created.id, { txid: 'abc123', status: 'broadcast' });
    expect(updated?.txid).toBe('abc123');
    expect(updated?.status).toBe('broadcast');

    const missing = await repository.update(new mongoose.Types.ObjectId().toString(), {
      status: 'failed',
    });
    expect(missing).toBeNull();
  });

  it('transition only applies when the document is still in fromStatus (atomic CAS)', async () => {
    const created = await repository.create({
      walletId: 'wallet-d',
      ownerUserId: 'user-1',
      type: 'send',
      amount: '0.001',
      feeRate: '12',
    });

    const claimed = await repository.transition(created.id, 'pending', { status: 'broadcast' });
    expect(claimed?.status).toBe('broadcast');

    // A second attempt from the same stale 'pending' assumption must lose the race.
    const lost = await repository.transition(created.id, 'pending', { status: 'broadcast' });
    expect(lost).toBeNull();
  });
});
