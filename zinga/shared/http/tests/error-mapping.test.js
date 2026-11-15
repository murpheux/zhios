"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const shared_common_1 = require("@zinga/shared-common");
describe('mapErrorToHttp', () => {
    it.each([
        [new shared_common_1.ConflictError('Insufficient funds', 'INSUFFICIENT_FUNDS'), 409, 'INSUFFICIENT_FUNDS'],
        [new shared_common_1.ConflictError('Conflict'), 409, 'CONFLICT'],
        [new shared_common_1.ValidationError('bad amount'), 400, 'VALIDATION_ERROR'],
        [Object.assign(new Error('Too many'), { statusCode: 429 }), 429, 'RATE_LIMITED'],
        [Object.assign(new Error('Body too large'), { statusCode: 413, code: 'FST_ERR_CTP_BODY_TOO_LARGE' }), 413, 'PAYLOAD_TOO_LARGE'],
    ])('maps %p', (error, statusCode, code) => {
        expect((0, shared_common_1.mapErrorToHttp)(error)).toMatchObject({ statusCode, code });
    });
    it('never leaks internal messages for unknown errors', () => {
        const body = (0, shared_common_1.mapErrorToHttp)(new Error('connection string mongodb://user:pass@host'));
        expect(body).toEqual({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
    });
});
