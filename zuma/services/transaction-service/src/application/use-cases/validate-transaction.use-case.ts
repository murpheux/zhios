import { NotFoundError, ValidationError, isPrivileged, type Actor } from '@zuma/shared-common';
import type { TransactionEntity } from '../../domain/entities/transaction.entity';
import type { TransactionRepositoryPort } from '../ports/transaction-repository.port';

// Read-only check that a pending transaction is ready to broadcast (signed rawTx + funds debited).
export class ValidateTransactionUseCase {
  constructor(private readonly transactionRepository: TransactionRepositoryPort) {}

  async execute(id: string, actor: Actor): Promise<TransactionEntity> {
    const transaction = await this.transactionRepository.findById(id);
    if (!transaction || (transaction.ownerUserId !== actor.sub && !isPrivileged(actor))) {
      throw new NotFoundError('Transaction', id);
    }
    if (transaction.status !== 'pending' || !transaction.rawTx || !transaction.debitedAt) {
      throw new ValidationError('Transaction is not in a valid state to be validated', {
        status: transaction.status,
        fundsReserved: transaction.debitedAt !== null,
      });
    }
    return transaction;
  }
}
