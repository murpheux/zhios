import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { ZumaApiError } from "@gnee/api-client";
import { CreateWalletScreen } from "./CreateWalletScreen";
import { useZuma } from "../ZumaProvider";

jest.mock("../ZumaProvider");

const mockedUseZuma = useZuma as jest.MockedFunction<typeof useZuma>;

describe("CreateWalletScreen", () => {
  it("submits the form and navigates to the new wallet's detail screen", async () => {
    const create = jest.fn().mockResolvedValue({ id: "wallet-9" });
    mockedUseZuma.mockReturnValue({ wallets: { create }, transactions: {} } as any);

    const navigation = { replace: jest.fn() } as any;
    const { getByText, getByPlaceholderText } = render(
      <CreateWalletScreen navigation={navigation} route={{ key: "x", name: "CreateWallet" }} />
    );

    fireEvent.changeText(getByPlaceholderText("Primary hot wallet"), "My wallet");
    fireEvent.press(getByText("regtest"));
    fireEvent.press(getByText("Create wallet"));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        label: "My wallet",
        network: "REGTEST",
        type: "HOT",
      })
    );
    expect(navigation.replace).toHaveBeenCalledWith("WalletDetail", { walletId: "wallet-9" });
  });

  it("has no owner user id field and maps errors", async () => {
    const create = jest.fn().mockRejectedValue(new ZumaApiError("Forbidden", { code: "FORBIDDEN" }));
    mockedUseZuma.mockReturnValue({ wallets: { create }, transactions: {} } as any);

    const { getByText, getByPlaceholderText, queryByText } = render(
      <CreateWalletScreen navigation={{ replace: jest.fn() } as any} route={{ key: "x", name: "CreateWallet" }} />
    );
    expect(queryByText(/Owner user id/i)).toBeNull();

    fireEvent.changeText(getByPlaceholderText("Primary hot wallet"), "My wallet");
    fireEvent.press(getByText("Create wallet"));
    await waitFor(() => expect(getByText("You don't have permission to use this wallet.")).toBeTruthy());
  });
});
