import fastify, { type FastifyInstance } from 'fastify';
import {
  SERVICE_TOKEN_HEADER,
  allowServiceCallers,
  createServiceTokenSigner,
  errorHandler,
  serviceAuthPlugin,
  verifyServiceToken,
} from '../src';

const SECRET = `${'a'.repeat(32)}-internal-test-secret`;
const OTHER_SECRET = `${'b'.repeat(32)}-internal-test-secret`;
const ISSUER = 'zuma-internal';

const decodePayload = (token: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));

describe('createServiceTokenSigner / verifyServiceToken', () => {
  const signer = createServiceTokenSigner({ secret: SECRET, issuer: ISSUER, serviceName: 'wallet-service' });

  it('signs an HS256 token with sub/aud/role/iss/exp', () => {
    const token = signer.sign('transaction-service');
    const header = JSON.parse(Buffer.from(token.split('.')[0] ?? '', 'base64url').toString('utf8'));
    const payload = decodePayload(token);
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(payload).toMatchObject({
      sub: 'wallet-service',
      aud: 'transaction-service',
      role: 'service',
      iss: ISSUER,
    });
    expect((payload.exp as number) - (payload.iat as number)).toBe(60);
  });

  it('verifies and returns the calling service name', () => {
    const token = signer.sign('transaction-service');
    expect(
      verifyServiceToken(token, { secret: SECRET, issuer: ISSUER, audience: 'transaction-service' }),
    ).toBe('wallet-service');
  });

  it.each([
    ['audience mismatch', () => signer.sign('wallet-service'), { audience: 'transaction-service' }],
    ['wrong secret', () => signer.sign('transaction-service'), { secret: OTHER_SECRET }],
    ['wrong issuer', () => signer.sign('transaction-service'), { issuer: 'zuma' }],
    ['malformed token', () => 'not-a-jwt', {}],
    [
      'tampered payload',
      () => {
        const [h, , s] = signer.sign('transaction-service').split('.');
        const forged = Buffer.from(
          JSON.stringify({ sub: 'evil', aud: 'transaction-service', role: 'service', iss: ISSUER, exp: 9e9 }),
        ).toString('base64url');
        return `${h}.${forged}.${s}`;
      },
      {},
    ],
    [
      'alg none',
      () => {
        const [, p] = signer.sign('transaction-service').split('.');
        const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
        return `${none}.${p}.`;
      },
      {},
    ],
  ])('rejects: %s', (_name, makeToken, overrides) => {
    expect(() =>
      verifyServiceToken(makeToken(), {
        secret: SECRET,
        issuer: ISSUER,
        audience: 'transaction-service',
        ...overrides,
      }),
    ).toThrow(/Invalid service token/);
  });

  it('rejects expired tokens', () => {
    const past = Date.now() - 10 * 60 * 1000;
    const oldSigner = createServiceTokenSigner({
      secret: SECRET,
      issuer: ISSUER,
      serviceName: 'wallet-service',
      now: () => past,
    });
    expect(() =>
      verifyServiceToken(oldSigner.sign('transaction-service'), {
        secret: SECRET,
        issuer: ISSUER,
        audience: 'transaction-service',
      }),
    ).toThrow(/expired/);
  });

  it('refuses short secrets', () => {
    expect(() =>
      createServiceTokenSigner({ secret: 'short', issuer: ISSUER, serviceName: 'wallet-service' }),
    ).toThrow(/at least 32/);
  });
});

describe('serviceAuthPlugin + allowServiceCallers', () => {
  let app: FastifyInstance;
  const walletSigner = createServiceTokenSigner({ secret: SECRET, issuer: ISSUER, serviceName: 'wallet-service' });
  const gatewaySigner = createServiceTokenSigner({ secret: SECRET, issuer: ISSUER, serviceName: 'graphql-gateway' });

  beforeAll(async () => {
    app = fastify();
    await app.register(serviceAuthPlugin, { secret: SECRET, issuer: ISSUER, serviceName: 'transaction-service' });
    app.setErrorHandler(errorHandler);
    app.get(
      '/internal/ping',
      { preHandler: [app.requireService, allowServiceCallers('wallet-service')] },
      async (request) => ({ caller: request.serviceCaller }),
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const call = (token?: string) =>
    app.inject({
      method: 'GET',
      url: '/internal/ping',
      headers: token ? { [SERVICE_TOKEN_HEADER]: token } : {},
    });

  it('accepts an allowed caller and exposes request.serviceCaller', async () => {
    const res = await call(walletSigner.sign('transaction-service'));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ caller: 'wallet-service' });
  });

  it('401s without a token', async () => {
    const res = await call();
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('401s on audience mismatch', async () => {
    const res = await call(walletSigner.sign('wallet-service'));
    expect(res.statusCode).toBe(401);
  });

  it('401s on a token signed with another secret', async () => {
    const foreign = createServiceTokenSigner({ secret: OTHER_SECRET, issuer: ISSUER, serviceName: 'wallet-service' });
    const res = await call(foreign.sign('transaction-service'));
    expect(res.statusCode).toBe(401);
  });

  it('403s a valid but non-allowed caller', async () => {
    const res = await call(gatewaySigner.sign('transaction-service'));
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'FORBIDDEN' });
  });
});
