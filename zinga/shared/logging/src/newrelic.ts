// Minimal New Relic stub for zinga (not used without the newrelic package).
// The full implementation is in zuma/shared/logging/src/newrelic.ts.

export interface InitNewRelicResult {
  enabled: boolean;
  reason?: 'disabled' | 'missing-license-key' | 'load-failed';
}

// No-op when the newrelic package is not installed
export const initNewRelic = (_serviceName: string): InitNewRelicResult => {
  return { enabled: false, reason: 'disabled' };
};

export const recordError = (_error: Error, _attributes?: Record<string, string | number | boolean>): void => {
  // no-op
};

export const setTransactionName = (_name: string): void => {
  // no-op
};

// Resolves immediately in the stub
export const shutdownNewRelic = (): Promise<void> => Promise.resolve();
