import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { allowServiceCallers } from '@zinga/shared-http';
import type { DebitWalletUseCase } from '../../application/use-cases/debit-wallet.use-case';
import type { RefundWalletUseCase } from '../../application/use-cases/refund-wallet.use-case';
import type { GetWalletForServiceUseCase } from '../../application/use-cases/get-wallet-for-service.use-case';
import { internalCreditSchema, internalDebitSchema, internalWalletSchema } from '../schemas/wallet.schemas';

export interface InternalWalletRoutesOptions {
  debitWalletUseCase: DebitWalletUseCase;
  refundWalletUseCase: RefundWalletUseCase;
  getWalletForServiceUseCase: GetWalletForServiceUseCase;
}

interface WalletIdParams {
  id: string;
}

interface MovementBody {
  transactionId: string;
  amountSats: string;
}

// Service-to-service routes, mounted under /internal (never exposed through the public ingress).
// Authenticated by a short-lived x-service-token, not a user JWT; only transaction-service may call them.
export const internalWalletRoutes: FastifyPluginAsync<InternalWalletRoutesOptions> = async (
  app: FastifyInstance,
  opts: InternalWalletRoutesOptions,
) => {
  // onRequest so unauthenticated callers are rejected before body parsing/schema validation.
  const serviceOnly = [app.requireService, allowServiceCallers('transaction-service')];

  app.get<{ Params: WalletIdParams }>(
    '/wallets/:id',
    { schema: internalWalletSchema, onRequest: serviceOnly },
    async (request) => opts.getWalletForServiceUseCase.execute(request.params.id),
  );

  app.post<{ Params: WalletIdParams; Body: MovementBody }>(
    '/wallets/:id/debits',
    { schema: internalDebitSchema, onRequest: serviceOnly },
    async (request) =>
      opts.debitWalletUseCase.execute({
        walletId: request.params.id,
        transactionId: request.body.transactionId,
        amountSats: request.body.amountSats,
      }),
  );

  app.post<{ Params: WalletIdParams; Body: MovementBody & { reason: 'refund' } }>(
    '/wallets/:id/credits',
    { schema: internalCreditSchema, onRequest: serviceOnly },
    async (request) =>
      opts.refundWalletUseCase.execute({
        walletId: request.params.id,
        transactionId: request.body.transactionId,
        amountSats: request.body.amountSats,
      }),
  );
};
