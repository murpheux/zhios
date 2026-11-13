// New Relic must be the first import so the agent can instrument http, fastify and ioredis.
import { shutdownNewRelic } from './infrastructure/newrelic';
import { buildApp } from './app';
import { loadConfig } from './config';
import { createLogger, flushLogs } from './config/logger';

function serviceVersion(): string {
  try {
    return (require('../package.json') as { version?: string }).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const app = await buildApp(config, logger);

  let stopping = false;
  const stop = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, 'shutting down');
    let code = 0;
    try {
      await app.close();
    } catch (err) {
      logger.error({ err }, 'error during shutdown');
      code = 1;
    }
    await flushLogs();
    await shutdownNewRelic();
    process.exit(code);
  };
  process.once('SIGTERM', () => void stop('SIGTERM'));
  process.once('SIGINT', () => void stop('SIGINT'));

  await app.listen({ port: config.port, host: config.host });
  logger.info(
    {
      version: serviceVersion(),
      port: config.port,
      logLevel: config.logLevel,
      logToFile: config.logging.toFile,
      newRelicApm: config.newRelic.enabled,
      newRelicLogs: config.logging.newRelicLogs.enabled,
    },
    'ozzo started',
  );
}

main().catch(async (err) => {
  // Logger may not exist if config validation failed.
  console.error(err instanceof Error ? err.message : err);
  await flushLogs();
  process.exit(1);
});
