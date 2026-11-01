# zuma Postman collection

An end-to-end API test suite for every zuma API. You can run it in the Postman app, or headless with newman in Docker. A full run creates its own data (wallets, a deposit, transactions) and passes the ids between requests through collection variables. It doesn't need any seed data.

| File | Purpose |
|---|---|
| `zuma.postman_collection.json` | The collection (Postman v2.1). **Generated**: don't edit it by hand |
| `build-collection.mjs` | Source of the collection and both environments. Edit this file, then regenerate |
| `zuma-local.postman_environment.json` | The **zhios stack** (root `docker-compose.yml` / Terraform): OIDC/JWKS auth through `mock-oidc` |
| `zuma-standalone-hs256.postman_environment.json` | **zuma on its own** (`zuma/docker-compose.yml` or `npm run dev`): HS256 auth |
| `reports/` | newman JUnit output (git-ignored) |
| `../../scripts/run-postman.sh` | Headless runner (newman in Docker) |
| `../../scripts/check-postman-coverage.mjs` | Offline validation and route-coverage check |

## What's covered

The collection has 180 requests and 432 request-level `pm.test` assertions. Every request also runs 2 collection-level checks: no 5xx, and response time under `maxResponseMs`. The folders run in order, and each depends on the ones before it, except `0` and `6`.

