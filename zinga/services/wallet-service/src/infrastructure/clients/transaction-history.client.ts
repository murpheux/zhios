import { type TransactionDto, UpstreamError } from '@zinga/shared-common';
import type { TransactionHistoryClientPort } from '../../application/ports/transaction-history-client.port';

export interface TransactionServiceClientOptions {
  baseUrl: string;
  /** Per-call budget. Must cover transaction-service's own auth (a cold JWKS fetch) + query. */
  timeoutMs?: number;
}

const UPSTREAM = 'transaction-service';
const DEFAULT_TIMEOUT_MS = 5000;

// HTTP adapter calling the transaction-service REST API for a wallet's history.
// Failures surface as UpstreamError (504 timeout / 503 unreachable / 502 bad response), never as
// an opaque 500, and never with the upstream's own error text.
export class TransactionHistoryHttpClient implements TransactionHistoryClientPort {
  constructor(private readonly options: TransactionServiceClientOptions) {}

  async getHistoryForWallet(walletId: string, authorization?: string): Promise<TransactionDto[]> {
    let response: Response;
    try {
      response = await fetch(`${this.options.baseUrl}/api/v1/transactions?walletId=${encodeURIComponent(walletId)}`, {
        signal: AbortSignal.timeout(this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        headers: authorization ? { authorization } : undefined,
      });
    } catch (error) {
      const name = (error as { name?: string }).name;
      throw new UpstreamError(UPSTREAM, name === 'TimeoutError' || name === 'AbortError' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE', error);
    }
    if (!response.ok) {
      throw new UpstreamError(UPSTREAM, 'UPSTREAM_ERROR', new Error(`responded with ${response.status}`));
    }
    const body = (await response.json().catch(() => undefined)) as { items?: unknown } | undefined;
    if (!Array.isArray(body?.items)) {
      throw new UpstreamError(UPSTREAM, 'UPSTREAM_ERROR', new Error('response has no items array'));
    }
    return body.items as TransactionDto[];
  }
}
