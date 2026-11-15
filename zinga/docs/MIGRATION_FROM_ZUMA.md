# Migration Guide: Moving wallet-service from Zuma to Zinga

Step-by-step guide for migrating the wallet-service microservice from the zuma monorepo to the new zinga standalone microservice.

---

## Pre-Migration Checklist

- [ ] Code review of wallet-service in zuma
- [ ] Backup production database
- [ ] Staging environment ready
- [ ] Testing plan documented
- [ ] Team communication (all stakeholders aware)
- [ ] Maintenance window scheduled (if needed)

---

## Phase 1: Code Migration (1-2 hours)

### Step 1: Copy wallet-service code from zuma to zinga

```bash
# From zhios root directory
cp -r zuma/services/wallet-service/* zinga/services/wallet-service/

# Verify structure
tree zinga/services/wallet-service -L 2
```

Expected structure:
```
zinga/services/wallet-service/
├─ src/
│  ├─ domain/
│  │  ├─ entities/
│  │  ├─ value-objects/
│  │  └─ ports/
│  ├─ application/
│  │  ├─ use-cases/
│  │  ├─ dtos/
│  │  └─ ports/
│  ├─ infrastructure/
│  │  ├─ persistence/
│  │  ├─ clients/
│  │  └─ config/
│  ├─ api/
│  │  └─ routes/
│  ├─ app.ts
│  └─ config/
├─ tests/
├─ package.json
├─ tsconfig.json
└─ jest.config.js
```

### Step 2: Copy shared code to zinga

```bash
# Copy shared workspaces
cp -r zuma/shared/common zinga/shared/
cp -r zuma/shared/http zinga/shared/

# Update paths in package.json files
# Change @zuma/shared-* to @zinga/shared-*
```

### Step 3: Copy infrastructure files

```bash
# Docker
cp zuma/infrastructure/docker/wallet-service.Dockerfile zinga/infrastructure/docker/

# Kubernetes
cp -r zuma/infrastructure/kubernetes/wallet-service/* zinga/infrastructure/kubernetes/

# Terraform (AWS)
mkdir -p zinga/infrastructure/aws/terraform
# Will create new Terraform config for PostgreSQL in next step
```

---

## Phase 2: Configuration Updates (30 minutes)

### Step 4: Update import paths

In `zinga/services/wallet-service/src/**/*.ts`, replace:
```typescript
// Before
import { ... } from '@zuma/shared-common';
import { ... } from '@zuma/shared-http';

// After
import { ... } from '@zinga/shared-common';
import { ... } from '@zinga/shared-http';
```

### Step 5: Update TypeScript paths

**zinga/tsconfig.json:**
```json
{
  "compilerOptions": {
    "paths": {
      "@zinga/domain/*": ["./services/wallet-service/src/domain/*"],
      "@zinga/application/*": ["./services/wallet-service/src/application/*"],
      "@zinga/infrastructure/*": ["./services/wallet-service/src/infrastructure/*"],
      "@zinga/api/*": ["./services/wallet-service/src/api/*"],
      "@zinga/shared-*": ["./shared/*/src"]
    }
  }
}
```

### Step 6: Create app configuration for PostgreSQL

**zinga/services/wallet-service/src/config/zinga-config.ts:**

```typescript
import { z } from 'zod';

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  
  // PostgreSQL (instead of MongoDB)
  DATABASE_URL: z.string().url(),
  
  // Authentication
  JWT_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().url(),
  INTERNAL_JWT_SECRET: z.string().min(32),
  
  // Cross-service
  TRANSACTION_SERVICE_URL: z.string().url(),
  
  // Observability
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  METRICS_ENABLED: z.enum(['true', 'false']).transform(v => v === 'true').default('false'),
  
  // Feature flags
  LEDGER_VERIFICATION_ENABLED: z.enum(['true', 'false']).transform(v => v === 'true').default('true'),
  TAMPER_DETECTION_ENABLED: z.enum(['true', 'false']).transform(v => v === 'true').default('true'),
});

export const zingaConfig = baseEnvSchema.parse(process.env);
export type ZingaConfig = z.infer<typeof baseEnvSchema>;
```

### Step 7: Update Docker image names

**zinga/infrastructure/docker/wallet-service.Dockerfile:**
```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/healthz', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"
CMD ["npm", "start"]
```

---

## Phase 3: Database Setup (1-2 hours)

### Step 8: Create PostgreSQL schema

**zinga/infrastructure/docker/init-postgres.sql:**

