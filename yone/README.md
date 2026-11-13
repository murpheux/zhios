# yone - notification gateway

Fastify service that sends **email**, **SMS**, **Slack** and **Microsoft Teams** notifications on behalf of other zuma services.

Fully standalone project: no dependency on `zuma/` packages (own errors, config, logging, helmet/CORS/rate-limit and `x-service-token` middleware). All commands run from `yone/`.

## Architecture

```
api/             Fastify routes + JSON-schema validation, service-token auth   -> application/
application/     One use-case per channel; provider ports                      -> domain/
domain/          Validation rules (E.164, email, target names), errors         -> nothing
infrastructure/  Provider adapters (SendGrid, Twilio, Slack, Teams) over fetch -> implements ports
```

`src/app.ts` is the composition root (`providersFromConfig` builds adapters from config; tests pass mocks instead).

| Channel | Use-case | Port | Adapter |
|---|---|---|---|
| email | `SendEmailUseCase` | `EmailSenderPort` | `SendGridEmailSender` (Twilio SendGrid v3) |
| SMS | `SendSmsUseCase` | `SmsSenderPort` | `TwilioSmsSender` (Twilio Messaging) |
| Slack | `NotifySlackUseCase` | `ChatNotifierPort` | `SlackWebhookNotifier` (incoming webhook) |
| Teams | `NotifyTeamsUseCase` | `ChatNotifierPort` | `TeamsWebhookNotifier` (Workflows webhook, Adaptive Card) |

Wire DTOs live in `src/shared/notification.dto.ts` (callers can copy or import them). Config is a self-contained zod schema in `src/config/yone-config.ts`.

A channel with no credentials still lets the service boot; its endpoint answers `503 CHANNEL_NOT_CONFIGURED`. Partial configuration (e.g. an API key without a from-address) fails startup.

### Security model

- All `/api/v1/notifications/*` routes need an `x-service-token` header equal (constant-time compare) to one of `ALLOWED_SERVICE_TOKENS` (CSV, each >= 16 chars; required in production). Missing/invalid -> 401. No end-user access.
- Slack/Teams webhook URLs are bearer secrets: they live only in config, callers pick a **named target** (never a URL), and config hosts are pinned (`*.slack.com`; `*.webhook.office.com`, `*.logic.azure.com`, `*.api.powerplatform.com`) with https required. Redirects are not followed. This prevents the gateway being used as an SSRF proxy.
- Provider error bodies are never returned to callers (they can echo recipients or account ids); callers get a stable `502/503/504` code. Sends are not retried (a retry could duplicate a notification).
- Email subjects have CR/LF stripped; each recipient gets its own SendGrid personalization so recipients never see each other.

## API

Base path `/api/v1/notifications`, `POST`, JSON, returns `202 {channel, status: "accepted", providerMessageId?}`. Unknown body properties are stripped.

| Endpoint | Body |
|---|---|
| `/email` | `{ "to": ["a@example.com"], "subject": "...", "text": "...", "html": "..." }` (1-50 recipients; text and/or html) |
| `/sms` | `{ "to": "+14035550123", "body": "..." }` (E.164, max 1600 chars) |
| `/slack` | `{ "target": "default", "text": "..." }` |
| `/teams` | `{ "target": "default", "title": "...", "text": "..." }` |

Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `429 RATE_LIMITED`, `502 UPSTREAM_ERROR`, `503 UPSTREAM_UNAVAILABLE | CHANNEL_NOT_CONFIGURED`, `504 UPSTREAM_TIMEOUT`. Probes: `/healthz`, `/readyz` (no provider reachability check, so a Slack outage cannot pull the pod out of rotation).

## Configuration

| Variable | Required | Notes |
|---|---|---|
| `ALLOWED_SERVICE_TOKENS` | prod | CSV of accepted `x-service-token` values, each >= 16 chars |
| `PORT` | no | default `3004` |
| `NOTIFICATION_TIMEOUT_MS` | no | provider call timeout, default 5000 |
| `SENDGRID_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME` | email | key + from-address together; sender must be verified in SendGrid |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | SMS | plus one of `TWILIO_SMS_FROM` (E.164) or `TWILIO_MESSAGING_SERVICE_SID` |
| `SLACK_WEBHOOK_URLS` | Slack | JSON map `{"default":"https://hooks.slack.com/services/..."}` |
| `TEAMS_WEBHOOK_URLS` | Teams | JSON map `{"default":"https://...logic.azure.com/..."}` |

