import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getMetricsRegistry, httpRequestDuration } from './metrics-endpoint';

export interface ObservabilityPluginOptions {
  metricsEnabled: boolean;
}

// Registers request-duration metrics and a /metrics Prometheus scrape endpoint.
const observabilityPlugin: FastifyPluginAsync<ObservabilityPluginOptions> = async (
  app: FastifyInstance,
  opts: ObservabilityPluginOptions,
) => {
  if (!opts.metricsEnabled) {
    return;
  }

  app.addHook('onRequest', async (request) => {
    (request as { startTime?: number }).startTime = Date.now();
  });

  app.addHook('onResponse', async (request, reply) => {
    const start = (request as { startTime?: number }).startTime ?? Date.now();
    const durationSeconds = (Date.now() - start) / 1000;
    httpRequestDuration.observe(
      {
        method: request.method,
        route: request.routeOptions?.url ?? request.url,
        status_code: String(reply.statusCode),
      },
      durationSeconds,
    );
  });

  app.get('/metrics', async (_request, reply) => {
    const registry = getMetricsRegistry();
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });
};

export default fp(observabilityPlugin, { name: 'zuma-observability' });
