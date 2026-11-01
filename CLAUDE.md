# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

This is a thin wrapper repo: the actual project lives in `zuma/`. All commands below run with `zuma/` as the working directory (CI uses `defaults.run.working-directory: zuma` in `.github/workflows/zuma-ci.yml`, which lives at the repo root, not inside `zuma/`).

`zuma` is an npm-workspaces monorepo implementing a Bitcoin wallet & transaction platform: Fastify services, Mongoose/MongoDB, a GraphQL gateway, Clean Architecture per service. Workspaces: `shared/*`, `services/*`, `graphql`.

## Commands

All run from `zuma/`:

```bash
npm ci                                    # install (CI does this; use npm install locally after editing package.json)
npm run build                             # tsc -b across all workspaces (project references)
npm run typecheck                         # same as build, for type checking only
npm run lint                              # biome lint . (biome.json; formatter disabled for now)
npm test                                  # build, then `npm test --workspaces --if-present`
npm test --workspaces --if-present        # run every workspace's jest suite (jest maps @zuma/shared-* to src, so no build needed)
```

Run a single workspace's tests or a single file (jest, from `zuma/`):

```bash
npm test -w @zuma/wallet-service
npm test -w @zuma/wallet-service -- create-wallet.use-case.test.ts
npm test -w @zuma/transaction-service -- transaction.repository.test.ts
npm test -w @zuma/graphql-gateway -- wallet.resolvers.test.ts
```

Local dev:

```bash
chmod +x scripts/*.sh        # once, after cloning
./scripts/dev-up.sh          # MongoDB only, via docker compose
./scripts/dev-up.sh --full   # entire stack in Docker (docker compose up -d --build)
npm run dev -w @zuma/wallet-service
npm run dev -w @zuma/transaction-service
npm run dev -w @zuma/graphql-gateway
./scripts/run-tests.sh       # npm install && npm test --workspaces --if-present
./scripts/generate-docs.sh   # snapshots each running service's OpenAPI JSON into docs/openapi/ (services must be up)
```

Integration tests use `mongodb-memory-server`, which downloads a real `mongod` binary on first use. CI here runs unit tests only — no outbound network access to fetch that binary — so `npm test --workspaces --if-present` in CI exercises `application/` use-case tests but not the `infrastructure/persistence/*.repository.test.ts` integration tests. Locally (with network access), the same command runs both.

## Architecture

Three deployables, each independently built/scaled/dockerized:

| Service | Port | Role |
|---|---|---|
| `services/wallet-service` | 3001 | Wallet CRUD, balance, transaction history (REST) |
| `services/transaction-service` | 3002 | Transaction creation, validation, broadcast, status (REST) |
| `graphql` (`graphql-gateway`) | 3003 | GraphQL composition layer over both REST services (Fastify + Mercurius); no direct MongoDB access |

