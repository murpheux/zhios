import type { TransactionDto } from '@zuma/shared-common';
import type { TransactionHistoryClientPort } from '../../application/ports/transaction-history-client.port';

export interface TransactionServiceClientOptions {
  baseUrl: string;
}

// HTTP adapter calling the transaction-service REST API for a wallet's history.
export class TransactionHistoryHttpClient implements TransactionHistoryClientPort {
  constructor(private readonly options: TransactionServiceClientOptions) {}

  async getHistoryForWallet(walletId: string, authorization?: string): Promise<TransactionDto[]> {
    const response = await fetch(
      `${this.options.baseUrl}/api/v1/transactions?walletId=${encodeURIComponent(walletId)}`,
      {
        signal: AbortSignal.timeout(2000),
        headers: authorization ? { authorization } : undefined,
      },
    );
    if (!response.ok) {
      throw new Error(`transaction-service responded with ${response.status}`);
    }
    const body = (await response.json()) as { items: TransactionDto[] };
    return body.items;
  }
}
