export type SupportedBitcoinNetwork = 'mainnet' | 'testnet' | 'regtest';

export type WalletType = 'hot' | 'cold' | 'custodial' | 'non-custodial';

export type WalletStatus = 'active' | 'suspended' | 'archived';

export interface WalletDto {
  id: string;
  label: string;
  address: string;
  network: SupportedBitcoinNetwork;
  type: WalletType;
  balanceCache: string;
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
