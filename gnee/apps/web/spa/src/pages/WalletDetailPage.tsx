import { describeZumaError, formatBtc, formatSats, humanizeEnum, type Transaction, type Wallet } from "@gnee/api-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useZuma } from "../ZumaProvider";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; wallet: Wallet | null; transactions: Transaction[] };

export function WalletDetailPage() {
  const { walletId } = useParams<{ walletId: string }>();
  const location = useLocation();
  const sentTransactionId = (location.state as { sentTransactionId?: string } | null)?.sentTransactionId;
  const zuma = useZuma();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);

  const fetchAll = useCallback(
    (background: boolean) => {
      if (!walletId) return;
      const id = ++requestId.current;
      if (background) setRefreshing(true);
      else setLoad({ status: "loading" });
      Promise.all([zuma.wallets.get(walletId), zuma.transactions.list({ walletId, page: 1, limit: 25 })])
        .then(([wallet, { items }]) => {
          if (id === requestId.current) setLoad({ status: "ready", wallet, transactions: items });
        })
        .catch((err: unknown) => {
          if (id === requestId.current) {
            setLoad({ status: "error", message: describeZumaError(err, "Failed to load wallet") });
          }
        })
        .finally(() => {
          if (id === requestId.current) setRefreshing(false);
        });
    },
    [zuma, walletId]
  );

  useEffect(() => {
    fetchAll(false);
  }, [fetchAll]);

  // Refresh in the background when the tab regains focus (balances move while you're away).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchAll(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchAll]);

  if (load.status === "loading") return <p>Loading…</p>;
  if (load.status === "error") {
    return (
      <main>
        <p role="alert" style={{ color: "crimson" }}>
          {load.message}
        </p>
        <button type="button" onClick={() => fetchAll(false)}>
          Retry
        </button>{" "}
        <Link to="/">Back to wallets</Link>
      </main>
    );
  }
  const { wallet, transactions } = load;
  if (!wallet) {
    return (
      <main>
        <p>Wallet not found.</p>
        <Link to="/">Back to wallets</Link>
      </main>
    );
  }

  return (
    <main>
      <Link to="/">← Wallets</Link>
      <h1>{wallet.label}</h1>
      <p style={{ fontFamily: "monospace", wordBreak: "break-all" }}>{wallet.address}</p>
      <p>
        <strong>{formatBtc(wallet.balanceCache)}</strong> ({formatSats(wallet.balanceCache)}) ·{" "}
        {humanizeEnum(wallet.network)} · {humanizeEnum(wallet.status)}
      </p>
      {sentTransactionId && (
        <p role="status" style={{ color: "seagreen" }}>
          Transaction submitted. It will update here as it's broadcast and confirmed.
        </p>
      )}
      <Link to={`/wallets/${wallet.id}/send`}>Send →</Link>{" "}
      <button type="button" onClick={() => fetchAll(true)} disabled={refreshing}>
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>

      <h2>Transactions</h2>
      {transactions.length === 0 ? (
        <p>No transactions yet.</p>
      ) : (
        <ul>
          {transactions.map((tx) => (
            <li key={tx.id}>
              {humanizeEnum(tx.type)} · {formatBtc(tx.amount)} · {humanizeEnum(tx.status)} ({tx.confirmations}{" "}
              confirmations)
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
