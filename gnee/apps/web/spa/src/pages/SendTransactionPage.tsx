import {
  type AmountUnit,
  describeZumaError,
  formatBtc,
  formatSats,
  humanizeEnum,
  type Network,
  type Wallet,
} from "@gnee/api-client";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useSendFlow } from "../hooks/useSendFlow";
import { useZuma } from "../ZumaProvider";

const ADDRESS_PLACEHOLDER: Record<Network, string> = { MAINNET: "bc1q…", TESTNET: "tb1q…", REGTEST: "bcrt1q…" };

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; wallet: Wallet | null };

export function SendTransactionPage() {
  const { walletId } = useParams<{ walletId: string }>();
  const zuma = useZuma();
  const navigate = useNavigate();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });

  const loadWallet = useCallback(() => {
    if (!walletId) return;
    setLoad({ status: "loading" });
    zuma.wallets
      .get(walletId)
      .then((wallet) => setLoad({ status: "ready", wallet }))
      .catch((err: unknown) => setLoad({ status: "error", message: describeZumaError(err, "Failed to load wallet") }));
  }, [zuma, walletId]);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  const wallet = load.status === "ready" ? load.wallet : null;
  const [state, flow] = useSendFlow({
    transactions: zuma.transactions,
    wallet,
    onSuccess: (tx) => navigate(`/wallets/${walletId}`, { state: { sentTransactionId: tx.id } }),
  });

  if (load.status === "loading") return <p>Loading…</p>;
  if (load.status === "error") {
    return (
      <main>
        <p role="alert" style={{ color: "crimson" }}>
          {load.message}
        </p>
        <button type="button" onClick={loadWallet}>
          Retry
        </button>
      </main>
    );
  }
  if (!wallet) return <p>Wallet not found.</p>;

  const { values, visibleErrors, step, draft } = state;
  const unitLabel = values.unit === "BTC" ? "BTC" : "sats";

  function onReview(e: React.FormEvent) {
    e.preventDefault();
    flow.review();
  }

  if ((step === "review" || step === "submitting" || step === "success") && draft) {
    const submitting = step === "submitting";
    return (
      <main>
        <h1>Review and confirm</h1>
        <dl>
          <dt>From</dt>
          <dd>{wallet.label}</dd>
          <dt>Network</dt>
          <dd>{humanizeEnum(draft.network)}</dd>
          <dt>Destination</dt>
          <dd style={{ fontFamily: "monospace", wordBreak: "break-all" }}>{draft.destinationAddress}</dd>
          <dt>Amount</dt>
          <dd>
            {formatBtc(draft.amountSats)} ({formatSats(draft.amountSats)})
          </dd>
          <dt>Fee rate</dt>
          <dd>{draft.feeRate} sat/vB</dd>
        </dl>
        <p>Bitcoin transactions can't be reversed. Check the address and amount carefully.</p>
        {state.submitError && (
          <p role="alert" style={{ color: "crimson" }}>
            {state.submitError}
          </p>
        )}
        <button type="button" onClick={() => flow.back()} disabled={submitting}>
          Back
        </button>{" "}
        <button type="button" onClick={() => void flow.confirm()} disabled={submitting || step === "success"}>
          {submitting ? "Sending…" : state.submitError ? "Retry send" : "Confirm and send"}
        </button>
      </main>
    );
  }

  return (
    <main>
      <h1>Send from {wallet.label}</h1>
      <p>
        Available: {formatBtc(wallet.balanceCache)} ({formatSats(wallet.balanceCache)}) · Network:{" "}
        {humanizeEnum(wallet.network)}
      </p>
      {state.blockedReason && (
        <p role="alert" style={{ color: "crimson" }}>
          {state.blockedReason}
        </p>
      )}
      <form onSubmit={onReview} noValidate>
        <div>
          <label htmlFor="send-destination">Destination address ({humanizeEnum(wallet.network)})</label>
          <input
            id="send-destination"
            value={values.destinationAddress}
            onChange={(e) => flow.setField("destinationAddress", e.target.value)}
            placeholder={ADDRESS_PLACEHOLDER[wallet.network]}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(visibleErrors.destinationAddress)}
            aria-describedby="send-destination-error"
          />
          <FieldError id="send-destination-error" message={visibleErrors.destinationAddress} />
        </div>

        <fieldset>
          <legend>Amount unit</legend>
          {(["BTC", "SATS"] as AmountUnit[]).map((unit) => (
            <label key={unit}>
              <input
                type="radio"
                name="amount-unit"
                value={unit}
                checked={values.unit === unit}
                onChange={() => flow.setUnit(unit)}
              />
              {unit === "BTC" ? "BTC" : "sats"}
            </label>
          ))}
        </fieldset>

        <div>
          <label htmlFor="send-amount">Amount ({unitLabel})</label>
          <input
            id="send-amount"
            value={values.amount}
            onChange={(e) => flow.setField("amount", e.target.value)}
            inputMode={values.unit === "BTC" ? "decimal" : "numeric"}
            placeholder={values.unit === "BTC" ? "0.0015" : "150000"}
            autoComplete="off"
            aria-invalid={Boolean(visibleErrors.amount)}
            aria-describedby="send-amount-hint send-amount-error"
          />
          <small id="send-amount-hint">
            {state.amountSats !== null
              ? values.unit === "BTC"
                ? `= ${formatSats(state.amountSats)}`
                : `= ${formatBtc(state.amountSats)}`
              : values.unit === "BTC"
                ? "Up to 8 decimal places"
                : "Whole satoshis (1 BTC = 100,000,000 sats)"}
          </small>
          <FieldError id="send-amount-error" message={visibleErrors.amount} />
        </div>

        <div>
          <label htmlFor="send-fee-rate">Fee rate (sat/vB)</label>
          <input
            id="send-fee-rate"
            value={values.feeRate}
            onChange={(e) => flow.setField("feeRate", e.target.value)}
            inputMode="numeric"
            aria-invalid={Boolean(visibleErrors.feeRate)}
            aria-describedby="send-fee-rate-error"
          />
          <FieldError id="send-fee-rate-error" message={visibleErrors.feeRate} />
        </div>

        {state.submitError && (
          <p role="alert" style={{ color: "crimson" }}>
            {state.submitError}
          </p>
        )}
        <Link to={`/wallets/${wallet.id}`}>Cancel</Link>{" "}
        <button type="submit" disabled={Boolean(state.blockedReason)}>
          Review send
        </button>
      </form>
    </main>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return (
    <p id={id} style={{ color: "crimson", margin: 0, minHeight: "1em" }}>
      {message ?? ""}
    </p>
  );
}
