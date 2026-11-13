import type { UserAccessDeps } from '../../src/application/user-access';
import { InMemoryCache } from '../../src/infrastructure/in-memory-cache';
import { MockKmsAdapter } from '../../src/infrastructure/mock-kms.adapter';
import { MockZumaClient } from '../../src/infrastructure/mock-zuma-client';
import { InMemoryBankAccountRepository, InMemoryUserRepository } from '../fixtures/in-memory-repositories';

export function createContext(ttl = 300) {
  const users = new InMemoryUserRepository();
  const accounts = new InMemoryBankAccountRepository();
  const cache = new InMemoryCache();
  const zuma = new MockZumaClient();
  const kms = new MockKmsAdapter('test');
  const access: UserAccessDeps = { users, cache, cacheTtlSeconds: ttl };
  return { users, accounts, cache, zuma, kms, access };
}
