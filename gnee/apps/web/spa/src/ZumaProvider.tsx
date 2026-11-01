import { createZumaApi, type ZumaApi } from "@gnee/api-client";
import type React from "react";
import { createContext, useContext, useMemo } from "react";
import { useAuth } from "./auth/AuthContext";

const ZUMA_GATEWAY_URL: string = import.meta.env.VITE_ZUMA_GATEWAY_URL ?? "http://localhost:3003/graphql";

const ZumaContext = createContext<ZumaApi | null>(null);

/**
 * Same contract as @gnee/mobile-ui's ZumaProvider, except the token comes
 * from the OIDC session (useAuth) instead of expo-secure-store — zuma's
 * requireAuth verifies that access token directly (see JWT_JWKS_URI in
 * zuma/docs/security.md). getAccessToken is referentially stable (useCallback
 * in AuthProvider), so the client is created once, not on every render.
 */
export function ZumaProvider({ children }: { children: React.ReactNode }) {
  const { getAccessToken } = useAuth();
  const api = useMemo(() => createZumaApi({ endpoint: ZUMA_GATEWAY_URL, getToken: getAccessToken }), [getAccessToken]);
  return <ZumaContext.Provider value={api}>{children}</ZumaContext.Provider>;
}

export function useZuma(): ZumaApi {
  const api = useContext(ZumaContext);
  if (!api) {
    throw new Error("useZuma() called outside <ZumaProvider>");
  }
  return api;
}
