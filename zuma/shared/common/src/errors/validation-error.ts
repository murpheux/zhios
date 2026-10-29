import { DomainError } from './domain-error';

export class ValidationError extends DomainError {
  readonly httpStatus = 400;
  readonly code = 'VALIDATION_ERROR';

  constructor(message: string, public readonly details?: Record<string, unknown>) {
    super(message);
  }
}
