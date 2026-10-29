# Zuma

Bitcoin wallet & transaction microservices platform — an npm-workspaces monorepo built with Fastify, Mongoose/MongoDB, and a GraphQL gateway, following Clean Architecture per service.

## Services

| Service | Port | Description |
|---|---|---|
| `wallet-service` | 3001 | Wallet CRUD, balance, transaction history (REST) |
| `transaction-service` | 3002 | Transaction creation, validation, broadcast, status (REST) |
| `graphql-gateway` | 3003 | GraphQL composition layer over both REST services |

See [docs/architecture.md](docs/architecture.md) for the full system diagram and layering rationale.

## Directory structure

```
zuma/
  docker-compose.yml
  package.json
  tsconfig.json / tsconfig.base.json
  graphql/                   # GraphQL gateway (Fastify + Mercurius)
    src/
      clients/                # HTTP clients to wallet-service / transaction-service
      config/
      resolvers/
      schema/
    tests/
  services/
    wallet-service/
      src/
        api/                  # routes, plugins (auth, health, swagger), schemas
        application/           # use-cases
        config/
        domain/                 # entities, value objects
        infrastructure/           # mongo persistence, HTTP/mock clients
      tests/
    transaction-service/        # same layering as wallet-service
  shared/
    common/                    # DTOs, error types, shared types
    config/                     # env schema + loader
    logging/                    # pino logger factory + redaction paths
    observability/              # OpenTelemetry plugin
  infrastructure/
    aws/terraform/              # Lambda + Secrets Manager/SSM-backed deployment
    docker/                      # per-service Dockerfiles (build context = repo root)
    kubernetes/                   # namespace, per-service Deployment/HPA/Service/Secret
  docs/
  scripts/
```

## Prerequisites

- Node.js >= 22
- Docker (for MongoDB and/or the full containerized stack)
- MongoDB, via `docker compose up -d mongo` (no local install needed)

## Running locally

Bring up MongoDB only, then run each service with hot-reload in its own terminal:

```bash
./scripts/dev-up.sh
npm run dev -w @zuma/wallet-service
npm run dev -w @zuma/transaction-service
npm run dev -w @zuma/graphql-gateway
```

Or bring up the entire stack in Docker:

```bash
./scripts/dev-up.sh --full
# equivalent to: docker compose up -d --build
```

Make scripts executable once after cloning:

```bash
chmod +x scripts/*.sh
```

## Running tests

```bash
./scripts/run-tests.sh
# equivalent to: npm install && npm test --workspaces --if-present
```

See [docs/testing-strategy.md](docs/testing-strategy.md) for what's covered (unit, integration) versus recommended follow-up (e2e), and why CI runs unit tests only in this environment. For manual/exploratory API testing, import the Postman collection and environment under [docs/postman/](docs/postman/).

## Documentation

- [docs/architecture.md](docs/architecture.md) — system diagram, service boundaries, Clean Architecture layering
- [docs/domain-model.md](docs/domain-model.md) — entities, value objects, aggregate boundaries
- [docs/api-spec.md](docs/api-spec.md) — REST endpoints and GraphQL schema with examples (live docs at `/docs` on each running service)
- [docs/testing-strategy.md](docs/testing-strategy.md) — testing pyramid and CI test behavior
- [docs/security.md](docs/security.md) — auth, secrets, key isolation, OWASP considerations, scalability recommendations

Use `scripts/generate-docs.sh` to snapshot each service's live OpenAPI JSON into `docs/openapi/` (services must be running first).

## Production deployment

- **Kubernetes**: manifests under [infrastructure/kubernetes](infrastructure/kubernetes) — per-service `Deployment`, `Service`, `HPA`, `ConfigMap`, `Secret`, plus a `MongoDB` `StatefulSet`, all under the `zuma` namespace.
- **AWS (Lambda + Terraform)**: [infrastructure/aws/terraform](infrastructure/aws/terraform) provisions a Lambda-based deployment path, reading `JWT_SECRET` from Secrets Manager and `MONGODB_URI` from SSM Parameter Store (SecureString) — see [docs/security.md](docs/security.md) for details.

## CI

`.github/workflows/zuma-ci.yml` (at the repo root, above `zuma/`) runs `install` → `lint` / `typecheck` / `test` → `build` → `docker-build` (matrix over the three Dockerfiles) on every push/PR to `main`.
