import { model, type Model } from 'mongoose';
import { walletSchema, type WalletDocumentShape } from './wallet.schema';

export const WalletModel: Model<WalletDocumentShape> = model<WalletDocumentShape>(
  'Wallet',
  walletSchema,
);
