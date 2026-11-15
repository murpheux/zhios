import './apm';
import './otel';
import { createLogger, loggerOptionsFromEnv, shutdownNewRelic } from '@zinga/shared-logging';
import { shutdownOtel } from '@zinga/shared-observability';
import { registerGracefulShutdown } from '@zinga/shared-http';
import { loadZingaConfig } from './config/zinga-config';
import { createConnectionPool, releasePool } from './infrastructure/persistence/postgres-connection';
import { buildApp } from './app';

const main = async (): Promise<void> => {
  const config = loadZingaConfig();
  const logger = createLogger(loggerOptionsFromEnv(config.SERVICE_NAME, config));

  // Initialize PostgreSQL connection pool from config.DATABASE_URL.
  const pgPool = createConnectionPool(config.DATABASE_URL, logger);

  // Build the Fastify app and inject the PostgreSQL pool.
  const app = await buildApp({ config, logger, pgPool });

  registerGracefulShutdown({
    app,
    timeoutMs: config.SHUTDOWN_TIMEOUT_MS,
    onClose: [() => releasePool(pgPool), shutdownOtel, shutdownNewRelic],
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
      database: 'PostgreSQL (config.DATABASE_URL)',
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
