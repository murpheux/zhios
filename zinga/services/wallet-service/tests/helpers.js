"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockLedgerRepository = exports.mockWalletRepository = exports.buildEntry = exports.buildWallet = exports.TX_ID = exports.WALLET_ID = void 0;
exports.WALLET_ID = '6710f1f1c2a1b2c3d4e5f6a7';
exports.TX_ID = '6710f1f1c2a1b2c3d4e5f6a8';
const buildWallet = (overrides = {}) => ({
    id: exports.WALLET_ID,
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
exports.buildWallet = buildWallet;
const buildEntry = (overrides = {}) => ({
    id: 'ledger-1',
    walletId: exports.WALLET_ID,
    transactionId: exports.TX_ID,
    kind: 'debit',
    reason: 'send',
    amountSats: 1000,
    state: 'pending',
    balanceAfterSats: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
});
exports.buildEntry = buildEntry;
const mockWalletRepository = () => ({
    create: jest.fn(),
    findById: jest.fn(),
    findMany: jest.fn(),
    updateMetadata: jest.fn(),
    applyBalanceMovement: jest.fn(),
    clearPendingMovement: jest.fn().mockResolvedValue(undefined),
});
exports.mockWalletRepository = mockWalletRepository;
const mockLedgerRepository = () => ({
    insertPending: jest.fn(),
    markApplied: jest.fn().mockResolvedValue(undefined),
    deletePending: jest.fn().mockResolvedValue(undefined),
    findByKey: jest.fn().mockResolvedValue(null),
});
exports.mockLedgerRepository = mockLedgerRepository;
