# Transaction & Ledger Immutability Review

## Executive Summary

The current zuma architecture has **strong foundations** for transaction immutability:
- ✅ Append-only ledger (LedgerEntry collection)
- ✅ Atomic state transitions (CAS on Transaction.status)
- ✅ Idempotent operations (idempotencyKey)
- ✅ Audit logs (AuditLog collection)
- ✅ Immutable raw transaction data (rawTx stored once, never updated)

**Recommended enhancements** to achieve blockchain-like immutability and fraud prevention:
1. **Cryptographic hashing** — Chain transactions with merkle hashes
2. **Ledger entry chaining** — Each entry references previous for tamper detection
3. **Transaction sealing** — Cryptographic signatures for non-repudiation
4. **Block anchoring** — Group transactions into logical blocks with proof-of-integrity
5. **Tamper detection** — Hash verification on reads to detect unauthorized database modifications

---

## Current Architecture Review

### ✅ **Strengths**

#### 1. Append-Only Ledger Pattern
**File:** `services/wallet-service/src/domain/entities/ledger-entry.entity.ts`

```typescript
// LedgerEntry is append-only; once created, never modified.
export interface LedgerEntryEntity {
  id: string;
  walletId: string;
  transactionId: string;
  kind: 'debit' | 'credit';
  reason: 'send' | 'refund' | 'deposit';
  amountSats: number;
  state: 'pending' | 'applied';
  balanceAfterSats: number | null;
  createdAt: Date;  // ← no updatedAt
}
```

**Impact:** Prevents retroactive balance manipulation. Every balance change is recorded with:
- Unique index on `{transactionId, kind, reason}` — prevents duplicate movements
- Immutable `createdAt` — chronological proof
- `balanceAfterSats` — point-in-time snapshot of balance

**Fraud prevention:** ✅ Cannot edit existing ledger entries; can only append new ones.

---

#### 2. Atomic State Transitions (Compare-and-Swap)
**File:** `services/transaction-service/src/domain/entities/transaction.entity.ts`

Transaction lifecycle enforced via CAS operations (no unguarded updates):
```
pending → [debit rejected → failed]
       → [debit ok → broadcasting]
broadcasting → [broadcast rejected → failed + refund]
            → [broadcast accepted → broadcast]
broadcast → confirmed
```

**Impact:** ✅ Race conditions prevented; state can only transition through allowed paths.

---

#### 3. Idempotent Operations
**File:** `services/transaction-service/src/domain/entities/transaction.entity.ts`

```typescript
idempotencyKey: string | null;  // Unique per ownerUserId
```

**Domain model doc (line 126):**
> "Debit transport failure: the tx stays `pending` with `debitedAt = null`. 
> Replaying the same `Idempotency-Key` resumes the (idempotent) debit."

**Impact:** ✅ Prevents duplicate ledger movements if the API call is retried.

---

#### 4. Immutable Raw Transaction Data
**File:** `services/transaction-service/src/domain/entities/transaction.entity.ts`

```typescript
rawTx: string | null;  // Signed tx, written once, never returned, redacted from logs
```

**Domain model doc (line 63):**
> "Signed tx, written in the same insert as the record; never returned by the API, 
> redacted from logs."

**Impact:** ✅ Raw transaction data is immutable proof of what was signed and broadcast.

---

#### 5. Audit Trail
**File:** `services/transaction-service/src/domain/entities/audit-log.entity.ts`

```typescript
export interface AuditLogEntity {
  id: string;
  actorUserId: string;
  action: string;           // 'transaction.created', 'transaction.broadcast', etc.
  entityType: string;       // 'transaction'
  entityId: string;         // transaction id
  metadata: Record<string, unknown>;
  createdAt: Date;          // no updatedAt
}
```

**Recorded events:**
- `transaction.created`
- `transaction.debit_rejected`
- `transaction.broadcast`
- `transaction.broadcast_failed`

**Impact:** ✅ WHO, WHAT, WHEN is recorded for compliance.

---

### ⚠️ **Gaps & Risks**

