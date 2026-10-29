import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
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
    fireEvent.change(screen.getByPlaceholderText("user-123"), { target: { value: "user-456" } });
    fireEvent.click(screen.getByText("Create wallet"));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        label: "My wallet",
        ownerUserId: "user-456",
        network: "testnet",
        type: "hot",
      })
    );
    expect(navigateMock).toHaveBeenCalledWith("/wallets/wallet-9");
  });
});
