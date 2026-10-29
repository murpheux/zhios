import { GraphQLClient } from "graphql-request";
import { createZumaClient, ZumaApiError } from "./client";

jest.mock("graphql-request");

describe("createZumaClient", () => {
  const mockRequest = jest.fn();

  beforeEach(() => {
    mockRequest.mockReset();
    (GraphQLClient as unknown as jest.Mock).mockImplementation(() => ({
      request: mockRequest,
    }));
  });

  it("injects the Authorization header when a token is available", async () => {
    mockRequest.mockResolvedValue({ ok: true });
    const client = createZumaClient({ endpoint: "http://gateway/graphql", getToken: () => "abc123" });

    await client.request("query { ok }");

    expect(mockRequest).toHaveBeenCalledWith({
      document: "query { ok }",
      variables: undefined,
      requestHeaders: { Authorization: "Bearer abc123" },
    });
  });

  it("omits the Authorization header when there is no token", async () => {
    mockRequest.mockResolvedValue({ ok: true });
    const client = createZumaClient({ endpoint: "http://gateway/graphql", getToken: () => null });

    await client.request("query { ok }");

    expect(mockRequest).toHaveBeenCalledWith({
      document: "query { ok }",
      variables: undefined,
      requestHeaders: undefined,
    });
  });

  it("supports an async getToken", async () => {
    mockRequest.mockResolvedValue({ ok: true });
    const client = createZumaClient({
      endpoint: "http://gateway/graphql",
      getToken: async () => "async-token",
    });

    await client.request("query { ok }");

    expect(mockRequest).toHaveBeenCalledWith({
      document: "query { ok }",
      variables: undefined,
      requestHeaders: { Authorization: "Bearer async-token" },
    });
  });

  it("wraps underlying failures in a ZumaApiError", async () => {
    mockRequest.mockRejectedValue(new Error("network down"));
    const client = createZumaClient({ endpoint: "http://gateway/graphql", getToken: () => null });

    await expect(client.request("query { ok }")).rejects.toBeInstanceOf(ZumaApiError);
  });
});
