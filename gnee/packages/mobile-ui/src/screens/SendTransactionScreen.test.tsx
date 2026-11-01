import { ZumaApiError } from "@gnee/api-client";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { useIdempotencyKeyFactory, useZuma } from "../ZumaProvider";
import { SendTransactionScreen } from "./SendTransactionScreen";

jest.mock("../ZumaProvider");

const mockedUseZuma = useZuma as jest.MockedFunction<typeof useZuma>;
const mockedKeyFactory = useIdempotencyKeyFactory as jest.MockedFunction<typeof useIdempotencyKeyFactory>;

const WALLET = {
  id: "wallet-1",
  label: "Primary hot wallet",
  address: "tb1qexample",
  network: "TESTNET",
  type: "HOT",
  balanceCache: "1000000",
  metadata: {},
  ownerUserId: "user-123",
  status: "ACTIVE",
  createdAt: "",
  updatedAt: "",
};
const DEST = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";

function renderScreen(create: jest.Mock) {
  let n = 0;
  mockedKeyFactory.mockReturnValue(() => `test-key-${++n}`);
  mockedUseZuma.mockReturnValue({
    wallets: { get: jest.fn().mockResolvedValue(WALLET) },
    transactions: { create },
  } as any);
  const navigation = { popTo: jest.fn() } as any;
  const utils = render(
    <SendTransactionScreen navigation={navigation} route={{ key: "x", name: "SendTransaction", params: { walletId: "wallet-1" } }} />
  );
  return { ...utils, navigation };
}

async function fillAndReview(utils: ReturnType<typeof renderScreen>) {
  const address = await utils.findByLabelText("Destination address");
  fireEvent.changeText(address, DEST);
  fireEvent.changeText(utils.getByLabelText("Amount"), "0.0015");
  fireEvent.changeText(utils.getByLabelText("Fee rate"), "12");
  fireEvent.press(utils.getByText("Review send"));
  await utils.findByText("Review and confirm");
}

describe("SendTransactionScreen", () => {
  it("shows live field errors in BTC and sats", async () => {
    const utils = renderScreen(jest.fn());
    fireEvent.changeText(await utils.findByLabelText("Destination address"), "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq");
    expect(utils.getByText(/mainnet address, but this wallet is on testnet/)).toBeTruthy();

    expect(utils.getByText("Amount (BTC)")).toBeTruthy();
    fireEvent.changeText(utils.getByLabelText("Amount"), "1e-8");
    expect(utils.getByText("Enter a valid amount.")).toBeTruthy();

    fireEvent.press(utils.getByText("sats"));
    expect(utils.getByText("Amount (sats)")).toBeTruthy();
    fireEvent.changeText(utils.getByLabelText("Amount"), "0");
    expect(utils.getByText("Amount must be greater than zero.")).toBeTruthy();
  });

  it("reviews destination, amount, fee rate and network before sending", async () => {
    const create = jest.fn().mockResolvedValue({ id: "tx-1" });
    const utils = renderScreen(create);
    await fillAndReview(utils);

    expect(utils.getByText(DEST)).toBeTruthy();
    expect(utils.getByText("0.00150000 BTC (150,000 sats)")).toBeTruthy();
    expect(utils.getByText("12 sat/vB")).toBeTruthy();
    expect(utils.getByText("testnet")).toBeTruthy();
    expect(create).not.toHaveBeenCalled();

    fireEvent.press(utils.getByText("Confirm and send"));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        walletId: "wallet-1",
        amount: "150000",
        feeRate: "12",
        destinationAddress: DEST,
        idempotencyKey: "test-key-1",
      })
    );
    await waitFor(() =>
      expect(utils.navigation.popTo).toHaveBeenCalledWith("WalletDetail", { walletId: "wallet-1", sentTransactionId: "tx-1" })
    );
  });

  it("maps errors and retries with the same idempotency key", async () => {
    const create = jest
      .fn()
      .mockRejectedValueOnce(new ZumaApiError("Wallet is not active", { code: "WALLET_NOT_ACTIVE" }))
      .mockResolvedValueOnce({ id: "tx-1" });
    const utils = renderScreen(create);
    await fillAndReview(utils);

    fireEvent.press(utils.getByText("Confirm and send"));
    await waitFor(() => expect(utils.getByText(/This wallet isn't active/)).toBeTruthy());
    fireEvent.press(utils.getByText("Retry send"));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[1][0].idempotencyKey).toBe("test-key-1");
  });

  it("does not double-submit while a send is in flight", async () => {
    let resolve!: (v: unknown) => void;
    const create = jest.fn(() => new Promise((r) => (resolve = r)));
    const utils = renderScreen(create);
    await fillAndReview(utils);

    fireEvent.press(utils.getByText("Confirm and send"));
    await utils.findByText("Sending…");
    fireEvent.press(utils.getByText("Sending…"));
    resolve({ id: "tx-1" });
    await waitFor(() => expect(utils.navigation.popTo).toHaveBeenCalled());
    expect(create).toHaveBeenCalledTimes(1);
  });
});
