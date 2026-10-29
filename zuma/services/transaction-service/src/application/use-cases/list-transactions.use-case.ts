import { isPrivileged, type Actor, type PaginatedResult, type PaginationQuery } from '@zuma/shared-common';
import type { TransactionEntity } from '../../domain/entities/transaction.entity';
import type { TransactionFilter, TransactionRepositoryPort } from '../ports/transaction-repository.port';

export class ListTransactionsUseCase {
  constructor(private readonly transactionRepository: TransactionRepositoryPort) {}

  async execute(
    filter: TransactionFilter,
    pagination: PaginationQuery,
    actor: Actor,
  ): Promise<PaginatedResult<TransactionEntity>> {
    const scopedFilter: TransactionFilter = isPrivileged(actor)
      ? filter
      : { ...filter, ownerUserId: actor.sub };
    return this.transactionRepository.findMany(scopedFilter, pagination);
  }
}
