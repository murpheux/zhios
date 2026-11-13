import { PrismaClient } from '@prisma/client';
import { ConflictError } from '../../src/domain';
import { PrismaBankAccountRepository } from '../../src/infrastructure/prisma-bank-account.repository';
import { PrismaUserRepository } from '../../src/infrastructure/prisma-user.repository';

// Requires a disposable PostgreSQL with migrations applied:
//   docker compose -f docker/docker-compose.yml up -d postgres && DATABASE_URL=... npx prisma migrate deploy
const url = process.env.DATABASE_URL;
const suite = url ? describe : describe.skip;

suite('Prisma repositories (real PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const users = new PrismaUserRepository(prisma);
  const accounts = new PrismaBankAccountRepository(prisma);

  beforeEach(async () => {
    await prisma.bankAccount.deleteMany();
    await prisma.user.deleteMany();
  });
  afterAll(() => prisma.$disconnect());

  const newUser = (n = 1) => ({
    username: `user${n}`,
    email: `user${n}@example.com`,
    firstName: 'Test',
    lastName: 'User',
    externalId: `00u-${n}`,
  });

  it('creates and finds users; unique violations become ConflictError', async () => {
    const u = await users.create(newUser());
    expect((await users.findById(u.id))?.username).toBe('user1');
    expect((await users.findByExternalId('00u-1'))?.id).toBe(u.id);
    await expect(users.create(newUser())).rejects.toBeInstanceOf(ConflictError);
  });

  it('stores balances as bigint and cascades deletes', async () => {
    const u = await users.create(newUser());
    const a = await accounts.create({
      userId: u.id,
      accountNumber: '123456789012',
      accountType: 'savings',
      balance: 9007199254740993n,
    });
    expect((await accounts.findById(a.id))?.balance).toBe(9007199254740993n);
    expect(await accounts.listByUser(u.id)).toHaveLength(1);
    await prisma.user.delete({ where: { id: u.id } });
    expect(await accounts.findById(a.id)).toBeNull();
  });

  it('updates account type and deletes accounts', async () => {
    const u = await users.create(newUser());
    const a = await accounts.create({ userId: u.id, accountNumber: '99999999', accountType: 'checking', balance: 0n });
    expect((await accounts.update(a.id, { accountType: 'savings' })).accountType).toBe('savings');
    await accounts.delete(a.id);
    expect(await accounts.findById(a.id)).toBeNull();
  });
});
