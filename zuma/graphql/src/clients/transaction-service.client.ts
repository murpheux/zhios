import type { CreateTransactionDto, PaginatedResult, TransactionDto } from '@zuma/shared-common';
import {
  DEFAULT_UPSTREAM_TIMEOUT_MS,
  upstreamHealthCheck,
  upstreamRequest,
  type UpstreamClientOptions,
  type UpstreamRequestOptions,
} from './upstream-request';

export type TransactionServiceClientOptions = UpstreamClientOptions;

export interface ListTransactionsParams {
  page?: number;
  limit?: number;
  walletId?: string;
  status?: string;
  from?: string;
  to?: string;
}

const UPSTREAM = 'transaction-service';

// Typed wrapper over transaction-service's REST API; forwards the caller's bearer token.
export class TransactionServiceClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(opts: TransactionServiceClientOptions) {
    this.baseUrl = opts.baseUrl;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS;
  }

  async getTransaction(id: string, authorization?: string): Promise<TransactionDto> {
    return this.request<TransactionDto>(`/api/v1/transactions/${encodeURIComponent(id)}`, {
      authorization,
    });
  }

  async listTransactions(
    params: ListTransactionsParams,
    authorization?: string,
  ): Promise<PaginatedResult<TransactionDto>> {
    const query = new URLSearchParams();
    if (params.page !== undefined) query.set('page', String(params.page));
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.walletId !== undefined) query.set('walletId', params.walletId);
    if (params.status !== undefined) query.set('status', params.status);
    if (params.from !== undefined) query.set('from', params.from);
    if (params.to !== undefined) query.set('to', params.to);
    const qs = query.toString();
    return this.request<PaginatedResult<TransactionDto>>(
      `/api/v1/transactions${qs ? `?${qs}` : ''}`,
      { authorization },
    );
  }

  // `idempotencyKey` is forwarded as the Idempotency-Key header so client retries are safe.
  async createTransaction(
    input: CreateTransactionDto,
    idempotencyKey: string,
    authorization?: string,
  ): Promise<TransactionDto> {
    return this.request<TransactionDto>('/api/v1/transactions', {
      method: 'POST',
      body: input,
      authorization,
      headers: { 'idempotency-key': idempotencyKey },
    });
  }

  async healthCheck(timeoutMs = 2000): Promise<void> {
    await upstreamHealthCheck(UPSTREAM, this.baseUrl, timeoutMs);
  }

  private request<T>(path: string, opts: UpstreamRequestOptions = {}): Promise<T> {
    return upstreamRequest<T>(UPSTREAM, this.baseUrl, path, { timeoutMs: this.timeoutMs, ...opts });
  }
}
