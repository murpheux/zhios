import fastify, { type FastifyRequest } from 'fastify';
import mercurius from 'mercurius';
import { NoSchemaIntrospectionCustomRule } from 'graphql';
import type { Logger } from '@zuma/shared-logging';
import { isProduction } from '@zuma/shared-config';
import { observabilityPlugin } from '@zuma/shared-observability';
import { buildServerOptions, errorHandler, healthPlugin, securityPlugin } from '@zuma/shared-http';
import type { GraphqlGatewayConfig } from './config/graphql-gateway-config';
import { WalletServiceClient } from './clients/wallet-service.client';
import { TransactionServiceClient } from './clients/transaction-service.client';
import { typeDefs } from './schema/typedefs';
import { resolvers } from './resolvers';
import type { GatewayContext } from './context';

export interface BuildAppOptions {
  config: GraphqlGatewayConfig;
  logger: Logger;
}

const UPSTREAM_HEALTH_TIMEOUT_MS = 2000;

// Composition root: wires upstream REST clients into the mercurius GraphQL schema.
export const buildApp = async ({ config, logger }: BuildAppOptions) => {
  const production = isProduction(config);
  const app = fastify({
    loggerInstance: logger,
    ...buildServerOptions({
      bodyLimitBytes: config.HTTP_BODY_LIMIT_BYTES,
      connectionTimeoutMs: config.HTTP_CONNECTION_TIMEOUT_MS,
      requestTimeoutMs: config.HTTP_REQUEST_TIMEOUT_MS,
      trustProxy: config.TRUST_PROXY,
    }),
  });

  const walletServiceClient = new WalletServiceClient({
    baseUrl: config.WALLET_SERVICE_URL,
    timeoutMs: config.UPSTREAM_TIMEOUT_MS,
  });
  const transactionServiceClient = new TransactionServiceClient({
    baseUrl: config.TRANSACTION_SERVICE_URL,
    timeoutMs: config.UPSTREAM_TIMEOUT_MS,
  });

  await app.register(observabilityPlugin, {
    metricsEnabled: config.METRICS_ENABLED,
    metricsToken: config.METRICS_TOKEN,
    requireMetricsToken: production,
  });
  // CORS here is what lets the browser SPA (another origin) call /graphql.
  await app.register(securityPlugin, {
    corsAllowedOrigins: config.CORS_ALLOWED_ORIGINS,
    corsAllowCredentials: config.CORS_ALLOW_CREDENTIALS,
    rateLimitMax: config.RATE_LIMIT_MAX,
    rateLimitWindow: config.RATE_LIMIT_WINDOW,
    // GraphiQL needs inline scripts; it is only served outside production.
    contentSecurityPolicy: production,
  });
  await app.register(healthPlugin, {
    checks: [
      () => walletServiceClient.healthCheck(UPSTREAM_HEALTH_TIMEOUT_MS),
      () => transactionServiceClient.healthCheck(UPSTREAM_HEALTH_TIMEOUT_MS),
    ],
    checkTimeoutMs: UPSTREAM_HEALTH_TIMEOUT_MS + 500,
  });

  const introspectionEnabled = config.GRAPHQL_INTROSPECTION_ENABLED ?? !production;

  await app.register(mercurius, {
    schema: typeDefs,
    resolvers,
    path: '/graphql',
    graphiql: !production,
    queryDepth: config.GRAPHQL_QUERY_DEPTH,
    validationRules: introspectionEnabled ? [] : [NoSchemaIntrospectionCustomRule],
    context: async (request: FastifyRequest): Promise<GatewayContext> => ({
      walletServiceClient,
      transactionServiceClient,
      authorization: request.headers.authorization,
    }),
  });

  app.setErrorHandler(errorHandler);

  return app;
};
