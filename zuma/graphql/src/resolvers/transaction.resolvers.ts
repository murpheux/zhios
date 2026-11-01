import { SATS_AMOUNT_PATTERN, type CreateTransactionDto, type TransactionStatus } from '@zuma/shared-common';
import type { GatewayContext } from '../context';
import { badUserInput, toGraphqlError } from './errors';
import { fromGraphqlEnum, toConnection, toGraphqlTransaction, type GraphqlTransaction } from './mappers';

const SATS_AMOUNT = new RegExp(SATS_AMOUNT_PATTERN);
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,128}$/;

export interface TransactionArgs {
  id: string;
}

export interface TransactionsArgs {
  walletId?: string;
  /** GraphQL TransactionStatus enum value, e.g. 'PENDING'. */
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface CreateTransactionArgs {
  input: {
    walletId: string;
    amount: string;
    feeRate: string;
    destinationAddress: string;
    idempotencyKey: string;
  };
}

export const transactionResolvers = {
  Query: {
    transaction: async (
      _parent: unknown,
      args: TransactionArgs,
      ctx: GatewayContext,
    ): Promise<GraphqlTransaction> => {
      try {
        return toGraphqlTransaction(
          await ctx.transactionServiceClient.getTransaction(args.id, ctx.authorization),
        );
      } catch (error) {
        return toGraphqlError(error);
      }
    },
    transactions: async (_parent: unknown, args: TransactionsArgs, ctx: GatewayContext) => {
      try {
        const result = await ctx.transactionServiceClient.listTransactions(
          {
            ...args,
            status: args.status ? fromGraphqlEnum<TransactionStatus>(args.status) : undefined,
          },
          ctx.authorization,
        );
        return toConnection(result, toGraphqlTransaction);
      } catch (error) {
        return toGraphqlError(error);
      }
    },
  },
  Mutation: {
    createTransaction: async (
      _parent: unknown,
      args: CreateTransactionArgs,
      ctx: GatewayContext,
    ): Promise<GraphqlTransaction> => {
      const { idempotencyKey, ...rest } = args.input;
      if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
        throw badUserInput('idempotencyKey must be 8-128 characters of [A-Za-z0-9_-]');
      }
      if (!SATS_AMOUNT.test(rest.amount)) {
        throw badUserInput('amount must be a positive integer number of satoshis, as a string');
      }
      try {
        // Only outgoing sends can be created through the public API.
        const input: CreateTransactionDto = { ...rest, type: 'send' };
        return toGraphqlTransaction(
          await ctx.transactionServiceClient.createTransaction(
            input,
            idempotencyKey,
            ctx.authorization,
          ),
        );
      } catch (error) {
        return toGraphqlError(error);
      }
    },
  },
};
