import { transactionResolvers } from '../src/resolvers/transaction.resolvers';
import type { TransactionServiceClient } from '../src/clients/transaction-service.client';
import type { GatewayContext } from '../src/context';
import type { TransactionDto } from '@zuma/shared-common';

const buildTx = (overrides: Partial<TransactionDto> = {}): TransactionDto => ({
  id: 'b'.repeat(24),
  walletId: 'a'.repeat(24),
  txid: null,
  type: 'internal-transfer',
  amount: '100000',
  feeRate: '5',
  status: 'broadcasting',
  confirmations: 0,
  rawTx: 'deadbeef',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

const buildCtx = (client: Partial<jest.Mocked<TransactionServiceClient>>): GatewayContext => ({
  walletServiceClient: {} as GatewayContext['walletServiceClient'],
  transactionServiceClient: client as unknown as TransactionServiceClient,
  authorization: 'Bearer t',
});

const input = {
  walletId: 'a'.repeat(24),
  amount: '100000',
  feeRate: '5',
  destinationAddress: 'tb1qdest',
  idempotencyKey: '3f1c2a7e-8b8a-4b55-9d0e-0f3c1c2a7e8b',
};

describe('transactionResolvers', () => {
  it('transaction: maps enums and strips rawTx', async () => {
    const getTransaction = jest.fn().mockResolvedValue(buildTx());
    const result = await transactionResolvers.Query.transaction(undefined, { id: 'x' }, buildCtx({ getTransaction }));
    expect(result).toMatchObject({ type: 'INTERNAL_TRANSFER', status: 'BROADCASTING' });
    expect(result).not.toHaveProperty('rawTx');
  });

  it('transactions: maps the status filter to the REST value', async () => {
    const listTransactions = jest
      .fn()
      .mockResolvedValue({ items: [buildTx()], total: 1, page: 1, limit: 20, totalPages: 1 });
    const result = await transactionResolvers.Query.transactions(
      undefined,
      { status: 'PENDING' },
      buildCtx({ listTransactions }),
    );
    expect(listTransactions).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }), 'Bearer t');
    expect(result.pageInfo.total).toBe(1);
  });

  it('createTransaction: forces type send and forwards the idempotency key', async () => {
    const createTransaction = jest.fn().mockResolvedValue(buildTx({ type: 'send', status: 'pending' }));
    const result = await transactionResolvers.Mutation.createTransaction(
      undefined,
      { input },
      buildCtx({ createTransaction }),
    );
    const { idempotencyKey, ...dto } = input;
    expect(createTransaction).toHaveBeenCalledWith({ ...dto, type: 'send' }, idempotencyKey, 'Bearer t');
    expect(result.type).toBe('SEND');
  });

  it.each([
    ['decimal amount', { amount: '0.001' }],
    ['zero amount', { amount: '0' }],
    ['short idempotency key', { idempotencyKey: 'abc' }],
  ])('createTransaction rejects %s with BAD_USER_INPUT', async (_name, override) => {
    const createTransaction = jest.fn();
    await expect(
      transactionResolvers.Mutation.createTransaction(
        undefined,
        { input: { ...input, ...override } },
        buildCtx({ createTransaction }),
      ),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    expect(createTransaction).not.toHaveBeenCalled();
  });
});
