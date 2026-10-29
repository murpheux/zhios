# @gnee/web-spa

Web SPA for the Zuma wallet app (React + Vite, TypeScript strict). Talks to
the same [`@gnee/api-client`](../../../packages/api-client) GraphQL client
used by [`@gnee/ios`](../../ios) and [`@gnee/android`](../../android), so
wallet/transaction queries, mutations and types never drift between
platforms — only the UI layer (DOM here, React Native there) differs.

## Setup

```bash
cd gnee/apps/web/spa
op run --env-file=env.example -- npm run dev   # resolves op:// refs from 1Password, writes nothing to disk
# or, without 1Password: cp env.example .env, fill in real values, then `npm run dev`
npm install
```

Requires the zuma `graphql-gateway` (and the two REST services it composes)
running locally — see `zuma/README.md` and `./scripts/dev-up.sh --full`.

## Auth

Sign-in is OpenID Connect, Authorization Code + PKCE, via
[`oidc-client-ts`](https://github.com/authts/oidc-client-ts) (`src/auth/`):

- `<AuthProvider>` (`src/auth/AuthContext.tsx`) wraps the app in `main.tsx` and holds the current OIDC `User`.
- `<RequireAuth>` (`src/auth/RequireAuth.tsx`) wraps every route except `/callback` in `App.tsx` and redirects to the provider's login page when there's no session.
- `/callback` (`src/pages/CallbackPage.tsx`) completes the code exchange and routes back to where the user started.
- `ZumaProvider` reads the access token straight off the OIDC session (`useAuth().getAccessToken()`) — no more manual `localStorage` seeding.

Configure your provider (Auth0, Keycloak, Cognito, Azure AD, …) via `VITE_OIDC_*` in `env.example`:
register a **public SPA client** (no client secret — PKCE instead), add
`http://localhost:5173/callback` as an allowed redirect URI, and make sure
issued access tokens carry `sub` (always) and a `roles` claim if you use
`requireRole` on the zuma side.

zuma's `requireAuth` (`wallet-service`/`transaction-service`) must be pointed
at the same provider's JWKS endpoint to accept these tokens — set
`JWT_JWKS_URI` (and `JWT_AUDIENCE` if your provider requires an audience) in
each service's env. See `zuma/docs/security.md`'s "OIDC / JWKS path" for
details; the default without `JWT_JWKS_URI` is still the original shared-secret
HS256 `JWT_SECRET`, unrelated to this SPA's login.

## Testing

```bash
npm run lint              # eslint .
npm run typecheck         # tsc --noEmit
npm test                  # vitest unit tests (src/**/*.test.tsx), jsdom + RTL
npx playwright install --with-deps chromium   # once, before first e2e run
npm run e2e               # playwright e2e (e2e/**/*.spec.ts)
```

E2E specs stub the zuma gateway at the network level (`e2e/helpers.ts`) by
matching GraphQL operation names, so they run without wallet-service,
transaction-service or graphql-gateway up. They also seed a fake, already
signed-in OIDC session into `localStorage` (`mockOidcSession`) against fixed
test `VITE_OIDC_AUTHORITY`/`VITE_OIDC_CLIENT_ID` values set in
`playwright.config.ts`'s `webServer.env`, so `<RequireAuth>` doesn't redirect
to a real IdP during the run.

## Devcontainer

`.devcontainer/devcontainer.json` opens the whole `gnee/` workspace in a
Node 22 container (needed for the `@gnee/api-client` symlinked dep),
installs deps and Playwright's Chromium on create, and forwards port 5173
so `npm run dev` is reachable from the host.

## Deploying

See [`infrastructure/README.md`](../../../infrastructure/README.md) for
Docker, Docker Swarm and Kubernetes (via Terraform) deploy paths.
