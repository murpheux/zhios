import { buildUserPatch, normalizeTaxId, ValidationError, type User } from '../../domain';
import { assertCanAccess, type Actor } from '../actor';
import { userCacheKey } from '../cache-keys';
import { parseDto, toUserDto, UpdateUserRequestSchema, type UserDto } from '../dtos';
import type { SensitiveDataPort, UserRepository } from '../ports';
import { type UserAccessDeps } from '../user-access';

export class UpdateUserUseCase {
  constructor(
    private readonly deps: UserAccessDeps,
    private readonly users: UserRepository,
    private readonly sensitiveData: SensitiveDataPort,
  ) {}

  async execute(userId: string, input: unknown, actor: Actor): Promise<UserDto> {
    const { taxId, ...dto } = parseDto(UpdateUserRequestSchema, input);
    // A tax-id-only update has no other patch fields; the encrypted value is added below.
    let patch = taxId !== undefined && Object.keys(dto).length === 0 ? {} : buildUserPatch(dto);

    // Load the raw User object (not DTO) for access control and compliance merging
    const existing = await this.deps.users.findById(userId);
    if (!existing) throw new Error('User not found');
    assertCanAccess(toUserDto(existing), actor);

    if (taxId !== undefined) {
      const patchAddress = (patch as any).address as any;
      const existingAddress = (existing.address as any) || {};
      const country = patchAddress?.country ?? existingAddress?.country;
      if (!country) throw new ValidationError('address is required when providing SIN/SSN');
      const encryptedTaxId = await this.sensitiveData.encrypt(normalizeTaxId(taxId, country), {
        purpose: 'user-tax-id',
        externalId: existing.externalId,
      });
      // Update compliance object with encrypted tax ID
      const patchCompliance = ((patch as any).compliance as any) || {};
      const existingCompliance = (existing.compliance as any) || {};
      patch = {
        ...patch,
        compliance: {
          encryptedTaxId,
          termsAcceptedAt: patchCompliance.termsAcceptedAt ?? existingCompliance.termsAcceptedAt ?? null,
          privacyPolicyAcceptedAt: patchCompliance.privacyPolicyAcceptedAt ?? existingCompliance.privacyPolicyAcceptedAt ?? null,
          marketingConsent: patchCompliance.marketingConsent ?? existingCompliance.marketingConsent ?? false,
          marketingConsentUpdatedAt: patchCompliance.marketingConsentUpdatedAt ?? existingCompliance.marketingConsentUpdatedAt ?? null,
        },
      } as any;
    }
    const updated = await this.users.update(userId, patch);
    await this.deps.cache.del(userCacheKey(userId));
    return toUserDto(updated);
  }
}
