import { DomainError } from './domain-error';

// Well-known conflict codes; any other string is allowed for service-specific conflicts.
export type ConflictCode =
  | 'CONFLICT'
  | 'INSUFFICIENT_FUNDS'
  | 'WALLET_NOT_ACTIVE'
  | 'IDEMPOTENCY_CONFLICT'
  | (string & {});

// 409: the request is valid but conflicts with current resource state.
export class ConflictError extends DomainError {
  readonly httpStatus = 409;
  readonly code: ConflictCode;

  constructor(message: string, code: ConflictCode = 'CONFLICT') {
    super(message);
    this.code = code;
  }
}

export class UnauthorizedError extends DomainError {
  readonly httpStatus = 401;
  readonly code = 'UNAUTHORIZED';

  constructor(message = 'Unauthorized') {
    super(message);
  }
}

export class ForbiddenError extends DomainError {
  readonly httpStatus = 403;
  readonly code = 'FORBIDDEN';

  constructor(message = 'Forbidden') {
    super(message);
  }
}
