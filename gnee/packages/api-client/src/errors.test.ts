import { ZumaApiError } from "./api-error";
import { describeZumaError, isRetryableError } from "./errors";

describe("describeZumaError", () => {
  it.each([
    ["INSUFFICIENT_FUNDS", /Insufficient funds/],
    ["WALLET_NOT_ACTIVE", /isn't active/],
    ["IDEMPOTENCY_CONFLICT", /already submitted with different details/],
    ["FORBIDDEN", /permission/],
    ["UNAUTHORIZED", /session has expired/],
    ["NETWORK_ERROR", /Can't reach the server/],
    ["INTERNAL_ERROR", /on our side/],
  ])("maps %s to a friendly message", (code, expected) => {
    expect(describeZumaError(new ZumaApiError("raw server text", { code }))).toMatch(expected);
  });

  it.each(["VALIDATION_ERROR", "BAD_USER_INPUT"])("shows the server's safe message for %s", (code) => {
    const err = new ZumaApiError("destinationAddress is not a valid testnet address", { code });
    expect(describeZumaError(err)).toBe("destinationAddress is not a valid testnet address");
  });

  it("uses the fallback for unknown codes and non-Zuma errors", () => {
    expect(describeZumaError(new ZumaApiError("x", { code: "SOMETHING_NEW" }), "fallback")).toBe("fallback");
    expect(describeZumaError(new Error("boom"), "fallback")).toBe("fallback");
  });
});

describe("isRetryableError", () => {
  it("is true only for transient failures", () => {
    expect(isRetryableError(new ZumaApiError("x", { code: "NETWORK_ERROR" }))).toBe(true);
    expect(isRetryableError(new ZumaApiError("x", { code: "INSUFFICIENT_FUNDS" }))).toBe(false);
    expect(isRetryableError(new Error("x"))).toBe(false);
  });
});
