import './otel';
import { createLogger } from '@zuma/shared-logging';
import { shutdownOtel } from '@zuma/shared-observability';
import { registerGracefulShutdown } from '@zuma/shared-http';
import { loadGraphqlGatewayConfig } from './config/graphql-gateway-config';
import { buildApp } from './app';

const main = async (): Promise<void> => {
  const config = loadGraphqlGatewayConfig();
  const logger = createLogger({ serviceName: config.SERVICE_NAME, level: config.LOG_LEVEL });

  const app = await buildApp({ config, logger });

  registerGracefulShutdown({
    app,
    timeoutMs: config.SHUTDOWN_TIMEOUT_MS,
    onClose: [shutdownOtel],
  });

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
};

main().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error('graphql-gateway failed to start', error);
  await shutdownOtel().catch((otelError) => console.error('otel shutdown failed', otelError));
  process.exit(1);
});
