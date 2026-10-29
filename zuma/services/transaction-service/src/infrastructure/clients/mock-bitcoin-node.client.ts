import { randomBytes } from 'node:crypto';
import type {
  BitcoinNodeClientPort,
  BuildTransactionInput,
  SignedTransaction,
} from '../../application/ports/bitcoin-node-client.port';

// MOCK Bitcoin node client for local/test use only.
// Production must integrate a real Bitcoin Core RPC / custody provider with HSM/KMS-backed signing — no real key material here.
export class MockBitcoinNodeClient implements BitcoinNodeClientPort {
  async build(input: BuildTransactionInput): Promise<SignedTransaction> {
    // Fakes a raw unsigned tx hex; a real impl would select UTXOs and construct a PSBT.
    const rawTx = `rawtx:${input.walletId}:${input.amount}:${randomBytes(8).toString('hex')}`;
    return { rawTx };
  }

  async sign(rawTx: string): Promise<SignedTransaction> {
    // Fakes signing in place; a real impl would send the PSBT to an HSM/KMS signer.
    return { rawTx: `${rawTx}:signed` };
  }

  async broadcast(_rawTx: string): Promise<{ txid: string }> {
    const txid = randomBytes(32).toString('hex');
    return { txid };
  }

  async getConfirmations(_txid: string, broadcastAt: Date | null): Promise<number> {
    // Simulates confirmations accruing over time since broadcast, ~1 per 10s, capped at 6.
    // Derived from the DB-stored broadcastAt (not in-memory) so it's correct across replicas.
    if (!broadcastAt) {
      return 0;
    }
    const elapsedSeconds = (Date.now() - broadcastAt.getTime()) / 1000;
    return Math.min(6, Math.floor(elapsedSeconds / 10));
  }
}
