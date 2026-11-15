# yone Infrastructure

Deployment infrastructure for the yone notification service.

## Structure

```
yone/infrastructure/
├── docker/
│   └── yone.Dockerfile     # Multi-stage build (Node 22 Alpine)
└── kubernetes/
    ├── namespace.yaml      # yone namespace with Pod Security Policy
    ├── deployment.yaml     # Service deployment (2–5 replicas, HPA-managed)
    ├── service.yaml        # ClusterIP service on port 3005
    ├── configmap.yaml      # Non-secret environment variables
    ├── secret.yaml         # Secrets template (API keys, webhook URLs, etc.)
    └── hpa.yaml            # Horizontal Pod Autoscaler (CPU 70%, Memory 80%)
```

## Overview

yone is a **stateless notification service** with no database dependency. It sends emails (SendGrid), SMS (Twilio), and webhooks (Slack, Teams) on behalf of other services.

### Key characteristics

- **No database**: All configuration comes via environment variables
- **Service-to-service auth**: Uses `x-service-token` header (ALLOWED_SERVICE_TOKENS)
- **External credentials**: SendGrid API key, Twilio SID/token, webhook URLs
- **Timeout**: 5 seconds per notification (configurable)

## Deployment

### 1. Build and push Docker image

```bash
cd /path/to/zhios
docker build -f yone/infrastructure/docker/yone.Dockerfile -t yone/notification-service:0.1.0 .
docker push yone/notification-service:0.1.0
```

### 2. Create Kubernetes resources

```bash
# Create namespace
kubectl apply -f yone/infrastructure/kubernetes/namespace.yaml

# Create ConfigMap (non-secret config)
kubectl apply -f yone/infrastructure/kubernetes/configmap.yaml

# Create Secret (API keys, tokens, webhook URLs)
# See "Secrets Setup" below

# Deploy
kubectl apply -f yone/infrastructure/kubernetes/deployment.yaml
kubectl apply -f yone/infrastructure/kubernetes/service.yaml
kubectl apply -f yone/infrastructure/kubernetes/hpa.yaml

# Verify
kubectl get pods -n yone
kubectl logs -n yone -l app=notification-service -f
```

## Secrets Setup

### Option A: Manual Secret Creation (Development only)

```bash
kubectl create secret generic notification-service-secret \
  --from-literal=ALLOWED_SERVICE_TOKENS="token1,token2" \
  --from-literal=SENDGRID_API_KEY="SG.xxxxx" \
  --from-literal=TWILIO_ACCOUNT_SID="ACxxxxx" \
  --from-literal=TWILIO_AUTH_TOKEN="authtoken" \
  --from-literal=SLACK_WEBHOOK_URLS='{"alerts":"<slack-webhook-url-from-1password>"}' \
  --from-literal=TEAMS_WEBHOOK_URLS='{}' \
  --from-literal=NEW_RELIC_LICENSE_KEY="nrxxxxx" \
  -n yone
```

### Option B: External Secrets Operator (Production recommended)

Use AWS Secrets Manager, HashiCorp Vault, or Sealed Secrets to inject credentials at runtime.

## Environment Variables

### ConfigMap (yone/infrastructure/kubernetes/configmap.yaml)

Non-sensitive configuration:

- `NODE_ENV`: production
- `SERVICE_NAME`: notification-service
- `PORT`: 3005
- `LOG_LEVEL`: info (or debug)
- `LOG_TO_FILE`: true
- `LOG_FILE_PATH`: /app/logs
- `RATE_LIMIT_MAX`: 100 requests per window
- `RATE_LIMIT_WINDOW`: 1 minute
- `TRUST_PROXY`: true (behind ingress/proxy)
- `HTTP_BODY_LIMIT_BYTES`: 65536
- `HTTP_CONNECTION_TIMEOUT_MS`: 10000
- `HTTP_REQUEST_TIMEOUT_MS`: 30000
- `NOTIFICATION_TIMEOUT_MS`: 5000 (max time per send)

### Secret (yone/infrastructure/kubernetes/secret.yaml)

Sensitive credentials (from 1Password, environment, or Secrets Manager):

- `ALLOWED_SERVICE_TOKENS`: Comma-separated list of >= 16-char tokens (required; accepts `x-service-token` header)
- `SENDGRID_API_KEY`: SendGrid API key (optional if not using email)
- `EMAIL_FROM_ADDRESS`: Email sender (optional, only if SENDGRID_API_KEY is set)
- `TWILIO_ACCOUNT_SID`: Twilio SID (optional if not using SMS)
- `TWILIO_AUTH_TOKEN`: Twilio auth token (optional if not using SMS)
- `TWILIO_SMS_FROM`: Twilio phone number (optional, alternative: TWILIO_MESSAGING_SERVICE_SID)
- `SLACK_WEBHOOK_URLS`: JSON map of target names to Slack webhook URLs (optional)
- `TEAMS_WEBHOOK_URLS`: JSON map of target names to Teams webhook URLs (optional)
- `NEW_RELIC_LICENSE_KEY`: New Relic license (optional, only if NEW_RELIC_ENABLED=true in ConfigMap)

