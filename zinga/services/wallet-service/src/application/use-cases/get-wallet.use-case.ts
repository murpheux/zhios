import { NotFoundError, isPrivileged, type Actor } from '@zinga/shared-common';
import type { WalletEntity } from '../../domain/entities/wallet.entity';
import type { WalletRepositoryPort } from '../ports/wallet-repository.port';

export class GetWalletUseCase {
  constructor(private readonly walletRepository: WalletRepositoryPort) {}

  async execute(id: string, actor: Actor): Promise<WalletEntity> {
    const wallet = await this.walletRepository.findById(id);
    // Non-owners get the same 404 as a missing wallet, never a 403, to avoid confirming existence.
    if (!wallet || (wallet.ownerUserId !== actor.sub && !isPrivileged(actor))) {
      throw new NotFoundError('Wallet', id);
    }
    return wallet;
  }
}
