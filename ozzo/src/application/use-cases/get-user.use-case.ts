import type { Actor } from '../actor';
import type { UserDto } from '../dtos';
import { loadAuthorizedUser, type UserAccessDeps } from '../user-access';

export class GetUserUseCase {
  constructor(private readonly deps: UserAccessDeps) {}

  execute(userId: string, actor: Actor): Promise<UserDto> {
    return loadAuthorizedUser(this.deps, userId, actor);
  }
}
