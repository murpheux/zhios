import { ZumaApiError } from "@gnee/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { useZuma } from "../ZumaProvider";
import { WalletDetailPage } from "./WalletDetailPage";

vi.mock("../ZumaProvider");

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

function renderAt(state?: unknown) {
  render(
    <MemoryRouter initialEntries={[{ pathname: "/wallets/wallet-1", state }]}>
      <Routes>
        <Route path="/wallets/:walletId" element={<WalletDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("WalletDetailPage", () => {
  it("shows the balance formatted from sats and an empty transaction state", async () => {
    vi.mocked(useZuma).mockReturnValue({
      wallets: { get: vi.fn().mockResolvedValue(WALLET) },
      transactions: { list: vi.fn().mockResolvedValue(EMPTY) },
    } as any);
    renderAt({ sentTransactionId: "tx-1" });

    expect(await screen.findByText("0.00150000 BTC")).toBeInTheDocument();
    expect(screen.getByText("No transactions yet.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Transaction submitted");
  });

  it("shows a mapped error with a working retry", async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(new ZumaApiError("Forbidden", { code: "FORBIDDEN" }))
      .mockResolvedValueOnce(WALLET);
    vi.mocked(useZuma).mockReturnValue({
      wallets: { get },
      transactions: { list: vi.fn().mockResolvedValue(EMPTY) },
    } as any);
    renderAt();

    expect(await screen.findByRole("alert")).toHaveTextContent("You don't have permission to use this wallet.");
    fireEvent.click(screen.getByText("Retry"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Primary hot wallet" })).toBeInTheDocument());
  });

  it("handles a missing wallet", async () => {
    vi.mocked(useZuma).mockReturnValue({
      wallets: { get: vi.fn().mockResolvedValue(null) },
      transactions: { list: vi.fn().mockResolvedValue(EMPTY) },
    } as any);
    renderAt();
    expect(await screen.findByText("Wallet not found.")).toBeInTheDocument();
  });
});
