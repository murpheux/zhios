variable "aws_region" {
  description = "AWS region to deploy RDS into"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment name (dev, staging, prod)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod"
  }
}

variable "db_instance_class" {
  description = "RDS instance class (db.t3.micro for dev, db.t3.small or larger for production)"
  type        = string
  default     = "db.t3.micro"
}

variable "db_name" {
  description = "Initial PostgreSQL database name"
  type        = string
  default     = "ozzo"
}

variable "db_username" {
  description = "Master username for PostgreSQL (never store in tfvars; use env vars or Secrets Manager)"
  type        = string
  sensitive   = true
  # Example: var.db_username = "ozzo_admin"
}

variable "db_password" {
  description = "Master password for PostgreSQL (never store in tfvars; use env vars or Secrets Manager). Minimum 8 chars, must contain uppercase, lowercase, number, and special char."
  type        = string
  sensitive   = true
  # Example in .tfvars or env var: TF_VAR_db_password="SomeP@ssw0rd123"
}

variable "db_port" {
  description = "PostgreSQL port"
  type        = number
  default     = 5432
}

variable "db_storage_allocated_gb" {
  description = "Initial storage allocation in GB (auto-scaling enabled by default)"
  type        = number
  default     = 20

  validation {
    condition     = var.db_storage_allocated_gb >= 20
    error_message = "db_storage_allocated_gb must be at least 20 GB"
  }
}

variable "db_max_allocated_storage_gb" {
  description = "Maximum storage for auto-scaling in GB (set to allocated for no scaling)"
  type        = number
  default     = 100

  validation {
    condition     = var.db_max_allocated_storage_gb >= var.db_storage_allocated_gb
    error_message = "db_max_allocated_storage_gb must be >= db_storage_allocated_gb"
  }
}

variable "db_backup_retention_days" {
  description = "Number of days to retain automated backups (0-35)"
  type        = number
  default     = 7

  validation {
    condition     = var.db_backup_retention_days >= 0 && var.db_backup_retention_days <= 35
    error_message = "db_backup_retention_days must be between 0 and 35"
  }
}

variable "db_multi_az" {
  description = "Enable Multi-AZ deployment for high availability (recommended for prod)"
  type        = bool
  default     = false
}

variable "db_publicly_accessible" {
  description = "Make RDS publicly accessible (not recommended; should be private in K8s cluster only)"
  type        = bool
  default     = false
}

variable "db_skip_final_snapshot" {
  description = "Skip final snapshot on destroy (use false in production)"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch retention for RDS logs"
  type        = number
  default     = 30
}

variable "enable_cloudwatch_logs" {
  description = "Enable CloudWatch Logs for PostgreSQL (postgresql logs)"
  type        = bool
  default     = true
}

variable "kms_key_id" {
  description = "KMS key ID for RDS encryption at rest (null = AWS-managed key). Must be customer-managed in production."
  type        = string
  default     = null
  sensitive   = true
}

variable "eks_security_group_id" {
  description = "EKS cluster security group ID — RDS will allow inbound on 5432 from this group. Omit if not deploying alongside EKS."
  type        = string
  default     = null
}

variable "allowed_security_group_ids" {
  description = "Additional security group IDs allowed to connect to RDS"
  type        = list(string)
  default     = []
}

variable "allowed_cidr_blocks" {
  description = "CIDR blocks allowed to connect to RDS (if not using security groups). Only applicable if db_publicly_accessible=true."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
