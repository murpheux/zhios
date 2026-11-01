import { z } from 'zod';
import { baseEnvSchema, loadConfig, refineBaseEnv, type BaseEnv } from '@zuma/shared-config';

export type GraphqlGatewayConfig = BaseEnv & {
  SERVICE_NAME: string;
  WALLET_SERVICE_URL: string;
  TRANSACTION_SERVICE_URL: string;
  UPSTREAM_TIMEOUT_MS: number;
  GRAPHQL_QUERY_DEPTH: number;
  GRAPHQL_INTROSPECTION_ENABLED?: boolean;
};

const graphqlGatewayEnvSchema = baseEnvSchema
  .extend({
    PORT: z.coerce.number().int().positive().default(3003),
    SERVICE_NAME: z.string().min(1).default('graphql-gateway'),
    WALLET_SERVICE_URL: z.string().default('http://localhost:3001'),
    TRANSACTION_SERVICE_URL: z.string().default('http://localhost:3002'),
    // Per-request timeout for every upstream REST call.
    UPSTREAM_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    GRAPHQL_QUERY_DEPTH: z.coerce.number().int().positive().default(8),
    // Defaults to on outside production, off in production.
    GRAPHQL_INTROSPECTION_ENABLED: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === 'true')),
  })
  .superRefine(refineBaseEnv);

export const loadGraphqlGatewayConfig = (
  env: NodeJS.ProcessEnv = process.env,
): GraphqlGatewayConfig => loadConfig(graphqlGatewayEnvSchema, env);
