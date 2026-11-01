import { describe, expect, it } from "vitest";
import { returnToFromState, sanitizeReturnTo } from "./returnTo";

describe("sanitizeReturnTo", () => {
  it.each([
    ["/", "/"],
    ["/wallets/abc?tab=tx#top", "/wallets/abc?tab=tx#top"],
    ["//evil.example/path", "/"],
    ["/\\evil.example", "/"],
    ["https://evil.example", "/"],
    ["javascript:alert(1)", "/"],
    ["wallets", "/"],
    ["/wallets\n/x", "/"],
    ["/callback?code=x", "/"],
    [42, "/"],
    [undefined, "/"],
  ])("%j -> %j", (input, expected) => {
    expect(sanitizeReturnTo(input)).toBe(expected);
  });
});

describe("returnToFromState", () => {
  it("reads returnTo from the signin state and sanitizes it", () => {
    expect(returnToFromState({ returnTo: "/wallets/1" })).toBe("/wallets/1");
    expect(returnToFromState({ returnTo: "//evil" })).toBe("/");
    expect(returnToFromState("/legacy-string-state")).toBe("/");
    expect(returnToFromState(null)).toBe("/");
  });
});
