# Testing Strategy

## Testing pyramid

### Unit tests (majority)

- Target: `application/` use-cases.
- Framework: `jest` + `ts-jest` (see each service's `jest.config.js`).
- Approach: repository and HTTP client ports are mocked (hand-written or `jest.fn()`-based fakes); no Fastify instance, no MongoDB connection.
- Examples: `services/wallet-service/tests/create-wallet.use-case.test.ts`, `services/transaction-service/tests/create-transaction.use-case.test.ts`, `graphql/tests/wallet.resolvers.test.ts` (mocks `WalletServiceClient`).

### Integration tests

- Target: `infrastructure/persistence/*.repository.ts` adapters.
- Framework: `jest` + `mongodb-memory-server`, which downloads and runs a real `mongod` binary in-process.
- Examples: `services/wallet-service/tests/wallet.repository.test.ts`, `services/transaction-service/tests/transaction.repository.test.ts`.
- Validates actual Mongoose schema/query behavior against a real (ephemeral) MongoDB instance, rather than mocking the driver.

### End-to-end tests (recommended, not yet implemented)

Not present in the repo today. Recommended follow-up:

- Boot each service's `buildApp()` with `light-my-request` (Fastify's built-in injector, already a transitive dependency) or `supertest`, against an ephemeral `mongodb-memory-server` instance.
- Cover full HTTP round-trips through real routes, JSON-schema validation, and the JWT auth plugin — not just use-case logic.
- For the GraphQL gateway, add e2e coverage that boots the gateway plus lightweight stub HTTP servers for `wallet-service`/`transaction-service` (or runs against the real services via `docker compose`).

## CI behavior

CI (`.github/workflows/zuma-ci.yml`) runs `npm test --workspaces --if-present`, which executes **unit tests only** in this environment, because `mongodb-memory-server` needs to download a `mongod` binary on first use and the CI sandbox here has no outbound network access to fetch it — integration tests that depend on it will fail to start if invoked in this sandbox.

A real CI runner (e.g. GitHub Actions-hosted runner with network egress) would differ by:

- Allowing `mongodb-memory-server`'s binary download (or pre-caching the binary via `actions/cache` keyed on its version) so integration tests run as part of the same `npm test` step.
- Optionally running a real `mongo:7` service container (as in `docker-compose.yml`) and pointing integration/e2e tests at it via `MONGODB_URI`, instead of relying on the in-process memory server.
- Adding the recommended e2e test stage as a separate CI job that brings up the full stack (`docker compose up -d`) before running HTTP-level tests against live containers.
