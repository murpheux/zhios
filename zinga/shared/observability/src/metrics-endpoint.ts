import client from 'prom-client';

let registry: client.Registry | undefined;

// Lazily creates (or returns) the process-wide Prometheus registry with default metrics.
export const getMetricsRegistry = (): client.Registry => {
  if (!registry) {
    registry = new client.Registry();
    client.collectDefaultMetrics({ register: registry });
  }
  return registry;
};

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  registers: [getMetricsRegistry()],
});
