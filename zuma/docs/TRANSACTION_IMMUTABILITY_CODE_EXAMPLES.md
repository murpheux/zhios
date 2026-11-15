# Transaction Immutability — Code Examples

Practical implementation examples for blockchain-like transaction immutability features.

---

## 1. Transaction Hashing

### Domain Entity Update

**File:** `services/transaction-service/src/domain/entities/transaction.entity.ts`

```typescript
import crypto from 'crypto';

export interface TransactionEntity {
  // ... existing fields ...
  
  // Cryptographic hash of this transaction (immutable after broadcast)
  transactionHash: string | null;
  
  // Previous transaction hash in wallet history (merkle chain)
  previousTransactionHash: string | null;
  
  // Merkle root of all transactions in wallet up to this point
  merkleRoot: string | null;
}

/**
 * Compute SHA-256 hash of transaction immutable fields.
 * Called once after broadcast confirmation.
 */
export function computeTransactionHash(
  tx: Pick<TransactionEntity, 'walletId' | 'txid' | 'amount' | 'destinationAddress' | 'feeSats' | 'broadcastAt'>
): string {
  const data = JSON.stringify({
    walletId: tx.walletId,
    txid: tx.txid,
    amount: tx.amount,
    destinationAddress: tx.destinationAddress,
    feeSats: tx.feeSats,
    broadcastAt: tx.broadcastAt?.toISOString(),
  });
  
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Verify that a transaction hash is still valid (hasn't been tampered with).
 */
export function verifyTransactionHash(
  tx: Pick<TransactionEntity, 'walletId' | 'txid' | 'amount' | 'destinationAddress' | 'feeSats' | 'broadcastAt' | 'transactionHash'>
): boolean {
  if (!tx.transactionHash) return true; // Hash not yet computed
  if (!tx.txid || !tx.broadcastAt) return false; // Not broadcast yet
  
  const recomputed = computeTransactionHash(tx);
  return recomputed === tx.transactionHash;
}
```

### Use-Case Update

**File:** `services/transaction-service/src/application/use-cases/broadcast-transaction.use-case.ts`

```typescript
import { TransactionRepositoryPort } from '../ports';
import { computeTransactionHash } from '../../domain/entities/transaction.entity';

export class BroadcastTransactionUseCase {
  constructor(
    private transactionRepo: TransactionRepositoryPort,
    private bitcoinNode: BitcoinNodeClient,
  ) {}

  async execute(params: {
    transactionId: string;
    ownerUserId: string;
  }): Promise<void> {
    // 1. Get transaction
    const tx = await this.transactionRepo.findById(params.transactionId);
    if (!tx) throw new NotFoundError('Transaction not found');

    // 2. Broadcast to network
    const broadcastResult = await this.bitcoinNode.broadcastTransaction(tx.rawTx!);

    // 3. Transition to 'broadcast' and compute hash (atomic)
    const now = new Date();
    const transactionHash = computeTransactionHash({
      walletId: tx.walletId,
      txid: broadcastResult.txid,
      amount: tx.amount,
      destinationAddress: tx.destinationAddress,
      feeSats: tx.feeSats,
      broadcastAt: now,
    });

    // 4. Update transaction with txid, broadcastAt, and hash
    await this.transactionRepo.transition(
      tx.id,
      'broadcasting',
      'broadcast',
      {
        txid: broadcastResult.txid,
        broadcastAt: now,
        transactionHash,  // ← NEW: Immutable hash
        previousTransactionHash: tx.previousTransactionHash, // from wallet history
      }
    );
  }
}
```

### Verification Endpoint

**File:** `services/transaction-service/src/api/routes/transactions.routes.ts`

```typescript
import { Router } from 'fastify';
import { verifyTransactionHash } from '../../domain/entities/transaction.entity';

export function registerTransactionRoutes(router: Router) {
  /**
   * GET /transactions/:id/verify
   * Verify transaction hash and return verification status.
   */
  router.get(
    '/transactions/:id/verify',
    async (request, reply) => {
      const { id } = request.params as { id: string };
      
      const tx = await transactionRepo.findById(id);
      if (!tx) return reply.code(404).send({ error: 'Transaction not found' });

      const isHashValid = verifyTransactionHash(tx);
      
      return reply.send({
        transactionId: tx.id,
        status: tx.status,
        isHashValid,
        transactionHash: tx.transactionHash,
        previousTransactionHash: tx.previousTransactionHash,
        merkleRoot: tx.merkleRoot,
        broadcastAt: tx.broadcastAt,
      });
    }
  );
}
```

