import { describeZumaError } from "./errors";
import { trackEvent } from "./error-tracking";
import { createIdempotencyKey } from "./idempotency";
import { type AmountUnit, convertAmountInput, parseAmountInput } from "./sats";
import type { TransactionsApi } from "./transactions";
import type { Network, Transaction, WalletStatus } from "./types";
import { type SendFormErrors, type SendFormField, validateSendForm } from "./validation";

/**
 * Headless, framework-agnostic send-transaction flow shared by web and mobile:
 *
 *   edit ──review()──▶ review ──confirm()──▶ submitting ──▶ success
 *     ▲                  │  ▲                    │
 *     └─────back()───────┘  └──── error ─────────┘
 *
 * One idempotency key is generated per review session (on entering review)
 * and reused for every confirm() retry, so a double-click, a retry after a
 * network error, or a lost response can never create a second send. back()
 * ends the session; the next review() gets a fresh key (the payload may differ).
 *
 * Exposes subscribe/getState so React binds it with useSyncExternalStore —
 * no React import here, so this module stays usable from any UI layer.
 */

export type SendStep = "edit" | "review" | "submitting" | "success";

export interface SendFormValues {
  destinationAddress: string;
  /** Raw amount text, in `unit`. */
  amount: string;
  unit: AmountUnit;
  /** sat/vB, raw text. */
  feeRate: string;
}

export interface SendFlowWallet {
  id: string;
  network: Network;
  /** Integer sats; when set, the amount is checked against it. */
  balanceCache?: string;
  status?: WalletStatus;
}

export interface SendDraft {
  walletId: string;
  network: Network;
  destinationAddress: string;
  amountSats: string;
  feeRate: string;
}

export interface SendFlowState {
  step: SendStep;
  wallet: SendFlowWallet | null;
  values: SendFormValues;
  /** Parsed amount in integer sats (null if the text doesn't parse). */
  amountSats: string | null;
  /** All current field errors. */
  errors: SendFormErrors;
  /** Errors for fields the user has touched (or all, after a review attempt) — render these. */
  visibleErrors: SendFormErrors;
  /** Non-field reason the form can't proceed (e.g. inactive wallet). */
  blockedReason: string | null;
  canReview: boolean;
  draft: SendDraft | null;
  idempotencyKey: string | null;
  submitError: string | null;
  submitErrorCode: string | null;
  result: Transaction | null;
}

export interface SendFlowOptions {
  transactions: Pick<TransactionsApi, "create">;
  wallet?: SendFlowWallet | null;
  /** Override the key generator (e.g. expo-crypto's randomUUID on React Native). */
  createKey?: () => string;
  initialValues?: Partial<SendFormValues>;
  onSuccess?: (transaction: Transaction) => void;
}

export interface SendFlowController {
  getState(): SendFlowState;
  subscribe(listener: () => void): () => void;
  setWallet(wallet: SendFlowWallet | null): void;
  setField(field: Exclude<keyof SendFormValues, "unit">, value: string): void;
  setUnit(unit: AmountUnit): void;
  /** Validates and, if valid, enters the review step with a fresh idempotency key. */
  review(): boolean;
  /** Leaves review (ending the idempotency session) to edit again. */
  back(): void;
  /** Submits the reviewed draft. No-op while a request is in flight. */
  confirm(): Promise<Transaction | null>;
  reset(): void;
}

const DEFAULT_VALUES: SendFormValues = { destinationAddress: "", amount: "", unit: "BTC", feeRate: "8" };
const NO_TOUCH: Record<SendFormField, boolean> = { destinationAddress: false, amount: false, feeRate: false };
const ALL_TOUCHED: Record<SendFormField, boolean> = { destinationAddress: true, amount: true, feeRate: true };

