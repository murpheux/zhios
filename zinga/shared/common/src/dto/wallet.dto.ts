export type SupportedBitcoinNetwork = 'mainnet' | 'testnet' | 'regtest';

export type WalletType = 'hot' | 'cold' | 'custodial' | 'non-custodial';

export type WalletStatus = 'active' | 'suspended' | 'archived';

import type { SatsAmount } from './transaction.dto';

export interface WalletDto {
  id: string;
  label: string;
  address: string;
  network: SupportedBitcoinNetwork;
  type: WalletType;
  /** Integer satoshis as a string. */
  balanceCache: SatsAmount;
  metadata: Record<string, unknown>;
  ownerUserId: string;
  status: WalletStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWalletDto {
  label: string;
  network: SupportedBitcoinNetwork;
  type: WalletType;
  metadata?: Record<string, unknown>;
}

export interface UpdateWalletMetadataDto {
  label?: string;
  metadata?: Record<string, unknown>;
}
