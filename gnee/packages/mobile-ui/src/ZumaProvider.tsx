import React, { createContext, useContext, useMemo } from "react";
import { createZumaApi, type ZumaApi, type ZumaClientConfig } from "@gnee/api-client";

const ZumaContext = createContext<ZumaApi | null>(null);

export interface ZumaProviderProps extends ZumaClientConfig {
  children: React.ReactNode;
}

/** Wraps the app once at the root (apps/ios/App.tsx, apps/android/App.tsx) and hands every screen the same zuma client. */
export function ZumaProvider({ children, endpoint, getToken }: ZumaProviderProps) {
  const api = useMemo(() => createZumaApi({ endpoint, getToken }), [endpoint, getToken]);
  return <ZumaContext.Provider value={api}>{children}</ZumaContext.Provider>;
}

export function useZuma(): ZumaApi {
  const api = useContext(ZumaContext);
  if (!api) {
    throw new Error("useZuma() called outside <ZumaProvider>");
  }
  return api;
}
