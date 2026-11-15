import { ConflictError, ValidationError, mapErrorToHttp } from '@zinga/shared-common';

describe('mapErrorToHttp', () => {
  it.each([
    [new ConflictError('Insufficient funds', 'INSUFFICIENT_FUNDS'), 409, 'INSUFFICIENT_FUNDS'],
    [new ConflictError('Conflict'), 409, 'CONFLICT'],
    [new ValidationError('bad amount'), 400, 'VALIDATION_ERROR'],
    [Object.assign(new Error('Too many'), { statusCode: 429 }), 429, 'RATE_LIMITED'],
    [Object.assign(new Error('Body too large'), { statusCode: 413, code: 'FST_ERR_CTP_BODY_TOO_LARGE' }), 413, 'PAYLOAD_TOO_LARGE'],
  ])('maps %p', (error, statusCode, code) => {
    expect(mapErrorToHttp(error)).toMatchObject({ statusCode, code });
  });

  it('never leaks internal messages for unknown errors', () => {
    const body = mapErrorToHttp(new Error('connection string mongodb://user:pass@host'));
    expect(body).toEqual({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
  });
});
