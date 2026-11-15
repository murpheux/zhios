# Zinga Architecture

Zinga is the next-generation wallet and immutable ledger service for Zhios, built with PostgreSQL and emphasizing data integrity, auditability, and ACID compliance.

## Service Overview

**Zinga** is a single Fastify microservice that manages wallets and maintains an immutable transaction ledger. It differs from the legacy Zuma services in database technology, immutability enforcement, and ledger verification capabilities.

| Aspect | Zuma | Zinga |
|--------|------|-------|
| **Language** | Node.js/TypeScript | Node.js/TypeScript |
| **HTTP Framework** | Fastify | Fastify |
| **Primary Database** | MongoDB | PostgreSQL |
| **Ledger Type** | Transaction log in collection | Immutable append-only table |
| **Immutability** | Logical (document design) | Structural (no UPDATE/DELETE) |
| **Integrity** | Atomic transactions | ACID + hash chain |
| **Audit Trail** | Application-level timestamps | Database-level history |
| **Use Case** | Original wallet/transaction split | Emerging: unified wallet + ledger |

## Ports & Databases

### Network Ports
- **:3000** — REST API (wallet operations, balance, ledger)
- **:3001** — (reserved; used by Zuma wallet-service in shared environments)
- **:5432** — PostgreSQL (internal, not public)

### Configuration via Environment
See `src/config/zinga-config.ts` for all required variables:

