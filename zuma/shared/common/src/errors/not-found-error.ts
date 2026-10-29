import { DomainError } from './domain-error';

export class NotFoundError extends DomainError {
  readonly httpStatus = 404;
  readonly code = 'NOT_FOUND';

  constructor(resource: string, identifier: string) {
    super(`${resource} with id '${identifier}' was not found`);
  }
}
