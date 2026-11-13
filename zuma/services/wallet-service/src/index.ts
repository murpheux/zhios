import './apm';
import './otel';
import { createLogger, loggerOptionsFromEnv, shutdownNewRelic } from '@zuma/shared-logging';
import { shutdownOtel } from '@zuma/shared-observability';
import { registerGracefulShutdown } from '@zuma/shared-http';
import { loadWalletServiceConfig } from './config/wallet-service-config';
import { connectMongo, disconnectMongo } from './infrastructure/mongo/mongo-connection';
import { buildApp } from './app';

const main = async (): Promise<void> => {
  const config = loadWalletServiceConfig();
  const logger = createLogger(loggerOptionsFromEnv(config.SERVICE_NAME, config));

  // Fail fast (and let the orchestrator restart us) instead of buffering ops for Mongoose's 30s default.
  await connectMongo(config.MONGODB_URI, logger, { serverSelectionTimeoutMS: 5000 });
  const app = await buildApp({ config, logger });

  registerGracefulShutdown({
    app,
    timeoutMs: config.SHUTDOWN_TIMEOUT_MS,
    onClose: [disconnectMongo, shutdownOtel, shutdownNewRelic],
  });

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  logger.info(
    {
      service: config.SERVICE_NAME,
      version: process.env.npm_package_version ?? 'unknown',
      port: config.PORT,
      env: config.NODE_ENV,
      newRelic: config.NEW_RELIC_ENABLED && Boolean(config.NEW_RELIC_LICENSE_KEY),
      logToFile: config.LOG_TO_FILE,
    },
    'service started',
  );
};

main().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error('wallet-service failed to start', error);
  await shutdownOtel().catch((otelError) => console.error('otel shutdown failed', otelError));
  process.exit(1);
});
