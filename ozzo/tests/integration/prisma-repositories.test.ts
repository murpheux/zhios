import { PrismaClient } from '@prisma/client';
import { ConflictError, type NewUser } from '../../src/domain';
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

  const newUser = (n = 1): NewUser => ({
    username: `user${n}`,
    email: `user${n}@example.com`,
    externalId: `00u-${n}`,
    roles: ['user'],
    permissions: [],
    isActive: true,
    emailVerified: false,
    phoneVerified: false,
    lastLoginAt: null,
    lastPasswordChangeAt: new Date(),
    mfaEnabled: false,
    identity: {
      displayName: 'Test User',
      middleName: null,
      preferredName: null,
      profilePhotoUrl: null,
      nationality: null,
      preferredLanguage: null,
      maritalStatus: null,
      dateOfBirth: null,
      sex: null,
    },
    contact: {
      phoneNumber: null,
      mobileNumber: null,
      secondaryEmail: null,
    },
    address: null,
    preferences: {
      timeZone: null,
      locale: null,
      theme: 'system',
      notificationPreferences: {
        emailNotifications: true,
        smsNotifications: false,
        inAppNotifications: true,
        marketingEmails: false,
      },
    },
    emergencyContacts: {
      primaryContact: null,
      secondaryContact: null,
      nextOfKin: null,
    },
    employment: {
      employeeNumber: null,
      departmentId: null,
      jobTitle: null,
      managerId: null,
      hireDate: null,
      employmentStatus: null,
    },
    compliance: {
      encryptedTaxId: null,
      termsAcceptedAt: null,
      privacyPolicyAcceptedAt: null,
      marketingConsent: false,
      marketingConsentUpdatedAt: null,
    },
    externalIds: {},
  });

  it('creates and finds users; unique violations become ConflictError', async () => {
    const u = await users.create(newUser());
    expect((await users.findById(u.id))?.username).toBe('user1');
    expect((await users.findByExternalId('00u-1'))?.id).toBe(u.id);
    await expect(users.create(newUser())).rejects.toBeInstanceOf(ConflictError);
  });

  it('round-trips profile fields and JSON columns', async () => {
    const u = await users.create({
      ...newUser(),
      address: { street: '1 Main St', city: 'Calgary', stateProvince: 'AB', country: 'CA', postalCode: 'T2P 1J9' },
      identity: {
        displayName: 'Test User',
        middleName: null,
        preferredName: null,
        profilePhotoUrl: null,
        nationality: null,
        preferredLanguage: null,
        maritalStatus: null,
        dateOfBirth: new Date('1990-02-03T00:00:00Z'),
        sex: "won't-declare",
      },
      compliance: {
        encryptedTaxId: 'ciphertext',
        termsAcceptedAt: null,
        privacyPolicyAcceptedAt: null,
        marketingConsent: false,
        marketingConsentUpdatedAt: null,
      },
    });
    const found = await users.findById(u.id);
    expect(found?.address?.postalCode).toBe('T2P 1J9');
    const identity = found?.identity as any;
    expect(identity?.dateOfBirth).toBeDefined();
    const compliance = found?.compliance as any;
    expect(compliance?.encryptedTaxId).toBe('ciphertext');
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