| Variable | Example | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | HTTP listen port |
| `DATABASE_URL` | `postgresql://user:pwd@localhost:5432/zinga` | PostgreSQL connection string |
| `JWT_SECRET` | 32+ random chars | HS256 secret for internal service tokens |
| `JWT_ISSUER` | `zinga-internal` | Token issuer claim |
| `NODE_ENV` | `development` | Environment (dev/staging/production) |
| `LOG_LEVEL` | `debug` \| `info` \| `warn` | Pino logger level |
| `METRICS_ENABLED` | `true` | Export Prometheus metrics on `/metrics` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4317` | OpenTelemetry collector (optional) |

## Clean Architecture Layers

### api/ — HTTP Boundary
Fastify plugins, routes, and request/response validation.

**Files:**
- `plugins/platform.ts` — Shared plugins: auth, security, metrics, health probes, error handler
- `plugins/observability.ts` — OpenTelemetry instrumentation
- `routes/wallet.routes.ts` — Public wallet endpoints (GET, POST)
- `routes/internal-wallet.routes.ts` — Service-to-service routes (authenticated via x-service-token)

**JSON Schema Validation:**
- Request bodies validated against JSON schemas
- Response bodies have corresponding schemas
- Errors mapped to HTTP status codes (400 for validation, 401 for auth, 500 for infrastructure)

### application/ — Business Logic
Use-cases, services, and port abstractions.

**Use-cases (one per operation):**
- `CreateWalletUseCase` — Initialize a wallet with address
- `GetWalletUseCase` — Retrieve a wallet by ID
- `ListWalletsUseCase` — Paginated list (filtered by owner)
- `GetWalletBalanceUseCase` — Current balance (computed from ledger)
- `GetWalletTransactionHistoryUseCase` — Transactions affecting this wallet
- `UpdateWalletMetadataUseCase` — Rename, update custom fields
- `DebitWalletUseCase` — Service-internal: reduce balance (for sends)
- `RefundWalletUseCase` — Service-internal: restore balance (failed sends)
- `DepositToWalletUseCase` — Receive funds (funding flow)

**Ports (abstract interfaces):**
- `WalletRepositoryPort` — CRUD and balance movement
- `LedgerRepositoryPort` — Insert ledger entries, query balance
- `AddressGeneratorPort` — Generate addresses (mock or HSM-backed)
- `TransactionHistoryClientPort` — Query historical transactions
- `Logger` — Logging interface

**Services (domain-level):**
- `LedgerMovementService` — Coordinates wallet balance changes and ledger entries
  - Ensures atomicity: wallet balance change + ledger entry insert
  - Guards against overdrafts
  - Enforces idempotency via movementId

### domain/ — Business Rules (Framework-Free)
Entities and value objects: no Fastify, no database code.

**Entities:**
- `WalletEntity` — Aggregate root
  - `id: string` (UUID)
  - `label: string` (user-friendly name)
  - `address: string` (Bitcoin address)
  - `network: WalletNetwork` ('mainnet' | 'testnet')
  - `type: WalletType` ('hot' | 'cold' | 'multisig')
  - `balanceSats: number` (current balance in satoshis)
  - `ownerUserId: string` (who owns this wallet)
  - `status: WalletStatus` ('active' | 'suspended' | 'closed')
  - `metadata: Record<string, unknown>` (custom fields)
  - `createdAt: Date`, `updatedAt: Date`

- `LedgerEntryEntity` — Immutable append-only entry
  - `id: number` (auto-incrementing)
  - `walletId: string` (which wallet)
  - `transactionId: string` (external tx ID)
  - `kind: 'debit' | 'credit'`
  - `reason: string` ('send', 'receive', 'refund', 'adjustment')
  - `amountSats: number` (positive)
  - `balanceAfterSats: number` (running total)
  - `hash: string` (SHA-256 of entry + previous hash)
  - `previousHash: string` (chain link)
  - `digitalSignature: string` (optional, for critical entries)
  - `verifiedAt: Date` (when signature was validated)
  - `createdAt: Date` (immutable timestamp)

**Value Objects:**
- `WalletNetwork` — 'mainnet' | 'testnet' (enum-like)
- `WalletType` — 'hot' | 'cold' | 'multisig' (enum-like)
- `WalletStatus` — 'active' | 'suspended' | 'closed' (enum-like)

### infrastructure/ — Adapters
Concrete implementations of ports: database, HTTP clients, config loaders.

**persistence/:**
- `postgres-connection.ts` — Connection pool management
  - `createConnectionPool(databaseUrl)` → Pool
  - `releasePool(pool)` → clean shutdown
  - `queryWithTimeout(pool, sql, values, timeoutMs)` → safe queries

- `postgres-wallet.repository.ts` — WalletRepositoryPort for PostgreSQL
  - Maps row → WalletEntity
  - Implements atomic balance movements
  - Guards against overdrafts and concurrent conflicts

- `postgres-ledger.repository.ts` — LedgerRepositoryPort for PostgreSQL
  - Inserts ledger entries
  - Enforces UNIQUE(transactionId, kind, reason) for idempotency
  - Detects duplicate entries and returns existing one
  - Calculates running balance and validates no gaps

**clients/:**
- `mock-address-generator.ts` — AddressGeneratorPort (generates fake addresses for testing)
- `transaction-history.client.ts` — TransactionHistoryClientPort (HTTP client to other services)

**config/:**
- `zinga-config.ts` — Loads and validates environment variables with Zod schema
- `wallet-service-config.ts` — Service-specific schema

## PostgreSQL Schema

### Wallets Table
```sql
CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label VARCHAR(255) NOT NULL,
  address VARCHAR(255) NOT NULL UNIQUE,
  network ENUM_NETWORK NOT NULL,
  type ENUM_TYPE NOT NULL,
  balance_sats BIGINT NOT NULL DEFAULT 0,
  status ENUM_STATUS NOT NULL DEFAULT 'active',
  metadata JSONB,
  owner_user_id VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT balance_non_negative CHECK (balance_sats >= 0)
);

CREATE INDEX idx_wallets_owner ON wallets(owner_user_id);
CREATE INDEX idx_wallets_address ON wallets(address);
```

### Ledger Entries Table (Immutable)
```sql
CREATE TABLE ledger_entries (
  id SERIAL PRIMARY KEY,
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  transaction_id VARCHAR(255) NOT NULL,
  kind ENUM_LEDGER_KIND NOT NULL,
  reason VARCHAR(50) NOT NULL,
  amount_sats BIGINT NOT NULL,
  balance_after_sats BIGINT NOT NULL,
  state VARCHAR(50),
  hash VARCHAR(64) UNIQUE,
  previous_hash VARCHAR(64),
  digital_signature VARCHAR(512),
  verified_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(wallet_id, transaction_id, kind, reason),
  CONSTRAINT amount_positive CHECK (amount_sats > 0)
);

