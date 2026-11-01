import { toPaginatedResult, type PaginatedResult, type PaginationQuery } from '@zuma/shared-common';
import type {
  BalanceMovement,
  BalanceMovementResult,
  WalletFilter,
  WalletRepositoryPort,
} from '../../src/application/ports/wallet-repository.port';
import type { LedgerInsertResult, LedgerRepositoryPort } from '../../src/application/ports/ledger-repository.port';
import type { TransactionHistoryClientPort } from '../../src/application/ports/transaction-history-client.port';
import type { AddressGeneratorPort } from '../../src/application/ports/address-generator.port';
import type { NewWalletProps, WalletEntity } from '../../src/domain/entities/wallet.entity';
import type {
  LedgerEntryEntity,
  LedgerEntryKind,
  LedgerEntryReason,
  NewLedgerEntryProps,
} from '../../src/domain/entities/ledger-entry.entity';
import type { WalletNetwork } from '../../src/domain/value-objects/network';
import type { TransactionDto } from '@zuma/shared-common';

let idCounter = 0;
// 24-hex ids so they satisfy the routes' ObjectId param pattern.
export const nextObjectId = (): string => {
  idCounter += 1;
  return `6710f1f1c2a1${idCounter.toString(16).padStart(12, '0')}`;
};

// In-memory WalletRepositoryPort with the same guarded-movement semantics as the Mongo adapter:
// one atomic check of existence, pending-movement marker, status guard and non-negative balance.
export class InMemoryWalletRepository implements WalletRepositoryPort {
  static last: InMemoryWalletRepository | undefined;
  readonly wallets = new Map<string, WalletEntity>();
  readonly pending = new Map<string, Set<string>>();
  /** When set, every method rejects with this error (simulates an infrastructure failure). */
  failWith: Error | undefined;

  constructor() {
    InMemoryWalletRepository.last = this;
  }

  private guard(): void {
    if (this.failWith) throw this.failWith;
  }

  seed(overrides: Partial<WalletEntity> = {}): WalletEntity {
    const now = new Date('2024-01-01T00:00:00.000Z');
    const wallet: WalletEntity = {
      id: nextObjectId(),
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

  async create(props: NewWalletProps): Promise<WalletEntity> {
    this.guard();
    return this.seed({ ...props, metadata: props.metadata ?? {}, createdAt: new Date(), updatedAt: new Date() });
  }

  async findById(id: string): Promise<WalletEntity | null> {
    this.guard();
    const wallet = this.wallets.get(id);
    return wallet ? { ...wallet } : null;
  }

  async findMany(filter: WalletFilter, pagination: PaginationQuery): Promise<PaginatedResult<WalletEntity>> {
    this.guard();
    const all = [...this.wallets.values()].filter((w) => !filter.ownerUserId || w.ownerUserId === filter.ownerUserId);
    const start = (pagination.page - 1) * pagination.limit;
    return toPaginatedResult(all.slice(start, start + pagination.limit), all.length, pagination);
  }

  async updateMetadata(
    id: string,
    changes: { label?: string; metadata?: Record<string, unknown> },
  ): Promise<WalletEntity | null> {
    this.guard();
    const wallet = this.wallets.get(id);
    if (!wallet) return null;
    const updated = { ...wallet, ...changes, updatedAt: new Date() };
    this.wallets.set(id, updated);
    return { ...updated };
  }

  async applyBalanceMovement(movement: BalanceMovement): Promise<BalanceMovementResult> {
    this.guard();
    const wallet = this.wallets.get(movement.walletId);
    if (!wallet) return { outcome: 'not-found' };
    const pending = this.pending.get(wallet.id) ?? new Set<string>();
    if (pending.has(movement.movementId)) return { outcome: 'already-applied', wallet: { ...wallet } };
    if (movement.requireActive && wallet.status !== 'active') return { outcome: 'not-active', wallet: { ...wallet } };
    if (wallet.balanceSats + movement.deltaSats < 0) return { outcome: 'insufficient-funds', wallet: { ...wallet } };
    const updated = { ...wallet, balanceSats: wallet.balanceSats + movement.deltaSats };
    this.wallets.set(wallet.id, updated);
    pending.add(movement.movementId);
    this.pending.set(wallet.id, pending);
    return { outcome: 'applied', wallet: { ...updated } };
  }

  async clearPendingMovement(walletId: string, movementId: string): Promise<void> {
    this.guard();
    this.pending.get(walletId)?.delete(movementId);
  }
}

const ledgerKey = (transactionId: string, kind: LedgerEntryKind, reason: LedgerEntryReason) =>
  `${transactionId}|${kind}|${reason}`;

// In-memory append-only ledger; the (transactionId, kind, reason) map key plays the unique index.
export class InMemoryLedgerRepository implements LedgerRepositoryPort {
  static last: InMemoryLedgerRepository | undefined;
  readonly entries = new Map<string, LedgerEntryEntity>();

  constructor() {
    InMemoryLedgerRepository.last = this;
  }

  async insertPending(props: NewLedgerEntryProps): Promise<LedgerInsertResult> {
    const key = ledgerKey(props.transactionId, props.kind, props.reason);
    const existing = this.entries.get(key);
    if (existing) return { entry: { ...existing }, inserted: false };
    const entry: LedgerEntryEntity = {
      ...props,
      id: nextObjectId(),
      state: 'pending',
      balanceAfterSats: null,
      createdAt: new Date(),
    };
    this.entries.set(key, entry);
    return { entry: { ...entry }, inserted: true };
  }

  async markApplied(entry: LedgerEntryEntity, balanceAfterSats: number): Promise<void> {
    const key = ledgerKey(entry.transactionId, entry.kind, entry.reason);
    this.entries.set(key, { ...entry, state: 'applied', balanceAfterSats });
  }

  async deletePending(id: string): Promise<void> {
    for (const [key, entry] of this.entries) {
      if (entry.id === id && entry.state === 'pending') this.entries.delete(key);
    }
  }

  async findByKey(
    transactionId: string,
    kind: LedgerEntryKind,
    reason: LedgerEntryReason,
  ): Promise<LedgerEntryEntity | null> {
    const entry = this.entries.get(ledgerKey(transactionId, kind, reason));
    return entry ? { ...entry } : null;
  }
}

// Records calls instead of hitting transaction-service over HTTP.
export class FakeTransactionHistoryClient implements TransactionHistoryClientPort {
  static last: FakeTransactionHistoryClient | undefined;
  readonly calls: Array<{ walletId: string; authorization?: string }> = [];
  history: TransactionDto[] = [];

  constructor(readonly options?: unknown) {
    FakeTransactionHistoryClient.last = this;
  }

  async getHistoryForWallet(walletId: string, authorization?: string): Promise<TransactionDto[]> {
    this.calls.push({ walletId, authorization });
    return this.history;
  }
}

export class FixedAddressGenerator implements AddressGeneratorPort {
  async generate(network: WalletNetwork): Promise<string> {
    return network === 'mainnet' ? 'bc1qfixedaddress' : 'tb1qfixedaddress';
  }
}
