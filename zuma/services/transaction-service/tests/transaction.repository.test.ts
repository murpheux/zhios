import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongooseTransactionRepository } from '../src/infrastructure/persistence/transaction.repository';
import { TransactionModel } from '../src/infrastructure/persistence/mongoose/transaction.model';
import { DuplicateIdempotencyKeyError } from '../src/application/ports/transaction-repository.port';

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

  const props = (overrides: Record<string, string> = {}) => ({
    walletId: 'wallet-1',
    ownerUserId: 'user-1',
    idempotencyKey: `key-${new mongoose.Types.ObjectId().toString()}`,
    type: 'send' as const,
    amount: '100000',
    feeRate: '12',
    feeSats: '1692',
    destinationAddress: 'tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7',
    rawTx: 'rawtx:signed',
    ...overrides,
  });

  it('creates the full record (rawTx + destination) in one insert and retrieves it', async () => {
    const created = await repository.create(props());
    expect(created.status).toBe('pending');
    expect(created.rawTx).toBe('rawtx:signed');
    expect(created.debitedAt).toBeNull();

    const found = await repository.findById(created.id);
    expect(found?.destinationAddress).toBe(props().destinationAddress);
    expect(await repository.findById('not-an-object-id')).toBeNull();
  });

  it('maps an E11000 on (ownerUserId, idempotencyKey) to DuplicateIdempotencyKeyError', async () => {
    await TransactionModel.init();
    const p = props({ idempotencyKey: 'same-key-123' });
    const results = await Promise.allSettled([repository.create(p), repository.create(p)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(DuplicateIdempotencyKeyError);
  });

  it('paginates transactions filtered by walletId', async () => {
    await repository.create(props({ walletId: 'wallet-a' }));
    await repository.create(props({ walletId: 'wallet-b' }));

    const result = await repository.findMany({ walletId: 'wallet-a' }, { page: 1, limit: 10 });
    expect(result.total).toBe(1);
    expect(result.items[0]?.walletId).toBe('wallet-a');
  });

  it('transition only applies when the document is still in fromStatus (atomic CAS)', async () => {
    const created = await repository.create(props());

    const claimed = await repository.transition(created.id, 'pending', { status: 'broadcasting' });
    expect(claimed?.status).toBe('broadcasting');

    // A second attempt from the same stale 'pending' assumption must lose the race.
    const lost = await repository.transition(created.id, 'pending', { status: 'broadcasting' });
    expect(lost).toBeNull();

    const done = await repository.transition(created.id, 'broadcasting', { status: 'broadcast', txid: 'abc' });
    expect(done?.txid).toBe('abc');
    expect(await repository.transition(new mongoose.Types.ObjectId().toString(), 'pending', {})).toBeNull();
  });
});