| Risk | Severity | Impact | Current Mitigation |
|---|---|---|---|
| **No transaction hash** | Medium | Cannot verify integrity of original tx without blockchain node | Check against on-chain txid after broadcast |
| **No ledger entry chaining** | Medium | Database-level edit of ledger entries not detectable | Audit log doesn't prove physical database wasn't modified |
| **No digital signatures** | High | Cannot prove transaction was authorized by the wallet owner | API auth (JWT) + service tokens |
| **No block-level proof** | Low | Cannot group & verify multiple transactions as a unit | Individual tx immutability via CAS |
| **Ledger entry state mutation** | Medium | Entry can transition `pending → applied`; state field not truly immutable | Unique index + idempotency prevents duplicates, but field still mutable |
| **No temper detection on read** | Medium | If database is compromised, unauthorized changes won't be detected until audit | Regular hash verification checks would catch it |
| **No Merkle tree** | Low | No cryptographic proof that ledger entries haven't been reordered | Timestamp ordering + audit trail |

---

## Recommended Enhancements

### 🔹 **Enhancement 1: Transaction Hashing (Merkle Tree)**

**Goal:** Create a cryptographic hash of each transaction that cannot be changed without detection.

**Implementation:**

Add to `TransactionEntity`:
```typescript
export interface TransactionEntity {
  // ... existing fields ...
  
  // Cryptographic hash of immutable transaction data (txid + amount + recipient + timestamp)
  transactionHash: string | null;    // Set once broadcast; immutable proof
  
  // Previous transaction hash in the wallet's history (merkle chain)
  previousTransactionHash: string | null;
  
  // Merkle tree root of all transactions up to this point
  merkleRoot: string | null;         // Set once confirmed
}
```

**Algorithm:**
```typescript
// SHA-256 hash of: walletId + txid + amount + destinationAddress + broadcastAt
transactionHash = sha256(
  JSON.stringify({
    walletId,
    txid,
    amount,
    destinationAddress,
    feeSats,
    broadcastAt,
  })
);

// Previous transaction in wallet's history
previousTransactionHash = wallet.lastTransactionHash;

// Update wallet's last transaction hash
wallet.lastTransactionHash = transactionHash;
```

**Benefits:**
- ✅ Detect any modification to key transaction fields
- ✅ Prove transaction was not reordered in wallet history
- ✅ Compatible with blockchain proof-of-work (txid is immutable)

**Effort:** Medium (3-4 days)
- Add hash fields to domain entities
- Compute hashes on transaction confirmation
- Add hash verification endpoints
- Update tests

---

### 🔹 **Enhancement 2: Ledger Entry Chaining**

**Goal:** Create a chain of ledger entries where each references the previous, making reordering detectable.

**Implementation:**

Add to `LedgerEntryEntity`:
```typescript
export interface LedgerEntryEntity {
  // ... existing fields ...
  
  // Previous ledger entry hash (the one immediately before this one in the wallet's ledger)
  previousLedgerHash: string | null;
  
  // SHA-256(walletId + kind + reason + amountSats + createdAt + previousLedgerHash)
  currentLedgerHash: string;
  
  // Running cumulative balance proof (for detect-reorder)
  cumulativeHash: string;
}
```

**Algorithm:**
```typescript
// Hash the current entry along with the previous entry's hash
currentLedgerHash = sha256(
  JSON.stringify({
    walletId,
    kind,           // 'debit' | 'credit'
    reason,         // 'send' | 'refund' | 'deposit'
    amountSats,
    balanceAfterSats,
    createdAt,
    previousLedgerHash,  // Last entry's currentLedgerHash
  })
);

// Cumulative hash includes all previous entries
cumulativeHash = sha256(
  previousCumulativeHash + currentLedgerHash
);
```

**Benefits:**
- ✅ Detect unauthorized reordering of ledger entries
- ✅ Prove wallet's complete transaction history
- ✅ Enable periodic verification: `verifyLedgerChain(walletId)` computes all hashes and compares to stored values

**Effort:** Medium (3-4 days)
- Add hash fields to domain entities
- Compute hashes on ledger entry creation
- Add hash verification service
- Update tests

---

### 🔹 **Enhancement 3: Transaction Sealing (Digital Signatures)**

**Goal:** Add cryptographic proof that a transaction was authorized by the wallet owner.

**Implementation:**

