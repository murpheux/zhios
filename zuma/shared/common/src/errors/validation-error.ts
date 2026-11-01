import { DomainError } from './domain-error';

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
