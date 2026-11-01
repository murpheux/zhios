import fastify, { type FastifyInstance } from 'fastify';
import { authPlugin, errorHandler, toActor, type AuthPluginOptions } from '../src';
import { nowSeconds, signHs256 } from './jwt-helpers';

const SECRET = 'user-jwt-secret-0123456789';
const ISSUER = 'zuma';

const build = async (overrides: Partial<AuthPluginOptions> = {}): Promise<FastifyInstance> => {
  const app = fastify();
  await app.register(authPlugin, { jwtSecret: SECRET, jwtIssuer: ISSUER, ...overrides });
  app.setErrorHandler(errorHandler);
  app.get('/me', { preHandler: app.requireAuth }, async (request) => toActor(request.user));
  app.get('/admin', { preHandler: [app.requireAuth, app.requireRole('admin')] }, async () => ({ ok: true }));
  // requireRole without requireAuth: request.user is unset, so it must still fail closed.
  app.get('/role-only', { preHandler: app.requireRole('admin') }, async () => ({ ok: true }));
  await app.ready();
  return app;
};

const valid = (extra: Record<string, unknown> = {}) => ({
  sub: 'user-1',
  iss: ISSUER,
  exp: nowSeconds() + 300,
  ...extra,
});

describe('toActor', () => {
  it.each<[{ sub: string; roles?: string[] }, { sub: string; roles: string[] }]>([
    [{ sub: 'u1' }, { sub: 'u1', roles: [] }],
    [{ sub: 'u2', roles: ['admin'] }, { sub: 'u2', roles: ['admin'] }],
  ])('normalizes %j', (payload, actor) => {
    expect(toActor(payload)).toEqual(actor);
  });
});

describe('authPlugin (HS256)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await build();
  });
  afterAll(async () => {
    await app.close();
  });

  const call = (url: string, token?: string) =>
    app.inject({ method: 'GET', url, headers: token ? { authorization: `Bearer ${token}` } : {} });

  it('accepts a valid token and exposes the actor', async () => {
    const res = await call('/me', signHs256(valid({ roles: ['auditor'] }), SECRET));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ sub: 'user-1', roles: ['auditor'] });
  });

  it('accepts tokens minted by app.jwt.sign with the default (issuer-pinned) options', async () => {
    const res = await call('/me', app.jwt.sign({ sub: 'user-2', exp: nowSeconds() + 60 }));
    expect(res.json()).toEqual({ sub: 'user-2', roles: [] });
  });

  it.each<[string, () => string | undefined]>([
    ['missing token', () => undefined],
    ['garbage token', () => 'not.a.jwt'],
    ['wrong secret', () => signHs256(valid(), 'another-secret-0123456789')],
    ['wrong issuer', () => signHs256(valid({ iss: 'evil' }), SECRET)],
    ['missing issuer', () => signHs256({ sub: 'user-1', exp: nowSeconds() + 300 }, SECRET)],
    ['expired', () => signHs256(valid({ exp: nowSeconds() - 60 }), SECRET)],
    ['missing exp', () => signHs256({ sub: 'user-1', iss: ISSUER }, SECRET)],
    ['missing sub', () => signHs256({ iss: ISSUER, exp: nowSeconds() + 300 }, SECRET)],
    ['alg none', () => signHs256(valid(), SECRET, { alg: 'none', typ: 'JWT' }).replace(/\.[^.]+$/, '.')],
    ['alg HS512 (not pinned)', () => signHs256(valid(), SECRET, { alg: 'HS512', typ: 'JWT' })],
  ])('401s on %s without leaking the reason', async (_name, makeToken) => {
    const res = await call('/me', makeToken());
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Invalid or missing authentication token',
    });
  });

  it.each<[string[] | undefined, number]>([
    [undefined, 403],
    [['user'], 403],
    [['auditor'], 403],
    [['admin'], 200],
    [['user', 'admin'], 200],
  ])('requireRole(admin) with roles %j -> %d', async (roles, status) => {
    const res = await call('/admin', signHs256(valid(roles ? { roles } : {}), SECRET));
    expect(res.statusCode).toBe(status);
    if (status === 403) expect(res.json()).toMatchObject({ code: 'FORBIDDEN', message: "Requires role 'admin'" });
  });

  it('requireRole fails closed when no user is attached', async () => {
    expect((await call('/role-only')).statusCode).toBe(403);
  });
});

describe('authPlugin (HS256 with audience)', () => {
  it.each<[unknown, number]>([
    ['zuma-api', 200],
    ['other-api', 401],
    [undefined, 401],
  ])('aud=%p -> %d', async (aud, status) => {
    const app = await build({ jwtAudience: 'zuma-api' });
    const token = signHs256(valid(aud === undefined ? {} : { aud }), SECRET);
    const res = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(status);
    await app.close();
  });
});

describe('authPlugin (JWKS misconfiguration)', () => {
  it('refuses to start with a JWKS URI but no audience', async () => {
    const app = fastify();
    app.register(authPlugin, { jwtSecret: SECRET, jwtIssuer: ISSUER, jwksUri: 'https://idp.example.com/jwks' });
    await expect(app.ready()).rejects.toThrow('jwtAudience is required when jwksUri is set');
  });
});
