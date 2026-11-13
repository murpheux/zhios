// New Relic MUST load before any other module so the agent can instrument http/undici and fastify.
import { isNewRelicEnabled, shutdownNewRelic } from './infrastructure/newrelic';
import { createLogger, flushLogs } from './config/logger';
import { loadYoneConfig } from './config/yone-config';
import { buildApp } from './app';

const main = async (): Promise<void> => {
  const config = loadYoneConfig();
  const logger = createLogger(config);
  const app = await buildApp({ config, logger });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    setTimeout(() => process.exit(1), config.SHUTDOWN_TIMEOUT_MS).unref();
    let code = 0;
    try {
      await app.close();
    } catch (error) {
      logger.error({ err: error }, 'error closing HTTP server');
      code = 1;
    }
    await shutdownNewRelic();
    await flushLogs();
    process.exit(code);
  };
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => void shutdown(signal));

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  logger.info(
    {
      port: config.PORT,
      logLevel: config.LOG_LEVEL,
      logToFile: config.LOG_TO_FILE,
      newRelicApm: isNewRelicEnabled,
      newRelicLogs: config.NEWRELIC_LOGS_ENABLED,
    },
    `${config.SERVICE_NAME} started`,
  );
};

main().catch((error) => {
  console.error('yone failed to start', error);
  process.exit(1);
});
