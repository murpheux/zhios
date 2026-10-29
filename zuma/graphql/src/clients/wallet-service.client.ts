import type {
  CreateWalletDto,
  PaginatedResult,
  UpdateWalletMetadataDto,
  WalletDto,
} from '@zuma/shared-common';
import { UpstreamHttpError } from './upstream-http-error';

export interface WalletServiceClientOptions {
  baseUrl: string;
}

export interface ListWalletsParams {
  page?: number;
  limit?: number;
  ownerUserId?: string;
}

// Typed wrapper over wallet-service's REST API; forwards the caller's bearer token.
export class WalletServiceClient {
  private readonly baseUrl: string;

  constructor(opts: WalletServiceClientOptions) {
    this.baseUrl = opts.baseUrl;
  }

  async getWallet(id: string, authorization?: string): Promise<WalletDto> {
    return this.request<WalletDto>(`/api/v1/wallets/${encodeURIComponent(id)}`, { authorization });
  }

  async listWallets(
    params: ListWalletsParams,
    authorization?: string,
  ): Promise<PaginatedResult<WalletDto>> {
    const query = new URLSearchParams();
    if (params.page !== undefined) query.set('page', String(params.page));
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.ownerUserId !== undefined) query.set('ownerUserId', params.ownerUserId);
    const qs = query.toString();
    return this.request<PaginatedResult<WalletDto>>(`/api/v1/wallets${qs ? `?${qs}` : ''}`, {
      authorization,
    });
  }

  async createWallet(input: CreateWalletDto, authorization?: string): Promise<WalletDto> {
    return this.request<WalletDto>('/api/v1/wallets', {
      method: 'POST',
      body: input,
      authorization,
    });
  }

  async updateWalletMetadata(
    id: string,
    input: UpdateWalletMetadataDto,
    authorization?: string,
  ): Promise<WalletDto> {
    return this.request<WalletDto>(`/api/v1/wallets/${encodeURIComponent(id)}/metadata`, {
      method: 'PATCH',
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
        body.message ?? `wallet-service request failed with status ${response.status}`,
      );
    }

    return (await response.json()) as T;
  }
}
