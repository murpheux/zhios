import mongoose from 'mongoose';
import type { FastifyInstance, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerDefault } from 'fastify';
import type { Logger } from '@zuma/shared-logging';
import { isDocsEnabled, isProduction } from '@zuma/shared-config';
import { observabilityPlugin } from '@zuma/shared-observability';
import {
  authPlugin,
  buildServerOptions,
  errorHandler,
  healthPlugin,
  securityPlugin,
  serviceAuthPlugin,
  type ReadinessCheck,
} from '@zuma/shared-http';
import type { WalletServiceConfig } from '../../config/wallet-service-config';
import swaggerPlugin from './swagger';

// Fastify constructor options (body limit, timeouts, proxy trust) from config.
export const platformServerOptions = (config: WalletServiceConfig) =>
  buildServerOptions({
    bodyLimitBytes: config.HTTP_BODY_LIMIT_BYTES,
    connectionTimeoutMs: config.HTTP_CONNECTION_TIMEOUT_MS,
    requestTimeoutMs: config.HTTP_REQUEST_TIMEOUT_MS,
    trustProxy: config.TRUST_PROXY,
  });

// Readiness: Mongo must be connected and answer a ping.
const mongoReady: ReadinessCheck = async () => {
  const { connection } = mongoose;
  if (connection.readyState !== mongoose.ConnectionStates.connected || !connection.db) {
    throw new Error(`mongo not connected (readyState=${connection.readyState})`);
  }
  await connection.db.admin().ping();
};

// Cross-cutting plugins (metrics, security headers/CORS/rate limit, user + service auth, probes,
// docs, error handler). Must run before routes are registered so swagger sees them.
export const registerPlatformPlugins = async (
  app: FastifyInstance<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, Logger>,
  config: WalletServiceConfig,
): Promise<void> => {
  const docsEnabled = isDocsEnabled(config);

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
  await app.register(healthPlugin, { checks: [mongoReady] });
  if (docsEnabled) {
    await app.register(swaggerPlugin);
  }

  app.setErrorHandler(errorHandler);
};
