import type { Logger, TransportTargetOptions } from 'pino';
import { redactionPaths } from './redaction-paths';

export interface FileLogOptions {
  /** Directory the rotated log files are written to. */
  path: string;
  /** Rotate when the current file reaches this size (bytes). */
  maxSizeBytes: number;
  /** Number of rotated files to keep (rotation is also daily). */
  rotateDays: number;
}

export interface LoggerOptions {
  serviceName: string;
  level?: string;
  /** Human-readable console output via pino-pretty (development); JSON otherwise. */
  pretty?: boolean;
  /** Daily + size based rotating file output via pino-roll. */
  file?: FileLogOptions;
}

/** Subset of the validated service env that drives logging. */
export interface LoggingEnv {
  NODE_ENV: string;
  LOG_LEVEL: string;
  LOG_TO_FILE: boolean;
  LOG_FILE_PATH: string;
  LOG_FILE_MAX_SIZE: number;
  LOG_FILE_ROTATE_DAYS: number;
}

// Pretty in development only: production/test stay JSON.
export const loggerOptionsFromEnv = (serviceName: string, env: LoggingEnv): LoggerOptions => ({
  serviceName,
  level: env.LOG_LEVEL,
  pretty: env.NODE_ENV === 'development',
  file: env.LOG_TO_FILE
    ? { path: env.LOG_FILE_PATH, maxSizeBytes: env.LOG_FILE_MAX_SIZE, rotateDays: env.LOG_FILE_ROTATE_DAYS }
    : undefined,
});

// Transport targets for pino.transport(); stdout is always present.
export const buildTransportTargets = ({
  serviceName,
  level = 'info',
  pretty = false,
  file,
}: LoggerOptions): TransportTargetOptions[] => {
  const targets: TransportTargetOptions[] = [
    pretty
      ? {
          target: 'pino-pretty',
          level,
          options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
        }
      : { target: 'pino/file', level, options: { destination: 1 } },
  ];
  if (file) {
    targets.push({
      target: 'pino-roll',
      level,
      options: {
        file: `${file.path.replace(/\/+$/, '')}/${serviceName}`,
        extension: '.log',
        frequency: 'daily',
        size: file.maxSizeBytes,
        limit: { count: file.rotateDays },
        mkdir: true,
      },
    });
  }
  return targets;
};

// Creates a pino logger with secret redaction and service-name binding. pino is required lazily so
// the New Relic agent (initNewRelic) can instrument it when initialised before the first logger.
export const createLogger = (options: LoggerOptions): Logger => {
  const { serviceName, level = 'info', pretty = false, file } = options;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pino = require('pino') as typeof import('pino');
  const base = {
    name: serviceName,
    level,
    redact: { paths: redactionPaths, censor: '[REDACTED]' },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  if (!pretty && !file) return pino(base);
  // Level filtering is done per target; the logger itself must pass everything through.
  return pino({ ...base, level }, pino.transport({ targets: buildTransportTargets(options) }));
};

export type { Logger };
