import path from 'node:path';
import pino, { type Logger, type StreamEntry } from 'pino';
import { NewRelicLogStream } from '../infrastructure/newrelic-log-stream';
import { linkingMetadata } from '../infrastructure/newrelic';
import type { AppConfig } from './config';

export const SERVICE_NAME = 'ozzo';

export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-service-token"]',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  ...['password', 'passwd', 'secret', 'token', 'accessToken', 'refreshToken', 'idToken', 'bearerToken', 'authorization',
    'apiKey', 'licenseKey', 'internalJwtSecret', 'cardNumber', 'cvv', 'accountNumber'].flatMap((k) => [k, `*.${k}`]),
];

export type LoggerConfig = Pick<AppConfig, 'logLevel' | 'env' | 'logging' | 'newRelic'>;

let newRelicStream: NewRelicLogStream | undefined;
let rootLogger: Logger | undefined;

function canResolve(mod: string): boolean {
  try {
    require.resolve(mod);
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds the root pino logger: console (pretty in development, JSON otherwise), optional daily-rotating
 * file, optional New Relic Logs API. Setup problems degrade to console logging and are reported on stderr.
 */
export function createLogger(config: LoggerConfig): Logger {
  const base = { service: SERVICE_NAME, env: config.env };
  const options: pino.LoggerOptions = {
    level: config.logLevel,
    base,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    mixin: () => linkingMetadata(),
  };

  try {
    const targets: pino.TransportTargetOptions[] = [];

    if (config.env === 'development' && canResolve('pino-pretty')) {
      targets.push({
        target: 'pino-pretty',
        level: 'trace',
        options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
      });
    } else {
      targets.push({ target: 'pino/file', level: 'trace', options: { destination: 1 } });
    }

    if (config.logging.toFile) {
      if (canResolve('pino-roll')) {
        targets.push({
          target: 'pino-roll',
          level: 'trace',
          options: {
            file: path.join(config.logging.filePath, 'ozzo.log'),
            frequency: 'daily',
            dateFormat: 'yyyy-MM-dd',
            size: config.logging.fileMaxSizeBytes,
            limit: { count: config.logging.fileRotateDays },
            mkdir: true,
          },
        });
      } else {
        process.stderr.write('[logger] LOG_TO_FILE=true but pino-roll is not installed; file logging disabled\n');
      }
    }

    const streams: StreamEntry[] = [{ level: 'trace', stream: pino.transport({ targets }) }];

    if (config.logging.newRelicLogs.enabled) {
      if (config.newRelic.licenseKey) {
        newRelicStream = new NewRelicLogStream({
          endpoint: config.logging.newRelicLogs.endpoint,
          licenseKey: config.newRelic.licenseKey,
          service: config.newRelic.appName,
          environment: config.env,
        });
        streams.push({ level: 'trace', stream: newRelicStream });
      } else {
        process.stderr.write('[logger] NEWRELIC_LOGS_ENABLED=true but NEW_RELIC_LICENSE_KEY is empty; NR logs disabled\n');
      }
    }

    rootLogger = pino(options, pino.multistream(streams));
  } catch (err) {
    process.stderr.write(`[logger] transport setup failed, using console only: ${err instanceof Error ? err.message : err}\n`);
    rootLogger = pino(options);
  }
  return rootLogger;
}

/** Flushes buffered log output (file transport worker and New Relic batch). Never rejects. */
export async function flushLogs(): Promise<void> {
  try {
    await newRelicStream?.flush();
    await new Promise<void>((resolve) => {
      if (!rootLogger) return resolve();
      rootLogger.flush(() => resolve());
    });
  } catch (err) {
    process.stderr.write(`[logger] flush failed: ${err instanceof Error ? err.message : err}\n`);
  }
}
