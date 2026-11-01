import type {
  PaginatedResult,
  SupportedBitcoinNetwork,
  TransactionDto,
  TransactionStatus,
  TransactionType,
  WalletDto,
  WalletStatus,
  WalletType,
} from '@zuma/shared-common';

// REST values are lower-kebab ('internal-transfer'); GraphQL enum values are UPPER_SNAKE ('INTERNAL_TRANSFER').
export const toGraphqlEnum = (value: string): string => value.toUpperCase().replace(/-/g, '_');
export const fromGraphqlEnum = <T extends string>(value: string): T =>
  value.toLowerCase().replace(/_/g, '-') as T;

export interface GraphqlWallet
  extends Omit<WalletDto, 'network' | 'type' | 'status'> {
  network: string;
  type: string;
  status: string;
}

export interface GraphqlTransaction extends Omit<TransactionDto, 'type' | 'status' | 'rawTx'> {
  type: string;
  status: string;
}

export const toGraphqlWallet = (wallet: WalletDto): GraphqlWallet => ({
  id: wallet.id,
  label: wallet.label,
  address: wallet.address,
  network: toGraphqlEnum(wallet.network),
  type: toGraphqlEnum(wallet.type),
  balanceCache: wallet.balanceCache,
  metadata: wallet.metadata,
  ownerUserId: wallet.ownerUserId,
  status: toGraphqlEnum(wallet.status),
  createdAt: wallet.createdAt,
  updatedAt: wallet.updatedAt,
});

// Explicit field list: internal fields (e.g. rawTx) never reach GraphQL clients.
export const toGraphqlTransaction = (tx: TransactionDto): GraphqlTransaction => ({
  id: tx.id,
  walletId: tx.walletId,
  txid: tx.txid,
  type: toGraphqlEnum(tx.type),
  amount: tx.amount,
  feeRate: tx.feeRate,
  status: toGraphqlEnum(tx.status),
  confirmations: tx.confirmations,
  createdAt: tx.createdAt,
  updatedAt: tx.updatedAt,
});

export const toConnection = <T, U>(result: PaginatedResult<T>, map: (item: T) => U) => ({
  items: result.items.map(map),
  pageInfo: {
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
  },
});

export type { SupportedBitcoinNetwork, TransactionStatus, TransactionType, WalletStatus, WalletType };
