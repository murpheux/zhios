import { GetTransactionStatusUseCase } from '../src/application/use-cases/get-transaction-status.use-case';
import { TX_ID, buildTransaction, mockNode, mockTransactionRepository } from './helpers';

const owner = { sub: 'user-1', roles: [] };

describe('GetTransactionStatusUseCase', () => {
  it('performs no write for pending/broadcasting/failed transactions', async () => {
    for (const status of ['pending', 'broadcasting', 'failed'] as const) {
      const repo = mockTransactionRepository();
      const node = mockNode();
      repo.findById.mockResolvedValue(buildTransaction({ status }));
      const result = await new GetTransactionStatusUseCase(repo, node).execute(TX_ID, owner);
      expect(result.status).toBe(status);
      expect(repo.transition).not.toHaveBeenCalled();
      expect(node.getConfirmations).not.toHaveBeenCalled();
    }
  });

  it('confirms via CAS broadcast->confirmed once the node reports confirmations', async () => {
    const repo = mockTransactionRepository();
    const node = mockNode();
    repo.findById.mockResolvedValue(buildTransaction({ status: 'broadcast', txid: 'abc' }));
    repo.transition.mockResolvedValue(buildTransaction({ status: 'confirmed', confirmations: 2 }));
    node.getConfirmations.mockResolvedValue(2);

    const result = await new GetTransactionStatusUseCase(repo, node).execute(TX_ID, owner);
    expect(repo.transition).toHaveBeenCalledWith(TX_ID, 'broadcast', { status: 'confirmed', confirmations: 2 });
    expect(result).toEqual({ transactionId: TX_ID, status: 'confirmed', confirmations: 2 });
  });

  it('reports live confirmations for confirmed transactions without writing', async () => {
    const repo = mockTransactionRepository();
    const node = mockNode();
    repo.findById.mockResolvedValue(buildTransaction({ status: 'confirmed', txid: 'abc', confirmations: 1 }));
    node.getConfirmations.mockResolvedValue(5);

    const result = await new GetTransactionStatusUseCase(repo, node).execute(TX_ID, owner);
    expect(result.confirmations).toBe(5);
    expect(repo.transition).not.toHaveBeenCalled();
  });

  it('re-reads the stored state when the confirm CAS is lost', async () => {
    const repo = mockTransactionRepository();
    const node = mockNode();
    repo.findById
      .mockResolvedValueOnce(buildTransaction({ status: 'broadcast', txid: 'abc' }))
      .mockResolvedValueOnce(buildTransaction({ status: 'confirmed', txid: 'abc', confirmations: 1 }));
    repo.transition.mockResolvedValue(null);
    node.getConfirmations.mockResolvedValue(1);

    const result = await new GetTransactionStatusUseCase(repo, node).execute(TX_ID, owner);
    expect(result.status).toBe('confirmed');
  });
});
