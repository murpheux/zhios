import { createLogger } from '@zuma/shared-logging';
import { loadGraphqlGatewayConfig } from './config/graphql-gateway-config';
import { buildApp } from './app';

const main = async (): Promise<void> => {
  const config = loadGraphqlGatewayConfig();
  const logger = createLogger({ serviceName: 'graphql-gateway', level: config.LOG_LEVEL });

  const app = await buildApp({ config, logger });

  await app.listen({ port: config.PORT, host: '0.0.0.0' });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down graphql-gateway');
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
};

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('graphql-gateway failed to start', error);
  process.exit(1);
});
