import type { TransactionRepositoryPort } from '../src/application/ports/transaction-repository.port';
import type { BitcoinNodeClientPort } from '../src/application/ports/bitcoin-node-client.port';
import type { AuditLogRepositoryPort } from '../src/application/ports/audit-log-repository.port';
import type { SystemEventRepositoryPort } from '../src/application/ports/system-event-repository.port';
import type { WalletServicePort, WalletSummary } from '../src/application/ports/wallet-service.port';
import type { TransactionEntity } from '../src/domain/entities/transaction.entity';
import type { AuditLogEntity } from '../src/domain/entities/audit-log.entity';

export const WALLET_ID = '6710f1f1c2a1b2c3d4e5f6a7';
export const TX_ID = '6710f1f1c2a1b2c3d4e5f6a8';
// BIP-173 / BIP-350 test vectors.
export const TESTNET_P2WSH = 'tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7';
export const MAINNET_P2WPKH = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

export const buildTransaction = (overrides: Partial<TransactionEntity> = {}): TransactionEntity => ({
  id: TX_ID,
  walletId: WALLET_ID,
  ownerUserId: 'user-1',
  idempotencyKey: 'idem-key-0001',
  txid: null,
  type: 'send',
  amount: '100000',
  feeRate: '12',
  feeSats: '1692',
  destinationAddress: TESTNET_P2WSH,
  status: 'pending',
  failureReason: null,
  confirmations: 0,
  rawTx: 'rawtx:signed',
  debitedAt: null,
  refundedAt: null,
  broadcastAt: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  ...overrides,
});

export const buildWalletSummary = (overrides: Partial<WalletSummary> = {}): WalletSummary => ({
  id: WALLET_ID,
  ownerUserId: 'user-1',
  status: 'active',
  network: 'testnet',
  address: 'tb1qsource',
  ...overrides,
});

export const mockTransactionRepository = (): jest.Mocked<TransactionRepositoryPort> => ({
  create: jest.fn(),
  findById: jest.fn(),
  findByIdempotencyKey: jest.fn().mockResolvedValue(null),
  findMany: jest.fn(),
  transition: jest.fn(),
});

export const mockNode = (): jest.Mocked<BitcoinNodeClientPort> => ({
  build: jest.fn().mockResolvedValue({ rawTx: 'rawtx:unsigned', feeSats: 1692 }),
  sign: jest.fn().mockResolvedValue({ rawTx: 'rawtx:signed' }),
  broadcast: jest.fn(),
  getConfirmations: jest.fn(),
});

export const mockAudit = (): jest.Mocked<AuditLogRepositoryPort> => ({
  create: jest.fn().mockResolvedValue({} as AuditLogEntity),
});

export const mockSystemEvents = (): jest.Mocked<SystemEventRepositoryPort> => ({
  record: jest.fn().mockResolvedValue(undefined),
});

export const mockWalletService = (): jest.Mocked<WalletServicePort> => ({
  getWallet: jest.fn().mockResolvedValue(buildWalletSummary()),
  debit: jest.fn().mockResolvedValue({ ok: true, balanceCache: '0' }),
  refund: jest.fn().mockResolvedValue({ ok: true, balanceCache: '101692' }),
});
