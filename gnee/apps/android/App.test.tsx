import { render } from "@testing-library/react-native";
import App from "./App";

jest.mock("@gnee/mobile-ui", () => {
  const ReactMock = require("react");
  const { Text } = require("react-native");
  return {
    resolveGatewayUrl: (...candidates: unknown[]) => candidates.find((c) => typeof c === "string" && c !== ""),
    ZumaMobileApp: (props: { gatewayUrl: string }) => ReactMock.createElement(Text, null, `app:${props.gatewayUrl}`),
  };
});

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => "00000000-0000-4000-8000-000000000000"),
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
}));

describe("App (android)", () => {
  it("renders the shared ZumaMobileApp with a resolved gateway URL", () => {
    const { getByText } = render(<App />);
    expect(getByText(/^app:https?:\/\//)).toBeTruthy();
  });
});
