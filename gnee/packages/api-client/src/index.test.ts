import { createZumaApi } from "./index";

jest.mock("graphql-request", () => ({
  GraphQLClient: jest.fn().mockImplementation(() => ({ request: jest.fn() })),
}));

describe("createZumaApi", () => {
  it("exposes wallets and transactions sub-APIs", () => {
    const api = createZumaApi({ endpoint: "http://gateway/graphql", getToken: () => null });
    expect(api.wallets).toBeDefined();
    expect(api.transactions).toBeDefined();
    expect(typeof api.wallets.list).toBe("function");
    expect(typeof api.transactions.create).toBe("function");
    expect(typeof api.wallets.updateMetadata).toBe("function");
  });
});
