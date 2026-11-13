import type { Actor } from '../actor';
import { walletCacheKey } from '../cache-keys';
import type { WalletSyncDto } from '../dtos';
import type { CachePort, ZumaClient, ZumaWallet } from '../ports';
import { loadAuthorizedUser, type UserAccessDeps } from '../user-access';

interface CachedWallets {
  wallets: ZumaWallet[];
  fetchedAt: string;
}

export class SyncWalletUseCase {
  constructor(
    private readonly deps: UserAccessDeps,
    private readonly cache: CachePort,
    private readonly zuma: ZumaClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(userId: string, actor: Actor): Promise<WalletSyncDto> {
    const user = await loadAuthorizedUser(this.deps, userId, actor);
    const key = walletCacheKey(userId);

    const hit = await this.cache.get<CachedWallets>(key);
    if (hit) return { userId, ...hit, cached: true };

    const wallets = await this.zuma.listWalletsByOwner(user.externalId, { bearerToken: actor.token });
    const fresh: CachedWallets = { wallets, fetchedAt: this.now().toISOString() };
    await this.cache.set(key, fresh, this.deps.cacheTtlSeconds);
    return { userId, ...fresh, cached: false };
  }
}
