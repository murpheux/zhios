# API Spec

> **Postman collection**: import [docs/postman/zuma.postman_collection.json](postman/zuma.postman_collection.json) and [docs/postman/zuma-local.postman_environment.json](postman/zuma-local.postman_environment.json) into Postman for ready-to-run REST and GraphQL requests against all three services. After importing, set the environment's `jwtToken` variable to a valid bearer token before running authenticated requests.

Live, authoritative OpenAPI/Swagger docs are served at `/docs` on each running service (via `@fastify/swagger-ui`, wired in each service's `app.ts` through `api/plugins/swagger.ts`). The listing below is a summary grounded in the current route definitions; treat `/docs` as the source of truth at runtime.

All routes below require a valid JWT (`Authorization: Bearer <token>`, enforced by `requireAuth`) and are mounted under the `/api/v1` prefix.

## wallet-service (`services/wallet-service/src/api/routes/wallet.routes.ts`)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/wallets` | Create a wallet |
| `GET` | `/api/v1/wallets/:id` | Get a wallet by id |
| `GET` | `/api/v1/wallets` | List wallets (query: `page`, `limit`, `ownerUserId`) |
| `PATCH` | `/api/v1/wallets/:id/metadata` | Update a wallet's label/metadata |
| `GET` | `/api/v1/wallets/:id/balance` | Get a wallet's cached balance |
| `GET` | `/api/v1/wallets/:id/transactions` | Get a wallet's transaction history (proxies to transaction-service) |

### Example: `POST /api/v1/wallets`

Request:

```json
{
  "label": "Primary hot wallet",
  "network": "testnet",
  "type": "hot",
  "ownerUserId": "user-123",
  "metadata": { "purpose": "payroll" }
}
```

Response (`201`):

```json
{
  "id": "6659e2f1b2c1a4f1a0a1b2c3",
  "label": "Primary hot wallet",
  "address": "tb1q...",
  "network": "testnet",
  "type": "hot",
  "balanceCache": "0",
  "metadata": { "purpose": "payroll" },
  "ownerUserId": "user-123",
  "status": "active",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

## transaction-service (`services/transaction-service/src/api/routes/transaction.routes.ts`)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/transactions` | Create a transaction (`type`: `send` \| `receive`) |
| `POST` | `/api/v1/transactions/:id/validate` | Validate a pending transaction |
| `POST` | `/api/v1/transactions/:id/broadcast` | Broadcast a validated transaction |
| `GET` | `/api/v1/transactions/:id` | Get a transaction by id |
| `GET` | `/api/v1/transactions` | List transactions (query: `page`, `limit`, `walletId`, `status`, `from`, `to`) |
| `GET` | `/api/v1/transactions/:id/status` | Get a transaction's current status |

### Example: `POST /api/v1/transactions`

Request:

```json
{
  "walletId": "6659e2f1b2c1a4f1a0a1b2c3",
  "type": "send",
  "amount": "15000",
  "feeRate": "8",
  "destinationAddress": "tb1qdestinationaddressexample"
}
```

Response (`201`):

```json
{
  "id": "6659e310b2c1a4f1a0a1b2c4",
  "walletId": "6659e2f1b2c1a4f1a0a1b2c3",
  "txid": null,
  "type": "send",
  "amount": "15000",
  "feeRate": "8",
  "status": "pending",
  "confirmations": 0,
  "rawTx": null,
  "createdAt": "2026-01-01T00:05:00.000Z",
  "updatedAt": "2026-01-01T00:05:00.000Z"
}
```

## graphql-gateway (`graphql/src/schema/typedefs.ts`)

The gateway exposes a single `/graphql` endpoint (Mercurius), with GraphiQL enabled outside production. It is a composition layer with no own database — `Query`/`Mutation` resolvers call `wallet-service` and `transaction-service` over HTTP.

Schema highlights: `Wallet`, `Transaction`, `WalletConnection`/`TransactionConnection` (paginated, with `PageInfo`), `CreateWalletInput`, `CreateTransactionInput`, a custom `JSON` scalar for wallet `metadata`.

```graphql
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
```

### Example query

```graphql
query GetWallet {
  wallet(id: "6659e2f1b2c1a4f1a0a1b2c3") {
    id
    label
    address
    network
    balanceCache
    status
  }
}
```

### Example mutation

```graphql
mutation CreateWallet {
  createWallet(
    input: {
      label: "Primary hot wallet"
      network: "testnet"
      type: "hot"
      ownerUserId: "user-123"
    }
  ) {
    id
    address
    status
  }
}
```
