// Captures pino output in-process: createLogger() takes no destination, so wrap pino to inject one.
const mockLines: string[] = [];
jest.mock('pino', () => {
  const actual = jest.requireActual('pino');
  const sink = new (jest.requireActual('node:stream').Writable)({
    write(chunk: Buffer, _encoding: string, callback: () => void) {
      mockLines.push(chunk.toString('utf8'));
      callback();
    },
  });
  const wrapped = Object.assign((options: unknown) => actual(options, sink), actual);
  wrapped.default = wrapped;
  return wrapped;
});

import { createLogger, redactionPaths } from '../src';

const lastRecord = (): Record<string, any> => JSON.parse(mockLines[mockLines.length - 1] ?? '{}');

describe('createLogger', () => {
  beforeEach(() => {
    mockLines.length = 0;
  });

  it('binds the service name, uses ISO timestamps and defaults to info', () => {
    const logger = createLogger({ serviceName: 'wallet-service' });
    expect(logger.level).toBe('info');
    logger.debug('hidden');
    expect(mockLines).toHaveLength(0);
    logger.info({ walletId: 'w1' }, 'hello');
    const record = lastRecord();
    expect(record).toMatchObject({ name: 'wallet-service', msg: 'hello', walletId: 'w1', level: 30 });
    expect(record.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('honours a custom level', () => {
    const logger = createLogger({ serviceName: 'svc', level: 'debug' });
    logger.debug('visible');
    expect(lastRecord()).toMatchObject({ msg: 'visible', level: 20 });
  });

  it('redacts the authorization header', () => {
    createLogger({ serviceName: 'svc' }).info({ req: { headers: { authorization: 'Bearer eyJ.secret', host: 'h' } } });
    const record = lastRecord();
    expect(record.req.headers.authorization).toBe('[REDACTED]');
    expect(record.req.headers.host).toBe('h');
    expect(mockLines.join('')).not.toContain('eyJ.secret');
  });

  it.each([
    'password',
    'privateKey',
    'private_key',
    'seed',
    'mnemonic',
    'secret',
    'jwtSecret',
    'rawTx',
    'token',
    'apiKey',
  ])('redacts nested %s fields', (field) => {
    createLogger({ serviceName: 'svc' }).info({ payload: { [field]: 'sensitive-value', safe: 'ok' } });
    const record = lastRecord();
    expect(record.payload[field]).toBe('[REDACTED]');
    expect(record.payload.safe).toBe('ok');
    expect(mockLines.join('')).not.toContain('sensitive-value');
  });

  it('keeps the redaction list covering every secret-bearing key', () => {
    expect(redactionPaths).toEqual(
      expect.arrayContaining(['req.headers.authorization', '*.privateKey', '*.mnemonic', '*.rawTx', '*.token']),
    );
  });
});
