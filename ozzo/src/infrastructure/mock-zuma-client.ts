import type { ZumaClient, ZumaWallet } from '../application/ports';

/** Stand-in for zuma wallet-service (USE_MOCK_ZUMA=true, tests). Counts calls to verify caching. */
export class MockZumaClient implements ZumaClient {
  calls = 0;

  constructor(private readonly wallets: ZumaWallet[] = []) {}

  async listWalletsByOwner(ownerUserId: string): Promise<ZumaWallet[]> {
    this.calls++;
    if (this.wallets.length > 0) return this.wallets;
    return [{ id: `mock-wallet-${ownerUserId}`, ownerUserId, balance: '0', status: 'active' }];
  }
}
