# Domain Model

## Entities

### Wallet (`services/wallet-service/src/domain/entities/wallet.entity.ts`)

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | |
| `label` | `string` | User-facing name |
| `address` | `string` | Bitcoin address, assigned by `AddressGenerator` port on creation |
| `network` | `WalletNetwork` | `mainnet` \| `testnet` \| `regtest` |
| `type` | `WalletKind` | `hot` \| `cold` \| `custodial` \| `non-custodial` |
| `balanceCache` | `string` | Cached satoshi balance, starts at `"0"` |
| `metadata` | `Record<string, unknown>` | Arbitrary user-supplied data |
| `ownerUserId` | `string` | Owning user |
| `status` | `WalletLifecycleStatus` | `active` \| `suspended` \| `archived` |
| `createdAt` / `updatedAt` | `Date` | |

### Transaction (`services/transaction-service/src/domain/entities/transaction.entity.ts`)

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | |
| `walletId` | `string` | FK to `Wallet.id` |
| `txid` | `string \| null` | On-chain id, set once broadcast |
| `type` | `TransactionKind` | `send` \| `receive` |
| `amount` | `string` | Satoshis, as string to avoid float precision loss |
| `feeRate` | `string` | |
| `status` | `TransactionLifecycleStatus` | `pending` \| `broadcast` \| `confirmed` \| `failed` |
| `confirmations` | `number` | |
| `rawTx` | `string \| null` | Raw signed tx hex; redacted from logs (see [security.md](./security.md)) |
| `createdAt` / `updatedAt` | `Date` | |

> Note: the shared DTO layer (`shared/common/src/dto/transaction.dto.ts`) exposes a slightly wider `TransactionType`/`TransactionStatus` union (`internal-transfer`, `signed`, `rejected`) than the transaction-service's own domain value objects currently implement — treat the domain entity as the source of truth for current behavior.

### AuditLog (`services/transaction-service/src/domain/entities/audit-log.entity.ts`)

Immutable record of a sensitive or state-changing action, for compliance/audit trails.

| Field | Type |
|---|---|
| `id` | `string` |
| `actorUserId` | `string` |
| `action` | `string` |
| `entityType` | `string` |
| `entityId` | `string` |
| `metadata` | `Record<string, unknown>` |
| `createdAt` | `Date` |

### SystemEvent (`services/transaction-service/src/domain/entities/system-event.entity.ts`)

Internal domain/system event, intended for eventual outbox/event-bus publication.

| Field | Type |
|---|---|
| `id` | `string` |
| `eventType` | `string` |
| `payload` | `Record<string, unknown>` |
| `createdAt` | `Date` |

## Value objects

| Value object | Values | Owner |
|---|---|---|
| `WalletNetwork` | `mainnet` \| `testnet` \| `regtest` | wallet-service |
| `WalletKind` | `hot` \| `cold` \| `custodial` \| `non-custodial` | wallet-service |
| `WalletLifecycleStatus` | `active` \| `suspended` \| `archived` | wallet-service |
| `TransactionKind` | `send` \| `receive` | transaction-service |
| `TransactionLifecycleStatus` | `pending` \| `broadcast` \| `confirmed` \| `failed` | transaction-service |

## Relationships and aggregate boundaries

- **Wallet 1 → N Transaction** via `Transaction.walletId`. Wallet and Transaction are separate aggregates owned by separate services (`wallet-service` and `transaction-service`), each with its own MongoDB database — there is no shared transactional boundary between them.
- Cross-aggregate consistency is maintained via synchronous HTTP calls at the application layer (not a database join): `transaction-service` calls `wallet-service` to validate wallet state before creating a transaction, and `wallet-service` calls `transaction-service` to fetch transaction history for a wallet.
- `AuditLog` and `SystemEvent` are standalone aggregates within `transaction-service`, each keyed by its own `id`, referencing other entities loosely via `entityType`/`entityId` (AuditLog) or an opaque `payload` (SystemEvent) rather than foreign keys — this keeps them append-only and decoupled from the lifecycle of the entities they describe.
