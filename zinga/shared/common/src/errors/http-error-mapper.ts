import { DomainError } from './domain-error';
import { UPSTREAM_MESSAGES, UpstreamError } from './upstream-error';

export interface HttpErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

const INTERNAL_ERROR_BODY: HttpErrorBody = {
  statusCode: 500,
  code: 'INTERNAL_ERROR',
  message: 'An unexpected error occurred',
};

const DEFAULT_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
};

// Framework/plugin errors (Fastify, @fastify/rate-limit, ...) carry a numeric statusCode and a
// client-safe message for 4xx; anything 5xx or unrecognised is collapsed to a generic 500.
const clientErrorStatus = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null) { return undefined; }
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
};

// Maps a thrown error to a serializable HTTP error body. Never leaks stack traces or the
// message of non-domain errors for 5xx.
export const mapErrorToHttp = (error: unknown): HttpErrorBody => {
  if (error instanceof UpstreamError) {
    return { statusCode: error.httpStatus, code: error.code, message: UPSTREAM_MESSAGES[error.code] };
  }
  if (error instanceof DomainError) {
    if (error.httpStatus >= 500) {
      return { ...INTERNAL_ERROR_BODY, statusCode: error.httpStatus };
    }
    const details = (error as { details?: Record<string, unknown> }).details;
    return {
      statusCode: error.httpStatus,
      code: error.code,
      message: error.message,
      ...(details ? { details } : {}),
    };
  }

  const status = clientErrorStatus(error);
  if (status !== undefined) {
    const { code, message } = error as { code?: unknown; message?: unknown };
    return {
      statusCode: status,
      code:
        status === 429
          ? 'RATE_LIMITED'
          : typeof code === 'string' && !code.startsWith('FST_')
            ? code
            : (DEFAULT_CODES[status] ?? 'BAD_REQUEST'),
      message: typeof message === 'string' && message.length > 0 ? message : 'Bad request',
    };
  }

  return { ...INTERNAL_ERROR_BODY };
};
