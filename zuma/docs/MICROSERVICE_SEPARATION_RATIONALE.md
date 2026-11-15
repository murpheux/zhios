# Microservice Separation: Zuma + Zinga Architecture

## Is It Practical for 1 Microservice to Use 2 Databases?

**Short answer:** ✅ **Yes, but it's better to separate into 2 microservices.**

---

## Current Problem (1 Service, 2 Databases)

```
wallet-service (single codebase)
├─ PostgreSQL (ledger)
└─ MongoDB (wallets)
```

**Challenges:**
- ❌ Service has two different consistency models
- ❌ Two different connection pools, monitoring, scaling strategies
- ❌ One database outage affects the entire service
- ❌ Hard to scale independently (CPU vs I/O bound)
- ❌ Operations team manages two DBs for one "service"

---

## Recommended Solution: Separate Microservices

```
zinga (wallet-service)          zuma (transaction-service)
├─ PostgreSQL                   └─ MongoDB
│  ├─ wallets
│  └─ ledger_entries
└─ API: /wallets/*              API: /transactions/*
                                API: /blocks/*
```

**Benefits:** ✅✅✅

### 1. **Single Responsibility Principle**
- **zinga:** Manages wallet state & ledger (balance integrity)
- **zuma:** Manages transaction lifecycle & blockchain integration

### 2. **Database-Service Alignment**
- Each service owns exactly one database
- Each database optimized for that service's patterns
- No cross-database transactions needed

### 3. **Independent Scaling**
```
Transaction volume spiking?
  → Scale zuma only (more transaction-service pods)
  
Balance queries spiking?
  → Scale zinga only (more wallet-service pods)
  
No interference between services
```

### 4. **Independent Deployment**
```
Update ledger schema? 
  → Deploy zinga, restart PostgreSQL (no transaction-service impact)

Update transaction state machine?
  → Deploy zuma, no ledger changes needed

Blue-green deployments per-service
```

### 5. **Operational Clarity**
```
PostgreSQL issues → Reach out to zinga team
MongoDB issues → Reach out to zuma team

On-call rotation clear
Incident response simpler
```

### 6. **Data Flow Clarity**

```
Client
  │
  ├─→ zinga (GET /wallets/:id)
  │     └─ Returns wallet + balance
  │
  └─→ zuma (GET /transactions/:id)
        ├─ Check wallet ownership → calls zinga
        └─ Returns transaction status
```

Service-to-service calls are explicit and auditable.

---

## Architecture Diagram: Zuma + Zinga

```
┌──────────────────────────────────────────────────────────────┐
│                         CLIENT                                │
├──────────────────────────────────────────────────────────────┤
│  Mobile app, Web, Backend integrations                        │
└──────────┬───────────────────────────────────────┬───────────┘
           │                                       │
           │ REST/gRPC                            │ REST/gRPC
           ▼                                       ▼
┌─────────────────────────┐          ┌──────────────────────────┐
│    ZINGA                │          │    ZUMA                  │
│  (Wallet Service)       │          │  (Transaction Service)   │
├─────────────────────────┤          ├──────────────────────────┤
│ Endpoints:              │          │ Endpoints:               │
│  POST   /wallets        │          │  POST   /transactions    │
│  GET    /wallets/:id    │◄──────┐  │  GET    /transactions/:id│
│  PATCH  /wallets/:id    │       │  │  POST   /broadcast      │
│  GET    /wallets/:id/   │       │  │  GET    /blocks/:num    │
│         ledger          │       │  │  POST   /verify         │
│  GET    /ledger/verify  │       │  │                         │
└────────┬────────────────┘       │  └────────┬────────────────┘
         │                        │           │
         │ Internal API           │ Internal API
         │ (service-to-service)   │           │
         │                        └─────┐     │
         │                              │     │
         ▼                              ▼     │
┌─────────────────────────┐             │     │
│   PostgreSQL (RDS)      │             │     │
├─────────────────────────┤             │     │
│ Tables:                 │             │     │
│  • wallets              │             │     │
│  • ledger_entries       │             │     │
│  • verification_logs    │             │     │
└─────────────────────────┘             │     ▼
         ▲                              │  ┌──────────────────────┐
         │                              │  │  MongoDB (Atlas)     │
         │ Replication                  │  ├──────────────────────┤
         │ Backup                       │  │ Collections:         │
         │                              │  │  • transactions      │
         │                              │  │  • transaction_blocks│
┌────────┴──────────────┐               │  │  • audit_logs       │
│ S3 (Backup Archive)   │               │  │  • system_events    │
└──────────────────────┘                │  └──────────────────────┘
                                        │
                                        │ Replication
                                        │
                            ┌───────────┴───────────┐
                            │ MongoDB Replica Set   │
                            │ (secondary + backup)  │
                            └───────────────────────┘
```