```sql
-- Initialize PostgreSQL for wallet service
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Wallets table
CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  label TEXT NOT NULL,
  address TEXT NOT NULL UNIQUE,
  network TEXT NOT NULL CHECK (network IN ('mainnet', 'testnet', 'regtest')),
  type TEXT NOT NULL CHECK (type IN ('hot', 'cold', 'custodial', 'non-custodial')),
  balance_sats BIGINT NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  owner_user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(owner_user_id, label)
);

-- Ledger entries (immutable)
CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  transaction_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('debit', 'credit')),
  reason TEXT NOT NULL CHECK (reason IN ('send', 'refund', 'deposit')),
  amount_sats BIGINT NOT NULL CHECK (amount_sats > 0),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'applied')),
  balance_after_sats BIGINT,
  
  -- Hashing (Enhancement 2)
  previous_ledger_hash VARCHAR(64),
  current_ledger_hash VARCHAR(64) NOT NULL,
  cumulative_hash VARCHAR(64) NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(transaction_id, kind, reason)
);

-- Prevent updates to ledger entries
CREATE TRIGGER prevent_ledger_updates
  BEFORE UPDATE ON ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION raise_immutability_error();

CREATE OR REPLACE FUNCTION raise_immutability_error()
  RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Ledger entries are immutable and cannot be updated';
END;
$$ LANGUAGE plpgsql;

-- Verification logs
CREATE TABLE ledger_verification_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  is_valid BOOLEAN NOT NULL,
  errors_count INT NOT NULL DEFAULT 0,
  cumulative_hash VARCHAR(64),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_wallets_owner ON wallets(owner_user_id);
CREATE INDEX idx_wallets_address ON wallets(address);
CREATE INDEX idx_ledger_wallet ON ledger_entries(wallet_id, created_at DESC);
CREATE INDEX idx_ledger_tx_kind_reason ON ledger_entries(transaction_id, kind, reason);
CREATE INDEX idx_ledger_hash ON ledger_entries(current_ledger_hash);
CREATE INDEX idx_verification_wallet ON ledger_verification_logs(wallet_id, verified_at DESC);
```

### Step 9: Create Terraform for PostgreSQL (RDS)

**zinga/infrastructure/aws/terraform/rds.tf:**

```hcl
resource "aws_rds_cluster" "zinga" {
  cluster_identifier      = "zinga-postgres"
  engine                  = "aurora-postgresql"
  engine_version          = "16.1"
  database_name           = "zinga_wallet"
  master_username         = "zinga_admin"
  master_password         = random_password.db_password.result
  backup_retention_period = 30
  preferred_backup_window = "03:00-04:00"
  
  db_subnet_group_name            = aws_db_subnet_group.zinga.name
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.zinga.name
  
  skip_final_snapshot       = false
  final_snapshot_identifier = "zinga-postgres-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"
  
  enabled_cloudwatch_logs_exports = ["postgresql"]
  
  tags = {
    Service = "zinga"
    Name    = "zinga-postgres"
  }
}

resource "aws_rds_cluster_instance" "zinga" {
  count              = 2  # Primary + replica
  cluster_identifier = aws_rds_cluster.zinga.id
  instance_class     = "db.t4g.medium"  # 2 vCPU, 4 GB RAM
  engine              = aws_rds_cluster.zinga.engine
  engine_version      = aws_rds_cluster.zinga.engine_version
  publicly_accessible = false
  
  monitoring_interval    = 60
  monitoring_role_arn    = aws_iam_role.rds_monitoring.arn
  performance_insights_enabled = true
  
  tags = {
    Service = "zinga"
  }
}

resource "random_password" "db_password" {
  length  = 32
  special = true
}

resource "aws_secretsmanager_secret" "zinga_db_password" {
  name = "zinga/postgres/password"
}

resource "aws_secretsmanager_secret_version" "zinga_db_password" {
  secret_id      = aws_secretsmanager_secret.zinga_db_password.id
  secret_string  = random_password.db_password.result
}

output "rds_endpoint" {
  value = aws_rds_cluster.zinga.endpoint
}

output "rds_reader_endpoint" {
  value = aws_rds_cluster.zinga.reader_endpoint
}
```

---

## Phase 4: Testing (2-3 hours)

### Step 10: Run local tests

```bash
cd zinga

# Install dependencies
npm ci

# Run linter
npm run lint

# Run type check
npm run typecheck

# Run unit tests
npm test

# Start local PostgreSQL
docker-compose up -d postgres

# Run migrations
npm run db:migrate

# Run integration tests
npm test -- --testPathPattern=infrastructure

# Seed test data
npm run db:seed

# Start development server
npm run dev

# In another terminal: test the API
curl http://localhost:3000/healthz
curl http://localhost:3000/wallets
```

### Step 11: Test service-to-service communication

```bash
# Start both zinga and zuma locally (in separate terminals)
cd zinga && npm run dev        # Port 3000
cd zuma && npm run dev         # Port 3002

# Test transaction debit flow
# 1. Create wallet in zinga
POST http://localhost:3000/wallets
Body: { "label": "test", "network": "testnet", "type": "hot" }

# 2. Create transaction in zuma
POST http://localhost:3002/transactions
Body: { "walletId": "...", "amount": "1000", "fee": "100" }

# 3. Verify ledger entry was created in zinga
GET http://localhost:3000/wallets/:walletId/ledger
```

---

## Phase 5: Deployment (2-4 hours)

