// Platform-agnostic telemetry seam. api-client stays free of any vendor SDK: web/spa and
// mobile-ui register an adapter (New Relic Browser / Mobile agent) at startup via setErrorReporter().
// Until then every call is a no-op.

export type TelemetryValue = string | number | boolean;
export type TelemetryAttributes = Record<string, TelemetryValue | undefined>;

export interface ErrorReporter {
  captureError(error: Error, attributes?: TelemetryAttributes): void;
  trackEvent(name: string, attributes?: TelemetryAttributes): void;
}

let reporter: ErrorReporter | null = null;

/** Pass null to detach (tests). */
export function setErrorReporter(next: ErrorReporter | null): void {
  reporter = next;
}

/** Telemetry must never break the app, so reporter failures are dropped. */
function safely(fn: (r: ErrorReporter) => void): void {
  if (!reporter) return;
  try {
    fn(reporter);
  } catch {
    // intentionally ignored: a broken telemetry backend must not surface to users
  }
}

export function reportError(error: unknown, attributes?: TelemetryAttributes): void {
  const err = error instanceof Error ? error : new Error(String(error));
  safely((r) => r.captureError(err, attributes));
}

/** Never put tokens, addresses, amounts or other user data in attributes. */
export function trackEvent(name: string, attributes?: TelemetryAttributes): void {
  safely((r) => r.trackEvent(name, attributes));
}

/** `query Wallets(...) {` -> "Wallets"; undefined for anonymous operations. */
export function operationName(document: string): string | undefined {
  return /\b(?:query|mutation|subscription)\s+([A-Za-z_]\w*)/.exec(document)?.[1];
}