Example secret values (DO NOT commit these; use 1Password or AWS Secrets Manager):

```bash
ALLOWED_SERVICE_TOKENS="service-token-1,service-token-2"
SLACK_WEBHOOK_URLS='{"alerts":"<slack-webhook-url-from-1password>"}'
TEAMS_WEBHOOK_URLS='{"devops":"<teams-webhook-url-from-1password>"}'
```

**Note:** Obtain actual webhook URLs from 1Password (`op://zhios/yone-slack-webhook`) or AWS Secrets Manager. Never commit real webhook URLs to source control.

## Service-to-Service Communication

yone accepts notifications via POST /api/v1/notifications/:channel with a valid `x-service-token` header.

### Example: Send email notification from wallet-service

```bash
curl -X POST http://notification-service.yone.svc.cluster.local:3005/api/v1/notifications/email \
  -H "x-service-token: service-token-1" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "user@example.com",
    "subject": "Wallet Transaction Confirmation",
    "body": "Your transaction has been confirmed."
  }'
```

### Token Management

- Each token must be **>= 16 characters**
- Tokens should be **unique per service** (e.g., `wallet-service-token-abc123def456`)
- Rotate tokens by updating `ALLOWED_SERVICE_TOKENS` and redeploying
- Example secure token generation:

```bash
openssl rand -base64 24  # ~32 chars when base64 encoded
# Output: a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q=
```

## API Endpoints

All channels accept a POST request with `x-service-token` in the header:

```
POST /api/v1/notifications/email
POST /api/v1/notifications/sms
POST /api/v1/notifications/slack
POST /api/v1/notifications/teams
GET /healthz   # Health check (no auth required)
GET /readyz    # Readiness check (no auth required)
```

Request body structure varies by channel; see `src/api/` for details.

## Scaling

### Horizontal (Replicas)

HPA (hpa.yaml) scales automatically:
- **Min replicas**: 2
- **Max replicas**: 5
- **CPU trigger**: 70% utilization
- **Memory trigger**: 80% utilization

When sendGrid, Twilio, or webhook latencies increase, the service will scale up to handle concurrent notifications.

## Resource Limits

Tight by design (stateless, lightweight):

- **Requests**: 50m CPU, 128 Mi memory
- **Limits**: 200m CPU, 256 Mi memory

Adjust if you have high-throughput notifications. Monitor with:

```bash
kubectl top pods -n yone
```

## Monitoring

### Logs

```bash
kubectl logs -n yone -l app=notification-service -f
```

Log files are written to `/app/logs` (emptyDir, max 256 Mi per pod):

```bash
kubectl exec -it <pod-name> -n yone -- tail -f /app/logs/yone.log
```

### Metrics (if Prometheus is available)

```bash
kubectl get --raw /apis/metrics.k8s.io/v1/namespaces/yone/pods
```

### Health checks

```bash
# Liveness
curl http://<pod-ip>:3005/healthz

# Readiness
curl http://<pod-ip>:3005/readyz
```

## Troubleshooting

### Pods not reaching readiness

Check logs for configuration errors:

```bash
kubectl logs -n yone <pod-name>
```

Common issues:

1. **ALLOWED_SERVICE_TOKENS not set**: Required in production
2. **SENDGRID_API_KEY invalid**: Verify against 1Password
3. **Twilio credentials incomplete**: Both SID and token required if using SMS
4. **Webhook URL validation failed**: Slack/Teams URLs must match allowed domains (hardcoded in config)

### Webhook delivery failures

Check the service logs for error details:

```bash
kubectl logs -n yone -l app=notification-service | grep -i slack
kubectl logs -n yone -l app=notification-service | grep -i teams
```

Common issues:

1. **Invalid webhook URL**: Ensure `SLACK_WEBHOOK_URLS` / `TEAMS_WEBHOOK_URLS` contain valid HTTPS URLs
2. **Timeout**: Increase `NOTIFICATION_TIMEOUT_MS` if sending to slow webhook endpoints
3. **Host validation**: Slack.com and webhook.office.com are hardcoded; custom domains are rejected for security

## Cleanup

```bash
kubectl delete ns yone
```

## References

- [yone config schema](../src/config/yone-config.ts)
- [yone API routes](../src/api/)
- [SendGrid API](https://docs.sendgrid.com/api-reference/mail-send/mail-send)
- [Twilio Messaging API](https://www.twilio.com/docs/messaging)
- [Slack Webhooks](https://api.slack.com/messaging/webhooks)
- [Microsoft Teams Webhooks](https://learn.microsoft.com/en-us/outlook/actionable-messages/send-via-connectors)