---

## 2. Ledger Entry Chaining

### Domain Entity Update

**File:** `services/wallet-service/src/domain/entities/ledger-entry.entity.ts`

```typescript
import crypto from 'crypto';

export interface LedgerEntryEntity {
  // ... existing fields ...
  
  // SHA-256 hash of previous ledger entry (immutable chain)
  previousLedgerHash: string | null;
  
  // SHA-256 hash of this entry (includes previousLedgerHash)
  currentLedgerHash: string;
  
  // Cumulative hash of all entries up to this point
  cumulativeHash: string;
}

/**
 * Compute hash for a ledger entry, including the previous entry's hash.
 * This creates a chain that cannot be reordered without detection.
 */
export function computeLedgerEntryHash(
  entry: Pick<LedgerEntryEntity, 'walletId' | 'kind' | 'reason' | 'amountSats' | 'balanceAfterSats' | 'createdAt' | 'previousLedgerHash'>
): string {
  const data = JSON.stringify({
    walletId: entry.walletId,
    kind: entry.kind,
    reason: entry.reason,
    amountSats: entry.amountSats,
    balanceAfterSats: entry.balanceAfterSats,
    createdAt: entry.createdAt.toISOString(),
    previousLedgerHash: entry.previousLedgerHash,
  });
  
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Compute cumulative hash of all entries (Merkle chain).
 */
export function computeCumulativeHash(
  previousCumulativeHash: string | null,
  currentEntryHash: string
): string {
  const combined = (previousCumulativeHash || '') + currentEntryHash;
  return crypto.createHash('sha256').update(combined).digest('hex');
}

/**
 * Verify that a ledger entry chain is intact (not reordered or modified).
 */
export function verifyLedgerEntryChain(
  entries: LedgerEntryEntity[]
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const previousEntry = i > 0 ? entries[i - 1] : null;
    
    // Verify previousLedgerHash matches previous entry's currentLedgerHash
    const expectedPreviousHash = previousEntry?.currentLedgerHash || null;
    if (entry.previousLedgerHash !== expectedPreviousHash) {
      errors.push(
        `Entry ${i} previousLedgerHash mismatch. Expected: ${expectedPreviousHash}, got: ${entry.previousLedgerHash}`
      );
    }
    
    // Recompute current entry's hash
    const recomputedHash = computeLedgerEntryHash(entry);
    if (entry.currentLedgerHash !== recomputedHash) {
      errors.push(
        `Entry ${i} currentLedgerHash mismatch. Expected: ${recomputedHash}, got: ${entry.currentLedgerHash}`
      );
    }
    
    // Verify cumulative hash
    const expectedCumulativeHash = computeCumulativeHash(
      previousEntry?.cumulativeHash || null,
      entry.currentLedgerHash
    );
    if (entry.cumulativeHash !== expectedCumulativeHash) {
      errors.push(
        `Entry ${i} cumulativeHash mismatch. Expected: ${expectedCumulativeHash}, got: ${entry.cumulativeHash}`
      );
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}
```

### Repository Implementation

**File:** `services/wallet-service/src/infrastructure/persistence/ledger.repository.ts`

```typescript
import { LedgerEntryEntity, computeLedgerEntryHash, computeCumulativeHash } from '../../domain/entities/ledger-entry.entity';

export class LedgerRepository {
  async createEntry(props: NewLedgerEntryProps): Promise<LedgerEntryEntity> {
    // Get the last ledger entry for this wallet
    const lastEntry = await this.db.collection('ledgerentries')
      .findOne(
        { walletId: props.walletId },
        { sort: { createdAt: -1 } }
      );

    // Compute hashes for this new entry
    const now = new Date();
    const previousLedgerHash = lastEntry?.currentLedgerHash || null;
    const currentLedgerHash = computeLedgerEntryHash({
      walletId: props.walletId,
      kind: props.kind,
      reason: props.reason,
      amountSats: props.amountSats,
      balanceAfterSats: null,  // Will be set to 'applied' state
      createdAt: now,
      previousLedgerHash,
    });
    const cumulativeHash = computeCumulativeHash(
      lastEntry?.cumulativeHash || null,
      currentLedgerHash
    );

    // Insert with hashes
    const entry: LedgerEntryEntity = {
      id: new ObjectId().toHexString(),
      walletId: props.walletId,
      transactionId: props.transactionId,
      kind: props.kind,
      reason: props.reason,
      amountSats: props.amountSats,
      state: 'pending',
      balanceAfterSats: null,
      previousLedgerHash,
      currentLedgerHash,
      cumulativeHash,
      createdAt: now,
    };

    await this.db.collection('ledgerentries').insertOne(entry);
    return entry;
  }
}
```

