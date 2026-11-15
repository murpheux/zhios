import Fastify from 'fastify';
import type { Pool } from 'pg';
import type { Logger } from '@zinga/shared-logging';
import type { ZingaConfig } from './config/zinga-config';
import { platformServerOptions, registerPlatformPlugins } from './api/plugins/platform';
import { walletRoutes } from './api/routes/wallet.routes';
import { releasePool } from './infrastructure/persistence/postgres-connection';
import { PostgresWalletRepository } from './infrastructure/persistence/postgres-wallet.repository';
import { PostgresLedgerRepository } from './infrastructure/persistence/postgres-ledger.repository';
import { MockAddressGenerator } from './infrastructure/clients/mock-address-generator';
import { TransactionHistoryHttpClient } from './infrastructure/clients/transaction-history.client';
import { CreateWalletUseCase } from './application/use-cases/create-wallet.use-case';
import { GetWalletUseCase } from './application/use-cases/get-wallet.use-case';
import { ListWalletsUseCase } from './application/use-cases/list-wallets.use-case';
import { GetWalletBalanceUseCase } from './application/use-cases/get-wallet-balance.use-case';
import { GetWalletTransactionHistoryUseCase } from './application/use-cases/get-wallet-transaction-history.use-case';
import { UpdateWalletMetadataUseCase } from './application/use-cases/update-wallet-metadata.use-case';
import { internalWalletRoutes } from './api/routes/internal-wallet.routes';
import { LedgerMovementService } from './application/services/ledger-movement.service';
import { DebitWalletUseCase } from './application/use-cases/debit-wallet.use-case';
import { RefundWalletUseCase } from './application/use-cases/refund-wallet.use-case';
import { DepositToWalletUseCase } from './application/use-cases/deposit-to-wallet.use-case';
import { GetWalletForServiceUseCase } from './application/use-cases/get-wallet-for-service.use-case';

export interface BuildAppOptions {
  config: ZingaConfig;
  logger: Logger;
  pgPool: Pool;
}

// Composition root: wires PostgreSQL adapters into use-cases and registers Fastify plugins/routes.
// DATABASE_URL (PostgreSQL connection) is passed in from index.ts and released on graceful shutdown.
export const buildApp = async ({ config, logger, pgPool }: BuildAppOptions) => {
  const app = Fastify({ loggerInstance: logger, ...platformServerOptions(config) });

  // Instantiate PostgreSQL repositories with the connection pool.
  const walletRepository = new PostgresWalletRepository(pgPool);
  const ledgerRepository = new PostgresLedgerRepository(pgPool);
  const ledgerMovementService = new LedgerMovementService(walletRepository, ledgerRepository);
  const addressGenerator = new MockAddressGenerator();
  const transactionHistoryClient = new TransactionHistoryHttpClient({
    baseUrl: config.TRANSACTION_SERVICE_URL,
    timeoutMs: config.TRANSACTION_SERVICE_TIMEOUT_MS,
  });

  // Metrics, helmet/CORS/rate-limit, user + service auth (requireAuth/requireService), probes,
  // docs and the shared error handler — before routes so swagger sees them.
  await registerPlatformPlugins(app, config, pgPool);

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
    depositToWalletUseCase: new DepositToWalletUseCase(ledgerMovementService),
  });

  // Service-to-service routes (x-service-token); keep /internal/* off the public ingress.
  await app.register(internalWalletRoutes, {
    prefix: '/internal',
    debitWalletUseCase: new DebitWalletUseCase(ledgerMovementService),
    refundWalletUseCase: new RefundWalletUseCase(ledgerMovementService, ledgerRepository),
    getWalletForServiceUseCase: new GetWalletForServiceUseCase(walletRepository),
  });

  // On graceful shutdown, release the PostgreSQL connection pool.
  app.addHook('onClose', async () => {
    logger.info('Releasing PostgreSQL connection pool');
    await releasePool(pgPool);
  });

  return app;
};
