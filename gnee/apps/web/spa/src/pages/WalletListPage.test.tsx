import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZumaApiError } from "@gnee/api-client";
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
      getAccessToken: async () => "token",
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
              network: "TESTNET",
              type: "HOT",
              balanceCache: "150000",
              metadata: {},
              ownerUserId: "user-123",
              status: "ACTIVE",
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
    expect(screen.getByText(/0\.00150000 BTC/)).toBeInTheDocument();
    expect(screen.getByText("+ New wallet")).toBeInTheDocument();
  });

  it("shows an error message when loading fails", async () => {
    vi.mocked(useZuma).mockReturnValue({
      wallets: {
        list: vi.fn().mockRejectedValue(new ZumaApiError("Unable to reach the zuma gateway", { code: "NETWORK_ERROR" })),
      },
      transactions: {},
    } as any);

    render(
      <MemoryRouter>
        <WalletListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Can't reach the server/));
  });
});