### Verification Service

**File:** `services/wallet-service/src/application/services/ledger-verification.service.ts`

```typescript
import { verifyLedgerEntryChain } from '../../domain/entities/ledger-entry.entity';

export class LedgerVerificationService {
  constructor(
    private ledgerRepo: LedgerRepository,
    private alerting: AlertingService,
  ) {}

  /**
   * Verify ledger chain integrity for a wallet.
   * Called as a scheduled job or on-demand for audits.
   */
  async verifyWalletLedger(walletId: string): Promise<VerificationResult> {
    // Fetch all ledger entries for wallet, in order
    const entries = await this.ledgerRepo.findByWalletId(walletId);
    
    // Verify the chain
    const { isValid, errors } = verifyLedgerEntryChain(entries);
    
    const result: VerificationResult = {
      walletId,
      isValid,
      entriesVerified: entries.length,
      errorCount: errors.length,
      errors: isValid ? [] : errors,
      cumulativeHash: entries.length > 0 ? entries[entries.length - 1].cumulativeHash : null,
      verifiedAt: new Date(),
    };
    
    // Alert if tampering is detected
    if (!isValid) {
      await this.alerting.sendSecurityAlert({
        severity: 'CRITICAL',
        type: 'LEDGER_CHAIN_TAMPER_DETECTED',
        walletId,
        details: result,
        action: 'FREEZE_WALLET', // Prevent further transactions
      });
    }
    
    return result;
  }

  /**
   * Verify all wallets (scheduled job).
   */
  async verifyAllWallets(): Promise<void> {
    const wallets = await this.walletRepo.findAll();
    
    for (const wallet of wallets) {
      const result = await this.verifyWalletLedger(wallet.id);
      
      // Log verification result
      await this.db.collection('verification-logs').insertOne({
        walletId: wallet.id,
        result,
        timestamp: new Date(),
      });
    }
  }
}
```

### Scheduled Job

**File:** `services/wallet-service/src/infrastructure/scheduled-jobs/daily-verification.job.ts`

```typescript
import { Cron } from '@nestjs/schedule';
import { LedgerVerificationService } from '../../application/services/ledger-verification.service';

@Injectable()
export class DailyVerificationJob {
  constructor(private verificationService: LedgerVerificationService) {}

  /**
   * Run daily at 2 AM UTC to verify all wallet ledgers.
   */
  @Cron('0 2 * * *')
  async verifyAllWallets() {
    try {
      await this.verificationService.verifyAllWallets();
    } catch (error) {
      // Alert on job failure
      await this.alerting.sendAlert({
        severity: 'HIGH',
        message: 'Ledger verification job failed',
        error: error.message,
      });
    }
  }
}
```

---

## 3. Transaction Sealing (Digital Signatures)

### Domain Entity Update

**File:** `services/transaction-service/src/domain/entities/transaction.entity.ts`

```typescript
export interface TransactionEntity {
  // ... existing fields ...
  
  // ECDSA signature of transaction data (created at sealing time)
  sealSignature: string | null;
  
  // Key ID used to create the signature (for verification)
  sealKeyId: string | null;
  
  // Timestamp when transaction was sealed
  sealedAt: Date | null;
}

/**
 * Data structure that gets signed for non-repudiation.
 */
export interface TransactionSealData {
  walletId: string;
  amount: string;
  destinationAddress: string;
  feeRate: string;
  createdAt: string;  // ISO string
}

/**
 * Create the data to be sealed (must be immutable).
 */
export function createTransactionSealData(
  tx: Pick<TransactionEntity, 'walletId' | 'amount' | 'destinationAddress' | 'feeRate' | 'createdAt'>
): TransactionSealData {
  return {
    walletId: tx.walletId,
    amount: tx.amount,
    destinationAddress: tx.destinationAddress,
    feeRate: tx.feeRate,
    createdAt: tx.createdAt.toISOString(),
  };
}
```

