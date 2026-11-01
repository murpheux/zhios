import type { ZumaClientConfig } from "@gnee/api-client";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RootNavigator } from "./navigation";
import { ZumaProvider } from "./ZumaProvider";

export interface ZumaMobileAppProps {
  /** zuma graphql-gateway URL — resolve with resolveGatewayUrl(). */
  gatewayUrl: string;
  /** Returns the bearer token (e.g. from expo-secure-store). Keep it referentially stable. */
  getToken: ZumaClientConfig["getToken"];
  /** CSPRNG-backed idempotency key generator; see ZumaProviderProps. */
  createIdempotencyKey?: () => string;
}

/**
 * The whole shared mobile app: safe-area context, zuma client and navigation.
 * apps/ios and apps/android render just this with their platform config.
 */
export function ZumaMobileApp({ gatewayUrl, getToken, createIdempotencyKey }: ZumaMobileAppProps) {
  return (
    <SafeAreaProvider>
      <ZumaProvider endpoint={gatewayUrl} getToken={getToken} createIdempotencyKey={createIdempotencyKey}>
        <RootNavigator />
      </ZumaProvider>
    </SafeAreaProvider>
  );
}

/**
 * First non-empty candidate wins — pass in priority order, e.g.
 * `resolveGatewayUrl(process.env.EXPO_PUBLIC_ZUMA_GATEWAY_URL, Constants.expoConfig?.extra?.zumaGatewayUrl, fallback)`.
 * Only http(s) URLs are accepted.
 */
export function resolveGatewayUrl(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && /^https?:\/\/\S+$/.test(candidate.trim())) {
      return candidate.trim();
    }
  }
  throw new Error("No valid zuma gateway URL configured (set EXPO_PUBLIC_ZUMA_GATEWAY_URL)");
}
