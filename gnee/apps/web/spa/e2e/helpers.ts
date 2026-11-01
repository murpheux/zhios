import type { Page } from "@playwright/test";

/**
 * Stubs the zuma graphql-gateway at the network level so e2e specs don't
 * require wallet-service/transaction-service/graphql-gateway running.
 * Matched by operation name, same way @gnee/api-client names its queries.
 */
export async function mockZumaGateway(
  page: Page,
  handlers: Record<string, (variables: Record<string, unknown>) => unknown>
) {
  await page.route("**/graphql", async (route) => {
    const body = route.request().postDataJSON() as { query: string; variables?: Record<string, unknown> };
    const operationMatch = body.query.match(/(?:query|mutation)\s+(\w+)/);
    const operationName = operationMatch?.[1];
    const handler = operationName ? handlers[operationName] : undefined;

    // Mirror the gateway: errors carry extensions.code + a safe message.
    if (!handler) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          errors: [{ message: `No mock handler for ${operationName}`, extensions: { code: "NOT_FOUND" } }],
        }),
      });
      return;
    }

    const result = handler(body.variables ?? {});
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(result instanceof GraphQLErrorResponse ? { data: null, errors: result.errors } : { data: result }),
    });
  });
}

/**
 * Seeds a fake, already-signed-in OIDC session into sessionStorage under the
 * same key oidc-client-ts's WebStorageStateStore would use, so e2e specs
 * exercise <RequireAuth>'s "already authenticated" path without driving a
 * real IdP's login UI. Must run (via addInitScript) before the app's first
 * script executes. Matches playwright.config.ts's fixed VITE_OIDC_AUTHORITY
 * / VITE_OIDC_CLIENT_ID.
 */
export async function mockOidcSession(page: Page) {
  const authority = "https://test-issuer.example.com";
  const clientId = "test-client";
  const user = {
    id_token: "fake-id-token",
    session_state: null,
    access_token: "fake-access-token",
    refresh_token: null,
    token_type: "Bearer",
    scope: "openid profile email",
    profile: { sub: "user-123", email: "user@example.com" },
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };
  await page.addInitScript(
    ([key, value]) => window.sessionStorage.setItem(key, value),
    [`oidc.user:${authority}:${clientId}`, JSON.stringify(user)]
  );
}

/** Return from a handler to respond with GraphQL errors instead of data. */
export class GraphQLErrorResponse {
  constructor(readonly errors: Array<{ message: string; extensions: { code: string } }>) {}
}

/** A syntactically valid testnet bech32 address (passes client-side validation). */
export const TESTNET_DESTINATION = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";

export const SAMPLE_WALLET = {
  id: "wallet-1",
  label: "Primary hot wallet",
  address: "tb1qexampleaddress",
  network: "TESTNET",
  type: "HOT",
  balanceCache: "150000",
  metadata: {},
  ownerUserId: "user-123",
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
