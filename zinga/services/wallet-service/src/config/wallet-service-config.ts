import { z } from 'zod';
import { baseEnvSchema, loadConfig, refineBaseEnv, type BaseEnv } from '@zinga/shared-config';

export type WalletServiceConfig = BaseEnv & {
  SERVICE_NAME: string;
  TRANSACTION_SERVICE_URL: string;
  TRANSACTION_SERVICE_TIMEOUT_MS: number;
};

const walletServiceEnvSchema = baseEnvSchema
  .extend({
    SERVICE_NAME: z.string().min(1).default('wallet-service'),
    TRANSACTION_SERVICE_URL: z.string().default('http://localhost:3002'),
    TRANSACTION_SERVICE_TIMEOUT_MS: z.coerce.number().int().min(100).max(60000).default(5000),
  })
  .superRefine(refineBaseEnv);

export const loadWalletServiceConfig = (
  env: NodeJS.ProcessEnv = process.env,
): WalletServiceConfig => loadConfig(walletServiceEnvSchema, env);
