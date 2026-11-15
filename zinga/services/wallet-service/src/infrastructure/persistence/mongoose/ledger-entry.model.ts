import { model, type Model } from 'mongoose';
import { ledgerEntrySchema, type LedgerEntryDocumentShape } from './ledger-entry.schema';

export const LedgerEntryModel: Model<LedgerEntryDocumentShape> = model<LedgerEntryDocumentShape>(
  'LedgerEntry',
  ledgerEntrySchema,
);
