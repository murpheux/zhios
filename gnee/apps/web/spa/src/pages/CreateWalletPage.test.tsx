import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ZumaApiError } from "@gnee/api-client";
import { CreateWalletPage } from "./CreateWalletPage";
import { useZuma } from "../ZumaProvider";

vi.mock("../ZumaProvider");
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const navigateMock = vi.fn();

describe("CreateWalletPage", () => {
  it("submits the form and navigates to the new wallet's detail page", async () => {
    const create = vi.fn().mockResolvedValue({ id: "wallet-9" });
    vi.mocked(useZuma).mockReturnValue({ wallets: { create }, transactions: {} } as any);

    render(
      <MemoryRouter>
        <CreateWalletPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText("Primary hot wallet"), { target: { value: "My wallet" } });
    fireEvent.change(screen.getByLabelText("Network"), { target: { value: "REGTEST" } });
    fireEvent.click(screen.getByText("Create wallet"));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        label: "My wallet",
        network: "REGTEST",
        type: "HOT",
      })
    );
    expect(navigateMock).toHaveBeenCalledWith("/wallets/wallet-9");
    expect(screen.queryByText(/Owner user id/i)).not.toBeInTheDocument();
  });

  it("shows the mapped error message when creation fails", async () => {
    const create = vi.fn().mockRejectedValue(new ZumaApiError("Forbidden", { code: "FORBIDDEN" }));
    vi.mocked(useZuma).mockReturnValue({ wallets: { create }, transactions: {} } as any);

    render(
      <MemoryRouter>
        <CreateWalletPage />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByPlaceholderText("Primary hot wallet"), { target: { value: "My wallet" } });
    fireEvent.click(screen.getByText("Create wallet"));

    expect(await screen.findByRole("alert")).toHaveTextContent("You don't have permission to use this wallet.");
  });
});
