import type { ZumaClientConfig } from "@gnee/api-client";
import { useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { RootNavigator } from "./navigation";
import { initNewRelic, type NewRelicConfig } from "./utils/newrelic";
import { ZumaProvider } from "./ZumaProvider";

export interface ZumaMobileAppProps {
  /** zuma graphql-gateway URL — resolve with resolveGatewayUrl(). */
  gatewayUrl: string;
  /** Returns the bearer token (e.g. from expo-secure-store). Keep it referentially stable. */
  getToken: ZumaClientConfig["getToken"];
  /** CSPRNG-backed idempotency key generator; see ZumaProviderProps. */
  createIdempotencyKey?: () => string;
  /** New Relic Mobile config; omit (or enabled: false) to run without telemetry. */
  newRelic?: NewRelicConfig;
}

/**
 * The whole shared mobile app: safe-area context, zuma client and navigation.
 * apps/ios and apps/android render just this with their platform config.
 */
export function ZumaMobileApp({ gatewayUrl, getToken, createIdempotencyKey, newRelic }: ZumaMobileAppProps) {
  // Start the agent before the first child renders; initNewRelic is idempotent (StrictMode double-invokes).
  useState(() => (newRelic ? initNewRelic(newRelic) : false));
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ZumaProvider endpoint={gatewayUrl} getToken={getToken} createIdempotencyKey={createIdempotencyKey}>
          <RootNavigator />
        </ZumaProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
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
