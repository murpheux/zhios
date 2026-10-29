import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WalletListPage } from "./WalletListPage";
import { useZuma } from "../ZumaProvider";
import { useAuth } from "../auth/AuthContext";

vi.mock("../ZumaProvider");
vi.mock("../auth/AuthContext");

describe("WalletListPage", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      user: { profile: { sub: "user-123", email: "user@example.com" } },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      getAccessToken: () => "token",
    } as any);
  });

  it("renders wallets returned by the api", async () => {
    vi.mocked(useZuma).mockReturnValue({
      wallets: {
        list: vi.fn().mockResolvedValue({
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
        }),
      },
      transactions: {},
    } as any);

    render(
      <MemoryRouter>
        <WalletListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText(/Primary hot wallet/)).toBeInTheDocument());
    expect(screen.getByText("+ New wallet")).toBeInTheDocument();
  });

  it("shows an error message when loading fails", async () => {
    vi.mocked(useZuma).mockReturnValue({
      wallets: { list: vi.fn().mockRejectedValue(new Error("gateway unreachable")) },
      transactions: {},
    } as any);

    render(
      <MemoryRouter>
        <WalletListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("gateway unreachable")).toBeInTheDocument());
  });
});
