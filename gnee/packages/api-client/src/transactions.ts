import type { ZumaClient } from "./client";
import type {
  CreateTransactionInput,
  ListTransactionsParams,
  Transaction,
  TransactionConnection,
} from "./types";

const TRANSACTION_FIELDS = /* GraphQL */ `
  id
  walletId
  txid
  type
  amount
  feeRate
  status
  confirmations
  rawTx
  createdAt
  updatedAt
`;

const GET_TRANSACTION = /* GraphQL */ `
  query Transaction($id: ID!) {
    transaction(id: $id) { ${TRANSACTION_FIELDS} }
  }
`;

const LIST_TRANSACTIONS = /* GraphQL */ `
  query Transactions(
    $walletId: String
    $status: String
    $from: String
    $to: String
    $page: Int
    $limit: Int
  ) {
    transactions(
      walletId: $walletId
      status: $status
      from: $from
      to: $to
      page: $page
      limit: $limit
    ) {
      items { ${TRANSACTION_FIELDS} }
      pageInfo { total page limit totalPages }
    }
  }
`;

const CREATE_TRANSACTION = /* GraphQL */ `
  mutation CreateTransaction($input: CreateTransactionInput!) {
    createTransaction(input: $input) { ${TRANSACTION_FIELDS} }
  }
`;

export function createTransactionsApi(client: ZumaClient) {
  return {
    get(id: string) {
      return client
        .request<{ transaction: Transaction | null }, { id: string }>(GET_TRANSACTION, { id })
        .then((d) => d.transaction);
    },
    list(params: ListTransactionsParams = {}) {
      return client
        .request<{ transactions: TransactionConnection }, ListTransactionsParams>(LIST_TRANSACTIONS, params)
        .then((d) => d.transactions);
    },
    create(input: CreateTransactionInput) {
      return client
        .request<{ createTransaction: Transaction }, { input: CreateTransactionInput }>(
          CREATE_TRANSACTION,
          { input }
        )
        .then((d) => d.createTransaction);
    },
  };
}

export type TransactionsApi = ReturnType<typeof createTransactionsApi>;
