import { NotFoundError, isPrivileged, type Actor } from '@zuma/shared-common';
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
    if (!existing || (existing.ownerUserId !== actor.sub && !isPrivileged(actor))) {
      throw new NotFoundError('Wallet', id);
    }
    const updated = await this.walletRepository.updateMetadata(id, changes);
    if (!updated) {
      throw new NotFoundError('Wallet', id);
    }
    return updated;
  }
}
