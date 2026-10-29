import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useZuma } from "../ZumaProvider";

export function CreateWalletPage() {
  const zuma = useZuma();
  const navigate = useNavigate();
  const [label, setLabel] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const wallet = await zuma.wallets.create({ label, ownerUserId, network: "testnet", type: "hot" });
      navigate(`/wallets/${wallet.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create wallet");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>New wallet</h1>
      <form onSubmit={onSubmit}>
        <label>
          Label
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Primary hot wallet" />
        </label>
        <label>
          Owner user id
          <input value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)} placeholder="user-123" />
        </label>
        {error && <p style={{ color: "crimson" }}>{error}</p>}
        <button type="submit" disabled={submitting || !label || !ownerUserId}>
          {submitting ? "Creating…" : "Create wallet"}
        </button>
      </form>
    </main>
  );
}
