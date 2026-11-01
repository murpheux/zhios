// Append-only record of a single balance movement. The (transactionId, kind, reason) triple is unique,
// which is what makes every debit/credit idempotent and auditable.
export type LedgerEntryKind = 'debit' | 'credit';
export type LedgerEntryReason = 'send' | 'refund' | 'deposit';
// 'pending' = recorded but not yet confirmed applied to the wallet balance; 'applied' = balance moved.
export type LedgerEntryState = 'pending' | 'applied';

export interface LedgerEntryEntity {
  id: string;
  walletId: string;
  /** Transaction id for send/refund; the external deposit reference for deposits. */
  transactionId: string;
  kind: LedgerEntryKind;
  reason: LedgerEntryReason;
  amountSats: number;
  state: LedgerEntryState;
  /** Wallet balance immediately after this movement was applied; null while pending. */
  balanceAfterSats: number | null;
  createdAt: Date;
}

export interface NewLedgerEntryProps {
  walletId: string;
  transactionId: string;
  kind: LedgerEntryKind;
  reason: LedgerEntryReason;
  amountSats: number;
}
