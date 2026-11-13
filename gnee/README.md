# gnee

Client apps for the `zuma` Bitcoin wallet & transaction platform: iOS,
Android and a web SPA.

## Decision

**Strategy:** React Native (Expo SDK 58, React Native 0.88, React 19.3,
react-navigation 7) for mobile, React 19.3 + Vite for web. Everything is
TypeScript, matching zuma's own stack (Fastify/TS services + a GraphQL
gateway). Native Swift/Kotlin, Kotlin Multiplatform and Flutter were also
considered. This option was chosen because it gives the most reuse and the
least duplicated effort:

- One language (TypeScript) across every app and shared package. Types for
  zuma's GraphQL schema are written once and imported everywhere.
- `apps/ios` and `apps/android` are thin Expo shells: a ~15-line `App.tsx`
  plus bundle id / package name and secure token storage. All screens,
  navigation and data fetching live once in `packages/mobile-ui`
  (`<ZumaMobileApp>`).
- `apps/web/spa` reuses the same `packages/api-client` as the mobile apps
  (GraphQL client, types, sats/validation/idempotency helpers and the headless
  send-flow controller). A schema change in `zuma/graphql` is therefore a
  one-package update.

## Architecture

```mermaid
flowchart LR
  subgraph apps["gnee apps"]
    web["apps/web/spa<br/>Vite + React 19"]
    ios["apps/ios<br/>Expo shell"]
    android["apps/android<br/>Expo shell"]
  end

  subgraph packages["shared packages"]
    mobileui["packages/mobile-ui<br/>ZumaMobileApp, screens,<br/>navigation (RN only)"]
    subgraph api["packages/api-client (framework-agnostic)"]
      client["GraphQL client<br/>+ ZumaApiError(code)"]
      helpers["sats.ts · validation.ts<br/>idempotency.ts · errors.ts"]
      flow["send-flow.ts<br/>(headless controller)"]
    end
  end

  subgraph auth["auth"]
    idp["OIDC IdP<br/>Auth Code + PKCE"]
    session[("sessionStorage<br/>oidc-client-ts userStore")]
    securestore[("expo-secure-store<br/>key zuma_jwt")]
  end

  subgraph zuma["zuma (../zuma)"]
    gw["graphql-gateway :3003<br/>Mercurius"]
    ws["wallet-service :3001"]
    ts["transaction-service :3002"]
    mongo[("MongoDB")]
  end

  web --> client
  web --> flow
  ios --> mobileui
  android --> mobileui
  mobileui --> client
  mobileui --> flow
  flow --> helpers
  flow --> client

  web -- "signinRedirect / silent renew" --> idp
  idp -- "access token" --> session
  session -. "Bearer token" .-> client
  securestore -. "Bearer token" .-> mobileui

  client -- "HTTPS GraphQL<br/>Authorization: Bearer" --> gw
  gw --> ws
  gw --> ts
  ws <--> ts
  ws --> mongo
  ts --> mongo
```

## Layout

```
gnee/
  packages/
    api-client/   # Framework-agnostic TS: GraphQL client + types mirroring zuma's SDL, sats/BTC helpers,
                  # send-form validation, idempotency keys, error-code mapping, headless send-flow controller.
    mobile-ui/    # Shared React Native app (<ZumaMobileApp>, screens, navigation). Used by apps/ios and apps/android only.
  apps/
    ios/          # Expo app shell: App.tsx + app.json/app.config.ts + eas.json
    android/      # Expo app shell: same, Android flavour
    web/
      spa/        # Vite + React SPA with its own DOM pages and OIDC auth, using the same @gnee/api-client
  infrastructure/ # Docker / Swarm / Kubernetes for web/spa. See infrastructure/README.md
  scripts/        # deploy-docker.sh, deploy-swarm.sh, deploy-k8s.sh, deploy-mobile.sh
```

## Prerequisites

Start zuma first (from the repo root):

```bash
cd ../zuma
chmod +x scripts/*.sh   # once, after cloning
./scripts/dev-up.sh --full
```

This starts `wallet-service` (3001), `transaction-service` (3002) and
`graphql-gateway` (3003). The GraphQL gateway is the only endpoint the gnee
apps talk to.

## Running an app

Each app has its own `README.md` and `env.example`. The general pattern, run
from `gnee/`:

```bash
npm install                       # installs all workspaces (packages + apps)
npm run dev -w @gnee/web-spa      # web SPA, http://localhost:5173
npm run ios -w @gnee/ios          # iOS simulator (macOS + Xcode required)
npm run android -w @gnee/android  # Android emulator (Android Studio required)
```

