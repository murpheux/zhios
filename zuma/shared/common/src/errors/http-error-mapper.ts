import { DomainError } from './domain-error';

export interface HttpErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Maps a thrown error to a serializable HTTP error body; unknown errors become 500s.
export const mapErrorToHttp = (error: unknown): HttpErrorBody => {
  if (error instanceof DomainError) {
    const details = (error as { details?: Record<string, unknown> }).details;
    return {
      statusCode: error.httpStatus,
      code: error.code,
      message: error.message,
      ...(details ? { details } : {}),
    };
  }

  return {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  };
};
