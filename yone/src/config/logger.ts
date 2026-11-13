import path from 'node:path';
import pino, { type Logger, type StreamEntry } from 'pino';
import { linkingMetadata } from '../infrastructure/newrelic';
import { NewRelicLogStream } from '../infrastructure/newrelic-log-stream';
import type { YoneConfig } from './yone-config';

// Keys are redacted at top level and one level deep (e.g. body.to, req.body.apiKey).
const SENSITIVE_KEYS = [
  'password', 'passwd', 'secret', 'token', 'accessToken', 'refreshToken', 'authorization',
  'apiKey', 'api_key', 'licenseKey', 'authToken', 'accountSid', 'webhookUrl', 'webhook_url',
  'phone', 'phoneNumber', 'to', 'from', 'email', 'recipient', 'recipients', 'cc', 'bcc',
];

export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-service-token"]',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  ...SENSITIVE_KEYS.flatMap((k) => [k, `*.${k}`, `*.*.${k}`]),
];

export type LoggerConfig = Pick<
  YoneConfig,
  'SERVICE_NAME' | 'NODE_ENV' | 'LOG_LEVEL' | 'LOG_TO_FILE' | 'LOG_FILE_PATH' | 'LOG_FILE_MAX_SIZE' |
  'LOG_FILE_ROTATE_DAYS' | 'NEWRELIC_LOGS_ENABLED' | 'NEWRELIC_LOGS_ENDPOINT' | 'NEW_RELIC_LICENSE_KEY' |
  'NEW_RELIC_APP_NAME'
>;

let newRelicStream: NewRelicLogStream | undefined;
let rootLogger: Logger | undefined;

const canResolve = (mod: string): boolean => {
  try {
    require.resolve(mod);
    return true;
  } catch {
    return false;
  }
};

const warn = (msg: string): void => {
  process.stderr.write(`[logger] ${msg}\n`);
};

/**
 * Root pino logger: console (pretty in development, JSON otherwise), optional daily-rotating file,
 * optional New Relic Logs API. Setup problems degrade to plain console logging and are reported on stderr.
 */
export const createLogger = (config: LoggerConfig): Logger => {
  const options: pino.LoggerOptions = {
    name: config.SERVICE_NAME,
    level: config.LOG_LEVEL,
    base: { service: config.SERVICE_NAME, env: config.NODE_ENV },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    mixin: () => linkingMetadata(),
  };

  try {
    const targets: pino.TransportTargetOptions[] = [];

    if (config.NODE_ENV === 'development' && canResolve('pino-pretty')) {
      targets.push({
        target: 'pino-pretty',
        level: 'trace',
        options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
      });
    } else {
      targets.push({ target: 'pino/file', level: 'trace', options: { destination: 1 } });
    }

    if (config.LOG_TO_FILE) {
      if (canResolve('pino-roll')) {
        targets.push({
          target: 'pino-roll',
          level: 'trace',
          options: {
            file: path.join(config.LOG_FILE_PATH, `${config.SERVICE_NAME}.log`),
            frequency: 'daily',
            dateFormat: 'yyyy-MM-dd',
            size: config.LOG_FILE_MAX_SIZE,
            limit: { count: config.LOG_FILE_ROTATE_DAYS },
            mkdir: true,
          },
        });
      } else {
        warn('LOG_TO_FILE=true but pino-roll is not installed; file logging disabled');
      }
    }

    const streams: StreamEntry[] = [{ level: 'trace', stream: pino.transport({ targets }) }];

    if (config.NEWRELIC_LOGS_ENABLED) {
      if (config.NEW_RELIC_LICENSE_KEY) {
        newRelicStream = new NewRelicLogStream({
          endpoint: config.NEWRELIC_LOGS_ENDPOINT,
          licenseKey: config.NEW_RELIC_LICENSE_KEY,
          service: config.NEW_RELIC_APP_NAME,
          environment: config.NODE_ENV,
        });
        streams.push({ level: 'trace', stream: newRelicStream });
      } else {
        warn('NEWRELIC_LOGS_ENABLED=true but NEW_RELIC_LICENSE_KEY is empty; NR logs disabled');
      }
    }

    rootLogger = pino(options, pino.multistream(streams));
  } catch (err) {
    warn(`transport setup failed, using console only: ${err instanceof Error ? err.message : String(err)}`);
    rootLogger = pino(options);
  }
  return rootLogger;
};

/** Flushes buffered log output (file transport worker and New Relic batch). Never rejects. */
export const flushLogs = async (): Promise<void> => {
  try {
    await newRelicStream?.flush();
    await new Promise<void>((resolve) => {
      if (!rootLogger) return resolve();
      rootLogger.flush(() => resolve());
    });
  } catch (err) {
    warn(`flush failed: ${err instanceof Error ? err.message : String(err)}`);
  }
};
