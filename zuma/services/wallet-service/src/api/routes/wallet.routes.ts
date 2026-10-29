import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { CreateWalletDto, UpdateWalletMetadataDto } from '@zuma/shared-common';
import { toActor } from '../plugins/auth';
import type { CreateWalletUseCase } from '../../application/use-cases/create-wallet.use-case';
import type { GetWalletUseCase } from '../../application/use-cases/get-wallet.use-case';
import type { ListWalletsUseCase } from '../../application/use-cases/list-wallets.use-case';
import type { GetWalletBalanceUseCase } from '../../application/use-cases/get-wallet-balance.use-case';
import type { GetWalletTransactionHistoryUseCase } from '../../application/use-cases/get-wallet-transaction-history.use-case';
import type { UpdateWalletMetadataUseCase } from '../../application/use-cases/update-wallet-metadata.use-case';
import {
  createWalletSchema,
  getBalanceSchema,
  getTransactionHistorySchema,
  getWalletSchema,
  listWalletsSchema,
  updateMetadataSchema,
} from '../schemas/wallet.schemas';

export interface WalletRoutesOptions {
  createWalletUseCase: CreateWalletUseCase;
  getWalletUseCase: GetWalletUseCase;
  listWalletsUseCase: ListWalletsUseCase;
  getWalletBalanceUseCase: GetWalletBalanceUseCase;
  getWalletTransactionHistoryUseCase: GetWalletTransactionHistoryUseCase;
  updateWalletMetadataUseCase: UpdateWalletMetadataUseCase;
}

interface WalletIdParams {
  id: string;
}

interface ListWalletsQuery {
  page?: number;
  limit?: number;
  ownerUserId?: string;
}

// Wallet CRUD + read routes, mounted under /api/v1 by the app composition root.
export const walletRoutes: FastifyPluginAsync<WalletRoutesOptions> = async (
  app: FastifyInstance,
  opts: WalletRoutesOptions,
) => {
  app.addHook('preHandler', app.requireAuth);

  app.post<{ Body: CreateWalletDto }>(
    '/wallets',
    { schema: createWalletSchema },
    async (request, reply) => {
      const wallet = await opts.createWalletUseCase.execute(request.body, toActor(request.user));
      reply.status(201);
      return wallet;
    },
  );

  app.get<{ Params: WalletIdParams }>(
    '/wallets/:id',
    { schema: getWalletSchema },
    async (request) => opts.getWalletUseCase.execute(request.params.id, toActor(request.user)),
  );

  app.get<{ Querystring: ListWalletsQuery }>(
    '/wallets',
    { schema: listWalletsSchema },
    async (request) => {
      const { page = 1, limit = 20, ownerUserId } = request.query;
      return opts.listWalletsUseCase.execute({ ownerUserId }, { page, limit }, toActor(request.user));
    },
  );

  app.patch<{ Params: WalletIdParams; Body: UpdateWalletMetadataDto }>(
    '/wallets/:id/metadata',
    { schema: updateMetadataSchema },
    async (request) =>
      opts.updateWalletMetadataUseCase.execute(request.params.id, request.body, toActor(request.user)),
  );

  app.get<{ Params: WalletIdParams }>(
    '/wallets/:id/balance',
    { schema: getBalanceSchema },
    async (request) => opts.getWalletBalanceUseCase.execute(request.params.id, toActor(request.user)),
  );

  app.get<{ Params: WalletIdParams }>(
    '/wallets/:id/transactions',
    { schema: getTransactionHistorySchema },
    async (request) =>
      opts.getWalletTransactionHistoryUseCase.execute(
        request.params.id,
        toActor(request.user),
        request.headers.authorization,
      ),
  );
};
