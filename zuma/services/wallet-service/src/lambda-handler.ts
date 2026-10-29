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
  const secretArn = process.env.JWT_SECRET_ARN;
  if (secretArn) {
    const client = new SecretsManagerClient({});
    const result = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
    if (result.SecretString) {
      process.env.JWT_SECRET = result.SecretString;
    }
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
  const logger = createLogger({ serviceName: 'wallet-service', level: config.LOG_LEVEL });

  // Small pool size: Lambda instances are short-lived and run one invocation at a time.
  await connectMongo(config.MONGODB_URI, logger, { maxPoolSize: 5 });
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
