# ozzo OpenAPI Specification

OpenAPI 3.1.0 specification for the ozzo microservice (account & subscription management).

## Files

- **`openapi.yaml`** — Complete OpenAPI 3.1.0 specification in YAML format

## Overview

The ozzo API provides:

- **User Management** — Create, read, update user profiles with address and personal information
- **Bank Accounts** — Link, list, update, and delete bank accounts (checking/savings)
- **Wallet Sync** — Synchronize cryptocurrency wallets from the zuma wallet service
- **Health/Readiness Checks** — Operational probes for load balancers and orchestration

All endpoints (except `/healthz` and `/readyz`) require Bearer token authentication via Okta access tokens.

## Authentication

All authenticated endpoints require an `Authorization: Bearer <token>` header with a valid JWT token from Okta. The token is verified using either:

- **HS256:** Signed with `JWT_SECRET` (shared key)
- **OIDC/JWKS:** Keys resolved from `JWT_JWKS_URI` (asymmetric)

The service rejects tokens missing the `sub` (subject) or `exp` (expiration) claims.

## Sensitive Data Handling

### SIN/SSN (Social Insurance / Social Security Numbers)

SIN (Canada), SSN (US), and NINO (UK) are sensitive personally identifiable information. The API accepts these in create/update requests but **never returns them in responses**. Instead:

- On create (`POST /users`), the SIN/SSN is encrypted via a KMS adapter (in infrastructure layer)
- On read (`GET /users/:id`, `/users/:id/profile`), the field is omitted from the response
- The SIN/SSN is stored encrypted in the database and decrypted only for compliance/audit purposes

This pattern follows the Clean Architecture principle: the domain and application layers define the contract (SIN/SSN exists but is sensitive), and the infrastructure layer handles encryption transparently.

### Address Data

Full address information is stored and returned. It includes:

- Street address
- City
- State/Province
- Country (ISO 3166-1 alpha-2 code)
- Postal code (format validated per region)
- Region enum (US, CA, UK) for postal code normalization and SIN/SSN validation

## Schema Validation

All requests are validated against JSON schemas before reaching the handler:

- **400 VALIDATION_ERROR** — Malformed request (missing fields, invalid types, constraint violations)
- **401 UNAUTHORIZED** — Missing or invalid authentication token
- **403 FORBIDDEN** — Authenticated but not authorized to access the resource
- **404 NOT_FOUND** — Resource does not exist
- **409 CONFLICT** — Business logic violation (e.g., account not empty, user already exists)

## Error Responses

All error responses follow this structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {
      "field": "fieldName",
      "reason": "specific reason"
    }
  }
}
```

Common error codes:

| Code | HTTP Status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request body or parameters invalid |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication token |
| `FORBIDDEN` | 403 | Authenticated but not authorized |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Business logic violation |
| `INTERNAL_ERROR` | 500 | Server-side error (details never exposed) |

## Usage

### With OpenAPI Tools

1. **Import into Postman, Insomnia, or other clients:**
   - Use the "Import" feature and select `openapi.yaml`
   - All endpoints will be pre-populated with request/response examples

2. **Generate client SDKs:**
   ```bash
   # Using openapi-generator-cli
   docker run --rm \
     -v $(pwd):/local \
     openapitools/openapi-generator-cli generate \
     -i /local/docs/openapi/openapi.yaml \
     -g typescript-fetch \
     -o /local/generated/ozzo-client
   ```

3. **Validate the spec:**
   ```bash
   npm install -g spectacle-docs
   spectacle docs/openapi/openapi.yaml -t build/docs
   ```

### Live API Documentation

When ozzo is running, visit:

- **`http://localhost:3004/docs`** — Scalar API reference (interactive documentation)
- **`http://localhost:3004/openapi.json`** — Raw OpenAPI JSON (generated from code)

### Generating from Live Service

To extract the live OpenAPI spec (which includes any runtime schema modifications):

```bash
curl http://localhost:3004/openapi.json > docs/openapi/openapi-generated.json
```

## Region-Specific Postal Codes

Postal code validation depends on the `region` field in the address:

### US (region: "US")
- Format: 5-digit ZIP or ZIP+4 (12345 or 12345-6789)
- Validation: Pattern `^\d{5}(-\d{4})?$`

### Canada (region: "CA")
- Format: Canadian postal code (A1A 1A1)
- Validation: Pattern `^[A-Z]\d[A-Z]\s?\d[A-Z]\d$` (case-insensitive)

### UK (region: "UK")
- Format: Full postcode or outward code (SW1A 1AA or SW1A)
- Validation: Flexible pattern allowing common UK postcode formats

## Next of Kin & Contact Person

These are required fields for user registration:

- **Next of Kin:** Emergency contact (name, relationship, phone)
- **Contact Person:** Business contact (name, title, email)

Both are returned in profile responses and can be updated via PATCH.

## Caching

### Wallet Sync Caching

The `GET /users/:id/wallet` endpoint caches results in Redis with a configurable TTL (default 300s):

- First call fetches from zuma wallet-service
- Subsequent calls (within TTL) return cached data
- `cached: true` in response indicates the result came from cache
- Cache is invalidated on user updates or explicit cache-clear operations

## Rate Limiting

All endpoints are subject to rate limiting (default 100 requests per minute per user):

- Authenticated requests: Limited by JWT `sub` claim
- Requests without authentication: Limited by client IP
- `/healthz` and `/readyz` are exempt

Rate limit exceeded → **429 TOO_MANY_REQUESTS**

## OpenAPI Conformance

- **OpenAPI version:** 3.1.0
- **Security schemes:** HTTP Bearer (JWT)
- **Content types:** `application/json`
- **Status codes:** Standardized 2xx/4xx/5xx responses

See the full schema in `openapi.yaml` for complete details.
