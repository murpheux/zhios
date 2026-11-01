import fastify, { type FastifyInstance } from 'fastify';
import { ConflictError, NotFoundError } from '@zuma/shared-common';
import { buildServerOptions, errorHandler } from '../src';

describe('errorHandler', () => {
  let app: FastifyInstance;
  const logged: unknown[] = [];

  beforeAll(async () => {
    app = fastify(buildServerOptions({ bodyLimitBytes: 64 }));
    app.setErrorHandler(errorHandler);
    app.addHook('onRequest', async (request) => {
      request.log.error = ((obj: unknown) => {
        logged.push(obj);
      }) as never;
    });
    app.post(
      '/validated',
      { schema: { body: { type: 'object', properties: { n: { type: 'integer' } }, required: ['n'] } } },
      async () => ({ ok: true }),
    );
    app.get('/conflict', async () => {
      throw new ConflictError('Insufficient funds', 'INSUFFICIENT_FUNDS');
    });
    app.get('/missing', async () => {
      throw new NotFoundError('Wallet', 'w1');
    });
    app.get('/boom', async () => {
      throw new Error('mongodb://admin:hunter2@db:27017 refused');
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    logged.length = 0;
  });

  it('maps schema validation failures to 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({ method: 'POST', url: '/validated', payload: { n: 'x' } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(res.json().message).toMatch(/integer/);
  });

  it.each<[string, number, string]>([
    ['/conflict', 409, 'INSUFFICIENT_FUNDS'],
    ['/missing', 404, 'NOT_FOUND'],
  ])('maps domain errors on %s', async (url, statusCode, code) => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(statusCode);
    expect(res.json()).toMatchObject({ statusCode, code });
    expect(logged).toHaveLength(0);
  });

  it('returns an opaque 500 and logs the real error', async () => {
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
    expect(res.body).not.toContain('hunter2');
    expect(logged).toHaveLength(1);
  });

  it('maps oversized bodies to 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await app.inject({ method: 'POST', url: '/validated', payload: { n: 1, pad: 'x'.repeat(200) } });
    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('maps unsupported media types to 415', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/validated',
      headers: { 'content-type': 'application/xml' },
      payload: '<n>1</n>',
    });
    expect(res.statusCode).toBe(415);
    expect(res.json()).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
  });
});

describe('buildServerOptions', () => {
  it('uses hardened defaults', () => {
    expect(buildServerOptions()).toEqual({
      bodyLimit: 65536,
      connectionTimeout: 10000,
      requestTimeout: 30000,
      trustProxy: false,
    });
  });

  it('applies overrides', () => {
    expect(
      buildServerOptions({ bodyLimitBytes: 1, connectionTimeoutMs: 2, requestTimeoutMs: 3, trustProxy: true }),
    ).toEqual({ bodyLimit: 1, connectionTimeout: 2, requestTimeout: 3, trustProxy: true });
  });
});
