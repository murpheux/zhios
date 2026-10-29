import { NotFoundError, isPrivileged, type Actor, type TransactionDto } from '@zuma/shared-common';
import type { WalletRepositoryPort } from '../ports/wallet-repository.port';
import type { TransactionHistoryClientPort } from '../ports/transaction-history-client.port';

export class GetWalletTransactionHistoryUseCase {
  constructor(
    private readonly walletRepository: WalletRepositoryPort,
    private readonly transactionHistoryClient: TransactionHistoryClientPort,
  ) {}

  async execute(walletId: string, actor: Actor, authorization?: string): Promise<TransactionDto[]> {
    const wallet = await this.walletRepository.findById(walletId);
    if (!wallet || (wallet.ownerUserId !== actor.sub && !isPrivileged(actor))) {
      throw new NotFoundError('Wallet', walletId);
    }
    return this.transactionHistoryClient.getHistoryForWallet(walletId, authorization);
  }
}
