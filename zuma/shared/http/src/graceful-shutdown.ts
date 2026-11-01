import type { FastifyBaseLogger } from 'fastify';

// Structural so any FastifyInstance works regardless of its logger generic.
export interface ClosableApp {
  close(): PromiseLike<unknown>;
  log: Pick<FastifyBaseLogger, 'info' | 'error'>;
}

export interface GracefulShutdownOptions {
  app: ClosableApp;
  /** Hard deadline after which the process exits(1) regardless. Default 10s. */
  timeoutMs?: number;
  /** Run after app.close(), in order (e.g. disconnectMongo, shutdownOtel); each runs even if an earlier one fails. */
  onClose?: Array<() => Promise<void>>;
  signals?: NodeJS.Signals[];
}

// SIGTERM/SIGINT → app.close() → cleanup hooks → exit(0), or exit(1) on error/timeout. Never hangs.
export const registerGracefulShutdown = ({
  app,
  timeoutMs = 10_000,
  onClose = [],
  signals = ['SIGTERM', 'SIGINT'],
}: GracefulShutdownOptions): void => {
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutting down');

    const timer = setTimeout(() => {
      app.log.error({ timeoutMs }, 'graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, timeoutMs);
    timer.unref();

    let exitCode = 0;
    try {
      await app.close();
    } catch (error) {
      exitCode = 1;
      app.log.error({ err: error }, 'error closing HTTP server');
    }
    for (const hook of onClose) {
      try {
        await hook();
      } catch (error) {
        exitCode = 1;
        app.log.error({ err: error }, 'error during shutdown hook');
      }
    }
    clearTimeout(timer);
    process.exit(exitCode);
  };

  for (const signal of signals) {
    process.once(signal, () => void shutdown(signal));
  }
};
