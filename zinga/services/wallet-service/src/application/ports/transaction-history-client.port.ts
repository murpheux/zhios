import type { TransactionDto } from '@zinga/shared-common';

// Port for fetching a wallet's transaction history from the transaction-service.
export interface TransactionHistoryClientPort {
  getHistoryForWallet(walletId: string, authorization?: string): Promise<TransactionDto[]>;
}
