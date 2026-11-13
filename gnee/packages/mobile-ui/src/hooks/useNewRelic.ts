import type { TelemetryAttributes } from "@gnee/api-client";
import { useMemo } from "react";
import { recordError, recordEvent } from "../utils/newrelic";

/** Stable handlers for screens: custom events and manual error reports. */
export function useNewRelic() {
  return useMemo(
    () => ({
      trackEvent: (name: string, attributes?: TelemetryAttributes) => recordEvent(name, attributes),
      recordError: (error: unknown, attributes?: TelemetryAttributes) => recordError(error, attributes),
    }),
    []
  );
}
