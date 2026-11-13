import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { recordError } from "../utils/newrelic";
import { ErrorBoundary } from "./ErrorBoundary";

jest.mock("../utils/newrelic", () => ({ recordError: jest.fn() }));

function Boom(): never {
  throw new Error("kaboom");
}

describe("ErrorBoundary", () => {
  it("renders the fallback and reports the error", () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(recordError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "kaboom" }),
      expect.objectContaining({ source: "react-error-boundary" })
    );
  });

  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <Text>ok</Text>
      </ErrorBoundary>
    );
    expect(screen.getByText("ok")).toBeTruthy();
  });
});
