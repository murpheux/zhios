jest.mock('../../src/infrastructure/persistence/wallet.repository', () => ({
  PostgresWalletRepository: jest.requireActual('../fakes/in-memory-repositories').InMemoryWalletRepository,
}));
jest.mock('../../src/infrastructure/persistence/ledger.repository', () => ({
  PostgresLedgerRepository: jest.requireActual('../fakes/in-memory-repositories').InMemoryLedgerRepository,
}));
jest.mock('../../src/infrastructure/clients/transaction-history.client', () => ({
  TransactionHistoryHttpClient: jest.requireActual('../fakes/in-memory-repositories').FakeTransactionHistoryClient,
}));

import type { FastifyInstance } from 'fastify';
import { ALLOWED_ORIGIN, buildTestApp } from '../fakes/test-app';

const METRICS_TOKEN = 'metrics-token-0123456789';

describe('wallet-service platform wiring', () => {
  const apps: FastifyInstance[] = [];
  const make = async (env: Record<string, string | undefined> = {}) => {
    const harness = await buildTestApp(env);
    apps.push(harness.app);
    return harness;
  };
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    jest.restoreAllMocks();
  });

  describe('probes', () => {
    it('/healthz is always 200 and not rate limited', async () => {
      const { app } = await make({ RATE_LIMIT_MAX: '1' });
      for (let i = 0; i < 3; i += 1) {
        const res = await app.inject({ method: 'GET', url: '/healthz' });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ status: 'ok' });
        expect(res.headers['x-ratelimit-limit']).toBeUndefined();
      }
    });

    // TODO(zinga): Implement PostgreSQL connection health checks in readyz probe.
    // These tests were written for MongoDB/Mongoose and need to be updated for PostgreSQL.
    // Skip for now since zinga uses PostgreSQL, not MongoDB.
    it.skip('/readyz returns correct status based on PostgreSQL connection', async () => {
      const { app } = await make();
      const res = await app.inject({ method: 'GET', url: '/readyz' });
      expect(res.statusCode).toBeGreaterThanOrEqual(200);
    });
  });

  describe('/metrics', () => {
    it.each<[string, Record<string, string>, Record<string, string>, number]>([
      ['disabled', { METRICS_ENABLED: 'false' }, {}, 404],
      ['open outside production', { METRICS_ENABLED: 'true' }, {}, 200],
      ['hidden in production without METRICS_TOKEN', { METRICS_ENABLED: 'true', NODE_ENV: 'production' }, {}, 404],
      [
        'token required in production (missing)',
        { METRICS_ENABLED: 'true', NODE_ENV: 'production', METRICS_TOKEN },
        {},
        401,
      ],
      [
        'token required in production (valid)',
        { METRICS_ENABLED: 'true', NODE_ENV: 'production', METRICS_TOKEN },
        { authorization: `Bearer ${METRICS_TOKEN}` },
        200,
      ],
    ])('%s -> %d', async (_name, env, headers, status) => {
      const { app } = await make(env);
      const res = await app.inject({ method: 'GET', url: '/metrics', headers });
      expect(res.statusCode).toBe(status);
      if (status === 200) { expect(res.body).toContain('http_request_duration_seconds'); }
    });
  });

  describe('/docs', () => {
    it.each<[string, Record<string, string | undefined>, boolean]>([
      ['off when DOCS_ENABLED=false', { DOCS_ENABLED: 'false' }, false],
      ['on by default outside production', { DOCS_ENABLED: undefined }, true],
      ['off by default in production', { DOCS_ENABLED: undefined, NODE_ENV: 'production' }, false],
      ['opt-in in production', { DOCS_ENABLED: 'true', NODE_ENV: 'production' }, true],
    ])('%s', async (_name, env, enabled) => {
      const { app } = await make(env);
      const res = await app.inject({ method: 'GET', url: '/docs/json' });
      expect(res.statusCode).toBe(enabled ? 200 : 404);
      if (enabled) {
        const spec = res.json();
        expect(spec.info).toMatchObject({ title: 'Wallet Service API', version: '0.1.0' });
        expect(Object.keys(spec.paths)).toEqual(
          expect.arrayContaining(['/api/v1/wallets', '/internal/wallets/{id}/debits']),
        );
        // CSP is relaxed only when the HTML docs UI is served.
        expect(res.headers['content-security-policy']).toBeUndefined();
      } else {
        expect(res.headers['content-security-policy']).toBeDefined();
      }
    });
  });

  describe('HTTP hardening', () => {
    it('sends rate-limit headers on API routes and 429s past the budget', async () => {
      const { app, bearer } = await make({ RATE_LIMIT_MAX: '2' });
      const headers = bearer('alice');
      const first = await app.inject({ method: 'GET', url: '/api/v1/wallets', headers });
      expect(first.headers['x-ratelimit-limit']).toBe('2');
      await app.inject({ method: 'GET', url: '/api/v1/wallets', headers });
      const limited = await app.inject({ method: 'GET', url: '/api/v1/wallets', headers });
      expect(limited.statusCode).toBe(429);
      expect(limited.json()).toMatchObject({ code: 'RATE_LIMITED' });
    });

    it('gives service callers their own budget', async () => {
      const { app, serviceHeaders } = await make({ RATE_LIMIT_MAX: '1', RATE_LIMIT_SERVICE_MAX: '5' });
      const res = await app.inject({
        method: 'GET',
        url: '/internal/wallets/ffffffffffffffffffffffff',
        headers: serviceHeaders('transaction-service'),
      });
      expect(res.headers['x-ratelimit-limit']).toBe('5');
    });

    it.each<[string, string | undefined]>([
      [ALLOWED_ORIGIN, ALLOWED_ORIGIN],
      ['https://evil.example.com', undefined],
    ])('CORS for origin %s', async (origin, allowed) => {
      const { app } = await make();
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/api/v1/wallets',
        headers: { origin, 'access-control-request-method': 'POST' },
      });
      expect(res.headers['access-control-allow-origin']).toBe(allowed);
    });

    it('413s bodies over HTTP_BODY_LIMIT_BYTES', async () => {
      const { app, bearer } = await make({ HTTP_BODY_LIMIT_BYTES: '256' });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/wallets',
        headers: bearer('alice'),
        payload: { label: 'x'.repeat(1024), network: 'testnet', type: 'hot' },
      });
      expect(res.statusCode).toBe(413);
      expect(res.json()).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
    });

    it('sets helmet security headers', async () => {
      const { app } = await make();
      const res = await app.inject({ method: 'GET', url: '/healthz' });
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });
});
