import { NotFoundError, isPrivileged, type Actor } from '@zuma/shared-common';
import type { TransactionEntity } from '../../domain/entities/transaction.entity';
import type { TransactionRepositoryPort } from '../ports/transaction-repository.port';

export class GetTransactionUseCase {
  constructor(private readonly transactionRepository: TransactionRepositoryPort) {}

  async execute(id: string, actor: Actor): Promise<TransactionEntity> {
    const transaction = await this.transactionRepository.findById(id);
    if (!transaction || (transaction.ownerUserId !== actor.sub && !isPrivileged(actor))) {
      throw new NotFoundError('Transaction', id);
    }
    return transaction;
  }
}
