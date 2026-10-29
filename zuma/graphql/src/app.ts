import fastify, { type FastifyRequest } from 'fastify';
import mercurius from 'mercurius';
import type { Logger } from '@zuma/shared-logging';
import { observabilityPlugin } from '@zuma/shared-observability';
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

// Composition root: wires upstream REST clients into the mercurius GraphQL schema.
export const buildApp = async ({ config, logger }: BuildAppOptions) => {
  const app = fastify({ loggerInstance: logger });

  const walletServiceClient = new WalletServiceClient({ baseUrl: config.WALLET_SERVICE_URL });
  const transactionServiceClient = new TransactionServiceClient({
    baseUrl: config.TRANSACTION_SERVICE_URL,
  });

  await app.register(observabilityPlugin, { metricsEnabled: config.METRICS_ENABLED });

  app.get('/healthz', async () => ({ status: 'ok' }));

  await app.register(mercurius, {
    schema: typeDefs,
    resolvers,
    path: '/graphql',
    graphiql: config.NODE_ENV !== 'production',
    context: async (request: FastifyRequest): Promise<GatewayContext> => ({
      walletServiceClient,
      transactionServiceClient,
      authorization: request.headers.authorization,
    }),
  });

  return app;
};
