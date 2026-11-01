// GraphQL SDL for the gateway; mirrors the REST DTOs exposed by wallet-service and transaction-service.
// Enum values are UPPER_SNAKE_CASE here and mapped to/from the REST lower-kebab values in resolvers/mappers.ts.
export const typeDefs = /* GraphQL */ `
  "Bitcoin network."
  enum Network {
    MAINNET
    TESTNET
    REGTEST
  }

  "Wallet custody type."
  enum WalletType {
    HOT
    COLD
    CUSTODIAL
    NON_CUSTODIAL
  }

  "Wallet lifecycle status."
  enum WalletStatus {
    ACTIVE
    SUSPENDED
    ARCHIVED
  }

  "Transaction lifecycle status."
  enum TransactionStatus {
    PENDING
    BROADCASTING
    BROADCAST
    CONFIRMED
    FAILED
  }

  "Transaction direction."
  enum TransactionType {
    SEND
    RECEIVE
    INTERNAL_TRANSFER
  }

  """
  A Bitcoin wallet owned by a user, tracked by wallet-service.
  """
  type Wallet {
    "Unique wallet identifier (24-char hex ObjectId)."
    id: ID!
    "Human-readable label for the wallet."
    label: String!
    "Bitcoin address associated with this wallet."
    address: String!
    "Bitcoin network this wallet operates on."
    network: Network!
    "Wallet custody type."
    type: WalletType!
    "Cached balance as a string of integer satoshis (e.g. \\"150000\\"); never a float."
    balanceCache: String!
    "Arbitrary user-supplied metadata."
    metadata: JSON!
    "Identifier of the user who owns this wallet (taken from the caller's token at creation)."
    ownerUserId: String!
    "Current lifecycle status of the wallet."
    status: WalletStatus!
    "Creation timestamp (ISO-8601)."
    createdAt: String!
    "Last update timestamp (ISO-8601)."
    updatedAt: String!
  }

  """
  A Bitcoin transaction tracked by transaction-service.
  """
  type Transaction {
    "Unique transaction identifier (24-char hex ObjectId)."
    id: ID!
    "Identifier of the wallet this transaction belongs to."
    walletId: String!
    "On-chain transaction id, once broadcast."
    txid: String
    "Transaction direction."
    type: TransactionType!
    "Amount as a string of integer satoshis (e.g. \\"100000\\" = 0.001 BTC); never a float."
    amount: String!
    "Fee rate in sat/vB, as a string."
    feeRate: String!
    "Current lifecycle status of the transaction."
    status: TransactionStatus!
    "Number of confirmations observed on-chain."
    confirmations: Int!
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

  "The owner is always the authenticated caller; it cannot be set by the client."
  input CreateWalletInput {
    label: String!
    network: Network!
    type: WalletType!
    metadata: JSON
  }

  input UpdateWalletMetadataInput {
    label: String
    metadata: JSON
  }

  "Creates an outgoing (send) transaction. Only SEND is supported through the API."
  input CreateTransactionInput {
    walletId: String!
    "Amount as a string of integer satoshis, > 0 (pattern ^[1-9][0-9]{0,15}$)."
    amount: String!
    "Fee rate in sat/vB, as a string."
    feeRate: String!
    destinationAddress: String!
    "Client-generated unique key (e.g. a UUID); retries with the same key return the original transaction."
    idempotencyKey: String!
  }

  scalar JSON

  type Query {
    wallet(id: ID!): Wallet
    wallets(page: Int, limit: Int, ownerUserId: String): WalletConnection!
    transaction(id: ID!): Transaction
    transactions(
      walletId: String
      status: TransactionStatus
      from: String
      to: String
      page: Int
      limit: Int
    ): TransactionConnection!
  }

  type Mutation {
    createWallet(input: CreateWalletInput!): Wallet!
    updateWalletMetadata(id: ID!, input: UpdateWalletMetadataInput!): Wallet!
    createTransaction(input: CreateTransactionInput!): Transaction!
  }
`;
