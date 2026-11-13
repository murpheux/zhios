import type { FastifyPluginAsync } from 'fastify';
import type {
  DeleteBankAccountUseCase,
  GetBankAccountUseCase,
  LinkBankAccountUseCase,
  ListBankAccountsUseCase,
  UpdateBankAccountUseCase,
} from '../../application/use-cases';
import {
  deleteAccountSchema,
  getAccountSchema,
  linkAccountSchema,
  listAccountsSchema,
  updateAccountSchema,
} from '../schemas';

export interface AccountRoutesOptions {
  linkAccount: LinkBankAccountUseCase;
  listAccounts: ListBankAccountsUseCase;
  getAccount: GetBankAccountUseCase;
  updateAccount: UpdateBankAccountUseCase;
  deleteAccount: DeleteBankAccountUseCase;
}

type UserParams = { Params: { id: string } };
type AccountParams = { Params: { id: string; accountId: string } };

export const accountRoutes: FastifyPluginAsync<AccountRoutesOptions> = async (app, opts) => {
  app.post<UserParams>('/users/:id/accounts', { schema: linkAccountSchema }, async (req, reply) => {
    const account = await opts.linkAccount.execute(req.params.id, req.body, req.actor);
    return reply.code(201).send(account);
  });

  app.get<UserParams>('/users/:id/accounts', { schema: listAccountsSchema }, (req) =>
    opts.listAccounts.execute(req.params.id, req.actor),
  );

  app.get<AccountParams>('/users/:id/accounts/:accountId', { schema: getAccountSchema }, (req) =>
    opts.getAccount.execute(req.params.id, req.params.accountId, req.actor),
  );

  app.patch<AccountParams>('/users/:id/accounts/:accountId', { schema: updateAccountSchema }, (req) =>
    opts.updateAccount.execute(req.params.id, req.params.accountId, req.body, req.actor),
  );

  app.delete<AccountParams>('/users/:id/accounts/:accountId', { schema: deleteAccountSchema }, async (req, reply) => {
    await opts.deleteAccount.execute(req.params.id, req.params.accountId, req.actor);
    return reply.code(204).send();
  });
};
