import type { FastifyPluginAsync } from 'fastify';
import type { SyncWalletUseCase } from '../../application/use-cases';
import { walletSchema } from '../schemas';

export interface WalletRoutesOptions {
  syncWallet: SyncWalletUseCase;
}

export const walletRoutes: FastifyPluginAsync<WalletRoutesOptions> = async (app, opts) => {
  app.get<{ Params: { id: string } }>('/users/:id/wallet', { schema: walletSchema }, (req) =>
    opts.syncWallet.execute(req.params.id, req.actor),
  );
};