---

## Deployment Architecture

```
┌──────────────────────────────────────┐
│      Kubernetes Cluster (or Docker)  │
├──────────────────────────────────────┤
│                                       │
│  Namespace: zinga                    │
│  ├─ zinga-wallet-1 (pod)            │
│  ├─ zinga-wallet-2 (pod)            │
│  ├─ zinga-wallet-3 (pod)            │
│  │                                   │
│  └─ Service: zinga (ClusterIP)      │
│     ↓                                │
│  PostgreSQL (RDS)                   │
│                                       │
│  Namespace: zuma                     │
│  ├─ zuma-transaction-1 (pod)        │
│  ├─ zuma-transaction-2 (pod)        │
│  ├─ zuma-transaction-3 (pod)        │
│  │                                   │
│  └─ Service: zuma (ClusterIP)       │
│     ↓                                │
│  MongoDB (Atlas)                    │
│                                       │
│  Namespace: ingress                  │
│  └─ API Gateway / Load Balancer     │
│     (routes to zinga & zuma)        │
│                                       │
└──────────────────────────────────────┘
```

---

## Service Communication Pattern

### Cross-Service Calls

**wallet-service → transaction-service (infrequent):**
```typescript
// zinga → zuma: Get transaction history
GET https://zuma/internal/transactions?walletId=:id
Authorization: Bearer <service-token>
```

**transaction-service → wallet-service (on every debit/refund):**
```typescript
// zuma → zinga: Debit wallet for transaction
POST https://zinga/internal/wallets/:id/debits
Body: { transactionId, amount, reason }
Authorization: Bearer <service-token>

// zuma → zinga: Refund wallet on failure
POST https://zinga/internal/wallets/:id/credits
Body: { transactionId, amount, reason }
Authorization: Bearer <service-token>

// zuma → zinga: Check wallet status
GET https://zinga/internal/wallets/:id/status
Authorization: Bearer <service-token>
```

**Service Tokens:**
- Short-lived (15 min), mTLS authenticated
- Issued by auth service (ozzo)
- Include scope: `service:transaction-service` or `service:wallet-service`
- Logged for audit trail

---

## Implementation Path

