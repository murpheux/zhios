# yone Postman collection

A test suite for the yone notification service API: email, SMS, Slack, and Teams notifications.

| File | Purpose |
|---|---|
| `yone.postman_collection.json` | The collection (Postman v2.1) |
| `yone-local.postman_environment.json` | Local development stack environment |

## What's covered

The collection has 14 requests organized into 6 folders:

| Folder | Requests | Endpoints |
|---|---|---|
| Health & Readiness | 2 | `GET /healthz`, `GET /readyz` |
| Email Notifications | 3 | `POST /api/v1/notifications/email` (plain text, HTML, validation failure) |
| SMS Notifications | 2 | `POST /api/v1/notifications/sms` (short and long messages) |
| Slack Notifications | 3 | `POST /api/v1/notifications/slack` (default target, named target, with markdown) |
| Teams Notifications | 2 | `POST /api/v1/notifications/teams` (with title, named target) |
| Authentication & Error Handling | 2 | Missing token and invalid token (401 unauthorized) |

All notification requests return 202 Accepted when successful. Service-to-service calls require an `x-service-token` header.

## Auth: Service Token

All notification endpoints are **internal only** and require an `x-service-token` header with a service JWT.

The collection-level pre-request script mints service tokens (HS256) signed with `internalJwtSecret`. It sets the `serviceToken` collection variable before each authenticated request.

- **Token claims:** `{sub: 'wallet-service', aud: 'yone', role: 'service', iss: 'zhios', iat, exp: now+300s}`
- **Secret:** `internalJwtSecret` (from the environment, minimum 32 chars)
- **Negative cases:** no token, invalid token (invalid signature or structure)

## Run in the Postman app

1. **Import** `yone.postman_collection.json` and create/select an environment
2. Set these variables in the environment (**Current value** column):
   - `yoneUrl` — the service base URL (default: `http://localhost:3005`)
   - `internalJwtSecret` — the shared service token secret (from `INTERNAL_JWT_SECRET`)
3. Open **Run collection** and run all requests, or pick a folder

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `yoneUrl` | `http://localhost:3005` | Base URL of the yone service |
| `internalJwtSecret` | *(empty)* | HS256 secret for minting service tokens; required for authenticated requests |
| `internalJwtTtlSeconds` | `300` | Token expiry (seconds); min 30, max 3600 |
| `internalJwtIssuer` | `zhios` | Token issuer claim |
| `serviceTokenSub` | `wallet-service` | Token subject claim (service name) |
| `serviceTokenAudience` | `yone` | Token audience claim (target service) |
| `serviceToken` | *(empty)* | Minted by the pre-request script (don't set manually) |

## Error codes

The service returns these error codes on failures:

| Code | Status | Cause |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Schema validation failed (missing required field, invalid format, etc.) |
| `UNAUTHORIZED` | 401 | Missing or invalid `x-service-token` header |
| `CHANNEL_NOT_CONFIGURED` | 503 | Provider credentials not configured (e.g., `SENDGRID_API_KEY` not set) |
| `INTERNAL_ERROR` | 500 | Unexpected server error (details not exposed to the client) |

## Troubleshooting

| Symptom | Fix |
|---|---|
| All authenticated requests return 401 | Check that `internalJwtSecret` is set in the environment and matches the service's `INTERNAL_JWT_SECRET` |
| Requests return 503 `CHANNEL_NOT_CONFIGURED` | The provider is not configured. Set the required credentials in the service config (e.g., `SENDGRID_API_KEY` for email, `TWILIO_ACCOUNT_SID` for SMS) |
| `yoneUrl` is unreachable | Verify the service is running on the configured port (default 3005) |
