/**
 * New Relic APM bootstrap. MUST be the first import in src/index.ts so the agent can patch
 * http, fastify, ioredis, etc. before they are loaded. Reads process.env directly (config is
 * not loaded yet). Every helper is a no-op when the agent is disabled or failed to start.
 *
 * Auto-instrumented by the agent: Fastify, HTTP/HTTPS (axios), ioredis. Prisma is not covered by
 * the agent, so queries are reported as custom metrics (see `recordPrismaQuery`).
 */

interface NewRelicAgent {
  startSegment<T>(name: string, record: boolean, handler: () => T): T;
  recordMetric(name: string, value: number): void;
  incrementMetric(name: string, amount?: number): void;
  insertDistributedTraceHeaders(headers: Record<string, string>): void;
  getLinkingMetadata(omitSupportability?: boolean): Record<string, string>;
  noticeError(err: Error, attrs?: Record<string, string | number | boolean>): void;
  shutdown(opts: { collectPendingData?: boolean; timeout?: number }, cb: (err?: Error) => void): void;
}

function loadAgent(): NewRelicAgent | null {
  if (process.env.NEW_RELIC_ENABLED !== 'true') return null;
  if (!process.env.NEW_RELIC_LICENSE_KEY?.trim()) {
    console.error('[newrelic] NEW_RELIC_ENABLED=true but NEW_RELIC_LICENSE_KEY is not set; APM disabled');
    return null;
  }
  process.env.NEW_RELIC_APP_NAME ||= 'ozzo-service';
  process.env.NEW_RELIC_LOG_LEVEL ||= 'info';
  process.env.NEW_RELIC_LOG ||= 'stdout'; // no agent log file inside containers
  process.env.NEW_RELIC_DISTRIBUTED_TRACING_ENABLED ||= 'true';
  // Logs are shipped by our pino transport; avoid duplicate forwarding from the agent.
  process.env.NEW_RELIC_APPLICATION_LOGGING_FORWARDING_ENABLED ||= 'false';
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('newrelic') as NewRelicAgent;
  } catch (err) {
    console.error('[newrelic] failed to start agent; APM disabled:', err instanceof Error ? err.message : err);
    return null;
  }
}

const agent = loadAgent();

export const isNewRelicEnabled = agent !== null;

/** trace.id / span.id / entity.* for log correlation; empty when disabled. */
export function linkingMetadata(): Record<string, string> {
  return agent?.getLinkingMetadata() ?? {};
}

/** Adds W3C `traceparent`/`tracestate` (+ `newrelic`) headers so zuma joins the same distributed trace. */
export function injectTraceHeaders(headers: Record<string, string>): void {
  agent?.insertDistributedTraceHeaders(headers);
}

/** Wraps a call to the zuma wallet service in a named segment and records a duration metric. */
export async function trackZumaCall<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  if (!agent) return fn();
  const started = process.hrtime.bigint();
  let outcome = 'Success';
  try {
    return await agent.startSegment(`External/zuma/${operation}`, true, fn);
  } catch (err) {
    outcome = 'Error';
    throw err;
  } finally {
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;
    agent.recordMetric(`Custom/Zuma/${operation}/Duration`, seconds);
    agent.incrementMetric(`Custom/Zuma/${operation}/${outcome}`);
  }
}

export function recordPrismaQuery(durationMs: number): void {
  if (!agent) return;
  agent.recordMetric('Custom/Prisma/QueryDuration', durationMs / 1000);
  agent.incrementMetric('Custom/Prisma/QueryCount');
}

export function recordCacheLookup(hit: boolean): void {
  agent?.incrementMetric(hit ? 'Custom/Cache/Redis/Hit' : 'Custom/Cache/Redis/Miss');
}

/** Flushes pending APM data. Resolves (never rejects) within `timeoutMs`. */
export function shutdownNewRelic(timeoutMs = 5000): Promise<void> {
  const a = agent;
  if (!a) return Promise.resolve();
  return new Promise((resolve) => {
    a.shutdown({ collectPendingData: true, timeout: timeoutMs }, (err) => {
      if (err) console.error('[newrelic] shutdown error:', err.message);
      resolve();
    });
  });
}
