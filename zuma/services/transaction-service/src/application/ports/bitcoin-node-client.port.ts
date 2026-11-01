import type { BitcoinNetwork } from '../../domain/value-objects/transaction-status';

// Builds, signs, broadcasts and tracks Bitcoin transactions against a node/custody backend.
export interface BuildTransactionInput {
  walletId: string;
  network: BitcoinNetwork;
  /** Satoshis. */
  amountSats: number;
  /** sat/vB. */
  feeRate: number;
  destinationAddress: string;
}

export interface BuiltTransaction {
  rawTx: string;
  /** Total fee in satoshis for the built transaction (feeRate x vsize). */
  feeSats: number;
}

export interface SignedTransaction {
  rawTx: string;
}

// Thrown by broadcast() when the node DEFINITIVELY rejected the transaction (it can never confirm), so
// the funds are safe to refund. Any other error means the outcome is unknown and must not be refunded.
export class BroadcastRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BroadcastRejectedError';
  }
}

export interface BitcoinNodeClientPort {
  build(input: BuildTransactionInput): Promise<BuiltTransaction>;
  sign(rawTx: string): Promise<SignedTransaction>;
  broadcast(rawTx: string): Promise<{ txid: string }>;
  // broadcastAt is passed in (DB-backed) rather than tracked in-memory, so this is safe across replicas.
  getConfirmations(txid: string, broadcastAt: Date | null): Promise<number>;
}
