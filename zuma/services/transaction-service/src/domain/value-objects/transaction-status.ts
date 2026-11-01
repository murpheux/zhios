export type TransactionKind = 'send' | 'receive' | 'internal-transfer';

// pending --(CAS)--> broadcasting --(CAS)--> broadcast --(CAS)--> confirmed
//    \                    \
//     `-> failed (debit)   `-> failed (node rejected; refund issued)
export type TransactionLifecycleStatus = 'pending' | 'broadcasting' | 'broadcast' | 'confirmed' | 'failed';

export type BitcoinNetwork = 'mainnet' | 'testnet' | 'regtest';
