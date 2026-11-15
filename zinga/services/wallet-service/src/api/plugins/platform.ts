import type { Pool } from 'pg';
import type { FastifyInstance, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerDefault } from 'fastify';
import type { Logger } from '@zinga/shared-logging';
import { isDocsEnabled, isProduction } from '@zinga/shared-config';
import { observabilityPlugin } from '@zinga/shared-observability';
import {
  authPlugin,
  buildServerOptions,
  errorHandler,
  healthPlugin,
  securityPlugin,
  serviceAuthPlugin,
  type ReadinessCheck,
} from '@zinga/shared-http';
import type { ZingaConfig } from '../../config/zinga-config';
import { healthCheck as pgHealthCheck } from '../../infrastructure/persistence/postgres-connection';
import swaggerPlugin from './swagger';

// Fastify constructor options (body limit, timeouts, proxy trust) from config.
export const platformServerOptions = (config: ZingaConfig) =>
  buildServerOptions({
    bodyLimitBytes: config.HTTP_BODY_LIMIT_BYTES,
    connectionTimeoutMs: config.HTTP_CONNECTION_TIMEOUT_MS,
    requestTimeoutMs: config.HTTP_REQUEST_TIMEOUT_MS,
    trustProxy: config.TRUST_PROXY,
  });

// Cross-cutting plugins (metrics, security headers/CORS/rate limit, user + service auth, probes,
// docs, error handler). Must run before routes are registered so swagger sees them.
export const registerPlatformPlugins = async (
  app: FastifyInstance<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, Logger>,
  config: ZingaConfig,
  pgPool: Pool,
): Promise<void> => {
  const docsEnabled = isDocsEnabled(config);

  // Readiness check: PostgreSQL pool must be able to query.
  const pgReady: ReadinessCheck = async () => {
    const isHealthy = await pgHealthCheck(pgPool);
    if (!isHealthy) {
      throw new Error('PostgreSQL health check failed');
    }
  };

  await app.register(observabilityPlugin, {
    metricsEnabled: config.METRICS_ENABLED,
    metricsToken: config.METRICS_TOKEN,
    requireMetricsToken: isProduction(config),
  });
  await app.register(securityPlugin, {
    corsAllowedOrigins: config.CORS_ALLOWED_ORIGINS,
    corsAllowCredentials: config.CORS_ALLOW_CREDENTIALS,
    rateLimitMax: config.RATE_LIMIT_MAX,
    rateLimitWindow: config.RATE_LIMIT_WINDOW,
    rateLimitServiceMax: config.RATE_LIMIT_SERVICE_MAX,
    contentSecurityPolicy: !docsEnabled,
    serviceToken: {
      secret: config.INTERNAL_JWT_SECRET,
      issuer: config.INTERNAL_JWT_ISSUER,
      audience: config.SERVICE_NAME,
    },
  });
  await app.register(authPlugin, {
    jwtSecret: config.JWT_SECRET,
    jwtIssuer: config.JWT_ISSUER,
    jwksUri: config.JWT_JWKS_URI,
    jwtAudience: config.JWT_AUDIENCE,
    jwksAlgorithms: config.JWT_ALGORITHMS,
  });
  await app.register(serviceAuthPlugin, {
    secret: config.INTERNAL_JWT_SECRET,
    issuer: config.INTERNAL_JWT_ISSUER,
    serviceName: config.SERVICE_NAME,
  });
  await app.register(healthPlugin, { checks: [pgReady] });
  if (docsEnabled) {
    await app.register(swaggerPlugin);
  }

  app.setErrorHandler(errorHandler);
};
