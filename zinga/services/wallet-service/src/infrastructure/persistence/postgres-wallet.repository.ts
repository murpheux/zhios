import type { Pool } from 'pg';
import type { PaginatedResult, PaginationQuery } from '@zinga/shared-common';
import { toPaginatedResult } from '@zinga/shared-common';
import type { WalletEntity, NewWalletProps } from '../../domain/entities/wallet.entity';
import type {
  BalanceMovement,
  BalanceMovementResult,
  WalletFilter,
  WalletRepositoryPort,
} from '../../application/ports/wallet-repository.port';

// Row shape from the wallets table
interface WalletRow {
  id: string;
  label: string;
  address: string;
  network: string;
  type: string;
  balance_sats: number;
  metadata: Record<string, unknown>;
  owner_user_id: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

const toEntity = (row: WalletRow): WalletEntity => ({
  id: row.id,
  label: row.label,
  address: row.address,
  network: row.network as WalletEntity['network'],
  type: row.type as WalletEntity['type'],
  balanceSats: row.balance_sats,
  metadata: row.metadata,
  ownerUserId: row.owner_user_id,
  status: row.status as WalletEntity['status'],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * PostgreSQL wallet repository. Implements all operations needed for wallet balance management,
 * with guarded atomic updates for balance movements and idempotency via pending ledger IDs tracking.
 *
 * Key pattern: applyBalanceMovement performs a single atomic UPDATE with all guards in the WHERE
 * clause (not read-then-write). If the UPDATE succeeds, the movement was applied. If it fails,
 * we read separately to classify the rejection reason.
 */
export class PostgresWalletRepository implements WalletRepositoryPort {
  constructor(private pool: Pool) {}

  /**
   * Create a new wallet with zero balance, active status, and empty metadata.
   */
  async create(props: NewWalletProps): Promise<WalletEntity> {
    const query = `
      INSERT INTO wallets (
        label,
        address,
        network,
        type,
        owner_user_id,
        metadata,
        balance_sats,
        status,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
      )
      RETURNING
        id,
        label,
        address,
        network,
        type,
        balance_sats,
        metadata,
        owner_user_id,
        status,
        created_at,
        updated_at
    `;
    const values = [
      props.label,
      props.address,
      props.network,
      props.type,
      props.ownerUserId,
      props.metadata ?? {},
      0, // balanceSats
      'active',
    ];

    const result = await this.pool.query<WalletRow>(query, values);
    if (result.rows.length === 0) {
      throw new Error('Failed to create wallet: no row returned');
    }
    return toEntity(result.rows[0]);
  }

  /**
   * Retrieve a wallet by ID. UUID validation happens in PostgreSQL.
   */
  async findById(id: string): Promise<WalletEntity | null> {
    const query = `
      SELECT
        id,
        label,
        address,
        network,
        type,
        balance_sats,
        metadata,
        owner_user_id,
        status,
        created_at,
        updated_at
      FROM wallets
      WHERE id = $1
    `;
    const result = await this.pool.query<WalletRow>(query, [id]);
    return result.rows.length > 0 ? toEntity(result.rows[0]) : null;
  }

  /**
   * List wallets with filtering (owner_user_id) and pagination (offset/limit).
   */
  async findMany(
    filter: WalletFilter,
    pagination: PaginationQuery,
  ): Promise<PaginatedResult<WalletEntity>> {
    // Build WHERE clause dynamically
    const whereParts: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filter.ownerUserId) {
      whereParts.push(`owner_user_id = $${paramIndex}`);
      values.push(filter.ownerUserId);
      paramIndex += 1;
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    const offset = (pagination.page - 1) * pagination.limit;

    // Fetch paginated results
    const query = `
      SELECT
        id,
        label,
        address,
        network,
        type,
        balance_sats,
        metadata,
        owner_user_id,
        status,
        created_at,
        updated_at
      FROM wallets
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    values.push(pagination.limit, offset);

    const [rowsResult, countResult] = await Promise.all([
      this.pool.query<WalletRow>(query, values),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM wallets ${whereClause}`,
        values.slice(0, paramIndex - 1),
      ),
    ]);

    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);
    return toPaginatedResult(rowsResult.rows.map(toEntity), total, pagination);
  }

  /**
   * Update wallet label and/or metadata. Only these fields are mutable via this path.
   * Balance and status are guarded: they can only change via applyBalanceMovement.
   */
  async updateMetadata(
    id: string,
    changes: { label?: string; metadata?: Record<string, unknown> },
  ): Promise<WalletEntity | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (changes.label !== undefined) {
      updates.push(`label = $${paramIndex}`);
      values.push(changes.label);
      paramIndex += 1;
    }
    if (changes.metadata !== undefined) {
      updates.push(`metadata = $${paramIndex}`);
      values.push(JSON.stringify(changes.metadata));
      paramIndex += 1;
    }

    if (updates.length === 0) {
      // No changes; just fetch and return current state
      return this.findById(id);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE wallets
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING
        id,
        label,
        address,
        network,
        type,
        balance_sats,
        metadata,
        owner_user_id,
        status,
        created_at,
        updated_at
    `;

    const result = await this.pool.query<WalletRow>(query, values);
    return result.rows.length > 0 ? toEntity(result.rows[0]) : null;
  }

  /**
   * CRITICAL: Atomic guarded balance movement. This is a single UPDATE statement
   * with all guards evaluated as part of the WHERE clause at the database level.
   *
   * The movement applies atomically if:
   * 1. Wallet exists (id matches)
   * 2. Wallet status is 'active' (if requireActive)
   * 3. For debits: balance_sats >= abs(deltaSats)
   * 4. Movement ID not already in pending_ledger_ids (idempotency)
   *
   * If the UPDATE succeeds, the balance has been incremented and the movement ID
   * has been recorded. If it fails, we read to classify why (not-found, not-active,
   * insufficient-funds, already-applied).
   */
  async applyBalanceMovement(movement: BalanceMovement): Promise<BalanceMovementResult> {
    // Build the guard: all conditions must be met for the UPDATE to succeed
    const guards: string[] = ['id = $1'];
    const values: unknown[] = [movement.walletId];

    // Guard: if requireActive, wallet must be active
    if (movement.requireActive) {
      guards.push("status = 'active'");
    }

    // Guard: if debit (negative delta), balance must cover it
    if (movement.deltaSats < 0) {
      guards.push(`balance_sats >= $2`);
      values.push(-movement.deltaSats); // Absolute value
    } else {
      // For credits, we don't need a balance check; just push a dummy value
      values.push(0);
    }

    // Guard: movement ID must not already be in the pending_ledger_ids array (idempotency)
    guards.push(`NOT $3 = ANY(pending_ledger_ids)`);
    values.push(movement.movementId);

    // Compute the new balance (add delta)
    const balanceChange = movement.deltaSats;

    // Atomic update: increment balance and record movement ID in pending list
    const query = `
      UPDATE wallets
      SET
        balance_sats = balance_sats + $4,
        pending_ledger_ids = array_append(pending_ledger_ids, $5),
        updated_at = NOW()
      WHERE ${guards.join(' AND ')}
      RETURNING
        id,
        label,
        address,
        network,
        type,
        balance_sats,
        metadata,
        owner_user_id,
        status,
        created_at,
        updated_at
    `;
    values.push(balanceChange, movement.movementId);

    const result = await this.pool.query<WalletRow>(query, values);

    // If the update succeeded, return the updated wallet
    if (result.rows.length > 0) {
      return { outcome: 'applied', wallet: toEntity(result.rows[0]) };
    }

    // Guard rejected: read current state to classify why
    const currentResult = await this.pool.query<
      WalletRow & { pending_ledger_ids: string[] }
    >(
      `
      SELECT
        id,
        label,
        address,
        network,
        type,
        balance_sats,
        metadata,
        owner_user_id,
        status,
        pending_ledger_ids,
        created_at,
        updated_at
      FROM wallets
      WHERE id = $1
      `,
      [movement.walletId],
    );

    if (currentResult.rows.length === 0) {
      return { outcome: 'not-found' };
    }

    const row = currentResult.rows[0];
    const wallet = toEntity(row);

    // Classify which guard failed, in the same order as the Mongoose implementation.
    const pendingIds = row.pending_ledger_ids ?? [];

    if (pendingIds.includes(movement.movementId)) {
      return { outcome: 'already-applied', wallet };
    }
    if (movement.requireActive && wallet.status !== 'active') {
      return { outcome: 'not-active', wallet };
    }
    // Default to insufficient-funds for debit failures (or other balance checks)
    return { outcome: 'insufficient-funds', wallet };
  }

  /**
   * Remove a movement ID from the pending list once its ledger entry is marked applied.
   * This operation is idempotent: if the movement ID is not in the list, array_remove returns
   * the array unchanged.
   */
  async clearPendingMovement(walletId: string, movementId: string): Promise<void> {
    const query = `
      UPDATE wallets
      SET
        pending_ledger_ids = array_remove(pending_ledger_ids, $1),
        updated_at = NOW()
      WHERE id = $2
    `;
    await this.pool.query(query, [movementId, walletId]);
  }
}
