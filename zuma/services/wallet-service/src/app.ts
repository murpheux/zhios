import fastify from 'fastify';
import type { Logger } from '@zuma/shared-logging';
import { observabilityPlugin } from '@zuma/shared-observability';
import { mapErrorToHttp } from '@zuma/shared-common';
import type { WalletServiceConfig } from './config/wallet-service-config';
import authPlugin from './api/plugins/auth';
import healthPlugin from './api/plugins/health';
import swaggerPlugin from './api/plugins/swagger';
import { walletRoutes } from './api/routes/wallet.routes';
import { MongooseWalletRepository } from './infrastructure/persistence/wallet.repository';
import { MockAddressGenerator } from './infrastructure/clients/mock-address-generator';
import { TransactionHistoryHttpClient } from './infrastructure/clients/transaction-history.client';
import { CreateWalletUseCase } from './application/use-cases/create-wallet.use-case';
import { GetWalletUseCase } from './application/use-cases/get-wallet.use-case';
import { ListWalletsUseCase } from './application/use-cases/list-wallets.use-case';
import { GetWalletBalanceUseCase } from './application/use-cases/get-wallet-balance.use-case';
import { GetWalletTransactionHistoryUseCase } from './application/use-cases/get-wallet-transaction-history.use-case';
import { UpdateWalletMetadataUseCase } from './application/use-cases/update-wallet-metadata.use-case';

export interface BuildAppOptions {
  config: WalletServiceConfig;
  logger: Logger;
}

// Composition root: wires infrastructure adapters into use-cases and registers Fastify plugins/routes.
export const buildApp = async ({ config, logger }: BuildAppOptions) => {
  const app = fastify({ loggerInstance: logger });

  const walletRepository = new MongooseWalletRepository();
  const addressGenerator = new MockAddressGenerator();
  const transactionHistoryClient = new TransactionHistoryHttpClient({
    baseUrl: config.TRANSACTION_SERVICE_URL,
  });

  await app.register(observabilityPlugin, { metricsEnabled: config.METRICS_ENABLED });
  await app.register(authPlugin, {
    jwtSecret: config.JWT_SECRET,
    jwtIssuer: config.JWT_ISSUER,
    jwksUri: config.JWT_JWKS_URI,
    jwtAudience: config.JWT_AUDIENCE,
  });
  await app.register(healthPlugin);
  await app.register(swaggerPlugin);

  await app.register(walletRoutes, {
    prefix: '/api/v1',
    createWalletUseCase: new CreateWalletUseCase(walletRepository, addressGenerator),
    getWalletUseCase: new GetWalletUseCase(walletRepository),
    listWalletsUseCase: new ListWalletsUseCase(walletRepository),
    getWalletBalanceUseCase: new GetWalletBalanceUseCase(walletRepository),
    getWalletTransactionHistoryUseCase: new GetWalletTransactionHistoryUseCase(
      walletRepository,
      transactionHistoryClient,
    ),
    updateWalletMetadataUseCase: new UpdateWalletMetadataUseCase(walletRepository),
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
