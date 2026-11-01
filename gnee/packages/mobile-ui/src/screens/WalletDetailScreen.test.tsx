import { ZumaApiError } from "@gnee/api-client";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { useZuma } from "../ZumaProvider";
import { WalletDetailScreen } from "./WalletDetailScreen";

jest.mock("../ZumaProvider");

const mockedUseZuma = useZuma as jest.MockedFunction<typeof useZuma>;
const WALLET = {
  id: "wallet-1",
  label: "Primary hot wallet",
  address: "tb1qexample",
  network: "TESTNET",
  type: "HOT",
  balanceCache: "150000",
  metadata: {},
  ownerUserId: "user-123",
  status: "ACTIVE",
  createdAt: "",
  updatedAt: "",
};
const EMPTY = { items: [], pageInfo: { total: 0, page: 1, limit: 25, totalPages: 0 } };
const route = { key: "x", name: "WalletDetail" as const, params: { walletId: "wallet-1" } };

describe("WalletDetailScreen", () => {
  it("renders the balance from sats and an empty transaction list", async () => {
    mockedUseZuma.mockReturnValue({
      wallets: { get: jest.fn().mockResolvedValue(WALLET) },
      transactions: { list: jest.fn().mockResolvedValue(EMPTY) },
    } as any);
    const { findByText, getByText } = render(<WalletDetailScreen navigation={{ navigate: jest.fn() } as any} route={route} />);

    expect(await findByText("0.00150000 BTC")).toBeTruthy();
    expect(getByText("No transactions yet.")).toBeTruthy();
  });

  it("shows a mapped error and retries", async () => {
    const get = jest
      .fn()
      .mockRejectedValueOnce(new ZumaApiError("Unable to reach the zuma gateway", { code: "NETWORK_ERROR" }))
      .mockResolvedValueOnce(WALLET);
    mockedUseZuma.mockReturnValue({
      wallets: { get },
      transactions: { list: jest.fn().mockResolvedValue(EMPTY) },
    } as any);
    const { findByText, getByText } = render(<WalletDetailScreen navigation={{ navigate: jest.fn() } as any} route={route} />);

    expect(await findByText(/Can't reach the server/)).toBeTruthy();
    fireEvent.press(getByText("Retry"));
    await waitFor(() => expect(getByText("Primary hot wallet")).toBeTruthy());
  });
});
