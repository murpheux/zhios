import { type ErrorReporter, setErrorReporter, type TelemetryAttributes } from "@gnee/api-client";

/**
 * New Relic Mobile agent bridge (newrelic-react-native-agent: native iOS/Android SDKs + JS bridge).
 * The package is a native module owned by apps/ios and apps/android, so it is loaded lazily here:
 * in Jest, Expo Go or any build without the native module this degrades to a no-op instead of crashing.
 * The native agent captures crashes, JS exceptions, unhandled promise rejections and HTTP timings itself.
 */

export interface NewRelicConfig {
  enabled: boolean;
  /** Mobile application token (NOT the browser license key). */
  appToken?: string;
  environment?: string;
  version?: string;
}

/** The subset of the agent API used here. */
interface NewRelicAgent {
  startAgent(appToken: string, config?: Record<string, unknown>): void;
  recordError(error: Error, attributes?: Record<string, unknown>): void;
  recordCustomEvent(eventType: string, eventName: string, attributes?: Record<string, unknown>): void;
  setUserId(userId: string): void;
  setAttribute(name: string, value: string): void;
  setJSAppVersion(version: string): void;
}

let agent: NewRelicAgent | null = null;
let started = false;

function loadAgent(): NewRelicAgent | null {
  try {
    const mod = require("newrelic-react-native-agent");
    return (mod?.default ?? mod) as NewRelicAgent;
  } catch {
    return null;
  }
}

/** Idempotent. Returns true when the native agent is running. */
export function initNewRelic(config: NewRelicConfig): boolean {
  if (started) return agent !== null;
  if (!config.enabled) return false;
  if (!config.appToken) {
    console.warn("[newrelic] enabled but EXPO_PUBLIC_NEWRELIC_APP_TOKEN is not set; skipping");
    return false;
  }
  started = true;

  const loaded = loadAgent();
  if (!loaded) {
    console.warn("[newrelic] native agent not available in this build (Expo Go / missing module); skipping");
    return false;
  }

  try {
    loaded.startAgent(config.appToken, {
      crashReportingEnabled: true,
      interactionTracingEnabled: true,
      networkRequestEnabled: true,
      networkErrorRequestEnabled: true,
      httpResponseBodyCaptureEnabled: false,
      loggingEnabled: false,
      distributedTracingEnabled: true,
    });
    if (config.version) loaded.setJSAppVersion(config.version);
    loaded.setAttribute("environment", config.environment ?? "production");
  } catch (err) {
    console.warn("[newrelic] failed to start mobile agent", err);
    return false;
  }

  agent = loaded;
  setErrorReporter(mobileReporter);
  return true;
}

function clean(attributes?: TelemetryAttributes): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(attributes ?? {})) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function recordError(error: unknown, attributes?: TelemetryAttributes): void {
  agent?.recordError(error instanceof Error ? error : new Error(String(error)), clean(attributes));
}

export function recordEvent(name: string, attributes?: TelemetryAttributes): void {
  agent?.recordCustomEvent("ZumaMobileAction", name, clean(attributes));
}

/** Opaque user id only (never email/name). */
export function setNewRelicUser(userId: string): void {
  agent?.setUserId(userId);
}

const mobileReporter: ErrorReporter = {
  captureError: (error, attributes) => recordError(error, attributes),
  trackEvent: (name, attributes) => recordEvent(name, attributes),
};

/** Test helper. */
export function resetNewRelicForTests(): void {
  agent = null;
  started = false;
  setErrorReporter(null);
}