export function createSendFlow(options: SendFlowOptions): SendFlowController {
  const createKey = options.createKey ?? (() => createIdempotencyKey());
  const listeners = new Set<() => void>();
  const initialValues: SendFormValues = { ...DEFAULT_VALUES, ...options.initialValues };

  let wallet: SendFlowWallet | null = options.wallet ?? null;
  let values = initialValues;
  let touched = NO_TOUCH;
  let step: SendStep = "edit";
  let draft: SendDraft | null = null;
  let idempotencyKey: string | null = null;
  let submitError: string | null = null;
  let submitErrorCode: string | null = null;
  let result: Transaction | null = null;
  let inFlight = false;

  function compute(): SendFlowState {
    const amountSats = parseAmountInput(values.amount, values.unit);
    const { errors } = wallet
      ? validateSendForm({
          destinationAddress: values.destinationAddress,
          amountSats,
          feeRate: values.feeRate,
          network: wallet.network,
          balanceSats: wallet.balanceCache,
        })
      : { errors: {} as SendFormErrors };
    const visibleErrors: SendFormErrors = {};
    for (const field of Object.keys(errors) as SendFormField[]) {
      if (touched[field]) visibleErrors[field] = errors[field];
    }
    const blockedReason = !wallet
      ? "Wallet not loaded."
      : wallet.status && wallet.status !== "ACTIVE"
        ? "This wallet isn't active (suspended or archived), so it can't send."
        : null;
    return {
      step,
      wallet,
      values,
      amountSats,
      errors,
      visibleErrors,
      blockedReason,
      canReview: blockedReason === null && Object.keys(errors).length === 0,
      draft,
      idempotencyKey,
      submitError,
      submitErrorCode,
      result,
    };
  }

  let state = compute();
  function update() {
    state = compute();
    for (const listener of listeners) listener();
  }

  function clearSubmitError() {
    submitError = null;
    submitErrorCode = null;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setWallet(next) {
      wallet = next;
      update();
    },
    setField(field, value) {
      if (step !== "edit") return;
      values = { ...values, [field]: value };
      touched = { ...touched, [field]: true };
      clearSubmitError();
      update();
    },
    setUnit(unit) {
      if (step !== "edit" || unit === values.unit) return;
      values = { ...values, unit, amount: convertAmountInput(values.amount, values.unit, unit) };
      update();
    },
    review() {
      if (step !== "edit") return false;
      touched = ALL_TOUCHED;
      clearSubmitError();
      const current = compute();
      if (!current.canReview || !wallet || current.amountSats === null) {
        update();
        return false;
      }
      try {
        idempotencyKey = createKey();
      } catch {
        submitError = "This device can't generate a secure request id, so sending is disabled.";
        submitErrorCode = "NO_SECURE_RANDOM";
        update();
        return false;
      }
      draft = {
        walletId: wallet.id,
        network: wallet.network,
        destinationAddress: values.destinationAddress.trim(),
        amountSats: current.amountSats,
        feeRate: values.feeRate.trim(),
      };
      step = "review";
      update();
      return true;
    },
    back() {
      if (step !== "review") return;
      step = "edit";
      draft = null;
      idempotencyKey = null;
      clearSubmitError();
      update();
    },
    async confirm() {
      if (inFlight || step !== "review" || !draft || !idempotencyKey) return null;
      inFlight = true;
      step = "submitting";
      clearSubmitError();
      update();
      try {
        const tx = await options.transactions.create({
          walletId: draft.walletId,
          amount: draft.amountSats,
          feeRate: draft.feeRate,
          destinationAddress: draft.destinationAddress,
          idempotencyKey,
        });
        result = tx;
        step = "success";
        update();
        trackEvent("transaction_sent", { type: tx.type, status: tx.status });
        options.onSuccess?.(tx);
        return tx;
      } catch (err) {
        // Stay in review with the SAME key: retrying is safe and de-duplicated server-side.
        step = "review";
        submitError = describeZumaError(err);
        submitErrorCode =
          typeof err === "object" && err !== null && "code" in err && typeof err.code === "string"
            ? err.code
            : "UNKNOWN";
        update();
        return null;
      } finally {
        inFlight = false;
      }
    },
    reset() {
      values = initialValues;
      touched = NO_TOUCH;
      step = "edit";
      draft = null;
      idempotencyKey = null;
      result = null;
      clearSubmitError();
      update();
    },
  };
}
