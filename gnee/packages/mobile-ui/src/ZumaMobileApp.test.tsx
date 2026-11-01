import { resolveGatewayUrl } from "./ZumaMobileApp";

describe("resolveGatewayUrl", () => {
  it.each([
    [["https://gw.example/graphql", "http://fallback"], "https://gw.example/graphql"],
    [[undefined, "", "  ", "http://10.0.2.2:3003/graphql"], "http://10.0.2.2:3003/graphql"],
    [[42, "ftp://nope", "http://localhost:3003/graphql"], "http://localhost:3003/graphql"],
  ])("picks the first valid http(s) URL from %j", (candidates, expected) => {
    expect(resolveGatewayUrl(...candidates)).toBe(expected);
  });

  it("throws when nothing is configured", () => {
    expect(() => resolveGatewayUrl(undefined, "")).toThrow(/EXPO_PUBLIC_ZUMA_GATEWAY_URL/);
  });
});
