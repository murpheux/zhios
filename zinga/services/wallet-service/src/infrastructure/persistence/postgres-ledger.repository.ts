import type { Pool } from 'pg';
import type {
  LedgerEntryEntity,
  LedgerEntryKind,
  LedgerEntryReason,
  LedgerEntryState,
  NewLedgerEntryProps,
} from '../../domain/entities/ledger-entry.entity';
import type { LedgerInsertResult, LedgerRepositoryPort } from '../../application/ports/ledger-repository.port';

// Row shape from the ledger_entries table
interface LedgerEntryRow {
  id: string;
  wallet_id: string;
  transaction_id: string;
  kind: string;
  reason: string;
  amount_sats: number;
  state: string;
  balance_after_sats: number | null;
  created_at: Date;
}

const toEntity = (row: LedgerEntryRow): LedgerEntryEntity => ({
  id: row.id,
  walletId: row.wallet_id,
  transactionId: row.transaction_id,
  kind: row.kind as LedgerEntryKind,
  reason: row.reason as LedgerEntryReason,
  amountSats: row.amount_sats,
  state: row.state as LedgerEntryState,
  balanceAfterSats: row.balance_after_sats,
  createdAt: row.created_at,
});

/**
 * PostgreSQL ledger repository. Implements append-only ledger operations with
 * idempotent insert semantics and two-phase commit via the state machine (pending → applied).
 *
 * Key patterns:
 * - insertPending: tries INSERT; if unique violation, returns existing entry with inserted=false
 * - markApplied: UPSERT; survives concurrent compensation deletes
 * - deletePending: removes only while state='pending' (idempotent)
 * - findByKey: lookup by (transactionId, kind, reason) composite key
 */
export class PostgresLedgerRepository implements LedgerRepositoryPort {
  constructor(private pool: Pool) {}

  /**
   * Insert a new pending ledger entry. Uses the unique constraint on
   * (transaction_id, kind, reason) to detect replays/races.
   *
   * On unique violation:
   * - If the existing entry is still pending, return it with inserted=false
   * - If the existing entry is applied, return it with inserted=false
   * In both cases, the caller can proceed; if already-applied, the wallet balance was already moved.
   *
   * Raises on non-unique errors (connection, validation, etc).
   */
  async insertPending(props: NewLedgerEntryProps): Promise<LedgerInsertResult> {
    const query = `
      INSERT INTO ledger_entries (
        wallet_id,
        transaction_id,
        kind,
        reason,
        amount_sats,
        state,
        balance_after_sats,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, NOW()
      )
      RETURNING
        id,
        wallet_id,
        transaction_id,
        kind,
        reason,
        amount_sats,
        state,
        balance_after_sats,
        created_at
    `;

    const values = [
      props.walletId,
      props.transactionId,
      props.kind,
      props.reason,
      props.amountSats,
      'pending', // Initial state
      null, // balance_after_sats; filled in by markApplied
    ];

    try {
      const result = await this.pool.query<LedgerEntryRow>(query, values);
      if (result.rows.length === 0) {
        throw new Error('Failed to insert ledger entry: no row returned');
      }
      return { entry: toEntity(result.rows[0]), inserted: true };
    } catch (error) {
      // Check if this is a unique constraint violation (duplicate key)
      // PostgreSQL error code 23505 = unique_violation
      if (
        error &&
        typeof error === 'object' &&
        (error as { code?: unknown }).code === '23505' &&
        (error as { constraint?: unknown }).constraint === undefined // Will be checked via query below
      ) {
        // Lost the race: the unique index guarantees exactly one entry exists.
        // Fetch and return it.
        const existing = await this.findByKey(props.transactionId, props.kind, props.reason);
        if (!existing) {
          // Should not happen unless there's a race condition with deletion
          throw error;
        }
        return { entry: existing, inserted: false };
      }
      // Any other error is a real problem (connection, validation, FK, etc)
      throw error;
    }
  }

  /**
   * Mark an entry as applied with its resulting wallet balance.
   * Uses UPSERT (INSERT ... ON CONFLICT UPDATE) so the audit record survives
   * even if a concurrent compensation transaction deleted the pending entry.
   *
   * Scenario:
   * 1. insertPending creates entry with state='pending'
   * 2. applyBalanceMovement succeeds and will call this with the new balance
   * 3. Concurrent compensation might delete the pending entry while the balance
   *    write is in flight
   * 4. This upsert will recreate the entry as applied, preserving the audit trail
   */
  async markApplied(entry: LedgerEntryEntity, balanceAfterSats: number): Promise<void> {
    const query = `
      INSERT INTO ledger_entries (
        id,
        wallet_id,
        transaction_id,
        kind,
        reason,
        amount_sats,
        state,
        balance_after_sats,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9
      )
      ON CONFLICT (transaction_id, kind, reason) DO UPDATE SET
        state = $7,
        balance_after_sats = $8,
        id = COALESCE(ledger_entries.id, $1),
        wallet_id = COALESCE(ledger_entries.wallet_id, $2),
        created_at = COALESCE(ledger_entries.created_at, $9)
    `;

    await this.pool.query(query, [
      entry.id,
      entry.walletId,
      entry.transactionId,
      entry.kind,
      entry.reason,
      entry.amountSats,
      'applied', // New state
      balanceAfterSats, // The resulting balance
      entry.createdAt,
    ]);
  }

  /**
   * Delete a pending entry. Used for compensation: if a movement fails the wallet's
   * balance guard, the pending ledger entry is removed to avoid audit noise.
   *
   * Only deletes if state='pending'. Once marked applied, the entry is permanent.
   * Idempotent: if the entry doesn't exist or is already applied, does nothing.
   */
  async deletePending(id: string): Promise<void> {
    const query = `
      DELETE FROM ledger_entries
      WHERE id = $1 AND state = 'pending'
    `;
    await this.pool.query(query, [id]);
  }

  /**
   * Lookup a ledger entry by its composite key: (transactionId, kind, reason).
   * This is the idempotency key: exactly one entry per (tx, direction, reason).
   */
  async findByKey(
    transactionId: string,
    kind: LedgerEntryKind,
    reason: LedgerEntryReason,
  ): Promise<LedgerEntryEntity | null> {
    const query = `
      SELECT
        id,
        wallet_id,
        transaction_id,
        kind,
        reason,
        amount_sats,
        state,
        balance_after_sats,
        created_at
      FROM ledger_entries
      WHERE transaction_id = $1 AND kind = $2 AND reason = $3
    `;

    const result = await this.pool.query<LedgerEntryRow>(query, [transactionId, kind, reason]);
    return result.rows.length > 0 ? toEntity(result.rows[0]) : null;
  }
}
