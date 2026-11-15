import type { WalletNetwork } from '../value-objects/network';
import type { WalletKind, WalletLifecycleStatus } from '../value-objects/wallet-status';

// Core Wallet domain entity, independent of persistence/transport concerns.
export interface WalletEntity {
  id: string;
  label: string;
  address: string;
  network: WalletNetwork;
  type: WalletKind;
  /** Authoritative balance in integer satoshis, only ever changed via ledger movements. */
  balanceSats: number;
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

export const createWalletEntity = (
  props: NewWalletProps,
): Omit<WalletEntity, 'id' | 'createdAt' | 'updatedAt'> => ({
  label: props.label,
  address: props.address,
  network: props.network,
  type: props.type,
  ownerUserId: props.ownerUserId,
  balanceSats: 0,
  metadata: props.metadata ?? {},
  status: 'active',
});

// Only active wallets may send funds or be debited; suspended/archived wallets can still receive credits.
export const canBeDebited = (wallet: Pick<WalletEntity, 'status'>): boolean => wallet.status === 'active';
