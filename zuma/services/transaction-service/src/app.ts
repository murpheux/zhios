import fastify from 'fastify';
import type { Logger } from '@zuma/shared-logging';
import { observabilityPlugin } from '@zuma/shared-observability';
import { mapErrorToHttp } from '@zuma/shared-common';
import type { TransactionServiceConfig } from './config/transaction-service-config';
import authPlugin from './api/plugins/auth';
import healthPlugin from './api/plugins/health';
import swaggerPlugin from './api/plugins/swagger';
import { transactionRoutes } from './api/routes/transaction.routes';
import { MongooseTransactionRepository } from './infrastructure/persistence/transaction.repository';
import { MongooseAuditLogRepository } from './infrastructure/persistence/audit-log.repository';
import { MockBitcoinNodeClient } from './infrastructure/clients/mock-bitcoin-node.client';
import { WalletOwnershipHttpClient } from './infrastructure/clients/wallet-ownership.client';
import { CreateTransactionUseCase } from './application/use-cases/create-transaction.use-case';
import { ValidateTransactionUseCase } from './application/use-cases/validate-transaction.use-case';
import { BroadcastTransactionUseCase } from './application/use-cases/broadcast-transaction.use-case';
import { GetTransactionUseCase } from './application/use-cases/get-transaction.use-case';
import { ListTransactionsUseCase } from './application/use-cases/list-transactions.use-case';
import { GetTransactionStatusUseCase } from './application/use-cases/get-transaction-status.use-case';

export interface BuildAppOptions {
  config: TransactionServiceConfig;
  logger: Logger;
}

// Composition root: wires infrastructure adapters into use-cases and registers Fastify plugins/routes.
export const buildApp = async ({ config, logger }: BuildAppOptions) => {
  const app = fastify({ loggerInstance: logger });

  const transactionRepository = new MongooseTransactionRepository();
  const auditLogRepository = new MongooseAuditLogRepository();
  const bitcoinNodeClient = new MockBitcoinNodeClient();
  const walletOwnershipClient = new WalletOwnershipHttpClient({ baseUrl: config.WALLET_SERVICE_URL });

  await app.register(observabilityPlugin, { metricsEnabled: config.METRICS_ENABLED });
  await app.register(authPlugin, {
    jwtSecret: config.JWT_SECRET,
    jwtIssuer: config.JWT_ISSUER,
    jwksUri: config.JWT_JWKS_URI,
    jwtAudience: config.JWT_AUDIENCE,
  });
  await app.register(healthPlugin);
  await app.register(swaggerPlugin);

  await app.register(transactionRoutes, {
    prefix: '/api/v1',
    createTransactionUseCase: new CreateTransactionUseCase(
      transactionRepository,
      bitcoinNodeClient,
      auditLogRepository,
      walletOwnershipClient,
    ),
    validateTransactionUseCase: new ValidateTransactionUseCase(transactionRepository),
    broadcastTransactionUseCase: new BroadcastTransactionUseCase(
      transactionRepository,
      bitcoinNodeClient,
      auditLogRepository,
    ),
    getTransactionUseCase: new GetTransactionUseCase(transactionRepository),
    listTransactionsUseCase: new ListTransactionsUseCase(transactionRepository),
    getTransactionStatusUseCase: new GetTransactionStatusUseCase(transactionRepository, bitcoinNodeClient),
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof Error && 'validation' in error && error.validation) {
      reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: error.message });
      return;
    }
    const body = mapErrorToHttp(error);
    if (body.statusCode >= 500) {
      request.log.error({ err: error }, 'unhandled error');
    }
    reply.status(body.statusCode).send(body);
  });

  return app;
};
