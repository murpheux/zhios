/**
 * Mirrors the GraphQL SDL in zuma/graphql/src/schema/typedefs.ts.
 * Keep in sync with that file when the gateway schema changes.
 */

export interface Wallet {
  id: string;
  label: string;
  address: string;
  network: string;
  type: string;
  balanceCache: string;
  metadata: Record<string, unknown>;
  ownerUserId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  walletId: string;
  txid: string | null;
  type: "send" | "receive";
  amount: string;
  feeRate: string;
  status: string;
  confirmations: number;
  rawTx: string | null;
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

export interface CreateWalletInput {
  label: string;
  network: string;
  type: string;
  ownerUserId: string;
  metadata?: Record<string, unknown>;
}

export interface CreateTransactionInput {
  walletId: string;
  type: "send" | "receive";
  amount: string;
  feeRate: string;
  destinationAddress: string;
}

export interface ListWalletsParams {
  page?: number;
  limit?: number;
  ownerUserId?: string;
}

export interface ListTransactionsParams {
  walletId?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}
