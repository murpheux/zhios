import type { PaginatedResult, PaginationQuery } from '@zuma/shared-common';
import type { NewTransactionProps, TransactionEntity } from '../../domain/entities/transaction.entity';
import type { TransactionLifecycleStatus } from '../../domain/value-objects/transaction-status';

export interface TransactionFilter {
  ownerUserId?: string;
  walletId?: string;
  status?: TransactionLifecycleStatus;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface TransactionUpdate {
  txid?: string | null;
  status?: TransactionLifecycleStatus;
  failureReason?: string | null;
  confirmations?: number;
  debitedAt?: Date | null;
  refundedAt?: Date | null;
  broadcastAt?: Date | null;
}

// Raised by create() when the (ownerUserId, idempotencyKey) unique index rejects a concurrent duplicate.
export class DuplicateIdempotencyKeyError extends Error {
  constructor(
    readonly ownerUserId: string,
    readonly idempotencyKey: string,
  ) {
    super('A transaction with this idempotency key already exists');
    this.name = 'DuplicateIdempotencyKeyError';
  }
}

// Repository port implemented by the infrastructure layer (Mongoose, in-memory, etc).
// There is deliberately no unguarded update(): every state change is a compare-and-swap on status.
export interface TransactionRepositoryPort {
  /** Single insert of the full record (status 'pending', rawTx included). Throws DuplicateIdempotencyKeyError. */
  create(props: NewTransactionProps): Promise<TransactionEntity>;
  findById(id: string): Promise<TransactionEntity | null>;
  findByIdempotencyKey(ownerUserId: string, idempotencyKey: string): Promise<TransactionEntity | null>;
  findMany(
    filter: TransactionFilter,
    pagination: PaginationQuery,
  ): Promise<PaginatedResult<TransactionEntity>>;
  /** Atomic CAS: applies `changes` only if the record is still in `fromStatus`; null if it lost the race. */
  transition(
    id: string,
    fromStatus: TransactionLifecycleStatus,
    changes: TransactionUpdate,
  ): Promise<TransactionEntity | null>;
}
