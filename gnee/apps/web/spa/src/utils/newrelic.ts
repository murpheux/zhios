import { type ErrorReporter, setErrorReporter, type TelemetryAttributes } from "@gnee/api-client";
import { BrowserAgent } from "@newrelic/browser-agent/loaders/browser-agent";

/**
 * New Relic Browser agent (npm loader, so no inline script and the CSP stays `script-src 'self'`;
 * only `connect-src` needs the beacon origin). The agent itself captures uncaught exceptions,
 * unhandled promise rejections, XHR/fetch timings and page views (SPA route changes included).
 * Everything here is a no-op unless VITE_NEWRELIC_ENABLED=true and the ids are present.
 */

let agent: BrowserAgent | null = null;

const BEACON = "bam.nr-data.net";

export function initNewRelic(env: ImportMetaEnv = import.meta.env): boolean {
  if (agent) return true;
  if (env.VITE_NEWRELIC_ENABLED !== "true") return false;

  const licenseKey = env.VITE_NEWRELIC_LICENSE_KEY;
  const applicationID = env.VITE_NEWRELIC_APP_ID;
  const accountID = env.VITE_NEWRELIC_ACCOUNT_ID;
  const agentID = env.VITE_NEWRELIC_AGENT_ID ?? applicationID;
  if (!licenseKey || !applicationID || !accountID) {
    console.warn("[newrelic] enabled but VITE_NEWRELIC_{LICENSE_KEY,APP_ID,ACCOUNT_ID} are not all set; skipping");
    return false;
  }

  try {
    agent = new BrowserAgent({
      init: {
        distributed_tracing: { enabled: true },
        privacy: { cookies_enabled: true },
        // Don't trace the agent's own beacon traffic.
        ajax: { deny_list: [BEACON] },
      },
      info: { beacon: BEACON, errorBeacon: BEACON, licenseKey, applicationID, sa: 1 },
      loader_config: { accountID, trustKey: accountID, agentID, licenseKey, applicationID },
    });
    agent.setApplicationVersion(env.VITE_APP_VERSION ?? "dev");
    agent.setCustomAttribute("environment", env.VITE_APP_ENV ?? env.MODE);
    agent.setCustomAttribute("platform", "web");
  } catch (err) {
    agent = null;
    console.warn("[newrelic] failed to start browser agent", err);
    return false;
  }

  setErrorReporter(browserReporter);
  return true;
}

const browserReporter: ErrorReporter = {
  captureError: (error, attributes) => noticeError(error, attributes),
  trackEvent: (name, attributes) => trackNewRelicEvent(name, attributes),
};

function clean(attributes?: TelemetryAttributes): Record<string, string | number | boolean> | undefined {
  if (!attributes) return undefined;
  const entries = Object.entries(attributes).filter(([, v]) => v !== undefined) as [string, string | number | boolean][];
  return Object.fromEntries(entries);
}

export function noticeError(error: unknown, attributes?: TelemetryAttributes): void {
  agent?.noticeError(error instanceof Error ? error : new Error(String(error)), clean(attributes));
}

export function trackNewRelicEvent(name: string, attributes?: TelemetryAttributes): void {
  agent?.addPageAction(name, clean(attributes));
}

/** Opaque IdP subject only (never email/name). Pass null on logout. */
export function setNewRelicUser(userId: string | null): void {
  agent?.setUserId(userId);
}

export function isNewRelicActive(): boolean {
  return agent !== null;
}
