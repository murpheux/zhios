// Base class for domain errors; carries an HTTP status for the API layer to map.
export abstract class DomainError extends Error {
  abstract readonly httpStatus: number;
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// 400: input failed a domain/application-level validation rule.
export class ValidationError extends DomainError {
  readonly httpStatus = 400;
  readonly code: string;

  constructor(
    message: string,
    public readonly details?: Record<string, unknown>,
    code = 'VALIDATION_ERROR',
  ) {
    super(message);
    this.code = code;
  }
}

export type UpstreamErrorCode = 'UPSTREAM_TIMEOUT' | 'UPSTREAM_UNAVAILABLE' | 'UPSTREAM_ERROR';

const STATUS: Record<UpstreamErrorCode, 502 | 503 | 504> = {
  UPSTREAM_ERROR: 502,
  UPSTREAM_UNAVAILABLE: 503,
  UPSTREAM_TIMEOUT: 504,
};

// Client-safe messages: the provider's own response/error text is never exposed.
export const UPSTREAM_MESSAGES: Record<UpstreamErrorCode, string> = {
  UPSTREAM_ERROR: 'A dependency returned an unexpected response',
  UPSTREAM_UNAVAILABLE: 'A dependency is temporarily unavailable',
  UPSTREAM_TIMEOUT: 'A dependency did not respond in time',
};

// A provider call failed: 502/503/504 with a stable code and a fixed client message.
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
