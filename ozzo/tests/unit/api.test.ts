import type { FastifyInstance } from 'fastify';
import pino from 'pino';
import { buildApp } from '../../src/app';
import type { TokenVerifier } from '../../src/application/ports';
import type { AppConfig } from '../../src/config';
import { UnauthorizedError } from '../../src/domain';
import { InMemoryCache } from '../../src/infrastructure/in-memory-cache';
import { MockKmsAdapter } from '../../src/infrastructure/mock-kms.adapter';
import { MockZumaClient } from '../../src/infrastructure/mock-zuma-client';
import { OWNER_SUB, validUser } from '../fixtures/data';
import { InMemoryBankAccountRepository, InMemoryUserRepository } from '../fixtures/in-memory-repositories';

const config: AppConfig = {
  env: 'test',
  port: 0,
  host: '127.0.0.1',
  logLevel: 'silent',
  databaseUrl: 'postgresql://unused',
  redisUrl: 'redis://unused',
  cacheTtlSeconds: 300,
  okta: { issuer: 'https://issuer.test', audience: 'api://test', jwksUri: 'https://issuer.test/keys', adminGroup: 'ozzo-admin' },
  zuma: { baseUrl: 'http://zuma.test', serviceName: 'wallet-service', timeoutMs: 1000, internalJwtIssuer: 'ozzo', useMock: true },
  newRelic: { enabled: false, appName: 'ozzo-service', logLevel: 'info' },
  logging: {
    toFile: false,
    filePath: './logs',
    fileMaxSizeBytes: 10_485_760,
    fileRotateDays: 7,
    newRelicLogs: { enabled: false, endpoint: 'https://log-api.newrelic.com/log/v1' },
  },
};

const verifier: TokenVerifier = {
  async verify(token) {
    if (token === 'good') return { sub: OWNER_SUB, groups: [] };
    throw new UnauthorizedError('Invalid or expired token');
  },
};

describe('HTTP API', () => {
  let app: FastifyInstance;
  const zuma = new MockZumaClient();

  beforeAll(async () => {
    app = await buildApp(config, pino({ level: 'silent' }), {
      users: new InMemoryUserRepository(),
      accounts: new InMemoryBankAccountRepository(),
      cache: new InMemoryCache(),
      sensitiveData: new MockKmsAdapter('test'),
      zuma,
      verifier,
      accountNumbers: { generate: () => String(Math.floor(1e11 + Math.random() * 9e11)) },
    });
    await app.ready();
  });
  afterAll(() => app.close());

  const auth = { authorization: 'Bearer good' };

  it.each([
    ['missing token', {}],
    ['invalid token', { authorization: 'Bearer bad' }],
    ['malformed header', { authorization: 'Basic abc' }],
  ])('returns 401 for %s', async (_n, headers) => {
    const res = await app.inject({ method: 'GET', url: '/users/00000000-0000-4000-8000-000000000000', headers });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('serves health without auth and OpenAPI JSON', async () => {
    expect((await app.inject({ url: '/healthz' })).statusCode).toBe(200);
    const spec = (await app.inject({ url: '/openapi.json' })).json();
    expect(spec.openapi).toBe('3.0.3');
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining(['/users', '/users/{id}', '/users/{id}/accounts', '/users/{id}/wallet']),
    );
  });

  it('runs the register -> account -> wallet flow with caching', async () => {
    const created = await app.inject({ method: 'POST', url: '/users', headers: auth, payload: validUser });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;

    const acc = await app.inject({
      method: 'POST',
      url: `/users/${id}/accounts`,
      headers: auth,
      payload: { accountType: 'checking' },
    });
    expect(acc.statusCode).toBe(201);
    expect(acc.json().balance).toBe('0');

    const profile = await app.inject({ url: `/users/${id}/profile`, headers: auth });
    expect(profile.json().accounts).toHaveLength(1);

    const w1 = await app.inject({ url: `/users/${id}/wallet`, headers: auth });
    const w2 = await app.inject({ url: `/users/${id}/wallet`, headers: auth });
    expect([w1.json().cached, w2.json().cached]).toEqual([false, true]);
    expect(zuma.calls).toBe(1);

    const del = await app.inject({ method: 'DELETE', url: `/users/${id}/accounts/${acc.json().id}`, headers: auth });
    expect(del.statusCode).toBe(204);
  });

  it('returns 400 on schema violations and 404 on unknown users', async () => {
    const bad = await app.inject({ method: 'POST', url: '/users', headers: auth, payload: { username: 'x' } });
    expect(bad.statusCode).toBe(400);
    const missing = await app.inject({
      url: '/users/00000000-0000-4000-8000-000000000000',
      headers: auth,
    });
    expect(missing.statusCode).toBe(404);
  });
});
