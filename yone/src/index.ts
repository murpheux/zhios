import pino from 'pino';
import { loadYoneConfig } from './config/yone-config';
import { buildApp } from './app';

const main = async (): Promise<void> => {
  const config = loadYoneConfig();
  const logger = pino({
    name: config.SERVICE_NAME,
    level: config.LOG_LEVEL,
    redact: ['req.headers.authorization', 'req.headers["x-service-token"]'],
  });
  const app = await buildApp({ config, logger });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    setTimeout(() => process.exit(1), config.SHUTDOWN_TIMEOUT_MS).unref();
    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'error closing HTTP server');
      process.exit(1);
    }
  };
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => void shutdown(signal));

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
};

main().catch((error) => {
  console.error('yone failed to start', error);
  process.exit(1);
});
