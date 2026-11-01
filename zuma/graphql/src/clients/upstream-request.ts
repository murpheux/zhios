import { UpstreamHttpError } from './upstream-http-error';

export interface UpstreamClientOptions {
  baseUrl: string;
  /** Per-request timeout; default 5000ms. */
  timeoutMs?: number;
}

export interface UpstreamRequestOptions {
  method?: string;
  body?: unknown;
  authorization?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export const DEFAULT_UPSTREAM_TIMEOUT_MS = 5000;

const isTimeout = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');

// fetch wrapper shared by the upstream clients: bounded by AbortSignal.timeout, and every failure
// becomes an UpstreamHttpError with a safe message (upstream 5xx/network details are not exposed).
export const upstreamRequest = async <T>(
  upstream: string,
  baseUrl: string,
  path: string,
  opts: UpstreamRequestOptions,
): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        accept: 'application/json',
        ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(opts.authorization ? { authorization: opts.authorization } : {}),
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    if (isTimeout(error)) {
      throw new UpstreamHttpError(504, 'UPSTREAM_TIMEOUT', `${upstream} did not respond in time`);
    }
    throw new UpstreamHttpError(502, 'UPSTREAM_UNAVAILABLE', `${upstream} is unavailable`);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { code?: unknown; message?: unknown };
    if (response.status >= 400 && response.status < 500) {
      throw new UpstreamHttpError(
        response.status,
        typeof body.code === 'string' ? body.code : 'UPSTREAM_REJECTED',
        typeof body.message === 'string' ? body.message : `${upstream} rejected the request`,
      );
    }
    throw new UpstreamHttpError(502, 'UPSTREAM_ERROR', `${upstream} failed to process the request`);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new UpstreamHttpError(502, 'UPSTREAM_BAD_RESPONSE', `${upstream} returned an invalid response`);
  }
};

// Readiness probe of an upstream's /healthz; rejects on non-2xx or timeout.
export const upstreamHealthCheck = async (
  upstream: string,
  baseUrl: string,
  timeoutMs: number,
): Promise<void> => {
  const response = await fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(`${upstream} /healthz returned ${response.status}`);
  }
};
