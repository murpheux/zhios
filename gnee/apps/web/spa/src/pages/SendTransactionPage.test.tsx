import { ZumaApiError } from "@gnee/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useZuma } from "../ZumaProvider";
import { SendTransactionPage } from "./SendTransactionPage";

vi.mock("../ZumaProvider");
const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock, useParams: () => ({ walletId: "wallet-1" }) };
});

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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function renderPage(create: ReturnType<typeof vi.fn>) {
  vi.mocked(useZuma).mockReturnValue({
    wallets: { get: vi.fn().mockResolvedValue(WALLET) },
    transactions: { create },
  } as any);
  render(
    <MemoryRouter>
      <SendTransactionPage />
    </MemoryRouter>
  );
}

async function fillAndReview() {
  fireEvent.change(await screen.findByLabelText(/Destination address/), { target: { value: DEST } });
  fireEvent.change(screen.getByLabelText("Amount (BTC)"), { target: { value: "0.0015" } });
  fireEvent.change(screen.getByLabelText("Fee rate (sat/vB)"), { target: { value: "12" } });
  fireEvent.click(screen.getByText("Review send"));
  await screen.findByRole("heading", { name: "Review and confirm" });
}

describe("SendTransactionPage", () => {
  beforeEach(() => navigateMock.mockReset());

  it("validates fields live, including the wallet's network", async () => {
    renderPage(vi.fn());
    fireEvent.change(await screen.findByLabelText(/Destination address/), {
      target: { value: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq" },
    });
    expect(screen.getByText(/mainnet address, but this wallet is on testnet/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Amount (BTC)"), { target: { value: "0.000000001" } });
    expect(screen.getByText("Enter a valid amount.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Amount (BTC)"), { target: { value: "1" } });
    expect(screen.getByText("Amount exceeds the wallet balance.")).toBeInTheDocument();
  });

  it("accepts sats input when the unit is switched", async () => {
    renderPage(vi.fn());
    fireEvent.change(await screen.findByLabelText("Amount (BTC)"), { target: { value: "0.0015" } });
    fireEvent.click(screen.getByLabelText("sats"));
    expect(screen.getByLabelText("Amount (sats)")).toHaveValue("150000");
  });

  it("shows a review step and submits only on confirm, with an idempotency key", async () => {
    const create = vi.fn().mockResolvedValue({ id: "tx-1" });
    renderPage(create);
    await fillAndReview();

    expect(screen.getByText(DEST)).toBeInTheDocument();
    expect(screen.getByText("0.00150000 BTC (150,000 sats)")).toBeInTheDocument();
    expect(screen.getByText("12 sat/vB")).toBeInTheDocument();
    expect(screen.getByText("testnet")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Confirm and send"));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith({
      walletId: "wallet-1",
      amount: "150000",
      feeRate: "12",
      destinationAddress: DEST,
      idempotencyKey: expect.stringMatching(UUID),
    });
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/wallets/wallet-1", { state: { sentTransactionId: "tx-1" } })
    );
  });

  it("never double-submits on a double click", async () => {
    let resolve!: (v: unknown) => void;
    const create = vi.fn(() => new Promise((r) => (resolve = r)));
    renderPage(create);
    await fillAndReview();

    const confirm = screen.getByText("Confirm and send");
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(await screen.findByText("Sending…")).toBeDisabled();
    expect(screen.getByText("Back")).toBeDisabled();
    resolve({ id: "tx-1" });
    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("maps error codes to friendly messages and retries with the same key", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new ZumaApiError("Insufficient funds for amount plus fee", { code: "INSUFFICIENT_FUNDS" }))
      .mockResolvedValueOnce({ id: "tx-1" });
    renderPage(create);
    await fillAndReview();

    fireEvent.click(screen.getByText("Confirm and send"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Insufficient funds — the amount plus network fee/);

    fireEvent.click(screen.getByText("Retry send"));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[1][0].idempotencyKey).toBe(create.mock.calls[0][0].idempotencyKey);
  });

  it("starts a new idempotency session after going back to edit", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new ZumaApiError("conflict", { code: "IDEMPOTENCY_CONFLICT" }))
      .mockResolvedValueOnce({ id: "tx-2" });
    renderPage(create);
    await fillAndReview();
    fireEvent.click(screen.getByText("Confirm and send"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already submitted with different details/);

    fireEvent.click(screen.getByText("Back"));
    fireEvent.click(await screen.findByText("Review send"));
    fireEvent.click(await screen.findByText("Confirm and send"));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[1][0].idempotencyKey).not.toBe(create.mock.calls[0][0].idempotencyKey);
  });
});
