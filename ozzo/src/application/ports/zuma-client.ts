export interface ZumaWallet {
  id: string;
  ownerUserId?: string;
  balance?: string;
  status?: string;
  [key: string]: unknown;
}

export interface ZumaCallContext {
  /** The caller's bearer token, forwarded so zuma applies its own ownership checks. */
  bearerToken?: string;
}

export interface ZumaClient {
  /** Lists wallets owned by the given external (Okta) user id. Throws UpstreamError on failure. */
  listWalletsByOwner(ownerUserId: string, ctx: ZumaCallContext): Promise<ZumaWallet[]>;
}