## Money, validation and the send flow

- **Amounts are integer satoshis as strings** (`"150000"`), end to end. They
  never pass through a JS `number`. `packages/api-client/src/sats.ts` does
  parsing (`parseBtcInputToSats`, `parseSatsInput`) and formatting
  (`formatBtc` → `0.00150000 BTC`, `formatSats` → `150,000 sats`) with
  `bigint` only.
- **Send form**: the user picks the unit explicitly (**BTC** or **sats**
  toggle; labels read "Amount (BTC)" / "Amount (sats)"). Errors appear per
  field while typing. `validateSendForm` checks:
  - the address shape plus the network prefix (bech32 `bc`/`tb`/`bcrt`; base58 `1`/`3` vs `m`/`n`/`2`)
  - that the amount is greater than 0 and no more than the balance
  - that the fee rate is a whole number from 1 to 10000 sat/vB

  The server still re-validates everything, including the full bech32
  checksum.
- **Review → confirm**: a review step shows destination, amount (BTC + sats),
  fee rate and network. Entering review generates **one** idempotency key
  (`crypto.randomUUID`, falling back to `crypto.getRandomValues`, never
  `Math.random`). Every confirm or retry in that review session reuses the
  same key, so a double click, a lost response or a retry can't send twice.
  Going back to edit ends the session; the next review gets a fresh key.
- **Errors**: `ZumaApiError` exposes the gateway's `extensions.code` and its
  client-safe message. `describeZumaError` maps codes such as
  `INSUFFICIENT_FUNDS`, `WALLET_NOT_ACTIVE`, `IDEMPOTENCY_CONFLICT` and
  `FORBIDDEN` to friendly text. For `VALIDATION_ERROR`/`BAD_USER_INPUT` it
  shows the server's message as-is.
- The logic lives in `createSendFlow` (api-client, no React import). Web and
  mobile bind it with a ~25-line `useSendFlow` hook built on
  `useSyncExternalStore` (`apps/web/spa/src/hooks/`,
  `packages/mobile-ui/src/hooks/`). Each app uses its own copy of React, so
  there's no risk of loading two React instances.

```mermaid
sequenceDiagram
  actor U as User
  participant F as Send form (web / mobile)
  participant C as createSendFlow (api-client)
  participant G as graphql-gateway
  participant T as transaction-service

  U->>F: destination, amount (BTC or sats), fee rate
  F->>C: setField / setUnit
  C->>C: parseAmountInput → sats string, validateSendForm(network, balance)
  C-->>F: visibleErrors (live)
  U->>F: Review send
  F->>C: review()
  C->>C: idempotencyKey = createIdempotencyKey() (once per review session)
  C-->>F: step=review, draft (destination, amount, fee rate, network)
  U->>F: Confirm and send
  F->>C: confirm() (no-op while in flight)
  C->>G: mutation createTransaction(input: {walletId, amount, feeRate, destinationAddress, idempotencyKey})
  G->>G: check idempotencyKey + sats patterns
  G->>T: POST /api/v1/transactions (Idempotency-Key header, type=send)
  T->>T: validate address for wallet network, balance, wallet status
  alt success
    T-->>G: transaction
    G-->>C: Transaction
    C-->>F: step=success → navigate to wallet detail (refetch)
  else error (e.g. INSUFFICIENT_FUNDS, network failure)
    T-->>G: {code, message}
    G-->>C: errors[].extensions.code
    C-->>F: step=review, friendly submitError; retry reuses the SAME key
  end
```

## Auth

```mermaid
flowchart LR
  subgraph web["apps/web/spa"]
    RA["RequireAuth"] -- "login(returnTo)" --> UM["oidc-client-ts UserManager"]
    CB["/callback: signinCallback()"] -- "navigate(sanitized state.returnTo)" --> RA
    UM <--> SS[("sessionStorage")]
  end
  UM -- "Auth Code + PKCE, silent renew" --> IDP["OIDC IdP"]
  subgraph mobile["apps/ios · apps/android"]
    APP["App.tsx getToken()"] --> SEC[("expo-secure-store: zuma_jwt")]
  end
  UM -. "access_token" .-> GW["zuma graphql-gateway"]
  APP -. "JWT" .-> GW
```

