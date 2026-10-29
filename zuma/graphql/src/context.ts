import type { WalletServiceClient } from './clients/wallet-service.client';
import type { TransactionServiceClient } from './clients/transaction-service.client';

// Per-request context shared by all resolvers; carries upstream clients and the caller's bearer token.
export interface GatewayContext {
  walletServiceClient: WalletServiceClient;
  transactionServiceClient: TransactionServiceClient;
  authorization?: string;
}

// Merges our custom fields into mercurius's own MercuriusContext so resolvers can type ctx as one thing.
declare module 'mercurius' {
  interface MercuriusContext {
    walletServiceClient: WalletServiceClient;
    transactionServiceClient: TransactionServiceClient;
    authorization?: string;
  }
}
