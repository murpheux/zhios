"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const shared_common_1 = require("@zinga/shared-common");
const src_1 = require("../src");
const SECRET = `${'a'.repeat(32)}-internal-test-secret`;
const ISSUER = 'zuma-internal';
const signer = (0, src_1.createServiceTokenSigner)({ secret: SECRET, issuer: ISSUER, serviceName: 'wallet-service' });
const base = { secret: SECRET, issuer: ISSUER, audience: 'transaction-service' };
describe('verifyServiceToken expectedSubject', () => {
    const token = signer.sign('transaction-service');
    it('returns the caller when expectedSubject matches', () => {
        expect((0, src_1.verifyServiceToken)(token, { ...base, expectedSubject: 'wallet-service' })).toBe('wallet-service');
    });
    it('rejects when expectedSubject differs', () => {
        expect(() => (0, src_1.verifyServiceToken)(token, { ...base, expectedSubject: 'graphql-gateway' })).toThrow(shared_common_1.UnauthorizedError);
    });
    it('does not constrain the subject when omitted', () => {
        expect((0, src_1.verifyServiceToken)(token, base)).toBe('wallet-service');
    });
});
