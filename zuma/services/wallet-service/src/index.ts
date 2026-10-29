import { createLogger } from '@zuma/shared-logging';
import { loadWalletServiceConfig } from './config/wallet-service-config';
import { connectMongo, disconnectMongo } from './infrastructure/mongo/mongo-connection';
import { buildApp } from './app';

const main = async (): Promise<void> => {
  const config = loadWalletServiceConfig();
  const logger = createLogger({ serviceName: 'wallet-service', level: config.LOG_LEVEL });

  await connectMongo(config.MONGODB_URI, logger);
  const app = await buildApp({ config, logger });

  await app.listen({ port: config.PORT, host: '0.0.0.0' });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down wallet-service');
    await app.close();
    await disconnectMongo();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
};

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('wallet-service failed to start', error);
  process.exit(1);
});
