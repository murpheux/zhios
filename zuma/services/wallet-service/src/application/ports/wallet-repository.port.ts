import type { PaginatedResult, PaginationQuery } from '@zuma/shared-common';
import type { WalletEntity, NewWalletProps } from '../../domain/entities/wallet.entity';

export interface WalletFilter {
  ownerUserId?: string;
}

export interface BalanceMovement {
  walletId: string;
  /** Ledger entry id; recorded on the wallet atomically with the $inc so a movement applies at most once. */
  movementId: string;
  /** Signed delta in satoshis (negative for debits). */
  deltaSats: number;
  /** When true the wallet must be 'active' for the movement to apply (debits). */
  requireActive: boolean;
}

export type BalanceMovementResult =
  | { outcome: 'applied'; wallet: WalletEntity }
  | { outcome: 'already-applied'; wallet: WalletEntity }
  | { outcome: 'not-found' }
  | { outcome: 'not-active'; wallet: WalletEntity }
  | { outcome: 'insufficient-funds'; wallet: WalletEntity };

// Repository port implemented by the infrastructure layer (Mongoose, in-memory, etc).
export interface WalletRepositoryPort {
  create(props: NewWalletProps): Promise<WalletEntity>;
  findById(id: string): Promise<WalletEntity | null>;
  findMany(filter: WalletFilter, pagination: PaginationQuery): Promise<PaginatedResult<WalletEntity>>;
  updateMetadata(
    id: string,
    changes: { label?: string; metadata?: Record<string, unknown> },
  ): Promise<WalletEntity | null>;
  /**
   * Single guarded atomic update (no read-then-write): applies `deltaSats` only if the wallet exists,
   * satisfies the status guard, would not go negative, and has not already applied `movementId`.
   */
  applyBalanceMovement(movement: BalanceMovement): Promise<BalanceMovementResult>;
  /** Forgets a completed movement id once its ledger entry is marked applied. Idempotent. */
  clearPendingMovement(walletId: string, movementId: string): Promise<void>;
}
