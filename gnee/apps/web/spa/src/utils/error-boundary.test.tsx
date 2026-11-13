import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./error-boundary";

const noticeError = vi.fn();
vi.mock("./newrelic", () => ({ noticeError: (...a: unknown[]) => noticeError(...a) }));

function Boom(): never {
  throw new Error("kaboom");
}

describe("ErrorBoundary", () => {
  it("renders the fallback and reports the error", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(noticeError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "kaboom" }),
      expect.objectContaining({ source: "react-error-boundary" })
    );
  });
});
