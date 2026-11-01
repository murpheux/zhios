import { Schema } from 'mongoose';
import type { TransactionKind, TransactionLifecycleStatus } from '../../../domain/value-objects/transaction-status';

export interface TransactionDocumentShape {
  walletId: string;
  ownerUserId: string;
  idempotencyKey: string | null;
  txid: string | null;
  type: TransactionKind;
  amount: string;
  feeRate: string;
  feeSats: string;
  destinationAddress: string;
  status: TransactionLifecycleStatus;
  failureReason: string | null;
  confirmations: number;
  rawTx: string | null;
  debitedAt: Date | null;
  refundedAt: Date | null;
  broadcastAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const transactionSchema = new Schema<TransactionDocumentShape>(
  {
    walletId: { type: String, required: true },
    ownerUserId: { type: String, required: true },
    idempotencyKey: { type: String, default: null },
    txid: { type: String, default: null },
    type: { type: String, enum: ['send', 'receive', 'internal-transfer'], required: true },
    amount: { type: String, required: true, match: /^[1-9][0-9]{0,15}$/ },
    feeRate: { type: String, required: true },
    feeSats: { type: String, required: true, default: '0', match: /^(0|[1-9][0-9]{0,15})$/ },
    destinationAddress: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'broadcasting', 'broadcast', 'confirmed', 'failed'],
      default: 'pending',
    },
    failureReason: { type: String, default: null },
    confirmations: { type: Number, required: true, default: 0 },
    rawTx: { type: String, default: null },
    debitedAt: { type: Date, default: null },
    refundedAt: { type: Date, default: null },
    broadcastAt: { type: Date, default: null },
  },
  { timestamps: true },
);

transactionSchema.index({ ownerUserId: 1, createdAt: -1 });
transactionSchema.index({ walletId: 1, createdAt: -1 });
transactionSchema.index({ status: 1, updatedAt: 1 });
transactionSchema.index({ txid: 1 }, { unique: true, partialFilterExpression: { txid: { $type: 'string' } } });
transactionSchema.index(
  { ownerUserId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);
