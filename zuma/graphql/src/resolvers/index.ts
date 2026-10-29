import { jsonScalar } from '../schema/json-scalar';
import { walletResolvers } from './wallet.resolvers';
import { transactionResolvers } from './transaction.resolvers';

export const resolvers = {
  JSON: jsonScalar,
  Query: {
    ...walletResolvers.Query,
    ...transactionResolvers.Query,
  },
  Mutation: {
    ...walletResolvers.Mutation,
    ...transactionResolvers.Mutation,
  },
};