Add to `TransactionEntity`:
```typescript
export interface TransactionEntity {
  // ... existing fields ...
  
  // ECDSA signature of (walletId + amount + destinationAddress + feeRate + timestamp)
  // Signed by the wallet's private key (held in HSM / KMS)
  sealSignature: string | null;      // hex-encoded signature
  
  // Public key (or key id) used to create the signature (for verification)
  sealKeyId: string | null;          // references a managed key in KMS
  
  // Timestamp of sealing (should match createdAt)
  sealedAt: Date | null;
}
```

**Algorithm:**
```typescript
// Data to be signed (immutable by the time we seal)
const toSign = JSON.stringify({
  walletId,
  amount,
  destinationAddress,
  feeRate,
  createdAt,
});

// Sign with wallet's private key (in HSM)
sealSignature = await kms.sign(sealKeyId, toSign);
sealedAt = new Date();
```

**Verification:**
```typescript
// Verify signature matches the transaction data
const verified = await kms.verify(
  sealKeyId,
  sealSignature,
  JSON.stringify({ walletId, amount, destinationAddress, feeRate, createdAt })
);
```

**Benefits:**
- ✅ Non-repudiation: wallet owner cannot deny creating the transaction
- ✅ Detect tampering: if amount/address is modified, signature verification fails
- ✅ Multi-signature support (future): require multiple approvals for large transfers

**Effort:** High (1-2 weeks)
- Integrate with KMS (AWS KMS, HashiCorp Vault, or HSM)
- Update TransactionEntity domain
- Add signature verification endpoints
- Security audit for key management
- Update tests and documentation

---

### 🔹 **Enhancement 4: Block-Level Anchoring (Merkle Tree Root)**

**Goal:** Group transactions into logical "blocks" and compute a Merkle tree root that proves integrity of all transactions in a period.

**Implementation:**

Create new `TransactionBlockEntity`:
```typescript
export interface TransactionBlockEntity {
  // Logical block containing transactions created in a time window
  id: string;
  
  // Block number / sequence (monotonically increasing)
  blockNumber: number;
  
  // Time window: transactions with createdAt in [blockStartTime, blockEndTime)
  blockStartTime: Date;
  blockEndTime: Date;
  
  // List of transaction IDs included in this block
  transactionIds: string[];
  
  // Merkle tree root of all transactions in this block
  merkleRoot: string;
  
  // Hash of previous block (chain previous blocks)
  previousBlockHash: string | null;
  
  // Hash of this block
  blockHash: string;
  
  // Timestamp when block was finalized
  finalizedAt: Date;
}
```

**Algorithm:**
```typescript
// 1. Collect all transactions in time window
const transactions = await txRepository.findByCreatedAtRange(
  blockStartTime,
  blockEndTime
);

// 2. Compute Merkle tree root
const merkleLeaves = transactions.map(tx => tx.transactionHash);
const merkleRoot = computeMerkleRoot(merkleLeaves);

// 3. Create block
const block = {
  blockNumber: lastBlock.blockNumber + 1,
  blockStartTime,
  blockEndTime,
  transactionIds: transactions.map(tx => tx.id),
  merkleRoot,
  previousBlockHash: lastBlock.blockHash,
  blockHash: sha256(JSON.stringify({
    blockNumber: blockNumber,
    merkleRoot,
    previousBlockHash,
    blockEndTime,
  })),
  finalizedAt: new Date(),
};
```

