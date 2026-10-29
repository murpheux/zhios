import { z } from 'zod';
import { baseEnvSchema, loadConfig, type BaseEnv } from '@zuma/shared-config';

export type WalletServiceConfig = BaseEnv & {
  TRANSACTION_SERVICE_URL: string;
};

const walletServiceEnvSchema = baseEnvSchema.extend({
  TRANSACTION_SERVICE_URL: z.string().default('http://localhost:3002'),
});

export const loadWalletServiceConfig = (
  env: NodeJS.ProcessEnv = process.env,
): WalletServiceConfig => loadConfig(walletServiceEnvSchema, env);
