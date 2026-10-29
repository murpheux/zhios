import { Schema } from 'mongoose';
import type { WalletNetwork } from '../../../domain/value-objects/network';
import type { WalletKind, WalletLifecycleStatus } from '../../../domain/value-objects/wallet-status';

export interface WalletDocumentShape {
  label: string;
  address: string;
  network: WalletNetwork;
  type: WalletKind;
  balanceCache: string;
  metadata: Record<string, unknown>;
  ownerUserId: string;
  status: WalletLifecycleStatus;
  createdAt: Date;
  updatedAt: Date;
}

export const walletSchema = new Schema<WalletDocumentShape>(
  {
    label: { type: String, required: true, trim: true },
    address: { type: String, required: true, unique: true, index: true },
    network: { type: String, enum: ['mainnet', 'testnet', 'regtest'], required: true },
    type: { type: String, enum: ['hot', 'cold', 'custodial', 'non-custodial'], required: true },
    balanceCache: { type: String, required: true, default: '0' },
    metadata: { type: Schema.Types.Mixed, default: {} },
    ownerUserId: { type: String, required: true, index: true },
    status: { type: String, enum: ['active', 'suspended', 'archived'], default: 'active' },
  },
  { timestamps: true },
);
