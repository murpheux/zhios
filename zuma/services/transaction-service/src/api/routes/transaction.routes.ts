import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { toActor } from '../plugins/auth';
import type { CreateTransactionUseCase } from '../../application/use-cases/create-transaction.use-case';
import type { ValidateTransactionUseCase } from '../../application/use-cases/validate-transaction.use-case';
import type { BroadcastTransactionUseCase } from '../../application/use-cases/broadcast-transaction.use-case';
import type { GetTransactionUseCase } from '../../application/use-cases/get-transaction.use-case';
import type { ListTransactionsUseCase } from '../../application/use-cases/list-transactions.use-case';
import type { GetTransactionStatusUseCase } from '../../application/use-cases/get-transaction-status.use-case';
import type { TransactionKind, TransactionLifecycleStatus } from '../../domain/value-objects/transaction-status';
import {
  broadcastTransactionSchema,
  createTransactionSchema,
  getTransactionSchema,
  getTransactionStatusSchema,
  listTransactionsSchema,
  validateTransactionSchema,
} from '../schemas/transaction.schemas';

export interface TransactionRoutesOptions {
  createTransactionUseCase: CreateTransactionUseCase;
  validateTransactionUseCase: ValidateTransactionUseCase;
  broadcastTransactionUseCase: BroadcastTransactionUseCase;
  getTransactionUseCase: GetTransactionUseCase;
  listTransactionsUseCase: ListTransactionsUseCase;
  getTransactionStatusUseCase: GetTransactionStatusUseCase;
}

interface TransactionIdParams {
  id: string;
}

// Body shape validated by createTransactionSchema's JSON schema enum (send|receive).
interface CreateTransactionBody {
  walletId: string;
  type: TransactionKind;
  amount: string;
  feeRate: string;
  destinationAddress: string;
}

interface ListTransactionsQuery {
  page?: number;
  limit?: number;
  walletId?: string;
  status?: TransactionLifecycleStatus;
  from?: string;
  to?: string;
}

interface IdempotencyHeaders {
  'idempotency-key'?: string;
}

// Transaction CRUD + lifecycle routes, mounted under /api/v1 by the app composition root.
export const transactionRoutes: FastifyPluginAsync<TransactionRoutesOptions> = async (
  app: FastifyInstance,
  opts: TransactionRoutesOptions,
) => {
  app.addHook('preHandler', app.requireAuth);

  app.post<{ Body: CreateTransactionBody; Headers: IdempotencyHeaders }>(
    '/transactions',
    { schema: createTransactionSchema },
    async (request, reply) => {
      const idempotencyKey = request.headers['idempotency-key'];
      const transaction = await opts.createTransactionUseCase.execute(
        { ...request.body, idempotencyKey },
        toActor(request.user),
        request.headers.authorization,
      );
      reply.status(201);
      return transaction;
    },
  );

  app.post<{ Params: TransactionIdParams }>(
    '/transactions/:id/validate',
    { schema: validateTransactionSchema },
    async (request) => opts.validateTransactionUseCase.execute(request.params.id, toActor(request.user)),
  );

  app.post<{ Params: TransactionIdParams }>(
    '/transactions/:id/broadcast',
    { schema: broadcastTransactionSchema },
    async (request) =>
      opts.broadcastTransactionUseCase.execute(request.params.id, toActor(request.user)),
  );

  app.get<{ Params: TransactionIdParams }>(
    '/transactions/:id',
    { schema: getTransactionSchema },
    async (request) => opts.getTransactionUseCase.execute(request.params.id, toActor(request.user)),
  );

  app.get<{ Querystring: ListTransactionsQuery }>(
    '/transactions',
    { schema: listTransactionsSchema },
    async (request) => {
      const { page = 1, limit = 20, walletId, status, from, to } = request.query;
      return opts.listTransactionsUseCase.execute(
        {
          walletId,
          status,
          dateFrom: from ? new Date(from) : undefined,
          dateTo: to ? new Date(to) : undefined,
        },
        { page, limit },
        toActor(request.user),
      );
    },
  );

  app.get<{ Params: TransactionIdParams }>(
    '/transactions/:id/status',
    { schema: getTransactionStatusSchema },
    async (request) => opts.getTransactionStatusUseCase.execute(request.params.id, toActor(request.user)),
  );
};
