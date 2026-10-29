# @gnee/android

Android shell for the Zuma wallet app (Expo / React Native, TypeScript). All
screens, navigation and business logic live in
[`@gnee/mobile-ui`](../../packages/mobile-ui) and
[`@gnee/api-client`](../../packages/api-client) — this app only wires
Android-specific concerns (package name, secure token storage via
`expo-secure-store`, the `10.0.2.2` emulator loopback host). Identical setup
to [`@gnee/ios`](../ios), sharing 100% of UI/business code.

## Setup

```bash
cd gnee/apps/android
cp env.example .env   # 10.0.2.2 reaches host localhost from the Android emulator
npm install
npm run android        # first run generates the native android/ project via expo prebuild
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

E2E uses Detox and requires a real Android Emulator build, so it won't run
in a headless environment without one provisioned:

```bash
npx expo prebuild --platform android   # generates ./android (git-ignored)
npm run e2e:build                      # gradlew assembleDebug, via .detoxrc.js
npm run e2e:test                       # runs e2e/*.e2e.js against the emulator
```

## Devcontainer

`.devcontainer/devcontainer.json` opens the whole `gnee/` workspace (needed
for the `@gnee/mobile-ui`/`@gnee/api-client` symlinked deps) in a Node 22
container with the Android SDK/build-tools and JDK 17 installed via devcontainer
features, so `expo prebuild --platform android` + `./gradlew assembleDebug`
work inside it. There's no emulator (no KVM in a generic container) — pair it
with a physical device over `adb` reverse-tethering, or build APKs here and
test them elsewhere.

## Deploying

Docker, Docker Swarm and Kubernetes don't apply to a native Android app — it
ships as a signed AAB through Google Play, not a container. Deploy via EAS
Build/Submit instead:

```bash
../../scripts/deploy-mobile.sh android production
```

Build profiles live in `eas.json` (`development`/`preview`/`production`).
The Google Play service account JSON is pulled from 1Password by the script,
written to `google-service-account.json` for the duration of the run, then
deleted — see `scripts/deploy-mobile.sh`.
