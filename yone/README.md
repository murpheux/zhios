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

## Observability: Pino Logging and New Relic APM

yone includes comprehensive structured logging via pino and optional New Relic APM with provider instrumentation.

### Installation

Logging and APM dependencies are pre-configured. Install:

```bash
npm install
```

This installs: `pino`, `pino-pretty`, `pino-roll` (file rotation), and `newrelic`.

### Pino Logging

**Logger Factory** (`src/config/logger.ts`):
- Pretty-printed console output in development (colorized, readable)
- JSON structured logs in production (machine-parseable for log aggregation)
- Optional daily-rotating file logs with size cap and retention
- Automatic redaction of sensitive data (tokens, API keys, emails, phone numbers)
- Trace ID correlation when New Relic APM is enabled

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `LOG_LEVEL` | `info` | Log level: `fatal`, `error`, `warn`, `info`, `debug`, `trace` |
| `LOG_TO_FILE` | false (true in prod) | Write rotating files via `pino-roll` |
| `LOG_FILE_PATH` | `./logs` | Directory for log files (auto-created) |
| `LOG_FILE_MAX_SIZE` | `10485760` (10MB) | Max size before file rotation |
| `LOG_FILE_ROTATE_DAYS` | `7` | Days of logs to retain |
| `NEW_RELIC_ENABLED` | `false` | Enable New Relic APM agent |
| `NEW_RELIC_LICENSE_KEY` | unset | **Required if NEW_RELIC_ENABLED=true** |
| `NEW_RELIC_APP_NAME` | `yone-service` | Service name in New Relic dashboard |
| `NEW_RELIC_LOG_LEVEL` | `info` | New Relic agent's own log level |
| `NEWRELIC_LOGS_ENABLED` | `false` | Forward logs to New Relic Logs API |
| `NEWRELIC_LOGS_ENDPOINT` | `https://log-api.newrelic.com/log/v1` | US endpoint; EU: `.eu.newrelic.com` |

### Local Development (Pretty Logs)

```bash
# Start with debug logging
LOG_LEVEL=debug npm run dev

# Example output:
# [12:34:56.123] INFO (yone-service/12345): Server listening
#   port: 3004
#   env: "development"
```

### Local Development with File Logging

```bash
# Enable file output
LOG_TO_FILE=true npm run dev

# View logs
tail -f logs/yone.*.log

# Parse JSON logs
tail -f logs/yone.*.log | jq '.msg'
```

### Log Files and Rotation

**Location**: `./logs/` directory (auto-created)

**File naming**:
```
yone.2026-11-12.1.log       ← Today (current)
yone.2026-11-12.2.log       ← Rotated (>10MB)
yone.2026-11-11.1.log       ← Yesterday
yone.2026-11-10.1.log
yone.2026-11-03.1.log       ← 7 days back (auto-deleted)
```

**Triggers**:
- Daily at midnight (UTC)
- Immediately if file exceeds 10MB
- Old files auto-deleted after 7 days

### Output Formats

**Development** (`NODE_ENV=development`):
```
[12:34:56.789] INFO (yone/1234): Notification sent
  provider: "sendgrid"
  recipients: 2
  duration_ms: 145
```

**Production** (`NODE_ENV=production`):
```json
{"level":30,"time":1234567890123,"pid":1234,"hostname":"pod-xyz","msg":"Notification sent","provider":"sendgrid","recipients":2,"duration_ms":145}
```

### Sensitive Data Redaction

Automatically redacted in all logs:

```javascript
// Fields redacted to [redacted]:
"password", "token", "secret", "apiKey", "Authorization", "x-service-token",
"to", "from", "email", "phone", "creditCard", "accountNumber"

// Example:
{
  "Authorization": "Bearer [redacted]",
  "SENDGRID_API_KEY": "[redacted]",
  "to": ["[redacted]"]  // Email addresses
}
```

### Provider Instrumentation

Each provider call (SendGrid, Twilio, Slack, Teams) is logged:

```json
{
  "msg": "notification sent",
  "provider": "sendgrid",
  "status": "success",
  "recipients": 3,
  "duration_ms": 245,
  "provider_message_id": "abc123"
}
```

**Metrics tracked by New Relic**:
- `External/<provider>/send` — Request duration
- `Custom/Upstream/<provider>/Duration` — Response time
- `Custom/Upstream/<provider>/Success` — Success rate
- `Custom/Upstream/<provider>/Error` — Error rate

### New Relic APM Setup

#### Get License Key

1. Sign up at https://newrelic.com (free tier available)
2. Go to API Keys: https://one.newrelic.com/api-keys
3. Copy your **INGEST** license key (32 characters)

#### Configure

**Option 1: Environment file**
```bash
NEW_RELIC_ENABLED=true
NEW_RELIC_LICENSE_KEY=<your-license-key>
NEWRELIC_LOGS_ENABLED=true
```

**Option 2: 1Password (recommended for production)**
```bash
# Add to yone.op.env:
NEW_RELIC_LICENSE_KEY=op://zuma/newrelic/license-key

# Then run:
op run --env-file=yone.op.env -- npm run dev
```

**Option 3: Docker/ECS/EKS (see below)**

#### Start with APM

