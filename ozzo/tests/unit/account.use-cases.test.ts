import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../src/domain';
import {
  CreateUserUseCase,
  DeleteBankAccountUseCase,
  GetBankAccountUseCase,
  LinkBankAccountUseCase,
  ListBankAccountsUseCase,
  UpdateBankAccountUseCase,
} from '../../src/application/use-cases';
import { otherActor, ownerActor, validUser } from '../fixtures/data';
import { createContext } from './support';

async function setup() {
  const ctx = createContext();
  const user = await new CreateUserUseCase(ctx.users, ctx.kms).execute(validUser, ownerActor);
  let counter = 10_000_000;
  const numbers = { generate: () => String(++counter) };
  const link = new LinkBankAccountUseCase(ctx.access, ctx.accounts, numbers);
  return { ...ctx, user, link, numbers };
}

describe('bank account use-cases', () => {
  it('links an account with a generated number and zero balance', async () => {
    const { link, user } = await setup();
    const acc = await link.execute(user.id, { accountType: 'savings' }, ownerActor);
    expect(acc).toMatchObject({ accountType: 'savings', balance: '0', userId: user.id });
    expect(acc.accountNumber).toMatch(/^\d{8,17}$/);
  });

  it('retries generated number collisions', async () => {
    const ctx = await setup();
    await ctx.link.execute(ctx.user.id, { accountType: 'checking', accountNumber: '10000001' }, ownerActor);
    // generator yields 10000001 first (collision), then 10000002
    const acc = await ctx.link.execute(ctx.user.id, { accountType: 'checking' }, ownerActor);
    expect(acc.accountNumber).toBe('10000002');
  });

  it('does not retry on explicit duplicate numbers', async () => {
    const { link, user } = await setup();
    const body = { accountType: 'checking', accountNumber: '12345678' };
    await link.execute(user.id, body, ownerActor);
    await expect(link.execute(user.id, body, ownerActor)).rejects.toBeInstanceOf(ConflictError);
  });

  it.each([
    ['invalid type', { accountType: 'brokerage' }],
    ['invalid number', { accountType: 'checking', accountNumber: 'abc' }],
  ])('rejects %s', async (_n, body) => {
    const { link, user } = await setup();
    await expect(link.execute(user.id, body, ownerActor)).rejects.toBeInstanceOf(ValidationError);
  });

  it('forbids other users', async () => {
    const { link, user } = await setup();
    await expect(link.execute(user.id, { accountType: 'checking' }, otherActor)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('lists, gets and updates accounts', async () => {
    const ctx = await setup();
    const acc = await ctx.link.execute(ctx.user.id, { accountType: 'checking' }, ownerActor);
    expect(await new ListBankAccountsUseCase(ctx.access, ctx.accounts).execute(ctx.user.id, ownerActor)).toHaveLength(1);
    expect(await new GetBankAccountUseCase(ctx.access, ctx.accounts).execute(ctx.user.id, acc.id, ownerActor)).toMatchObject({ id: acc.id });
    const updated = await new UpdateBankAccountUseCase(ctx.access, ctx.accounts).execute(
      ctx.user.id,
      acc.id,
      { accountType: 'savings' },
      ownerActor,
    );
    expect(updated.accountType).toBe('savings');
  });

  it('404s when the account belongs to a different user', async () => {
    const ctx = await setup();
    const acc = await ctx.link.execute(ctx.user.id, { accountType: 'checking' }, ownerActor);
    const other = await new CreateUserUseCase(ctx.users, ctx.kms).execute(
      { username: 'bob.s', email: 'bob@example.com', firstName: 'Bob', lastName: 'S' },
      otherActor,
    );
    await expect(
      new GetBankAccountUseCase(ctx.access, ctx.accounts).execute(other.id, acc.id, otherActor),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses to delete accounts holding funds and deletes empty ones', async () => {
    const ctx = await setup();
    const acc = await ctx.link.execute(ctx.user.id, { accountType: 'checking' }, ownerActor);
    const del = new DeleteBankAccountUseCase(ctx.access, ctx.accounts);

    const stored = ctx.accounts.items.get(acc.id);
    if (!stored) throw new Error('fixture missing');
    ctx.accounts.items.set(acc.id, { ...stored, balance: 5n });
    await expect(del.execute(ctx.user.id, acc.id, ownerActor)).rejects.toBeInstanceOf(ConflictError);

    ctx.accounts.items.set(acc.id, { ...stored, balance: 0n });
    await del.execute(ctx.user.id, acc.id, ownerActor);
    expect(ctx.accounts.items.size).toBe(0);
  });
});
