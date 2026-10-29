import { CreateTransactionUseCase } from '../src/application/use-cases/create-transaction.use-case';
import type { TransactionRepositoryPort } from '../src/application/ports/transaction-repository.port';
import type { BitcoinNodeClientPort } from '../src/application/ports/bitcoin-node-client.port';
import type { AuditLogRepositoryPort } from '../src/application/ports/audit-log-repository.port';
import type { WalletOwnershipPort } from '../src/application/ports/wallet-ownership.port';
import type { TransactionEntity } from '../src/domain/entities/transaction.entity';
import type { AuditLogEntity } from '../src/domain/entities/audit-log.entity';

describe('CreateTransactionUseCase', () => {
  const buildTransaction = (overrides: Partial<TransactionEntity> = {}): TransactionEntity => ({
    id: 'tx-1',
    walletId: 'wallet-1',
    ownerUserId: 'user-1',
    idempotencyKey: null,
    txid: null,
    type: 'send',
    amount: '0.001',
    feeRate: '12',
    status: 'pending',
    confirmations: 0,
    rawTx: null,
    broadcastAt: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  });

  it('builds, signs and persists a new transaction, then writes an audit log', async () => {
    const created = buildTransaction();
    const updated = buildTransaction({ rawTx: 'rawtx:wallet-1:0.001:deadbeef:signed' });

    const transactionRepository: jest.Mocked<TransactionRepositoryPort> = {
      create: jest.fn().mockResolvedValue(created),
      findById: jest.fn(),
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue(updated),
      transition: jest.fn(),
    };
    const bitcoinNodeClient: jest.Mocked<BitcoinNodeClientPort> = {
      build: jest.fn().mockResolvedValue({ rawTx: 'rawtx:wallet-1:0.001:deadbeef' }),
      sign: jest.fn().mockResolvedValue({ rawTx: 'rawtx:wallet-1:0.001:deadbeef:signed' }),
      broadcast: jest.fn(),
      getConfirmations: jest.fn(),
    };
    const auditLogRepository: jest.Mocked<AuditLogRepositoryPort> = {
      create: jest.fn().mockResolvedValue({} as AuditLogEntity),
    };
    const walletOwnershipPort: jest.Mocked<WalletOwnershipPort> = {
      isOwner: jest.fn().mockResolvedValue(true),
    };

    const useCase = new CreateTransactionUseCase(
      transactionRepository,
      bitcoinNodeClient,
      auditLogRepository,
      walletOwnershipPort,
    );
    const result = await useCase.execute(
      {
        walletId: 'wallet-1',
        type: 'send',
        amount: '0.001',
        feeRate: '12',
        destinationAddress: 'tb1qdest',
      },
      { sub: 'user-1', roles: [] },
      'Bearer test-token',
    );

    expect(walletOwnershipPort.isOwner).toHaveBeenCalledWith('wallet-1', 'user-1', 'Bearer test-token');
    expect(bitcoinNodeClient.build).toHaveBeenCalledWith({
      walletId: 'wallet-1',
      amount: '0.001',
      feeRate: '12',
      destinationAddress: 'tb1qdest',
    });
    expect(bitcoinNodeClient.sign).toHaveBeenCalledWith('rawtx:wallet-1:0.001:deadbeef');
    expect(transactionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ walletId: 'wallet-1', type: 'send', ownerUserId: 'user-1' }),
    );
    expect(transactionRepository.update).toHaveBeenCalledWith(created.id, {
      rawTx: 'rawtx:wallet-1:0.001:deadbeef:signed',
    });
    expect(auditLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'user-1', action: 'transaction.created' }),
    );
    expect(result).toEqual(updated);
  });

  it('rejects when the caller does not own the wallet', async () => {
    const transactionRepository: jest.Mocked<TransactionRepositoryPort> = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      findMany: jest.fn(),
      update: jest.fn(),
      transition: jest.fn(),
    };
    const bitcoinNodeClient: jest.Mocked<BitcoinNodeClientPort> = {
      build: jest.fn(),
      sign: jest.fn(),
      broadcast: jest.fn(),
      getConfirmations: jest.fn(),
    };
    const auditLogRepository: jest.Mocked<AuditLogRepositoryPort> = {
      create: jest.fn(),
    };
    const walletOwnershipPort: jest.Mocked<WalletOwnershipPort> = {
      isOwner: jest.fn().mockResolvedValue(false),
    };

    const useCase = new CreateTransactionUseCase(
      transactionRepository,
      bitcoinNodeClient,
      auditLogRepository,
      walletOwnershipPort,
    );

    await expect(
      useCase.execute(
        {
          walletId: 'wallet-1',
          type: 'send',
          amount: '0.001',
          feeRate: '12',
          destinationAddress: 'tb1qdest',
        },
        { sub: 'user-2', roles: [] },
      ),
    ).rejects.toThrow('Wallet does not belong to the caller');
    expect(transactionRepository.create).not.toHaveBeenCalled();
  });
});
