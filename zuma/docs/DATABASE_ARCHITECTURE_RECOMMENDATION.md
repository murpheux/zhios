# Database Architecture Recommendation: Ledger vs Transactions

Comprehensive analysis of optimal database choices for ledger and transaction storage with recommendations for zuma.

---

## Executive Summary

### ⭐ **Recommendation: Separate Databases**

| Component | Database | Rationale |
|---|---|---|
| **Ledger** | **PostgreSQL** (primary) or **TimescaleDB** (premium) | ACID, strong consistency, immutable-friendly, time-series native |
| **Transactions** | **MongoDB** (current) | Document flexibility, CAS support, cross-service queries |
| **Ledger Backup** | **Event Log** (append-only) | Blockchain-like immutability, tampering detection, audit trail |

### Why Separate?

**Ledger (wallet-service):**
- Append-only, never updates existing entries
- Requires strong ACID guarantees
- High consistency for balance integrity
- Time-series data (ordered by time)
- Few writes, frequent reads
- Must be tamper-proof

**Transactions (transaction-service):**
- Frequent state mutations (pending → broadcasting → confirmed)
- Compare-and-swap (CAS) operations
- References external state (blockchain)
- Large binary fields (rawTx)
- Loose consistency (eventual consistency OK)
- Status-heavy queries

These are fundamentally different access patterns and consistency requirements.

---

## Analysis by Option

### Option 1: ❌ Same Database (MongoDB)
**Current state — keep as-is**

**Pros:**
- ✅ Single database to manage
- ✅ Lower infrastructure cost
- ✅ Simpler deployment

**Cons:**
- ❌ MongoDB not ideal for append-only, immutable data
- ❌ No ACID transactions (multi-doc transactions require replica set)
- ❌ Harder to detect tampering
- ❌ No native time-series optimization
- ❌ Balance updates use weak patterns (`$inc` + pending markers)
- ❌ Harder to audit (no transaction log)
- ❌ Can't easily verify ledger integrity without recomputing

**Risk:** Medium  
**Recommendation:** ⚠️ **Not recommended for production financial system**

---

### Option 2: ✅ **PostgreSQL for Ledger + MongoDB for Transactions**
**RECOMMENDED**

#### **PostgreSQL for Ledger (wallet-service)**

**Why PostgreSQL?**

```
Ledger Requirements          PostgreSQL Feature
────────────────────────────────────────────────
Append-only writes          INSERT-only + constraints
Immutable once created       CHECK constraints
Point-in-time balance        SELECT with ORDER BY + LIMIT 1
Strong consistency           ACID transactions
Time-series queries          INDEX on (walletId, createdAt)
Tamper detection            Hash verification + triggers
Audit requirements          Native transaction log
```

**Schema Example:**

```sql
CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL,
  transaction_id UUID NOT NULL,
  kind LEDGER_KIND NOT NULL,  -- 'debit' | 'credit'
  reason LEDGER_REASON NOT NULL,  -- 'send' | 'refund' | 'deposit'
  amount_sats BIGINT NOT NULL CHECK (amount_sats > 0),
  state LEDGER_STATE NOT NULL DEFAULT 'pending',  -- 'pending' | 'applied'
  balance_after_sats BIGINT,
  
  -- Cryptographic chain (Enhancement 2)
  previous_ledger_hash VARCHAR(64),
  current_ledger_hash VARCHAR(64) NOT NULL,
  cumulative_hash VARCHAR(64) NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Immutability enforcement
  CONSTRAINT no_updates CHECK (true),  -- Enforced at app layer
  
  -- Unique: one movement per transaction/direction/reason
  UNIQUE (transaction_id, kind, reason),
  
  -- Indexes
  UNIQUE INDEX idx_tx_kind_reason ON (transaction_id, kind, reason),
  INDEX idx_wallet_created ON (wallet_id, created_at DESC),
  INDEX idx_wallet_balance ON (wallet_id, state, created_at DESC),
  INDEX idx_current_hash ON (current_ledger_hash),
  
  -- Foreign keys
  CONSTRAINT fk_wallet FOREIGN KEY (wallet_id) 
    REFERENCES wallets(id) ON DELETE RESTRICT
);

-- Prevent any updates to ledger entries
CREATE TRIGGER prevent_ledger_updates
  BEFORE UPDATE ON ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION raise_immutability_error();

-- Function to raise error on attempted update
CREATE OR REPLACE FUNCTION raise_immutability_error()
  RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Ledger entries are immutable and cannot be updated';
END;
$$ LANGUAGE plpgsql;
```

