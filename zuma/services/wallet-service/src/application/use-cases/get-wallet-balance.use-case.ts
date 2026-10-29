import { NotFoundError, isPrivileged, type Actor } from '@zuma/shared-common';
import type { WalletRepositoryPort } from '../ports/wallet-repository.port';

export interface WalletBalance {
  walletId: string;
  balanceCache: string;
}

export class GetWalletBalanceUseCase {
  constructor(private readonly walletRepository: WalletRepositoryPort) {}

  async execute(id: string, actor: Actor): Promise<WalletBalance> {
    const wallet = await this.walletRepository.findById(id);
    if (!wallet || (wallet.ownerUserId !== actor.sub && !isPrivileged(actor))) {
      throw new NotFoundError('Wallet', id);
    }
    return { walletId: wallet.id, balanceCache: wallet.balanceCache };
  }
}
