# Zinga — Wallet Service Microservice

Zinga is the wallet and ledger microservice for the zhios payment platform. It manages wallet state, balance integrity, and an immutable ledger of all balance movements.

## Architecture

- **Database:** PostgreSQL (RDS)
- **Runtime:** Node.js v22 + Fastify
- **Language:** TypeScript
- **Package manager:** npm
- **Build:** tsc

## Services

```
services/wallet-service/
├─ Wallet CRUD (create, get, update, list)
├─ Balance queries
├─ Ledger entries (append-only)
├─ Ledger verification (tamper detection)
└─ Internal API (debit/credit via transaction-service)
```

## Port

- **HTTP:** 3000 (configurable via `PORT` env var)
- **Metrics:** 9090 (Prometheus)
- **Health:** GET `/healthz`, GET `/readyz`

## Quick Start

### Prerequisites

```bash
node -v      # v22.0.0 or later
npm -v       # v10.0.0 or later
brew install postgresql@16  # macOS; other platforms use your package manager
```

### Local Development

```bash
# Install dependencies
npm ci

# Start PostgreSQL (docker-compose)
docker-compose up -d postgres

# Run migrations
npm run db:migrate

# Seed sample data (optional)
npm run db:seed

# Start development server
npm run dev

# Watch mode (recompile on changes)
npm run dev:watch
```

### Services

```bash
# All at once (from root)
./scripts/dev-up.sh          # Starts PostgreSQL + seed

# Type check
npm run typecheck

# Lint
npm run lint

# Test
npm test

# Test single file
npm test -- wallet.use-case.test.ts

# Coverage
npm test -- --coverage
```

## Build & Deploy

```bash
# Build TypeScript
npm run build

# Run compiled code
npm run start

# Docker build
docker build -f infrastructure/docker/wallet-service.Dockerfile -t zinga/wallet-service:latest .

# Docker run
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="..." \
  zinga/wallet-service:latest
```

## Environment Variables

```bash
# Core
NODE_ENV=development                     # development | staging | production
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/zinga_wallet

# Authentication
JWT_SECRET=your-secret-key               # min 32 chars
JWT_ISSUER=https://idp.example.com
INTERNAL_JWT_SECRET=internal-secret      # For service-to-service calls

# Cross-service
TRANSACTION_SERVICE_URL=http://zuma:3002

# Observability
OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4317
METRICS_ENABLED=true

# Feature flags
LEDGER_VERIFICATION_ENABLED=true
TAMPER_DETECTION_ENABLED=true
```

## API Endpoints

### Public API

```bash
# Create wallet
POST /wallets
  Body: { label, network, type, metadata? }
  Response: { id, address, balance, ... }

# Get wallet
GET /wallets/:id
  Response: { id, label, address, balance, ... }

# Update wallet
PATCH /wallets/:id
  Body: { label?, metadata? }
  Response: { id, ... }

# List wallets
GET /wallets
  Query: ?limit=10&offset=0
  Response: { total, items: [...] }

# Get ledger entries
GET /wallets/:id/ledger
  Query: ?limit=50&offset=0
  Response: { total, items: [...] }

# Verify ledger chain
GET /wallets/:id/ledger/verify
  Response: { isValid, checksumMismatch, lastVerifiedAt, ... }
```

### Internal API (service-to-service, requires `x-service-token`)

```bash
# Debit wallet (reserve funds for transaction)
POST /internal/wallets/:id/debits
  Body: { transactionId, amount, reason }
  Response: { success, balanceAfterSats, ledgerEntryId }

# Credit wallet (refund)
POST /internal/wallets/:id/credits
  Body: { transactionId, amount, reason }
  Response: { success, balanceAfterSats, ledgerEntryId }

# Get wallet status
GET /internal/wallets/:id/status
  Response: { id, balanceSats, status, canBeDebited }

# Get ledger summary
GET /internal/wallets/:id/ledger
  Query: ?limit=100&offset=0
  Response: { total, items: [...] }
```

## Domain Model

See [`docs/domain-model.md`](./docs/domain-model.md) for full details.

