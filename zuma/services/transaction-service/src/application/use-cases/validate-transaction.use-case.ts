import { NotFoundError, ValidationError, isPrivileged, type Actor } from '@zuma/shared-common';
import type { TransactionEntity } from '../../domain/entities/transaction.entity';
import type { TransactionRepositoryPort } from '../ports/transaction-repository.port';

// Validates a pending transaction is well-formed before it is broadcast (e.g. has a signed rawTx).
export class ValidateTransactionUseCase {
  constructor(private readonly transactionRepository: TransactionRepositoryPort) {}

  async execute(id: string, actor: Actor): Promise<TransactionEntity> {
    const transaction = await this.transactionRepository.findById(id);
    if (!transaction || (transaction.ownerUserId !== actor.sub && !isPrivileged(actor))) {
      throw new NotFoundError('Transaction', id);
    }
    if (transaction.status !== 'pending' || !transaction.rawTx) {
      throw new ValidationError('Transaction is not in a valid state to be validated', {
        status: transaction.status,
      });
    }
    return transaction;
  }
}
