# Zinga PostgreSQL RDS Terraform Configuration

This directory contains Infrastructure as Code (Terraform) for deploying a high-availability Amazon RDS Aurora PostgreSQL cluster for the Zinga wallet service.

## Overview

The Terraform configuration creates:

- **Aurora PostgreSQL 16 Cluster** with automatic failover
- **Primary + Read Replica** instances (configurable, minimum 2 for HA)
- **Enhanced Monitoring** with CloudWatch logs and RDS Performance Insights
- **Automated Backups** with 30-day retention
- **KMS Encryption** at rest
- **AWS Secrets Manager** integration for secure password management
- **Security Groups** with fine-grained network access control
- **CloudWatch Alarms** for CPU and connection monitoring

## Architecture

```
┌─────────────────────────────────────────────┐
│           AWS RDS Aurora PostgreSQL         │
│  ┌──────────────────────────────────────┐  │
│  │ Cluster: zinga-postgres              │  │
│  │ Engine: aurora-postgresql 16.1       │  │
│  │ Multi-AZ: Yes (automatic failover)   │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  Primary (db.t4g.medium)                   │
│  └─ Accepts read + write                   │
│                                             │
│  Read Replica #1 (db.t4g.medium)           │
│  └─ Read-only load balancing               │
│                                             │
│  Read Replica #2+ (configurable)           │
│  └─ Read-only load balancing               │
│                                             │
│  Backups: 30 days retention                │
│  Encryption: KMS (at rest)                 │
│  Logs: CloudWatch (postgresql)             │
└─────────────────────────────────────────────┘
```

## Prerequisites

1. **AWS Account** with appropriate credentials configured
2. **Terraform** >= 1.0
3. **AWS CLI** (optional, for retrieving password from Secrets Manager)

## Quick Start

### 1. Initialize Terraform

```bash
cd zinga/infrastructure/aws/terraform
terraform init
```

### 2. Configure Variables

Copy and customize the variables file:

```bash
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your specific values
```

Key variables to customize:

- `aws_region`: AWS region (default: `ca-central-1`)
- `environment`: `development`, `staging`, or `production`
- `db_instance_class`: Instance size (default: `db.t4g.medium` for dev)
- `db_cluster_instance_count`: Number of instances (minimum 2)
- `backup_retention_period`: Days to retain backups (default: 30)
- `enable_deletion_protection`: Recommended for production

### 3. Plan Deployment

Review the changes Terraform will make:

```bash
terraform plan -out=tfplan
```

### 4. Apply Configuration

Deploy the RDS cluster:

```bash
terraform apply tfplan
```

This will:
- Create VPC security group with PostgreSQL access rules
- Set up DB subnet group across multiple availability zones
- Create RDS Aurora PostgreSQL cluster with specified instances
- Generate random master password and store in Secrets Manager
- Configure CloudWatch logs and monitoring
- Set up CloudWatch alarms for health monitoring

### 5. Retrieve Outputs

Get connection details:

```bash
# Display all outputs
terraform output

# Get specific outputs
terraform output rds_endpoint
terraform output rds_reader_endpoint
terraform output db_password_secret_arn

# Export outputs to JSON
terraform output -json > rds-outputs.json
```

### 6. Set Environment Variables

Retrieve the master password:

```bash
# Fetch password from Secrets Manager
PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id $(terraform output -raw db_password_secret_id) \
  --query SecretString --output text)

# Set DATABASE_URL for wallet-service
export DATABASE_URL="postgresql://zinga_admin:${PASSWORD}@$(terraform output -raw rds_endpoint):5432/zinga_wallet?sslmode=require"
```

## Files

| File | Purpose |
|------|---------|
| `main.tf` | Provider configuration and global settings |
| `variables.tf` | Input variables with validation |
| `rds.tf` | RDS cluster, instances, security, and monitoring |
| `outputs.tf` | Output values and setup instructions |
| `terraform.tfvars.example` | Example variable values (copy to `terraform.tfvars`) |
| `.gitignore` | Git ignore rules for Terraform state files |

## Configuration Details

### Instance Classes

The default `db.t4g.medium` is recommended for:
- **Development**: Cost-efficient, suitable for testing
- **Staging**: Burstable performance for pre-prod workloads

For **production**, consider:
- `db.r6g.large`: General purpose with more memory
- `db.r6g.xlarge`: Higher performance tier
- `db.r7g.large`: Latest generation Graviton3 (if available)

