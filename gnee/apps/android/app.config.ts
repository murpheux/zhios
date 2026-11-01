import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Extends app.json: EXPO_PUBLIC_ZUMA_GATEWAY_URL (from .env / the shell / EAS env)
 * overrides app.json's extra.zumaGatewayUrl, so the same value reaches
 * Constants.expoConfig.extra at runtime and EAS builds.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? "Zuma Wallet",
  slug: config.slug ?? "zuma-wallet",
  extra: {
    ...config.extra,
    zumaGatewayUrl: process.env.EXPO_PUBLIC_ZUMA_GATEWAY_URL || config.extra?.zumaGatewayUrl,
  },
});
