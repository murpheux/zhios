import type { TransactionKind, TransactionLifecycleStatus } from '../value-objects/transaction-status';

// Core Transaction domain entity, independent of persistence/transport concerns.
export interface TransactionEntity {
  id: string;
  walletId: string;
  ownerUserId: string;
  idempotencyKey: string | null;
  txid: string | null;
  type: TransactionKind;
  amount: string;
  feeRate: string;
  status: TransactionLifecycleStatus;
  confirmations: number;
  rawTx: string | null;
  broadcastAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewTransactionProps {
  walletId: string;
  ownerUserId: string;
  idempotencyKey?: string | null;
  type: TransactionKind;
  amount: string;
  feeRate: string;
}

export const createTransactionEntity = (
  props: NewTransactionProps,
): Omit<TransactionEntity, 'id' | 'createdAt' | 'updatedAt'> => ({
  walletId: props.walletId,
  ownerUserId: props.ownerUserId,
  idempotencyKey: props.idempotencyKey ?? null,
  type: props.type,
  amount: props.amount,
  feeRate: props.feeRate,
  txid: null,
  rawTx: null,
  status: 'pending',
  confirmations: 0,
  broadcastAt: null,
});
