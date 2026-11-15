-- Initialize PostgreSQL for Zinga wallet service
-- This schema implements immutable ledger entries with cryptographic verification
-- See: docs/TRANSACTION_IMMUTABILITY_REVIEW.md

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- Wallets table
-- ============================================================================

CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  label TEXT NOT NULL,
  address TEXT NOT NULL UNIQUE,
  network TEXT NOT NULL CHECK (network IN ('mainnet', 'testnet', 'regtest')),
  type TEXT NOT NULL CHECK (type IN ('hot', 'cold', 'custodial', 'non-custodial')),
  balance_sats BIGINT NOT NULL DEFAULT 0,

  -- Metadata (flexible JSON for wallet-specific attributes)
  metadata JSONB DEFAULT '{}',

  -- Owner and status
  owner_user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),

  -- Timestamps (mutable: wallet state can be updated)
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Merkle chain for transaction hashing (Enhancement 1: Transaction Hashing)
  -- References the hash of the last transaction in this wallet's history
  last_transaction_hash VARCHAR(64),

  UNIQUE(owner_user_id, label)
);

CREATE INDEX idx_wallets_owner ON wallets(owner_user_id);
CREATE INDEX idx_wallets_address ON wallets(address);
CREATE INDEX idx_wallets_status ON wallets(status);

-- ============================================================================
-- Ledger entries (append-only, immutable)
-- ============================================================================

CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  transaction_id UUID NOT NULL,

  -- Kind: debit or credit
  kind TEXT NOT NULL CHECK (kind IN ('debit', 'credit')),

  -- Reason for the movement
  reason TEXT NOT NULL CHECK (reason IN ('send', 'refund', 'deposit')),

  -- Amount in satoshis (always positive; sign determined by kind)
  amount_sats BIGINT NOT NULL CHECK (amount_sats > 0),

  -- State of the ledger entry: pending or applied
  -- (mutable only during the transaction's lifecycle; becomes immutable once applied)
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'applied')),

  -- Balance snapshot at the time this entry was created
  balance_after_sats BIGINT,

  -- ========================================================================
  -- Enhancement 2: Ledger Entry Chaining (cryptographic hash verification)
  -- ========================================================================

  -- Previous ledger entry's currentLedgerHash (creates a chain)
  -- For the first entry in a wallet, this is NULL
  previous_ledger_hash VARCHAR(64),

  -- SHA-256(walletId + kind + reason + amountSats + balanceAfterSats + createdAt + previousLedgerHash)
  -- This hash commits to the entry's values and the previous entry's hash
  -- Prevents undetected modification or reordering of entries
  current_ledger_hash VARCHAR(64) NOT NULL,

  -- Cumulative hash: SHA-256(previousCumulativeHash + currentLedgerHash)
  -- Allows quick verification of the entire ledger chain up to this entry
  cumulative_hash VARCHAR(64) NOT NULL,

  -- ========================================================================
  -- Immutability and auditing
  -- ========================================================================

  -- Timestamp of creation (immutable, used in hash computation)
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- No updated_at: ledger entries are append-only and must never be modified.
  -- The prevent_ledger_updates trigger enforces this.

  -- Unique constraint: (transaction_id, kind, reason) prevents duplicate movements
  UNIQUE(transaction_id, kind, reason)
);

-- Indexes for query performance
CREATE INDEX idx_ledger_wallet ON ledger_entries(wallet_id, created_at DESC);
CREATE INDEX idx_ledger_transaction ON ledger_entries(transaction_id);
CREATE INDEX idx_ledger_tx_kind_reason ON ledger_entries(transaction_id, kind, reason);
CREATE INDEX idx_ledger_hash ON ledger_entries(current_ledger_hash);
CREATE INDEX idx_ledger_cumulative_hash ON ledger_entries(cumulative_hash);
CREATE INDEX idx_ledger_state ON ledger_entries(state);

-- ============================================================================
-- Immutability constraint: prevent any UPDATE on ledger_entries
-- ============================================================================

-- Create the error-raising function first (must exist before the trigger references it)
CREATE OR REPLACE FUNCTION raise_immutability_error()
  RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Ledger entries are immutable and cannot be updated. '
    'Create a new ledger entry instead (kind: refund, reason: reversal).';
END;
$$ LANGUAGE plpgsql;

-- Trigger: prevent UPDATE on ledger_entries
CREATE TRIGGER prevent_ledger_updates
  BEFORE UPDATE ON ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION raise_immutability_error();

-- ============================================================================
-- Verification logs (audit trail for ledger integrity checks)
-- ============================================================================

CREATE TABLE ledger_verification_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,

  -- Result of the verification
  is_valid BOOLEAN NOT NULL,

  -- Count of hash mismatches (0 if is_valid = true)
  errors_count INT NOT NULL DEFAULT 0,

  -- The computed cumulative hash at verification time (for audit trail)
  computed_cumulative_hash VARCHAR(64),

  -- The stored cumulative hash from the last ledger entry (for comparison)
  stored_cumulative_hash VARCHAR(64),

  -- Detailed error messages from verification (JSON array)
  error_details JSONB DEFAULT '[]',

  -- When the verification ran
  verified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_verification_wallet ON ledger_verification_logs(wallet_id, verified_at DESC);
CREATE INDEX idx_verification_validity ON ledger_verification_logs(is_valid, verified_at DESC);

-- ============================================================================
-- Tamper detection logs (tracks failed/suspicious hash verifications)
-- ============================================================================

CREATE TABLE tamper_detection_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,

  -- Which ledger entry or wallet was being read
  entity_type TEXT NOT NULL CHECK (entity_type IN ('ledger_entry', 'wallet')),
  entity_id UUID NOT NULL,

  -- Type of tamper detected
  tamper_type TEXT NOT NULL CHECK (tamper_type IN ('hash_mismatch', 'missing_entry', 'chain_broken', 'unauthorized_modification')),

  -- Computed vs. stored values (for forensics)
  expected_value TEXT,
  actual_value TEXT,

  -- Details (JSON for extensibility)
  details JSONB DEFAULT '{}',

  -- When detected
  detected_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Whether an alert was issued (for monitoring/alerting)
  alert_issued BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_tamper_wallet ON tamper_detection_logs(wallet_id, detected_at DESC);
CREATE INDEX idx_tamper_type ON tamper_detection_logs(tamper_type, detected_at DESC);
CREATE INDEX idx_tamper_alert ON tamper_detection_logs(alert_issued, detected_at DESC);

-- ============================================================================
-- Summary statistics (for operational monitoring)
-- ============================================================================

CREATE TABLE ledger_stats (
  wallet_id UUID PRIMARY KEY REFERENCES wallets(id) ON DELETE CASCADE,

  -- Ledger entry counts
  total_entries INT NOT NULL DEFAULT 0,
  pending_entries INT NOT NULL DEFAULT 0,
  applied_entries INT NOT NULL DEFAULT 0,

  -- Balance tracking
  total_debits_sats BIGINT NOT NULL DEFAULT 0,
  total_credits_sats BIGINT NOT NULL DEFAULT 0,

  -- Verification state
  last_verification_at TIMESTAMPTZ,
  last_verification_valid BOOLEAN,

  -- Updated whenever the ledger is modified
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ledger_stats_updated ON ledger_stats(updated_at DESC);
