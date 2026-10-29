import { NotFoundError, ValidationError, isPrivileged, type Actor } from '@zuma/shared-common';
import type { TransactionEntity } from '../../domain/entities/transaction.entity';
import type { TransactionRepositoryPort } from '../ports/transaction-repository.port';
import type { BitcoinNodeClientPort } from '../ports/bitcoin-node-client.port';
import type { AuditLogRepositoryPort } from '../ports/audit-log-repository.port';

export class BroadcastTransactionUseCase {
  constructor(
    private readonly transactionRepository: TransactionRepositoryPort,
    private readonly bitcoinNodeClient: BitcoinNodeClientPort,
    private readonly auditLogRepository: AuditLogRepositoryPort,
  ) {}

  async execute(id: string, actor: Actor): Promise<TransactionEntity> {
    const transaction = await this.transactionRepository.findById(id);
    if (!transaction || (transaction.ownerUserId !== actor.sub && !isPrivileged(actor))) {
      throw new NotFoundError('Transaction', id);
    }
    if (transaction.status !== 'pending' || !transaction.rawTx) {
      throw new ValidationError('Transaction is not in a valid state to be broadcast', {
        status: transaction.status,
      });
    }

    // Atomic CAS: claims the 'pending' -> 'broadcast' transition so two concurrent calls can't both win.
    const claimed = await this.transactionRepository.transition(id, 'pending', {
      status: 'broadcast',
      broadcastAt: new Date(),
    });
    if (!claimed) {
      throw new ValidationError('Transaction is already being broadcast or was already broadcast', {
        status: transaction.status,
      });
    }

    const { txid } = await this.bitcoinNodeClient.broadcast(transaction.rawTx);
    const updated = await this.transactionRepository.update(id, { txid });
    if (!updated) {
      throw new NotFoundError('Transaction', id);
    }

    await this.auditLogRepository.create({
      actorUserId: actor.sub,
      action: 'transaction.broadcast',
      entityType: 'Transaction',
      entityId: id,
      metadata: { txid },
    });

    return updated;
  }
}
