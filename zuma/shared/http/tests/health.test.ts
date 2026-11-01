import fastify from 'fastify';
import { healthPlugin } from '../src';

describe('healthPlugin', () => {
  const build = async (checks: Array<() => Promise<void>>) => {
    const app = fastify();
    await app.register(healthPlugin, { checks, checkTimeoutMs: 50 });
    await app.ready();
    return app;
  };

  it('/healthz is always ok', async () => {
    const app = await build([() => Promise.reject(new Error('db down'))]);
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('/readyz is 200 when all checks pass', async () => {
    const app = await build([() => Promise.resolve()]);
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });

  it('/readyz is 503 without leaking the reason when a check fails or times out', async () => {
    const app = await build([
      () => Promise.reject(new Error('secret-host:27017 refused')),
      () => new Promise<void>(() => undefined),
    ]);
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(503);
    expect(res.body).not.toContain('secret-host');
    await app.close();
  });
});
