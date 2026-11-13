import axios, { type AxiosInstance, isAxiosError } from 'axios';
import type { ZumaCallContext, ZumaClient, ZumaWallet } from '../application/ports';
import { UpstreamError } from '../domain';
import { injectTraceHeaders, trackZumaCall } from './newrelic';

export interface HttpZumaClientOptions {
  baseUrl: string;
  timeoutMs: number;
  /** Returns a service token for the wallet service, or undefined when not configured. */
  signServiceToken?: () => string;
  http?: AxiosInstance;
}

export class HttpZumaClient implements ZumaClient {
  private readonly http: AxiosInstance;

  constructor(private readonly opts: HttpZumaClientOptions) {
    this.http = opts.http ?? axios.create({ baseURL: opts.baseUrl, timeout: opts.timeoutMs });
  }

  async listWalletsByOwner(ownerUserId: string, ctx: ZumaCallContext): Promise<ZumaWallet[]> {
    const headers: Record<string, string> = {};
    if (ctx.bearerToken) headers.authorization = `Bearer ${ctx.bearerToken}`;
    const serviceToken = this.opts.signServiceToken?.();
    if (serviceToken) headers['x-service-token'] = serviceToken;

    injectTraceHeaders(headers);

    try {
      const res = await trackZumaCall('listWalletsByOwner', () =>
        this.http.get<{ items?: ZumaWallet[] } | ZumaWallet[]>('/wallets', {
          params: { ownerUserId, limit: 100 },
          headers,
        }),
      );
      return Array.isArray(res.data) ? res.data : (res.data.items ?? []);
    } catch (err) {
      if (isAxiosError(err)) {
        const status = err.response?.status;
        throw new UpstreamError(
          status ? `Wallet service responded with HTTP ${status}` : `Wallet service unreachable (${err.code ?? 'error'})`,
        );
      }
      throw err;
    }
  }
}
