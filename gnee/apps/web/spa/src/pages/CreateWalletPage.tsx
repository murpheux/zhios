import { describeZumaError, humanizeEnum, NETWORKS, type Network, WALLET_TYPES, type WalletType } from "@gnee/api-client";
import type React from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useZuma } from "../ZumaProvider";

/** The owner is always the signed-in user (taken from the access token server-side). */
export function CreateWalletPage() {
  const zuma = useZuma();
  const navigate = useNavigate();
  const [label, setLabel] = useState("");
  const [network, setNetwork] = useState<Network>("TESTNET");
  const [type, setType] = useState<WalletType>("HOT");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const wallet = await zuma.wallets.create({ label: label.trim(), network, type });
      navigate(`/wallets/${wallet.id}`);
    } catch (err) {
      setError(describeZumaError(err, "Failed to create wallet"));
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
        <label htmlFor="wallet-network">Network</label>
        <select id="wallet-network" value={network} onChange={(e) => setNetwork(e.target.value as Network)}>
            {NETWORKS.map((n) => (
              <option key={n} value={n}>
                {humanizeEnum(n)}
              </option>
          ))}
        </select>
        <label htmlFor="wallet-type">Type</label>
        <select id="wallet-type" value={type} onChange={(e) => setType(e.target.value as WalletType)}>
            {WALLET_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanizeEnum(t)}
              </option>
          ))}
        </select>
        {error && (
          <p role="alert" style={{ color: "crimson" }}>
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting || !label.trim()}>
          {submitting ? "Creating…" : "Create wallet"}
        </button>
      </form>
    </main>
  );
}
