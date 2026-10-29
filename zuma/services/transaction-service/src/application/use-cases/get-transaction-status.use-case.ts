import { NotFoundError, isPrivileged, type Actor } from '@zuma/shared-common';
import type { TransactionRepositoryPort } from '../ports/transaction-repository.port';
import type { BitcoinNodeClientPort } from '../ports/bitcoin-node-client.port';

export interface TransactionStatus {
  transactionId: string;
  status: string;
  confirmations: number;
}

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
    if (!transaction.txid) {
      return { transactionId: transaction.id, status: transaction.status, confirmations: 0 };
    }

    const confirmations = await this.bitcoinNodeClient.getConfirmations(transaction.txid, transaction.broadcastAt);
    const status = confirmations > 0 ? 'confirmed' : transaction.status;
    await this.transactionRepository.update(id, { confirmations, status });

    return { transactionId: transaction.id, status, confirmations };
  }
}
