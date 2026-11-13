import { UpstreamError } from '../../domain/errors';

export type FetchLike = typeof fetch;

export interface PostRequestOptions {
  /** Dependency name for logs/errors, e.g. "sendgrid". */
  upstream: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  fetchImpl: FetchLike;
  timeoutMs: number;
}

// POST with a hard timeout. Any non-2xx or transport failure becomes an UpstreamError whose client
// message is fixed (provider response bodies can echo recipients/credentials and are never surfaced).
// Not retried: sends are not idempotent, so a retry could duplicate a notification.
export const postRequest = async (opts: PostRequestOptions): Promise<Response> => {
  let response: Response;
  try {
    response = await opts.fetchImpl(opts.url, {
      method: 'POST',
      headers: opts.headers,
      body: opts.body,
      signal: AbortSignal.timeout(opts.timeoutMs),
      redirect: 'error',
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new UpstreamError(opts.upstream, timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE', error);
  }
  if (!response.ok) {
    // Drain so the connection is released; the body itself is discarded.
    await response.arrayBuffer().catch(() => undefined);
    throw new UpstreamError(
      opts.upstream,
      response.status >= 500 || response.status === 429 ? 'UPSTREAM_UNAVAILABLE' : 'UPSTREAM_ERROR',
      new Error(`${opts.upstream} responded ${response.status}`),
    );
  }
  return response;
};
