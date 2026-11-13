export interface NewRelicAgent {
  noticeError(error: Error, customAttributes?: Record<string, string | number | boolean>): void;
  setTransactionName(name: string): void;
  shutdown(options: { collectPendingData?: boolean }, callback: (error?: Error) => void): void;
}

export type NewRelicLoader = () => NewRelicAgent;

export interface InitNewRelicResult {
  enabled: boolean;
  reason?: 'disabled' | 'missing-license-key' | 'load-failed';
}

let agent: NewRelicAgent | undefined;

// Must run before anything else is imported so the agent can patch http/fastify/mongodb/pino.
// The agent reads NEW_RELIC_* straight from the environment; this fills in the zuma defaults.
export const initNewRelic = (
  serviceName: string,
  env: NodeJS.ProcessEnv = process.env,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  load: NewRelicLoader = () => require('newrelic') as NewRelicAgent,
): InitNewRelicResult => {
  if (env.NEW_RELIC_ENABLED !== 'true') return { enabled: false, reason: 'disabled' };
  if (!env.NEW_RELIC_LICENSE_KEY) {
    console.warn(`[newrelic] NEW_RELIC_ENABLED=true but NEW_RELIC_LICENSE_KEY is unset; APM disabled for ${serviceName}`);
    return { enabled: false, reason: 'missing-license-key' };
  }
  env.NEW_RELIC_APP_NAME ||= serviceName;
  env.NEW_RELIC_LOG_LEVEL ||= 'info';
  // Keep config in env vars; never require a newrelic.js file on disk.
  env.NEW_RELIC_NO_CONFIG_FILE ||= 'true';
  // Log to stdout so container runtimes collect agent logs instead of a newrelic_agent.log file.
  env.NEW_RELIC_LOG ||= 'stdout';
  const logsEnabled = env.NEWRELIC_LOGS_ENABLED === 'true' ? 'true' : 'false';
  env.NEW_RELIC_APPLICATION_LOGGING_ENABLED ||= logsEnabled;
  env.NEW_RELIC_APPLICATION_LOGGING_FORWARDING_ENABLED ||= logsEnabled;
  env.NEW_RELIC_APPLICATION_LOGGING_LOCAL_DECORATING_ENABLED ||= logsEnabled;
  try {
    agent = load();
    return { enabled: true };
  } catch (error) {
    console.error(`[newrelic] agent failed to load for ${serviceName}; continuing without APM`, error);
    return { enabled: false, reason: 'load-failed' };
  }
};

export const recordError = (error: Error, attributes?: Record<string, string | number | boolean>): void => {
  agent?.noticeError(error, attributes);
};

export const setTransactionName = (name: string): void => {
  agent?.setTransactionName(name);
};

// Flushes pending data; resolves immediately when the agent is not running.
export const shutdownNewRelic = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if (!agent) return resolve();
    const current = agent;
    agent = undefined;
    current.shutdown({ collectPendingData: true }, (error) => (error ? reject(error) : resolve()));
  });
