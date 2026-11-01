import { createWalletsApi } from "./wallets";
import type { ZumaClient } from "./client";
import type { Wallet } from "./types";

function makeWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    id: "wallet-1",
    label: "Primary hot wallet",
    address: "tb1qexample",
    network: "TESTNET",
    type: "HOT",
    balanceCache: "0",
    metadata: {},
    ownerUserId: "user-123",
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("createWalletsApi", () => {
  function makeClient() {
    return { request: jest.fn() } as unknown as ZumaClient & { request: jest.Mock };
  }

  it("get() unwraps the wallet field", async () => {
    const client = makeClient();
    const wallet = makeWallet();
    client.request.mockResolvedValue({ wallet });

    const api = createWalletsApi(client);
    await expect(api.get("wallet-1")).resolves.toEqual(wallet);
    expect(client.request).toHaveBeenCalledWith(expect.stringContaining("query Wallet"), { id: "wallet-1" });
  });

  it("list() unwraps the wallets connection", async () => {
    const client = makeClient();
    const connection = { items: [makeWallet()], pageInfo: { total: 1, page: 1, limit: 25, totalPages: 1 } };
    client.request.mockResolvedValue({ wallets: connection });

    const api = createWalletsApi(client);
    await expect(api.list({ page: 1, limit: 25 })).resolves.toEqual(connection);
    expect(client.request).toHaveBeenCalledWith(expect.stringContaining("query Wallets"), {
      page: 1,
      limit: 25,
    });
  });

  it("create() sends the input and unwraps createWallet", async () => {
    const client = makeClient();
    const wallet = makeWallet({ id: "wallet-2" });
    client.request.mockResolvedValue({ createWallet: wallet });

    const api = createWalletsApi(client);
    const input = { label: "New wallet", network: "TESTNET" as const, type: "HOT" as const };
    await expect(api.create(input)).resolves.toEqual(wallet);
    expect(client.request).toHaveBeenCalledWith(expect.stringContaining("mutation CreateWallet"), {
      input,
    });
    expect(client.request.mock.calls[0][1].input).not.toHaveProperty("ownerUserId");
  });

  it("updateMetadata() sends id + input and unwraps updateWalletMetadata", async () => {
    const client = makeClient();
    const wallet = makeWallet({ label: "Renamed" });
    client.request.mockResolvedValue({ updateWalletMetadata: wallet });

    const api = createWalletsApi(client);
    await expect(api.updateMetadata("wallet-1", { label: "Renamed" })).resolves.toEqual(wallet);
    expect(client.request).toHaveBeenCalledWith(expect.stringContaining("mutation UpdateWalletMetadata"), {
      id: "wallet-1",
      input: { label: "Renamed" },
    });
  });
});
