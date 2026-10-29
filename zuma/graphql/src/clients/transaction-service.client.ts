import type { CreateTransactionDto, PaginatedResult, TransactionDto } from '@zuma/shared-common';
import { UpstreamHttpError } from './upstream-http-error';

export interface TransactionServiceClientOptions {
  baseUrl: string;
}

export interface ListTransactionsParams {
  page?: number;
  limit?: number;
  walletId?: string;
  status?: string;
  from?: string;
  to?: string;
}

// Typed wrapper over transaction-service's REST API; forwards the caller's bearer token.
export class TransactionServiceClient {
  private readonly baseUrl: string;

  constructor(opts: TransactionServiceClientOptions) {
    this.baseUrl = opts.baseUrl;
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

  async createTransaction(
    input: CreateTransactionDto,
    authorization?: string,
  ): Promise<TransactionDto> {
    return this.request<TransactionDto>('/api/v1/transactions', {
      method: 'POST',
      body: input,
      authorization,
    });
  }

  private async request<T>(
    path: string,
    opts: { method?: string; body?: unknown; authorization?: string } = {},
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(opts.authorization ? { authorization: opts.authorization } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        code?: string;
        message?: string;
      };
      throw new UpstreamHttpError(
        response.status,
        body.code ?? 'UPSTREAM_ERROR',
        body.message ?? `transaction-service request failed with status ${response.status}`,
      );
    }

    return (await response.json()) as T;
  }
}
