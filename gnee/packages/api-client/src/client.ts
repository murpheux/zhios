import { GraphQLClient } from "graphql-request";

export interface ZumaClientConfig {
  /** Base URL of the zuma graphql-gateway, e.g. http://localhost:3003/graphql */
  endpoint: string;
  /** Returns the current JWT bearer token, or null if unauthenticated. Called per-request so token refresh is picked up automatically. */
  getToken: () => string | null | Promise<string | null>;
}

export class ZumaApiError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "ZumaApiError";
  }
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
      throw new ZumaApiError("zuma gateway request failed", err);
    }
  }

  return { request };
}

export type ZumaClient = ReturnType<typeof createZumaClient>;
