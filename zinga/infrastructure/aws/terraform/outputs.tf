# ============================================================================
# RDS Cluster Outputs
# ============================================================================

output "rds_cluster_id" {
  description = "RDS cluster identifier"
  value       = aws_rds_cluster.zinga.id
}

output "rds_cluster_arn" {
  description = "RDS cluster ARN"
  value       = aws_rds_cluster.zinga.arn
}

output "rds_endpoint" {
  description = "RDS cluster write endpoint (for write operations)"
  value       = aws_rds_cluster.zinga.endpoint
  sensitive   = false
}

output "rds_reader_endpoint" {
  description = "RDS cluster read endpoint (for read-only operations, load-balanced across replicas)"
  value       = aws_rds_cluster.zinga.reader_endpoint
  sensitive   = false
}

output "rds_port" {
  description = "RDS cluster port"
  value       = aws_rds_cluster.zinga.port
}

output "rds_database_name" {
  description = "Initial database name"
  value       = aws_rds_cluster.zinga.database_name
}

output "rds_master_username" {
  description = "Master database username"
  value       = var.master_username
  sensitive   = true
}

output "rds_engine_version" {
  description = "RDS PostgreSQL engine version"
  value       = aws_rds_cluster.zinga.engine_version
}

# ============================================================================
# Connection String Outputs
# ============================================================================

output "database_url_write" {
  description = "PostgreSQL connection URL for write operations (should be used by wallet-service)"
  value       = "postgresql://${var.master_username}:***@${aws_rds_cluster.zinga.endpoint}:5432/${aws_rds_cluster.zinga.database_name}?sslmode=require"
  sensitive   = true
}

output "database_url_read" {
  description = "PostgreSQL connection URL for read-only operations (use reader endpoint for SELECT-only workloads)"
  value       = "postgresql://${var.master_username}:***@${aws_rds_cluster.zinga.reader_endpoint}:5432/${aws_rds_cluster.zinga.database_name}?sslmode=require"
  sensitive   = true
}

# ============================================================================
# Secrets Manager Outputs
# ============================================================================

output "db_password_secret_arn" {
  description = "ARN of Secrets Manager secret containing master password"
  value       = aws_secretsmanager_secret.db_password.arn
}

output "db_password_secret_id" {
  description = "ID of Secrets Manager secret containing master password"
  value       = aws_secretsmanager_secret.db_password.id
}

# ============================================================================
# Instance Outputs
# ============================================================================

output "rds_instance_identifiers" {
  description = "List of RDS cluster instance identifiers (primary + replicas)"
  value       = aws_rds_cluster_instance.zinga[*].identifier
}

output "rds_instance_endpoints" {
  description = "List of RDS cluster instance endpoints with ports"
  value = [
    for instance in aws_rds_cluster_instance.zinga :
    "${instance.endpoint}:${instance.port}"
  ]
}

output "rds_primary_instance" {
  description = "Primary RDS instance identifier"
  value       = aws_rds_cluster_instance.zinga[0].identifier
}

# ============================================================================
# Security & Configuration Outputs
# ============================================================================

output "rds_security_group_id" {
  description = "Security group ID for RDS cluster"
  value       = aws_security_group.rds.id
}

output "rds_subnet_group_name" {
  description = "DB subnet group name"
  value       = aws_db_subnet_group.rds.name
}

output "rds_parameter_group_name" {
  description = "RDS cluster parameter group name"
  value       = aws_rds_cluster_parameter_group.rds.name
}

output "rds_backup_retention_period" {
  description = "Number of days backups are retained"
  value       = aws_rds_cluster.zinga.backup_retention_period
}

output "rds_backup_window" {
  description = "Preferred backup window (UTC)"
  value       = aws_rds_cluster.zinga.preferred_backup_window
}

output "rds_maintenance_window" {
  description = "Preferred maintenance window (UTC)"
  value       = aws_rds_cluster.zinga.preferred_maintenance_window
}

# ============================================================================
# Setup Instructions
# ============================================================================

output "setup_instructions" {
  description = "Instructions for setting up DATABASE_URL environment variable"
  value = <<-EOT
    ============================================================================
    ZINGA PostgreSQL RDS Setup Complete
    ============================================================================

    1. Set DATABASE_URL environment variable (for wallet-service):
       export DATABASE_URL="postgresql://${var.master_username}:<password>@${aws_rds_cluster.zinga.endpoint}:5432/${aws_rds_cluster.zinga.database_name}?sslmode=require"

    2. Retrieve master password from AWS Secrets Manager:
       aws secretsmanager get-secret-value --secret-id ${aws_secretsmanager_secret.db_password.id} --query 'SecretString' --output text

    3. Run database migrations (Phase 3):
       cd zinga && npm run db:migrate

    4. Verify connection:
       psql "postgresql://${var.master_username}@${aws_rds_cluster.zinga.endpoint}:5432/${aws_rds_cluster.zinga.database_name}?sslmode=require"

    5. For read-only operations, use reader endpoint:
       postgresql://${var.master_username}:***@${aws_rds_cluster.zinga.reader_endpoint}:5432/${aws_rds_cluster.zinga.database_name}?sslmode=require

    ============================================================================
    Cluster Details
    ============================================================================
    - Cluster ID: ${aws_rds_cluster.zinga.id}
    - Engine: ${aws_rds_cluster.zinga.engine} ${aws_rds_cluster.zinga.engine_version}
    - Instance Class: ${var.db_instance_class}
    - Instances: ${var.db_cluster_instance_count} (Primary + ${var.db_cluster_instance_count - 1} replicas)
    - Database: ${aws_rds_cluster.zinga.database_name}
    - Backup Retention: ${aws_rds_cluster.zinga.backup_retention_period} days
    - Encryption: ${aws_rds_cluster.zinga.storage_encrypted ? "Enabled (KMS)" : "Disabled"}
    - Monitoring: CloudWatch logs enabled for postgresql
  EOT
  sensitive = false
}
