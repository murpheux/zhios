# @gnee/ios

iOS shell for the Zuma wallet app (Expo / React Native, TypeScript). All screens,
navigation and business logic live in [`@gnee/mobile-ui`](../../packages/mobile-ui)
and [`@gnee/api-client`](../../packages/api-client) — this app only wires
iOS-specific concerns (bundle id, secure token storage via `expo-secure-store`,
`app.json` platform config). Identical setup to [`@gnee/android`](../android),
sharing 100% of UI/business code.

## Setup

```bash
cd gnee/apps/ios
cp env.example .env   # set EXPO_PUBLIC_ZUMA_GATEWAY_URL if not using localhost
npm install
npm run ios           # first run generates the native ios/ project via expo prebuild
```

Requires the zuma `graphql-gateway` (and the two REST services it composes)
running locally — see `zuma/README.md` and `./scripts/dev-up.sh --full`.

## Auth

The app reads a JWT from `expo-secure-store` under the key `zuma_jwt`. Until a
login screen is added, seed it manually for local testing, e.g. via a debug
menu action or `SecureStore.setItemAsync("zuma_jwt", token)`.

## Testing

```bash
npm run lint         # eslint .
npm run typecheck    # tsc --noEmit
npm test             # jest-expo unit tests (App.test.tsx)
```

E2E uses Detox and requires a real iOS Simulator build, so it won't run in a
headless/non-macOS environment:

```bash
npx expo prebuild --platform ios   # generates ./ios (git-ignored)
npm run e2e:build                  # xcodebuild, via .detoxrc.js
npm run e2e:test                   # runs e2e/*.e2e.js against the simulator
```

## Devcontainer

`.devcontainer/devcontainer.json` opens the whole `gnee/` workspace (needed
for the `@gnee/mobile-ui`/`@gnee/api-client` symlinked deps) in a Linux
Node 22 container — good for editing, linting, typechecking and `npm test`.
It cannot build or run the actual iOS app: `expo run:ios`/`xcodebuild`/the
Simulator all require macOS + Xcode, which no Linux container can provide.
Use it for the JS/TS side only; run `npm run ios` on macOS directly.

## Deploying

Docker, Docker Swarm and Kubernetes don't apply to a native iOS app — it ships
as a signed binary through App Store Connect, not a container. Deploy via EAS
Build/Submit instead:

```bash
../../scripts/deploy-mobile.sh ios production
```

Build profiles live in `eas.json` (`development`/`preview`/`production`).
Credentials (App Store Connect API key) are pulled from 1Password by the
script, written to a temp file for the duration of the run, then deleted —
see `scripts/deploy-mobile.sh`.
