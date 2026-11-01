import pino from 'pino';
import mercurius from 'mercurius';
import { buildApp } from '../src/app';
import { loadGraphqlGatewayConfig } from '../src/config/graphql-gateway-config';

const baseEnv = {
  MONGODB_URI: 'mongodb://unused',
  JWT_SECRET: 'test-user-jwt-secret-0123456789',
  INTERNAL_JWT_SECRET: 'test-internal-jwt-secret-0123456789abcdef',
  CORS_ALLOWED_ORIGINS: 'https://app.example.com',
  METRICS_ENABLED: 'false',
  // production: GraphiQL off (its @fastify/static dep is also fastify-4-only, see below).
  NODE_ENV: 'production',
};

const build = (env: Record<string, string> = {}) =>
  buildApp({
    config: loadGraphqlGatewayConfig({ ...baseEnv, ...env }),
    logger: pino({ level: 'silent' }),
  });

// mercurius 14 declared fastify 4.x in its plugin metadata; >=15 supports fastify 5 (repo is on 16), so this
// relaxation is a no-op there and only kept so the suite still runs if the dependency is pinned back.
const meta = (mercurius as unknown as Record<symbol, { fastify?: string }>)[Symbol.for('plugin-meta')];
if (meta) meta.fastify = '>=4';

describe('graphql gateway app', () => {
  it('answers CORS preflight for an allowed origin only', async () => {
    const app = await build();
    const allowed = await app.inject({
      method: 'OPTIONS',
      url: '/graphql',
      headers: {
        origin: 'https://app.example.com',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('https://app.example.com');

    const denied = await app.inject({
      method: 'OPTIONS',
      url: '/graphql',
      headers: { origin: 'https://evil.example.com', 'access-control-request-method': 'POST' },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });

  it('rejects queries deeper than GRAPHQL_QUERY_DEPTH', async () => {
    const app = await build({ GRAPHQL_QUERY_DEPTH: '2' });
    const res = await app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query: '{ wallets { items { metadata } pageInfo { total } } }' },
    });
    expect(res.json().errors?.[0]?.message).toMatch(/depth/i);
    await app.close();
  });

  it('disables introspection in production by default', async () => {
    const app = await build();
    const res = await app.inject({ method: 'POST', url: '/graphql', payload: { query: '{ __schema { types { name } } }' } });
    expect(res.json().errors?.[0]?.message).toMatch(/introspection/i);
    await app.close();
  });

  it('requires idempotencyKey on createTransaction and has no type field', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/graphql',
      payload: {
        query:
          'mutation { createTransaction(input: { walletId: "w", amount: "1", feeRate: "1", destinationAddress: "a", type: "send" }) { id } }',
      },
    });
    const messages = (res.json().errors as Array<{ message: string }>).map((e) => e.message).join(' ');
    expect(messages).toMatch(/idempotencyKey/);
    expect(messages).toMatch(/type/);
    await app.close();
  });

  it('/readyz is 503 when upstreams are unreachable', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(503);
    global.fetch = originalFetch;
    await app.close();
  });
});
