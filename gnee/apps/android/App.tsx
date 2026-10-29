import React from "react";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { ZumaProvider, RootNavigator } from "@gnee/mobile-ui";

const ZUMA_GATEWAY_URL: string =
  (Constants.expoConfig?.extra?.zumaGatewayUrl as string | undefined) ??
  "http://10.0.2.2:3003/graphql";

async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync("zuma_jwt");
}

/**
 * apps/android entry point. Thin by design: screens and business logic are
 * shared verbatim with apps/ios via @gnee/mobile-ui / @gnee/api-client; this
 * file only wires platform-specific concerns (package name, secure token
 * storage, Android-only config such as the emulator loopback host).
 */
export default function App() {
  return (
    <ZumaProvider endpoint={ZUMA_GATEWAY_URL} getToken={getToken}>
      <RootNavigator />
    </ZumaProvider>
  );
}
