import { resolveGatewayUrl, ZumaMobileApp } from "@gnee/mobile-ui";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

// EXPO_PUBLIC_* is inlined by Metro at bundle time; app.config.ts also copies it into extra.
const GATEWAY_URL = resolveGatewayUrl(
  process.env.EXPO_PUBLIC_ZUMA_GATEWAY_URL,
  Constants.expoConfig?.extra?.zumaGatewayUrl,
  "http://10.0.2.2:3003/graphql"
);

const getToken = () => SecureStore.getItemAsync("zuma_jwt");
// Hermes has no global crypto; expo-crypto supplies a CSPRNG-backed UUID for Idempotency-Key.
const createIdempotencyKey = () => Crypto.randomUUID();

/** apps/android entry point — Android (10.0.2.2 = host loopback from the emulator). Everything else lives in @gnee/mobile-ui. */
export default function App() {
  return <ZumaMobileApp gatewayUrl={GATEWAY_URL} getToken={getToken} createIdempotencyKey={createIdempotencyKey} />;
}