### Phase 1: Create Zinga Repository (This Turn)
```
zinga/
├─ services/
│  └─ wallet-service/
│     ├─ src/
│     │  ├─ domain/
│     │  │  ├─ entities/
│     │  │  │  ├─ wallet.entity.ts
│     │  │  │  └─ ledger-entry.entity.ts
│     │  │  └─ ports/
│     │  │     ├─ wallet.repository.ts
│     │  │     └─ ledger.repository.ts
│     │  ├─ application/
│     │  │  ├─ use-cases/
│     │  │  └─ ports/
│     │  ├─ infrastructure/
│     │  │  ├─ postgres/
│     │  │  │  ├─ postgres-wallet.repository.ts
│     │  │  │  └─ postgres-ledger.repository.ts
│     │  │  └─ clients/
│     │  │     └─ transaction-service.client.ts
│     │  ├─ api/
│     │  │  └─ routes/
│     │  └─ app.ts
│     ├─ tests/
│     ├─ docker/
│     ├─ infrastructure/
│     │  ├─ terraform/
│     │  │  ├─ rds.tf (PostgreSQL)
│     │  │  └─ kubernetes/
│     │  └─ kubernetes/
│     │     ├─ deployment.yaml
│     │     ├─ service.yaml
│     │     └─ configmap.yaml
│     ├─ docs/
│     ├─ package.json
│     ├─ tsconfig.json
│     └─ biome.json
├─ shared/
│  ├─ common/
│  │  └─ types/
│  │     └─ wallet.ts
│  └─ http/
│     └─ plugins/
├─ scripts/
│  ├─ dev-up.sh
│  ├─ seed-db.sh
│  └─ migrate-postgres.sh
├─ .github/
│  └─ workflows/
│     ├─ ci.yml
│     └─ deploy.yml
├─ Makefile
├─ README.md
└─ .gitignore
```

### Phase 2: Migrate Code from Zuma → Zinga
- Move `wallet-service/` directory
- Update import paths
- Update CI/CD pipelines

### Phase 3: Update Zuma
- Remove wallet-service
- Update transaction-service to call zinga via HTTP
- Update internal APIs for debit/credit calls

### Phase 4: Deploy Both Services
- Deploy zinga (PostgreSQL + wallet-service)
- Deploy zuma (MongoDB + transaction-service)
- Test service-to-service communication

---

## Database Management

### PostgreSQL (zinga, wallet-service)
```
Host: zinga-postgres.c..rds.amazonaws.com
Port: 5432
Database: zinga_wallet
User: zinga_app (app), zinga_admin (migration/backup)

Connections:
  - App pool: 20 connections
  - Backup: 2 connections
  - Monitoring: 1 connection
  Max: 23 / 100 (safe)
```

### MongoDB (zuma, transaction-service)
```
Connection string:
  mongodb+srv://zuma_app:PASSWORD@cluster.mongodb.net/zuma_transaction?retryWrites=true&w=majority

Sharding: By walletId for future scaling
Replica set: 3 nodes (primary + 2 secondaries)
```

---

## Monitoring & Alerting

### Zinga Alerts
```
PostgreSQL:
  - Connection pool exhaustion
  - Replication lag > 5 sec
  - Storage > 80%
  - Query latency p95 > 100ms
  - Ledger chain verification failed

Application:
  - API latency p95 > 200ms
  - Error rate > 1%
  - Debit call to zuma timing out
```

### Zuma Alerts
```
MongoDB:
  - Replica set unhealthy
  - Replication lag > 10 sec
  - Storage > 80%
  - Query latency p95 > 200ms

Application:
  - API latency p95 > 300ms
  - Error rate > 1%
  - Call to zinga for debit timing out
  - Block finalization job failing
```

---

## Practical Benefits Summary

| Aspect | Before (1 service, 2 DBs) | After (2 services, 2 DBs) |
|---|---|---|
| **Operational** | Complex | Clear |
| **Scaling** | One-size-fits-all | Independent |
| **Deployment** | Higher risk | Lower risk per service |
| **Monitoring** | Mixed signals | Clear per-service metrics |
| **Debugging** | Hard to isolate | Service-specific |
| **Team Ownership** | Shared | Clear responsibility |
| **Database Outage** | Both affected | One affected |
| **Code Complexity** | Higher | Lower per service |

---

## Decision: ✅ Confirmed

**We will separate into 2 microservices:**
1. **zinga** — Wallet service (PostgreSQL)
2. **zuma** — Transaction service (MongoDB)

Each service owns its database. Service-to-service communication via REST + service tokens.

---

**Author:** Architecture Review  
**Date:** 2026-11-14  
**Status:** Approved for implementation  
**Next Step:** Scaffold zinga microservice
