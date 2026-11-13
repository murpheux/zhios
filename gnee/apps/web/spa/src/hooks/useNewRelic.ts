import type { TelemetryAttributes } from "@gnee/api-client";
import { useMemo } from "react";
import { noticeError, trackNewRelicEvent } from "../utils/newrelic";

/** Stable handlers for components: custom events (user interactions) and manual error reports. */
export function useNewRelic() {
  return useMemo(
    () => ({
      trackEvent: (name: string, attributes?: TelemetryAttributes) => trackNewRelicEvent(name, attributes),
      trackInteraction: (action: string, attributes?: TelemetryAttributes) =>
        trackNewRelicEvent("ui_interaction", { action, ...attributes }),
      recordError: (error: unknown, attributes?: TelemetryAttributes) => noticeError(error, attributes),
    }),
    []
  );
}