Also: `LOG_LEVEL`, `CORS_ALLOWED_ORIGINS`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW`, `TRUST_PROXY`, `HTTP_*`, `SHUTDOWN_TIMEOUT_MS`. Teams: Office 365 connector webhooks are retired; create a **Workflows** "Post to a channel when a webhook request is received" webhook.

## 1Password setup

`yone.op.env` holds `op://` **references only** (safe to commit). Create these items in the `zuma` vault (adjust the vault/item names in that file if you use others):

| Reference | Value |
|---|---|
| `op://zuma/yone-gateway/service_tokens` | CSV of service tokens shared with callers |
| `op://zuma/yone-email-gateway/api_key` | SendGrid API key, scope "Mail Send" only |
| `op://zuma/yone-email-gateway/from_address` | verified sender address |
| `op://zuma/yone-sms-gateway/account_sid` | Twilio Account SID (`AC...`) |
| `op://zuma/yone-sms-gateway/auth_token` | Twilio Auth Token (or API key secret) |
| `op://zuma/yone-sms-gateway/messaging_service_sid` | Messaging Service SID (`MG...`); or replace with a `TWILIO_SMS_FROM` reference |
| `op://zuma/yone-slack/webhook_urls` | JSON map of target -> Slack webhook URL |
| `op://zuma/yone-teams/webhook_urls` | JSON map of target -> Teams Workflows URL |

Delete any line from `yone.op.env` for a channel you don't use. `op run` fails if a referenced item is missing.

## Local workflow

```zsh
cd yone
npm install
npm run dev:op              # predev builds the shared refs, then op run --env-file=yone.op.env -- tsx watch src/index.ts
npm run dev                 # same without 1Password (export INTERNAL_JWT_SECRET etc. yourself)
```

`op run` resolves each `op://` reference into the child process environment only; nothing is written to disk. `op plugin run -- <cmd>` is for CLIs with a 1Password shell plugin (aws, gh, ...) and does not inject arbitrary `op://` env vars, so `op run --env-file` is the injection mechanism here. Without 1Password, export `ALLOWED_SERVICE_TOKENS` (and whichever channel variables you need) in your shell; do not create committed `.env` files.

Tests (all providers mocked; no network, no credentials):

```zsh
npm test
npm test -- --coverage
npm run lint
npm run build
```

Smoke test (mint a token with `createServiceTokenSigner` from `@zuma/shared-http`, audience `yone`, caller in `ALLOWED_CALLERS`):

```zsh
curl -sS -X POST localhost:3004/api/v1/notifications/slack \
  -H "x-service-token: $TOKEN" -H 'content-type: application/json' -d '{"text":"hello from yone"}'
```

## Decisions

### Email + SMS gateway: Twilio (SendGrid for email, Twilio Messaging for SMS)

Candidates: SendGrid, Resend, Mailgun, Twilio. Resend and Mailgun are email-only (Mailgun has no first-party SMS), so choosing either still needs a second vendor for SMS. SendGrid is email-only on its own but is a Twilio product, so **Twilio** is the only option that covers both under one vendor, one invoice, one account/console and one support relationship.

| Factor | Assessment |
|---|---|
| Cost | Pay-as-you-go for both; competitive at low volume, Resend is cheaper/nicer for email-only. Verify current pricing and free-tier terms before committing (they change). |
| Docs / API | Mature, stable REST APIs (SendGrid v3, Messaging 2010-04-01); both usable with plain `fetch`, so no SDK dependency. |
| Reliability | Long-established delivery infrastructure, status pages, SMS carrier coverage incl. Canada. |

Caveat: SendGrid and Twilio SMS still use **separate credentials** (API key vs Account SID/Auth Token), which is why they are separate 1Password items. If email volume/DX matters more than vendor consolidation, swapping to Resend is a single new adapter.

### Why ports for providers

- Use-cases depend on `EmailSenderPort`, `SmsSenderPort`, `ChatNotifierPort` only, so unit tests inject `jest.fn()` mocks: no network, no credentials, deterministic failure injection.
- Swapping or adding a provider (Resend, SNS, a second SMS carrier) touches only `infrastructure/` and `providersFromConfig`.
- Provider quirks (SendGrid personalizations, Twilio form encoding, Teams Adaptive Cards) stay out of domain and application code.
- Adapters take an injectable `fetch`, so request shaping and error mapping are tested against fake responses without real services.
- Missing credentials are modelled as a null-object adapter, keeping "channel not configured" out of the use-cases.

## Not done / follow-ups

- `npm install` has not been run in `yone/` yet (generates `package-lock.json`).
- No Dockerfile, Kubernetes manifests or CI entry yet (the build context will need to include `zuma/shared`, since yone depends on it).
- No queueing/retry or delivery-status webhooks; sends are synchronous and at-most-once.
