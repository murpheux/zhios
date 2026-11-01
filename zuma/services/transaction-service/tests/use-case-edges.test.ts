import { ConflictError, NotFoundError, ValidationError, type Actor } from '@zuma/shared-common';
import { BroadcastTransactionUseCase } from '../src/application/use-cases/broadcast-transaction.use-case';
import { CreateTransactionUseCase } from '../src/application/use-cases/create-transaction.use-case';
import { GetTransactionStatusUseCase } from '../src/application/use-cases/get-transaction-status.use-case';
import { GetTransactionUseCase } from '../src/application/use-cases/get-transaction.use-case';
import { ListTransactionsUseCase } from '../src/application/use-cases/list-transactions.use-case';
import { ValidateTransactionUseCase } from '../src/application/use-cases/validate-transaction.use-case';
import { BroadcastRejectedError } from '../src/application/ports/bitcoin-node-client.port';
import { DuplicateIdempotencyKeyError } from '../src/application/ports/transaction-repository.port';
import {
  TESTNET_P2WSH,
  TX_ID,
  WALLET_ID,
  buildTransaction,
  mockAudit,
  mockNode,
  mockSystemEvents,
  mockTransactionRepository,
  mockWalletService,
} from './helpers';

const owner: Actor = { sub: 'user-1', roles: [] };
const auditor: Actor = { sub: 'aud', roles: ['auditor'] };
const funded = () => buildTransaction({ debitedAt: new Date('2024-01-01T00:01:00.000Z') });

