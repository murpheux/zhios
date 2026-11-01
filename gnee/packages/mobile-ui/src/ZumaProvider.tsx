import { createZumaApi, type ZumaApi, type ZumaClientConfig } from "@gnee/api-client";
import type React from "react";
import { createContext, useContext, useMemo } from "react";

interface ZumaContextValue {
  api: ZumaApi;
  createIdempotencyKey?: () => string;
}

const ZumaContext = createContext<ZumaContextValue | null>(null);

export interface ZumaProviderProps extends ZumaClientConfig {
  children: React.ReactNode;
  /**
   * Optional CSPRNG-backed key generator for sends (e.g. expo-crypto's randomUUID).
   * Defaults to @gnee/api-client's createIdempotencyKey, which needs a global `crypto`.
   */
  createIdempotencyKey?: () => string;
}

/**
 * Wraps the app once at the root (via <ZumaMobileApp>) and hands every screen the
 * same zuma client. Pass a stable `getToken` (module-level function or useCallback),
 * otherwise the client is rebuilt on every render.
 */
export function ZumaProvider({ children, endpoint, getToken, createIdempotencyKey }: ZumaProviderProps) {
  const value = useMemo(
    () => ({ api: createZumaApi({ endpoint, getToken }), createIdempotencyKey }),
    [endpoint, getToken, createIdempotencyKey]
  );
  return <ZumaContext.Provider value={value}>{children}</ZumaContext.Provider>;
}

export function useZuma(): ZumaApi {
  const ctx = useContext(ZumaContext);
  if (!ctx) {
    throw new Error("useZuma() called outside <ZumaProvider>");
  }
  return ctx.api;
}

/** The app-supplied idempotency key generator, if any (undefined -> api-client default). */
export function useIdempotencyKeyFactory(): (() => string) | undefined {
  return useContext(ZumaContext)?.createIdempotencyKey;
}
