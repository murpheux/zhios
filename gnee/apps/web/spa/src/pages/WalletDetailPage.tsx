import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Transaction, Wallet } from "@gnee/api-client";
import { useZuma } from "../ZumaProvider";

export function WalletDetailPage() {
  const { walletId } = useParams<{ walletId: string }>();
  const zuma = useZuma();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!walletId) return;
    Promise.all([zuma.wallets.get(walletId), zuma.transactions.list({ walletId, page: 1, limit: 25 })])
      .then(([w, { items }]) => {
        setWallet(w);
        setTransactions(items);
      })
      .finally(() => setLoading(false));
  }, [zuma, walletId]);

  if (loading) return <p>Loading…</p>;
  if (!wallet) return <p>Wallet not found.</p>;

  return (
    <main>
      <h1>{wallet.label}</h1>
      <p>{wallet.address}</p>
      <p>
        {wallet.balanceCache} sats · {wallet.network}
      </p>
      <Link to={`/wallets/${wallet.id}/send`}>Send →</Link>

      <h2>Transactions</h2>
      <ul>
        {transactions.map((tx) => (
          <li key={tx.id}>
            {tx.type} · {tx.amount} sats · {tx.status} ({tx.confirmations} confirmations)
          </li>
        ))}
      </ul>
    </main>
  );
}
