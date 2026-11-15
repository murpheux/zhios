import fp from 'fastify-plugin';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import { SERVICE_TOKEN_HEADER, verifyServiceToken } from './service-auth';

export interface SecurityPluginOptions {
  /** Exact origins allowed for CORS; empty = no cross-origin access. '*' is rejected with credentials. */
  corsAllowedOrigins: string[];
  corsAllowCredentials?: boolean;
  /** Requests per window per key (user sub, service caller, else client IP). */
  rateLimitMax: number;
  /** e.g. '1 minute' or milliseconds. */
  rateLimitWindow: string | number;
  /** Budget for verified service callers; defaults to rateLimitMax. */
  rateLimitServiceMax?: number;
  /** Keep helmet's CSP off when serving HTML UIs (Swagger UI / GraphiQL) that need inline assets. */
  contentSecurityPolicy?: boolean;
  /** Paths exempt from rate limiting (probes). */
  rateLimitExemptPaths?: string[];
  /** When set, a valid x-service-token keys the rate limit by calling service. */
  serviceToken?: { secret: string; issuer: string; audience: string };
}

const DEFAULT_EXEMPT_PATHS = ['/healthz', '/readyz'];

const pathOf = (request: FastifyRequest): string => request.url.split('?', 1)[0] ?? request.url;

// Helmet + CORS + rate limiting, registered at the root (fastify-plugin) so it covers every route.
const securityPluginImpl: FastifyPluginAsync<SecurityPluginOptions> = async (
  app: FastifyInstance,
  opts: SecurityPluginOptions,
) => {
  const credentials = opts.corsAllowCredentials ?? false;
  if (credentials && opts.corsAllowedOrigins.includes('*')) {
    throw new Error("securityPlugin: '*' CORS origin is not allowed with credentials");
  }

  await app.register(fastifyHelmet, {
    global: true,
    contentSecurityPolicy: opts.contentSecurityPolicy ?? true,
  });

  const allowAll = opts.corsAllowedOrigins.includes('*');
  await app.register(fastifyCors, {
    origin: allowAll ? '*' : opts.corsAllowedOrigins.length > 0 ? opts.corsAllowedOrigins : false,
    credentials,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type', 'idempotency-key', 'x-request-id'],
    maxAgeSeconds: 600,
  });

  const exempt = new Set(opts.rateLimitExemptPaths ?? DEFAULT_EXEMPT_PATHS);
  const serviceMax = opts.rateLimitServiceMax ?? opts.rateLimitMax;

  // Prefer a verified identity so users behind one NAT/proxy don't share a bucket and service
  // fan-out isn't throttled as a single IP. Unverifiable credentials fall back to the client IP
  // (the route's own auth preHandler still rejects them).
  const keyGenerator = async (request: FastifyRequest): Promise<string> => {
    const serviceHeader = request.headers[SERVICE_TOKEN_HEADER];
    if (opts.serviceToken && typeof serviceHeader === 'string') {
      try {
        return `svc:${verifyServiceToken(serviceHeader, opts.serviceToken)}`;
      } catch (error) {
        request.log.debug({ err: error }, 'rate-limit: service token invalid, keying by IP');
      }
    }
    if (request.headers.authorization && typeof request.jwtVerify === 'function') {
      try {
        const payload = (await request.jwtVerify()) as { sub?: unknown } | undefined;
        if (typeof payload?.sub === 'string' && payload.sub) { return `sub:${payload.sub}`; }
      } catch (error) {
        request.log.debug({ err: error }, 'rate-limit: bearer token invalid, keying by IP');
      }
    }
    return `ip:${request.ip}`;
  };

  await app.register(fastifyRateLimit, {
    global: true,
    max: (_request, key) => (key.startsWith('svc:') ? serviceMax : opts.rateLimitMax),
    timeWindow: opts.rateLimitWindow,
    keyGenerator,
    skip: (request) => exempt.has(pathOf(request)),
    errorResponseBuilder: (_request, context) =>
      Object.assign(new Error(`Rate limit exceeded, retry in ${context.after}`), {
        statusCode: context.statusCode,
        code: 'RATE_LIMITED',
      }),
  });
};

export const securityPlugin = fp(securityPluginImpl, { name: 'zuma-security' });
