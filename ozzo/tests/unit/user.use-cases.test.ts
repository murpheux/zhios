import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../src/domain';
import {
  CreateUserUseCase,
  FetchUserProfileUseCase,
  GetUserUseCase,
  UpdateUserUseCase,
} from '../../src/application/use-cases';
import { adminActor, otherActor, ownerActor, validUser } from '../fixtures/data';
import { createContext } from './support';

describe('user use-cases', () => {
  it('creates a user, normalizing email and taking externalId from the actor', async () => {
    const { users, kms } = createContext();
    const dto = await new CreateUserUseCase(users, kms).execute(validUser, ownerActor);
    expect(dto.email).toBe('jane.doe@example.com');
    expect(dto.externalId).toBe(ownerActor.sub);
  });

  it('rejects unknown fields (cannot spoof externalId)', async () => {
    const { users, kms } = createContext();
    await expect(
      new CreateUserUseCase(users, kms).execute({ ...validUser, externalId: 'x' }, ownerActor),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it.each([
    ['bad email', { email: 'nope' }],
    ['short username', { username: 'ab' }],
    ['blank display name', { identity: { displayName: '   ' } }],
  ])('rejects %s', async (_name, override) => {
    const { users, kms } = createContext();
    await expect(
      new CreateUserUseCase(users, kms).execute({ ...validUser, ...override }, ownerActor),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects double registration of the same identity', async () => {
    const { users, kms } = createContext();
    const uc = new CreateUserUseCase(users, kms);
    await uc.execute(validUser, ownerActor);
    await expect(
      uc.execute({ ...validUser, username: 'other', email: 'o@example.com' }, ownerActor),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('serves repeated lookups from cache', async () => {
    const ctx = createContext();
    const user = await new CreateUserUseCase(ctx.users, ctx.kms).execute(validUser, ownerActor);
    const get = new GetUserUseCase(ctx.access);
    await get.execute(user.id, ownerActor);
    await get.execute(user.id, ownerActor);
    expect(ctx.users.findByIdCalls).toBe(1);
  });

  it('enforces ownership, even on cache hits, but lets admins read', async () => {
    const ctx = createContext();
    const user = await new CreateUserUseCase(ctx.users, ctx.kms).execute(validUser, ownerActor);
    const get = new GetUserUseCase(ctx.access);
    await get.execute(user.id, ownerActor);
    await expect(get.execute(user.id, otherActor)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(get.execute(user.id, adminActor)).resolves.toMatchObject({ id: user.id });
  });

  it('404s for unknown users', async () => {
    const ctx = createContext();
    await expect(
      new GetUserUseCase(ctx.access).execute('00000000-0000-4000-8000-000000000000', adminActor),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('update invalidates the user cache', async () => {
    const ctx = createContext();
    const user = await new CreateUserUseCase(ctx.users, ctx.kms).execute(validUser, ownerActor);
    const get = new GetUserUseCase(ctx.access);
    await get.execute(user.id, ownerActor);
    await new UpdateUserUseCase(ctx.access, ctx.users, ctx.kms).execute(
      user.id,
      { identity: { displayName: 'Janet Doe' } },
      ownerActor,
    );
    const updated = await get.execute(user.id, ownerActor);
    expect(updated.dateOfBirth).toBeDefined(); // Check it's still a UserDto
  });

  it('rejects empty updates', async () => {
    const ctx = createContext();
    const user = await new CreateUserUseCase(ctx.users, ctx.kms).execute(validUser, ownerActor);
    await expect(
      new UpdateUserUseCase(ctx.access, ctx.users, ctx.kms).execute(user.id, {}, ownerActor),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('profile sums balances across accounts', async () => {
    const ctx = createContext();
    const user = await new CreateUserUseCase(ctx.users, ctx.kms).execute(validUser, ownerActor);
    for (const [n, balance] of [['11111111', 9007199254740993n], ['22222222', 7n]] as const) {
      const acc = await ctx.accounts.create({
        userId: user.id,
        accountNumber: n,
        accountType: 'checking',
        balance,
      });
      expect(acc.balance).toBe(balance);
    }
    const profile = await new FetchUserProfileUseCase(ctx.access, ctx.accounts).execute(user.id, ownerActor);
    expect(profile.accounts).toHaveLength(2);
    expect(profile.totalBalance).toBe('9007199254741000');
  });
});
