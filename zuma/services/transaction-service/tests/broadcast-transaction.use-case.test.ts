import { ConflictError, ForbiddenError, NotFoundError, type Actor } from '@zuma/shared-common';
import { BroadcastTransactionUseCase } from '../src/application/use-cases/broadcast-transaction.use-case';
import { BroadcastRejectedError } from '../src/application/ports/bitcoin-node-client.port';
import type { TransactionEntity } from '../src/domain/entities/transaction.entity';
import {
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
const funded = (overrides: Partial<TransactionEntity> = {}) =>
  buildTransaction({ debitedAt: new Date('2024-01-01T00:01:00.000Z'), ...overrides });

const setup = () => {
  const repo = mockTransactionRepository();
  const node = mockNode();
  const audit = mockAudit();
  const wallet = mockWalletService();
  const events = mockSystemEvents();
  const useCase = new BroadcastTransactionUseCase(repo, node, audit, wallet, events);
  return { repo, node, audit, wallet, events, useCase };
};

describe('BroadcastTransactionUseCase', () => {
  it('CAS pending->broadcasting, broadcasts, then CAS broadcasting->broadcast with txid', async () => {
    const { repo, node, audit, events, useCase } = setup();
    repo.findById.mockResolvedValue(funded());
    repo.transition
      .mockResolvedValueOnce(funded({ status: 'broadcasting' }))
      .mockResolvedValueOnce(funded({ status: 'broadcast', txid: 'abc' }));
    node.broadcast.mockResolvedValue({ txid: 'abc' });

    const result = await useCase.execute(TX_ID, owner);

    expect(repo.transition).toHaveBeenNthCalledWith(1, TX_ID, 'pending', { status: 'broadcasting' });
    expect(repo.transition).toHaveBeenNthCalledWith(2, TX_ID, 'broadcasting', {
      status: 'broadcast',
      txid: 'abc',
      broadcastAt: expect.any(Date),
    });
    expect(result.status).toBe('broadcast');
    expect(audit.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'transaction.broadcast' }));
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'transaction.broadcast' }));
  });

  it('on node rejection marks failed, refunds amount + fee by transactionId, and records events', async () => {
    const { repo, node, wallet, events, useCase } = setup();
    repo.findById.mockResolvedValue(funded());
    repo.transition
      .mockResolvedValueOnce(funded({ status: 'broadcasting' }))
      .mockResolvedValueOnce(funded({ status: 'failed', failureReason: 'BROADCAST_REJECTED' }))
      .mockResolvedValueOnce(funded({ status: 'failed', refundedAt: new Date() }));
    node.broadcast.mockRejectedValue(new BroadcastRejectedError('txn-mempool-conflict'));

    await expect(useCase.execute(TX_ID, owner)).rejects.toMatchObject({ code: 'BROADCAST_FAILED' });

    expect(repo.transition).toHaveBeenNthCalledWith(2, TX_ID, 'broadcasting', {
      status: 'failed',
      failureReason: 'BROADCAST_REJECTED',
    });
    expect(wallet.refund).toHaveBeenCalledWith({ walletId: WALLET_ID, transactionId: TX_ID, amountSats: '101692' });
    expect(repo.transition).toHaveBeenNthCalledWith(3, TX_ID, 'failed', { refundedAt: expect.any(Date) });
    expect(events.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'transaction.broadcast_failed', payload: expect.objectContaining({ refunded: true }) }),
    );
  });

  it('records a refund_pending event (and still fails) when the refund call itself errors', async () => {
    const { repo, node, wallet, events, useCase } = setup();
    repo.findById.mockResolvedValue(funded());
    repo.transition
      .mockResolvedValueOnce(funded({ status: 'broadcasting' }))
      .mockResolvedValueOnce(funded({ status: 'failed' }));
    node.broadcast.mockRejectedValue(new BroadcastRejectedError('rejected'));
    wallet.refund.mockRejectedValue(new Error('wallet-service down'));

    await expect(useCase.execute(TX_ID, owner)).rejects.toMatchObject({ code: 'BROADCAST_FAILED' });
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'wallet.refund_pending' }));
  });

  it('does NOT refund when the broadcast outcome is unknown (e.g. timeout); stays broadcasting', async () => {
    const { repo, node, wallet, events, useCase } = setup();
    repo.findById.mockResolvedValue(funded());
    repo.transition.mockResolvedValueOnce(funded({ status: 'broadcasting' }));
    node.broadcast.mockRejectedValue(new Error('socket hang up'));

    await expect(useCase.execute(TX_ID, owner)).rejects.toThrow('socket hang up');
    expect(repo.transition).toHaveBeenCalledTimes(1);
    expect(wallet.refund).not.toHaveBeenCalled();
    expect(events.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'transaction.broadcast_outcome_unknown' }),
    );
  });

  it('fails with 409 and never calls the node when the CAS is lost to a concurrent broadcast', async () => {
    const { repo, node, useCase } = setup();
    repo.findById.mockResolvedValue(funded());
    repo.transition.mockResolvedValueOnce(null);

    await expect(useCase.execute(TX_ID, owner)).rejects.toMatchObject({ code: 'BROADCAST_IN_PROGRESS' });
    expect(node.broadcast).not.toHaveBeenCalled();
  });

  it.each<[string, Partial<TransactionEntity>]>([
    ['unfunded (no debitedAt)', { debitedAt: null }],
    ['already broadcasting', { status: 'broadcasting' }],
    ['failed', { status: 'failed' }],
    ['missing rawTx', { rawTx: null }],
  ])('rejects broadcasting a %s transaction', async (_name, overrides) => {
    const { repo, node, useCase } = setup();
    repo.findById.mockResolvedValue(funded(overrides));
    await expect(useCase.execute(TX_ID, owner)).rejects.toBeInstanceOf(ConflictError);
    expect(repo.transition).not.toHaveBeenCalled();
    expect(node.broadcast).not.toHaveBeenCalled();
  });

  it.each<[string, Actor, new (...args: never[]) => Error]>([
    ['admin non-owner', { sub: 'admin-1', roles: ['admin'] }, ForbiddenError],
    ['auditor non-owner', { sub: 'aud-1', roles: ['auditor'] }, ForbiddenError],
    ['plain non-owner', { sub: 'user-2', roles: [] }, NotFoundError],
  ])('rejects a %s (strict owner)', async (_name, actor, errorType) => {
    const { repo, useCase } = setup();
    repo.findById.mockResolvedValue(funded());
    await expect(useCase.execute(TX_ID, actor)).rejects.toBeInstanceOf(errorType);
    expect(repo.transition).not.toHaveBeenCalled();
  });
});
