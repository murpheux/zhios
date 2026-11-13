/**
 * New Relic APM bootstrap. MUST be the first import in src/index.ts so the agent can patch
 * http/undici and fastify before they load. Reads process.env directly (config is not loaded yet).
 * Every helper is a no-op when the agent is disabled or failed to start.
 *
 * Provider calls (SendGrid, Twilio, Slack, Teams) use global fetch (undici), which the agent
 * instruments as external calls; `trackUpstreamCall` adds a named segment and custom metrics per provider.
 */

interface NewRelicAgent {
  startSegment<T>(name: string, record: boolean, handler: () => T): T;
  recordMetric(name: string, value: number): void;
  incrementMetric(name: string, amount?: number): void;
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
  process.env.NEW_RELIC_APP_NAME ||= 'yone-service';
  process.env.NEW_RELIC_LOG_LEVEL ||= 'info';
  process.env.NEW_RELIC_LOG ||= 'stdout'; // no agent log file inside containers
  process.env.NEW_RELIC_DISTRIBUTED_TRACING_ENABLED ||= 'true';
  // Logs are shipped by our pino stream; avoid duplicate forwarding from the agent.
  process.env.NEW_RELIC_APPLICATION_LOGGING_FORWARDING_ENABLED ||= 'false';
  // Keep recipients/payloads out of APM attributes.
  process.env.NEW_RELIC_ATTRIBUTES_EXCLUDE ||= 'request.headers.*,response.headers.*';
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

/** Wraps a provider call in a named segment and records duration and outcome metrics. */
export async function trackUpstreamCall<T>(upstream: string, fn: () => Promise<T>): Promise<T> {
  if (!agent) return fn();
  const started = process.hrtime.bigint();
  let outcome = 'Success';
  try {
    return await agent.startSegment(`External/${upstream}/send`, true, fn);
  } catch (err) {
    outcome = 'Error';
    if (err instanceof Error) agent.noticeError(err, { upstream });
    throw err;
  } finally {
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;
    agent.recordMetric(`Custom/Upstream/${upstream}/Duration`, seconds);
    agent.incrementMetric(`Custom/Upstream/${upstream}/${outcome}`);
  }
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