### Step 12: Deploy PostgreSQL to RDS

```bash
cd zinga/infrastructure/aws/terraform

# Review plan
terraform plan -out=tfplan

# Apply
terraform apply tfplan

# Get endpoint
POSTGRES_ENDPOINT=$(terraform output rds_endpoint)
```

### Step 13: Deploy zinga to Kubernetes

```bash
# Create namespace
kubectl create namespace zinga

# Create secrets
kubectl create secret generic zinga-db-password \
  --from-literal=DATABASE_URL="postgresql://..." \
  -n zinga

kubectl create secret generic zinga-jwt \
  --from-literal=JWT_SECRET="..." \
  --from-literal=INTERNAL_JWT_SECRET="..." \
  -n zinga

# Apply manifests
kubectl apply -f zinga/infrastructure/kubernetes/

# Verify deployment
kubectl get deployments -n zinga
kubectl get pods -n zinga
kubectl get svc -n zinga

# Port forward for testing
kubectl port-forward -n zinga svc/zinga 3000:3000
```

### Step 14: Update zuma to call zinga

In `zuma/services/transaction-service/src/infrastructure/clients/wallet-service.client.ts`:

```typescript
// Before
const WALLET_SERVICE_URL = process.env.WALLET_SERVICE_URL || 'http://localhost:3001';

// After
const WALLET_SERVICE_URL = process.env.WALLET_SERVICE_URL || 'http://zinga:3000';
```

### Step 15: Update API Gateway routing

Configure your API Gateway (Kong, Nginx, or AWS API Gateway) to route:
- `/wallets/*` → zinga
- `/transactions/*` → zuma

---

## Phase 6: Cutover (30-60 minutes)

### Step 16: Deploy both services

```bash
# 1. Deploy zinga first (new service)
kubectl apply -f zinga/infrastructure/kubernetes/

# 2. Verify zinga is healthy
kubectl get pods -n zinga
curl http://zinga:3000/healthz

# 3. Deploy updated zuma
kubectl apply -f zuma/infrastructure/kubernetes/

# 4. Verify zuma is healthy
kubectl get pods -n zuma
curl http://zuma:3002/healthz

# 5. Smoke test end-to-end flow
# Create wallet in zinga
# Create transaction in zuma
# Verify ledger entry in zinga
```

### Step 17: Monitor for errors

```bash
# Watch logs
kubectl logs -f deployment/zinga-wallet-service -n zinga
kubectl logs -f deployment/zuma-transaction-service -n zuma

# Check metrics
kubectl top nodes
kubectl top pods -n zinga
kubectl top pods -n zuma
```

---

## Phase 7: Cleanup (30 minutes)

### Step 18: Remove wallet-service from zuma

```bash
# In zuma repository
rm -rf services/wallet-service/
rm -rf shared/  # If wallet-service was the only consumer

# Update zuma package.json
# Remove wallet-service workspace reference

# Update zuma CI/CD
# Remove wallet-service docker build step
# Remove wallet-service Kubernetes deployment

# Commit changes
git commit -m "refactor: remove wallet-service (moved to zinga)"
```

### Step 19: Archive old Kubernetes manifests

```bash
# In zuma
mkdir -p _archived/kubernetes/wallet-service-2026-11-14
mv infrastructure/kubernetes/wallet-service/* _archived/kubernetes/wallet-service-2026-11-14/

git commit -m "chore: archive wallet-service kubernetes manifests"
```

---

## Rollback Plan

If issues arise during cutover:

```bash
# 1. Revert zuma changes
kubectl rollout undo deployment/zuma-transaction-service -n zuma

# 2. Delete zinga deployment
kubectl delete deployment zinga-wallet-service -n zinga

# 3. Restore wallet-service to zuma
git checkout HEAD~1 -- services/wallet-service/

# 4. Re-deploy zuma with wallet-service
kubectl apply -f zuma/infrastructure/kubernetes/
```

---

## Testing Checklist

- [ ] Unit tests pass in both zinga and zuma
- [ ] Integration tests pass (PostgreSQL for zinga, MongoDB for zuma)
- [ ] E2E tests pass (API Gateway → both services)
- [ ] Debit flow works (transaction → wallet debit)
- [ ] Refund flow works (failed transaction → wallet credit)
- [ ] Ledger verification works (manual `curl` + automated job)
- [ ] Metrics exported correctly
- [ ] Logs exported correctly
- [ ] Health checks working
- [ ] Service-to-service tokens working
- [ ] Database backups working
- [ ] Load test: 100 TPS through both services

---

## Success Criteria

✅ Cutover is complete when:
1. Both services deployed to production
2. All integration tests passing
3. Zero transaction failures for 24 hours
4. Ledger chain integrity verified
5. No errors in logs
6. Metrics showing normal latency
7. Team confident in new architecture

---

**Timeline:** 1-2 weeks total (including testing & validation)

**Risk:** Medium (dual deployment, careful cutover)

**Rollback:** 30 minutes
