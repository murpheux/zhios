import React from "react";
import { Text } from "react-native";
import { render, waitFor } from "@testing-library/react-native";
import { ZumaProvider, useZuma } from "./ZumaProvider";

jest.mock("@gnee/api-client", () => ({
  createZumaApi: jest.fn(() => ({ wallets: {}, transactions: {} })),
}));

function Probe() {
  const api = useZuma();
  return <Text>{api ? "ready" : "missing"}</Text>;
}

describe("ZumaProvider / useZuma", () => {
  it("provides the zuma api to descendants", async () => {
    const { getByText } = render(
      <ZumaProvider endpoint="http://gateway/graphql" getToken={() => null}>
        <Probe />
      </ZumaProvider>
    );
    await waitFor(() => expect(getByText("ready")).toBeTruthy());
  });

  it("throws when useZuma is called outside the provider", () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow("useZuma() called outside <ZumaProvider>");
    consoleError.mockRestore();
  });
});