describe('BroadcastTransactionUseCase edges', () => {
  const setup = () => {
    const repo = mockTransactionRepository();
    const node = mockNode();
    const audit = mockAudit();
    const wallet = mockWalletService();
    const events = mockSystemEvents();
    return { repo, node, audit, wallet, events, useCase: new BroadcastTransactionUseCase(repo, node, audit, wallet, events) };
  };

  it('404s a missing transaction', async () => {
    const { repo, useCase } = setup();
    repo.findById.mockResolvedValue(null);
    await expect(useCase.execute(TX_ID, owner)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('flags BROADCAST_STATE_CONFLICT (and records the txid) when the post-broadcast CAS is lost', async () => {
    const { repo, node, events, audit, useCase } = setup();
    repo.findById.mockResolvedValue(funded());
    repo.transition.mockResolvedValueOnce(funded()).mockResolvedValueOnce(null);
    node.broadcast.mockResolvedValue({ txid: 'feed' });
    await expect(useCase.execute(TX_ID, owner)).rejects.toMatchObject({ code: 'BROADCAST_STATE_CONFLICT' });
    expect(events.record).toHaveBeenCalledWith({
      eventType: 'transaction.broadcast_state_lost',
      payload: { transactionId: TX_ID, txid: 'feed' },
    });
    expect(audit.create).not.toHaveBeenCalled();
  });

  it('records wallet.refund_rejected when wallet-service refuses the refund', async () => {
    const { repo, node, wallet, events, useCase } = setup();
    repo.findById.mockResolvedValue(funded());
    repo.transition.mockResolvedValueOnce(funded()).mockResolvedValueOnce(funded());
    node.broadcast.mockRejectedValue(new BroadcastRejectedError('bad-txns'));
    wallet.refund.mockResolvedValue({ ok: false, code: 'REFUND_WITHOUT_DEBIT', message: 'no debit' });

    const error = await useCase.execute(TX_ID, owner).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'BROADCAST_FAILED' });
    expect((error as Error).message).toMatch(/refund is pending/);
    expect(events.record).toHaveBeenCalledWith({
      eventType: 'wallet.refund_rejected',
      payload: { transactionId: TX_ID, walletId: WALLET_ID, code: 'REFUND_WITHOUT_DEBIT' },
    });
  });

  it('does not refund when the fail CAS is lost (another actor already moved it)', async () => {
    const { repo, node, wallet, useCase } = setup();
    repo.findById.mockResolvedValue(funded());
    repo.transition.mockResolvedValueOnce(funded()).mockResolvedValueOnce(null);
    node.broadcast.mockRejectedValue(new BroadcastRejectedError('bad-txns'));
    await expect(useCase.execute(TX_ID, owner)).rejects.toMatchObject({ code: 'BROADCAST_FAILED' });
    expect(wallet.refund).not.toHaveBeenCalled();
  });

  it('409s INVALID_TRANSACTION_STATE without rawTx', async () => {
    const { repo, useCase } = setup();
    repo.findById.mockResolvedValue(buildTransaction({ debitedAt: new Date(), rawTx: null }));
    await expect(useCase.execute(TX_ID, owner)).rejects.toMatchObject({ code: 'INVALID_TRANSACTION_STATE' });
  });
});

describe('CreateTransactionUseCase edges', () => {
  const input = { walletId: WALLET_ID, type: 'send' as const, amount: '1000', feeRate: '2', destinationAddress: TESTNET_P2WSH, idempotencyKey: 'idem-key-9999' };
  const setup = () => {
    const repo = mockTransactionRepository();
    const node = mockNode();
    const audit = mockAudit();
    const wallet = mockWalletService();
    return { repo, node, audit, wallet, useCase: new CreateTransactionUseCase(repo, node, audit, wallet, 'testnet') };
  };

  it.each<[string, number]>([
    ['negative', -1],
    ['fractional', 1.5],
    ['NaN', Number.NaN],
  ])('refuses a %s fee from the node before persisting anything', async (_name, feeSats) => {
    const { repo, node, wallet, useCase } = setup();
    node.build.mockResolvedValue({ rawTx: 'raw', feeSats });
    await expect(useCase.execute(input, owner)).rejects.toThrow('Bitcoin node returned an invalid fee');
    expect(node.sign).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
    expect(wallet.debit).not.toHaveBeenCalled();
  });

  it('rethrows the duplicate-key error when the race winner cannot be found', async () => {
    const { repo, useCase } = setup();
    const duplicate = new DuplicateIdempotencyKeyError('user-1', 'idem-key-9999');
    repo.create.mockRejectedValue(duplicate);
    repo.findByIdempotencyKey.mockResolvedValue(null);
    await expect(useCase.execute(input, owner)).rejects.toBe(duplicate);
  });

  it('rethrows other persistence errors', async () => {
    const { repo, useCase } = setup();
    repo.create.mockRejectedValue(new Error('write concern'));
    await expect(useCase.execute(input, owner)).rejects.toThrow('write concern');
    expect(repo.findByIdempotencyKey).toHaveBeenCalledTimes(1);
  });

  it('falls back to re-reading (then the original record) when the debitedAt CAS is lost', async () => {
    const { repo, useCase } = setup();
    const created = buildTransaction({ amount: '1000', feeRate: '2', feeSats: '1692' });
    repo.create.mockResolvedValue(created);
    repo.transition.mockResolvedValue(null);
    repo.findById.mockResolvedValueOnce(null);
    await expect(useCase.execute(input, owner)).resolves.toBe(created);
  });

  it('returns a replayed broadcast transaction as-is', async () => {
    const { repo, wallet, useCase } = setup();
    repo.findByIdempotencyKey.mockResolvedValue(
      buildTransaction({ ...input, status: 'broadcast', txid: 'ab', debitedAt: new Date() }),
    );
    await expect(useCase.execute(input, owner)).resolves.toMatchObject({ status: 'broadcast' });
    expect(wallet.debit).not.toHaveBeenCalled();
  });

  it('returns (not re-raises) a replay that failed for a non-debit reason', async () => {
    const { repo, useCase } = setup();
    repo.findByIdempotencyKey.mockResolvedValue(
      buildTransaction({ ...input, status: 'failed', failureReason: 'BROADCAST_REJECTED', debitedAt: new Date() }),
    );
    await expect(useCase.execute(input, owner)).resolves.toMatchObject({ failureReason: 'BROADCAST_REJECTED' });
  });

  it.each<[string, Partial<typeof input>]>([
    ['missing idempotency key', { idempotencyKey: undefined as unknown as string }],
    ['bad idempotency key', { idempotencyKey: 'bad key!' }],
  ])('400s on %s', async (_name, overrides) => {
    await expect(setup().useCase.execute({ ...input, ...overrides }, owner)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('read use-cases', () => {
  it('ValidateTransactionUseCase 404s a missing transaction and 400s a non-pending one', async () => {
    const repo = mockTransactionRepository();
    const useCase = new ValidateTransactionUseCase(repo);
    repo.findById.mockResolvedValueOnce(null);
    await expect(useCase.execute(TX_ID, owner)).rejects.toBeInstanceOf(NotFoundError);
    repo.findById.mockResolvedValueOnce(buildTransaction({ status: 'broadcast', debitedAt: new Date() }));
    await expect(useCase.execute(TX_ID, auditor)).rejects.toMatchObject({
      details: { status: 'broadcast', fundsReserved: true },
    });
  });

  it('GetTransactionUseCase hides other users’ transactions but shows them to auditors', async () => {
    const repo = mockTransactionRepository();
    repo.findById.mockResolvedValue(buildTransaction({ ownerUserId: 'someone-else' }));
    const useCase = new GetTransactionUseCase(repo);
    await expect(useCase.execute(TX_ID, owner)).rejects.toBeInstanceOf(NotFoundError);
    await expect(useCase.execute(TX_ID, auditor)).resolves.toMatchObject({ id: TX_ID });
  });

  it.each<[Actor, Record<string, unknown>]>([
    [owner, { walletId: WALLET_ID, ownerUserId: 'user-1' }],
    [auditor, { walletId: WALLET_ID }],
  ])('ListTransactionsUseCase scopes the filter for %j', async (actor, expected) => {
    const repo = mockTransactionRepository();
    repo.findMany.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 1 });
    await new ListTransactionsUseCase(repo).execute({ walletId: WALLET_ID }, { page: 1, limit: 20 }, actor);
    expect(repo.findMany).toHaveBeenCalledWith(expected, { page: 1, limit: 20 });
  });

  it('GetTransactionStatusUseCase reports node confirmations when the CAS is lost and the record vanished', async () => {
    const repo = mockTransactionRepository();
    const node = mockNode();
    repo.findById
      .mockResolvedValueOnce(buildTransaction({ status: 'broadcast', txid: 'ab', confirmations: 0 }))
      .mockResolvedValueOnce(null);
    repo.transition.mockResolvedValue(null);
    node.getConfirmations.mockResolvedValue(2);
    await expect(new GetTransactionStatusUseCase(repo, node).execute(TX_ID, owner)).resolves.toEqual({
      transactionId: TX_ID,
      status: 'broadcast',
      confirmations: 2,
    });
  });

  it('GetTransactionStatusUseCase does not write while a broadcast has 0 confirmations', async () => {
    const repo = mockTransactionRepository();
    const node = mockNode();
    repo.findById.mockResolvedValue(buildTransaction({ status: 'broadcast', txid: 'ab' }));
    node.getConfirmations.mockResolvedValue(0);
    await expect(new GetTransactionStatusUseCase(repo, node).execute(TX_ID, owner)).resolves.toMatchObject({
      status: 'broadcast',
      confirmations: 0,
    });
    expect(repo.transition).not.toHaveBeenCalled();
  });
});

describe('ConflictError surface', () => {
  it('is what use-cases throw for state conflicts', () => {
    expect(new ConflictError('x', 'BROADCAST_FAILED').httpStatus).toBe(409);
  });
});