```bash
# Local testing
NEW_RELIC_ENABLED=true \
NEW_RELIC_LICENSE_KEY=<your-key> \
npm run dev

# Via 1Password
op run --env-file=yone.op.env -- npm run dev
```

#### Verify APM

Check startup logs:
```
INFO: New Relic agent initialized
  license_key_set: true
  distributed_tracing: true
```

Visit New Relic UI (after 1-2 minutes):
- **APM**: https://one.newrelic.com/nr1-core/apm-sql-databases/home
- **Logs**: https://one.newrelic.com/logs
- **Traces**: https://one.newrelic.com/distributed-tracing

### What Gets Monitored

**Automatic**:
- ✅ HTTP requests/responses (Fastify routes)
- ✅ External API calls (SendGrid, Twilio, Slack, Teams)
- ✅ Error rates and exceptions
- ✅ Response times and throughput

**Custom Metrics**:
- ✅ Provider-specific duration and success rates
- ✅ Notification channel usage
- ✅ Error categorization by provider

**Distributed Tracing**:
- ✅ Cross-service request correlation (callers → yone → providers)
- ✅ Full latency breakdown
- ✅ Error propagation tracking

### Testing Logging

```bash
# 1. Start with file logging
LOG_TO_FILE=true npm run dev

# 2. Check logs directory
ls -lh logs/

# 3. Send a test notification
curl -X POST http://localhost:3004/api/v1/notifications/email \
  -H "Content-Type: application/json" \
  -H "x-service-token: test-token" \
  -d '{"to":["test@example.com"],"subject":"Test","text":"Test message"}'

# 4. View logs
tail -f logs/yone.*.log

# 5. Parse JSON logs with jq
tail -f logs/yone.*.log | jq '.msg'

# 6. Test with New Relic (optional)
NEW_RELIC_ENABLED=true NEW_RELIC_LICENSE_KEY=<key> npm run dev
# Then send test notifications and check New Relic UI
```

### Troubleshooting

#### Logs not in files

```bash
# Verify LOG_TO_FILE is set
echo $LOG_TO_FILE

# Check directory exists
ls -la logs/

# Check permissions
chmod 755 logs/
```

#### New Relic not connecting

```bash
# Verify license key
echo $NEW_RELIC_LICENSE_KEY

# Check startup logs for agent
npm run dev 2>&1 | grep -i "newrelic\|agent"

# Test network connectivity
curl -I https://api.newrelic.com/
```

#### High log volume

```bash
# Reduce log level in production
LOG_LEVEL=warn npm run dev

# Disable New Relic log forwarding
NEWRELIC_LOGS_ENABLED=false npm run dev
```

### Docker Deployment

```bash
# Build with logging
docker build -f docker/Dockerfile -t yone:latest .

# Run with file logging
docker run \
  -e LOG_TO_FILE=true \
  -e NEW_RELIC_ENABLED=true \
  -e NEW_RELIC_LICENSE_KEY=<key> \
  -v /app/logs \
  yone:latest

# View Docker logs
docker logs -f <container-id>

# Access file logs from host (if volume mounted)
docker exec <container-id> tail -f /app/logs/yone.*.log
```

### ECS Deployment

Logs go to CloudWatch:

```bash
# View logs
aws logs tail /ecs/yone-service --follow

# Search for errors
aws logs filter-log-events \
  --log-group-name /ecs/yone-service \
  --filter-pattern "ERROR"
```

### EKS Deployment

```bash
# View pod logs
kubectl logs -f -n zuma yone-<pod-id>

# Follow all yone pods
kubectl logs -f -n zuma -l app=yone

# Search logs
kubectl logs -n zuma -l app=yone | grep ERROR
```

### New Relic Queries (NRQL)

```sql
-- Provider latency
SELECT average(duration) FROM Transaction
WHERE service.name = 'yone-service'
FACET http.request.url

-- Notification success rate
SELECT percentage(count(*), WHERE error = false) FROM Transaction
WHERE service.name = 'yone-service'
SINCE 1 hour ago

-- Provider error rates
SELECT count(*) FROM Metric
WHERE metric.name LIKE 'Custom/Upstream/%/Error'
FACET metric.name
```

### 1Password Integration

Store secrets in 1Password and reference them in `yone.op.env`:

```bash
# Create item in 1Password vault with license key
op://zuma/newrelic/license-key

# Then run:
op run --env-file=yone.op.env -- npm run dev
```

See [1Password setup](#1password-setup) section for full details.

### Production Best Practices

1. **Always use 1Password**: Never hardcode license keys
2. **Enable New Relic Logs**: Forward logs for centralized monitoring
3. **Monitor disk usage**: Ensure `/logs` partition has adequate space
4. **Set log level appropriately**: Use `warn` in production
5. **Test provider integrations**: Verify emails, SMS, Slack, Teams actually send
6. **Monitor provider APIs**: Watch New Relic for provider outages
7. **Keep logs rotated**: Old logs should be archived/deleted

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

- `npm install` has not been run in `yone/` yet (generates `package-lock.json`; it is currently listed in `.gitignore`).
- No Dockerfile, Kubernetes manifests or CI entry yet (the build context will need to include `zuma/shared`, since yone depends on it).
- No queueing/retry or delivery-status webhooks; sends are synchronous and at-most-once.
