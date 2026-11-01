import {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  mapErrorToHttp,
} from '../src';

class UnavailableError extends DomainError {
  readonly httpStatus = 503;
  readonly code = 'DEPENDENCY_DOWN';
}

describe('domain errors', () => {
  it.each<[DomainError, string, number, string, string]>([
    [new ConflictError('busy'), 'ConflictError', 409, 'CONFLICT', 'busy'],
    [new ConflictError('broke', 'INSUFFICIENT_FUNDS'), 'ConflictError', 409, 'INSUFFICIENT_FUNDS', 'broke'],
    [new UnauthorizedError(), 'UnauthorizedError', 401, 'UNAUTHORIZED', 'Unauthorized'],
    [new UnauthorizedError('no token'), 'UnauthorizedError', 401, 'UNAUTHORIZED', 'no token'],
    [new ForbiddenError(), 'ForbiddenError', 403, 'FORBIDDEN', 'Forbidden'],
    [new NotFoundError('Wallet', 'w1'), 'NotFoundError', 404, 'NOT_FOUND', "Wallet with id 'w1' was not found"],
    [new ValidationError('bad'), 'ValidationError', 400, 'VALIDATION_ERROR', 'bad'],
    [new ValidationError('bad', undefined, 'BAD_FEE'), 'ValidationError', 400, 'BAD_FEE', 'bad'],
  ])('%p carries name/status/code/message', (error, name, httpStatus, code, message) => {
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DomainError);
    expect(error.name).toBe(name);
    expect(error.httpStatus).toBe(httpStatus);
    expect(error.code).toBe(code);
    expect(error.message).toBe(message);
  });

  it('keeps ValidationError details', () => {
    expect(new ValidationError('bad', { field: 'amount' }).details).toEqual({ field: 'amount' });
  });
});

describe('mapErrorToHttp', () => {
  it('maps domain 4xx errors with their code and message', () => {
    expect(mapErrorToHttp(new NotFoundError('Wallet', 'w1'))).toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: "Wallet with id 'w1' was not found",
    });
  });

  it('includes details when the domain error has them', () => {
    expect(mapErrorToHttp(new ValidationError('bad', { status: 'failed' }))).toEqual({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'bad',
      details: { status: 'failed' },
    });
  });

  it('collapses domain 5xx errors to the opaque internal body (keeping the status)', () => {
    expect(mapErrorToHttp(new UnavailableError('mongodb://user:pass@host down'))).toEqual({
      statusCode: 503,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  });

  it.each<[string, unknown, { statusCode: number; code: string; message: string }]>([
    ['plugin 4xx with custom code', Object.assign(new Error('nope'), { statusCode: 400, code: 'CUSTOM' }), { statusCode: 400, code: 'CUSTOM', message: 'nope' }],
    ['FST_ code replaced by default', Object.assign(new Error('bad media'), { statusCode: 415, code: 'FST_ERR_CTP_INVALID_MEDIA_TYPE' }), { statusCode: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'bad media' }],
    ['unknown 4xx falls back to BAD_REQUEST', Object.assign(new Error('teapot'), { statusCode: 418 }), { statusCode: 418, code: 'BAD_REQUEST', message: 'teapot' }],
    ['429 always RATE_LIMITED', Object.assign(new Error('slow down'), { statusCode: 429, code: 'X' }), { statusCode: 429, code: 'RATE_LIMITED', message: 'slow down' }],
    ['empty message replaced', Object.assign(new Error(''), { statusCode: 404 }), { statusCode: 404, code: 'NOT_FOUND', message: 'Bad request' }],
    ['plain object 401', { statusCode: 401 }, { statusCode: 401, code: 'UNAUTHORIZED', message: 'Bad request' }],
  ])('maps client errors: %s', (_name, error, expected) => {
    expect(mapErrorToHttp(error)).toEqual(expected);
  });

  it.each<[string, unknown]>([
    ['plain Error', new Error('secret')],
    ['5xx framework error', Object.assign(new Error('socket hang up'), { statusCode: 502 })],
    ['non-numeric status', Object.assign(new Error('x'), { statusCode: '400' })],
    ['string', 'boom'],
    ['null', null],
    ['undefined', undefined],
  ])('maps %s to an opaque 500', (_name, error) => {
    expect(mapErrorToHttp(error)).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  });

  it('returns a fresh body each time (callers cannot mutate the shared constant)', () => {
    const first = mapErrorToHttp(new Error('a'));
    first.message = 'mutated';
    expect(mapErrorToHttp(new Error('b')).message).toBe('An unexpected error occurred');
  });
});
