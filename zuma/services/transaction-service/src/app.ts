import fastify from 'fastify';
import type { Logger } from '@zuma/shared-logging';
import type { TransactionServiceConfig } from './config/transaction-service-config';
import { platformServerOptions, registerPlatformPlugins } from './api/plugins/platform';
import { transactionRoutes } from './api/routes/transaction.routes';
import { MongooseTransactionRepository } from './infrastructure/persistence/transaction.repository';
import { MongooseAuditLogRepository } from './infrastructure/persistence/audit-log.repository';
import { MockBitcoinNodeClient } from './infrastructure/clients/mock-bitcoin-node.client';
import { createServiceTokenSigner } from '@zuma/shared-http';
import { WalletServiceHttpClient } from './infrastructure/clients/wallet-service.client';
import { MongooseSystemEventRepository } from './infrastructure/persistence/system-event.repository';
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
  const app = fastify({ loggerInstance: logger, ...platformServerOptions(config) });

  const transactionRepository = new MongooseTransactionRepository();
  const auditLogRepository = new MongooseAuditLogRepository();
  const bitcoinNodeClient = new MockBitcoinNodeClient();
  const systemEventRepository = new MongooseSystemEventRepository();
  const walletServiceClient = new WalletServiceHttpClient({
    baseUrl: config.WALLET_SERVICE_URL,
    tokenSigner: createServiceTokenSigner({
      secret: config.INTERNAL_JWT_SECRET,
      issuer: config.INTERNAL_JWT_ISSUER,
      serviceName: config.SERVICE_NAME,
    }),
    audience: 'wallet-service',
  });

  // Metrics, helmet/CORS/rate-limit, user + service auth (requireAuth/requireService), probes,
  // docs and the shared error handler — before routes so swagger sees them.
  await registerPlatformPlugins(app, config);

  await app.register(transactionRoutes, {
    prefix: '/api/v1',
    createTransactionUseCase: new CreateTransactionUseCase(
      transactionRepository,
      bitcoinNodeClient,
      auditLogRepository,
      walletServiceClient,
      config.BITCOIN_NETWORK,
    ),
    validateTransactionUseCase: new ValidateTransactionUseCase(transactionRepository),
    broadcastTransactionUseCase: new BroadcastTransactionUseCase(
      transactionRepository,
      bitcoinNodeClient,
      auditLogRepository,
      walletServiceClient,
      systemEventRepository,
    ),
    getTransactionUseCase: new GetTransactionUseCase(transactionRepository),
    listTransactionsUseCase: new ListTransactionsUseCase(transactionRepository),
    getTransactionStatusUseCase: new GetTransactionStatusUseCase(transactionRepository, bitcoinNodeClient),
  });

  return app;
};
