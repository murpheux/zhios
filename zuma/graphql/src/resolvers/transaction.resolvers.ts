import { ErrorWithProps } from 'mercurius';
import type { CreateTransactionDto, TransactionDto } from '@zuma/shared-common';
import type { GatewayContext } from '../context';
import { UpstreamHttpError } from '../clients/upstream-http-error';

// Re-throws upstream REST failures as GraphQL errors carrying the original status/code.
const toGraphqlError = (error: unknown): never => {
  if (error instanceof UpstreamHttpError) {
    throw new ErrorWithProps(error.message, { code: error.code, statusCode: error.statusCode });
  }
  throw error;
};

export interface TransactionArgs {
  id: string;
}

export interface TransactionsArgs {
  walletId?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface CreateTransactionArgs {
  input: CreateTransactionDto;
}

export const transactionResolvers = {
  Query: {
    transaction: async (
      _parent: unknown,
      args: TransactionArgs,
      ctx: GatewayContext,
    ): Promise<TransactionDto> => {
      try {
        return await ctx.transactionServiceClient.getTransaction(args.id, ctx.authorization);
      } catch (error) {
        return toGraphqlError(error);
      }
    },
    transactions: async (
      _parent: unknown,
      args: TransactionsArgs,
      ctx: GatewayContext,
    ) => {
      try {
        const result = await ctx.transactionServiceClient.listTransactions(args, ctx.authorization);
        return {
          items: result.items,
          pageInfo: {
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages,
          },
        };
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
    ): Promise<TransactionDto> => {
      try {
        return await ctx.transactionServiceClient.createTransaction(args.input, ctx.authorization);
      } catch (error) {
        return toGraphqlError(error);
      }
    },
  },
};
