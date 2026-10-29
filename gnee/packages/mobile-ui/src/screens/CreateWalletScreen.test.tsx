import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
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
    fireEvent.changeText(getByPlaceholderText("user-123"), "user-456");
    fireEvent.press(getByText("Create wallet"));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        label: "My wallet",
        ownerUserId: "user-456",
        network: "testnet",
        type: "hot",
      })
    );
    expect(navigation.replace).toHaveBeenCalledWith("WalletDetail", { walletId: "wallet-9" });
  });
});
