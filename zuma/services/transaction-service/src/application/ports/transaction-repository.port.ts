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
  rawTx?: string | null;
  status?: TransactionLifecycleStatus;
  confirmations?: number;
  broadcastAt?: Date | null;
}

// Repository port implemented by the infrastructure layer (Mongoose, in-memory, etc).
export interface TransactionRepositoryPort {
  create(props: NewTransactionProps): Promise<TransactionEntity>;
  findById(id: string): Promise<TransactionEntity | null>;
  findByIdempotencyKey(ownerUserId: string, idempotencyKey: string): Promise<TransactionEntity | null>;
  findMany(
    filter: TransactionFilter,
    pagination: PaginationQuery,
  ): Promise<PaginatedResult<TransactionEntity>>;
  update(id: string, changes: TransactionUpdate): Promise<TransactionEntity | null>;
  transition(
    id: string,
    fromStatus: TransactionLifecycleStatus,
    changes: TransactionUpdate,
  ): Promise<TransactionEntity | null>;
}
