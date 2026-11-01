import fastify, { type FastifyInstance } from 'fastify';
import { getMetricsRegistry, observabilityPlugin, type ObservabilityPluginOptions } from '../src';

const METRICS_TOKEN = 'metrics-token-0123456789';

const build = async (opts: ObservabilityPluginOptions): Promise<FastifyInstance> => {
  const app = fastify();
  await app.register(observabilityPlugin, opts);
  app.get('/ping/:id', async () => ({ ok: true }));
  await app.ready();
  return app;
};

describe('observabilityPlugin', () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('registers nothing when metrics are disabled', async () => {
    app = await build({ metricsEnabled: false });
    expect((await app.inject({ method: 'GET', url: '/metrics' })).statusCode).toBe(404);
  });

  it('serves Prometheus text with request durations labelled by route template', async () => {
    app = await build({ metricsEnabled: true });
    await app.inject({ method: 'GET', url: '/ping/123' });
    await app.inject({ method: 'GET', url: '/nope' });

    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body).toContain('http_request_duration_seconds_bucket');
    expect(res.body).toMatch(/route="\/ping\/:id",status_code="200"/);
    expect(res.body).not.toContain('/ping/123');
    expect(res.body).toMatch(/route="unmatched",status_code="404"/);
    expect(res.body).toContain('process_cpu_user_seconds_total');
  });

  it.each<[string, Record<string, string>, number]>([
    ['no header', {}, 401],
    ['wrong scheme', { authorization: `Basic ${METRICS_TOKEN}` }, 401],
    ['wrong token of a different length', { authorization: 'Bearer nope' }, 401],
    ['wrong token of the same length', { authorization: `Bearer ${'x'.repeat(METRICS_TOKEN.length)}` }, 401],
    ['correct token', { authorization: `Bearer ${METRICS_TOKEN}` }, 200],
  ])('gates /metrics with the bearer token: %s', async (_name, headers, status) => {
    app = await build({ metricsEnabled: true, metricsToken: METRICS_TOKEN, requireMetricsToken: true });
    const res = await app.inject({ method: 'GET', url: '/metrics', headers });
    expect(res.statusCode).toBe(status);
    if (status === 401) {
      expect(res.headers['www-authenticate']).toBe('Bearer');
      expect(res.json()).toEqual({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Invalid or missing metrics token' });
    }
  });

  it('does not expose /metrics when a token is required but not configured (production)', async () => {
    const warn = jest.fn();
    const instance = fastify();
    instance.log.warn = warn as never;
    await instance.register(observabilityPlugin, { metricsEnabled: true, requireMetricsToken: true });
    await instance.ready();
    app = instance;
    expect((await app.inject({ method: 'GET', url: '/metrics' })).statusCode).toBe(404);
    expect(warn).toHaveBeenCalledWith('METRICS_TOKEN not set; /metrics endpoint disabled');
  });
});

describe('getMetricsRegistry', () => {
  it('returns one process-wide registry', () => {
    expect(getMetricsRegistry()).toBe(getMetricsRegistry());
  });
});
