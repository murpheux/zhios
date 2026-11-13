import { buildUserPatch, normalizeTaxId, ValidationError } from '../../domain';
import type { Actor } from '../actor';
import { userCacheKey } from '../cache-keys';
import { parseDto, toUserDto, UpdateUserRequestSchema, type UserDto } from '../dtos';
import type { SensitiveDataPort, UserRepository } from '../ports';
import { loadAuthorizedUser, type UserAccessDeps } from '../user-access';

export class UpdateUserUseCase {
  constructor(
    private readonly deps: UserAccessDeps,
    private readonly users: UserRepository,
    private readonly sensitiveData: SensitiveDataPort,
  ) {}

  async execute(userId: string, input: unknown, actor: Actor): Promise<UserDto> {
    const { taxId, ...dto } = parseDto(UpdateUserRequestSchema, input);
    // A tax-id-only update has no other patch fields; the encrypted value is added below.
    const patch = taxId !== undefined && Object.keys(dto).length === 0 ? {} : buildUserPatch(dto);
    const existing = await loadAuthorizedUser(this.deps, userId, actor);
    if (taxId !== undefined) {
      const country = patch.address?.country ?? existing.address?.country;
      if (!country) throw new ValidationError('address is required when providing SIN/SSN');
      patch.encryptedTaxId = await this.sensitiveData.encrypt(normalizeTaxId(taxId, country), {
        purpose: 'user-tax-id',
        externalId: existing.externalId,
      });
    }
    const updated = await this.users.update(userId, patch);
    await this.deps.cache.del(userCacheKey(userId));
    return toUserDto(updated);
  }
}
