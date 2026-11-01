import type { FastifyServerOptions } from 'fastify';

export interface ServerLimits {
  bodyLimitBytes?: number;
  connectionTimeoutMs?: number;
  requestTimeoutMs?: number;
  trustProxy?: boolean;
}

// Hardened defaults for every zuma Fastify constructor: 64KB bodies, bounded socket/request time.
export const buildServerOptions = ({
  bodyLimitBytes = 64 * 1024,
  connectionTimeoutMs = 10_000,
  requestTimeoutMs = 30_000,
  trustProxy = false,
}: ServerLimits = {}): Pick<
  FastifyServerOptions,
  'bodyLimit' | 'connectionTimeout' | 'requestTimeout' | 'trustProxy'
> => ({
  bodyLimit: bodyLimitBytes,
  connectionTimeout: connectionTimeoutMs,
  requestTimeout: requestTimeoutMs,
  trustProxy,
});
