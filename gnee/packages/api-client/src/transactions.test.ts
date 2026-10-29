import { createTransactionsApi } from "./transactions";
import type { ZumaClient } from "./client";
import type { Transaction } from "./types";

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    walletId: "wallet-1",
    txid: null,
    type: "send",
    amount: "15000",
    feeRate: "8",
    status: "pending",
    confirmations: 0,
    rawTx: null,
    createdAt: "2026-01-01T00:05:00.000Z",
    updatedAt: "2026-01-01T00:05:00.000Z",
    ...overrides,
  };
}

describe("createTransactionsApi", () => {
  function makeClient() {
    return { request: jest.fn() } as unknown as ZumaClient & { request: jest.Mock };
  }

  it("get() unwraps the transaction field", async () => {
    const client = makeClient();
    const tx = makeTransaction();
    client.request.mockResolvedValue({ transaction: tx });

    const api = createTransactionsApi(client);
    await expect(api.get("tx-1")).resolves.toEqual(tx);
    expect(client.request).toHaveBeenCalledWith(expect.stringContaining("query Transaction"), {
      id: "tx-1",
    });
  });

  it("list() unwraps the transactions connection", async () => {
    const client = makeClient();
    const connection = { items: [makeTransaction()], pageInfo: { total: 1, page: 1, limit: 25, totalPages: 1 } };
    client.request.mockResolvedValue({ transactions: connection });

    const api = createTransactionsApi(client);
    await expect(api.list({ walletId: "wallet-1" })).resolves.toEqual(connection);
    expect(client.request).toHaveBeenCalledWith(expect.stringContaining("query Transactions"), {
      walletId: "wallet-1",
    });
  });

  it("create() sends the input and unwraps createTransaction", async () => {
    const client = makeClient();
    const tx = makeTransaction({ id: "tx-2" });
    client.request.mockResolvedValue({ createTransaction: tx });

    const api = createTransactionsApi(client);
    const input = {
      walletId: "wallet-1",
      type: "send" as const,
      amount: "15000",
      feeRate: "8",
      destinationAddress: "tb1qdestination",
    };
    await expect(api.create(input)).resolves.toEqual(tx);
    expect(client.request).toHaveBeenCalledWith(expect.stringContaining("mutation CreateTransaction"), {
      input,
    });
  });
});
