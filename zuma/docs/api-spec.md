# API Spec

> **Postman collection**: [docs/postman/](postman/README.md) has a collection covering every REST and GraphQL endpoint, plus two environments: `zuma-local` (OIDC/JWKS for the root zhios stack) and `zuma-standalone-hs256` (for `zuma/docker-compose.yml` on its own). Tokens are minted automatically in pre-request scripts. Run it headless with `make postman` from the repo root, or `bash scripts/run-postman.sh`. See [docs/postman/README.md](postman/README.md).

Live, authoritative OpenAPI/Swagger docs are served at `/docs` on each running service (via `@fastify/swagger-ui`, wired in each service's `app.ts` through `api/plugins/swagger.ts`). The listing below is a summary grounded in the current route definitions; treat `/docs` as the source of truth at runtime.

Public routes require a valid user JWT (`Authorization: Bearer <token>`, enforced by `requireAuth`) and are mounted under `/api/v1`. Service-only routes are mounted under `/internal` and require an `x-service-token` (short-lived HS256 token signed with `INTERNAL_JWT_SECRET`, audience = receiving service). Keep `/internal/*` off the public ingress.

Conventions:

- Path ids must be Mongo ObjectIds (`^[a-f0-9]{24}$`). Anything else returns `400 VALIDATION_ERROR`, never a 500.
- Money is **integer satoshis as decimal strings** (`"100000"`, never `"0.001"`). `balanceCache` is the stored satoshi balance.
- Authorization: owners can read and write. `admin` and `auditor` can **read** any wallet or transaction, but writes (metadata update, create tx, broadcast) are **owner-only**. A privileged non-owner gets `403`; any other non-owner gets `404`, so existence isn't confirmed.
- Errors: `{statusCode, code, message, details?}`. Conflict codes (`409`): `INSUFFICIENT_FUNDS`, `WALLET_NOT_ACTIVE`, `IDEMPOTENCY_CONFLICT`, `NETWORK_MISMATCH`, `INVALID_TRANSACTION_STATE`, `BROADCAST_IN_PROGRESS`, `BROADCAST_FAILED`, `REFUND_WITHOUT_DEBIT`.

## wallet-service (`services/wallet-service/src/api/routes/`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/wallets` | user | Create a wallet |
| `GET` | `/api/v1/wallets/:id` | owner / privileged read | Get a wallet by id |
| `GET` | `/api/v1/wallets` | user | List wallets (query: `page`, `limit`, `ownerUserId`; non-privileged callers always scoped to themselves) |
| `PATCH` | `/api/v1/wallets/:id/metadata` | **owner only** | Update a wallet's label/metadata |
| `GET` | `/api/v1/wallets/:id/balance` | owner / privileged read | Stored balance `{walletId, balanceCache}` (satoshis) |
| `GET` | `/api/v1/wallets/:id/transactions` | owner / privileged read | Transaction history (proxies to transaction-service) |
| `POST` | `/api/v1/admin/wallets/:id/deposits` | **`admin` role** | Dev/test funding until a chain observer exists: body `{amountSats, reference}` (reference `^[A-Za-z0-9:._-]{1,128}$`, idempotency key). Ledger credit, reason `deposit`. Returns `{walletId, balanceCache}` |
| `GET` | `/internal/wallets/:id` | service: `transaction-service` | `{id, ownerUserId, status, network, address}` for explicit ownership/status checks |
| `POST` | `/internal/wallets/:id/debits` | service: `transaction-service` | Body `{transactionId, amountSats}`. Atomic guarded debit, idempotent by `transactionId` (a replay returns the original result). `404`, `409 WALLET_NOT_ACTIVE`, `409 INSUFFICIENT_FUNDS`, `409 IDEMPOTENCY_CONFLICT` |
| `POST` | `/internal/wallets/:id/credits` | service: `transaction-service` | Body `{transactionId, amountSats, reason: "refund"}`. Refund of an applied debit (same wallet and amount, otherwise `409 REFUND_WITHOUT_DEBIT`). Idempotent |

### Example: `POST /api/v1/wallets`

Request:

```json
{
  "label": "Primary hot wallet",
  "network": "testnet",
  "type": "hot",
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

### Example: `POST /api/v1/admin/wallets/6659e2f1b2c1a4f1a0a1b2c3/deposits`

```json
{ "amountSats": "250000", "reference": "faucet-2026-10-31-001" }
```

Response (`200`): `{ "walletId": "6659e2f1b2c1a4f1a0a1b2c3", "balanceCache": "250000" }`

## transaction-service (`services/transaction-service/src/api/routes/transaction.routes.ts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/transactions` | **wallet owner only** | Create a send: build, sign, persist, then debit amount + fee. **`Idempotency-Key` header required** |
| `POST` | `/api/v1/transactions/:id/validate` | owner / privileged read | Read-only check that a pending tx is signed and funded |
| `POST` | `/api/v1/transactions/:id/broadcast` | **owner only** | Broadcast a funded pending transaction |
| `GET` | `/api/v1/transactions/:id` | owner / privileged read | Get a transaction by id |
| `GET` | `/api/v1/transactions` | user | List (query: `page`, `limit`, `walletId`, `status`, `from`, `to`) |
| `GET` | `/api/v1/transactions/:id/status` | owner / privileged read | `{transactionId, status, confirmations}`. Its only write is the CAS `broadcast → confirmed` |

`POST /api/v1/transactions` validation:

| Field | Rule |
|---|---|
| `Idempotency-Key` header | required, `^[A-Za-z0-9._:-]{8,128}$`. Same key and same body returns the original transaction; same key with a different body returns `409 IDEMPOTENCY_CONFLICT`. Concurrent duplicates are resolved via the unique index (E11000) and get the same answer |
| `walletId` | ObjectId; the caller must own it (`403` otherwise, including admin/auditor). The wallet must be `active` (`409 WALLET_NOT_ACTIVE`) and on the service's `BITCOIN_NETWORK` (`409 NETWORK_MISMATCH`) |
| `type` | only `"send"` (`receive` / `internal-transfer` → `400`) |
| `amount` | satoshis, `^[1-9][0-9]{0,15}$`, ≤ 2.1e15 |
| `feeRate` | sat/vB string, `1..10000` |
| `destinationAddress` | required. The schema checks only the shape; the use-case validates against the wallet's network: bech32/bech32m with full checksum (`bc1`/`tb1`/`bcrt1`), base58 by version prefix only (`1`/`3` mainnet, `m`/`n`/`2` testnet/regtest) |

Failure semantics: a debit rejection marks the transaction `failed` (with `failureReason`) and returns `409 INSUFFICIENT_FUNDS` or `409 WALLET_NOT_ACTIVE`. Replaying the key returns the same 409. If wallet-service is unreachable, the call returns `5xx` and the tx stays `pending` and unfunded; retry with the same key. Broadcast: if the node rejects the transaction, it is marked `failed`, refunded, and returns `409 BROADCAST_FAILED`. If the outcome is unknown, the tx stays `broadcasting`, nothing is refunded, and it is flagged for reconciliation.

### Example: `POST /api/v1/transactions`

Headers: `Idempotency-Key: 7d1c1f0e-3b7a-4a55-9c1e-2f1d8f9b0a11`

Request:

```json
{
  "walletId": "6659e2f1b2c1a4f1a0a1b2c3",
  "type": "send",
  "amount": "15000",
  "feeRate": "8",
  "destinationAddress": "tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7"
}
```

Response (`201`, `rawTx` is never returned):

```json
{
  "id": "6659e310b2c1a4f1a0a1b2c4",
  "walletId": "6659e2f1b2c1a4f1a0a1b2c3",
  "txid": null,
  "type": "send",
  "amount": "15000",
  "feeRate": "8",
  "feeSats": "1128",
  "destinationAddress": "tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7",
  "status": "pending",
  "failureReason": null,
  "confirmations": 0,
  "createdAt": "2026-01-01T00:05:00.000Z",
  "updatedAt": "2026-01-01T00:05:00.000Z"
}
```

## graphql-gateway (`graphql/src/schema/typedefs.ts`)

The gateway exposes a single `/graphql` endpoint (Mercurius) plus `/healthz` (liveness) and `/readyz` (readiness: both upstreams' `/healthz` answer within 2s). It is a composition layer with no own database — resolvers call `wallet-service` and `transaction-service` over HTTP, forwarding the caller's `Authorization` header, with a per-call timeout (`UPSTREAM_TIMEOUT_MS`, default 5000).

Limits and production behaviour:

- Query depth is capped at `GRAPHQL_QUERY_DEPTH` (default 8).
- GraphiQL is served only outside production.
- Introspection is disabled in production unless `GRAPHQL_INTROSPECTION_ENABLED=true`.
- CORS: only origins listed in `CORS_ALLOWED_ORIGINS` (comma-separated) may call `/graphql` from a browser.

Conventions:

- Amounts (`amount`, `balanceCache`) are **strings of integer satoshis** (`"100000"` = 0.001 BTC), never floats. `CreateTransactionInput.amount` must match `^[1-9][0-9]{0,15}$`.
- Enums are UPPER_SNAKE_CASE and map 1:1 to REST values: `TransactionType.INTERNAL_TRANSFER` ↔ `internal-transfer`, `WalletType.NON_CUSTODIAL` ↔ `non-custodial`, `Network.TESTNET` ↔ `testnet`, etc.
- `rawTx` is not exposed; the wallet owner is always the authenticated caller (no `ownerUserId` input).

```graphql
enum Network { MAINNET TESTNET REGTEST }
enum WalletType { HOT COLD CUSTODIAL NON_CUSTODIAL }
enum WalletStatus { ACTIVE SUSPENDED ARCHIVED }
enum TransactionStatus { PENDING BROADCASTING BROADCAST CONFIRMED FAILED }
enum TransactionType { SEND RECEIVE INTERNAL_TRANSFER }

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

input CreateTransactionInput {
  walletId: String!
  amount: String!          # integer satoshis
  feeRate: String!         # sat/vB
  destinationAddress: String!
  idempotencyKey: String!  # forwarded as Idempotency-Key; 8-128 chars [A-Za-z0-9_-]
}

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
  createTransaction(input: CreateTransactionInput!): Transaction!  # always type SEND
}
```

### Errors

Resolver failures are returned as GraphQL errors with `extensions.code` (and `extensions.statusCode`):

| Source | `extensions.code` | Message |
|---|---|---|
| Upstream 4xx | upstream `code` (e.g. `NOT_FOUND`, `INSUFFICIENT_FUNDS`, `IDEMPOTENCY_CONFLICT`) | upstream message |
| Upstream 5xx | `UPSTREAM_ERROR` | generic |
| Upstream timeout / unreachable | `UPSTREAM_TIMEOUT` / `UPSTREAM_UNAVAILABLE` | generic |
| Gateway input check | `BAD_USER_INPUT` | what is wrong |
| Anything else | `INTERNAL_ERROR` | `Internal server error` |

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

### Example mutations

```graphql
mutation CreateWallet {
  createWallet(input: { label: "Primary hot wallet", network: TESTNET, type: HOT }) {
    id
    address
    status
  }
}

mutation Send {
  createTransaction(
    input: {
      walletId: "6659e2f1b2c1a4f1a0a1b2c3"
      amount: "15000"
      feeRate: "8"
      destinationAddress: "tb1qdestinationaddressexample"
      idempotencyKey: "3f1c2a7e-8b8a-4b55-9d0e-0f3c1c2a7e8b"
    }
  ) {
    id
    status
    type
  }
}
```
