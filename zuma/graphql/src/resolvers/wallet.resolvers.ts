import { ErrorWithProps } from 'mercurius';
import type { CreateWalletDto, WalletDto } from '@zuma/shared-common';
import type { GatewayContext } from '../context';
import { UpstreamHttpError } from '../clients/upstream-http-error';

// Re-throws upstream REST failures as GraphQL errors carrying the original status/code.
const toGraphqlError = (error: unknown): never => {
  if (error instanceof UpstreamHttpError) {
    throw new ErrorWithProps(error.message, { code: error.code, statusCode: error.statusCode });
  }
  throw error;
};

export interface WalletArgs {
  id: string;
}

export interface WalletsArgs {
  page?: number;
  limit?: number;
  ownerUserId?: string;
}

export interface CreateWalletArgs {
  input: CreateWalletDto;
}

export const walletResolvers = {
  Query: {
    wallet: async (_parent: unknown, args: WalletArgs, ctx: GatewayContext): Promise<WalletDto> => {
      try {
        return await ctx.walletServiceClient.getWallet(args.id, ctx.authorization);
      } catch (error) {
        return toGraphqlError(error);
      }
    },
    wallets: async (_parent: unknown, args: WalletsArgs, ctx: GatewayContext) => {
      try {
        const result = await ctx.walletServiceClient.listWallets(args, ctx.authorization);
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
    createWallet: async (
      _parent: unknown,
      args: CreateWalletArgs,
      ctx: GatewayContext,
    ): Promise<WalletDto> => {
      try {
        return await ctx.walletServiceClient.createWallet(args.input, ctx.authorization);
      } catch (error) {
        return toGraphqlError(error);
      }
    },
  },
};
