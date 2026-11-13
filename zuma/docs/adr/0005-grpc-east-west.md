# ADR-0005: gRPC for inter-service communication

* Status: proposed
* Date: 2026-11-13
* Deciders: Murpheux
* Design doc: `zuma/docs/grpc-design.md` (to be written in Phase 1)

## Context and Problem Statement

East-west calls are JSON over HTTP today: `wallet-service` -> `transaction-service` (`GET /wallets/:id/transactions`) and `transaction-service` -> `wallet-service` (ownership checks, `/internal/wallets/:id/{debits,credits}`), authenticated by a short-lived `x-service-token` (HS256, `INTERNAL_JWT_SECRET`). The GraphQL gateway fans out to both over REST. Goals: typed contracts shared across services (including yone and ozzo), lower per-call overhead and latency on the debit/credit path, deadlines and cancellation propagation, and a path to transport-level service identity.

## Decision

Adopt gRPC for east-west (service-to-service) traffic only. North-south REST APIs and the GraphQL gateway's public interface are unchanged. Service-token verification is retained at the application layer (`verifyServiceToken` in `@zuma/shared-http`, sent as gRPC metadata) in addition to transport security. Rollout is staged and per-endpoint, with HTTP routes kept until each gRPC path is proven.

## Consequences

* Good: protobuf contracts, generated clients, deadlines, streaming available, smaller payloads.
* Good: mTLS gives workload identity between services; token `aud`/`sub` checks remain as defence in depth.
* Bad: new tooling (proto codegen, buf), harder ad hoc debugging than curl, new health/reflection setup.
* Bad: dual HTTP+gRPC surface during migration.
* Staged rollout: Phase 0 prep (port fix, reusable verifier, this ADR); Phase 1 ports, handlers and clients behind a feature flag; Phase 2 migrate debits/credits, then reads; Phase 3 retire internal HTTP routes.
* mTLS required in all non-local environments; plaintext only for local dev.

## Considered Alternatives

* Keep HTTP/JSON: lowest effort, no new tooling; but no schema-enforced contracts and no transport identity.
* Connect RPC: protobuf contracts with HTTP/1.1+JSON compatibility and browser support; smaller ecosystem and less mature mTLS/interceptor tooling for Node; browser reach is not needed east-west.

## Risks

* Certificate management: issuance, rotation and revocation for mTLS across Docker, Kubernetes and Lambda paths; mitigate with a short-lived internal CA (e.g. cert-manager / SPIFFE) and expiry alerting.
* Load balancing of long-lived HTTP/2 connections behind Kubernetes Services (needs client-side or L7 balancing).
* Contract drift during dual-stack period; mitigate with `buf breaking` in CI.