**Benefits:**
- ✅ Prove all transactions in a time period haven't been modified
- ✅ Detect missing transactions (hash doesn't match)
- ✅ Compatible with periodic attestation (hash can be published to immutable log)

**Effort:** Medium (2-3 weeks)
- Create new TransactionBlock domain entity
- Implement Merkle tree computation (use existing crypto library)
- Add block finalization service (scheduled job, nightly)
- Add block verification endpoint
- Update tests

---

### 🔹 **Enhancement 5: Tamper Detection Service**

**Goal:** Periodically verify that ledger entries and transactions haven't been modified at the database level.

**Implementation:**

Create new service `TransactionTamperDetectionService`:
```typescript
export interface TamperDetectionResult {
  walletId: string;
  isValid: boolean;  // true if all hashes match
  errors: {
    transactionId: string;
    field: string;
    expected: string;
    actual: string;
  }[];
  checkedAt: Date;
  nextCheckScheduledAt: Date;
}

export class TransactionTamperDetectionService {
  // Verify all ledger entry hashes match their stored values
  async verifyLedgerChain(walletId: string): Promise<TamperDetectionResult> {
    const entries = await ledgerRepo.findByWalletId(walletId);
    const errors: TamperDetectionResult['errors'] = [];
    
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const previousEntry = i > 0 ? entries[i - 1] : null;
      
      // Recompute the hash
      const recomputedHash = sha256(JSON.stringify({
        walletId,
        kind: entry.kind,
        reason: entry.reason,
        amountSats: entry.amountSats,
        balanceAfterSats: entry.balanceAfterSats,
        createdAt: entry.createdAt,
        previousLedgerHash: previousEntry?.currentLedgerHash || null,
      }));
      
      // Compare
      if (recomputedHash !== entry.currentLedgerHash) {
        errors.push({
          transactionId: entry.transactionId,
          field: 'currentLedgerHash',
          expected: recomputedHash,
          actual: entry.currentLedgerHash,
        });
      }
    }
    
    return {
      walletId,
      isValid: errors.length === 0,
      errors,
      checkedAt: new Date(),
      nextCheckScheduledAt: addDays(new Date(), 7), // Weekly checks
    };
  }
  
  // Verify transaction hashes
  async verifyTransactionChain(walletId: string): Promise<TamperDetectionResult> {
    // Similar pattern for transactions
  }
  
  // Alert if tamper is detected
  async reportTamper(walletId: string): Promise<void> {
    await alerting.sendSecurityAlert({
      severity: 'CRITICAL',
      type: 'LEDGER_TAMPER_DETECTED',
      walletId,
      action: 'FREEZE_WALLET',  // Prevent further transactions
    });
  }
}
```

**Scheduled Verification:**
```typescript
// Daily job (configurable)
@Scheduled('0 2 * * *')  // 2 AM daily
async verifyAllWallets() {
  const wallets = await walletRepo.findAll();
  for (const wallet of wallets) {
    const result = await tamperDetectionService.verifyLedgerChain(wallet.id);
    if (!result.isValid) {
      await tamperDetectionService.reportTamper(wallet.id);
    }
  }
}
```

**Benefits:**
- ✅ Detect unauthorized database modifications
- ✅ Alert security team immediately
- ✅ Enable forensic analysis (compare logs to expected hashes)
- ✅ Satisfy compliance audits (regular integrity checks)

**Effort:** Low (2-3 days)
- Create TamperDetectionService
- Add verification logic for hashes
- Set up scheduled jobs
- Create alerting integration
- Update tests

---

## Implementation Roadmap

### Phase 1 (Weeks 1-2): **Foundation** ✅ Already have
- Append-only ledger ✅
- Atomic state transitions ✅
- Idempotent operations ✅
- Audit logs ✅

### Phase 2 (Weeks 3-4): **Hashing Layer**
1. Add transaction hashing (Enhancement 1)
2. Add ledger entry chaining (Enhancement 2)
3. Add hash verification endpoints

**Effort:** 1-2 weeks  
**Risk:** Low (additive, no breaking changes)  
**Dependencies:** None

### Phase 3 (Weeks 5-6): **Digital Signatures**
1. Integrate with KMS/HSM
2. Add transaction sealing (Enhancement 3)
3. Add signature verification

**Effort:** 2-3 weeks  
**Risk:** Medium (KMS integration)  
**Dependencies:** KMS setup (AWS KMS, Vault, or HSM)

### Phase 4 (Weeks 7-9): **Block Anchoring**
1. Implement block entity (Enhancement 4)
2. Create block finalization service
3. Add block verification endpoint

**Effort:** 2-3 weeks  
**Risk:** Low (scheduled job, no real-time impact)  
**Dependencies:** Phase 2 (transaction hashing)

### Phase 5 (Weeks 10-11): **Tamper Detection**
1. Create TamperDetectionService (Enhancement 5)
2. Set up scheduled verification jobs
3. Create alerting integration

**Effort:** 1-2 weeks  
**Risk:** Low (read-only verification)  
**Dependencies:** Phase 2 (hashing), alerting system

---

## Security Considerations

### Key Management (for Digital Signatures)
- Use AWS KMS, HashiCorp Vault, or HSM for private key storage
- Never store private keys in application code or database
- Rotate keys regularly (annual or on-demand)
- Enable CloudTrail / audit logging for key usage

### Hash Storage
- Store computed hashes in immutable database columns
- Use database constraints to prevent updates (e.g., MongoDB `readOnly` flag if available)
- Consider separate read-only replica for verification queries

### Verification Frequency
- Initial: Weekly tamper detection jobs
- Production: Daily or continuous
- High-value wallets: Real-time verification on every transaction

### Compliance
- Document all security measures for SOC 2 / PCI-DSS audits
- Maintain detailed logs of verification results
- Generate compliance reports quarterly

---

## API Changes

### New Endpoints

**GET `/wallets/:walletId/ledger/verify`**
Verify ledger entry chain and return status:
```json
{
  "walletId": "...",
  "isValid": true,
  "entriesVerified": 1523,
  "checksumMismatch": 0,
  "lastVerifiedAt": "2024-11-14T10:30:00Z",
  "cumulativeHash": "abc123..."
}
```

**GET `/transactions/:transactionId/verify`**
Verify transaction hash and signature:
```json
{
  "transactionId": "...",
  "isHashValid": true,
  "isSignatureValid": true,
  "transactionHash": "def456...",
  "previousTransactionHash": "abc123...",
  "sealedAt": "2024-11-14T10:25:00Z"
}
```

**GET `/blocks/:blockNumber`**
Get block details and merkle root:
```json
{
  "blockNumber": 42,
  "blockStartTime": "2024-11-14T00:00:00Z",
  "blockEndTime": "2024-11-14T04:00:00Z",
  "transactionCount": 523,
  "merkleRoot": "ghi789...",
  "blockHash": "jkl012...",
  "previousBlockHash": "abc123...",
  "finalizedAt": "2024-11-14T04:01:00Z"
}
```

**POST `/audit/verify-tamper`** (admin only)
Trigger immediate tamper detection across all wallets:
```json
{
  "walletsChecked": 1523,
  "tampersDetected": 0,
  "issuesFound": [],
  "completedAt": "2024-11-14T10:35:00Z"
}
```

---

## Testing Strategy

### Unit Tests
- Hash computation matches known values
- Ledger chain verification correctly detects modifications
- Signature verification works with test keys
- Block merkle root computation

### Integration Tests
- Create transaction → verify hash
- Create ledger entry → verify chain
- Seal transaction → verify signature
- Create block → verify merkle root

### Chaos Testing
- Manually corrupt a hash in database → tamper detection catches it
- Reorder ledger entries → verification fails
- Modify transaction amount → signature fails
- Delete transaction → merkle root fails

---

## Backward Compatibility

**All enhancements are additive:**
- Existing transactions without hashes still work
- New fields are nullable
- Verification is opt-in via new endpoints
- No breaking changes to current API

**Migration strategy:**
1. Deploy with new nullable fields
2. Start computing hashes for new transactions
3. Backfill hashes for existing transactions (async job)
4. Enable verification after 100% backfill

---

## FAQ

**Q: Does this replace the blockchain?**
A: No. The blockchain remains the source of truth for on-chain transactions. This provides application-level immutability for the off-chain ledger and transaction records.

**Q: What if the database is compromised?**
A: Tamper detection jobs would catch unauthorized changes. Frequent verification (daily/real-time) minimizes the window of undetected tampering.

**Q: Can users forge transactions?**
A: With digital signatures + KMS, transactions would need access to the private key. Without the signature, transactions can be detected as fraudulent.

**Q: What about compliance (SOC 2, PCI-DSS)?**
A: These enhancements directly support compliance requirements for transaction immutability, audit trails, and integrity verification.

**Q: Performance impact?**
A: Minimal:
- Hash computation: O(1), < 1ms
- Chain verification: O(n) ledger entries, batched nightly
- Signature verification: < 5ms via KMS

---

## Conclusion

The current zuma architecture has strong immutability guarantees through append-only patterns and atomic state transitions. The recommended enhancements add **blockchain-like cryptographic proof** of transaction integrity, detect tampering at the database level, and provide **non-repudiation** via digital signatures.

**Recommended priority:**
1. **Phase 2** (Hashing) — Low effort, high value; start first
2. **Phase 3** (Signatures) — High value for compliance; requires KMS setup
3. **Phase 4** (Blocks) — Nice-to-have; enables periodic attestation
4. **Phase 5** (Tamper Detection) — Essential for security; implement after hashing

**Next step:** Choose a phase and create detailed implementation tickets.
