export * from "./types";
export { createZumaClient, ZumaApiError } from "./client";
export type { ZumaClient, ZumaClientConfig } from "./client";
export { createWalletsApi } from "./wallets";
export type { WalletsApi } from "./wallets";
export { createTransactionsApi } from "./transactions";
export type { TransactionsApi } from "./transactions";

import { createZumaClient, type ZumaClientConfig } from "./client";
import { createWalletsApi } from "./wallets";
import { createTransactionsApi } from "./transactions";

/**
 * Single entry point every gnee app (ios, android, web/spa) uses to talk to zuma.
 *
 * Example:
 *   const zuma = createZumaApi({ endpoint: process.env.ZUMA_GATEWAY_URL!, getToken: () => authStore.token });
 *   const { items } = await zuma.wallets.list({ ownerUserId });
 */
export function createZumaApi(config: ZumaClientConfig) {
  const client = createZumaClient(config);
  return {
    wallets: createWalletsApi(client),
    transactions: createTransactionsApi(client),
  };
}

export type ZumaApi = ReturnType<typeof createZumaApi>;
