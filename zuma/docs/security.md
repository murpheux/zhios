# Security

## Authentication

All HTTP security plumbing lives in `@zuma/shared-http` (`shared/http/src`) and is registered by each service's `api/plugins/platform.ts` (`registerPlatformPlugins`) and by the gateway's `app.ts`.

### User tokens (`authPlugin`, `requireAuth` / `requireRole`)

- Routes opt in with the `requireAuth` preHandler, which calls `request.jwtVerify()` and throws `UnauthorizedError` (401) on failure; `requireRole(role)` adds coarse role checks against `request.user.roles`.
- Algorithms are always pinned — a token never chooses how it is verified:
  - **HS256 (default):** `JWT_SECRET`, `algorithms: ['HS256']`, `allowedIss: JWT_ISSUER` (and `allowedAud` if `JWT_AUDIENCE` is set).
  - **OIDC / JWKS (`JWT_JWKS_URI` set):** keys resolved by `kid` via `jwks-rsa` (cached, rate-limited), `algorithms: JWT_ALGORITHMS` (default `RS256`; asymmetric algorithms only), `allowedIss: JWT_ISSUER`, `allowedAud: JWT_AUDIENCE`. **`JWT_AUDIENCE` is mandatory** in this mode — config validation fails without it.
- `sub` and `exp` claims are required. Tokens must be shaped `{ sub, roles?, exp, iss[, aud] }`.
- `JWT_SECRET` stays required by `shared/config` even in JWKS mode — set any valid placeholder there.

### Service-to-service tokens (`serviceAuthPlugin`, `requireService`)

Internal calls (`wallet-service` ↔ `transaction-service`) carry an `x-service-token` header:

- Short-lived (default 60s, max 300s) HS256 JWT `{ sub: <caller SERVICE_NAME>, aud: <callee SERVICE_NAME>, role: 'service', iss: INTERNAL_JWT_ISSUER, iat, exp }`, minted per request by `createServiceTokenSigner({ secret, issuer, serviceName }).sign(audience)`.
- Signed with `INTERNAL_JWT_SECRET` (≥ 32 chars, must differ from `JWT_SECRET`), so a leaked user-token secret cannot forge service calls and vice versa.
- `app.requireService` verifies signature (constant-time), `alg === HS256`, issuer, `aud === SERVICE_NAME`, `role === 'service'` and expiry (5s skew), then sets `request.serviceCaller`; anything else → 401. `allowServiceCallers(...names)` then 403s callers not on the route's allow-list.
- Internal routes must additionally stay off the public ingress (defence in depth).

## HTTP hardening (`securityPlugin`, `buildServerOptions`)

- **Helmet** security headers on every response (CSP is relaxed only while Swagger UI / GraphiQL are served, i.e. outside production unless `DOCS_ENABLED=true`).
- **CORS:** only exact origins in `CORS_ALLOWED_ORIGINS` (comma list; default none = no cross-origin access). `'*'` is rejected when `CORS_ALLOW_CREDENTIALS=true`. The gateway's CORS is what lets the browser SPA on another origin call `/graphql`.
- **Rate limiting:** `RATE_LIMIT_MAX` per `RATE_LIMIT_WINDOW` (default 100 / 1 minute), keyed by verified JWT `sub`, else by verified service caller (`RATE_LIMIT_SERVICE_MAX`, default 1000), else client IP. `/healthz` and `/readyz` are exempt. Set `TRUST_PROXY=true` behind a load balancer so the client IP is correct. Limits are per-replica (in-memory store).
- **Request limits:** `bodyLimit` 64 KB (`HTTP_BODY_LIMIT_BYTES`), `connectionTimeout` 10s, `requestTimeout` 30s.
- **Errors:** the shared `errorHandler` returns `{ statusCode, code, message }`; domain errors keep their code (`ConflictError` codes such as `INSUFFICIENT_FUNDS`, `WALLET_NOT_ACTIVE`, `IDEMPOTENCY_CONFLICT` → 409; `ValidationError` → 400), 4xx framework errors (413, 415, 429 `RATE_LIMITED`) pass through, and every 5xx becomes an opaque `INTERNAL_ERROR` (logged server-side, never echoed).
- **Production defaults:** `/docs` is disabled unless `DOCS_ENABLED=true`; `/metrics` is only exposed when `METRICS_TOKEN` is set and then requires `Authorization: Bearer <METRICS_TOKEN>` (any environment with a token set enforces it). GraphQL introspection is off and GraphiQL is not served.

## Secrets handling

