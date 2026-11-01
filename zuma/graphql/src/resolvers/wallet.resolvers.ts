import type { CreateWalletDto, SupportedBitcoinNetwork, WalletType } from '@zuma/shared-common';
import type { GatewayContext } from '../context';
import { toGraphqlError } from './errors';
import { fromGraphqlEnum, toConnection, toGraphqlWallet, type GraphqlWallet } from './mappers';

export interface WalletArgs {
  id: string;
}

export interface WalletsArgs {
  page?: number;
  limit?: number;
  ownerUserId?: string;
}

export interface CreateWalletArgs {
  input: {
    label: string;
    network: string;
    type: string;
    metadata?: Record<string, unknown>;
  };
}

export interface UpdateWalletMetadataArgs {
  id: string;
  input: {
    label?: string;
    metadata?: Record<string, unknown>;
  };
}

export const walletResolvers = {
  Query: {
    wallet: async (_parent: unknown, args: WalletArgs, ctx: GatewayContext): Promise<GraphqlWallet> => {
      try {
        return toGraphqlWallet(await ctx.walletServiceClient.getWallet(args.id, ctx.authorization));
      } catch (error) {
        return toGraphqlError(error);
      }
    },
    wallets: async (_parent: unknown, args: WalletsArgs, ctx: GatewayContext) => {
      try {
        const result = await ctx.walletServiceClient.listWallets(args, ctx.authorization);
        return toConnection(result, toGraphqlWallet);
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
    ): Promise<GraphqlWallet> => {
      try {
        const input: CreateWalletDto = {
          label: args.input.label,
          network: fromGraphqlEnum<SupportedBitcoinNetwork>(args.input.network),
          type: fromGraphqlEnum<WalletType>(args.input.type),
          ...(args.input.metadata !== undefined && args.input.metadata !== null
            ? { metadata: args.input.metadata }
            : {}),
        };
        return toGraphqlWallet(await ctx.walletServiceClient.createWallet(input, ctx.authorization));
      } catch (error) {
        return toGraphqlError(error);
      }
    },
    updateWalletMetadata: async (
      _parent: unknown,
      args: UpdateWalletMetadataArgs,
      ctx: GatewayContext,
    ): Promise<GraphqlWallet> => {
      try {
        const input = {
          ...(args.input.label != null ? { label: args.input.label } : {}),
          ...(args.input.metadata != null ? { metadata: args.input.metadata } : {}),
        };
        return toGraphqlWallet(
          await ctx.walletServiceClient.updateWalletMetadata(args.id, input, ctx.authorization),
        );
      } catch (error) {
        return toGraphqlError(error);
      }
    },
  },
};
