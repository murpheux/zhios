import type { WalletNetwork } from '../value-objects/network';
import type { WalletKind, WalletLifecycleStatus } from '../value-objects/wallet-status';

// Core Wallet domain entity, independent of persistence/transport concerns.
export interface WalletEntity {
  id: string;
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

export interface NewWalletProps {
  label: string;
  address: string;
  network: WalletNetwork;
  type: WalletKind;
  ownerUserId: string;
  metadata?: Record<string, unknown>;
}

export const createWalletEntity = (props: NewWalletProps): Omit<WalletEntity, 'id' | 'createdAt' | 'updatedAt'> => ({
  label: props.label,
  address: props.address,
  network: props.network,
  type: props.type,
  ownerUserId: props.ownerUserId,
  balanceCache: '0',
  metadata: props.metadata ?? {},
  status: 'active',
});
