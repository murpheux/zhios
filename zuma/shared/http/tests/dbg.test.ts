// Regression: the JWKS secret callback must receive the decoded token header (kid). Before the fix the
// plugin registered @fastify/jwt without `decode.complete`, so every OIDC token was rejected.
const mockGetSigningKey = jest.fn();
jest.mock('jwks-rsa', () => jest.fn(() => ({ getSigningKey: mockGetSigningKey })));

import fastify from 'fastify';
import { authPlugin } from '../src';
import { generateRsaKeyPair, nowSeconds, signRs256 } from './jwt-helpers';

it('passes the token kid to the JWKS key resolver', async () => {
  const { publicKey, privateKey } = generateRsaKeyPair();
  mockGetSigningKey.mockResolvedValue({ getPublicKey: () => publicKey });
  const app = fastify();
  await app.register(authPlugin, {
    jwtSecret: 'unused-secret-0123456789',
    jwtIssuer: 'iss',
    jwksUri: 'https://idp.example.com/jwks',
    jwtAudience: 'aud',
  });
  app.get('/me', async (request) => request.jwtVerify());
  const token = signRs256({ sub: 's', iss: 'iss', aud: 'aud', exp: nowSeconds() + 100 }, privateKey, {
    alg: 'RS256',
    typ: 'JWT',
    kid: 'rotating-key-7',
  });
  const res = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } });
  expect(res.statusCode).toBe(200);
  expect(mockGetSigningKey).toHaveBeenCalledWith('rotating-key-7');
  await app.close();
});
