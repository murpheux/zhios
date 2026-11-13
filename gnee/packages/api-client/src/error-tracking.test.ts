import { operationName, reportError, setErrorReporter, trackEvent, type ErrorReporter } from "./error-tracking";

afterEach(() => setErrorReporter(null));

describe("error-tracking", () => {
  it("is a no-op without a reporter", () => {
    expect(() => reportError(new Error("x"))).not.toThrow();
    expect(() => trackEvent("e")).not.toThrow();
  });

  it("forwards errors (wrapping non-Errors) and events", () => {
    const r: ErrorReporter = { captureError: jest.fn(), trackEvent: jest.fn() };
    setErrorReporter(r);
    reportError("boom", { source: "t" });
    trackEvent("wallet_created", { network: "TESTNET" });
    expect(r.captureError).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }), { source: "t" });
    expect(r.trackEvent).toHaveBeenCalledWith("wallet_created", { network: "TESTNET" });
  });

  it("swallows reporter failures", () => {
    setErrorReporter({
      captureError: () => {
        throw new Error("down");
      },
      trackEvent: () => {
        throw new Error("down");
      },
    });
    expect(() => reportError(new Error("x"))).not.toThrow();
    expect(() => trackEvent("e")).not.toThrow();
  });

  it.each([
    ["query Wallets($p: Int) { wallets { id } }", "Wallets"],
    ["mutation CreateWallet { x }", "CreateWallet"],
    ["{ wallets { id } }", undefined],
  ])("operationName(%s)", (doc, expected) => {
    expect(operationName(doc)).toBe(expected);
  });
});
