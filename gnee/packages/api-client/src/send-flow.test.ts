import { ZumaApiError } from "./api-error";
import { createSendFlow, type SendFlowWallet } from "./send-flow";
import type { Transaction } from "./types";

const WALLET: SendFlowWallet = { id: "wallet-1", network: "TESTNET", balanceCache: "1000000", status: "ACTIVE" };
const DEST = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";
const TX = { id: "tx-1" } as Transaction;

function setup(create = jest.fn().mockResolvedValue(TX)) {
  let n = 0;
  const createKey = jest.fn(() => `key-0000000${++n}`);
  const onSuccess = jest.fn();
  const flow = createSendFlow({ transactions: { create }, wallet: WALLET, createKey, onSuccess });
  return { flow, create, createKey, onSuccess };
}

function fill(flow: ReturnType<typeof setup>["flow"], amount = "0.0015") {
  flow.setField("destinationAddress", DEST);
  flow.setField("amount", amount);
  flow.setField("feeRate", "12");
}

describe("createSendFlow", () => {
  it("only shows errors for touched fields, then all after a review attempt", () => {
    const { flow } = setup();
    flow.setField("amount", "abc");
    expect(flow.getState().visibleErrors).toEqual({ amount: "Enter a valid amount." });
    expect(flow.review()).toBe(false);
    expect(Object.keys(flow.getState().visibleErrors).sort()).toEqual(["amount", "destinationAddress"]);
    expect(flow.getState().step).toBe("edit");
  });

  it("parses BTC input to sats and converts when the unit toggles", () => {
    const { flow } = setup();
    flow.setField("amount", "0.0015");
    expect(flow.getState().amountSats).toBe("150000");
    flow.setUnit("SATS");
    expect(flow.getState().values).toMatchObject({ unit: "SATS", amount: "150000" });
    expect(flow.getState().amountSats).toBe("150000");
  });

  it("enters review with a draft and one idempotency key, and submits it", async () => {
    const { flow, create, createKey, onSuccess } = setup();
    fill(flow);
    expect(flow.review()).toBe(true);
    const state = flow.getState();
    expect(state.step).toBe("review");
    expect(state.draft).toEqual({
      walletId: "wallet-1",
      network: "TESTNET",
      destinationAddress: DEST,
      amountSats: "150000",
      feeRate: "12",
    });
    expect(createKey).toHaveBeenCalledTimes(1);

    await flow.confirm();
    expect(create).toHaveBeenCalledWith({
      walletId: "wallet-1",
      amount: "150000",
      feeRate: "12",
      destinationAddress: DEST,
      idempotencyKey: "key-00000001",
    });
    expect(flow.getState().step).toBe("success");
    expect(onSuccess).toHaveBeenCalledWith(TX);
  });

  it("ignores a second confirm while the first is in flight", async () => {
    let resolve!: (tx: Transaction) => void;
    const create = jest.fn(() => new Promise<Transaction>((r) => (resolve = r)));
    const { flow } = setup(create);
    fill(flow);
    flow.review();

    const first = flow.confirm();
    const second = flow.confirm();
    expect(flow.getState().step).toBe("submitting");
    resolve(TX);
    await Promise.all([first, second]);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("reuses the same key on retry after a failure, and maps the error code", async () => {
    const create = jest
      .fn()
      .mockRejectedValueOnce(new ZumaApiError("Unable to reach the zuma gateway", { code: "NETWORK_ERROR" }))
      .mockResolvedValueOnce(TX);
    const { flow, createKey } = setup(create);
    fill(flow);
    flow.review();

    await flow.confirm();
    expect(flow.getState()).toMatchObject({ step: "review", submitErrorCode: "NETWORK_ERROR" });
    expect(flow.getState().submitError).toMatch(/Can't reach the server/);

    await flow.confirm();
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0].idempotencyKey).toBe(create.mock.calls[1][0].idempotencyKey);
    expect(createKey).toHaveBeenCalledTimes(1);
    expect(flow.getState().step).toBe("success");
  });

  it("starts a new idempotency session after back()", () => {
    const { flow, createKey } = setup();
    fill(flow);
    flow.review();
    const firstKey = flow.getState().idempotencyKey;
    flow.back();
    expect(flow.getState()).toMatchObject({ step: "edit", idempotencyKey: null, draft: null });
    flow.review();
    expect(flow.getState().idempotencyKey).not.toBe(firstKey);
    expect(createKey).toHaveBeenCalledTimes(2);
  });

  it("blocks review for an inactive wallet or an amount above balance", () => {
    const { flow } = setup();
    fill(flow, "0.02"); // 2,000,000 sats > 1,000,000 balance
    expect(flow.review()).toBe(false);
    expect(flow.getState().visibleErrors.amount).toBe("Amount exceeds the wallet balance.");

    flow.setField("amount", "0.001");
    flow.setWallet({ ...WALLET, status: "SUSPENDED" });
    expect(flow.getState().canReview).toBe(false);
    expect(flow.getState().blockedReason).toMatch(/isn't active/);
  });

  it("refuses to proceed when no secure random source is available", () => {
    const flow = createSendFlow({
      transactions: { create: jest.fn() },
      wallet: WALLET,
      createKey: () => {
        throw new Error("no crypto");
      },
    });
    fill(flow);
    expect(flow.review()).toBe(false);
    expect(flow.getState().submitErrorCode).toBe("NO_SECURE_RANDOM");
  });

  it("notifies subscribers with a new immutable snapshot per change", () => {
    const { flow } = setup();
    const listener = jest.fn();
    const unsubscribe = flow.subscribe(listener);
    const before = flow.getState();
    flow.setField("destinationAddress", DEST);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(flow.getState()).not.toBe(before);
    expect(flow.getState()).toBe(flow.getState());
    unsubscribe();
    flow.setField("feeRate", "9");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
