# Security

## Authentication
- Bearer JWTs validated with `jose` against Okta's JWKS (`OKTA_JWKS_URI`, default `${OKTA_ISSUER_BASE_URL}/v1/keys`): RS256 only, `iss` and `aud` enforced, 5 s clock tolerance. JWKS fetch failures return 401 without leaking details.
- There is no auth bypass flag. Tests inject a fake `TokenVerifier`.

## Authorization
- Users access only their own data (`user.externalId === token.sub`); `groups` containing `ADMIN_GROUP` grants access to all users. Mismatched `userId`/`accountId` pairs return 404.

## Secrets and configuration
- All configuration comes from environment variables validated by zod at startup. `.env` is git-ignored; compose requires `POSTGRES_PASSWORD`, `OKTA_*` with `:?` so the stack fails fast when unset. Inject with `op run --env-file=.env -- ...`.
- `authorization` and `x-service-token` headers are redacted from logs.

## Service-to-service (zuma)
- Outbound calls send a 60 s HS256 `x-service-token` (aud = `WALLET_SERVICE_NAME`, role `service`) signed with `INTERNAL_JWT_SECRET` (>= 32 chars, shared with zuma), and forward the caller's bearer token so zuma applies its own ownership checks. Note: zuma validates user tokens against its own `JWT_SECRET` or OIDC config; configure zuma's OIDC/JWKS to accept the Okta issuer or the forwarded token will be rejected (surfaces as 502).

## Hardening notes
- Container runs as non-root `node`; PostgreSQL and Redis are published on 127.0.0.1 only. Redis has no auth in the local compose; require auth/TLS (`rediss://`) outside local dev.
- Not yet implemented: rate limiting, helmet/CORS, TLS termination (assumed at the ingress), Redis ACLs. Add `@fastify/rate-limit` and `@fastify/helmet` before exposing publicly.
- Prisma queries are parameterised; no raw SQL beyond the readiness `SELECT 1`.