### KMS Integration

**File:** `services/transaction-service/src/infrastructure/kms/kms.service.ts`

```typescript
import AWS from 'aws-sdk';
import { TransactionSealData, createTransactionSealData } from '../../domain/entities/transaction.entity';

export class KmsService {
  private kms = new AWS.KMS({ region: process.env.AWS_REGION });

  /**
   * Sign transaction data with a KMS-managed private key.
   */
  async signTransaction(
    keyId: string,
    sealData: TransactionSealData
  ): Promise<string> {
    const dataBuffer = Buffer.from(JSON.stringify(sealData));
    
    const result = await this.kms.sign({
      KeyId: keyId,
      Message: dataBuffer,
      SigningAlgorithm: 'ECDSA_SHA_256',  // Or RSASSA_PSS_SHA_256
    }).promise();

    return (result.Signature as Buffer).toString('hex');
  }

  /**
   * Verify a transaction signature.
   */
  async verifySignature(
    keyId: string,
    signature: string,
    sealData: TransactionSealData
  ): Promise<boolean> {
    const dataBuffer = Buffer.from(JSON.stringify(sealData));
    const signatureBuffer = Buffer.from(signature, 'hex');
    
    try {
      await this.kms.verify({
        KeyId: keyId,
        Message: dataBuffer,
        Signature: signatureBuffer,
        SigningAlgorithm: 'ECDSA_SHA_256',
      }).promise();
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get the public key for a KMS key (for external verification).
   */
  async getPublicKey(keyId: string): Promise<string> {
    const result = await this.kms.getPublicKey({ KeyId: keyId }).promise();
    return (result.PublicKey as Buffer).toString('base64');
  }
}
```

### Sealing Service

**File:** `services/transaction-service/src/application/services/transaction-sealing.service.ts`

```typescript
import { KmsService } from '../../infrastructure/kms/kms.service';
import { createTransactionSealData, TransactionSealData } from '../../domain/entities/transaction.entity';

export class TransactionSealingService {
  constructor(
    private kms: KmsService,
    private transactionRepo: TransactionRepositoryPort,
  ) {}

  /**
   * Seal a transaction (add digital signature for non-repudiation).
   * Called when transaction enters 'confirmed' state.
   */
  async sealTransaction(
    transactionId: string,
    walletKeyId: string  // The wallet's KMS key
  ): Promise<void> {
    const tx = await this.transactionRepo.findById(transactionId);
    if (!tx) throw new NotFoundError('Transaction not found');
    
    if (tx.sealedAt) {
      throw new Error('Transaction already sealed');
    }

    // Create data to sign
    const sealData = createTransactionSealData({
      walletId: tx.walletId,
      amount: tx.amount,
      destinationAddress: tx.destinationAddress,
      feeRate: tx.feeRate,
      createdAt: tx.createdAt,
    });

    // Sign with KMS
    const signature = await this.kms.signTransaction(walletKeyId, sealData);

    // Update transaction with signature
    await this.transactionRepo.updateTransactionSignature(transactionId, {
      sealSignature: signature,
      sealKeyId: walletKeyId,
      sealedAt: new Date(),
    });
  }

  /**
   * Verify that a sealed transaction is still valid.
   */
  async verifyTransactionSignature(transactionId: string): Promise<boolean> {
    const tx = await this.transactionRepo.findById(transactionId);
    if (!tx || !tx.sealSignature || !tx.sealKeyId) {
      return false;
    }

    const sealData = createTransactionSealData({
      walletId: tx.walletId,
      amount: tx.amount,
      destinationAddress: tx.destinationAddress,
      feeRate: tx.feeRate,
      createdAt: tx.createdAt,
    });

    return await this.kms.verifySignature(tx.sealKeyId, tx.sealSignature, sealData);
  }
}
```

### Verification Endpoint

**File:** `services/transaction-service/src/api/routes/transactions.routes.ts`

