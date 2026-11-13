import { buildUserPatch } from '../../domain';
import type { Actor } from '../actor';
import { userCacheKey } from '../cache-keys';
import { parseDto, toUserDto, UpdateUserRequestSchema, type UserDto } from '../dtos';
import type { UserRepository } from '../ports';
import { loadAuthorizedUser, type UserAccessDeps } from '../user-access';

export class UpdateUserUseCase {
  constructor(
    private readonly deps: UserAccessDeps,
    private readonly users: UserRepository,
  ) {}

  async execute(userId: string, input: unknown, actor: Actor): Promise<UserDto> {
    const patch = buildUserPatch(parseDto(UpdateUserRequestSchema, input));
    await loadAuthorizedUser(this.deps, userId, actor);
    const updated = await this.users.update(userId, patch);
    await this.deps.cache.del(userCacheKey(userId));
    return toUserDto(updated);
  }
}
