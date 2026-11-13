import { buildTransportTargets, loggerOptionsFromEnv, type LoggingEnv } from '../src';

const env: LoggingEnv = {
  NODE_ENV: 'production',
  LOG_LEVEL: 'warn',
  LOG_TO_FILE: false,
  LOG_FILE_PATH: './logs/',
  LOG_FILE_MAX_SIZE: 1024,
  LOG_FILE_ROTATE_DAYS: 3,
};

describe('loggerOptionsFromEnv', () => {
  it('uses JSON console and no file by default', () => {
    expect(loggerOptionsFromEnv('svc', env)).toEqual({ serviceName: 'svc', level: 'warn', pretty: false, file: undefined });
  });

  it('is pretty only in development and maps file settings', () => {
    expect(loggerOptionsFromEnv('svc', { ...env, NODE_ENV: 'development', LOG_TO_FILE: true })).toMatchObject({
      pretty: true,
      file: { path: './logs/', maxSizeBytes: 1024, rotateDays: 3 },
    });
  });
});

describe('buildTransportTargets', () => {
  it('defaults to JSON on stdout', () => {
    expect(buildTransportTargets({ serviceName: 'svc' })).toEqual([
      { target: 'pino/file', level: 'info', options: { destination: 1 } },
    ]);
  });

  it('uses pino-pretty and a daily rotating file target', () => {
    const targets = buildTransportTargets({
      serviceName: 'svc',
      level: 'debug',
      pretty: true,
      file: { path: './logs/', maxSizeBytes: 1024, rotateDays: 3 },
    });
    expect(targets[0]).toMatchObject({ target: 'pino-pretty', level: 'debug' });
    expect(targets[1]).toEqual({
      target: 'pino-roll',
      level: 'debug',
      options: { file: './logs/svc', extension: '.log', frequency: 'daily', size: 1024, limit: { count: 3 }, mkdir: true },
    });
  });
});