```typescript
export function registerTransactionRoutes(router: Router) {
  /**
   * GET /transactions/:id/verify-signature
   * Verify transaction digital signature.
   */
  router.get(
    '/transactions/:id/verify-signature',
    async (request, reply) => {
      const { id } = request.params as { id: string };
      
      const tx = await transactionRepo.findById(id);
      if (!tx) return reply.code(404).send({ error: 'Transaction not found' });

      const isSignatureValid = await sealingService.verifyTransactionSignature(id);
      
      return reply.send({
        transactionId: tx.id,
        status: tx.status,
        isSignatureValid,
        sealKeyId: tx.sealKeyId,
        sealedAt: tx.sealedAt,
        publicKey: tx.sealKeyId ? await kms.getPublicKey(tx.sealKeyId) : null,
      });
    }
  );
}
```

---

## 4. Block Anchoring (Merkle Root)

### Domain Entity

**File:** `services/transaction-service/src/domain/entities/transaction-block.entity.ts`

```typescript
import crypto from 'crypto';

export interface TransactionBlockEntity {
  id: string;
  blockNumber: number;
  blockStartTime: Date;
  blockEndTime: Date;
  transactionIds: string[];
  merkleRoot: string;
  previousBlockHash: string | null;
  blockHash: string;
  finalizedAt: Date;
}

/**
 * Compute Merkle tree root of transaction hashes.
 */
export function computeMerkleRoot(transactionHashes: string[]): string {
  if (transactionHashes.length === 0) {
    return crypto.createHash('sha256').update('').digest('hex');
  }

  // Build merkle tree from bottom up
  let hashes = [...transactionHashes];

  while (hashes.length > 1) {
    const nextLevel: string[] = [];
    
    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i];
      const right = hashes[i + 1] || left;  // Duplicate last if odd
      const combined = left + right;
      const hash = crypto.createHash('sha256').update(combined).digest('hex');
      nextLevel.push(hash);
    }
    
    hashes = nextLevel;
  }

  return hashes[0];
}

/**
 * Compute hash for a block (proof of block integrity).
 */
export function computeBlockHash(
  block: Pick<TransactionBlockEntity, 'blockNumber' | 'merkleRoot' | 'previousBlockHash' | 'blockEndTime'>
): string {
  const data = JSON.stringify({
    blockNumber: block.blockNumber,
    merkleRoot: block.merkleRoot,
    previousBlockHash: block.previousBlockHash,
    blockEndTime: block.blockEndTime.toISOString(),
  });
  
  return crypto.createHash('sha256').update(data).digest('hex');
}
```

### Block Finalization Service

**File:** `services/transaction-service/src/application/services/block-finalization.service.ts`

```typescript
import {
  TransactionBlockEntity,
  computeMerkleRoot,
  computeBlockHash,
} from '../../domain/entities/transaction-block.entity';

export class BlockFinalizationService {
  constructor(
    private transactionRepo: TransactionRepositoryPort,
    private blockRepo: BlockRepository,
  ) {}

  /**
   * Finalize transactions into a block (called nightly).
   * Groups all transactions created in a 4-hour window.
   */
  async finalizeBlock(blockNumber: number): Promise<TransactionBlockEntity> {
    const blockStartTime = new Date();
    blockStartTime.setHours(blockStartTime.getHours() - 4);
    const blockEndTime = new Date();

    // Get all confirmed transactions in this time window
    const transactions = await this.transactionRepo.findByCreatedAtRange(
      blockStartTime,
      blockEndTime,
      { status: 'confirmed' }
    );

    if (transactions.length === 0) {
      throw new Error('No transactions to finalize');
    }

    // Get previous block
    const previousBlock = await this.blockRepo.findByBlockNumber(blockNumber - 1);
    const previousBlockHash = previousBlock?.blockHash || null;

    // Compute merkle root
    const transactionHashes = transactions
      .filter(tx => tx.transactionHash)
      .map(tx => tx.transactionHash!);
    const merkleRoot = computeMerkleRoot(transactionHashes);

    // Create block
    const blockHash = computeBlockHash({
      blockNumber,
      merkleRoot,
      previousBlockHash,
      blockEndTime,
    });

    const block: TransactionBlockEntity = {
      id: new ObjectId().toHexString(),
      blockNumber,
      blockStartTime,
      blockEndTime,
      transactionIds: transactions.map(tx => tx.id),
      merkleRoot,
      previousBlockHash,
      blockHash,
      finalizedAt: new Date(),
    };

    // Store block
    await this.blockRepo.create(block);

    return block;
  }
}
```

### Scheduled Job

**File:** `services/transaction-service/src/infrastructure/scheduled-jobs/nightly-block-finalization.job.ts`