CREATE INDEX idx_ledger_wallet ON ledger_entries(wallet_id);
CREATE INDEX idx_ledger_transaction ON ledger_entries(transaction_id);
CREATE INDEX idx_ledger_hash ON ledger_entries(hash);
```

### Key Constraints
1. **Immutability:** No UPDATE or DELETE triggers; application code never modifies entries
2. **Atomicity:** Wallet balance updates and ledger inserts in same transaction
3. **Idempotency:** UNIQUE(transaction_id, kind, reason) prevents duplicate entries
4. **Referential integrity:** wallet_id → wallets.id (cascade deletes disabled)
5. **Balance safety:** CHECK balance_sats >= 0 on wallets table
6. **Amount validity:** CHECK amount_sats > 0 on ledger_entries table

## Immutability & Verification

### Hash Chain
Each ledger entry includes:
- **hash** — SHA-256(entry_id + wallet_id + transaction_id + kind + amount + balance_after + previous_hash)
- **previous_hash** — hash of the previous entry for this wallet

This chain makes it trivial to detect tampering: compute expected hash and compare.

### Digital Signatures (Optional)
Critical entries (large debits, external transfers) can include:
- **digital_signature** — ECDSA or EdDSA signature of entry content
- **verified_at** — when the signature was last validated
- Application can verify against HSM-backed public keys

### Verification Service
A background job (future) can:
1. Replay all ledger entries for a wallet
2. Recompute expected balance
3. Compare with current wallet.balance_sats
4. Validate hash chain integrity
5. Verify digital signatures

If any mismatch detected → alert and freeze wallet.

## Balance Calculation

Balance is **computed from the ledger**, not stored:

```sql
SELECT COALESCE(MAX(balance_after_sats), 0)
FROM ledger_entries
WHERE wallet_id = $1
ORDER BY id DESC
LIMIT 1;
```

Or rebuild from scratch:
```sql
SELECT
  SUM(CASE WHEN kind = 'credit' THEN amount_sats ELSE -amount_sats END)
FROM ledger_entries
WHERE wallet_id = $1;
```

The `balance_sats` column on wallets is a **cache** for performance; it's kept in sync via application logic but can always be recalculated.

## Service-to-Service Communication

### Public Endpoints
These are exposed to clients (via GraphQL gateway or direct REST):

```
GET  /api/v1/wallets                    # List (paginated, filtered by ownership)
POST /api/v1/wallets                    # Create
GET  /api/v1/wallets/:id                # Retrieve
PATCH /api/v1/wallets/:id               # Update metadata
GET  /api/v1/wallets/:id/balance        # Current balance
GET  /api/v1/wallets/:id/transactions   # Transaction history
```

**Auth:** Bearer JWT (user token from OIDC IdP)

### Internal Endpoints
Service-to-service only (e.g., from transaction-service or other Zuma services):

```
POST /internal/wallets/:id/debits       # Debit wallet (move to balance_sats)
POST /internal/wallets/:id/credits      # Credit wallet (for refunds)
GET  /internal/wallets/:id              # Retrieve (no ownership check)
```

**Auth:** x-service-token header (HS256 JWT signed with INTERNAL_JWT_SECRET)

## Testing Strategy

### Unit Tests
Majority of tests; repositories are mocked with `InMemoryWalletRepository` and `InMemoryLedgerRepository`.

```typescript
// No database needed; in-memory fakes replace repositories
jest.mock('../../src/infrastructure/persistence/wallet.repository', () => ({
  PostgresWalletRepository: InMemoryWalletRepository,
}));

const useCase = new CreateWalletUseCase(mockRepository, mockGenerator);
const wallet = await useCase.execute(input);
expect(wallet.id).toBeDefined();
```

### Integration Tests
Test PostgreSQL repositories against `mongodb-memory-server` (once migrated) or real test database.

```typescript
const pg = await createConnectionPool('postgresql://test:test@localhost/zinga-test');
const repository = new PostgresWalletRepository(pg);
const wallet = await repository.create({...});
expect(wallet.id).toBeDefined();
await pg.end();
```

### E2E Tests
Full stack with Fastify app + in-memory repositories (no database):

```typescript
const { app, bearer } = await buildTestApp();
const res = await app.inject({
  method: 'POST',
  url: '/api/v1/wallets',
  headers: bearer('user-123'),
  payload: {...}
});
expect(res.statusCode).toBe(201);
```

## Deployment

### Local Development
```bash
# Start PostgreSQL (Docker)
docker run --name zinga-postgres -e POSTGRES_PASSWORD=test -p 5432:5432 postgres:16

