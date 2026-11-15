import { DomainError } from './domain-error';

export type UpstreamErrorCode = 'UPSTREAM_TIMEOUT' | 'UPSTREAM_UNAVAILABLE' | 'UPSTREAM_ERROR';

const STATUS: Record<UpstreamErrorCode, 502 | 503 | 504> = {
  UPSTREAM_ERROR: 502,
  UPSTREAM_UNAVAILABLE: 503,
  UPSTREAM_TIMEOUT: 504,
};

// Client-safe messages: the upstream's own response/error text is never exposed.
export const UPSTREAM_MESSAGES: Record<UpstreamErrorCode, string> = {
  UPSTREAM_ERROR: 'A dependency returned an unexpected response',
  UPSTREAM_UNAVAILABLE: 'A dependency is temporarily unavailable',
  UPSTREAM_TIMEOUT: 'A dependency did not respond in time',
};

// A call to another service failed. Maps to 502/503/504 with a stable code (unlike other 5xx
// errors, which collapse to an opaque 500) so clients can tell "retry later" from "bug".
// `upstream` names the dependency for logs; the message sent to clients is fixed.
export class UpstreamError extends DomainError {
  readonly httpStatus: 502 | 503 | 504;
  readonly code: UpstreamErrorCode;

  constructor(
    readonly upstream: string,
    code: UpstreamErrorCode,
    readonly cause?: unknown,
  ) {
    super(`${upstream}: ${UPSTREAM_MESSAGES[code]}`);
    this.code = code;
    this.httpStatus = STATUS[code];
  }
}
