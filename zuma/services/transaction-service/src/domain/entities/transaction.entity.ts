import type { TransactionKind, TransactionLifecycleStatus } from '../value-objects/transaction-status';

// Core Transaction domain entity, independent of persistence/transport concerns.
export interface TransactionEntity {
  id: string;
  walletId: string;
  ownerUserId: string;
  idempotencyKey: string | null;
  txid: string | null;
  type: TransactionKind;
  /** Satoshis, decimal string. */
  amount: string;
  /** sat/vB, decimal string. */
  feeRate: string;
  /** Total network fee in satoshis (decimal string) as computed by the node's build step. */
  feeSats: string;
  destinationAddress: string;
  status: TransactionLifecycleStatus;
  /** Machine-readable reason when status is 'failed' (e.g. INSUFFICIENT_FUNDS, BROADCAST_REJECTED). */
  failureReason: string | null;
  confirmations: number;
  rawTx: string | null;
  /** Set once wallet-service has debited amount + fee for this transaction; broadcast requires it. */
  debitedAt: Date | null;
  /** Set once a failed, debited transaction has been refunded to the wallet. */
  refundedAt: Date | null;
  broadcastAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewTransactionProps {
  walletId: string;
  ownerUserId: string;
  idempotencyKey: string;
  type: TransactionKind;
  amount: string;
  feeRate: string;
  feeSats: string;
  destinationAddress: string;
  rawTx: string;
}

// Total satoshis that leave the wallet for a send: amount + fee. Inputs are validated safe integers.
export const totalDebitSats = (tx: Pick<TransactionEntity, 'amount' | 'feeSats'>): number =>
  Number(tx.amount) + Number(tx.feeSats);