### High Availability

- **Automatic Failover**: If primary instance fails, read replica promotes to primary (~30s recovery time)
- **Multi-AZ Deployment**: Instances spread across different availability zones
- **Reader Endpoint**: Load-balanced read-only access across replicas
- **Minimum 2 Instances**: Required for failover capability

### Backups

- **Automated Backups**: Retained for `backup_retention_period` days
- **Backup Window**: UTC time (default: 03:00-04:00)
- **Restore Point**: Any time within retention period
- **Final Snapshot**: Created on cluster deletion (unless `skip_final_snapshot=true`)

### Security

- **Encryption at Rest**: KMS (AWS-managed key by default)
- **Encryption in Transit**: SSL/TLS (required via `sslmode=require`)
- **IAM Database Authentication**: Optional, for temporary credentials
- **Security Group**: Restricts PostgreSQL (5432) to VPC CIDR and allowed security groups
- **Secrets Manager**: Master password stored securely with 7-day recovery window

### Monitoring

- **CloudWatch Logs**: PostgreSQL slow query logs exported
- **RDS Performance Insights**: Detailed database performance metrics
- **Enhanced Monitoring**: 60-second granularity monitoring
- **CloudWatch Alarms**:
  - High CPU utilization (>80% for 10 minutes)
  - High connection count (>80 active connections)

## Phase 3: Running Migrations

Once the RDS cluster is deployed, run database migrations:

```bash
cd zinga

# Install dependencies
npm ci

# Set DATABASE_URL
export DATABASE_URL="postgresql://zinga_admin:${PASSWORD}@$(terraform output -raw rds_endpoint):5432/zinga_wallet?sslmode=require"

# Run migrations (creates schema from init-postgres.sql)
npm run db:migrate

# Verify schema
psql "$DATABASE_URL" -c "\\dt"
```

## Phase 5: Destroying Resources

To remove the RDS cluster and associated resources:

```bash
terraform destroy
```

**Warning**: This operation is **irreversible**. Ensure you have backups before destroying production resources.

For safety, enable `enable_deletion_protection = true` in production to prevent accidental deletion.

## Troubleshooting

### "Database still being created"

The RDS cluster may take 5-10 minutes to become available. Check status:

```bash
aws rds describe-db-clusters --db-cluster-identifier zinga-postgres
```

### "Connection refused"

1. Verify the security group allows inbound traffic on port 5432
2. Ensure your IP/security group is in the allowed list
3. Confirm the cluster is in "available" state
4. Test with psql: `psql "postgresql://zinga_admin@<endpoint>:5432/zinga_wallet"`

### "Failed to authenticate"

1. Retrieve the correct password from Secrets Manager
2. Ensure DATABASE_URL has the correct format
3. Use `psql` to manually test: `psql -h <endpoint> -U zinga_admin -d zinga_wallet`

## Cost Optimization

- Use `db.t4g.medium` for development/testing
- Set `skip_final_snapshot = true` for dev (faster cleanup)
- Use `db_cluster_instance_count = 2` for minimal HA
- Enable `auto_minor_version_upgrade = false` in production for stability
- Monitor CloudWatch metrics to right-size instances over time

## Useful Commands

```bash
# List all RDS clusters
aws rds describe-db-clusters

# Check cluster status
aws rds describe-db-clusters --db-cluster-identifier zinga-postgres

# View enhanced monitoring
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name CPUUtilization \
  --dimensions Name=DBClusterIdentifier,Value=zinga-postgres \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-02T00:00:00Z \
  --period 300 \
  --statistics Average

# Retrieve password
aws secretsmanager get-secret-value \
  --secret-id zinga/rds/master-password \
  --query SecretString --output text
```

## References

- [AWS RDS Aurora PostgreSQL Documentation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Aurora.AuroraPostgreSQL.html)
- [Terraform AWS Provider - RDS](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/rds_cluster)
- [PostgreSQL Driver - Connection Strings](https://www.postgresql.org/docs/current/libpq-connect.html)
- [Phase 3 Migration Guide](../../docs/MIGRATION_FROM_ZUMA.md)

## Support

For issues or questions:

1. Check the troubleshooting section above
2. Review Terraform state: `terraform state show`
3. Check RDS cluster logs: `aws rds describe-db-cluster-logs`
4. Contact the platform team
