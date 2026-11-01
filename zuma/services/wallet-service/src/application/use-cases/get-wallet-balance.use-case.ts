import { NotFoundError, isPrivileged, type Actor } from '@zuma/shared-common';
import { formatSats } from '../../domain/value-objects/satoshi';
import type { WalletRepositoryPort } from '../ports/wallet-repository.port';

export interface WalletBalance {
  walletId: string;
  /** Stored balance in satoshis, as a decimal string (field name kept for API compatibility). */
  balanceCache: string;
}

export class GetWalletBalanceUseCase {
  constructor(private readonly walletRepository: WalletRepositoryPort) {}

  async execute(id: string, actor: Actor): Promise<WalletBalance> {
    const wallet = await this.walletRepository.findById(id);
    if (!wallet || (wallet.ownerUserId !== actor.sub && !isPrivileged(actor))) {
      throw new NotFoundError('Wallet', id);
    }
    return { walletId: wallet.id, balanceCache: formatSats(wallet.balanceSats) };
  }
}
