# ozzo Infrastructure

Deployment infrastructure for the ozzo auth/subscriptions service.

## Structure

```
ozzo/infrastructure/
├── docker/                 # Container images
│   └── ozzo.Dockerfile     # Multi-stage build (Node 22 Alpine)
├── kubernetes/             # K8s manifests
│   ├── namespace.yaml      # ozzo namespace with Pod Security Policy
│   ├── deployment.yaml     # Service deployment (2–5 replicas, HPA-managed)
│   ├── service.yaml        # ClusterIP service on port 3004
│   ├── configmap.yaml      # Non-secret environment variables
│   ├── secret.yaml         # Secrets template (DATABASE_URL, REDIS_URL, etc.)
│   └── hpa.yaml            # Horizontal Pod Autoscaler (CPU 70%, Memory 80%)
└── aws/terraform/          # AWS resources (RDS PostgreSQL)
    ├── main.tf             # RDS instance, security groups, CloudWatch logs
    ├── variables.tf        # Input variables (db class, storage, backup, etc.)
    ├── outputs.tf          # Output DATABASE_URL and connection details
    ├── providers.tf        # AWS provider configuration
    └── terraform.tfvars.example  # Example values (copy and fill in)
```

## Deployment

### 1. Build and push Docker image

```bash
cd /path/to/zhios
docker build -f ozzo/infrastructure/docker/ozzo.Dockerfile -t ozzo/auth-service:0.1.0 .
docker push ozzo/auth-service:0.1.0
```

### 2. Provision RDS PostgreSQL (via Terraform)

```bash
cd ozzo/infrastructure/aws/terraform

# Initialize Terraform
terraform init

# Set credentials via environment variables (never in tfvars)
export TF_VAR_db_username="ozzo_admin"
export TF_VAR_db_password="SecureP@ssw0rd123"  # Min 8 chars, mixed case, numbers, special chars

# Copy and customize the example
cp terraform.tfvars.example terraform.tfvars

# Plan
terraform plan

# Apply
terraform apply

# Retrieve outputs (including DATABASE_URL)
terraform output database_url_template
terraform output rds_endpoint
```

### 3. Create secrets in Kubernetes

```bash
# Option A: From Terraform output (one-time, for dev only)
# Get the database URL from Terraform and create a secret:
kubectl create secret generic auth-service-secret \
  --from-literal=DATABASE_URL="postgresql://ozzo_admin:PASSWORD@host:5432/ozzo" \
  --from-literal=REDIS_URL="redis://redis-service:6379" \
  --from-literal=INTERNAL_JWT_SECRET="32-char-minimum-shared-secret" \
  -n ozzo

# Option B: External Secrets Operator (recommended for prod)
# Use AWS Secrets Manager or Sealed Secrets to inject credentials securely
# See infrastructure/README.md in the root for details
```

### 4. Deploy to Kubernetes

```bash
# Create the namespace
kubectl apply -f ozzo/infrastructure/kubernetes/namespace.yaml

# Create ConfigMap
kubectl apply -f ozzo/infrastructure/kubernetes/configmap.yaml

# Create Secrets (from above)
# (Already created in step 3)

# Deploy the service
kubectl apply -f ozzo/infrastructure/kubernetes/deployment.yaml
kubectl apply -f ozzo/infrastructure/kubernetes/service.yaml
kubectl apply -f ozzo/infrastructure/kubernetes/hpa.yaml

# Verify
kubectl get deployments -n ozzo
kubectl get pods -n ozzo
kubectl logs -n ozzo -l app=auth-service -f
```

## Environment Variables

All environment variables are defined in `src/config/env-schema.ts`. Key ones for deployment:

### ConfigMap (ozzo/infrastructure/kubernetes/configmap.yaml)

- `NODE_ENV`: production
- `PORT`: 3004
- `LOG_LEVEL`: info (or debug)
- `OKTA_ISSUER_BASE_URL`: Your Okta tenant URL
- `OKTA_AUDIENCE`: API identifier from Okta
- `WALLET_SERVICE_URL`: URL to reach wallet-service (e.g., `http://wallet-service.zuma.svc.cluster.local:3001`)

### Secret (ozzo/infrastructure/kubernetes/secret.yaml)

