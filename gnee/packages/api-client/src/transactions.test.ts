import { createTransactionsApi } from "./transactions";
import type { ZumaClient } from "./client";
import type { Transaction } from "./types";

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    walletId: "wallet-1",
    txid: null,
    type: "SEND",
    amount: "15000",
    feeRate: "8",
    status: "PENDING",
    confirmations: 0,
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
      amount: "15000",
      feeRate: "8",
      destinationAddress: "tb1qdestination",
      idempotencyKey: "6f1c1d1e-2b4a-4c1e-9a7e-0d1f2e3a4b5c",
    };
    await expect(api.create(input)).resolves.toEqual(tx);
    expect(client.request).toHaveBeenCalledWith(expect.stringContaining("mutation CreateTransaction"), {
      input,
    });
    const [document, variables] = client.request.mock.calls[0];
    expect(document).not.toContain("rawTx");
    expect(variables.input.idempotencyKey).toBe("6f1c1d1e-2b4a-4c1e-9a7e-0d1f2e3a4b5c");
    expect(variables.input).not.toHaveProperty("type");
  });

  it("list() types the status filter as the TransactionStatus enum", async () => {
    const client = makeClient();
    client.request.mockResolvedValue({ transactions: { items: [], pageInfo: {} } });

    await createTransactionsApi(client).list({ status: "CONFIRMED" });
    expect(client.request.mock.calls[0][0]).toContain("$status: TransactionStatus");
  });
});
