# gnee

Client apps for the `zuma` Bitcoin wallet & transaction platform: iOS,
Android and a web SPA.

## Decision

**Strategy:** React Native (Expo) for mobile, React (Vite) for web — all
TypeScript, matching zuma's own stack (Fastify/TS services + a GraphQL
gateway). Considered against native Swift/Kotlin, Kotlin Multiplatform and
Flutter; this option maximizes reuse and minimizes duplicated effort because:

- One language (TypeScript) across every app and the shared packages below —
  no context-switching between Swift, Kotlin and TS, and type definitions for
  zuma's GraphQL schema are written once and imported everywhere.
- `apps/ios` and `apps/android` are thin Expo shells (bundle id / package
  name, secure token storage, platform-only config). All screens, navigation
  and data-fetching logic live once in `packages/mobile-ui` and are shared
  verbatim between them — running `expo prebuild` / `expo run:ios` /
  `expo run:android` generates each platform's native `ios/`/`android/`
  project inside its own app folder.
- `apps/web/spa` reuses the same `packages/api-client` (GraphQL client,
  types, queries/mutations) as the mobile apps, so a schema change in
  `zuma/graphql` is a one-file update (`packages/api-client/src/types.ts`)
  instead of three.

## Layout

```
gnee/
  packages/
    api-client/   # Shared GraphQL client for zuma's graphql-gateway (types, queries, mutations). Framework-agnostic TS — used by mobile and web.
    mobile-ui/    # Shared React Native screens/navigation (wallet list/detail, create wallet, send transaction). Used by apps/ios and apps/android only.
  apps/
    ios/          # Expo app shell — iOS platform config + @gnee/mobile-ui
    android/      # Expo app shell — Android platform config + @gnee/mobile-ui
    web/
      spa/        # Vite + React SPA — own page components, same @gnee/api-client
```

## Prerequisites

Start zuma first (from the repo root):

```bash
cd ../zuma
chmod +x scripts/*.sh   # once, after cloning
./scripts/dev-up.sh --full
```

This brings up `wallet-service` (3001), `transaction-service` (3002) and
`graphql-gateway` (3003) — the GraphQL gateway is the single endpoint every
gnee app talks to.

## Running an app

Each app has its own `README.md` and `env.example`. General pattern from
`gnee/`:

```bash
npm install                      # installs all workspaces (packages + apps)
npm run typecheck                # typecheck every workspace
npm run dev -w @gnee/web-spa      # web SPA, http://localhost:5173
npm run ios -w @gnee/ios          # iOS simulator (macOS + Xcode required)
npm run android -w @gnee/android  # Android emulator (Android Studio required)
```

## Auth

- **`apps/web/spa`**: real OpenID Connect login (Authorization Code + PKCE,
  via `oidc-client-ts`) against a configurable external IdP. See its
  `README.md` and `src/auth/`.
- **`apps/ios` / `apps/android`**: no login screen yet — each reads a JWT
  from `expo-secure-store` under the key `zuma_jwt`, matching the
  `Authorization: Bearer <token>` header zuma's `requireAuth` expects. Seed
  it manually for local testing; see each app's `README.md`.

Either way, zuma's `requireAuth` is what ultimately verifies the token —
see `zuma/docs/security.md`'s "OIDC / JWKS path" for how it accepts
OIDC-issued tokens alongside the original shared-secret HS256 ones.

## Devcontainers

Each workspace has its own `.devcontainer/devcontainer.json` (VS Code /
`devcontainer` CLI) — opens the whole `gnee/` tree (needed for the npm
workspace symlinks) in a Node 22 container, pre-installed with whatever that
workspace needs (Android SDK + JDK for `apps/android`, Playwright's browsers
for `apps/web/spa`). `apps/ios`'s container is JS/TS-only — iOS builds still
need macOS + Xcode on the host.

## Deploying

See [`infrastructure/README.md`](infrastructure/README.md) — Docker, Docker
Swarm and Kubernetes (via Terraform) for `apps/web/spa`; EAS Build/Submit for
`apps/ios`/`apps/android`. All deploy scripts resolve config through 1Password
(`op read`), never a checked-in secret.
