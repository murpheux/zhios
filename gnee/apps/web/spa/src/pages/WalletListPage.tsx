import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Wallet } from "@gnee/api-client";
import { useZuma } from "../ZumaProvider";
import { useAuth } from "../auth/AuthContext";

export function WalletListPage() {
  const zuma = useZuma();
  const { user, logout } = useAuth();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    zuma.wallets
      .list({ page: 1, limit: 25 })
      .then(({ items }) => setWallets(items))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load wallets"))
      .finally(() => setLoading(false));
  }, [zuma]);

  return (
    <main>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Wallets</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link to="/wallets/new">+ New wallet</Link>
          <span>{user?.profile.email ?? user?.profile.sub}</span>
          <button onClick={() => logout()}>Sign out</button>
        </div>
      </header>

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <ul>
        {wallets.map((wallet) => (
          <li key={wallet.id}>
            <Link to={`/wallets/${wallet.id}`}>
              {wallet.label} — {wallet.balanceCache} sats ({wallet.network})
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
