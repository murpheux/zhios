import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useZuma } from "../ZumaProvider";

export function SendTransactionPage() {
  const { walletId } = useParams<{ walletId: string }>();
  const zuma = useZuma();
  const navigate = useNavigate();
  const [destinationAddress, setDestinationAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [feeRate, setFeeRate] = useState("8");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!walletId) return;
    setSubmitting(true);
    setError(null);
    try {
      await zuma.transactions.create({ walletId, type: "send", amount, feeRate, destinationAddress });
      navigate(`/wallets/${walletId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create transaction");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>Send</h1>
      <form onSubmit={onSubmit}>
        <label>
          Destination address
          <input value={destinationAddress} onChange={(e) => setDestinationAddress(e.target.value)} placeholder="tb1q..." />
        </label>
        <label>
          Amount (sats)
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="15000" />
        </label>
        <label>
          Fee rate
          <input value={feeRate} onChange={(e) => setFeeRate(e.target.value)} />
        </label>
        {error && <p style={{ color: "crimson" }}>{error}</p>}
        <button type="submit" disabled={submitting || !destinationAddress || !amount}>
          {submitting ? "Sending…" : "Send"}
        </button>
      </form>
    </main>
  );
}
