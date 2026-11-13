import { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { AppDeps } from '../app';
import type { AppConfig } from '../config';
import { CryptoAccountNumberGenerator } from './crypto-account-number-generator';
import { HttpZumaClient } from './http-zuma-client';
import { MockZumaClient } from './mock-zuma-client';
import { OktaTokenVerifier } from './okta-token-verifier';
import { createPrismaClient } from './prisma-client';
import { PrismaBankAccountRepository } from './prisma-bank-account.repository';
import { PrismaUserRepository } from './prisma-user.repository';
import { RedisCache } from './redis-cache';
import { createServiceTokenSigner } from './service-token';

/** Builds the production adapters. Called only for dependencies the caller did not override. */
export function createDefaultDeps(config: AppConfig, logger: Logger): Required<AppDeps> {
  const prisma = createPrismaClient(config.databaseUrl);
  const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 2, lazyConnect: false });
  redis.on('error', (err) => logger.warn({ err }, 'redis error'));

  const signer = config.zuma.internalJwtSecret
    ? createServiceTokenSigner({
        secret: config.zuma.internalJwtSecret,
        issuer: config.zuma.internalJwtIssuer,
        serviceName: 'ozzo',
      })
    : undefined;

  return {
    users: new PrismaUserRepository(prisma),
    accounts: new PrismaBankAccountRepository(prisma),
    cache: new RedisCache(redis, logger),
    zuma: config.zuma.useMock
      ? new MockZumaClient()
      : new HttpZumaClient({
          baseUrl: config.zuma.baseUrl,
          timeoutMs: config.zuma.timeoutMs,
          signServiceToken: signer ? () => signer.sign(config.zuma.serviceName) : undefined,
        }),
    verifier: new OktaTokenVerifier(config.okta),
    accountNumbers: new CryptoAccountNumberGenerator(),
    readinessChecks: {
      postgres: async () => {
        await prisma.$queryRaw`SELECT 1`;
      },
      redis: async () => {
        await redis.ping();
      },
    },
    shutdown: async () => {
      await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
    },
  };
}
