import { reportError, trackEvent } from "@gnee/api-client";
import { initNewRelic, resetNewRelicForTests } from "./newrelic";

const mockAgent = {
  startAgent: jest.fn(),
  recordError: jest.fn(),
  recordCustomEvent: jest.fn(),
  setUserId: jest.fn(),
  setAttribute: jest.fn(),
  setJSAppVersion: jest.fn(),
};
jest.mock("newrelic-react-native-agent", () => ({ __esModule: true, default: mockAgent }), { virtual: true });

beforeEach(() => {
  jest.clearAllMocks();
  resetNewRelicForTests();
});

describe("mobile newrelic", () => {
  it("does nothing when disabled or without a token", () => {
    expect(initNewRelic({ enabled: false, appToken: "t" })).toBe(false);
    jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(initNewRelic({ enabled: true })).toBe(false);
    expect(mockAgent.startAgent).not.toHaveBeenCalled();
  });

  it("starts the agent once and forwards api-client errors and events", () => {
    expect(initNewRelic({ enabled: true, appToken: "t", version: "1.2.3" })).toBe(true);
    initNewRelic({ enabled: true, appToken: "t" });
    expect(mockAgent.startAgent).toHaveBeenCalledTimes(1);

    reportError(new Error("x"), { code: "NETWORK_ERROR", statusCode: undefined });
    expect(mockAgent.recordError).toHaveBeenCalledWith(expect.any(Error), { code: "NETWORK_ERROR" });

    trackEvent("wallet_created", { network: "TESTNET" });
    expect(mockAgent.recordCustomEvent).toHaveBeenCalledWith("ZumaMobileAction", "wallet_created", { network: "TESTNET" });
  });
});
