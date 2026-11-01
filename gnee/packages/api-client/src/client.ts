import { GraphQLClient } from "graphql-request";
import { toZumaApiError } from "./api-error";

export { toZumaApiError, ZumaApiError } from "./api-error";
export type { ZumaErrorCode, ZumaGraphQLErrorInfo } from "./api-error";

export interface ZumaClientConfig {
  /** Base URL of the zuma graphql-gateway, e.g. http://localhost:3003/graphql */
  endpoint: string;
  /**
   * Returns the current JWT bearer token, or null/undefined if unauthenticated.
   * Called per-request so token refresh is picked up automatically.
   */
  getToken: () => string | null | undefined | Promise<string | null | undefined>;
}

/**
 * Thin wrapper around graphql-request that injects the current JWT and
 * normalizes gateway errors. One instance per app; shared across ios,
 * android and web/spa via @gnee/api-client.
 */
export function createZumaClient(config: ZumaClientConfig) {
  const raw = new GraphQLClient(config.endpoint);

  async function request<TData, TVariables extends object = Record<string, never>>(
    document: string,
    variables?: TVariables
  ): Promise<TData> {
    const token = await config.getToken();
    try {
      return await raw.request<TData, TVariables>({
        document,
        variables,
        requestHeaders: token ? { Authorization: `Bearer ${token}` } : undefined,
      } as unknown as Parameters<typeof raw.request<TData, TVariables>>[0]);
    } catch (err) {
      throw toZumaApiError(err);
    }
  }

  return { request };
}

export type ZumaClient = ReturnType<typeof createZumaClient>;
