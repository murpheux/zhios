import { GraphQLClient } from "graphql-request";
import { createZumaClient, toZumaApiError, ZumaApiError } from "./client";

// graphql-request v7 is ESM-only, so use a factory mock rather than jest automock (which loads the real module).
jest.mock("graphql-request", () => ({ GraphQLClient: jest.fn() }));

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

  it("wraps transport failures in a ZumaApiError with code NETWORK_ERROR", async () => {
    mockRequest.mockRejectedValue(new TypeError("fetch failed"));
    const client = createZumaClient({ endpoint: "http://gateway/graphql", getToken: () => null });

    const err = await client.request("query { ok }").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ZumaApiError);
    expect(err).toMatchObject({ code: "NETWORK_ERROR" });
  });

  it.each([
    ["INSUFFICIENT_FUNDS", "Insufficient funds for amount plus fee", 422],
    ["WALLET_NOT_ACTIVE", "Wallet is not active", 409],
    ["IDEMPOTENCY_CONFLICT", "Idempotency key reused with a different payload", 409],
    ["VALIDATION_ERROR", "destinationAddress is not a valid testnet address", 400],
    ["FORBIDDEN", "Forbidden", 403],
  ])("exposes extensions.code %s and the server's safe message", async (code, message, statusCode) => {
    mockRequest.mockRejectedValue({
      response: { status: 200, errors: [{ message, path: ["createTransaction"], extensions: { code, statusCode } }] },
    });
    const client = createZumaClient({ endpoint: "http://gateway/graphql", getToken: () => null });

    const err = (await client.request("mutation { x }").catch((e: unknown) => e)) as ZumaApiError;
    expect(err).toBeInstanceOf(ZumaApiError);
    expect(err.code).toBe(code);
    expect(err.message).toBe(message);
    expect(err.statusCode).toBe(statusCode);
    expect(err.errors[0]).toEqual({ message, code, path: ["createTransaction"] });
  });

  it("falls back to an HTTP-status code when the response has no GraphQL errors", async () => {
    mockRequest.mockRejectedValue({ response: { status: 401 } });
    const client = createZumaClient({ endpoint: "http://gateway/graphql", getToken: () => null });

    await expect(client.request("query { ok }")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("toZumaApiError", () => {
  it("returns an existing ZumaApiError unchanged", () => {
    const original = new ZumaApiError("x", { code: "FORBIDDEN" });
    expect(toZumaApiError(original)).toBe(original);
  });

  it("treats GraphQL errors without a code (schema validation) as BAD_REQUEST", () => {
    const err = toZumaApiError({ response: { status: 400, errors: [{ message: "Unknown argument" }] } });
    expect(err.code).toBe("BAD_REQUEST");
  });
});