# Create database
psql postgresql://postgres:test@localhost/zinga -c "CREATE DATABASE zinga;"

# Environment
export DATABASE_URL="postgresql://postgres:test@localhost/zinga"
export JWT_SECRET="your-32-char-secret-here-12345678"
export NODE_ENV="development"

# Run
npm install
npm run build
npm start

# Or with ts-node (dev mode)
npm run dev
```

### Docker
```bash
# Build image
docker build -f infrastructure/docker/wallet-service.Dockerfile -t zinga/wallet:latest .

# Run with environment
docker run \
  -e DATABASE_URL="postgresql://postgres:test@postgres:5432/zinga" \
  -e JWT_SECRET="..." \
  -p 3000:3000 \
  zinga/wallet:latest
```

### Kubernetes
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: zinga-wallet
spec:
  replicas: 3
  selector:
    matchLabels:
      app: zinga-wallet
  template:
    metadata:
      labels:
        app: zinga-wallet
    spec:
      containers:
      - name: wallet
        image: zinga/wallet:v1.0.0
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: zinga-secrets
              key: database-url
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: zinga-secrets
              key: jwt-secret
        livenessProbe:
          httpGet:
            path: /healthz
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /readyz
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

### AWS Lambda (Future)
Zinga can be deployed as a Lambda function:
- Reads `DATABASE_URL` from RDS (via RDS Proxy)
- Reads `JWT_SECRET` from Secrets Manager
- Wrapped with `@vendia/serverless-express` or similar

## Configuration & Secrets

### Environment Variables
All config is loaded via `src/config/zinga-config.ts` (Zod schema):

```typescript
const schema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  // ... more fields
});
```

### Local Development
Create `.env.local` (git-ignored) in zinga root:
```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://localhost:5432/zinga
JWT_SECRET=dev-secret-0123456789abcdef0123456789abcd
```

Load with: `export $(cat .env.local | xargs)`

### Production (via 1Password or Secrets Manager)
Never commit `.env` files. Inject secrets at runtime:

**Docker:**
```bash
op run --env-file=zinga.op.env -- docker run zinga/wallet:latest
```

**Kubernetes:**
```bash
kubectl create secret generic zinga-secrets \
  --from-literal=database-url=$DATABASE_URL \
  --from-literal=jwt-secret=$JWT_SECRET
```

**AWS Lambda:**
Use `AWS_LAMBDA_LOG_TYPE=Tail` and `aws ssm get-parameter --name /zinga/jwt-secret` in function code.

## Observability

### Logging
Pino logger (structured JSON output).

```typescript
logger.info({ walletId, amount }, 'wallet debited');
```

**Redaction:** Sensitive fields (JWT, passwords) auto-masked via Pino's `redact` plugin.

### Metrics
Prometheus exposition format on `/metrics` (Pino + OpenTelemetry):
- `http_requests_total` (counter by method, path, status)
- `http_request_duration_seconds` (histogram)
- `pg_pool_size` (gauge)
- `ledger_entries_total` (counter by wallet, kind)

### Traces
OpenTelemetry distributed tracing:
- Export via OTLP HTTP (`OTEL_EXPORTER_OTLP_ENDPOINT`)
- Spans for use-cases, database queries, HTTP calls
- Context propagation via W3C Trace Context headers

### Health Probes
- **GET /healthz** — Always 200, no dependencies (Kubernetes liveness)
- **GET /readyz** — 200 if PostgreSQL connected (Kubernetes readiness)

## Integration with Zuma

Zinga is designed to coexist with Zuma during migration:

1. **Dual-write period**: Wallet operations written to both MongoDB (Zuma) and PostgreSQL (Zinga)
2. **Validation**: Compare balances and detect divergence
3. **Gradual cutover**: Clients switch to Zinga endpoints once fully validated
4. **Deprecation**: Zuma services eventually retired

### Cross-Service Calls
- Zinga can call Zuma transaction-service to query transaction status
- Zuma can call Zinga to validate balances during migration verification

## Related Documentation

- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — Overall system architecture
- [`../../zuma/ARCHITECTURE.md`](../../zuma/README.md) — Zuma service details
- [`../../zuma/docs/security.md`](../../zuma/docs/security.md) — Security model (applies to Zinga too)
