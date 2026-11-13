import { CreateUserUseCase, SyncWalletUseCase } from '../../src/application/use-cases';
import { InMemoryCache } from '../../src/infrastructure/in-memory-cache';
import { ForbiddenError, UpstreamError } from '../../src/domain';
import type { ZumaClient } from '../../src/application/ports';
import { otherActor, ownerActor, validUser } from '../fixtures/data';
import { createContext } from './support';

describe('SyncWalletUseCase', () => {
  it('fetches from zuma once, then serves from cache within the TTL', async () => {
    const ctx = createContext();
    const user = await new CreateUserUseCase(ctx.users).execute(validUser, ownerActor);
    const uc = new SyncWalletUseCase(ctx.access, ctx.cache, ctx.zuma);

    const first = await uc.execute(user.id, ownerActor);
    const second = await uc.execute(user.id, ownerActor);

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.fetchedAt).toBe(first.fetchedAt);
    expect(ctx.zuma.calls).toBe(1);
    expect(first.wallets[0]?.ownerUserId).toBe(ownerActor.sub);
  });

  it('refetches after the TTL expires', async () => {
    let now = 1_000_000;
    const ctx = createContext(300);
    const cache = new InMemoryCache(() => now);
    const access = { ...ctx.access, cache };
    const user = await new CreateUserUseCase(ctx.users).execute(validUser, ownerActor);
    const uc = new SyncWalletUseCase(access, cache, ctx.zuma);

    await uc.execute(user.id, ownerActor);
    now += 299_000;
    expect((await uc.execute(user.id, ownerActor)).cached).toBe(true);
    now += 2_000;
    expect((await uc.execute(user.id, ownerActor)).cached).toBe(false);
    expect(ctx.zuma.calls).toBe(2);
  });

  it('checks ownership before touching cache or zuma', async () => {
    const ctx = createContext();
    const user = await new CreateUserUseCase(ctx.users).execute(validUser, ownerActor);
    const uc = new SyncWalletUseCase(ctx.access, ctx.cache, ctx.zuma);
    await expect(uc.execute(user.id, otherActor)).rejects.toBeInstanceOf(ForbiddenError);
    expect(ctx.zuma.calls).toBe(0);
  });

  it('propagates upstream failures without caching them', async () => {
    const ctx = createContext();
    const user = await new CreateUserUseCase(ctx.users).execute(validUser, ownerActor);
    const failing: ZumaClient = {
      listWalletsByOwner: jest.fn().mockRejectedValue(new UpstreamError('down')),
    };
    const uc = new SyncWalletUseCase(ctx.access, ctx.cache, failing);
    await expect(uc.execute(user.id, ownerActor)).rejects.toBeInstanceOf(UpstreamError);
    await expect(uc.execute(user.id, ownerActor)).rejects.toBeInstanceOf(UpstreamError);
    expect(failing.listWalletsByOwner).toHaveBeenCalledTimes(2);
  });
});
