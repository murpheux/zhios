import { createWalletEntity, type WalletEntity } from '../../domain/entities/wallet.entity';
import type { WalletNetwork } from '../../domain/value-objects/network';
import type { WalletKind } from '../../domain/value-objects/wallet-status';
import type { Actor } from '@zuma/shared-common';
import type { WalletRepositoryPort } from '../ports/wallet-repository.port';
import type { AddressGeneratorPort } from '../ports/address-generator.port';

export interface CreateWalletInput {
  label: string;
  network: WalletNetwork;
  type: WalletKind;
  metadata?: Record<string, unknown>;
}

export class CreateWalletUseCase {
  constructor(
    private readonly walletRepository: WalletRepositoryPort,
    private readonly addressGenerator: AddressGeneratorPort,
  ) {}

  async execute(input: CreateWalletInput, actor: Actor): Promise<WalletEntity> {
    const address = await this.addressGenerator.generate(input.network);
    const draft = createWalletEntity({ ...input, address, ownerUserId: actor.sub });
    return this.walletRepository.create({ ...draft, address });
  }
}
