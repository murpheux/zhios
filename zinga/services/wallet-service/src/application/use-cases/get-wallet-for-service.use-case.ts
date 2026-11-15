import { NotFoundError } from '@zinga/shared-common';
import type { WalletNetwork } from '../../domain/value-objects/network';
import type { WalletLifecycleStatus } from '../../domain/value-objects/wallet-status';
import type { WalletRepositoryPort } from '../ports/wallet-repository.port';

export interface WalletSummary {
  id: string;
  ownerUserId: string;
  status: WalletLifecycleStatus;
  network: WalletNetwork;
  address: string;
}

// Service-only lookup: returns the facts a calling service needs to make its OWN explicit ownership/status
// decision, instead of inferring ownership from the user-facing GET (which privileged roles can read).
export class GetWalletForServiceUseCase {
  constructor(private readonly walletRepository: WalletRepositoryPort) {}

  async execute(id: string): Promise<WalletSummary> {
    const wallet = await this.walletRepository.findById(id);
    if (!wallet) {
      throw new NotFoundError('Wallet', id);
    }
    return {
      id: wallet.id,
      ownerUserId: wallet.ownerUserId,
      status: wallet.status,
      network: wallet.network,
      address: wallet.address,
    };
  }
}