- Local dev: secrets come from `.env` files populated from each service's `.env.example` (`JWT_SECRET`, `MONGODB_URI`, etc.) — never committed.
- `docker-compose.yml` uses an explicit placeholder (`CHANGE_ME_32_CHAR_MINIMUM_PLACEHOLDER_SECRET`) with a comment to inject the real value via an env file or secret manager, never commit it.
- `INTERNAL_JWT_SECRET` (service-to-service) and `METRICS_TOKEN` are secrets too — inject them the same way; the wallet-service Lambda handler resolves `INTERNAL_JWT_SECRET` from Secrets Manager when `INTERNAL_JWT_SECRET_ARN` is set.
- AWS (`infrastructure/aws/terraform/main.tf`, `lambda.tf`): the Lambda deployment reads `JWT_SECRET` from **Secrets Manager** (`data.aws_secretsmanager_secret.jwt_secret`) and `MONGODB_URI` from **SSM Parameter Store** (`data.aws_ssm_parameter.mongo_uri`, a `SecureString`), with IAM policy statements scoped to `secretsmanager:GetSecretValue` / `ssm:GetParameter` on those specific ARNs only — not committed plaintext values.

## Private-key / signing isolation

- `transaction-service` currently uses `MockBitcoinNodeClient` (`src/infrastructure/clients/mock-bitcoin-node.client.ts`) to simulate broadcast/signing; `wallet-service` uses `MockAddressGenerator` to simulate address derivation.
- These are intentionally isolated behind ports (ns `application/` use-cases depend on interfaces, not concrete clients), so production hardening is a pure infrastructure swap: replace the mock clients with adapters that call an HSM, KMS-backed signer, or a dedicated signing microservice — no change needed to `domain/` or `application/` layers.
- Never let raw private keys, seeds or mnemonics enter application memory/logs in the new adapters — see log redaction below.

## Log redaction

`@zuma/shared-logging`'s `redaction-paths.ts` is wired into every service's Pino logger and redacts, among others:

```
req.headers.authorization, *.password, *.privateKey, *.private_key,
*.seed, *.mnemonic, *.secret, *.jwtSecret, *.rawTx, *.token, *.apiKey
```

`*.rawTx` (the raw signed transaction hex) is explicitly redacted, consistent with treating signed transaction material as sensitive.

## OWASP Top 10 considerations

- **A03 Injection / input validation**: every route schema (`createWalletSchema`, `createTransactionSchema`, etc.) is a Fastify JSON schema, validated before the handler runs; failures return `400 VALIDATION_ERROR` via the shared error handler in `app.ts`.
- **A01 Broken access control**: `requireAuth` gates all wallet/transaction routes; `requireRole` is available for role-gated actions. Recommend adding ownership checks (e.g. wallet belongs to `request.user.sub`) where not already enforced by the use-case.
- **A05 Security misconfiguration**: helmet headers, explicit CORS allow-list, production-off docs/introspection and token-gated metrics (see above); Dockerfiles run services as the non-root `node` user; k8s manifests should set `runAsNonRoot`/`readOnlyRootFilesystem` alongside the existing `secret.yaml` for env injection.
- **A06 Vulnerable/outdated components**: recommend adding `npm audit` / Dependabot / `govulncheck`-equivalent dependency scanning to CI as a follow-up.
- **A04 Rate limiting**: `@fastify/rate-limit` is global on every service and the gateway (see HTTP hardening); for multi-replica deployments back it with a shared store (Redis) so limits are cluster-wide.
- **A09 Logging/monitoring**: OpenTelemetry tracing/metrics are already wired via `@zuma/shared-observability`'s `observabilityPlugin` in every service.

## Scalability and operational recommendations

- **HPA**: already configured per service (`infrastructure/kubernetes/*/hpa.yaml`), scaling on CPU utilization (target 70%, 2–10 replicas for wallet-service).
- **MongoDB read replicas**: recommend a replica set with read preference `secondaryPreferred` for read-heavy endpoints (`GET /wallets`, `GET /transactions`) once load warrants it; the current `docker-compose.yml`/k8s `mongodb/statefulset.yaml` run a single instance suitable for dev only.
- **Circuit breakers**: cross-service HTTP calls (`wallet-service` → `transaction-service`, `transaction-service` → `wallet-service`, `graphql-gateway` → both) are currently plain `fetch` calls with no retry/circuit-breaker policy; recommend adding one (e.g. `opossum`) to avoid cascading failures if a downstream service degrades.
- **Distributed tracing**: already wired end-to-end via OpenTelemetry in all three services, exporting to `OTEL_EXPORTER_OTLP_ENDPOINT`; pair with a real collector (e.g. `otel-collector` + Jaeger/Tempo) in production, since no collector service is bundled in the local `docker-compose.yml`.
