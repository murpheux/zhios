import { isPrivileged, type Actor, type PaginatedResult, type PaginationQuery } from '@zuma/shared-common';
import type { WalletEntity } from '../../domain/entities/wallet.entity';
import type { WalletFilter, WalletRepositoryPort } from '../ports/wallet-repository.port';

export class ListWalletsUseCase {
  constructor(private readonly walletRepository: WalletRepositoryPort) {}

  async execute(
    filter: WalletFilter,
    pagination: PaginationQuery,
    actor: Actor,
  ): Promise<PaginatedResult<WalletEntity>> {
    // Non-privileged actors can only ever list their own wallets, regardless of the requested filter.
    const scopedFilter: WalletFilter = isPrivileged(actor)
      ? filter
      : { ...filter, ownerUserId: actor.sub };
    return this.walletRepository.findMany(scopedFilter, pagination);
  }
}
