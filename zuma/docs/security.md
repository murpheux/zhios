# Security

## Authentication

- Each service registers `@fastify/jwt` via its own `api/plugins/auth.ts`, configured with `JWT_SECRET` and `JWT_ISSUER` (`verify: { allowedIss: jwtIssuer }`).
- Routes opt in via the `requireAuth` preHandler hook (`app.addHook('preHandler', app.requireAuth)` in `wallet.routes.ts` / `transaction.routes.ts`), which calls `request.jwtVerify()` and throws `UnauthorizedError` on failure.
- A `requireRole(role)` decorator is also available for coarse role-based checks against `request.user.roles`.
- `request.user.sub` is used as the actor id for audit purposes (e.g. `createTransactionUseCase.execute({ ...body, actorUserId })`, `broadcastTransactionUseCase.execute(id, request.user.sub)`).

### OIDC / JWKS path (implemented, opt-in)

By default each service still validates a shared-secret HS256 JWT (`JWT_SECRET` + `JWT_ISSUER`). Setting `JWT_JWKS_URI` (plus optionally `JWT_AUDIENCE`) switches `requireAuth` to RS256 verification against an external OIDC provider's JWKS endpoint instead:

- `auth.ts` passes an async `secret` callback to `@fastify/jwt` that resolves the signing key by the token's `kid` header via `jwks-rsa` (`jwksClient({ jwksUri, cache: true, rateLimit: true })`), so provider key rotation never requires a redeploy.
- When `JWT_AUDIENCE` is set alongside `JWT_JWKS_URI`, `verify.allowedAud` is enforced too.
- `JWT_SECRET` stays required by `shared/config`'s schema even when unused in this mode — set it to any valid placeholder in that deployment's env file.
- The IdP must still issue tokens shaped like `{ sub, roles? }` (see `JwtPayload` in `auth.ts`), since use-cases consume `request.user.sub`/`.roles` unchanged — this is the gnee web SPA's job when it runs its OIDC Authorization Code + PKCE flow (see `gnee/apps/web/spa/README.md`).
- This is per-service config; `wallet-service` and `transaction-service` can point at the same or different JWKS endpoints as long as both trust the tokens gnee's clients send.

## Secrets handling

- Local dev: secrets come from `.env` files populated from each service's `.env.example` (`JWT_SECRET`, `MONGODB_URI`, etc.) — never committed.
- `docker-compose.yml` uses an explicit placeholder (`CHANGE_ME_32_CHAR_MINIMUM_PLACEHOLDER_SECRET`) with a comment to inject the real value via an env file or secret manager, never commit it.
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
- **A05 Security misconfiguration**: Dockerfiles run services as the non-root `node` user; k8s manifests should set `runAsNonRoot`/`readOnlyRootFilesystem` alongside the existing `secret.yaml` for env injection.
- **A06 Vulnerable/outdated components**: recommend adding `npm audit` / Dependabot / `govulncheck`-equivalent dependency scanning to CI as a follow-up.
- **A04 Rate limiting**: not currently implemented; recommend `@fastify/rate-limit` on public-facing routes (especially `/wallets`, `/transactions` creation endpoints) before internet exposure.
- **A09 Logging/monitoring**: OpenTelemetry tracing/metrics are already wired via `@zuma/shared-observability`'s `observabilityPlugin` in every service.

## Scalability and operational recommendations

- **HPA**: already configured per service (`infrastructure/kubernetes/*/hpa.yaml`), scaling on CPU utilization (target 70%, 2–10 replicas for wallet-service).
- **MongoDB read replicas**: recommend a replica set with read preference `secondaryPreferred` for read-heavy endpoints (`GET /wallets`, `GET /transactions`) once load warrants it; the current `docker-compose.yml`/k8s `mongodb/statefulset.yaml` run a single instance suitable for dev only.
- **Circuit breakers**: cross-service HTTP calls (`wallet-service` → `transaction-service`, `transaction-service` → `wallet-service`, `graphql-gateway` → both) are currently plain `fetch` calls with no retry/circuit-breaker policy; recommend adding one (e.g. `opossum`) to avoid cascading failures if a downstream service degrades.
- **Distributed tracing**: already wired end-to-end via OpenTelemetry in all three services, exporting to `OTEL_EXPORTER_OTLP_ENDPOINT`; pair with a real collector (e.g. `otel-collector` + Jaeger/Tempo) in production, since no collector service is bundled in the local `docker-compose.yml`.
