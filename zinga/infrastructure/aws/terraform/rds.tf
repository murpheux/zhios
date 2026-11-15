# ============================================================================
# AWS RDS Aurora PostgreSQL Cluster for Zinga Wallet Service
# ============================================================================
# High-availability PostgreSQL cluster with:
# - Aurora PostgreSQL 16 with automatic failover
# - Primary + read replica for HA (configurable count)
# - Enhanced monitoring with CloudWatch logs
# - Automated backups (30-day retention)
# - KMS encryption at rest
# - Secrets Manager integration for password management
# ============================================================================

# ============================================================================
# Security Group for RDS
# ============================================================================

resource "aws_security_group" "rds" {
  name        = "${var.cluster_identifier}-sg"
  description = "Security group for Zinga PostgreSQL RDS cluster"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = concat([data.aws_vpc.default.cidr_block], var.allowed_cidr_blocks)
    description = "PostgreSQL from VPC and allowed CIDRs"
  }

  dynamic "ingress" {
    for_each = var.allowed_security_group_ids
    content {
      from_port       = 5432
      to_port         = 5432
      protocol        = "tcp"
      security_groups = [ingress.value]
      description     = "PostgreSQL from ${ingress.value}"
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound"
  }

  tags = {
    Name = "${var.cluster_identifier}-sg"
  }
}

# ============================================================================
# DB Subnet Group
# ============================================================================

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }

  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

resource "aws_db_subnet_group" "rds" {
  name           = var.db_subnet_group_name
  subnet_ids     = data.aws_subnets.default.ids
  description    = "Subnet group for Zinga RDS cluster"

  tags = {
    Name = var.db_subnet_group_name
  }
}

# ============================================================================
# RDS Cluster Parameter Group
# ============================================================================

resource "aws_rds_cluster_parameter_group" "rds" {
  family      = "aurora-postgresql16"
  name        = "${var.cluster_identifier}-param-group"
  description = "Parameter group for Zinga PostgreSQL cluster"

  # Enable slow query log for performance monitoring
  parameter {
    name  = "log_statement"
    value = var.environment == "production" ? "mod" : "all"
  }

  parameter {
    name  = "log_duration"
    value = "1"
  }

  # Log connections for security audit trail
  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  tags = {
    Name = "${var.cluster_identifier}-param-group"
  }
}

# ============================================================================
# Random Master Password
# ============================================================================

resource "random_password" "master_password" {
  length  = 32
  special = true
  # Exclude problematic characters for PostgreSQL connection strings
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# ============================================================================
# AWS Secrets Manager for Database Password
# ============================================================================

resource "aws_secretsmanager_secret" "db_password" {
  name                    = "zinga/rds/master-password"
  description             = "Master password for Zinga PostgreSQL RDS cluster"
  recovery_window_in_days = 7

  tags = {
    Name = "zinga-rds-master-password"
  }
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id      = aws_secretsmanager_secret.db_password.id
  secret_string  = random_password.master_password.result
}

# ============================================================================
# RDS Aurora PostgreSQL Cluster
# ============================================================================

resource "aws_rds_cluster" "zinga" {
  cluster_identifier              = var.cluster_identifier
  engine                          = "aurora-postgresql"
  engine_version                  = var.engine_version
  database_name                   = var.database_name
  master_username                 = var.master_username
  master_password                 = random_password.master_password.result
  backup_retention_period         = var.backup_retention_period
  preferred_backup_window         = var.preferred_backup_window
  preferred_maintenance_window    = var.preferred_maintenance_window

  db_subnet_group_name            = aws_db_subnet_group.rds.name
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.rds.name
  vpc_security_group_ids          = [aws_security_group.rds.id]

  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "zinga-postgres-final-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"

  # Encryption at rest using AWS KMS
  storage_encrypted = var.storage_encrypted
  # kms_key_id      = aws_kms_key.rds.arn  # TODO: Uncomment for custom KMS key

  # CloudWatch Logs
  enabled_cloudwatch_logs_exports = var.enable_cloudwatch_logs ? ["postgresql"] : []

  # High availability
  deletion_protection = var.enable_deletion_protection

  # Copy tags to snapshots for cost allocation
  copy_tags_to_snapshot = true

  # Cluster endpoints for read/write separation
  enable_http_endpoint = false # RDS Data API (not needed for direct connections)

  # IAM database authentication
  enable_iam_database_authentication = var.enable_iam_db_authentication

  tags = merge(
    {
      Name = var.cluster_identifier
    },
    var.tags,
  )

  depends_on = [
    aws_db_subnet_group.rds,
    aws_rds_cluster_parameter_group.rds,
  ]
}

# ============================================================================
# RDS Cluster Instances (Primary + Replicas)
# ============================================================================

resource "aws_rds_cluster_instance" "zinga" {
  count              = var.db_cluster_instance_count
  identifier         = "${var.cluster_identifier}-${count.index + 1}"
  cluster_identifier = aws_rds_cluster.zinga.id

  instance_class           = var.db_instance_class
  engine                   = aws_rds_cluster.zinga.engine
  engine_version           = aws_rds_cluster.zinga.engine_version
  publicly_accessible      = var.publicly_accessible
  auto_minor_version_upgrade = var.environment == "production" ? false : true

  # Monitoring
  monitoring_interval             = var.enable_monitoring ? var.monitoring_interval : 0
  monitoring_role_arn             = var.enable_monitoring ? aws_iam_role.rds_monitoring.arn : null
  performance_insights_enabled    = var.enable_monitoring && var.environment != "development"
  performance_insights_kms_key_id = var.enable_monitoring && var.environment != "development" ? null : null

  # Failover priority (lower = higher priority to become primary)
  promotion_tier = count.index

  tags = merge(
    {
      Name  = "${var.cluster_identifier}-${count.index + 1}"
      Role  = count.index == 0 ? "primary" : "replica"
      Index = count.index + 1
    },
    var.tags,
  )

  depends_on = [aws_rds_cluster.zinga]
}

# ============================================================================
# IAM Role for RDS Monitoring
# ============================================================================

resource "aws_iam_role" "rds_monitoring" {
  name               = "${var.cluster_identifier}-monitoring-role"
  assume_role_policy = data.aws_iam_policy_document.rds_monitoring_assume.json

  tags = {
    Name = "${var.cluster_identifier}-monitoring-role"
  }
}

data "aws_iam_policy_document" "rds_monitoring_assume" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["monitoring.rds.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# ============================================================================
# CloudWatch Alarms for RDS Cluster Health
# ============================================================================

resource "aws_cloudwatch_metric_alarm" "db_cpu" {
  alarm_name          = "${var.cluster_identifier}-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "Alert when RDS CPU exceeds 80%"

  dimensions = {
    DBClusterIdentifier = aws_rds_cluster.zinga.cluster_identifier
  }

  tags = {
    Name = "${var.cluster_identifier}-high-cpu-alarm"
  }
}

resource "aws_cloudwatch_metric_alarm" "db_connections" {
  alarm_name          = "${var.cluster_identifier}-high-connections"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80" # Adjust based on max_connections parameter
  alarm_description   = "Alert when RDS connections are high"

  dimensions = {
    DBClusterIdentifier = aws_rds_cluster.zinga.cluster_identifier
  }

  tags = {
    Name = "${var.cluster_identifier}-high-connections-alarm"
  }
}

# ============================================================================
# Data Sources
# ============================================================================

data "aws_vpc" "default" {
  default = var.vpc_id == null ? true : false
  id      = var.vpc_id
}
