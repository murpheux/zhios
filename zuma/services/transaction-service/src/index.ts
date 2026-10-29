import { createLogger } from '@zuma/shared-logging';
import { loadTransactionServiceConfig } from './config/transaction-service-config';
import { connectMongo, disconnectMongo } from './infrastructure/mongo/mongo-connection';
import { buildApp } from './app';

const main = async (): Promise<void> => {
  const config = loadTransactionServiceConfig();
  const logger = createLogger({ serviceName: 'transaction-service', level: config.LOG_LEVEL });

  await connectMongo(config.MONGODB_URI, logger);
  const app = await buildApp({ config, logger });

  await app.listen({ port: config.PORT, host: '0.0.0.0' });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down transaction-service');
    await app.close();
    await disconnectMongo();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
};

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('transaction-service failed to start', error);
  process.exit(1);
});