- **`apps/web/spa`**: OpenID Connect, Authorization Code + PKCE, via
  `oidc-client-ts`, against a configurable external IdP.
  - The user store is **`sessionStorage`**, not `localStorage`. Sessions are
    per tab and end when the tab closes, which shrinks the exposure window
    for XSS or a shared machine.
  - `automaticSilentRenew` is on. `getAccessToken()` renews an expired token
    silently. If renewal fails it returns `undefined`, never a stale token.
  - The return path survives the IdP round-trip via `state` and is checked
    on the way back: only same-origin paths are accepted (no open redirect).
  - Audience and scope come from `VITE_OIDC_AUDIENCE` / `VITE_OIDC_SCOPE`.
  - See `apps/web/spa/README.md`.
- **`apps/ios` / `apps/android`**: no login screen yet. Each app reads a JWT
  from `expo-secure-store` under the key `zuma_jwt` and sends it as
  `Authorization: Bearer <token>`. Seed it manually for local testing; see
  each app's `README.md`.

In both cases zuma's `requireAuth` verifies the token. See
`zuma/docs/security.md` ("OIDC / JWKS path"). Wallet ownership is always
taken from the token, so clients can't set `ownerUserId`.

## Observability: Error Tracking and APM

gnee apps include New Relic Browser (web) and Mobile (React Native) agents for error tracking, performance monitoring, and custom event tracking.

### Installation

Install dependencies:

```bash
npm install
```

This installs: `@newrelic/browser-agent` (web) and `newrelic-react-native-agent` (mobile).

### Web App (React + Vite)

#### Setup

1. **Get New Relic License Key**:
   - Sign up at https://newrelic.com (free tier available)
   - Go to https://one.newrelic.com → Select your account
   - Copy your **INGEST** license key (32 characters)

2. **Configure**:
   ```bash
   # Create apps/web/spa/.env
   VITE_NEWRELIC_ENABLED=true
   VITE_NEWRELIC_LICENSE_KEY=<your-license-key>
   VITE_NEWRELIC_ACCOUNT_ID=<account-id>       # From New Relic UI
   VITE_NEWRELIC_APP_ID=<app-id>               # From New Relic UI
   VITE_NEWRELIC_AGENT_ID=<agent-id>           # From New Relic UI
   ```

3. **Start Dev Server**:
   ```bash
   cd apps/web/spa
   npm run dev
   
   # Open browser DevTools → Network
   # Filter for "nr-data.net" - should see 200/204 responses
   ```

#### Features

- 📊 **Real User Monitoring (RUM)**: Page load times, user interactions, core web vitals
- 🔴 **Error Tracking**: Automatic error boundary capture, JavaScript errors, React errors
- 🎯 **Custom Events**: Track wallet creation, transaction sends, user actions
- 📍 **Breadcrumbs**: User action trail before errors
- 🔐 **Data Privacy**: No sensitive data (tokens, secrets, variables) sent to New Relic

#### Error Boundary

Errors are automatically captured and reported:

```tsx
// Automatically wrapped in error boundary
<ZumaApp />

// Errors are sent to New Relic with:
// - Error message and stack trace
// - React component tree
// - User ID (from token)
// - Page URL and timestamp
// - Browser/device info
```

#### Custom Events

Track important business transactions:

```typescript
// Example: wallet created
useNewRelic(nrAgent => {
  nrAgent.recordCustomEvent('wallet_created', {
    walletId: '...',
    network: 'bitcoin',
    timestamp: new Date().toISOString()
  });
});

// Example: transaction sent
useNewRelic(nrAgent => {
  nrAgent.recordCustomEvent('transaction_sent', {
    transactionId: '...',
    amountSats: 1000,
    status: 'pending',
    duration_ms: 245
  });
});
```

#### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `VITE_NEWRELIC_ENABLED` | `false` | Enable/disable New Relic Browser agent |
| `VITE_NEWRELIC_LICENSE_KEY` | unset | **Required if enabled** |
| `VITE_NEWRELIC_ACCOUNT_ID` | unset | New Relic account ID |
| `VITE_NEWRELIC_APP_ID` | unset | Browser app ID from New Relic UI |
| `VITE_NEWRELIC_AGENT_ID` | unset | Agent ID from New Relic UI |

#### Testing

```bash
# 1. Start with New Relic enabled
cd apps/web/spa
VITE_NEWRELIC_ENABLED=true npm run dev

# 2. Open app in browser
open http://localhost:5173

# 3. Trigger an error (optional)
# - Create a wallet
# - Send a transaction
# - Check browser console

# 4. Verify in New Relic UI (after 1-2 minutes)
# https://one.newrelic.com/nr1-core/browser/overview
```

