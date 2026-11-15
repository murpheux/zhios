import { UnauthorizedError } from '@zinga/shared-common';
import { createServiceTokenSigner, verifyServiceToken } from '../src';

const SECRET = `${'a'.repeat(32)}-internal-test-secret`;
const ISSUER = 'zuma-internal';
const signer = createServiceTokenSigner({ secret: SECRET, issuer: ISSUER, serviceName: 'wallet-service' });
const base = { secret: SECRET, issuer: ISSUER, audience: 'transaction-service' };

describe('verifyServiceToken expectedSubject', () => {
  const token = signer.sign('transaction-service');

  it('returns the caller when expectedSubject matches', () => {
    expect(verifyServiceToken(token, { ...base, expectedSubject: 'wallet-service' })).toBe('wallet-service');
  });

  it('rejects when expectedSubject differs', () => {
    expect(() => verifyServiceToken(token, { ...base, expectedSubject: 'graphql-gateway' })).toThrow(
      UnauthorizedError,
    );
  });

  it('does not constrain the subject when omitted', () => {
    expect(verifyServiceToken(token, base)).toBe('wallet-service');
  });
});
