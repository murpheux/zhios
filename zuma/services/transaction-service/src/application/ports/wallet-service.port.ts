import type { BitcoinNetwork } from '../../domain/value-objects/transaction-status';

export type WalletStatus = 'active' | 'suspended' | 'archived';

// Facts transaction-service needs to make its own explicit ownership/status/network decision.
export interface WalletSummary {
  id: string;
  ownerUserId: string;
  status: WalletStatus;
  network: BitcoinNetwork;
  address: string;
}

export interface WalletMovementRequest {
  walletId: string;
  /** This service's transaction id — the idempotency key for the movement in wallet-service. */
  transactionId: string;
  /** Satoshis, decimal string. */
  amountSats: string;
}

export type WalletMovementRejection =
  | 'INSUFFICIENT_FUNDS'
  | 'WALLET_NOT_ACTIVE'
  | 'WALLET_NOT_FOUND'
  | 'IDEMPOTENCY_CONFLICT'
  | 'REFUND_WITHOUT_DEBIT';

// Definitive outcomes only; transport failures/unknown outcomes are thrown so callers can retry safely.
export type WalletMovementResult =
  | { ok: true; balanceCache: string }
  | { ok: false; code: WalletMovementRejection; message: string };

// Port onto wallet-service's service-only (/internal) API, authenticated with a service token.
export interface WalletServicePort {
  getWallet(walletId: string): Promise<WalletSummary | null>;
  debit(request: WalletMovementRequest): Promise<WalletMovementResult>;
  refund(request: WalletMovementRequest): Promise<WalletMovementResult>;
}
