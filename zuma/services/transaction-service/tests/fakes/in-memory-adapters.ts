import { toPaginatedResult, type PaginatedResult, type PaginationQuery } from '@zuma/shared-common';
import {
  DuplicateIdempotencyKeyError,
  type TransactionFilter,
  type TransactionRepositoryPort,
  type TransactionUpdate,
} from '../../src/application/ports/transaction-repository.port';
import type { AuditLogRepositoryPort } from '../../src/application/ports/audit-log-repository.port';
import type { SystemEventRepositoryPort } from '../../src/application/ports/system-event-repository.port';
import type {
  WalletMovementRequest,
  WalletMovementResult,
  WalletServicePort,
  WalletSummary,
} from '../../src/application/ports/wallet-service.port';
import type { NewTransactionProps, TransactionEntity } from '../../src/domain/entities/transaction.entity';
import type { AuditLogEntity, NewAuditLogProps } from '../../src/domain/entities/audit-log.entity';
import type { NewSystemEventProps } from '../../src/domain/entities/system-event.entity';
import type { TransactionLifecycleStatus } from '../../src/domain/value-objects/transaction-status';

let idCounter = 0;
// 24-hex ids so they satisfy the routes' ObjectId param pattern.
export const nextObjectId = (): string => {
  idCounter += 1;
  return `6710f1f1c2a1${idCounter.toString(16).padStart(12, '0')}`;
};

// In-memory TransactionRepositoryPort: unique (ownerUserId, idempotencyKey) and CAS transitions.
export class InMemoryTransactionRepository implements TransactionRepositoryPort {
  static last: InMemoryTransactionRepository | undefined;
  readonly records = new Map<string, TransactionEntity>();
  failWith: Error | undefined;

  constructor() {
    InMemoryTransactionRepository.last = this;
  }

  private guard(): void {
    if (this.failWith) throw this.failWith;
  }

  seed(overrides: Partial<TransactionEntity> = {}): TransactionEntity {
    const now = new Date('2024-01-01T00:00:00.000Z');
    const record: TransactionEntity = {
      id: nextObjectId(),
      walletId: '6710f1f1c2a1b2c3d4e5f6a7',
      ownerUserId: 'alice',
      idempotencyKey: `seed-${idCounter}-key`,
      txid: null,
      type: 'send',
      amount: '1000',
      feeRate: '2',
      feeSats: '282',
      destinationAddress: 'tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7',
      status: 'pending',
      failureReason: null,
      confirmations: 0,
      rawTx: 'rawtx:signed',
      debitedAt: now,
      refundedAt: null,
      broadcastAt: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
    this.records.set(record.id, record);
    return { ...record };
  }

  async create(props: NewTransactionProps): Promise<TransactionEntity> {
    this.guard();
    for (const record of this.records.values()) {
      if (record.ownerUserId === props.ownerUserId && record.idempotencyKey === props.idempotencyKey) {
        throw new DuplicateIdempotencyKeyError(props.ownerUserId, props.idempotencyKey);
      }
    }
    return this.seed({ ...props, debitedAt: null, createdAt: new Date(), updatedAt: new Date() });
  }

  async findById(id: string): Promise<TransactionEntity | null> {
    this.guard();
    const record = this.records.get(id);
    return record ? { ...record } : null;
  }

  async findByIdempotencyKey(ownerUserId: string, idempotencyKey: string): Promise<TransactionEntity | null> {
    this.guard();
    for (const record of this.records.values()) {
      if (record.ownerUserId === ownerUserId && record.idempotencyKey === idempotencyKey) return { ...record };
    }
    return null;
  }

  async findMany(filter: TransactionFilter, pagination: PaginationQuery): Promise<PaginatedResult<TransactionEntity>> {
    this.guard();
    const all = [...this.records.values()].filter(
      (r) =>
        (!filter.ownerUserId || r.ownerUserId === filter.ownerUserId) &&
        (!filter.walletId || r.walletId === filter.walletId) &&
        (!filter.status || r.status === filter.status) &&
        (!filter.dateFrom || r.createdAt >= filter.dateFrom) &&
        (!filter.dateTo || r.createdAt <= filter.dateTo),
    );
    const start = (pagination.page - 1) * pagination.limit;
    return toPaginatedResult(all.slice(start, start + pagination.limit), all.length, pagination);
  }

  async transition(
    id: string,
    fromStatus: TransactionLifecycleStatus,
    changes: TransactionUpdate,
  ): Promise<TransactionEntity | null> {
    this.guard();
    const record = this.records.get(id);
    if (!record || record.status !== fromStatus) return null;
    const updated = { ...record, ...changes, updatedAt: new Date() } as TransactionEntity;
    this.records.set(id, updated);
    return { ...updated };
  }
}

export class InMemoryAuditLogRepository implements AuditLogRepositoryPort {
  static last: InMemoryAuditLogRepository | undefined;
  readonly entries: AuditLogEntity[] = [];

