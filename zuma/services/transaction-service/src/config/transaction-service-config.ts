import { z } from 'zod';
import { baseEnvSchema, loadConfig, refineBaseEnv, type BaseEnv } from '@zuma/shared-config';

export type TransactionServiceConfig = BaseEnv & {
  SERVICE_NAME: string;
  WALLET_SERVICE_URL: string;
  BITCOIN_NETWORK: 'mainnet' | 'testnet' | 'regtest';
  BITCOIN_ADAPTER: 'mock' | 'rpc';
};

const transactionServiceEnvSchema = baseEnvSchema
  .extend({
    SERVICE_NAME: z.string().min(1).default('transaction-service'),
    WALLET_SERVICE_URL: z.string().default('http://localhost:3001'),
    BITCOIN_NETWORK: z.enum(['mainnet', 'testnet', 'regtest']).default('testnet'),
    BITCOIN_ADAPTER: z.enum(['mock', 'rpc']).default('mock'),
  })
  .superRefine(refineBaseEnv);

export const loadTransactionServiceConfig = (
  env: NodeJS.ProcessEnv = process.env,
): TransactionServiceConfig => {
  const config = loadConfig(transactionServiceEnvSchema, env);
  // A mock signer must never run in production — fail fast at startup rather than silently fake-sign.
  if (config.NODE_ENV === 'production' && config.BITCOIN_ADAPTER === 'mock') {
    throw new Error('BITCOIN_ADAPTER=mock is not permitted when NODE_ENV=production');
  }
  return config;
};
