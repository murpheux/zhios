// Lambda entrypoint for wallet-service behind API Gateway (see infrastructure/aws/terraform/lambda.tf).
import awsLambdaFastify from '@fastify/aws-lambda';
import type { Handler } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { createLogger } from '@zuma/shared-logging';
import { loadWalletServiceConfig } from './config/wallet-service-config';
import { connectMongo } from './infrastructure/mongo/mongo-connection';
import { buildApp } from './app';

let cachedHandler: Handler | undefined;

// Resolves JWT_SECRET/MONGODB_URI from Secrets Manager/SSM at cold start when ARNs are configured.
const hydrateSecretsFromAws = async (): Promise<void> => {
  const secretsByEnvName: Array<[target: string, arn: string | undefined]> = [
    ['JWT_SECRET', process.env.JWT_SECRET_ARN],
    ['INTERNAL_JWT_SECRET', process.env.INTERNAL_JWT_SECRET_ARN],
  ];
  const secretsClient = new SecretsManagerClient({});
  for (const [target, arn] of secretsByEnvName) {
    if (!arn) continue;
    const result = await secretsClient.send(new GetSecretValueCommand({ SecretId: arn }));
    if (!result.SecretString) {
      throw new Error(`Secrets Manager secret for ${target} has no SecretString`);
    }
    process.env[target] = result.SecretString;
  }

  const parameterName = process.env.MONGODB_URI_PARAMETER_NAME;
  if (parameterName) {
    const client = new SSMClient({});
    const result = await client.send(
      new GetParameterCommand({ Name: parameterName, WithDecryption: true }),
    );
    if (result.Parameter?.Value) {
      process.env.MONGODB_URI = result.Parameter.Value;
    }
  }
};

const getHandler = async (): Promise<Handler> => {
  if (cachedHandler) {
    return cachedHandler;
  }

  await hydrateSecretsFromAws();

  const config = loadWalletServiceConfig();
  const logger = createLogger({ serviceName: config.SERVICE_NAME, level: config.LOG_LEVEL });

  // Small pool size: Lambda instances are short-lived and run one invocation at a time.
  await connectMongo(config.MONGODB_URI, logger, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 });
  const app = await buildApp({ config, logger });

  // @fastify/aws-lambda expects FastifyBaseLogger; our pino instance is runtime-compatible but typed
  // differently (both wrap pino) — safe to assert here, only within this one AWS integration boundary.
  const lambdaHandler = awsLambdaFastify(app as unknown as Parameters<typeof awsLambdaFastify>[0]);
  cachedHandler = lambdaHandler;
  return lambdaHandler;
};

export const handler: Handler = async (event, context, callback) => {
  const lambdaHandler = await getHandler();
  return lambdaHandler(event, context, callback);
};
