import './otel';
import { createLogger } from '@zuma/shared-logging';
import { shutdownOtel } from '@zuma/shared-observability';
import { registerGracefulShutdown } from '@zuma/shared-http';
import { loadWalletServiceConfig } from './config/wallet-service-config';
import { connectMongo, disconnectMongo } from './infrastructure/mongo/mongo-connection';
import { buildApp } from './app';

const main = async (): Promise<void> => {
  const config = loadWalletServiceConfig();
  const logger = createLogger({ serviceName: config.SERVICE_NAME, level: config.LOG_LEVEL });

  // Fail fast (and let the orchestrator restart us) instead of buffering ops for Mongoose's 30s default.
  await connectMongo(config.MONGODB_URI, logger, { serverSelectionTimeoutMS: 5000 });
  const app = await buildApp({ config, logger });

  registerGracefulShutdown({
    app,
    timeoutMs: config.SHUTDOWN_TIMEOUT_MS,
    onClose: [disconnectMongo, shutdownOtel],
  });

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
};

main().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error('wallet-service failed to start', error);
  await shutdownOtel().catch((otelError) => console.error('otel shutdown failed', otelError));
  process.exit(1);
});