```typescript
import { Cron } from '@nestjs/schedule';
import { BlockFinalizationService } from '../../application/services/block-finalization.service';

@Injectable()
export class NightlyBlockFinalizationJob {
  constructor(private blockFinalizationService: BlockFinalizationService) {}

  /**
   * Finalize transactions into a block nightly at midnight UTC.
   */
  @Cron('0 0 * * *')
  async finalizeBlock() {
    try {
      const lastBlock = await blockRepo.getLastBlock();
      const nextBlockNumber = (lastBlock?.blockNumber || 0) + 1;
      
      const block = await this.blockFinalizationService.finalizeBlock(nextBlockNumber);
      
      // Optionally publish to immutable log (e.g., S3, EventLog)
      await this.publishBlockProof(block);
    } catch (error) {
      // Alert on job failure
      await this.alerting.sendAlert({
        severity: 'HIGH',
        message: 'Block finalization job failed',
        error: error.message,
      });
    }
  }

  /**
   * Publish block proof to external immutable log.
   */
  private async publishBlockProof(block: TransactionBlockEntity): Promise<void> {
    const proofData = JSON.stringify({
      blockNumber: block.blockNumber,
      merkleRoot: block.merkleRoot,
      blockHash: block.blockHash,
      previousBlockHash: block.previousBlockHash,
      transactionCount: block.transactionIds.length,
      finalizedAt: block.finalizedAt,
    }, null, 2);

    // Option A: Publish to S3 (immutable log bucket)
    await s3.putObject({
      Bucket: process.env.BLOCK_PROOF_BUCKET!,
      Key: `blocks/${block.blockNumber}.json`,
      Body: proofData,
      ServerSideEncryption: 'AES256',
    }).promise();

    // Option B: Publish to an external audit service
    // await externalAuditService.recordBlockProof(block);
  }
}
```

---

## 5. Tamper Detection (Scheduled Verification)

### Service Implementation

**File:** `services/wallet-service/src/application/services/tamper-detection.service.ts`

```typescript
import { verifyLedgerEntryChain } from '../../domain/entities/ledger-entry.entity';
import { verifyTransactionHash } from '../../../transaction-service/src/domain/entities/transaction.entity';

export interface TamperReport {
  timestamp: Date;
  walletsChecked: number;
  tampersDetected: number;
  issues: {
    walletId: string;
    issueType: 'ledger_chain_broken' | 'transaction_hash_mismatch' | 'balance_mismatch';
    details: string;
  }[];
}

export class TamperDetectionService {
  constructor(
    private walletRepo: WalletRepository,
    private ledgerRepo: LedgerRepository,
    private transactionRepo: TransactionRepositoryPort,
    private alerting: AlertingService,
  ) {}

  /**
   * Verify all wallets for tampering (comprehensive check).
   */
  async verifyAllWallets(): Promise<TamperReport> {
    const wallets = await this.walletRepo.findAll();
    const issues: TamperReport['issues'] = [];

    for (const wallet of wallets) {
      // Check 1: Verify ledger chain integrity
      const ledgerEntries = await this.ledgerRepo.findByWalletId(wallet.id);
      const { isValid: ledgerValid, errors: ledgerErrors } = verifyLedgerEntryChain(ledgerEntries);
      
      if (!ledgerValid) {
        issues.push({
          walletId: wallet.id,
          issueType: 'ledger_chain_broken',
          details: ledgerErrors.join('; '),
        });
      }

      // Check 2: Verify transaction hashes
      const transactions = await this.transactionRepo.findByWalletId(wallet.id);
      for (const tx of transactions) {
        if (!verifyTransactionHash(tx)) {
          issues.push({
            walletId: wallet.id,
            issueType: 'transaction_hash_mismatch',
            details: `Transaction ${tx.id} hash mismatch`,
          });
        }
      }

      // Check 3: Verify balance matches ledger
      const computedBalance = await this.computeBalanceFromLedger(wallet.id);
      if (wallet.balanceSats !== computedBalance) {
        issues.push({
          walletId: wallet.id,
          issueType: 'balance_mismatch',
          details: `Balance mismatch: expected ${computedBalance}, got ${wallet.balanceSats}`,
        });
      }
    }

    const report: TamperReport = {
      timestamp: new Date(),
      walletsChecked: wallets.length,
      tampersDetected: issues.length,
      issues,
    };

    // Alert if tampering is detected
    if (issues.length > 0) {
      await this.alerting.sendSecurityAlert({
        severity: 'CRITICAL',
        type: 'TAMPER_DETECTION_ALERT',
        message: `Tampering detected in ${issues.length} wallet(s)`,
        details: report,
      });

      // Freeze affected wallets
      for (const issue of issues) {
        await this.walletRepo.updateStatus(issue.walletId, 'suspended', {
          reason: 'TAMPER_DETECTED',
          details: issue.details,
        });
      }
    }

    return report;
  }

  /**
   * Compute balance from ledger entries (should match wallet.balanceSats).
   */
  private async computeBalanceFromLedger(walletId: string): Promise<number> {
    const entries = await this.ledgerRepo.findByWalletId(walletId);
    let balance = 0;
    
    for (const entry of entries) {
      if (entry.state !== 'applied') continue;
      
      if (entry.kind === 'credit') {
        balance += entry.amountSats;
      } else {
        balance -= entry.amountSats;
      }
    }
    
    return balance;
  }

  /**
   * Store verification report for audit.
   */
  async archiveReport(report: TamperReport): Promise<void> {
    await this.db.collection('tamper-detection-reports').insertOne(report);
  }
}
```

