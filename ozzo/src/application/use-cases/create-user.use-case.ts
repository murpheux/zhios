import { buildNewUser, ConflictError } from '../../domain';
import type { Actor } from '../actor';
import { CreateUserRequestSchema, parseDto, toUserDto, type UserDto } from '../dtos';
import type { UserRepository } from '../ports';

export class CreateUserUseCase {
  constructor(private readonly users: UserRepository) {}

  /** Registers the authenticated Okta identity as an ozzo user; externalId always comes from the token. */
  async execute(input: unknown, actor: Actor): Promise<UserDto> {
    const dto = parseDto(CreateUserRequestSchema, input);
    const newUser = buildNewUser({ ...dto, externalId: actor.sub });
    if (await this.users.findByExternalId(actor.sub)) {
      throw new ConflictError('User is already registered');
    }
    return toUserDto(await this.users.create(newUser));
  }
}
