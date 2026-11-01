export * from "./types";
export { createZumaClient, toZumaApiError, ZumaApiError } from "./client";
export type { ZumaClient, ZumaClientConfig, ZumaErrorCode, ZumaGraphQLErrorInfo } from "./client";
export { describeZumaError, isRetryableError } from "./errors";
export { humanizeEnum } from "./format";
export * from "./sats";
export * from "./validation";
export { createIdempotencyKey } from "./idempotency";
export type { RandomSource } from "./idempotency";
export { createSendFlow } from "./send-flow";
export type {
  SendDraft,
  SendFlowController,
  SendFlowOptions,
  SendFlowState,
  SendFlowWallet,
  SendFormValues,
  SendStep,
} from "./send-flow";
export { createWalletsApi } from "./wallets";
export type { WalletsApi } from "./wallets";
export { createTransactionsApi } from "./transactions";
export type { TransactionsApi } from "./transactions";

import { createZumaClient, type ZumaClientConfig } from "./client";
import { createTransactionsApi } from "./transactions";
import { createWalletsApi } from "./wallets";

/**
 * Single entry point every gnee app (ios, android, web/spa) uses to talk to zuma.
 *
 * Example:
 *   const zuma = createZumaApi({ endpoint: gatewayUrl, getToken: () => authStore.token });
 *   const { items } = await zuma.wallets.list({ page: 1, limit: 25 });
 */
export function createZumaApi(config: ZumaClientConfig) {
  const client = createZumaClient(config);
  return {
    wallets: createWalletsApi(client),
    transactions: createTransactionsApi(client),
  };
}

export type ZumaApi = ReturnType<typeof createZumaApi>;
