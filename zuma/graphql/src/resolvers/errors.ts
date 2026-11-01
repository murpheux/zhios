import { ErrorWithProps } from 'mercurius';
import { UpstreamHttpError } from '../clients/upstream-http-error';

// Maps resolver failures to GraphQL errors with `extensions.code` (+ statusCode). Upstream errors
// already carry a client-safe message; anything else is logged by mercurius and replaced with a
// generic message so internals never reach the client.
export const toGraphqlError = (error: unknown): never => {
  if (error instanceof ErrorWithProps) {
    throw error;
  }
  if (error instanceof UpstreamHttpError) {
    throw new ErrorWithProps(error.message, { code: error.code, statusCode: error.statusCode });
  }
  const internal = new ErrorWithProps('Internal server error', { code: 'INTERNAL_ERROR' });
  (internal as { cause?: unknown }).cause = error;
  throw internal;
};

export const badUserInput = (message: string): ErrorWithProps =>
  new ErrorWithProps(message, { code: 'BAD_USER_INPUT', statusCode: 400 });
