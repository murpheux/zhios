import pino, { type Logger } from 'pino';
import { redactionPaths } from './redaction-paths';

export interface LoggerOptions {
  serviceName: string;
  level?: string;
}

// Creates a pino logger with secret redaction and service-name binding.
export const createLogger = ({ serviceName, level = 'info' }: LoggerOptions): Logger =>
  pino({
    name: serviceName,
    level,
    redact: {
      paths: redactionPaths,
      censor: '[REDACTED]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });

export type { Logger };
