-- Initialize PostgreSQL for Zinga wallet service
-- This schema implements append-only ledger entries with idempotent balance movements.

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

  -- Pending ledger IDs: tracks movement IDs currently in the two-phase commit.
  -- Ensures idempotency: a movement is applied at most once.
  pending_ledger_ids TEXT[] DEFAULT '{}',

  -- Timestamps (mutable: wallet state can be updated)
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

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
  -- Pending: recorded but balance not yet moved (awaiting confirmation)
  -- Applied: balance has been updated; entry is now immutable
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'applied')),

  -- Balance snapshot immediately after this entry was applied; NULL while pending
  balance_after_sats BIGINT,

  -- Timestamp of creation (immutable, part of audit trail)
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Unique constraint: exactly one movement per (transaction_id, kind, reason)
  -- This is the idempotency key: ensures at most one debit/credit per reason per transaction
  UNIQUE(transaction_id, kind, reason)
);

-- Indexes for query performance and audit
CREATE INDEX idx_ledger_wallet ON ledger_entries(wallet_id, created_at DESC);
CREATE INDEX idx_ledger_transaction ON ledger_entries(transaction_id);
CREATE INDEX idx_ledger_tx_kind_reason ON ledger_entries(transaction_id, kind, reason);
CREATE INDEX idx_ledger_state ON ledger_entries(state);

-- ============================================================================
-- Immutability constraint: prevent any UPDATE on ledger_entries
-- ============================================================================

-- Create the error-raising function (enforces append-only semantics)
CREATE OR REPLACE FUNCTION raise_immutability_error()
  RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Ledger entries are immutable and cannot be updated. '
    'Create a new ledger entry instead (kind: refund, reason: reversal).';
END;
$$ LANGUAGE plpgsql;

-- Trigger: prevent UPDATE on ledger_entries (append-only enforcement)
CREATE TRIGGER prevent_ledger_updates
  BEFORE UPDATE ON ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION raise_immutability_error();
