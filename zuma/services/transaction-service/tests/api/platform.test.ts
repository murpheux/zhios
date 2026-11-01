jest.mock('../../src/infrastructure/persistence/transaction.repository', () => ({
  MongooseTransactionRepository: jest.requireActual('../fakes/in-memory-adapters').InMemoryTransactionRepository,
}));
jest.mock('../../src/infrastructure/persistence/audit-log.repository', () => ({
  MongooseAuditLogRepository: jest.requireActual('../fakes/in-memory-adapters').InMemoryAuditLogRepository,
}));
jest.mock('../../src/infrastructure/persistence/system-event.repository', () => ({
  MongooseSystemEventRepository: jest.requireActual('../fakes/in-memory-adapters').InMemorySystemEventRepository,
}));
jest.mock('../../src/infrastructure/clients/wallet-service.client', () => ({
  WalletServiceHttpClient: jest.requireActual('../fakes/in-memory-adapters').FakeWalletService,
}));

import mongoose from 'mongoose';
import type { FastifyInstance } from 'fastify';
import { ALLOWED_ORIGIN, buildTestApp } from '../fakes/test-app';

const METRICS_TOKEN = 'metrics-token-0123456789';
// Production requires a non-mock signer; the rpc adapter flag satisfies config validation.
const PROD = { NODE_ENV: 'production', BITCOIN_ADAPTER: 'rpc' };

describe('transaction-service platform wiring', () => {
  const apps: FastifyInstance[] = [];
  const make = async (env: Record<string, string | undefined> = {}) => {
    const harness = await buildTestApp(env);
    apps.push(harness.app);
    return harness;
  };
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('wires the wallet-service client with a service-token signer for audience wallet-service', async () => {
    const { walletService, config } = await make({ WALLET_SERVICE_URL: 'http://wallet:3001' });
    expect(walletService.options).toMatchObject({ baseUrl: 'http://wallet:3001', audience: 'wallet-service' });
    const signer = (walletService.options as { tokenSigner: { sign(aud: string): string } }).tokenSigner;
    const payload = JSON.parse(Buffer.from(signer.sign('wallet-service').split('.')[1] ?? '', 'base64url').toString());
    expect(payload).toMatchObject({ sub: config.SERVICE_NAME, aud: 'wallet-service', role: 'service', iss: 'zuma-internal' });
  });

  describe('probes', () => {
    it('/healthz is 200', async () => {
      const { app } = await make();
      expect((await app.inject({ method: 'GET', url: '/healthz' })).json()).toEqual({ status: 'ok' });
    });

    it.each<[string, unknown, number]>([
      ['disconnected', undefined, 503],
      ['connected without db', { readyState: mongoose.ConnectionStates.connected }, 503],
      [
        'connected and answering pings',
        { readyState: mongoose.ConnectionStates.connected, db: { admin: () => ({ ping: async () => ({ ok: 1 }) }) } },
        200,
      ],
    ])('/readyz when Mongo is %s -> %d', async (_name, connection, status) => {
      const original = mongoose.connections[0];
      if (connection) (mongoose.connections as unknown[])[0] = connection;
      try {
        const { app } = await make();
        expect((await app.inject({ method: 'GET', url: '/readyz' })).statusCode).toBe(status);
      } finally {
        (mongoose.connections as unknown[])[0] = original;
      }
    });
  });

  describe('/metrics', () => {
    it.each<[string, Record<string, string>, Record<string, string>, number]>([
      ['disabled', { METRICS_ENABLED: 'false' }, {}, 404],
      ['open outside production', { METRICS_ENABLED: 'true' }, {}, 200],
      ['hidden in production without a token', { METRICS_ENABLED: 'true', ...PROD }, {}, 404],
      ['401 in production with a wrong token', { METRICS_ENABLED: 'true', METRICS_TOKEN, ...PROD }, { authorization: 'Bearer wrong' }, 401],
      ['200 in production with the token', { METRICS_ENABLED: 'true', METRICS_TOKEN, ...PROD }, { authorization: `Bearer ${METRICS_TOKEN}` }, 200],
    ])('%s', async (_name, env, headers, status) => {
      const { app } = await make(env);
      expect((await app.inject({ method: 'GET', url: '/metrics', headers })).statusCode).toBe(status);
    });
  });

  describe('/docs', () => {
    it.each<[string, Record<string, string | undefined>, boolean]>([
      ['on by default outside production', { DOCS_ENABLED: undefined }, true],
      ['off by default in production', { DOCS_ENABLED: undefined, ...PROD }, false],
      ['opt-in in production', { DOCS_ENABLED: 'true', ...PROD }, true],
    ])('%s', async (_name, env, enabled) => {
      const { app } = await make(env);
      const res = await app.inject({ method: 'GET', url: '/docs/json' });
      expect(res.statusCode).toBe(enabled ? 200 : 404);
      if (enabled) {
        const spec = res.json();
        expect(spec.info.title).toBe('Transaction Service API');
        expect(JSON.stringify(spec.paths['/api/v1/transactions'].post)).toContain('idempotency-key');
      }
    });
  });

  it.each<[string, string | undefined]>([
    [ALLOWED_ORIGIN, ALLOWED_ORIGIN],
    ['https://evil.example.com', undefined],
  ])('CORS preflight from %s', async (origin, allowed) => {
    const { app } = await make();
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/transactions',
      headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'idempotency-key' },
    });
    expect(res.headers['access-control-allow-origin']).toBe(allowed);
  });

  it('rate limits per user with headers', async () => {
    const { app, bearer } = await make({ RATE_LIMIT_MAX: '1' });
    const headers = bearer('alice');
    const first = await app.inject({ method: 'GET', url: '/api/v1/transactions', headers });
    expect(first.headers['x-ratelimit-remaining']).toBe('0');
    expect((await app.inject({ method: 'GET', url: '/api/v1/transactions', headers })).statusCode).toBe(429);
    expect((await app.inject({ method: 'GET', url: '/api/v1/transactions', headers: bearer('bob') })).statusCode).toBe(200);
  });
});
