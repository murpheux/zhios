import { ValidationError } from '../../src/domain';
import { CreateUserUseCase, UpdateUserUseCase } from '../../src/application/use-cases';
import { MockKmsAdapter } from '../../src/infrastructure/mock-kms.adapter';
import { ownerActor, validUser } from '../fixtures/data';
import { createContext } from './support';

const address = { street: '1 Main St', city: 'Calgary', stateProvince: 'AB', country: 'CA', postalCode: 't2p1j9' };

describe('MockKmsAdapter', () => {
  const kms = new MockKmsAdapter('test');

  it('round-trips and does not leave plaintext in the ciphertext string', async () => {
    const ct = await kms.encrypt('130692544', { purpose: 'x' });
    expect(ct).not.toContain('130692544');
    await expect(kms.decrypt(ct, { purpose: 'x' })).resolves.toBe('130692544');
  });

  it('rejects a mismatched context and malformed ciphertext', async () => {
    const ct = await kms.encrypt('130692544', { purpose: 'x' });
    await expect(kms.decrypt(ct, { purpose: 'y' })).rejects.toThrow('context');
    await expect(kms.decrypt('garbage')).rejects.toThrow('Malformed');
    await expect(kms.decrypt('mock-kms:v1:!!!')).rejects.toThrow('Malformed');
  });

  it('refuses to be constructed in production', () => {
    expect(() => new MockKmsAdapter('production')).toThrow(/production/);
  });
});

describe('SIN/SSN handling in user use-cases', () => {
  it('encrypts on create, stores only ciphertext, and never returns it', async () => {
    const { users, kms } = createContext();
    const dto = await new CreateUserUseCase(users, kms).execute({ ...validUser, address, taxId: '130-692-544' }, ownerActor);
    const stored = [...users.items.values()][0];
    expect(stored).toBeDefined();
    const compliance = (stored?.compliance as any) || {};
    expect(compliance.encryptedTaxId).toBeTruthy();
    expect(compliance.encryptedTaxId).not.toContain('130692544');
    await expect(
      kms.decrypt(compliance.encryptedTaxId as string, { purpose: 'user-tax-id', externalId: ownerActor.sub }),
    ).resolves.toBe('130692544');
    expect(JSON.stringify(dto)).not.toMatch(/130692544|taxId|encryptedTaxId/);
    expect(dto.address?.postalCode).toBe('T2P 1J9');
  });

  it('requires an address and rejects invalid ids without calling KMS', async () => {
    const { users, kms } = createContext();
    const spy = jest.spyOn(kms, 'encrypt');
    const uc = new CreateUserUseCase(users, kms);
    await expect(uc.execute({ ...validUser, taxId: '130692544' }, ownerActor)).rejects.toBeInstanceOf(ValidationError);
    await expect(uc.execute({ ...validUser, address, taxId: '123456789' }, ownerActor)).rejects.toBeInstanceOf(ValidationError);
    expect(spy).not.toHaveBeenCalled();
  });

  it('encrypts on update (tax id only) using the existing address country', async () => {
    const ctx = createContext();
    const user = await new CreateUserUseCase(ctx.users, ctx.kms).execute({ ...validUser, address }, ownerActor);
    const updated = await new UpdateUserUseCase(ctx.access, ctx.users, ctx.kms).execute(
      user.id,
      { taxId: '130692544' },
      ownerActor,
    );
    const stored = ctx.users.items.get(user.id);
    const compliance = (stored?.compliance as any) || {};
    expect(compliance.encryptedTaxId).toBeTruthy();
    expect(JSON.stringify(updated)).not.toMatch(/taxId|encryptedTaxId/i);
  });

  it('updates profile fields', async () => {
    const ctx = createContext();
    const user = await new CreateUserUseCase(ctx.users, ctx.kms).execute(validUser, ownerActor);
    const updated = await new UpdateUserUseCase(ctx.access, ctx.users, ctx.kms).execute(
      user.id,
      { dateOfBirth: '1990-02-03', sex: "won't-declare", contactPerson: { fullName: 'Al', phone: '+1 403 555 0100' } },
      ownerActor,
    );
    expect(updated.dateOfBirth).toBe('1990-02-03');
    expect(updated.sex).toBe("won't-declare");
    await expect(
      new UpdateUserUseCase(ctx.access, ctx.users, ctx.kms).execute(user.id, { dateOfBirth: '2999-01-01' }, ownerActor),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
