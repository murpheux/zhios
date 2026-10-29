import type { WalletOwnershipPort } from '../../application/ports/wallet-ownership.port';

export interface WalletServiceClientOptions {
  baseUrl: string;
}

// HTTP adapter confirming wallet ownership via wallet-service's GET /wallets/:id (404 = not owner/missing).
export class WalletOwnershipHttpClient implements WalletOwnershipPort {
  constructor(private readonly options: WalletServiceClientOptions) {}

  async isOwner(walletId: string, _ownerUserId: string, authorization?: string): Promise<boolean> {
    const response = await fetch(`${this.options.baseUrl}/api/v1/wallets/${encodeURIComponent(walletId)}`, {
      signal: AbortSignal.timeout(2000),
      headers: authorization ? { authorization } : undefined,
    });
    // wallet-service returns 404 for both "missing" and "not owned by this caller" by design.
    if (response.status === 404) {
      return false;
    }
    if (!response.ok) {
      throw new Error(`wallet-service responded with ${response.status}`);
    }
    return true;
  }
}