#### Viewing Data in New Relic

**Browser Dashboard**:
- https://one.newrelic.com/nr1-core/browser/overview
- View page load times, user interactions, JavaScript errors

**Errors**:
- https://one.newrelic.com/nr1-core/errors/overview
- See JavaScript errors, React errors, stack traces

**Custom Events**:
- https://one.newrelic.com/logs
- Query: `eventType = 'wallet_created'` or `eventType = 'transaction_sent'`

**Session Replay** (if enabled):
- https://one.newrelic.com/nr1-core/session-replay/overview
- Watch user sessions and interactions

### Mobile App (React Native)

#### Setup

1. **Get New Relic License Key and App Token**:
   - Go to https://one.newrelic.com/mobile
   - Create or select a Mobile app
   - Copy the **License Key** and **App Token** (different from Browser)

2. **Configure**:
   ```bash
   # Update app.json or eas.json
   {
     "plugins": [
       [
         "newrelic-react-native-agent",
         {
           "newRelicEnabled": true
         }
       ]
     ],
     "extra": {
       "eas": {
         "projectId": "your-project-id"
       }
     },
     "env": {
       "production": {
         "EXPO_PUBLIC_NEWRELIC_LICENSE_KEY": "<license-key>",
         "EXPO_PUBLIC_NEWRELIC_APP_TOKEN": "<app-token>",
         "EXPO_PUBLIC_NEWRELIC_ENABLED": "true"
       },
       "development": {
         "EXPO_PUBLIC_NEWRELIC_ENABLED": "false"
       }
     }
   }
   ```

3. **Install Native Modules**:
   ```bash
   # iOS: Install New Relic pod
   cd apps/ios
   pod install
   
   # Android: Already handled by Gradle plugin
   ```

4. **Build**:
   ```bash
   # Local build for testing
   eas build --platform ios --local
   eas build --platform android --local
   
   # Or use Expo Go for development (without native modules)
   ```

#### Features

- 📱 **Mobile Performance**: App load time, screen transitions, frame rate
- 🔴 **Crash Reporting**: Unhandled exceptions, native crashes
- ⏱️ **Network Monitoring**: HTTP request tracking, API response times
- 🎯 **Custom Events**: Wallet operations, transaction events
- 📊 **Device Info**: OS version, device type, network connection

#### Error Boundary

React Native errors are automatically captured:

```tsx
// Wrap root app with error boundary
<ErrorBoundary>
  <ZumaMobileApp />
</ErrorBoundary>

// Errors automatically sent to New Relic:
// - Error message and stack trace
// - App state snapshot
// - User session ID
// - Device info (OS, version, model)
```

#### Custom Events

Track mobile-specific events:

```typescript
// Example: wallet created on mobile
useNewRelic(nrAgent => {
  nrAgent.recordCustomEvent('wallet_created_mobile', {
    walletId: '...',
    platform: 'ios',  // or 'android'
    creationTime: new Date().toISOString()
  });
});

// Example: app crashed and recovered
useNewRelic(nrAgent => {
  nrAgent.recordCustomEvent('app_crash_recovery', {
    crashReason: 'memory_pressure',
    recoveryTime: 2500  // ms
  });
});
```

#### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `EXPO_PUBLIC_NEWRELIC_ENABLED` | `false` | Enable/disable Mobile agent |
| `EXPO_PUBLIC_NEWRELIC_LICENSE_KEY` | unset | **Required if enabled** |
| `EXPO_PUBLIC_NEWRELIC_APP_TOKEN` | unset | **Required if enabled** |

#### Testing

```bash
# 1. Build for iOS or Android
eas build --platform ios --local

# 2. Install on simulator or device
# (Instructions appear after build completes)

# 3. Test app functionality
# - Create wallet
# - Send transaction
# - Trigger intentional error (optional)

# 4. Check New Relic Mobile UI (after 1-2 minutes)
# https://one.newrelic.com/mobile
```

#### Viewing Data in New Relic

**Mobile Overview**:
- https://one.newrelic.com/nr1-core/mobile/overview
- App performance metrics, crash rate, user engagement

**Crashes**:
- https://one.newrelic.com/nr1-core/mobile/crashes
- See crash details, stack traces, affected users

**Network**:
- https://one.newrelic.com/nr1-core/mobile/network
- HTTP request monitoring, latency, error rates

