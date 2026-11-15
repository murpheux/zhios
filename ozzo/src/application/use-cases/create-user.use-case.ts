import { buildNewUser, ConflictError, normalizeTaxId, ValidationError } from '../../domain';
import type { Actor } from '../actor';
import { CreateUserRequestSchema, parseDto, toUserDto, type UserDto } from '../dtos';
import type { SensitiveDataPort, UserRepository } from '../ports';

export class CreateUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly sensitiveData: SensitiveDataPort,
  ) {}

  /** Registers the authenticated Okta identity as an ozzo user; externalId always comes from the token. */
  async execute(input: unknown, actor: Actor): Promise<UserDto> {
    const { taxId, ...dto } = parseDto(CreateUserRequestSchema, input);
    // Validate everything (including the plaintext tax id) before calling KMS.
    const validated = buildNewUser({ ...dto, externalId: actor.sub });
    if (await this.users.findByExternalId(actor.sub)) {
      throw new ConflictError('User is already registered');
    }
    let newUser = validated;
    if (taxId !== undefined) {
      if (!validated.address) {
        throw new ValidationError('address is required when providing SIN/SSN');
      }
      const encryptedTaxId = await this.sensitiveData.encrypt(normalizeTaxId(taxId, validated.address.country), {
        purpose: 'user-tax-id',
        externalId: actor.sub,
      });
      // Update compliance object with encrypted tax ID
      const existingCompliance = (validated.compliance as any) || {};
      newUser = {
        ...validated,
        compliance: {
          encryptedTaxId,
          termsAcceptedAt: existingCompliance.termsAcceptedAt || null,
          privacyPolicyAcceptedAt: existingCompliance.privacyPolicyAcceptedAt || null,
          marketingConsent: existingCompliance.marketingConsent ?? false,
          marketingConsentUpdatedAt: existingCompliance.marketingConsentUpdatedAt || null,
        },
      };
    }
    return toUserDto(await this.users.create(newUser));
  }
}