**Pros:**
- ✅ **ACID**: Full transactional integrity (ledger can't be partially applied)
- ✅ **Immutable enforcement**: Triggers prevent updates
- ✅ **Time-series**: Native support via ORDER BY + indexes
- ✅ **Strong consistency**: Synchronous writes, no eventual consistency issues
- ✅ **Audit trail**: PostgreSQL WAL (Write-Ahead Log) provides tamper-proof log
- ✅ **Balance queries**: Fast range queries, exact balance computation
- ✅ **Compliance**: SOC 2 / PCI-DSS aligned (audit trail, immutability)

**Cons:**
- ⚠️ Operational overhead (needs replication for HA)
- ⚠️ Different tech stack (now managing both PostgreSQL and MongoDB)
- ⚠️ Migration effort (if moving from MongoDB)

**Cost:** Moderate  
**Operational Effort:** Medium (backup, replication, monitoring)

---

#### **MongoDB for Transactions (transaction-service)**

**Why MongoDB?**

```
Transaction Requirements      MongoDB Feature
──────────────────────────────────────────────
State mutations               Document updates
CAS operations               findOneAndUpdate with query conditions
Flexible schema              Schema-less or flexible schema
Cross-service queries        Aggregation pipeline
Large binary fields          BSON supports binary data
Status enum tracking         Document fields
Cross-service references     No joins needed (denormalization OK)
```

**Schema Example:**

```javascript
// transactions collection
{
  _id: ObjectId("..."),
  walletId: "wallet-123",
  ownerUserId: "user-456",
  idempotencyKey: "client-generated-key-xyz",
  
  // Core transaction data
  txid: "abc123def456...",  // null until broadcast
  type: "send",  // 'send' | 'receive' | 'internal-transfer'
  amount: "100000",  // satoshis as string
  feeRate: "5",  // sat/vB
  feeSats: "1000",
  destinationAddress: "bc1q...",
  
  // Status machine
  status: "broadcast",  // pending → broadcasting → broadcast → confirmed | failed
  failureReason: null,
  confirmations: 3,
  
  // Timing
  debitedAt: ISODate("2024-11-14T10:25:00Z"),
  broadcastAt: ISODate("2024-11-14T10:26:00Z"),
  refundedAt: null,
  
  // Raw transaction (never returned)
  rawTx: BinData(0, "..."),  // Binary-encoded signed tx
  
  // Hashing (Enhancement 1)
  transactionHash: "abc123...",  // SHA-256
  previousTransactionHash: "def456...",
  merkleRoot: "ghi789...",
  
  // Digital signature (Enhancement 3)
  sealSignature: "signature-hex-string",
  sealKeyId: "arn:aws:kms:us-east-1:123456789012:key/...",
  sealedAt: ISODate("2024-11-14T10:27:00Z"),
  
  // Audit
  createdAt: ISODate("2024-11-14T10:20:00Z"),
  updatedAt: ISODate("2024-11-14T10:27:00Z"),
}

// Indexes
db.transactions.createIndex({ walletId: 1, createdAt: -1 });
db.transactions.createIndex({ ownerUserId: 1, idempotencyKey: 1 });
db.transactions.createIndex({ status: 1, createdAt: -1 });
db.transactions.createIndex({ txid: 1 });
db.transactions.createIndex({ transactionHash: 1 });
```

**Pros:**
- ✅ **CAS support**: findOneAndUpdate with conditions
- ✅ **Schema flexibility**: New fields don't break existing documents
- ✅ **Multi-service**: Works well with transaction-service architecture
- ✅ **Binary support**: rawTx stored natively
- ✅ **No joins**: Denormalization is fine here

**Cons:**
- ⚠️ Not ideal for immutable append-only data
- ⚠️ Eventual consistency if using multi-node cluster
- ⚠️ No strong ACID for multi-document transactions

---

### Option 3: 🟡 **TimescaleDB for Ledger**
**Alternative to PostgreSQL — Premium choice**

**What:** PostgreSQL extension optimized for time-series data

**Advantages over PostgreSQL:**
- ✅ Native time-series optimizations
- ✅ Automatic data compression
- ✅ Better query performance for time-range queries
- ✅ Retention policies (auto-delete old data if needed)
- ✅ Native downsampling for analytics

**Example schema:**

```sql
-- TimescaleDB hypertable (auto-partitions by time)
CREATE TABLE ledger_entries (
  created_at TIMESTAMPTZ NOT NULL,
  wallet_id UUID NOT NULL,
  transaction_id UUID NOT NULL,
  kind LEDGER_KIND NOT NULL,
  reason LEDGER_REASON NOT NULL,
  amount_sats BIGINT NOT NULL,
  state LEDGER_STATE NOT NULL DEFAULT 'pending',
  balance_after_sats BIGINT,
  current_ledger_hash VARCHAR(64) NOT NULL,
  previous_ledger_hash VARCHAR(64),
  cumulative_hash VARCHAR(64) NOT NULL,
  
  UNIQUE (transaction_id, kind, reason),
);

-- Convert to hypertable (auto-partitioned by time)
SELECT create_hypertable('ledger_entries', 'created_at', 
  if_not_exists => TRUE);

-- Compression policy
SELECT add_compression_policy('ledger_entries',
  INTERVAL '7 days', if_not_exists => TRUE);

-- Fast time-range queries
SELECT * FROM ledger_entries
WHERE wallet_id = 'wallet-123'
  AND created_at >= NOW() - INTERVAL '30 days'
ORDER BY created_at DESC;
```

**Cost:** Higher (managed service like Timescale Cloud recommended)  
**Operational Effort:** Low (fully managed)  
**Recommendation:** ⭐ **If budget allows, this is the premium option**

---

### Option 4: 🟡 **Event-Sourced Ledger**
**Specialized approach**

**Concept:** Ledger as append-only event log

```
Event Stream (immutable log):
  Event 1: Wallet 123 debited 100,000 sats for transaction ABC
  Event 2: Wallet 123 credited 500,000 sats for deposit XYZ
  Event 3: Wallet 123 debited 5,000 sats for fee refund ABC
  
Current Balance = Replay all events and sum credits - debits
```

**Storage Options:**
- **PostgreSQL with event table** (simple)
- **Event Store** (specialized event database)
- **Kafka** (streaming events)
- **S3** (immutable log in cloud storage)

**Pros:**
- ✅ Complete audit trail (every event is recorded)
- ✅ Perfect for blockchain-like immutability
- ✅ Temporal queries (balance at any point in time)
- ✅ Replay for debugging/reconciliation

**Cons:**
- ❌ Requires replay to compute current balance (slow)
- ❌ More complex (need event store + snapshot pattern)
- ❌ Not suitable as primary ledger storage

**Recommendation:** 🟡 **Use as supplementary audit log, not primary ledger**

---

### Option 5: 🔴 **Blockchain / Immutable Ledger**
**Theoretical — not practical for this use case**

**Example:** Store ledger on Ethereum/Polygon as smart contract

**Pros:**
- ✅ Cryptographically immutable
- ✅ Decentralized verification
- ✅ Public audit trail

**Cons:**
- ❌ Extremely slow (block time: 12-15 seconds per entry)
- ❌ Extremely expensive (gas fees: $1-100 per entry)
- ❌ Can't modify entries (no refunds possible)
- ❌ Not suitable for frequent transactions

**Recommendation:** 🔴 **Not recommended** — Use blockchain for final settlement only, not ledger

---

## 📊 Comparison Matrix

| Criterion | PostgreSQL | TimescaleDB | MongoDB | Event Sourcing | Blockchain |
|---|---|---|---|---|---|
| **ACID Transactions** | ✅ Yes | ✅ Yes | ⚠️ Limited | ⚠️ Limited | ❌ No |
| **Immutability** | ✅ (triggers) | ✅ (triggers) | ⚠️ (app layer) | ✅ (append-only) | ✅ (crypto) |
| **Time-Series** | ✅ Good | ✅ Excellent | ⚠️ OK | ✅ Good | ❌ No |
| **Query Speed** | ✅ Fast | ✅ Excellent | ✅ Fast | ⚠️ Slow (replay) | ❌ Very slow |
| **Cost (small)** | ✅ Low | ⚠️ Moderate | ✅ Low | ⚠️ Moderate | ❌ High |
| **Cost (large)** | ✅ Low | ✅ Moderate | ⚠️ High | ⚠️ Moderate | ❌ Extreme |
| **Operational** | ✅ Mature | ✅ Simple | ✅ Simple | ⚠️ Complex | ❌ Complex |
| **Tamper Detection** | ✅ Easy | ✅ Easy | ⚠️ Hard | ✅ Easy | ✅ Automatic |
| **Compliance** | ✅ SOC 2/PCI | ✅ SOC 2/PCI | ⚠️ Harder | ✅ Good | ⚠️ Questions |

---

## 🎯 Recommended Architecture

### Final Recommendation: **Option 2 (PostgreSQL + MongoDB) with Event Log**

```
┌─────────────────────────────────────────────────────────────┐
│                   ZUMA DATA ARCHITECTURE                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  wallet-service (Fastify)                           │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │  • Manages wallets (balance, status)                │    │
│  │  • Manages ledger entries (immutable)               │    │
│  │  • Verifies balance integrity                       │    │
│  └────────┬────────────────────────────────────────────┘    │
│           │                                                   │
│           ├─── PostgreSQL (Primary)                          │
│           │     ├─ wallets table                             │
│           │     ├─ ledger_entries table (append-only)        │
│           │     ├─ ledger_verification_logs                  │
│           │     └─ tamper_detection_reports                  │
│           │                                                   │
│           └─── Event Log (S3 / PostgreSQL)                   │
│                 └─ Immutable audit trail                     │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  transaction-service (Fastify)                      │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │  • Creates transactions (state machine)             │    │
│  │  • Tracks broadcast status                          │    │
│  │  • Verifies blockchain confirmations                │    │
│  └────────┬────────────────────────────────────────────┘    │
│           │                                                   │
│           ├─── MongoDB (Primary)                             │
│           │     ├─ transactions collection                   │
│           │     ├─ transaction_blocks collection             │
│           │     ├─ audit_logs collection                     │
│           │     └─ system_events collection                  │
│           │                                                   │
│           └─── Event Stream (Optional)                       │
│                 └─ SystemEvent collection for outbox         │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Backup & Verification                              │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │  • Daily: Verify ledger chain integrity             │    │
│  │  • Daily: Verify transaction hashes                 │    │
│  │  • Nightly: Finalize transaction blocks             │    │
│  │  • Weekly: Cross-service reconciliation             │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Database Details

#### **PostgreSQL (wallet-service primary)**

```yaml
Database: zuma_wallet
Tables:
  - wallets
      id: UUID (PK)
      label: TEXT
      address: TEXT
      balanceSats: BIGINT
      metadata: JSONB
      status: ENUM
      createdAt: TIMESTAMPTZ
      updatedAt: TIMESTAMPTZ
  
  - ledger_entries (IMMUTABLE)
      id: UUID (PK)
      wallet_id: UUID (FK)
      transaction_id: UUID
      kind: ENUM ('debit', 'credit')
      reason: ENUM ('send', 'refund', 'deposit')
      amount_sats: BIGINT (> 0)
      state: ENUM ('pending', 'applied')
      balance_after_sats: BIGINT
      previous_ledger_hash: TEXT
      current_ledger_hash: TEXT (NOT NULL)
      cumulative_hash: TEXT (NOT NULL)
      createdAt: TIMESTAMPTZ (DEFAULT NOW())
      
      CONSTRAINTS:
        - UNIQUE(transaction_id, kind, reason)
        - CHECK(amount_sats > 0)
        - TRIGGER: prevent_updates (on UPDATE)
      
      INDEXES:
        - UNIQUE(transaction_id, kind, reason)
        - (wallet_id, created_at DESC)
        - (current_ledger_hash)
```

**Replica Set:** 1 primary + 1 synchronous replica + 1 backup

**Backup Strategy:**
- WAL archiving to S3 (continuous)
- Daily snapshots to S3
- Point-in-time recovery (30 days)

---

#### **MongoDB (transaction-service primary)**

```yaml
Database: zuma_transaction
Collections:
  
  - transactions
      _id: ObjectId
      walletId: ObjectId
      ownerUserId: ObjectId
      idempotencyKey: String (indexed uniquely)
      txid: String (nullable)
      type: String enum ('send', 'receive', 'internal-transfer')
      amount: String (decimal)
      feeRate: String (decimal)
      feeSats: String (decimal)
      destinationAddress: String
      status: String enum (pending, broadcasting, broadcast, confirmed, failed)
      failureReason: String (nullable)
      confirmations: Number
      rawTx: BinData (never returned)
      transactionHash: String (nullable)
      previousTransactionHash: String (nullable)
      merkleRoot: String (nullable)
      sealSignature: String (nullable)
      sealKeyId: String (nullable)
      sealedAt: Date (nullable)
      debitedAt: Date (nullable)
      broadcastAt: Date (nullable)
      refundedAt: Date (nullable)
      createdAt: Date
      updatedAt: Date
      
      INDEXES:
        - UNIQUE(ownerUserId, idempotencyKey)
        - (walletId, createdAt DESC)
        - (status, createdAt DESC)
        - (txid)
        - (transactionHash)
  
  - transaction_blocks
      _id: ObjectId
      blockNumber: Number (unique)
      blockStartTime: Date
      blockEndTime: Date
      transactionIds: [ObjectId]
      merkleRoot: String
      blockHash: String
      previousBlockHash: String (nullable)
      finalizedAt: Date
  
  - audit_logs (immutable)
      _id: ObjectId
      actorUserId: ObjectId
      action: String
      entityType: String
      entityId: String
      metadata: Object
      createdAt: Date
  
  - system_events (immutable)
      _id: ObjectId
      eventType: String
      payload: Object
      createdAt: Date
      
      INDEXES:
        - (eventType, createdAt DESC)
        - (createdAt DESC)

Replica Set: 1 primary + 2 secondaries (quorum)
Backup Strategy:
  - Continuous replication to secondaries
  - Daily snapshots to S3
  - Point-in-time restore available
```

---

## 🔄 Cross-Service Data Sync

### **Synchronization Pattern**

```
wallet-service                    transaction-service
    ↓                                     ↓
  ledger_entries                   transactions
  (immutable log of debits)         (state machine)
    ↓                                     ↓
[wallet-service calls transaction-service for history]
[transaction-service calls wallet-service for debit/refund]
```

**Implementation:**
- `POST /internal/wallets/:id/debits` — wallet-service only, service-to-service auth
- `POST /internal/wallets/:id/credits` — wallet-service only, service-to-service auth
- `GET /internal/wallets/:id/ledger` — wallet-service only, service-to-service auth
- `GET /transactions/:id/history` — transaction-service calls wallet-service

**Idempotency:**
- Debit keyed on `(transactionId, 'debit', 'send')`
- Refund keyed on `(transactionId, 'credit', 'refund')`
- Ledger unique index prevents duplicates

---

## 📈 Scaling Considerations

### **Ledger (PostgreSQL)**

As ledger grows (millions of entries):

**Current (single instance):**
- ~1000 entries/sec write capacity
- Unlimited read capacity (index queries)
- ~100GB data per year

**Scaling options:**
1. **Sharding by wallet_id** — partition ledger across N PostgreSQL instances
2. **Read replicas** — separate read-only replicas for verification jobs
3. **Archiving** — move entries older than 1 year to cold storage (S3)
4. **Upgrade to TimescaleDB** — better for massive time-series (compression, chunking)

### **Transactions (MongoDB)**

As transactions grow (millions):

**Current (single instance):**
- ~5000 inserts/sec
- ~10000 updates/sec (status changes)
- ~100GB data per year

**Scaling options:**
1. **Sharding by walletId** — distribute transactions across shard key
2. **Replica set** — for HA and read scaling
3. **Archiving** — move confirmed/failed transactions to cold storage
4. **Separate confirmed collection** — immutable view of settled transactions

---

## 🔐 Security & Compliance

### **PostgreSQL (Ledger)**

**Security features:**
- ✅ Row-level security (RLS) — wallet owners can't see other wallets
- ✅ Encryption at rest — AWS RDS encryption or pgcrypto
- ✅ Encryption in transit — TLS 1.2+
- ✅ Immutability triggers — prevent any UPDATE
- ✅ Audit logging — PostgreSQL log_statement = 'all'
- ✅ Backup encryption — S3 with KMS
- ✅ Access control — IAM roles, not password auth

**Compliance:**
- ✅ SOC 2 Type II
- ✅ PCI-DSS 3.2 (for financial transactions)
- ✅ GDPR (right to be forgotten harder, but possible via deletion + ledger archive)

### **MongoDB (Transactions)**

**Security features:**
- ✅ Encryption at rest — AWS DocumentDB encryption
- ✅ Encryption in transit — TLS 1.2+
- ✅ Authentication — SCRAM or certificate-based
- ✅ Authorization — role-based access control
- ✅ Audit logging — MongoDB audit logs
- ✅ Backup encryption — automatic with AWS DocumentDB

**Compliance:**
- ⚠️ SOC 2 Type II (possible with proper configuration)
- ⚠️ PCI-DSS (requires careful data handling, no PII in documents)

---

## 📋 Migration Path (if currently all MongoDB)

### **Phase 1: Preparation (Week 1)**
- [ ] Set up PostgreSQL (RDS) instance
- [ ] Design ledger schema
- [ ] Create migration scripts
- [ ] Test data migration with sample data

### **Phase 2: Dual Write (Week 2-3)**
- [ ] Deploy code that writes to both MongoDB and PostgreSQL
- [ ] Verify data consistency
- [ ] Run queries in parallel, compare results
- [ ] Monitor for discrepancies

### **Phase 3: Read from PostgreSQL (Week 4)**
- [ ] Switch balance reads to PostgreSQL
- [ ] Switch ledger queries to PostgreSQL
- [ ] Monitor query performance
- [ ] Verify balance calculations match

### **Phase 4: Cutover (Week 5)**
- [ ] Stop MongoDB writes for ledger entries
- [ ] Verify all data is in PostgreSQL
- [ ] Switch all reads to PostgreSQL
- [ ] Keep MongoDB as backup for 30 days

### **Phase 5: Cleanup (Week 6+)**
- [ ] Archive old MongoDB data
- [ ] Delete ledger entries from MongoDB
- [ ] Monitor for issues
- [ ] Eventually decommission MongoDB ledger entries

---

## 💰 Cost Analysis (Annual, AWS managed services)

### **PostgreSQL (RDS, db.r5.xlarge multi-AZ)**
- Instance cost: ~$5,000/year
- Storage (100GB SSD): ~$1,000/year
- Backup (S3, 30-day retention): ~$500/year
- Data transfer: ~$500/year
- **Total: ~$7,000/year**

### **TimescaleDB (Cloud, medium tier)**
- Managed service: ~$500/month = $6,000/year
- Includes backup, replicas, monitoring
- **Total: ~$6,000/year**

### **MongoDB (Atlas, M30 multi-region)**
- Cluster: ~$3,000/year
- Backup: ~$500/year
- Data transfer: ~$1,000/year
- **Total: ~$4,500/year**

### **Combined (PostgreSQL + MongoDB)**
- PostgreSQL: $7,000/year
- MongoDB: $4,500/year
- **Total: ~$11,500/year**

**Cost vs. value:** $11,500/year buys you ACID ledger, SOC 2 compliance, tamper detection.

---

## 🎯 Final Recommendation Summary

| Question | Answer |
|---|---|
| **Should ledger & transactions be separate?** | ✅ **YES** — Different consistency & mutation patterns |
| **Database for ledger?** | ✅ **PostgreSQL** or 🟡 **TimescaleDB** for premium |
| **Database for transactions?** | ✅ **MongoDB** (keep current setup) |
| **Start when?** | 📋 **After Phase 2 of immutability review** (hashing layer stable) |
| **Migration risk?** | ⚠️ **Medium** — 4-6 weeks, needs careful testing |
| **Operational overhead?** | ⚠️ **Moderate** — Now managing two databases, but simpler per-DB |
| **Cost?** | 💰 **~$7-11K/year** — Worth it for compliance & reliability |

---

## 📚 Next Steps

1. **If staying with MongoDB:** Accept the tradeoffs, add application-layer immutability (Event 2: Ledger Entry Chaining from immutability review)

2. **If migrating to PostgreSQL:**
   - [ ] Provision PostgreSQL RDS instance
   - [ ] Design ledger schema (copy from section above)
   - [ ] Write migration script
   - [ ] Test with production-sized data
   - [ ] Plan 4-6 week migration window
   - [ ] Execute Phase 1-5 migration plan

3. **If using TimescaleDB:**
   - [ ] Provision TimescaleDB Cloud instance
   - [ ] Design ledger as hypertable
   - [ ] Same migration path as PostgreSQL
   - [ ] Added benefit: time-series optimizations

---

## 🔗 Related Documents

- [`TRANSACTION_IMMUTABILITY_REVIEW.md`](./TRANSACTION_IMMUTABILITY_REVIEW.md) — Security enhancements
- [`domain-model.md`](./domain-model.md) — Current data model
- [`security.md`](./security.md) — Security requirements

---

**Author:** Architecture Review  
**Date:** 2026-11-14  
**Status:** Ready for discussion  
**Decision Required:** Choose between PostgreSQL/TimescaleDB vs staying with MongoDB for ledger
