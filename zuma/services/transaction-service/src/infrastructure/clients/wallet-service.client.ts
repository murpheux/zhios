import type {
  WalletMovementRejection,
  WalletMovementRequest,
  WalletMovementResult,
  WalletServicePort,
  WalletSummary,
} from '../../application/ports/wallet-service.port';

// Structurally matches @zuma/shared-http's ServiceTokenSigner.
export interface ServiceTokenSource {
  sign(audience: string): string;
}

export interface WalletServiceHttpClientOptions {
  baseUrl: string;
  tokenSigner: ServiceTokenSource;
  /** wallet-service's SERVICE_NAME, the token audience. */
  audience?: string;
  timeoutMs?: number;
  /** Total attempts for these (all idempotent) calls; retried on network errors, 429 and 5xx. */
  maxAttempts?: number;
  retryBaseDelayMs?: number;
}

const REJECTION_CODES: ReadonlySet<string> = new Set<WalletMovementRejection>([
  'INSUFFICIENT_FUNDS',
  'WALLET_NOT_ACTIVE',
  'WALLET_NOT_FOUND',
  'IDEMPOTENCY_CONFLICT',
  'REFUND_WITHOUT_DEBIT',
]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableStatus = (status: number) => status === 429 || status >= 500;

// HTTP adapter onto wallet-service's /internal API. Every call carries a fresh short-lived
// x-service-token (audience 'wallet-service'); user bearer tokens are never forwarded.
export class WalletServiceHttpClient implements WalletServicePort {
  private readonly audience: string;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly retryBaseDelayMs: number;

  constructor(private readonly options: WalletServiceHttpClientOptions) {
    this.audience = options.audience ?? 'wallet-service';
    this.timeoutMs = options.timeoutMs ?? 2000;
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 3);
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 100;
  }

  async getWallet(walletId: string): Promise<WalletSummary | null> {
    const response = await this.request('GET', `/internal/wallets/${encodeURIComponent(walletId)}`);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`wallet-service responded with ${response.status}`);
    }
    return (await response.json()) as WalletSummary;
  }

  async debit(request: WalletMovementRequest): Promise<WalletMovementResult> {
    return this.movement(`/internal/wallets/${encodeURIComponent(request.walletId)}/debits`, {
      transactionId: request.transactionId,
      amountSats: request.amountSats,
    });
  }

  async refund(request: WalletMovementRequest): Promise<WalletMovementResult> {
    return this.movement(`/internal/wallets/${encodeURIComponent(request.walletId)}/credits`, {
      transactionId: request.transactionId,
      amountSats: request.amountSats,
      reason: 'refund',
    });
  }

  private async movement(path: string, body: Record<string, string>): Promise<WalletMovementResult> {
    const response = await this.request('POST', path, body);
    if (response.ok) {
      const parsed = (await response.json()) as { balanceCache: string };
      return { ok: true, balanceCache: parsed.balanceCache };
    }
    if (response.status === 404) {
      return { ok: false, code: 'WALLET_NOT_FOUND', message: 'Wallet was not found' };
    }
    if (response.status === 409) {
      const parsed = (await response.json().catch(() => ({}))) as { code?: string; message?: string };
      if (parsed.code && REJECTION_CODES.has(parsed.code)) {
        return {
          ok: false,
          code: parsed.code as WalletMovementRejection,
          message: parsed.message ?? parsed.code,
        };
      }
    }
    throw new Error(`wallet-service responded with ${response.status}`);
  }

  private async request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await fetch(`${this.options.baseUrl}${path}`, {
          method,
          signal: AbortSignal.timeout(this.timeoutMs),
          headers: {
            'x-service-token': this.options.tokenSigner.sign(this.audience),
            ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (!isRetryableStatus(response.status) || attempt === this.maxAttempts) {
          return response;
        }
        lastError = new Error(`wallet-service responded with ${response.status}`);
      } catch (error) {
        lastError = error;
        if (attempt === this.maxAttempts) {
          break;
        }
      }
      await sleep(this.retryBaseDelayMs * 2 ** (attempt - 1));
    }
    throw lastError instanceof Error ? lastError : new Error('wallet-service request failed');
  }
}
