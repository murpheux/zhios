/**
 * Mirrors the GraphQL SDL in zuma/graphql/src/schema/typedefs.ts.
 * Keep in sync with that file when the gateway schema changes.
 *
 * Money: every amount/balance is a string of integer satoshis ("150000"),
 * never a float. Use ./sats.ts to parse/format them.
 */

export type Network = "MAINNET" | "TESTNET" | "REGTEST";
export type WalletType = "HOT" | "COLD" | "CUSTODIAL" | "NON_CUSTODIAL";
export type WalletStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";
export type TransactionStatus = "PENDING" | "BROADCASTING" | "BROADCAST" | "CONFIRMED" | "FAILED";
export type TransactionType = "SEND" | "RECEIVE" | "INTERNAL_TRANSFER";

export const NETWORKS: readonly Network[] = ["MAINNET", "TESTNET", "REGTEST"];
export const WALLET_TYPES: readonly WalletType[] = ["HOT", "COLD", "CUSTODIAL", "NON_CUSTODIAL"];

export interface Wallet {
  id: string;
  label: string;
  address: string;
  network: Network;
  type: WalletType;
  /** Integer satoshis as a string. */
  balanceCache: string;
  metadata: Record<string, unknown>;
  /** Set server-side from the caller's token; read-only. */
  ownerUserId: string;
  status: WalletStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  walletId: string;
  txid: string | null;
  type: TransactionType;
  /** Integer satoshis as a string. */
  amount: string;
  /** sat/vB as a string. */
  feeRate: string;
  status: TransactionStatus;
  confirmations: number;
  createdAt: string;
  updatedAt: string;
}

export interface PageInfo {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface WalletConnection {
  items: Wallet[];
  pageInfo: PageInfo;
}

export interface TransactionConnection {
  items: Transaction[];
  pageInfo: PageInfo;
}

/** The owner is always the authenticated caller — it cannot be set by the client. */
export interface CreateWalletInput {
  label: string;
  network: Network;
  type: WalletType;
  metadata?: Record<string, unknown>;
}

export interface UpdateWalletMetadataInput {
  label?: string;
  metadata?: Record<string, unknown>;
}

/** Creates an outgoing (SEND) transaction — the only type the API accepts. */
export interface CreateTransactionInput {
  walletId: string;
  /** Integer satoshis as a string, > 0. */
  amount: string;
  /** sat/vB as a string. */
  feeRate: string;
  destinationAddress: string;
  /** Client-generated (see createIdempotencyKey); retries with the same key return the original transaction. */
  idempotencyKey: string;
}

export interface ListWalletsParams {
  page?: number;
  limit?: number;
  ownerUserId?: string;
}

export interface ListTransactionsParams {
  walletId?: string;
  status?: TransactionStatus;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}