| Folder | Requests | Endpoints | Highlights |
|---|---|---|---|
| 0 Health | 17 | `GET /healthz`, `/readyz`, `/metrics` on all three services; `GET /docs`, `/docs/json` (REST); `GET /graphiql` | Probes aren't rate limited. `/metrics` returns 401 + `WWW-Authenticate: Bearer` without the token and Prometheus text with it. The OpenAPI document lists the routes |
| 1 Wallets | 26 | `POST/GET /api/v1/wallets`, `GET /api/v1/wallets/:id`, `PATCH …/:id/metadata`, `GET …/:id/balance`, `GET …/:id/transactions` | Creates the owner wallet and a second user's wallet. Pagination and the `limit`/`page` bounds. Owner scoping of `ownerUserId`. Negative cases: 401, 404 for non-owners (**not 403**: reads hide whether a wallet exists), 403 for privileged writes, 400 for an invalid ObjectId or body |
| 2 Admin | 13 | `POST /api/v1/admin/wallets/:id/deposits` | Deposits 100000 sats. A replay with the same `reference` gives the same balance. The same reference with a different amount gives 409 `IDEMPOTENCY_CONFLICT`. 403 for the owner and for the auditor, 401, 400 validation errors, 404 |
| 3 Transactions | 44 | `POST /api/v1/transactions`, `POST …/:id/validate`, `POST …/:id/broadcast`, `GET …/:id`, `GET …/:id/status`, `GET /api/v1/transactions` | Idempotency-Key happy path, replay (same id), and the same key with a different body (409 `IDEMPOTENCY_CONFLICT`). 400 for: missing or short key, `type: receive`, non-integer or zero sats, mainnet or bad-checksum or malformed address, feeRate 0 or 10001. 409 `INSUFFICIENT_FUNDS`, persisted as `failed`. 403 on another user's wallet. Then validate → broadcast (64-hex txid) → 409 on re-broadcast, status, list filters (`walletId`, `status`, `from`, `to`). Balance decreases by amount + `feeSats`. `rawTx` never appears in responses |
| 4 Internal service routes | 27 | `GET /internal/wallets/:id`, `POST …/:id/debits`, `POST …/:id/credits` | `x-service-token` minted like `service-auth.ts`. 401 for: no token, a user JWT, wrong audience, expired, `role ≠ service`. 403 for a wrong caller. Idempotent debit and refund replays. `IDEMPOTENCY_CONFLICT`, `INSUFFICIENT_FUNDS`, `REFUND_WITHOUT_DEBIT` (unknown id, wrong amount, other wallet), 400s |
| 5 GraphQL | 33 | `POST /graphql`: queries `wallet`, `wallets`, `transaction`, `transactions`; mutations `createWallet`, `updateWalletMetadata`, `createTransaction` | All enum values (`MAINNET/TESTNET/REGTEST`, `HOT/COLD/NON_CUSTODIAL`, `PENDING/FAILED/BROADCAST/CONFIRMED`, `SEND`). `createTransaction` with `idempotencyKey`: replay and conflict. `errors[0].extensions.code` for `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `BAD_USER_INPUT`, `IDEMPOTENCY_CONFLICT`, `INSUFFICIENT_FUNDS`. Depth limit, introspection on or off, and an invalid enum or syntax error each give 400 |
| 6 Security checks | 20 | All three services | CORS preflight: an allowed origin is echoed, with methods, headers and max-age; a disallowed origin gets no ACAO header; REST services have no browser origins at all. Helmet headers, `X-Powered-By` absent, CSP (optional). Rate-limit headers. 413 `PAYLOAD_TOO_LARGE` on each service, 400 for malformed JSON, 415 `UNSUPPORTED_MEDIA_TYPE`. User JWTs with a bad signature, `alg: none`, expired, wrong issuer, or no `sub` give 401. A service token used as a user token gives 401. Errors don't leak internals |

`node scripts/check-postman-coverage.mjs` (run from `zuma/`) proves the coverage claim offline. It parses every Fastify route from `services/*/src/api/routes/*.ts`, using the prefixes from `src/app.ts`, plus the shared health and metrics routes, `/docs`, `/graphql` and `/graphiql`. It also parses every `Query`/`Mutation` field from `graphql/src/schema/typedefs.ts`. It fails if any route or field has no request, if any request has no `pm.test`, if any script doesn't compile, if a `{{variable}}` is undefined, or if an environment ships a non-empty secret. Current result: **routes 31/31, GraphQL fields 7/7**.

## Auth modes

`shared/http/src/auth.ts` verifies user tokens **either** with the HS256 `JWT_SECRET` **or**, when `JWT_JWKS_URI` is set, with the asymmetric keys from the JWKS endpoint. Never both: once `JWT_JWKS_URI` is set, HS256 tokens are rejected. So the environment must match the stack:

| Stack | Verification | Environment | `authMode` |
|---|---|---|---|
| zhios (root `docker-compose.yml` + `deploy/compose/zuma.override.yml`, Terraform docker) | RS256 via `mock-oidc` JWKS, `iss=http://localhost:8090/zuma`, `aud=zuma-api` | `zuma-local` (default) | `oidc` |
| zuma alone (`zuma/docker-compose.yml`, `npm run dev`) | HS256 `JWT_SECRET`, `iss=zuma`, no audience | `zuma-standalone-hs256` | `hs256` |

The collection-level pre-request script runs before every request and sets these collection variables: `ownerToken`, `otherUserToken`, `adminToken` and `auditorToken`, plus the subjects they carry (`ownerUserId`, `otherUserId`, ...). Tests compare owners against those subjects.

- **`hs256`**: signs `{sub, roles, iss: jwtIssuer, aud: jwtAudience (only if set), iat, exp}` with CryptoJS HMAC-SHA256, using exactly what `auth.ts` checks: algorithm pinned to HS256, `allowedIss`, optional `allowedAud`, required `sub` and `exp`. Personas: `user-alice` (owner), `user-bob`, `user-admin` (`roles: ['admin']`), `user-auditor` (`roles: ['auditor']`). Override them with `ownerSub` and the other `*Sub` variables.
- **`oidc`**: sends a `client_credentials` POST to `oidcTokenUrl` with one scope per persona. The default scopes are `zuma-user`, `zuma-user-2`, `zuma-admin` and `zuma-auditor`. `deploy/mock-oidc/config.json` maps each scope to a `sub`, `roles` and `aud`. Tokens are cached until shortly before `exp`. The script decodes each token: a persona whose token lacks the expected roles is disabled, and its persona-specific tests are **skipped**, not failed. Today that applies to the auditor, because `config.json` has no `zuma-auditor` mapping. To enable it, add this mapping:

  ```json
  { "requestParam": "scope", "match": "zuma-auditor",
    "claims": { "sub": "postman-auditor", "aud": ["zuma-api"], "roles": ["auditor"] } }
  ```

  The dev IdP (`deploy/mock-oidc/server.mjs`) uses a fixed issuer, `http://localhost:8090/zuma`, whichever host name it is reached under (`localhost`, `host.docker.internal`, `mock-oidc`), so no Host override is needed. `oidcHostHeader` is kept for IdPs that derive `iss` from the Host header, and is harmless here. Personas come from `deploy/mock-oidc/config.json` (`clientCredentials.scopes`). An unknown scope is rejected with `invalid_scope`, never given a default persona.
- **Service tokens** for `/internal/*` are always minted locally, in both modes, exactly as `createServiceTokenSigner` does: an HS256 signature over base64url `header.payload` using `internalJwtSecret`, with claims `{sub: 'transaction-service', aud: 'wallet-service', role: 'service', iss: internalJwtIssuer, iat, exp: +60s}`, sent as `x-service-token`. Negative variants: wrong caller (`graphql-gateway`), wrong audience, expired, wrong role.
- **Negative user tokens** (bad signature, `alg: none`, expired, wrong issuer, no `sub`) are minted locally and are rejected in both modes.

The minting was checked offline against the real verifiers. HS256 user tokens pass `fast-jwt` with the `auth.ts` options, both with and without an audience. Service tokens pass `verifyServiceToken`. Every negative token is rejected for the intended reason.

## Run in the Postman app

1. **Import** `zuma.postman_collection.json` and the environment that matches your stack (see the auth-mode table above).
2. In the environment, put `jwtSecret`, `internalJwtSecret` and `metricsToken` in the **Current value** column only. Leave **Initial value** empty: initial values sync to the Postman cloud. Get the values from the root `.env` (see [Secrets](#secrets)). In `oidc` mode `jwtSecret` is optional.
3. Select the environment and open **Run collection**. Keep the folder order, and run all folders, or `0`–`5` in sequence. Folders `1`–`5` depend on the ids created earlier in the run.

Single requests also work once the earlier folders have populated the collection variables.

## Run headless (newman in Docker)

```zsh
make postman                                            # from the repo root: zhios stack, all folders
make postman ARGS="--folder '0 Health'"                 # one folder (repeat --folder to chain)
bash zuma/scripts/run-postman.sh --compose-network zhios_edge        # attach to the compose network
bash zuma/scripts/run-postman.sh --auth-mode hs256      # standalone zuma stack (secrets from zuma/.env)
```

| Flag | Default | Notes |
|---|---|---|
| `--env-file PATH` | `$ZHIOS_ENV_FILE` or `<repo>/.env` (`zuma/.env` with `--auth-mode hs256`) | Secrets are read without `source`-ing the file. Variables already set in the shell take precedence |
| `--no-env-file` | – | Use only the shell environment, e.g. under `op run` |
| `--environment PATH` | Chosen by auth mode | Any Postman environment JSON |
| `--folder NAME` | All folders | Repeatable; folders run in the order given |
| `--base-url URL` / `--wallet-url` / `--transaction-url` / `--gateway-url` | From the environment | `--base-url http://host` appends `:3001`, `:3002`, `:3003`, and `:IDP_PORT` for the IdP |
| `--network NAME` | `host` on Linux, `bridge` on macOS | Docker network for the newman container |
| `--compose-network NAME` | – | Uses service DNS names (`wallet-service:3001`, ..., `mock-oidc:8080`). For the zhios stack use `zhios_edge` |
| `--auth-mode hs256\|oidc` | From the environment | Also selects the default environment and env file |
| `--oidc-token-url`, `--oidc-host-header` | Derived | See [Auth modes](#auth-modes) |
| `--reporters LIST` | `cli,junit` | JUnit goes to `reports/newman-junit-<UTC stamp>.xml` |
| `--bail` | Off | Stop at the first failure |

The image is pinned to `postman/newman:6.2.1-alpine`; pinning by digest is still a TODO. Override it with `NEWMAN_IMAGE=...`. The script exits with newman's status: non-zero if any assertion fails.

**macOS (Docker Desktop):** `--network host` can't reach the Mac's loopback. Without flags, the runner therefore uses the `bridge` network with `host.docker.internal` base URLs, including `host.docker.internal:8090` for the IdP. If ports published on `127.0.0.1` aren't reachable that way, use `--compose-network zhios_edge`, which is the most reliable option on any OS.

**htmlextra:** the official newman image doesn't ship `newman-reporter-htmlextra`. Build an image that has it (`FROM postman/newman:6.2.1-alpine` + `npm i -g newman-reporter-htmlextra@<pinned>`). Then run with `NEWMAN_IMAGE=<that image> ... --reporters cli,junit,htmlextra`. The runner passes `--reporter-htmlextra-skipSensitiveData`.

## Secrets

The suite needs the secrets the stack itself uses. Nothing secret is committed: both environments ship `jwtSecret`, `internalJwtSecret` and `metricsToken` empty, and the checker enforces this.

- **zhios stack:** run `make secrets-local` (openssl) or `make secrets-op` (1Password). Either writes the git-ignored root `.env` (`JWT_SECRET`, `INTERNAL_JWT_SECRET`, `METRICS_TOKEN`). `make postman` reads the same file.
- **Standalone zuma:** `zuma/.env`, with the same keys.
- **1Password without a file:** `op run --env-file=<template with op:// refs> -- bash zuma/scripts/run-postman.sh --no-env-file`.

How the runner handles them:
- It prints only `set`/`MISSING` for each secret.
- It writes them into a `0600` Postman environment inside a `0700` temp directory. jq receives them through its environment, not argv. The file is mounted read-only into the container and deleted on exit.
- They never go on a command line, so they don't appear in `docker run` arguments or `ps`.
- The default reporters (`cli`, `junit`) don't record request headers. `json` and `htmlextra` reports can contain bearer tokens, so keep `reports/` git-ignored, which is the default.

## Data, re-runs and limits

- Each run creates new wallets and transactions. Old data stays in Mongo and never affects assertions.
- Rate limiting is `RATE_LIMIT_MAX=100` per minute, per JWT `sub` and per service. A full run stays under that for every persona. Two full runs within one minute can hit 429: wait a minute between runs, or raise `RATE_LIMIT_MAX` locally.
- `mockBitcoinNode=true` asserts the mock fee: `feeSats = feeRate × 141`. Set it to `false` against a real node.
- For production-like stacks, set `expectDocs=false`, `expectIntrospection=false` and `expectCsp=true`.

## Maintaining

```zsh
cd zuma
node docs/postman/build-collection.mjs        # regenerate the collection + both environments
node scripts/check-postman-coverage.mjs       # must print OK (routes x/x, GraphQL fields x/x)
```

When you add a route or a GraphQL field, the checker fails until a request covers it.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Every request fails with `ECONNREFUSED` while the stack is healthy | The Docker daemon is remote (`ssh://` context). `run-postman.sh --runner auto` (the default) then runs `npx newman` on this machine instead of in a container, because bind mounts can't reach a remote daemon. It reaches the stack through `make tunnel` on `localhost`, and `make postman` starts the tunnel for you. Force a runner with `--runner docker` or `--runner npx`. |
| Every authenticated request returns 401 | Wrong auth mode for the stack. Use `oidc` when `JWT_JWKS_URI` is set (the zhios stack), otherwise `hs256`. In `hs256` mode, check that `jwtSecret` matches the stack's `JWT_SECRET` and that `jwtIssuer`/`jwtAudience` match `JWT_ISSUER`/`JWT_AUDIENCE` |
| 401 in `oidc` mode only | The token's `iss` differs from `JWT_ISSUER`. Reach the IdP as `localhost:8090`, or set `oidcHostHeader=localhost:8090`. The console shows `OIDC token request failed` when the IdP itself is unreachable |
| All of `4 Internal service routes` return 401 | `internalJwtSecret` is empty, under 32 characters, or not the stack's `INTERNAL_JWT_SECRET` |
| `/metrics without token` fails with 401 ≠ 200 | The stack has `METRICS_TOKEN` set, but the run doesn't. Provide `metricsToken` |
| Auditor tests skipped | `oidc` mode without a `zuma-auditor` scope mapping (see [Auth modes](#auth-modes)) |
| 409 `NETWORK_MISMATCH` on create | transaction-service `BITCOIN_NETWORK` isn't `testnet`. The collection creates testnet wallets and uses a testnet destination (`tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx`, checked with the repo's own `isValidAddressForNetwork`) |
| 429 `RATE_LIMITED` | See [Data, re-runs and limits](#data-re-runs-and-limits) |
| Folder run fails on `{{walletId}}` | Folders `1`–`5` depend on earlier folders. Run them in order: `--folder '1 Wallets' --folder '2 Admin' ...` |
| `/readyz` returns 503 | A dependency isn't ready (Mongo, or the gateway's upstreams). Wait for `docker compose up --wait` |
