import { Schema } from 'mongoose';
import type {
  LedgerEntryKind,
  LedgerEntryReason,
  LedgerEntryState,
} from '../../../domain/entities/ledger-entry.entity';

export interface LedgerEntryDocumentShape {
  walletId: string;
  transactionId: string;
  kind: LedgerEntryKind;
  reason: LedgerEntryReason;
  amountSats: number;
  state: LedgerEntryState;
  balanceAfterSats: number | null;
  createdAt: Date;
}

export const ledgerEntrySchema = new Schema<LedgerEntryDocumentShape>(
  {
    walletId: { type: String, required: true },
    transactionId: { type: String, required: true },
    kind: { type: String, enum: ['debit', 'credit'], required: true },
    reason: { type: String, enum: ['send', 'refund', 'deposit'], required: true },
    amountSats: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isSafeInteger, message: 'amountSats must be a safe integer' },
    },
    state: { type: String, enum: ['pending', 'applied'], required: true, default: 'pending' },
    balanceAfterSats: { type: Number, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Idempotency + audit: exactly one movement per (transaction, direction, reason).
ledgerEntrySchema.index({ transactionId: 1, kind: 1, reason: 1 }, { unique: true });
ledgerEntrySchema.index({ walletId: 1, createdAt: -1 });