Cross-service calls (not just gateway fan-out): `wallet-service` calls `transaction-service` directly (`TRANSACTION_SERVICE_URL`) to serve `GET /wallets/:id/transactions`; `transaction-service` calls `wallet-service` (`WALLET_SERVICE_URL`) to check ownership/status and debit or refund wallets through service-only `/internal/wallets/:id/{debits,credits}` routes, authenticated by a short-lived `x-service-token` signed with `INTERNAL_JWT_SECRET` (never the user's token). Both REST APIs and the GraphQL gateway are valid client entry points and share the same use-cases.

### Clean Architecture layering (per service, under `src/`)

```
api/            Fastify plugins, routes, JSON-schema request/response validation   → depends on application/
application/    Use-cases (one class per operation), orchestrate domain + ports    → depends on domain/
domain/         Entities and value objects — plain TypeScript, no framework/DB      → depends on nothing
infrastructure/ Adapters: Mongoose repositories, HTTP clients, mock chain clients  → implements domain/application ports
```

`app.ts` is the composition root: it wires concrete `infrastructure/` adapters into `application/` use-cases, which are injected into `api/routes/*.routes.ts`. When adding a feature, add/modify a use-case in `application/use-cases/`, define any new port interface in `application/ports/`, implement it in `infrastructure/`, and wire it in `app.ts` — don't reach into `infrastructure/` directly from `api/`.

`domain/` must stay framework- and DB-free (no Mongoose, no Fastify) — that boundary is what makes use-cases unit-testable without Mongo or HTTP, and infrastructure swappable (e.g. `MockBitcoinNodeClient`, `MockAddressGenerator` stand in for a real node/HSM signer with no change above `infrastructure/`).

### Shared workspaces (`shared/*`)

- `shared/common` — DTOs, error types, shared types
- `shared/config` — `baseEnvSchema` (zod) in `env-schema.ts` with fields common to every service (`NODE_ENV`, `PORT`, `LOG_LEVEL`, `MONGODB_URI`, `JWT_SECRET`, `JWT_ISSUER`, `INTERNAL_JWT_SECRET`, CORS/rate-limit/timeout settings, `OTEL_EXPORTER_OTLP_ENDPOINT`, `METRICS_ENABLED`); each service extends this with its own schema in `src/config/<service>-config.ts`. Full env table: `infrastructure/README.md`
- `shared/http` — Fastify plugins every service registers: auth (HS256 + OIDC/JWKS), `/healthz` + `/readyz`, security (helmet, CORS allowlist, rate limiting), service-to-service tokens (`requireService`, `allowServiceCallers`), error mapping, graceful shutdown
- `shared/logging` — pino logger factory + redaction paths
- `shared/observability` — OpenTelemetry Fastify plugin (`observabilityPlugin`), registered by every service; exports traces/metrics via OTLP — no collector is bundled in `docker-compose.yml`, so exporter calls fail silently with none present (safe for local dev)

### Money invariants

Amounts and balances are integer satoshis everywhere (strings on the wire, validated against `SATS_AMOUNT_PATTERN`). `wallet-service` owns balances via an idempotent ledger with guarded atomic debits; `POST /transactions` requires an `Idempotency-Key`, accepts `send` only, and enforces strict ownership on every write (admin/auditor are read-only). Lifecycle: `pending → broadcasting → broadcast → confirmed | failed` (failed sends are refunded). See `docs/domain-model.md`.

### Testing pyramid

- **Unit** (majority): `application/` use-cases, with repository/client ports mocked — no Fastify, no Mongo. `jest` + `ts-jest`.
- **Integration**: `infrastructure/persistence/*.repository.ts` adapters against `mongodb-memory-server` (real in-process `mongod`), no HTTP layer involved.
- **E2E**: not yet implemented (see `docs/testing-strategy.md` for the recommended approach using `light-my-request`/`supertest`).

### Infrastructure (`infrastructure/`)

- `docker/*.Dockerfile` — one per service, build context is `zuma/` (repo root for Docker purposes)
- `kubernetes/<service>/` — `Deployment`, `Service`, `HPA`, `ConfigMap`, `Secret` per service, plus a MongoDB `StatefulSet`, all under the `zuma` namespace
- `aws/terraform/` — Lambda-based deployment path; reads `JWT_SECRET` from Secrets Manager and `MONGODB_URI` from SSM Parameter Store (SecureString) — see `docs/security.md`

### CI (`.github/workflows/zuma-ci.yml`)

`lint` / `typecheck` / `test` → `build` → `docker-build` (matrix over the three Dockerfiles, Trivy-scanned) → `security`. All jobs set `working-directory: zuma`.

## Docs

- `zuma/docs/architecture.md` — system diagram (mermaid) and layering rationale
- `zuma/docs/domain-model.md` — entities, value objects, aggregate boundaries
- `zuma/docs/api-spec.md` — REST endpoints and GraphQL schema (live docs at `/docs` on each running service)
- `zuma/docs/testing-strategy.md` — testing pyramid detail and why CI skips Mongo integration tests
- `zuma/docs/security.md` — auth, secrets, key isolation, OWASP considerations
- `zuma/docs/postman/` — Postman collection + environment for manual/exploratory API testing
