const mockGetSigningKey = jest.fn();
const mockGetSigningKeys = jest.fn().mockResolvedValue([]);
const mockJwksClient = jest.fn(() => ({ getSigningKey: mockGetSigningKey, getSigningKeys: mockGetSigningKeys }));
jest.mock('jwks-rsa', () => mockJwksClient);

import fastify, { type FastifyInstance } from 'fastify';
import { authPlugin, errorHandler, toActor, type AsymmetricAlgorithm } from '../src';
import { generateRsaKeyPair, nowSeconds, signHs256, signRs256 } from './jwt-helpers';

const JWKS_URI = 'https://idp.example.com/.well-known/jwks.json';
const ISSUER = 'https://idp.example.com/';
const AUDIENCE = 'zuma-api';
const { publicKey, privateKey } = generateRsaKeyPair();

const claims = (extra: Record<string, unknown> = {}) => ({
  sub: 'oidc-user',
  iss: ISSUER,
  aud: AUDIENCE,
  exp: nowSeconds() + 300,
  roles: ['user'],
  ...extra,
});

const build = async (jwksAlgorithms?: AsymmetricAlgorithm[]): Promise<FastifyInstance> => {
  const app = fastify();
  await app.register(authPlugin, {
    jwtSecret: 'unused-hs256-secret-0123456789',
    jwtIssuer: ISSUER,
    jwksUri: JWKS_URI,
    jwtAudience: AUDIENCE,
    jwksAlgorithms,
  });
  app.setErrorHandler(errorHandler);
  app.get('/me', { preHandler: app.requireAuth }, async (request) => toActor(request.user));
  await app.ready();
  return app;
};

describe('authPlugin (JWKS / OIDC)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await build();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    mockGetSigningKey.mockReset();
    mockGetSigningKey.mockResolvedValue({ getPublicKey: () => publicKey });
  });

  const call = (token: string) =>
    app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } });

  it('creates a caching, rate-limited JWKS client for the configured URI', () => {
    expect(mockJwksClient).toHaveBeenCalledWith({ jwksUri: JWKS_URI, cache: true, rateLimit: true, timeout: 5000 });
  });

  it('verifies an RS256 token using the key resolved by kid', async () => {
    const res = await call(signRs256(claims(), privateKey, { alg: 'RS256', typ: 'JWT', kid: 'key-1' }));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ sub: 'oidc-user', roles: ['user'] });
    expect(mockGetSigningKey).toHaveBeenCalledWith('key-1');
  });

  it.each<[string, () => string]>([
    ['missing kid', () => signRs256(claims(), privateKey)],
    ['missing audience', () => signRs256(claims({ aud: undefined }), privateKey, { alg: 'RS256', kid: 'key-1' })],
    ['missing issuer', () => signRs256(claims({ iss: undefined }), privateKey, { alg: 'RS256', kid: 'key-1' })],
    ['wrong audience', () => signRs256(claims({ aud: 'other' }), privateKey, { alg: 'RS256', kid: 'key-1' })],
    ['wrong issuer', () => signRs256(claims({ iss: 'https://evil/' }), privateKey, { alg: 'RS256', kid: 'key-1' })],
    ['expired', () => signRs256(claims({ exp: nowSeconds() - 60 }), privateKey, { alg: 'RS256', kid: 'key-1' })],
    // Algorithm-confusion: an HS256 token "signed" with the public key must never verify.
    ['HS256 signed with the public key', () => signHs256(claims(), publicKey, { alg: 'HS256', kid: 'key-1' })],
  ])('401s on %s', async (_name, makeToken) => {
    const res = await call(makeToken());
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('401s when the JWKS endpoint cannot resolve the key', async () => {
    mockGetSigningKey.mockRejectedValue(new Error('jwks unreachable'));
    const res = await call(signRs256(claims(), privateKey, { alg: 'RS256', kid: 'key-1' }));
    expect(res.statusCode).toBe(401);
  });
});

describe('authPlugin (JWKS algorithm allow-list)', () => {
  it('rejects RS256 when only ES256 is allowed', async () => {
    mockGetSigningKey.mockResolvedValue({ getPublicKey: () => publicKey });
    const app = await build(['ES256']);
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${signRs256(claims(), privateKey, { alg: 'RS256', kid: 'k' })}` },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('defaults to RS256 when given an empty list', async () => {
    mockGetSigningKey.mockResolvedValue({ getPublicKey: () => publicKey });
    const app = await build([]);
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${signRs256(claims(), privateKey, { alg: 'RS256', kid: 'k' })}` },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('authPlugin JWKS warm-up', () => {
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const warn = jest.fn();
  const info = jest.fn();

  const buildWithLog = async () => {
    const app = fastify();
    // Capture what the plugin logs, without depending on pino transport details.
    jest.spyOn(app.log, 'warn').mockImplementation(warn as never);
    jest.spyOn(app.log, 'info').mockImplementation(info as never);
    await app.register(authPlugin, { jwtSecret: 'x'.repeat(32), jwtIssuer: ISSUER, jwksUri: JWKS_URI, jwtAudience: AUDIENCE });
    return app;
  };

  beforeEach(() => {
    mockGetSigningKeys.mockReset();
    warn.mockReset();
    info.mockReset();
  });

  it('prefetches the signing keys once the app is ready, with a bounded fetch timeout', async () => {
    mockGetSigningKeys.mockResolvedValue([{ kid: 'k1' }, { kid: 'k2' }]);
    const app = await buildWithLog();
    expect(mockGetSigningKeys).not.toHaveBeenCalled();
    await app.ready();
    await flush();
    expect(mockGetSigningKeys).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith({ jwksKeys: 2 }, 'jwks cache warmed');
    expect(mockJwksClient).toHaveBeenLastCalledWith(expect.objectContaining({ jwksUri: JWKS_URI, cache: true, timeout: 5000 }));
    await app.close();
  });

  it('a failed warm-up is logged and non-fatal: the app still starts and serves', async () => {
    mockGetSigningKeys.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const app = await buildWithLog();
    app.get('/ping', async () => 'pong');
    await app.ready();
    await flush();
    expect(warn).toHaveBeenCalledWith({ jwksError: 'connect ECONNREFUSED' }, 'jwks warm-up failed; keys will be fetched on demand');
    expect((await app.inject({ method: 'GET', url: '/ping' })).statusCode).toBe(200);
    await app.close();
  });

  it('never blocks startup on a slow IdP', async () => {
    mockGetSigningKeys.mockReturnValue(new Promise(() => {}));
    const app = await buildWithLog();
    await expect(app.ready()).resolves.toBeDefined();
    await app.close();
  });
});
