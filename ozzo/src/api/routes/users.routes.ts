import type { FastifyPluginAsync } from 'fastify';
import type {
  CreateUserUseCase,
  FetchUserProfileUseCase,
  GetUserUseCase,
  UpdateUserUseCase,
} from '../../application/use-cases';
import { createUserSchema, getProfileSchema, getUserSchema, updateUserSchema } from '../schemas';

export interface UserRoutesOptions {
  createUser: CreateUserUseCase;
  getUser: GetUserUseCase;
  fetchProfile: FetchUserProfileUseCase;
  updateUser: UpdateUserUseCase;
}

type IdParams = { Params: { id: string } };

export const userRoutes: FastifyPluginAsync<UserRoutesOptions> = async (app, opts) => {
  app.post('/users', { schema: createUserSchema }, async (req, reply) => {
    const user = await opts.createUser.execute(req.body, req.actor);
    return reply.code(201).send(user);
  });

  app.get<IdParams>('/users/:id', { schema: getUserSchema }, (req) =>
    opts.getUser.execute(req.params.id, req.actor),
  );

  app.get<IdParams>('/users/:id/profile', { schema: getProfileSchema }, (req) =>
    opts.fetchProfile.execute(req.params.id, req.actor),
  );

  app.patch<IdParams>('/users/:id', { schema: updateUserSchema }, (req) =>
    opts.updateUser.execute(req.params.id, req.body, req.actor),
  );
};
