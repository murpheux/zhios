import React from "react";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { ZumaProvider, RootNavigator } from "@gnee/mobile-ui";

const ZUMA_GATEWAY_URL: string =
  (Constants.expoConfig?.extra?.zumaGatewayUrl as string | undefined) ??
  "http://localhost:3003/graphql";

async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync("zuma_jwt");
}

/**
 * apps/ios entry point. Intentionally thin: all screens and business logic
 * live in @gnee/mobile-ui / @gnee/api-client and are shared verbatim with
 * apps/android — this file only wires platform-specific concerns
 * (secure token storage, bundle id, iOS-only config).
 */
export default function App() {
  return (
    <ZumaProvider endpoint={ZUMA_GATEWAY_URL} getToken={getToken}>
      <RootNavigator />
    </ZumaProvider>
  );
}
