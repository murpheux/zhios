import React from "react";
import { render } from "@testing-library/react-native";
import App from "./App";

jest.mock("@gnee/mobile-ui", () => {
  const ReactMock = require("react");
  const { Text } = require("react-native");
  function ZumaProvider(props: { children: unknown }) {
    return props.children;
  }
  function RootNavigator() {
    return ReactMock.createElement(Text, null, "root-navigator");
  }
  return { ZumaProvider, RootNavigator };
});

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
}));

describe("App (android)", () => {
  it("renders the shared RootNavigator inside ZumaProvider without crashing", () => {
    const { getByText } = render(<App />);
    expect(getByText("root-navigator")).toBeTruthy();
  });
});