### Entities

- **Wallet** — User's wallet with balance and metadata
- **LedgerEntry** — Immutable record of a balance movement (debit/credit)

### Key Invariants

- ✅ **Immutable ledger:** LedgerEntry never updated after creation
- ✅ **Unique movements:** One {transactionId, kind, reason} per wallet (prevents double-charging)
- ✅ **Balance integrity:** balanceSats updated only via guarded ledger movements
- ✅ **Chronological order:** Ledger entries ordered by createdAt
- ✅ **Point-in-time balance:** balanceAfterSats captured at the moment of application

## Testing

```bash
# Unit tests (application/domain logic)
npm test -- --testPathPattern=application

# Integration tests (database adapters)
npm test -- --testPathPattern=infrastructure

# E2E tests (API layer)
npm test -- --testPathPattern=api

# All tests with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

## CI/CD

GitHub Actions workflow: `.github/workflows/ci.yml`

```
git push → lint → typecheck → test → build → docker-build → trivy-scan
```

See workflow file for details.

## Deployment

### Kubernetes (recommended)

```bash
# Apply manifests
kubectl apply -f infrastructure/kubernetes/

# Port forward for local testing
kubectl port-forward svc/zinga 3000:3000

# View logs
kubectl logs -f deployment/zinga-wallet-service

# Scale
kubectl scale deployment zinga-wallet-service --replicas=3
```

### Terraform (AWS RDS + ECS)

```bash
cd infrastructure/aws/terraform
terraform plan
terraform apply
```

See `infrastructure/aws/terraform/README.md` for details.

## Monitoring

### Metrics (Prometheus)

```
GET http://localhost:9090/metrics

Key metrics:
  - wallet_balance_sats{wallet_id}
  - ledger_entry_total{reason, kind}
  - wallet_api_duration_seconds{endpoint, method}
  - ledger_verification_failures_total
  - ledger_chain_hash_mismatches_total
```

### Logs

```bash
# View recent logs
npm run logs

# Filter by level
npm run logs -- --level=error
```

### Health Checks

```bash
# Liveness (is the service running?)
curl http://localhost:3000/healthz
# Response: 200 OK

# Readiness (is the service ready to receive traffic?)
curl http://localhost:3000/readyz
# Response: 200 OK (when DB is connected)
```

## Documentation

- [`docs/domain-model.md`](./docs/domain-model.md) — Wallet & ledger entities
- [`docs/api-spec.md`](./docs/api-spec.md) — OpenAPI specification
- [`docs/testing-strategy.md`](./docs/testing-strategy.md) — Testing approach
- [`docs/security.md`](./docs/security.md) — Security & secrets management
- [`docs/postman/`](./docs/postman/) — Postman collection & environment

## Development Workflow

1. **Create feature branch:** `git checkout -b feat/add-wallet-metadata`
2. **Make changes:** Write code + tests
3. **Type check:** `npm run typecheck`
4. **Lint:** `npm run lint` (auto-fix: `npm run lint -- --fix`)
5. **Test:** `npm test`
6. **Commit:** `git commit -S -m "feat: add wallet metadata"`
7. **Push & create PR:** `git push origin feat/add-wallet-metadata`
8. **CI runs automatically** on PR
9. **Merge when approved:** Squash-merge to main

## Troubleshooting

### PostgreSQL connection refused
```bash
# Check if PostgreSQL is running
docker-compose ps

# Start PostgreSQL
docker-compose up -d postgres

# Check connection
psql postgresql://zinga:zinga@localhost:5432/zinga_wallet
```

### Port 3000 already in use
```bash
# Find process using port 3000
lsof -i :3000

# Kill it
kill -9 <PID>

# Or use different port
PORT=3001 npm run dev
```

### Database schema out of sync
```bash
# Reset database
npm run db:reset

# Re-run migrations
npm run db:migrate

# Reseed sample data
npm run db:seed
```

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for guidelines.

## License

Proprietary — zhios payment platform

## Support

- **Issues:** GitHub Issues
- **Slack:** #zinga-dev
- **On-call:** Check PagerDuty rotation
