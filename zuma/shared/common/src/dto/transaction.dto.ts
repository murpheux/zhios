export type TransactionType = 'send' | 'receive' | 'internal-transfer';

export type TransactionStatus =
  | 'pending'
  | 'signed'
  | 'broadcast'
  | 'confirmed'
  | 'failed'
  | 'rejected';

export interface TransactionDto {
  id: string;
  walletId: string;
  txid: string | null;
  type: TransactionType;
  amount: string;
  feeRate: string;
  status: TransactionStatus;
  confirmations: number;
  rawTx: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransactionDto {
  walletId: string;
  type: TransactionType;
  amount: string;
  feeRate: string;
  destinationAddress: string;
}

export interface TransactionFilterDto {
  walletId?: string;
  status?: TransactionStatus;
  dateFrom?: string;
  dateTo?: string;
}
