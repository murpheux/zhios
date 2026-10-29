import { z } from 'zod';
import { baseEnvSchema, loadConfig, type BaseEnv } from '@zuma/shared-config';

export type GraphqlGatewayConfig = BaseEnv & {
  WALLET_SERVICE_URL: string;
  TRANSACTION_SERVICE_URL: string;
};

const graphqlGatewayEnvSchema = baseEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(3003),
  WALLET_SERVICE_URL: z.string().default('http://localhost:3001'),
  TRANSACTION_SERVICE_URL: z.string().default('http://localhost:3002'),
});

export const loadGraphqlGatewayConfig = (
  env: NodeJS.ProcessEnv = process.env,
): GraphqlGatewayConfig => loadConfig(graphqlGatewayEnvSchema, env);
