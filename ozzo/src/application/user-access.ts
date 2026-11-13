import { NotFoundError } from '../domain';
import { assertCanAccess, type Actor } from './actor';
import { userCacheKey } from './cache-keys';
import { toUserDto, type UserDto } from './dtos';
import type { CachePort, UserRepository } from './ports';

export interface UserAccessDeps {
  users: UserRepository;
  cache: CachePort;
  cacheTtlSeconds: number;
}

/** Read-through cached user lookup followed by an ownership check. Shared by all per-user use-cases. */
export async function loadAuthorizedUser(
  deps: UserAccessDeps,
  userId: string,
  actor: Actor,
): Promise<UserDto> {
  const key = userCacheKey(userId);
  let dto = await deps.cache.get<UserDto>(key);
  if (!dto) {
    const user = await deps.users.findById(userId);
    if (!user) throw new NotFoundError('User');
    dto = toUserDto(user);
    await deps.cache.set(key, dto, deps.cacheTtlSeconds);
  }
  assertCanAccess(dto, actor);
  return dto;
}