- `DATABASE_URL`: PostgreSQL connection string (from RDS Terraform output)
- `REDIS_URL`: Redis connection string (ElastiCache or self-hosted)
- `INTERNAL_JWT_SECRET`: Shared JWT secret with wallet-service (>= 32 chars)
- `NEW_RELIC_LICENSE_KEY`: (optional)

## RDS Configuration

### Development

```
Instance:  db.t3.micro (768 MB RAM, 0.5 vCPU)
Storage:   20 GB (auto-scales to 100 GB)
Backups:   7 days
Multi-AZ:  No
```

### Staging / Production

```
Instance:  db.t3.small or db.t3.medium (2 GB+ RAM)
Storage:   50–100 GB (auto-scales as needed)
Backups:   14–30 days
Multi-AZ:  Yes (for HA)
KMS:       Customer-managed key
Monitoring: Enhanced monitoring enabled
```

## Security

### Networking

- RDS is **private** (no public IP) by default
- Access is restricted via security group: only from EKS cluster security group
- Use `terraform.tfvars` to specify `eks_security_group_id`

### Secrets Management

1. **Never** store `DATABASE_URL` or `db_password` in Git
2. Use environment variables or Terraform variable files (excluded from Git by `.gitignore`)
3. For production, use **AWS Secrets Manager** with External Secrets Operator to inject credentials at runtime
4. Rotate credentials regularly (set `db_password` to a new value, apply, update Kubernetes secret)

### Encryption

- **At rest**: RDS encryption enabled (default: AWS-managed key; use KMS for production)
- **In transit**: Enforce `sslmode=require` in `DATABASE_URL` (e.g., `postgresql://...?sslmode=require`)
- **Logs**: CloudWatch logs are encrypted by default

## Scaling

### Horizontal (Replicas)

HPA (hpa.yaml) automatically scales based on:
- CPU utilization: target 70%
- Memory utilization: target 80%
- Min replicas: 2
- Max replicas: 5

### Vertical (RDS)

RDS auto-scaling is enabled:
- Starts at `db_storage_allocated_gb` (e.g., 20 GB)
- Scales up to `db_max_allocated_storage_gb` (e.g., 100 GB) when utilization > 90%
- Upgrade instance class manually if CPU/RAM becomes a bottleneck

## Monitoring

### CloudWatch

RDS logs are exported to CloudWatch:
```
/aws/rds/ozzo/{environment}
```

Check with:
```bash
aws logs tail /aws/rds/ozzo/dev --follow
```

### Kubernetes

```bash
# Pod logs
kubectl logs -n ozzo <pod-name>

# Pod events
kubectl describe pod -n ozzo <pod-name>

# Metrics (if Prometheus/Grafana is running)
kubectl get --raw /apis/metrics.k8s.io/v1/namespaces/ozzo/pods
```

## Troubleshooting

### RDS Connection Refused

1. Check security group rules:
   ```bash
   aws ec2 describe-security-groups --group-ids <sg-id>
   ```

2. Verify DATABASE_URL format:
   ```
   postgresql://user:password@host:port/dbname
   ```

3. Test connectivity from a pod:
   ```bash
   kubectl run -it --rm debug --image=postgres:16-alpine --restart=Never -- \
     psql "postgresql://ozzo_admin:PASSWORD@ozzo-dev.xxxxx.rds.amazonaws.com:5432/ozzo"
   ```

### Pod not reaching readiness

1. Check logs:
   ```bash
   kubectl logs -n ozzo -l app=auth-service
   ```

2. Verify environment variables:
   ```bash
   kubectl exec -it <pod-name> -n ozzo -- env | grep DATABASE_URL
   ```

3. Verify Okta configuration:
   ```bash
   curl -s https://dev-CHANGE_ME.okta.com/.well-known/openid-configuration | jq .
   ```

## Cleanup

### Remove Kubernetes resources

```bash
kubectl delete ns ozzo
```

### Destroy RDS (with caution)

```bash
cd ozzo/infrastructure/aws/terraform
terraform destroy  # Will prompt for confirmation
```

**Before destroying**, backup the database:
```bash
terraform apply -var="db_skip_final_snapshot=false" -var="final_snapshot_identifier=ozzo-backup-2024-01-15"
terraform destroy
```

## References

- [ozzo config schema](../src/config/env-schema.ts)
- [zuma infrastructure](../../zuma/infrastructure/README.md) — similar patterns
- [AWS RDS PostgreSQL docs](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html)
- [Kubernetes Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
