import { ForbiddenError, NotFoundError, isPrivileged, type Actor } from '@zuma/shared-common';
import type { WalletEntity } from '../../domain/entities/wallet.entity';
import type { WalletRepositoryPort } from '../ports/wallet-repository.port';

export interface UpdateWalletMetadataInput {
  label?: string;
  metadata?: Record<string, unknown>;
}

export class UpdateWalletMetadataUseCase {
  constructor(private readonly walletRepository: WalletRepositoryPort) {}

  async execute(id: string, changes: UpdateWalletMetadataInput, actor: Actor): Promise<WalletEntity> {
    const existing = await this.walletRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Wallet', id);
    }
    if (existing.ownerUserId !== actor.sub) {
      // Writes are strictly owner-only. Privileged roles may already read the wallet, so they get an
      // explicit 403; everyone else gets the same 404 as a missing wallet to avoid confirming existence.
      if (isPrivileged(actor)) {
        throw new ForbiddenError('Only the wallet owner may modify a wallet');
      }
      throw new NotFoundError('Wallet', id);
    }
    const updated = await this.walletRepository.updateMetadata(id, changes);
    if (!updated) {
      throw new NotFoundError('Wallet', id);
    }
    return updated;
  }
}
