# AWS resources for ozzo auth/subscription service
# Primary: RDS PostgreSQL database for user subscriptions, auth tokens, etc.
# Secondary: Security groups, logging, backups

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# CloudWatch log group for RDS PostgreSQL logs
resource "aws_cloudwatch_log_group" "rds_postgresql" {
  name              = "/aws/rds/ozzo/${var.environment}"
  retention_in_days = var.log_retention_days

  tags = merge(var.tags, {
    Name = "ozzo-rds-logs"
  })
}

# Security group for RDS (inbound PostgreSQL traffic)
resource "aws_security_group" "ozzo_rds" {
  name_prefix = "ozzo-rds-"
  description = "Security group for ozzo RDS PostgreSQL database"
  vpc_id      = data.aws_vpc.default.id

  tags = merge(var.tags, {
    Name = "ozzo-rds-sg"
  })
}

# Allow inbound PostgreSQL from EKS cluster (if specified)
resource "aws_security_group_rule" "rds_from_eks" {
  count = var.eks_security_group_id != null ? 1 : 0

  type                     = "ingress"
  from_port                = var.db_port
  to_port                  = var.db_port
  protocol                 = "tcp"
  source_security_group_id = var.eks_security_group_id
  security_group_id        = aws_security_group.ozzo_rds.id

  description = "PostgreSQL from EKS cluster"
}

# Allow inbound PostgreSQL from additional security groups
resource "aws_security_group_rule" "rds_from_security_groups" {
  for_each = toset(var.allowed_security_group_ids)

  type                     = "ingress"
  from_port                = var.db_port
  to_port                  = var.db_port
  protocol                 = "tcp"
  source_security_group_id = each.value
  security_group_id        = aws_security_group.ozzo_rds.id

  description = "PostgreSQL from ${each.value}"
}

# Allow inbound PostgreSQL from CIDR blocks (only if publicly accessible)
resource "aws_security_group_rule" "rds_from_cidr" {
  count = length(var.allowed_cidr_blocks) > 0 ? 1 : 0

  type              = "ingress"
  from_port         = var.db_port
  to_port           = var.db_port
  protocol          = "tcp"
  cidr_blocks       = var.allowed_cidr_blocks
  security_group_id = aws_security_group.ozzo_rds.id

  description = "PostgreSQL from allowed CIDR blocks"
}

# Allow all outbound (default deny everything, explicitly allow what's needed)
resource "aws_security_group_rule" "rds_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.ozzo_rds.id

  description = "Allow all outbound"
}

# RDS PostgreSQL database
resource "aws_db_instance" "ozzo" {
  identifier     = "ozzo-${var.environment}"
  engine         = "postgres"
  engine_version = "16"

  instance_class       = var.db_instance_class
  allocated_storage    = var.db_storage_allocated_gb
  max_allocated_storage = var.db_max_allocated_storage_gb

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password
  port     = var.db_port

  # Security and encryption
  publicly_accessible = var.db_publicly_accessible
  storage_encrypted   = true
  kms_key_id          = var.kms_key_id
  storage_type        = "gp3"
  iops                = 3000 # gp3 minimum

  # Multi-AZ (HA)
  multi_az = var.db_multi_az

  # Backups
  backup_retention_period = var.db_backup_retention_days
  backup_window           = "03:00-04:00" # UTC
  copy_tags_to_snapshot   = true
  skip_final_snapshot     = var.db_skip_final_snapshot
  final_snapshot_identifier = var.db_skip_final_snapshot ? null : "ozzo-${var.environment}-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"

  # Maintenance
  maintenance_window = "sun:04:00-sun:05:00" # UTC
  auto_minor_version_upgrade = true

  # Monitoring
  enable_cloudwatch_logs_exports = var.enable_cloudwatch_logs ? ["postgresql"] : []
  monitoring_interval             = var.environment == "prod" ? 60 : 0
  monitoring_role_arn             = var.environment == "prod" ? aws_iam_role.rds_monitoring[0].arn : null

  # Performance Insights (optional, for prod)
  performance_insights_enabled = var.environment == "prod" ? true : false
  performance_insights_retention_period = var.environment == "prod" ? 7 : null

  # Parameter group (default for now; customize if needed)
  parameter_group_name = "default.postgres16"

  # Security group
  vpc_security_group_ids = [aws_security_group.ozzo_rds.id]

  tags = merge(var.tags, {
    Name = "ozzo-postgres-${var.environment}"
  })

  depends_on = [aws_cloudwatch_log_group.rds_postgresql]
}

# IAM role for RDS Enhanced Monitoring (prod only)
resource "aws_iam_role" "rds_monitoring" {
  count = var.environment == "prod" ? 1 : 0

  name_prefix = "ozzo-rds-monitoring-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(var.tags, {
    Name = "ozzo-rds-monitoring-role"
  })
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  count = var.environment == "prod" ? 1 : 0

  role       = aws_iam_role.rds_monitoring[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# Retrieve the default VPC for the database (optional — customize for production)
data "aws_vpc" "default" {
  default = true
}
