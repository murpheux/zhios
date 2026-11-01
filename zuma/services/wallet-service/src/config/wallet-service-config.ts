import { z } from 'zod';
import { baseEnvSchema, loadConfig, refineBaseEnv, type BaseEnv } from '@zuma/shared-config';

export type WalletServiceConfig = BaseEnv & {
  SERVICE_NAME: string;
  TRANSACTION_SERVICE_URL: string;
};

const walletServiceEnvSchema = baseEnvSchema
  .extend({
    SERVICE_NAME: z.string().min(1).default('wallet-service'),
    TRANSACTION_SERVICE_URL: z.string().default('http://localhost:3002'),
  })
  .superRefine(refineBaseEnv);

export const loadWalletServiceConfig = (
  env: NodeJS.ProcessEnv = process.env,
): WalletServiceConfig => loadConfig(walletServiceEnvSchema, env);