### Scheduled Job

**File:** `services/wallet-service/src/infrastructure/scheduled-jobs/daily-tamper-detection.job.ts`

```typescript
import { Cron } from '@nestjs/schedule';
import { TamperDetectionService } from '../../application/services/tamper-detection.service';

@Injectable()
export class DailyTamperDetectionJob {
  constructor(private tamperDetectionService: TamperDetectionService) {}

  /**
   * Run daily at 3 AM UTC to check for tampering.
   */
  @Cron('0 3 * * *')
  async detectTampering() {
    try {
      const report = await this.tamperDetectionService.verifyAllWallets();
      await this.tamperDetectionService.archiveReport(report);
      
      console.log(`Tamper detection completed: ${report.tampersDetected} issues found`);
    } catch (error) {
      await this.alerting.sendAlert({
        severity: 'CRITICAL',
        message: 'Tamper detection job failed',
        error: error.message,
      });
    }
  }
}
```

---

## Testing Examples

### Unit Tests

```typescript
describe('TransactionHashing', () => {
  it('should compute consistent hash for same transaction data', () => {
    const tx = {
      walletId: 'wallet-1',
      txid: 'abc123',
      amount: '100000',
      destinationAddress: 'bc1q...',
      feeSats: '1000',
      broadcastAt: new Date('2024-11-14T10:00:00Z'),
    };

    const hash1 = computeTransactionHash(tx);
    const hash2 = computeTransactionHash(tx);
    
    expect(hash1).toBe(hash2);
  });

  it('should detect modified transaction amount', () => {
    const tx = {
      walletId: 'wallet-1',
      txid: 'abc123',
      amount: '100000',
      destinationAddress: 'bc1q...',
      feeSats: '1000',
      broadcastAt: new Date('2024-11-14T10:00:00Z'),
    };

    const originalHash = computeTransactionHash(tx);
    
    // Modify amount
    tx.amount = '200000';
    const modifiedHash = computeTransactionHash(tx);
    
    expect(originalHash).not.toBe(modifiedHash);
  });
});

describe('LedgerEntryChaining', () => {
  it('should detect reordered ledger entries', () => {
    const entry1 = { /* ... */ };
    const entry2 = { /* ... */ };
    
    // Swap entries
    const entries = [entry2, entry1];
    
    const { isValid, errors } = verifyLedgerEntryChain(entries);
    
    expect(isValid).toBe(false);
    expect(errors).toContain(expect.stringContaining('previousLedgerHash mismatch'));
  });
});
```

---

## Performance Benchmarks

| Operation | Latency | Notes |
|---|---|---|
| Compute SHA-256 hash | < 1ms | For ~200 byte transaction data |
| Verify hash | < 1ms | Compare two 256-bit values |
| KMS sign (ECDSA) | 50-200ms | Network call to AWS KMS |
| KMS verify | 50-200ms | Network call to AWS KMS |
| Verify ledger chain (1000 entries) | 10-50ms | Local computation, no I/O |
| Compute Merkle root (1000 txs) | 5-20ms | Local computation |

---

All examples use TypeScript with Node.js/Fastify stack. Adapt syntax as needed for your specific framework.
