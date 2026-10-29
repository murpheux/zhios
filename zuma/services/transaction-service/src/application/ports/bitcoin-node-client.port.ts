// Builds, signs, broadcasts and tracks Bitcoin transactions against a node/custody backend.
export interface BuildTransactionInput {
  walletId: string;
  amount: string;
  feeRate: string;
  destinationAddress: string;
}

export interface SignedTransaction {
  rawTx: string;
}

export interface BitcoinNodeClientPort {
  build(input: BuildTransactionInput): Promise<SignedTransaction>;
  sign(rawTx: string): Promise<SignedTransaction>;
  broadcast(rawTx: string): Promise<{ txid: string }>;
  // broadcastAt is passed in (DB-backed) rather than tracked in-memory, so this is safe across replicas.
  getConfirmations(txid: string, broadcastAt: Date | null): Promise<number>;
}
