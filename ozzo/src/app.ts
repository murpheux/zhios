import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import { accountRoutes } from './api/routes/accounts.routes';
import { userRoutes } from './api/routes/users.routes';
import { walletRoutes } from './api/routes/wallet.routes';
import { createAuthHook } from './api/middleware/auth';
import { registerErrorHandler } from './api/middleware/error-handler';
import { registerSwagger } from './api/middleware/swagger';
import type {
  AccountNumberGenerator,
  BankAccountRepository,
  CachePort,
  SensitiveDataPort,
  TokenVerifier,
  UserRepository,
  ZumaClient,
} from './application/ports';
import {
  CreateUserUseCase,
  DeleteBankAccountUseCase,
  FetchUserProfileUseCase,
  GetBankAccountUseCase,
  GetUserUseCase,
  LinkBankAccountUseCase,
  ListBankAccountsUseCase,
  SyncWalletUseCase,
  UpdateBankAccountUseCase,
  UpdateUserUseCase,
} from './application/use-cases';
import type { AppConfig } from './config';

export interface AppDeps {
  users: UserRepository;
  accounts: BankAccountRepository;
  cache: CachePort;
  sensitiveData: SensitiveDataPort;
  zuma: ZumaClient;
  verifier: TokenVerifier;
  accountNumbers: AccountNumberGenerator;
  /** name -> probe; a rejection marks /readyz as 503. */
  readinessChecks?: Record<string, () => Promise<void>>;
  /** Releases connections on server close. */
  shutdown?: () => Promise<void>;
}

const CORE_DEPS: (keyof AppDeps)[] = ['users', 'accounts', 'cache', 'sensitiveData', 'zuma', 'verifier', 'accountNumbers'];

/** Composition root. Pass overrides (all core deps) in tests; production adapters are built otherwise. */
export async function buildApp(
  config: AppConfig,
  logger: Logger,
  overrides: Partial<AppDeps> = {},
): Promise<FastifyInstance> {
  let deps = overrides as AppDeps;
  if (!CORE_DEPS.every((k) => overrides[k])) {
    const { createDefaultDeps } = await import('./infrastructure/default-deps');
    deps = { ...createDefaultDeps(config, logger), ...overrides };
  }

  const app = Fastify({ loggerInstance: logger as FastifyBaseLogger, trustProxy: true });
  registerErrorHandler(app);
  await registerSwagger(app);

  const access = { users: deps.users, cache: deps.cache, cacheTtlSeconds: config.cacheTtlSeconds };

  app.get('/healthz', { schema: { hide: true } }, async () => ({ status: 'ok' }));
  app.get('/readyz', { schema: { hide: true } }, async (_req, reply) => {
    const results: Record<string, string> = {};
    for (const [name, check] of Object.entries(deps.readinessChecks ?? {})) {
      try {
        await check();
        results[name] = 'ok';
      } catch (err) {
        app.log.warn({ err, check: name }, 'readiness check failed');
        results[name] = 'fail';
      }
    }
    const ready = Object.values(results).every((r) => r === 'ok');
    return reply.code(ready ? 200 : 503).send({ status: ready ? 'ready' : 'unready', checks: results });
  });

  await app.register(async (secured) => {
    secured.decorateRequest('actor', null as never);
    secured.addHook('onRequest', createAuthHook(deps.verifier, config.okta.adminGroup));

    await secured.register(userRoutes, {
      createUser: new CreateUserUseCase(deps.users, deps.sensitiveData),
      getUser: new GetUserUseCase(access),
      fetchProfile: new FetchUserProfileUseCase(access, deps.accounts),
      updateUser: new UpdateUserUseCase(access, deps.users, deps.sensitiveData),
    });
    await secured.register(accountRoutes, {
      linkAccount: new LinkBankAccountUseCase(access, deps.accounts, deps.accountNumbers),
      listAccounts: new ListBankAccountsUseCase(access, deps.accounts),
      getAccount: new GetBankAccountUseCase(access, deps.accounts),
      updateAccount: new UpdateBankAccountUseCase(access, deps.accounts),
      deleteAccount: new DeleteBankAccountUseCase(access, deps.accounts),
    });
    await secured.register(walletRoutes, {
      syncWallet: new SyncWalletUseCase(access, deps.cache, deps.zuma),
    });
  });

  if (deps.shutdown) {
    const shutdown = deps.shutdown;
    app.addHook('onClose', async () => shutdown());
  }
  return app;
}
