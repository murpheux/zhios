import type {
  CreateWalletDto,
  PaginatedResult,
  UpdateWalletMetadataDto,
  WalletDto,
} from '@zuma/shared-common';
import {
  DEFAULT_UPSTREAM_TIMEOUT_MS,
  upstreamHealthCheck,
  upstreamRequest,
  type UpstreamClientOptions,
  type UpstreamRequestOptions,
} from './upstream-request';

export type WalletServiceClientOptions = UpstreamClientOptions;

export interface ListWalletsParams {
  page?: number;
  limit?: number;
  ownerUserId?: string;
}

const UPSTREAM = 'wallet-service';

// Typed wrapper over wallet-service's REST API; forwards the caller's bearer token.
export class WalletServiceClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(opts: WalletServiceClientOptions) {
    this.baseUrl = opts.baseUrl;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS;
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

  async healthCheck(timeoutMs = 2000): Promise<void> {
    await upstreamHealthCheck(UPSTREAM, this.baseUrl, timeoutMs);
  }

  private request<T>(path: string, opts: UpstreamRequestOptions = {}): Promise<T> {
    return upstreamRequest<T>(UPSTREAM, this.baseUrl, path, { timeoutMs: this.timeoutMs, ...opts });
  }
}
