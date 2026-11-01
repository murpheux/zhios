import { ZumaApiError } from "./api-error";

const FRIENDLY: Record<string, string> = {
  INSUFFICIENT_FUNDS: "Insufficient funds — the amount plus network fee is more than this wallet's available balance.",
  WALLET_NOT_ACTIVE: "This wallet isn't active (suspended or archived), so it can't send.",
  IDEMPOTENCY_CONFLICT:
    "This send was already submitted with different details. Go back, review, and confirm again.",
  UNAUTHORIZED: "Your session has expired. Sign in again.",
  FORBIDDEN: "You don't have permission to use this wallet.",
  NOT_FOUND: "That wallet or transaction no longer exists.",
  RATE_LIMITED: "Too many requests — wait a moment, then try again.",
  NETWORK_ERROR: "Can't reach the server. Check your connection and try again.",
  INTERNAL_ERROR: "Something went wrong on our side. Please try again.",
};

/** Codes whose server message is specific, safe and actionable — shown verbatim. */
const SHOW_SERVER_MESSAGE = new Set(["VALIDATION_ERROR", "BAD_USER_INPUT", "BAD_REQUEST", "CONFLICT"]);

/** Maps any thrown value to a user-facing sentence, keyed off ZumaApiError.code. */
export function describeZumaError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err instanceof ZumaApiError) {
    if (SHOW_SERVER_MESSAGE.has(err.code)) return err.message;
    return FRIENDLY[err.code] ?? fallback;
  }
  return fallback;
}

/** True when retrying the exact same request (same idempotency key) is safe and may succeed. */
export function isRetryableError(err: unknown): boolean {
  return err instanceof ZumaApiError && ["NETWORK_ERROR", "INTERNAL_ERROR", "RATE_LIMITED", "UNKNOWN"].includes(err.code);
}
