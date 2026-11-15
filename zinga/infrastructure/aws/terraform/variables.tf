variable "aws_region" {
  description = "AWS region for RDS deployment"
  type        = string
  default     = "ca-central-1"
}

variable "environment" {
  description = "Deployment environment (development, staging, production)"
  type        = string
  default     = "development"

  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be one of: development, staging, production."
  }
}

variable "cluster_identifier" {
  description = "RDS cluster identifier"
  type        = string
  default     = "zinga-postgres"
}

variable "database_name" {
  description = "Initial database name"
  type        = string
  default     = "zinga_wallet"

  validation {
    condition     = length(var.database_name) <= 63
    error_message = "Database name must be 63 characters or less."
  }
}

variable "master_username" {
  description = "Master database username"
  type        = string
  default     = "zinga_admin"
  sensitive   = true
}

variable "db_instance_class" {
  description = "RDS instance class for cluster members"
  type        = string
  default     = "db.t4g.medium" # 2 vCPU, 4 GB RAM; ARM-based (Graviton2) for cost efficiency

  validation {
    condition     = can(regex("^db\\.[a-z0-9]+\\.[a-z0-9]+$", var.db_instance_class))
    error_message = "Instance class must be a valid RDS instance type (e.g., db.t4g.medium)."
  }
}

variable "db_cluster_instance_count" {
  description = "Number of instances in the RDS cluster (minimum 2 for HA)"
  type        = number
  default     = 2

  validation {
    condition     = var.db_cluster_instance_count >= 2
    error_message = "Cluster must have at least 2 instances for high availability."
  }
}

variable "engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "16.1"
}

variable "backup_retention_period" {
  description = "Backup retention period in days"
  type        = number
  default     = 30

  validation {
    condition     = var.backup_retention_period >= 1 && var.backup_retention_period <= 35
    error_message = "Backup retention must be between 1 and 35 days."
  }
}

variable "preferred_backup_window" {
  description = "Preferred backup window (UTC, HH:MM-HH:MM format)"
  type        = string
  default     = "03:00-04:00"
}

variable "preferred_maintenance_window" {
  description = "Preferred maintenance window (UTC, ddd:HH:MM-ddd:HH:MM format)"
  type        = string
  default     = "sun:04:00-sun:05:00"
}

variable "skip_final_snapshot" {
  description = "Skip final snapshot on cluster deletion (false in production)"
  type        = bool
  default     = true
}

variable "enable_cloudwatch_logs" {
  description = "Enable CloudWatch log exports for PostgreSQL"
  type        = bool
  default     = true
}

variable "enable_monitoring" {
  description = "Enable RDS performance insights and monitoring"
  type        = bool
  default     = true
}

variable "monitoring_interval" {
  description = "Monitoring interval in seconds (0 to disable, 60 or 1-120)"
  type        = number
  default     = 60

  validation {
    condition     = var.monitoring_interval == 0 || (var.monitoring_interval >= 60 && var.monitoring_interval <= 3600)
    error_message = "Monitoring interval must be 0 (disabled) or between 60 and 3600 seconds."
  }
}

variable "enable_iam_db_authentication" {
  description = "Enable IAM database authentication"
  type        = bool
  default     = true
}

variable "storage_encrypted" {
  description = "Enable encryption at rest using AWS KMS"
  type        = bool
  default     = true
}

variable "publicly_accessible" {
  description = "Make RDS cluster publicly accessible (false in production)"
  type        = bool
  default     = false
}

variable "vpc_id" {
  description = "VPC ID for RDS deployment (optional; if not provided, uses default VPC)"
  type        = string
  default     = null
}

variable "db_subnet_group_name" {
  description = "DB subnet group name (optional; created if not provided)"
  type        = string
  default     = "zinga-postgres-subnet-group"
}

variable "allowed_security_group_ids" {
  description = "Security group IDs allowed to connect to RDS (optional; restricted to wallet-service SG by default)"
  type        = list(string)
  default     = []
}

variable "allowed_cidr_blocks" {
  description = "CIDR blocks allowed to connect to RDS (optional)"
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}

variable "enable_deletion_protection" {
  description = "Enable deletion protection (recommended for production)"
  type        = bool
  default     = false
}
