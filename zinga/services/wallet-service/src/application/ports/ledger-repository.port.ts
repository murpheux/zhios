import type {
  LedgerEntryEntity,
  LedgerEntryKind,
  LedgerEntryReason,
  NewLedgerEntryProps,
} from '../../domain/entities/ledger-entry.entity';

export interface LedgerInsertResult {
  entry: LedgerEntryEntity;
  /** false when an entry with the same (transactionId, kind, reason) already existed (idempotent replay). */
  inserted: boolean;
}

// Repository port for the append-only balance ledger.
export interface LedgerRepositoryPort {
  insertPending(props: NewLedgerEntryProps): Promise<LedgerInsertResult>;
  /** Marks the entry applied with the resulting balance (upserts if a racing compensation removed it). */
  markApplied(entry: LedgerEntryEntity, balanceAfterSats: number): Promise<void>;
  /** Removes an entry only while it is still 'pending' (compensation when the balance guard rejects it). */
  deletePending(id: string): Promise<void>;
  findByKey(
    transactionId: string,
    kind: LedgerEntryKind,
    reason: LedgerEntryReason,
  ): Promise<LedgerEntryEntity | null>;
}
