"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FixedAddressGenerator = exports.FakeTransactionHistoryClient = exports.InMemoryLedgerRepository = exports.InMemoryWalletRepository = exports.nextObjectId = void 0;
const shared_common_1 = require("@zinga/shared-common");
let idCounter = 0;
// 24-hex ids so they satisfy the routes' ObjectId param pattern.
const nextObjectId = () => {
    idCounter += 1;
    return `6710f1f1c2a1${idCounter.toString(16).padStart(12, '0')}`;
};
exports.nextObjectId = nextObjectId;
// In-memory WalletRepositoryPort with the same guarded-movement semantics as the Mongo adapter:
// one atomic check of existence, pending-movement marker, status guard and non-negative balance.
class InMemoryWalletRepository {
    constructor() {
        this.wallets = new Map();
        this.pending = new Map();
        InMemoryWalletRepository.last = this;
    }
    guard() {
        if (this.failWith) {
            throw this.failWith;
        }
    }
    seed(overrides = {}) {
        const now = new Date('2024-01-01T00:00:00.000Z');
        const wallet = {
            id: (0, exports.nextObjectId)(),
            label: 'Seeded',
            address: 'tb1qseeded',
            network: 'testnet',
            type: 'hot',
            balanceSats: 0,
            metadata: {},
            ownerUserId: 'user-1',
            status: 'active',
            createdAt: now,
            updatedAt: now,
            ...overrides,
        };
        this.wallets.set(wallet.id, wallet);
        return { ...wallet };
    }
    async create(props) {
        this.guard();
        return this.seed({ ...props, metadata: props.metadata ?? {}, createdAt: new Date(), updatedAt: new Date() });
    }
    async findById(id) {
        this.guard();
        const wallet = this.wallets.get(id);
        return wallet ? { ...wallet } : null;
    }
    async findMany(filter, pagination) {
        this.guard();
        const all = [...this.wallets.values()].filter((w) => !filter.ownerUserId || w.ownerUserId === filter.ownerUserId);
        const start = (pagination.page - 1) * pagination.limit;
        return (0, shared_common_1.toPaginatedResult)(all.slice(start, start + pagination.limit), all.length, pagination);
    }
    async updateMetadata(id, changes) {
        this.guard();
        const wallet = this.wallets.get(id);
        if (!wallet) {
            return null;
        }
        const updated = { ...wallet, ...changes, updatedAt: new Date() };
        this.wallets.set(id, updated);
        return { ...updated };
    }
    async applyBalanceMovement(movement) {
        this.guard();
        const wallet = this.wallets.get(movement.walletId);
        if (!wallet) {
            return { outcome: 'not-found' };
        }
        const pending = this.pending.get(wallet.id) ?? new Set();
        if (pending.has(movement.movementId)) {
            return { outcome: 'already-applied', wallet: { ...wallet } };
        }
        if (movement.requireActive && wallet.status !== 'active') {
            return { outcome: 'not-active', wallet: { ...wallet } };
        }
        if (wallet.balanceSats + movement.deltaSats < 0) {
            return { outcome: 'insufficient-funds', wallet: { ...wallet } };
        }
        const updated = { ...wallet, balanceSats: wallet.balanceSats + movement.deltaSats };
        this.wallets.set(wallet.id, updated);
        pending.add(movement.movementId);
        this.pending.set(wallet.id, pending);
        return { outcome: 'applied', wallet: { ...updated } };
    }
    async clearPendingMovement(walletId, movementId) {
        this.guard();
        this.pending.get(walletId)?.delete(movementId);
    }
}
exports.InMemoryWalletRepository = InMemoryWalletRepository;
const ledgerKey = (transactionId, kind, reason) => `${transactionId}|${kind}|${reason}`;
// In-memory append-only ledger; the (transactionId, kind, reason) map key plays the unique index.
class InMemoryLedgerRepository {
    constructor() {
        this.entries = new Map();
        InMemoryLedgerRepository.last = this;
    }
    async insertPending(props) {
        const key = ledgerKey(props.transactionId, props.kind, props.reason);
        const existing = this.entries.get(key);
        if (existing) {
            return { entry: { ...existing }, inserted: false };
        }
        const entry = {
            ...props,
            id: (0, exports.nextObjectId)(),
            state: 'pending',
            balanceAfterSats: null,
            createdAt: new Date(),
        };
        this.entries.set(key, entry);
        return { entry: { ...entry }, inserted: true };
    }
    async markApplied(entry, balanceAfterSats) {
        const key = ledgerKey(entry.transactionId, entry.kind, entry.reason);
        this.entries.set(key, { ...entry, state: 'applied', balanceAfterSats });
    }
    async deletePending(id) {
        for (const [key, entry] of this.entries) {
            if (entry.id === id && entry.state === 'pending') {
                this.entries.delete(key);
            }
        }
    }
    async findByKey(transactionId, kind, reason) {
        const entry = this.entries.get(ledgerKey(transactionId, kind, reason));
        return entry ? { ...entry } : null;
    }
}
exports.InMemoryLedgerRepository = InMemoryLedgerRepository;
// Records calls instead of hitting transaction-service over HTTP.
class FakeTransactionHistoryClient {
    constructor(options) {
        this.options = options;
        this.calls = [];
        this.history = [];
        FakeTransactionHistoryClient.last = this;
    }
    async getHistoryForWallet(walletId, authorization) {
        this.calls.push({ walletId, authorization });
        return this.history;
    }
}
exports.FakeTransactionHistoryClient = FakeTransactionHistoryClient;
class FixedAddressGenerator {
    async generate(network) {
        return network === 'mainnet' ? 'bc1qfixedaddress' : 'tb1qfixedaddress';
    }
}
exports.FixedAddressGenerator = FixedAddressGenerator;
