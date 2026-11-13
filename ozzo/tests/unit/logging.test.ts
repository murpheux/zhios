import { Writable } from 'node:stream';
import pino from 'pino';
import { loadConfig } from '../../src/config';
import { REDACT_PATHS } from '../../src/config/logger';
import { NewRelicLogStream } from '../../src/infrastructure/newrelic-log-stream';

const baseEnv = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  OKTA_ISSUER_BASE_URL: 'https://example.okta.com/oauth2/default',
  OKTA_AUDIENCE: 'api://default',
};

describe('logging config', () => {
  it('applies defaults, and LOG_TO_FILE follows NODE_ENV', () => {
    const dev = loadConfig({ ...baseEnv, NODE_ENV: 'development' });
    expect(dev.logging).toMatchObject({ toFile: false, filePath: './logs', fileRotateDays: 7, fileMaxSizeBytes: 10_485_760 });
    expect(dev.newRelic).toMatchObject({ enabled: false, appName: 'ozzo-service' });
    expect(loadConfig({ ...baseEnv, NODE_ENV: 'production' }).logging.toFile).toBe(true);
    expect(loadConfig({ ...baseEnv, NODE_ENV: 'production', LOG_TO_FILE: 'false' }).logging.toFile).toBe(false);
  });

  it.each([{ NEW_RELIC_ENABLED: 'true' }, { NEWRELIC_LOGS_ENABLED: 'true' }])('requires a license key when %o', (extra) => {
    expect(() => loadConfig({ ...baseEnv, ...extra })).toThrow(/NEW_RELIC_LICENSE_KEY/);
    expect(loadConfig({ ...baseEnv, ...extra, NEW_RELIC_LICENSE_KEY: 'x'.repeat(40) }).newRelic.licenseKey).toBeDefined();
  });
});

describe('redaction', () => {
  it('censors secrets in log output', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _e, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const log = pino({ redact: { paths: REDACT_PATHS, censor: '[redacted]' } }, sink);
    log.info({ req: { headers: { authorization: 'Bearer abc' } }, user: { password: 'pw', token: 't' }, password: 'pw2' }, 'x');
    const out = lines.join('');
    expect(out).not.toMatch(/Bearer abc|"pw"|"pw2"|"t"/);
    expect(out).toContain('[redacted]');
  });
});

describe('NewRelicLogStream', () => {
  it('batches pino lines and posts them with the api key; failures do not throw', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    const stream = new NewRelicLogStream({
      endpoint: 'https://logs.test/v1',
      licenseKey: 'key',
      service: 'ozzo-service',
      environment: 'test',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    stream.write(`${JSON.stringify({ level: 30, time: 1, msg: 'hello', a: 1 })}\n`);
    await stream.flush();

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('https://logs.test/v1');
    expect(init.headers['api-key']).toBe('key');
    expect(JSON.parse(init.body)[0].logs[0]).toMatchObject({ message: 'hello', level: 'info', timestamp: 1, a: 1 });

    fetchFn.mockRejectedValue(new Error('boom'));
    stream.write(`${JSON.stringify({ level: 50, time: 2, msg: 'bad' })}\n`);
    await expect(stream.flush()).resolves.toBeUndefined();
    stream.destroy();
  });
});