  constructor() {
    InMemoryAuditLogRepository.last = this;
  }

  async create(props: NewAuditLogProps): Promise<AuditLogEntity> {
    const entry = { ...props, metadata: props.metadata ?? {}, id: nextObjectId(), createdAt: new Date() };
    this.entries.push(entry);
    return entry;
  }
}

export class InMemorySystemEventRepository implements SystemEventRepositoryPort {
  static last: InMemorySystemEventRepository | undefined;
  readonly events: NewSystemEventProps[] = [];

  constructor() {
    InMemorySystemEventRepository.last = this;
  }

  async record(props: NewSystemEventProps): Promise<void> {
    this.events.push(props);
  }
}

// Stand-in for wallet-service's /internal API with a real (idempotent, guarded) balance model.
export class FakeWalletService implements WalletServicePort {
  static last: FakeWalletService | undefined;
  readonly wallets = new Map<string, WalletSummary & { balanceSats: number }>();
  readonly debits = new Map<string, number>();
  readonly refunds = new Set<string>();
  failWith: Error | undefined;

  constructor(readonly options?: unknown) {
    FakeWalletService.last = this;
  }

  seed(overrides: Partial<WalletSummary & { balanceSats: number }> = {}) {
    const wallet = {
      id: nextObjectId(),
      ownerUserId: 'alice',
      status: 'active' as const,
      network: 'testnet' as const,
      address: 'tb1qsource',
      balanceSats: 1_000_000,
      ...overrides,
    };
    this.wallets.set(wallet.id, wallet);
    return wallet;
  }

  async getWallet(walletId: string): Promise<WalletSummary | null> {
    if (this.failWith) throw this.failWith;
    const wallet = this.wallets.get(walletId);
    if (!wallet) return null;
    const { balanceSats: _balance, ...summary } = wallet;
    return summary;
  }

  async debit(request: WalletMovementRequest): Promise<WalletMovementResult> {
    if (this.failWith) throw this.failWith;
    const wallet = this.wallets.get(request.walletId);
    if (!wallet) return { ok: false, code: 'WALLET_NOT_FOUND', message: 'Wallet was not found' };
    const amount = Number(request.amountSats);
    if (this.debits.has(request.transactionId)) return { ok: true, balanceCache: String(wallet.balanceSats) };
    if (wallet.status !== 'active') return { ok: false, code: 'WALLET_NOT_ACTIVE', message: 'Wallet is not active' };
    if (wallet.balanceSats < amount) {
      return { ok: false, code: 'INSUFFICIENT_FUNDS', message: 'Wallet balance is insufficient for this debit' };
    }
    wallet.balanceSats -= amount;
    this.debits.set(request.transactionId, amount);
    return { ok: true, balanceCache: String(wallet.balanceSats) };
  }

  async refund(request: WalletMovementRequest): Promise<WalletMovementResult> {
    if (this.failWith) throw this.failWith;
    const wallet = this.wallets.get(request.walletId);
    const debited = this.debits.get(request.transactionId);
    if (!wallet || debited !== Number(request.amountSats)) {
      return { ok: false, code: 'REFUND_WITHOUT_DEBIT', message: 'No matching debit' };
    }
    if (!this.refunds.has(request.transactionId)) {
      wallet.balanceSats += debited;
      this.refunds.add(request.transactionId);
    }
    return { ok: true, balanceCache: String(wallet.balanceSats) };
  }
}