**Custom Events**:
- https://one.newrelic.com/nrql-query-builder
- Query: `SELECT * FROM Mobile WHERE eventType = 'wallet_created_mobile'`

### API Client Shared Utilities

#### Error Tracking

Errors from GraphQL and HTTP calls are automatically reported:

```typescript
// src/error-tracking.ts

// GraphQL errors (operation failures)
reportGraphQLError({
  operationName: 'CreateWallet',
  error: 'INSUFFICIENT_BALANCE',
  httpStatus: 409
});

// Network errors (timeout, connection failed)
reportNetworkError({
  endpoint: 'graphql-gateway',
  status: 503,
  duration: 5000
});
```

#### Custom Events (Shared)

Cross-platform event tracking:

```typescript
// src/wallets.ts
recordWalletCreated({
  walletId: '...',
  network: 'bitcoin',
  timestamp: new Date().toISOString()
});

// src/send-flow.ts
recordTransactionSent({
  transactionId: '...',
  amountSats: 1000,
  platform: isPlatform ? 'mobile' : 'web'
});
```

### Environment Variables

**Web** (`apps/web/spa/.env.example`):
```
VITE_NEWRELIC_ENABLED=false
VITE_NEWRELIC_LICENSE_KEY=
VITE_NEWRELIC_ACCOUNT_ID=
VITE_NEWRELIC_APP_ID=
VITE_NEWRELIC_AGENT_ID=
```

**Mobile** (`app.json` or `eas.json`):
```
EXPO_PUBLIC_NEWRELIC_ENABLED=false
EXPO_PUBLIC_NEWRELIC_LICENSE_KEY=
EXPO_PUBLIC_NEWRELIC_APP_TOKEN=
```

### Sensitive Data & Privacy

✅ **What is NOT sent to New Relic**:
- User passwords
- JWT tokens
- Credit card numbers
- Account numbers
- Private keys
- API keys
- GraphQL variables (containing user data)

✅ **What IS sent**:
- Error messages (no sensitive context)
- Operation names (not variables)
- Page/screen names
- Custom event names and metrics
- Device/browser info
- Network request URLs (no query parameters)

### Troubleshooting

#### Web: No data in New Relic

```bash
# 1. Verify environment variables are set
echo $VITE_NEWRELIC_ENABLED
echo $VITE_NEWRELIC_LICENSE_KEY

# 2. Check browser console for errors
# Open DevTools → Console tab

# 3. Verify network requests
# DevTools → Network → filter for "nr-data.net"
# Should see 200 or 204 responses

# 4. Check CORS/CSP issues
# Allow nr-data.net in Content Security Policy
```

#### Mobile: No data in New Relic

```bash
# 1. Verify New Relic agent installed
# iOS: Check Pods in Xcode build log
# Android: Check Gradle sync in Android Studio

# 2. Confirm license key and app token
# Check app.json or eas.json

# 3. Test on physical device or simulator
# Some features only work on real devices

# 4. Check New Relic Mobile app configuration
# Verify app was created and properly named
```

#### High data volume

```bash
# 1. Disable for development
VITE_NEWRELIC_ENABLED=false npm run dev

# 2. Reduce session recording (if enabled)
# Disable in New Relic UI → Settings

# 3. Filter events (in app)
// Only send events for important actions
if (isProduction) {
  recordCustomEvent('wallet_created', data);
}
```

### NRQL Queries (Data Exploration)

```sql
-- Web: top errors
SELECT count(*) FROM JavaScriptError
WHERE appName = 'zuma-web'
FACET errorMessage
LIMIT 10

-- Mobile: crash trends
SELECT count(*) FROM MobileSession
WHERE appName = 'zuma-mobile' AND crashCount > 0
FACET platformVersion
TIMESERIES 1 day

-- Custom events: wallet creation rate
SELECT count(*) FROM Mobile
WHERE eventType = 'wallet_created'
TIMESERIES 1 day

-- API health: average request time
SELECT average(duration) FROM Mobile
WHERE http.method = 'POST' AND http.url LIKE 'graphql%'
FACET http.statusCode
```

### Production Best Practices

1. **Test on staging first**: Verify everything works before production
2. **Monitor error rates**: Set up alerts for error spike
3. **Use custom events**: Track key business transactions
4. **Respect user privacy**: Never send PII or secrets
5. **Monitor data costs**: New Relic charges by data ingestion volume
6. **Update regularly**: Keep `@newrelic/browser-agent` and `newrelic-react-native-agent` updated
7. **Test error handling**: Verify error boundary and recovery work

