import { NotFoundError, isPrivileged, type Actor } from '@zuma/shared-common';
import type { TransactionLifecycleStatus } from '../../domain/value-objects/transaction-status';
import type { TransactionRepositoryPort } from '../ports/transaction-repository.port';
import type { BitcoinNodeClientPort } from '../ports/bitcoin-node-client.port';

export interface TransactionStatus {
  transactionId: string;
  status: TransactionLifecycleStatus;
  confirmations: number;
}

// Read endpoint: the only write it may perform is the guarded CAS broadcast -> confirmed. Live
// confirmation counts are reported from the node but not persisted on every GET (no unguarded writes).
export class GetTransactionStatusUseCase {
  constructor(
    private readonly transactionRepository: TransactionRepositoryPort,
    private readonly bitcoinNodeClient: BitcoinNodeClientPort,
  ) {}

  async execute(id: string, actor: Actor): Promise<TransactionStatus> {
    const transaction = await this.transactionRepository.findById(id);
    if (!transaction || (transaction.ownerUserId !== actor.sub && !isPrivileged(actor))) {
      throw new NotFoundError('Transaction', id);
    }
    const tracked = transaction.status === 'broadcast' || transaction.status === 'confirmed';
    if (!transaction.txid || !tracked) {
      return { transactionId: transaction.id, status: transaction.status, confirmations: transaction.confirmations };
    }

    const confirmations = await this.bitcoinNodeClient.getConfirmations(transaction.txid, transaction.broadcastAt);
    if (transaction.status === 'broadcast' && confirmations > 0) {
      const confirmed = await this.transactionRepository.transition(id, 'broadcast', {
        status: 'confirmed',
        confirmations,
      });
      if (!confirmed) {
        // Lost the CAS (another reader confirmed it, or it moved on) — report what is stored now.
        const latest = await this.transactionRepository.findById(id);
        return {
          transactionId: transaction.id,
          status: latest?.status ?? transaction.status,
          confirmations: Math.max(confirmations, latest?.confirmations ?? 0),
        };
      }
      return { transactionId: transaction.id, status: confirmed.status, confirmations };
    }
    return { transactionId: transaction.id, status: transaction.status, confirmations };
  }
}
