# ozzo — Subscription Account Microservice

A Node.js/Fastify microservice for managing subscription accounts, bank accounts, and wallet synchronization with OAuth2/OIDC authentication via Okta.

**Table of Contents**
- [Overview](#overview)
- [Architecture](#architecture)
- [Quick Start (Local)](#quick-start-local)
- [Local Development](#local-development)
- [Docker Deployment](#docker-deployment)
- [AWS Deployment](#aws-deployment)
  - [ECS (Fargate)](#ecs-fargate)
  - [EKS (Kubernetes)](#eks-kubernetes)
- [Infrastructure as Code](#infrastructure-as-code)
- [API Documentation](#api-documentation)
- [Observability & Logging](#observability--logging)
  - [Pino Logger Setup](#pino-logger-setup)
  - [New Relic APM](#new-relic-apm)
  - [Log Files & Rotation](#log-files--rotation)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

---

## Overview

**ozzo** manages subscription accounts with the following capabilities:

- **User Management**: Register, authenticate, and manage user profiles with Okta/OIDC
- **Bank Accounts**: Create and manage multiple bank accounts per user
- **Wallet Sync**: Fetch user wallets from the zuma service, with Redis caching (300s TTL)
- **OpenAPI/Swagger**: Full API documentation at `/docs` and `/openapi.json`
- **Service-to-Service Auth**: Secure communication with zuma using signed JWT tokens
- **Clean Architecture**: Domain-driven, framework-free business logic; testable use-cases

### Key Features

- 🔐 **OAuth2/OIDC**: Okta integration via JWKS token validation
- 💾 **PostgreSQL**: Relational database for users and bank accounts
- ⚡ **Redis Caching**: Read-through cache for hot-path user and wallet data
- 📡 **Service Mesh Ready**: Signed service tokens, compatible with Kubernetes
- 📊 **Observability**: Pino logging (file + New Relic), New Relic APM with distributed tracing, `/healthz` and `/readyz` probes
- 📝 **Structured Logging**: JSON logs in production, pretty logs in dev, automatic data redaction, daily file rotation
- 🆕 **APM Monitoring**: New Relic integration with transaction tracking, error monitoring, and log aggregation
- 🧪 **Test Coverage**: 30 unit tests (including logging tests), Clean Architecture design
- 🐳 **Container Ready**: Multi-stage Docker build, docker-compose for local dev
- ☁️ **Cloud Native**: Terraform IaC for ECS, EKS, RDS, ElastiCache

---

## Architecture

### Clean Architecture Layers

```
api/              → HTTP (Fastify routes, auth middleware, validation)
application/      → Use-cases (orchestrate domain + ports, no framework)
domain/           → Entities, value objects (no dependencies)
infrastructure/   → Adapters (Prisma, Redis, HTTP clients)
```

### Deployment Options

| Option | Best For | Managed By |
|--------|----------|-----------|
| **Docker Compose** | Local development | Your docker daemon |
| **ECS (Fargate)** | Serverless containers, cost-effective | AWS |
| **EKS (Kubernetes)** | Multi-service orchestration, advanced deployments | AWS + Kubernetes |

---

## Quick Start (Local)

**Prerequisites**: Node.js v22+, Docker & Docker Compose

```bash
cd ozzo

# 1. Copy environment template
cp env.example .env

# 2. Edit .env with your Okta credentials
# vi .env

# 3. Install dependencies
npm install

# 4. Start PostgreSQL + Redis with docker-compose
docker-compose up -d

# 5. Run dev server (hot-reload)
npm run dev

# 6. Test the API
curl http://localhost:3004/openapi.json
```

**Access the API**:
- Swagger UI: http://localhost:3004/docs
- OpenAPI JSON: http://localhost:3004/openapi.json
- Health check: http://localhost:3004/healthz

---

## Local Development

### Setup

```bash
# 1. Environment
cp env.example .env
# Edit .env with your values:
# - DATABASE_URL=postgresql://postgres:password@localhost:5432/ozzo
# - REDIS_URL=redis://localhost:6379
# - OKTA_ISSUER_BASE_URL=https://your-okta-domain.okta.com
# - OKTA_AUDIENCE=your-api-audience
# - INTERNAL_JWT_SECRET=dev-secret-key-change-me
# - WALLET_SERVICE_URL=http://localhost:3001

# 2. Install
npm install

# 3. Start services
docker-compose up -d

# 4. Source env vars and start dev server
export $(grep -v '^#' .env | xargs)
npm run dev

# Or use 1Password (recommended for production credentials)
op run --env-file=.env -- npm run dev
```

### Build Targets

| Target | Purpose |
|--------|---------|
| `make lint` | Lint with biome |
| `make typecheck` | TypeScript type check only |
| `make build` | Compile to `dist/` |
| `make test` | Run unit tests (25 tests, ~2s) |
| `make test:integration` | Integration tests with real PostgreSQL |
| `make dev` | Hot-reload dev server (tsx watch) |
| `make docker-build` | Build Docker image |
| `make docker-up` | Start full stack (postgres + redis + ozzo) |
| `make docker-down` | Stop and remove containers |

### Database Management

```bash
# Open Prisma Studio GUI
npx prisma studio

# View migrations
npx prisma migrate status

# Create a migration
npx prisma migrate dev --name add_user_index

# Reset database (dev only!)
npx prisma migrate reset
```

### Environment Variables

See `env.example` for complete reference. Required:

```bash
# Server
NODE_ENV=development|production|test
PORT=3004                           # API port

# Database
DATABASE_URL=postgresql://...       # RDS endpoint in production

# Cache
REDIS_URL=redis://...               # ElastiCache endpoint in production

# Okta (OIDC)
OKTA_ISSUER_BASE_URL=https://...    # Your Okta tenant
OKTA_AUDIENCE=your-api-audience     # API identifier
OKTA_ADMIN_GROUP=admins             # Optional: admin group bypass

# Services
WALLET_SERVICE_URL=http://...       # zuma wallet-service endpoint
INTERNAL_JWT_SECRET=your-secret     # Shared with zuma (used for service-to-service auth)

# Observability (optional)
LOG_LEVEL=debug|info|warn|error     # Default: info
OTEL_EXPORTER_OTLP_ENDPOINT=http... # OpenTelemetry collector
METRICS_ENABLED=true|false          # Default: false
```

---

## Docker Deployment

### Build Image

```bash
# Build locally
docker build -f docker/Dockerfile -t ozzo:latest .

# Run with environment
docker run \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://user:pass@postgres:5432/ozzo \
  -e REDIS_URL=redis://redis:6379 \
  -e OKTA_ISSUER_BASE_URL=https://your-okta-domain.okta.com \
  -e OKTA_AUDIENCE=your-api-audience \
  -e INTERNAL_JWT_SECRET=secret-key \
  -p 3004:3004 \
  ozzo:latest
```

### Docker Compose (Full Stack)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f ozzo
docker-compose logs -f postgres
docker-compose logs -f redis

# Bring down
docker-compose down
```

The `docker-compose.yml` includes:
- **ozzo**: Node.js API (port 3004)
- **postgres**: PostgreSQL 16 (port 5432)
- **redis**: Redis 7 (port 6379)

---

## AWS Deployment

### Deployment Flow

```
Code (git)
    ↓
GitHub Actions / CI
    ↓
ECR (Docker image)
    ↓
Terraform / CloudFormation
    ↓
ECS Task / EKS Pod → RDS + ElastiCache
```

---

### ECS (Fargate)

**Best for**: Serverless containers, simple scaling, cost-effective deployments

#### Prerequisites

- AWS account with credentials configured
- ECR repository created (`aws ecr create-repository --repository-name ozzo`)
- RDS PostgreSQL 16 instance (endpoint: `ozzo-postgres.xxxxx.rds.amazonaws.com:5432`)
- ElastiCache Redis 7 cluster (endpoint: `ozzo-redis.xxxxx.cache.amazonaws.com:6379`)
- Application Load Balancer (ALB) with target group
- IAM role for ECS tasks with permissions to:
  - Pull from ECR
  - Write logs to CloudWatch
  - Read from Secrets Manager

#### Deployment Steps

**1. Build and Push Docker Image**

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com

# Build and push
docker build -f docker/Dockerfile -t ozzo:latest .
docker tag ozzo:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/ozzo:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/ozzo:latest
```

**2. Create ECS Task Definition**

Use Terraform (recommended) or AWS CLI:

```bash
aws ecs register-task-definition \
  --family ozzo-service \
  --network-mode awsvpc \
  --requires-compatibilities FARGATE \
  --cpu 256 \
  --memory 512 \
  --container-definitions '[{
    "name": "ozzo",
    "image": "123456789.dkr.ecr.us-east-1.amazonaws.com/ozzo:latest",
    "portMappings": [{"containerPort": 3004}],
    "environment": [
      {"name": "NODE_ENV", "value": "production"},
      {"name": "PORT", "value": "3004"}
    ],
    "secrets": [
      {"name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789:secret:ozzo/db-url"},
      {"name": "REDIS_URL", "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789:secret:ozzo/redis-url"},
      {"name": "OKTA_ISSUER_BASE_URL", "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789:secret:okta/issuer"},
      {"name": "OKTA_AUDIENCE", "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789:secret:okta/audience"},
      {"name": "INTERNAL_JWT_SECRET", "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789:secret:ozzo/jwt-secret"}
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/ozzo-service",
        "awslogs-region": "us-east-1",
        "awslogs-stream-prefix": "ecs"
      }
    },
    "healthCheck": {
      "command": ["CMD-SHELL", "curl -f http://localhost:3004/healthz || exit 1"],
      "interval": 30,
      "timeout": 5,
      "retries": 3,
      "startPeriod": 60
    }
  }]' \
  --execution-role-arn arn:aws:iam::123456789:role/ecsTaskExecutionRole
```

**3. Create ECS Service**

```bash
aws ecs create-service \
  --cluster ozzo-cluster \
  --service-name ozzo-service \
  --task-definition ozzo-service \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={
    subnets=[subnet-xxxxx,subnet-yyyyy],
    securityGroups=[sg-ozzo],
    assignPublicIp=DISABLED
  }" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:us-east-1:123456789:targetgroup/ozzo-tg/xxxxx,containerName=ozzo,containerPort=3004" \
  --deployment-configuration "maximumPercent=200,minimumHealthyPercent=100" \
  --enable-ecs-managed-tags
```

**4. Setup Auto-Scaling**

```bash
# Register scalable target
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/ozzo-cluster/ozzo-service \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 \
  --max-capacity 10

# Create scaling policy (target CPU 70%)
aws application-autoscaling put-scaling-policy \
  --policy-name ozzo-cpu-scaling \
  --service-namespace ecs \
  --resource-id service/ozzo-cluster/ozzo-service \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {"PredefinedMetricType": "ECSServiceAverageCPUUtilization"},
    "ScaleOutCooldown": 60,
    "ScaleInCooldown": 300
  }'
```

---

### EKS (Kubernetes)

**Best for**: Multi-service orchestration, advanced deployments, service mesh (Istio)

#### Prerequisites

- AWS account with credentials configured
- EKS cluster created (via Terraform or `eksctl`)
- Worker node groups with proper IAM roles
- ECR repository for ozzo image
- RDS PostgreSQL and ElastiCache Redis endpoints
- Helm (optional, for package management)

#### Deployment Steps

**1. Create EKS Cluster** (using Terraform or eksctl)

```bash
# Using Terraform (recommended — see Infrastructure as Code section)
cd infrastructure/terraform
terraform apply -var-file=environments/prod.tfvars

# Or using eksctl
eksctl create cluster \
  --name ozzo-eks-cluster \
  --region us-east-1 \
  --nodegroup-name ozzo-nodes \
  --nodes 2 \
  --nodes-max 5
```

**2. Configure kubectl**

```bash
aws eks update-kubeconfig \
  --region us-east-1 \
  --name ozzo-eks-cluster
```

**3. Create Kubernetes Namespace and Secrets**

```bash
# Create namespace
kubectl create namespace ozzo

# Create Secrets from Secrets Manager
kubectl create secret generic okta-secrets \
  --from-literal=issuer-base-url=https://your-okta-domain.okta.com \
  --from-literal=audience=your-api-audience \
  --from-literal=admin-group=admins \
  -n ozzo

kubectl create secret generic ozzo-db \
  --from-literal=url="postgresql://user:pass@ozzo-postgres.xxxxx.rds.amazonaws.com:5432/ozzo" \
  -n ozzo

kubectl create secret generic ozzo-redis \
  --from-literal=url="redis://ozzo-redis.xxxxx.cache.amazonaws.com:6379" \
  -n ozzo

kubectl create secret generic ozzo-jwt \
  --from-literal=secret="your-jwt-secret" \
  -n ozzo
```

**4. Deploy Application**

Create `kubernetes/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ozzo-api
  namespace: ozzo
  labels:
    app: ozzo
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ozzo
  template:
    metadata:
      labels:
        app: ozzo
    spec:
      serviceAccountName: ozzo-sa
      containers:
      - name: ozzo
        image: 123456789.dkr.ecr.us-east-1.amazonaws.com/ozzo:latest
        imagePullPolicy: Always
        ports:
        - name: http
          containerPort: 3004
          protocol: TCP
        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "3004"
        - name: LOG_LEVEL
          value: "info"
        - name: WALLET_SERVICE_URL
          value: "http://zuma-service:3001"
        envFrom:
        - secretRef:
            name: okta-secrets
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: ozzo-db
              key: url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: ozzo-redis
              key: url
        - name: INTERNAL_JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: ozzo-jwt
              key: secret
        livenessProbe:
          httpGet:
            path: /healthz
            port: 3004
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /readyz
            port: 3004
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
        resources:
          requests:
            cpu: 250m
            memory: 512Mi
          limits:
            cpu: 500m
            memory: 1Gi
        securityContext:
          runAsNonRoot: true
          runAsUser: 1000
          readOnlyRootFilesystem: true
          allowPrivilegeEscalation: false
          capabilities:
            drop:
            - ALL
        volumeMounts:
        - name: tmp
          mountPath: /tmp
      volumes:
      - name: tmp
        emptyDir: {}
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchExpressions:
                - key: app
                  operator: In
                  values:
                  - ozzo
              topologyKey: kubernetes.io/hostname
---
apiVersion: v1
kind: Service
metadata:
  name: ozzo-service
  namespace: ozzo
spec:
  type: ClusterIP
  ports:
  - port: 3001
    targetPort: 3004
    protocol: TCP
    name: http
  selector:
    app: ozzo
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ozzo-hpa
  namespace: ozzo
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ozzo-api
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

**5. Apply Kubernetes Manifests**

```bash
# Create deployment, service, and HPA
kubectl apply -f kubernetes/deployment.yaml

# Create Ingress (ALB)
kubectl apply -f kubernetes/ingress.yaml

# Verify deployment
kubectl get pods -n ozzo
kubectl logs -f -n ozzo -l app=ozzo
kubectl get svc -n ozzo
```

---

## Infrastructure as Code

### Terraform (Recommended)

All AWS resources can be managed with Terraform. Structure:

```
infrastructure/terraform/
├── main.tf              # Provider and module calls
├── variables.tf         # Input variables
├── outputs.tf           # Output values
├── vpc.tf               # VPC, subnets, security groups
├── rds.tf               # PostgreSQL RDS
├── elasticache.tf       # Redis ElastiCache
├── ecr.tf               # ECR repository
├── ecs.tf               # ECS cluster, service, task definition
├── eks.tf               # EKS cluster, node groups, OIDC
├── iam.tf               # IAM roles and policies
├── secrets.tf           # Secrets Manager
├── terraform.tfvars     # Default values
└── environments/
    ├── dev.tfvars       # Development overrides
    ├── staging.tfvars   # Staging overrides
    └── prod.tfvars      # Production overrides
```

#### Deploy with Terraform

```bash
cd infrastructure/terraform

# Initialize
terraform init

# Review changes
terraform plan -var-file=environments/prod.tfvars -out=tfplan

# Apply
terraform apply tfplan

# Get outputs
terraform output
```

#### Key Outputs

```
alb_dns_name = "ozzo-alb-123456.us-east-1.elb.amazonaws.com"
rds_endpoint = "ozzo-postgres.xxxxx.us-east-1.rds.amazonaws.com:5432"
redis_endpoint = "ozzo-redis.xxxxx.ng.0001.use1.cache.amazonaws.com:6379"
ecr_repository_url = "123456789.dkr.ecr.us-east-1.amazonaws.com/ozzo"
ecs_service_name = "ozzo-service"
eks_cluster_name = "ozzo-eks-cluster"
```

---

### CloudFormation (Alternative)

CloudFormation templates are provided as an alternative:

```bash
aws cloudformation create-stack \
  --stack-name ozzo-stack \
  --template-body file://infrastructure/cloudformation/ozzo-stack.yaml \
  --parameters \
    ParameterKey=Environment,ParameterValue=prod \
    ParameterKey=OktoIssuerBaseUrl,ParameterValue=https://your-okta-domain.okta.com \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1

# Monitor stack creation
aws cloudformation describe-stacks --stack-name ozzo-stack
```

---

## API Documentation

### OpenAPI/Swagger

Access at:
- **Swagger UI**: http://localhost:3004/docs
- **OpenAPI JSON**: http://localhost:3004/openapi.json

### Example API Calls

#### 1. Register User

```bash
curl -X POST http://localhost:3004/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <okta-jwt-token>" \
  -d '{
    "username": "john.doe",
    "email": "john@example.com",
    "firstName": "John",
    "lastName": "Doe"
  }'

# Response (201 Created)
{
  "id": "clnq1234567890",
  "username": "john.doe",
  "email": "john@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "createdAt": "2026-11-12T20:30:00Z"
}
```

#### 2. Create Bank Account

```bash
curl -X POST http://localhost:3004/users/clnq1234567890/accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <okta-jwt-token>" \
  -d '{
    "accountNumber": "9876543210",
    "accountType": "checking",
    "balance": 100000
  }'

# Response (201 Created)
{
  "id": "clnq0987654321",
  "userId": "clnq1234567890",
  "accountNumber": "9876543210",
  "accountType": "checking",
  "balance": "100000",
  "createdAt": "2026-11-12T20:32:00Z"
}
```

#### 3. Fetch User Wallet (with Zuma sync)

```bash
curl http://localhost:3004/users/clnq1234567890/wallet \
  -H "Authorization: Bearer <okta-jwt-token>"

# Response (200 OK, cached after first request)
{
  "userId": "clnq1234567890",
  "wallet": {
    "id": "wallet-123",
    "address": "1A1z7agoat2NWhGRp2ksYPACoAvseBET3",
    "balance": 50000000,
    "currency": "BTC"
  },
  "cached": true,
  "cacheTTL": 300
}
```

#### 4. List User Bank Accounts

```bash
curl http://localhost:3004/users/clnq1234567890/accounts \
  -H "Authorization: Bearer <okta-jwt-token>"

# Response (200 OK)
{
  "accounts": [
    {
      "id": "clnq0987654321",
      "accountNumber": "9876543210",
      "accountType": "checking",
      "balance": "100000"
    }
  ]
}
```

### API Routes

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/healthz` | No | Liveness probe |
| GET | `/readyz` | No | Readiness (DB + Redis) |
| GET | `/openapi.json` | No | OpenAPI schema |
| GET | `/docs` | No | Swagger UI |
| POST | `/users` | Yes | Register user |
| GET | `/users/:id` | Yes | Get user (cached 5min) |
| GET | `/users/:id/profile` | Yes | User + accounts + total balance |
| PATCH | `/users/:id` | Yes | Update user, invalidate cache |
| POST | `/users/:id/accounts` | Yes | Create bank account |
| GET | `/users/:id/accounts` | Yes | List accounts |
| GET | `/users/:id/accounts/:accountId` | Yes | Get account |
| PATCH | `/users/:id/accounts/:accountId` | Yes | Update account |
| DELETE | `/users/:id/accounts/:accountId` | Yes | Delete account (balance must be 0) |
| GET | `/users/:id/wallet` | Yes | Fetch wallet from zuma (cached 5min) |

---

## Observability & Logging

ozzo includes comprehensive logging and APM (Application Performance Monitoring) capabilities via **Pino** and **New Relic**.

### Pino Logger Setup

Pino provides structured logging with automatic redaction of sensitive data.

#### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Log level: debug, info, warn, error |
| `LOG_TO_FILE` | false (true in prod) | Write logs to rotating file |
| `LOG_FILE_PATH` | `./logs` | Directory for log files |
| `LOG_FILE_MAX_SIZE` | 10485760 (10MB) | Max size before rotation |
| `LOG_FILE_ROTATE_DAYS` | 7 | Days of logs to retain |

#### Local Development (Pretty Logs)

```bash
# Enable debug logging with colorized output
LOG_LEVEL=debug npm run dev

# Example output:
# [20:35:12.123] INFO (ozzo/12345): Server listening on http://0.0.0.0:3004
#   service: "ozzo-service"
#   version: "0.1.0"
#   env: "development"
#   loggingEnabled: "console, file"
```

#### Production (JSON Logs)

```bash
# JSON structured logs to stdout and file
NODE_ENV=production npm run dev

# Logs automatically written to ./logs/ozzo.log
# File rotates daily; keeps 7 days of logs
ls -la logs/
# ozzo.log.2026-11-12
# ozzo.log.2026-11-11
# ozzo.log.2026-11-10
```

#### Log File Rotation

```bash
# View current logs
tail -f logs/ozzo.log

# Each day creates a new file (ozzo.log.YYYY-MM-DD)
# Old logs are automatically deleted after 7 days
# Max file size: 10MB (rotate immediately if exceeded)
```

#### Sensitive Data Redaction

The following fields are automatically redacted in all logs:

```javascript
// Redacted patterns:
"password", "token", "secret", "apiKey", "creditCard", "cvv", 
"accountNumber", "Authorization", "X-Api-Key", "Cookie"

// Example:
{
  "password": "[redacted]",
  "Authorization": "Bearer [redacted]",
  "accountNumber": "[redacted]"
}
```

### New Relic APM

New Relic provides application performance monitoring, distributed tracing, and centralized logging.

#### Installation & Setup

**1. Get New Relic License Key**

```bash
# Sign up for New Relic free tier: https://newrelic.com/signup
# Go to API Keys (https://one.newrelic.com/api-keys)
# Copy your INGEST - LICENSE key
```

**2. Configure Environment Variables**

```bash
# Add to .env or container secrets:
NEW_RELIC_ENABLED=true
NEW_RELIC_LICENSE_KEY=<your-ingest-license-key>
NEW_RELIC_APP_NAME=ozzo-service
NEW_RELIC_LOG_LEVEL=info
NEWRELIC_LOGS_ENABLED=true
NEWRELIC_LOGS_ENDPOINT=https://log-api.newrelic.com/log/v1
```

**3. Start with New Relic**

```bash
# Local testing
NEW_RELIC_ENABLED=true \
NEW_RELIC_LICENSE_KEY=<your-key> \
npm run dev

# Docker
docker run \
  -e NEW_RELIC_ENABLED=true \
  -e NEW_RELIC_LICENSE_KEY=<your-key> \
  -e NEW_RELIC_APP_NAME=ozzo-service \
  ozzo:latest

# ECS Task Definition (via Secrets Manager)
{
  "name": "NEW_RELIC_LICENSE_KEY",
  "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789:secret:newrelic/license-key"
}

# EKS (via kubectl secret)
kubectl create secret generic newrelic-secrets \
  --from-literal=license-key=<your-key> \
  -n ozzo
```

#### What Gets Monitored

**Automatic Instrumentation:**
- ✅ **HTTP Routes** (Fastify): request/response metrics
- ✅ **External HTTP Calls** (axios): latency, errors (to zuma)
- ✅ **Redis Operations** (ioredis): get/set/delete metrics
- ✅ **Database Queries** (Prisma): query duration and counts

**Distributed Tracing:**
- Trace headers automatically added to outbound requests (to zuma)
- Cross-service tracing: see full request flow from user → ozzo → zuma
- Service map: visualize service dependencies

**Logs:**
- All application logs forwarded to New Relic Logs
- Searchable by service, level, timestamp
- Correlated with APM transactions

#### Accessing Data in New Relic

```bash
# 1. View APM dashboard
# https://one.newrelic.com/nr1-core/apm-sql-databases/home

# 2. View service performance
# Look for "ozzo-service" in the entity explorer

# 3. View logs
# https://one.newrelic.com/logs
# Query: `service_name = "ozzo-service"`

# 4. View distributed traces
# https://one.newrelic.com/distributed-tracing
# Filter by ozzo-service to see request flows

# 5. View entity map
# https://one.newrelic.com/navigator
# See how ozzo connects to zuma and other services
```

#### Example Queries (New Relic NRQL)

```sql
-- View average response time per endpoint
SELECT average(duration) FROM Transaction 
WHERE service.name = 'ozzo-service' 
FACET http.url

-- Count errors in the last hour
SELECT count(*) FROM TransactionError 
WHERE service.name = 'ozzo-service' 
SINCE 1 hour ago

-- View Redis cache hit rate
SELECT percentage(count(*), WHERE cache.hit = true) 
FROM Metric WHERE metric.name LIKE 'ozzo.redis.%'
SINCE 1 hour ago

-- Find slow database queries
SELECT average(duration) FROM Metric 
WHERE metric.name LIKE 'Datastore/statement/Prisma/%'
AND duration > 1000
FACET query_string
```

### Log Files & Rotation

#### Local Development

```bash
# Default: logs to console only
npm run dev

# Enable file logging
LOG_TO_FILE=true npm run dev

# Check logs directory
ls -la logs/
# -rw-r--r--  ozzo.log
```

#### Production (Docker)

```bash
# Logs go to stdout (captured by Docker/ECS/EKS)
docker run -it ozzo:latest

# File logs (if LOG_TO_FILE=true)
docker exec <container-id> tail -f /app/logs/ozzo.log

# ECS: View in CloudWatch Logs
aws logs tail /ecs/ozzo-service --follow

# EKS: View in kubectl
kubectl logs -f -n ozzo <pod-name>
```

#### Log Rotation Schedule

```
ozzo.log.2026-11-15   ← Today (current log)
ozzo.log.2026-11-14   ← Yesterday
ozzo.log.2026-11-13
ozzo.log.2026-11-12
ozzo.log.2026-11-11
ozzo.log.2026-11-10
ozzo.log.2026-11-09   ← 7 days back
```

Daily rotation:
- Each day at midnight (UTC), new file created
- Old files automatically deleted after 7 days
- Size limit: 10MB (rotate immediately if exceeded)

#### Querying Logs Locally

```bash
# View latest 50 lines
tail -50 logs/ozzo.log

# Search for errors
grep ERROR logs/ozzo.log

# View logs since last hour
find logs/ -mmin -60 -exec cat {} \;

# Parse JSON logs with jq
tail -f logs/ozzo.log | jq '.msg'
```

### Debugging Logging Issues

#### Logs not appearing in file

```bash
# Check LOG_TO_FILE is set
echo $LOG_TO_FILE

# Check directory permissions
ls -la logs/

# Check free disk space
df -h

# Verify pino-roll package is installed
npm ls pino-roll
```

#### New Relic not connecting

```bash
# Verify license key is set and valid
echo $NEW_RELIC_LICENSE_KEY

# Check agent started
LOG_LEVEL=debug npm run dev 2>&1 | grep -i newrelic

# Verify outbound network access to New Relic
curl -I https://api.newrelic.com

# Check for errors in agent logs
npm run dev 2>&1 | grep -i "agent error"
```

#### High log volume

```bash
# Reduce log level
LOG_LEVEL=warn npm run dev

# Disable New Relic log forwarding if not needed
NEWRELIC_LOGS_ENABLED=false npm run dev

# Check for debug logs (should be info or warn in prod)
grep "DEBUG" logs/ozzo.log | wc -l
```

---

## Security

### Authentication

- **OIDC/JWT**: All protected routes validate tokens against Okta JWKS
- **Bearer Token**: Include `Authorization: Bearer <token>` header
- **Ownership Checks**: Users can only access their own data
- **Admin Bypass**: `OKTA_ADMIN_GROUP` members can access any user

### Authorization

```
POST /users → Registers caller's identity (externalId = JWT sub)
GET /users/:id → Allowed if user == caller OR caller in ADMIN_GROUP
PATCH /users/:id → Same as GET
DELETE → Not exposed; users are soft-deletable
```

### Encryption

- **In Transit**: TLS 1.2+ (enforced in production via ALB)
- **At Rest**:
  - RDS: Encrypted with KMS (Terraform sets `storage_encrypted = true`)
  - ElastiCache: Optional encryption in transit (see Terraform config)
  - Secrets Manager: KMS-encrypted

### Secret Management

- **Okta Credentials**: AWS Secrets Manager (not in code)
- **JWT Secrets**: Rotated regularly, Secrets Manager
- **Database Passwords**: Secrets Manager
- **Environment Variables**: Sourced from Secrets Manager or Parameter Store in production

### Network Security

- **VPC Isolation**: RDS and ElastiCache in private subnets
- **Security Groups**:
  - ALB: 80/443 from internet
  - ECS/EKS: Only from ALB security group
  - RDS: Only from ECS/EKS security group
  - ElastiCache: Only from ECS/EKS security group
- **NACLs**: Explicit allow/deny rules per subnet

---

## Troubleshooting

### Docker

**Port already in use**
```bash
lsof -i :3004
kill -9 <PID>
```

**Database connection failed**
```bash
docker-compose logs postgres
psql postgresql://postgres:password@localhost:5432/ozzo
```

**Redis connection failed**
```bash
docker-compose logs redis
redis-cli -u redis://localhost:6379 ping
```

### Local Dev

**OIDC token validation fails**
```bash
# Verify Okta config
echo $OKTA_ISSUER_BASE_URL
echo $OKTA_AUDIENCE

# Check JWKS endpoint
curl $OKTA_ISSUER_BASE_URL/.well-known/openid-configuration
```

**Zuma wallet-service returns 502**
```bash
# Check service URL and reachability
curl $WALLET_SERVICE_URL/healthz

# Verify service-to-service auth token is accepted by zuma
# See src/infrastructure/zuma-client.ts
```

### ECS/EKS

**Task fails to start**
```bash
# ECS: Check CloudWatch logs
aws logs tail /ecs/ozzo-service --follow

# EKS: Check pod logs
kubectl logs <pod-name> -n ozzo
kubectl describe pod <pod-name> -n ozzo
```

**Pending/CrashLoopBackOff**
```bash
# Check resource limits and events
kubectl top pods -n ozzo
kubectl get events -n ozzo --sort-by='.lastTimestamp'
```

**Secrets not mounted**
```bash
# Verify secrets exist
kubectl get secrets -n ozzo

# Check pod env vars
kubectl exec -it <pod> -n ozzo -- env | grep DATABASE_URL
```

### Debug Logging

Enable debug logs:
```bash
# Local
LOG_LEVEL=debug npm run dev

# Docker
docker run -e LOG_LEVEL=debug ozzo:latest

# ECS
aws ecs update-service \
  --cluster ozzo-cluster \
  --service ozzo-service \
  --force-new-deployment

# EKS
kubectl set env deployment/ozzo-api LOG_LEVEL=debug -n ozzo
```

---

## Configuration Reference

All configuration is validated with Zod at startup. See `env.example` and `src/config/env-schema.ts`.

**Required**:
- `DATABASE_URL`
- `REDIS_URL`
- `OKTA_ISSUER_BASE_URL`
- `OKTA_AUDIENCE`

**Optional**:
- `OKTA_ADMIN_GROUP` — Bypass ownership checks
- `USE_MOCK_ZUMA=true` — Use mock wallet client
- `LOG_LEVEL` — Default: info
- `OTEL_EXPORTER_OTLP_ENDPOINT` — OpenTelemetry collector
- `METRICS_ENABLED` — Default: false

---

## Contributing

1. Create a feature branch: `git checkout -b feat/your-feature`
2. Make changes and run tests: `make test`
3. Lint and format: `make lint`
4. Commit with Conventional Commits: `git commit -S -m "feat: description"`
5. Push and open a pull request

**Commit Style**:
```
feat: add wallet sync endpoint
fix: correct ownership check for admin users
docs: update deployment guide
chore: upgrade dependencies
test: add integration tests for cache
```

---

## Documentation

- `docs/architecture.md` — System design and Clean Architecture
- `docs/domain-model.md` — Entities, value objects, aggregates
- `docs/security.md` — Auth, secrets, encryption, network security

---

## Support & Contact

- **Issues**: GitHub Issues
- **Slack**: #ozzo-support
- **On-call**: See runbooks in `docs/runbooks/`

---

**Deployed with confidence via Terraform and CloudFormation** 🚀
