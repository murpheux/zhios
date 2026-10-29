import { model, type Model } from 'mongoose';
import { transactionSchema, type TransactionDocumentShape } from './transaction.schema';

export const TransactionModel: Model<TransactionDocumentShape> = model<TransactionDocumentShape>(
  'Transaction',
  transactionSchema,
);
