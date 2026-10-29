// GraphQL SDL for the gateway; mirrors the REST DTOs exposed by wallet-service and transaction-service.
export const typeDefs = /* GraphQL */ `
  """
  A Bitcoin wallet owned by a user, tracked by wallet-service.
  """
  type Wallet {
    "Unique wallet identifier."
    id: ID!
    "Human-readable label for the wallet."
    label: String!
    "Bitcoin address associated with this wallet."
    address: String!
    "Bitcoin network this wallet operates on."
    network: String!
    "Wallet custody type (hot, cold, custodial, non-custodial)."
    type: String!
    "Cached balance in satoshis, as a string."
    balanceCache: String!
    "Arbitrary user-supplied metadata."
    metadata: JSON!
    "Identifier of the user who owns this wallet."
    ownerUserId: String!
    "Current lifecycle status of the wallet."
    status: String!
    "Creation timestamp (ISO-8601)."
    createdAt: String!
    "Last update timestamp (ISO-8601)."
    updatedAt: String!
  }

  """
  A Bitcoin transaction tracked by transaction-service.
  """
  type Transaction {
    "Unique transaction identifier."
    id: ID!
    "Identifier of the wallet this transaction belongs to."
    walletId: String!
    "On-chain transaction id, once broadcast."
    txid: String
    "Transaction direction (send or receive)."
    type: String!
    "Transaction amount, as a string."
    amount: String!
    "Fee rate used for this transaction, as a string."
    feeRate: String!
    "Current lifecycle status of the transaction."
    status: String!
    "Number of confirmations observed on-chain."
    confirmations: Int!
    "Raw signed transaction hex, if available."
    rawTx: String
    "Creation timestamp (ISO-8601)."
    createdAt: String!
    "Last update timestamp (ISO-8601)."
    updatedAt: String!
  }

  "Pagination metadata shared by all connection types."
  type PageInfo {
    total: Int!
    page: Int!
    limit: Int!
    totalPages: Int!
  }

  type WalletConnection {
    items: [Wallet!]!
    pageInfo: PageInfo!
  }

  type TransactionConnection {
    items: [Transaction!]!
    pageInfo: PageInfo!
  }

  input CreateWalletInput {
    label: String!
    network: String!
    type: String!
    ownerUserId: String!
    metadata: JSON
  }

  input CreateTransactionInput {
    walletId: String!
    type: String!
    amount: String!
    feeRate: String!
    destinationAddress: String!
  }

  scalar JSON

  type Query {
    wallet(id: ID!): Wallet
    wallets(page: Int, limit: Int, ownerUserId: String): WalletConnection!
    transaction(id: ID!): Transaction
    transactions(
      walletId: String
      status: String
      from: String
      to: String
      page: Int
      limit: Int
    ): TransactionConnection!
  }

  type Mutation {
    createWallet(input: CreateWalletInput!): Wallet!
    createTransaction(input: CreateTransactionInput!): Transaction!
  }
`;
