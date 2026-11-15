import type { WalletRepositoryPort } from '../src/application/ports/wallet-repository.port';
import type { LedgerRepositoryPort } from '../src/application/ports/ledger-repository.port';
import type { WalletEntity } from '../src/domain/entities/wallet.entity';
import type { LedgerEntryEntity } from '../src/domain/entities/ledger-entry.entity';

export const WALLET_ID = '6710f1f1c2a1b2c3d4e5f6a7';
export const TX_ID = '6710f1f1c2a1b2c3d4e5f6a8';

export const buildWallet = (overrides: Partial<WalletEntity> = {}): WalletEntity => ({
  id: WALLET_ID,
  label: 'My Wallet',
  address: 'tb1qmockaddress',
  network: 'testnet',
  type: 'hot',
  balanceSats: 0,
  metadata: {},
  ownerUserId: 'user-1',
  status: 'active',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  ...overrides,
});

export const buildEntry = (overrides: Partial<LedgerEntryEntity> = {}): LedgerEntryEntity => ({
  id: 'ledger-1',
  walletId: WALLET_ID,
  transactionId: TX_ID,
  kind: 'debit',
  reason: 'send',
  amountSats: 1000,
  state: 'pending',
  balanceAfterSats: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  ...overrides,
});

export const mockWalletRepository = (): jest.Mocked<WalletRepositoryPort> => ({
  create: jest.fn(),
  findById: jest.fn(),
  findMany: jest.fn(),
  updateMetadata: jest.fn(),
  applyBalanceMovement: jest.fn(),
  clearPendingMovement: jest.fn().mockResolvedValue(undefined),
});

export const mockLedgerRepository = (): jest.Mocked<LedgerRepositoryPort> => ({
  insertPending: jest.fn(),
  markApplied: jest.fn().mockResolvedValue(undefined),
  deletePending: jest.fn().mockResolvedValue(undefined),
  findByKey: jest.fn().mockResolvedValue(null),
});
