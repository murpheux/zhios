output "rds_endpoint" {
  description = "RDS instance endpoint (hostname:port)"
  value       = aws_db_instance.ozzo.endpoint
}

output "rds_address" {
  description = "RDS instance hostname only (without port)"
  value       = aws_db_instance.ozzo.address
}

output "rds_port" {
  description = "RDS instance port"
  value       = aws_db_instance.ozzo.port
}

output "rds_database_name" {
  description = "Initial PostgreSQL database name"
  value       = aws_db_instance.ozzo.db_name
}

output "rds_username" {
  description = "RDS master username (CHANGE_ME if using default)"
  value       = aws_db_instance.ozzo.username
  sensitive   = true
}

output "database_url" {
  description = "Complete PostgreSQL connection string for DATABASE_URL env var (sensitive, do NOT log)"
  value       = "postgresql://${aws_db_instance.ozzo.username}:${var.db_password}@${aws_db_instance.ozzo.address}:${aws_db_instance.ozzo.port}/${aws_db_instance.ozzo.db_name}"
  sensitive   = true
}

output "database_url_template" {
  description = "PostgreSQL connection string template (replace {PASSWORD} with actual password)"
  value       = "postgresql://${aws_db_instance.ozzo.username}:{PASSWORD}@${aws_db_instance.ozzo.address}:${aws_db_instance.ozzo.port}/${aws_db_instance.ozzo.db_name}"
}

output "rds_arn" {
  description = "ARN of the RDS instance"
  value       = aws_db_instance.ozzo.arn
}

output "rds_resource_id" {
  description = "RDS resource ID (for CloudTrail, IAM policies, etc.)"
  value       = aws_db_instance.ozzo.resource_id
}

output "security_group_id" {
  description = "Security group ID for the RDS instance"
  value       = aws_security_group.ozzo_rds.id
}

output "cloudwatch_log_group_name" {
  description = "CloudWatch log group name for RDS PostgreSQL logs"
  value       = aws_cloudwatch_log_group.rds_postgresql.name
}

output "cloudwatch_log_group_arn" {
  description = "CloudWatch log group ARN"
  value       = aws_cloudwatch_log_group.rds_postgresql.arn
}
