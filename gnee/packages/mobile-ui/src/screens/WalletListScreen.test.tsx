import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import { WalletListScreen } from "./WalletListScreen";
import { useZuma } from "../ZumaProvider";

jest.mock("../ZumaProvider");

const mockedUseZuma = useZuma as jest.MockedFunction<typeof useZuma>;

function makeNavigation() {
  return { navigate: jest.fn() } as any;
}

describe("WalletListScreen", () => {
  it("renders wallets returned by the api and navigates to create on tap", async () => {
    const list = jest.fn().mockResolvedValue({
      items: [
        {
          id: "wallet-1",
          label: "Primary hot wallet",
          address: "tb1qexample",
          network: "testnet",
          type: "hot",
          balanceCache: "1000",
          metadata: {},
          ownerUserId: "user-123",
          status: "active",
          createdAt: "",
          updatedAt: "",
        },
      ],
      pageInfo: { total: 1, page: 1, limit: 25, totalPages: 1 },
    });
    mockedUseZuma.mockReturnValue({ wallets: { list }, transactions: {} } as any);

    const navigation = makeNavigation();
    const { getByText } = render(
      <WalletListScreen navigation={navigation} route={{ key: "x", name: "WalletList" }} />
    );

    await waitFor(() => expect(getByText("Primary hot wallet")).toBeTruthy());
    expect(list).toHaveBeenCalledWith({ page: 1, limit: 25 });

    fireEvent.press(getByText("+ New"));
    expect(navigation.navigate).toHaveBeenCalledWith("CreateWallet");
  });

  it("shows an error message when loading fails", async () => {
    const list = jest.fn().mockRejectedValue(new Error("gateway unreachable"));
    mockedUseZuma.mockReturnValue({ wallets: { list }, transactions: {} } as any);

    const { getByText } = render(
      <WalletListScreen navigation={makeNavigation()} route={{ key: "x", name: "WalletList" }} />
    );

    await waitFor(() => expect(getByText("gateway unreachable")).toBeTruthy());
  });
});
