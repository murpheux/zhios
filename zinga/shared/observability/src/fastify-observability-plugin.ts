import { timingSafeEqual } from 'node:crypto';
import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { getMetricsRegistry, httpRequestDuration } from './metrics-endpoint';

export interface ObservabilityPluginOptions {
  metricsEnabled: boolean;
  /** When set, /metrics requires `Authorization: Bearer <metricsToken>`. */
  metricsToken?: string;
  /**
   * When true (production), /metrics is only exposed if metricsToken is set; otherwise the
   * endpoint is not registered at all (request metrics are still recorded).
   */
  requireMetricsToken?: boolean;
}

const bearerMatches = (header: string | undefined, token: string): boolean => {
  if (!header?.startsWith('Bearer ')) return false;
  const presented = Buffer.from(header.slice('Bearer '.length));
  const expected = Buffer.from(token);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
};

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
        // Unmatched routes collapse to one label value to keep cardinality bounded.
        route: request.routeOptions?.url ?? 'unmatched',
        status_code: String(reply.statusCode),
      },
      durationSeconds,
    );
  });

  const { metricsToken } = opts;
  if (!metricsToken && opts.requireMetricsToken) {
    app.log.warn('METRICS_TOKEN not set; /metrics endpoint disabled');
    return;
  }

  app.get('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    if (metricsToken && !bearerMatches(request.headers.authorization, metricsToken)) {
      reply.status(401).header('www-authenticate', 'Bearer');
      return { statusCode: 401, code: 'UNAUTHORIZED', message: 'Invalid or missing metrics token' };
    }
    const registry = getMetricsRegistry();
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });
};

export default fp(observabilityPlugin, { name: 'zinga-observability' });