### See Also

- **Web App**: `apps/web/spa/README.md`
- **iOS App**: `apps/ios/README.md`
- **Android App**: `apps/android/README.md`
- **API Client**: `packages/api-client/README.md`
- **New Relic Docs**: https://docs.newrelic.com/

## Lint

```bash
npm run lint           # = biome lint . (Biome 2, config in biome.json; replaces ESLint)
npm run format:check   # biome format . (formatter currently disabled in biome.json)
```

## Typecheck

```bash
npm run typecheck      # tsc --noEmit in every workspace
```

## Test

| Layer | Command | Notes |
|---|---|---|
| Unit, all workspaces | `npm test` | runs each workspace's `test` script |
| api-client | `npm test -w @gnee/api-client` | jest + ts-jest: sats, validation, idempotency, error mapping, send-flow, queries |
| mobile-ui | `npm test -w @gnee/mobile-ui` | jest-expo + RNTL 13 (screens, review step) |
| ios / android shells | `npm test -w @gnee/ios`, `npm test -w @gnee/android` | App renders `<ZumaMobileApp>` |
| web unit | `npm test -w @gnee/web-spa` | vitest + jsdom + RTL (send review/confirm, error mapping, no double submit) |
| web e2e | `npm run e2e -w @gnee/web-spa` | Playwright, gateway stubbed by operation name, fake OIDC session seeded in `sessionStorage` |
| mobile e2e | `npm run e2e:build` / `e2e:test` in `apps/ios` or `apps/android` | Detox. Needs a simulator/emulator and the `@config-plugins/detox` config plugin (not installed yet). See the app READMEs |

## Deploy

See [`infrastructure/README.md`](infrastructure/README.md) for details. Every
script resolves config from environment variables first, then 1Password
`op read`. A failed or empty read aborts the script, and nothing secret is
checked in or baked into images.

For the web SPA running locally against the real zuma backend and a mock OIDC provider (login
works with no real IdP), deploy the whole stack from the repo root: `make secrets-local && make deploy`
(Terraform, the default) or `make compose-up && make compose-test` (docker compose). See
[../README.md#deploy](../README.md#deploy). The compose definition for the SPA is
[`infrastructure/docker/web-spa-compose.yml`](infrastructure/docker/web-spa-compose.yml): read-only
rootfs, `cap_drop: ALL`, uid 101, `127.0.0.1:8080`.

| Target | Command | What it does |
|---|---|---|
| Full local stack | repo root: `make deploy` / `make compose-up` | web-spa + zuma + mock OIDC on `127.0.0.1` |
| Local container (SPA only) | [`scripts/deploy-docker.sh`](scripts/deploy-docker.sh) | builds `web-spa` (Vite → nginx-unprivileged) and runs it on `http://localhost:8080` (localhost is a secure context, so no TLS) |
| Docker Swarm | `REGISTRY=… SITE_ADDRESS=… ./scripts/deploy-swarm.sh` ([script](scripts/deploy-swarm.sh)) | build + push, then `docker stack deploy` of `web-spa` behind a **Caddy TLS proxy** (`infrastructure/docker/web-spa-stack.yml`, `Caddyfile`). Use `docker context use scarlet-daemon` first |
| Kubernetes | `REGISTRY=… WEB_SPA_HOST=… CERT_MANAGER_CLUSTER_ISSUER=… ./scripts/deploy-k8s.sh` ([script](scripts/deploy-k8s.sh)) | build + push, then `terraform apply` (prompts) of `infrastructure/terraform/kubernetes`. Covers the TLS **Ingress** via cert-manager, NetworkPolicy, HPA and PDB |
| iOS / Android | `./scripts/deploy-mobile.sh <ios\|android> <profile>` ([script](scripts/deploy-mobile.sh)) | **EAS Build/Submit**. App Store Connect / Play credentials go to 0600 temp files and are deleted on exit |

Remote web deploys refuse non-`https` or loopback gateway, authority and
redirect URLs.

## Devcontainers

Each workspace has its own `.devcontainer/devcontainer.json` (VS Code /
`devcontainer` CLI). Each one opens the whole `gnee/` tree, because the npm
workspace symlinks need it, in a Node 22 container with the Biome extension.
Each also pre-installs what that workspace needs: the Android SDK + JDK for
`apps/android`, and Playwright's browsers for `apps/web/spa`. `apps/ios`'s
container is JS/TS-only, since iOS builds still need macOS + Xcode on the
host.
