export const TRANSACTION_TYPES = ['send', 'receive', 'internal-transfer'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = [
  'pending',
  'broadcasting',
  'broadcast',
  'confirmed',
  'failed',
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

// Amounts on the wire are strings of integer satoshis (no decimals, no leading zeros).
// JSON-schema `pattern` strings; build a RegExp with `new RegExp(PATTERN)` where needed.
/** Strictly positive satoshi amount, max 16 digits (> 21e6 BTC supply in sats). */
export const SATS_AMOUNT_PATTERN = '^[1-9][0-9]{0,15}$';
/** Non-negative satoshi balance, max 16 digits. */
export const SATS_BALANCE_PATTERN = '^(0|[1-9][0-9]{0,15})$';
/** MongoDB ObjectId hex string. */
export const OBJECT_ID_PATTERN = '^[a-f0-9]{24}$';

/** String of integer satoshis, see SATS_AMOUNT_PATTERN / SATS_BALANCE_PATTERN. */
export type SatsAmount = string;

export interface TransactionDto {
  id: string;
  walletId: string;
  txid: string | null;
  type: TransactionType;
  /** Integer satoshis as a string. */
  amount: SatsAmount;
  feeRate: string;
  status: TransactionStatus;
  confirmations: number;
  /** Internal; not exposed by the GraphQL gateway. Producers may omit it. */
  rawTx?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransactionDto {
  walletId: string;
  type: TransactionType;
  /** Integer satoshis as a string. */
  amount: SatsAmount;
  feeRate: string;
  destinationAddress: string;
}

export interface TransactionFilterDto {
  walletId?: string;
  status?: TransactionStatus;
  dateFrom?: string;
  dateTo?: string;
}
