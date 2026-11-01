variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment name"
  type        = string
  default     = "dev"
}

variable "cluster_name" {
  description = "EKS cluster name"
  type        = string
  default     = "zuma"
}

variable "cluster_version" {
  description = "Kubernetes version for the EKS control plane"
  type        = string
  default     = "1.30"
}

variable "vpc_id" {
  description = "VPC to deploy the EKS cluster into — supply an existing VPC's ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for worker nodes"
  type        = list(string)
}

variable "eks_public_access_cidrs" {
  description = "Operator CIDRs allowed to reach the public EKS API endpoint. Empty (default) = private endpoint only."
  type        = list(string)
  default     = []

  validation {
    condition     = !contains(var.eks_public_access_cidrs, "0.0.0.0/0") && !contains(var.eks_public_access_cidrs, "::/0")
    error_message = "eks_public_access_cidrs must not contain 0.0.0.0/0 or ::/0 — list specific operator/VPN CIDRs."
  }
}

variable "node_instance_types" {
  description = "EC2 instance types for the managed node group"
  type        = list(string)
  default     = ["t3.medium"]
}

variable "node_min_size" {
  type    = number
  default = 2
}

variable "node_max_size" {
  type    = number
  default = 6
}

variable "node_desired_size" {
  type    = number
  default = 2
}

variable "log_retention_days" {
  description = "CloudWatch retention for service, Lambda and API Gateway access logs"
  type        = number
  default     = 30
}

variable "jwt_secret_arn" {
  description = "ARN of an existing Secrets Manager secret holding JWT_SECRET (create out-of-band, never in HCL)"
  type        = string
}

variable "internal_jwt_secret_arn" {
  description = "ARN of an existing Secrets Manager secret holding INTERNAL_JWT_SECRET (>= 32 chars, distinct from JWT_SECRET; create out-of-band)"
  type        = string
}

variable "secrets_kms_key_arn" {
  description = "Customer-managed KMS key ARN encrypting the Secrets Manager secrets. null = AWS-managed aws/secretsmanager key (no IAM grant needed)."
  type        = string
  default     = null
}

variable "mongo_uri_parameter_name" {
  description = "SSM Parameter Store name (SecureString) holding MONGODB_URI"
  type        = string
  default     = "/zuma/mongodb-uri"
}

variable "mongo_uri_kms_key_arn" {
  description = "Customer-managed KMS key ARN encrypting the MONGODB_URI SecureString. null = AWS-managed aws/ssm key (no IAM grant needed)."
  type        = string
  default     = null
}

variable "transaction_service_url" {
  description = "Base URL wallet-service uses to reach transaction-service"
  type        = string
  default     = "https://internal.zuma.example.com/transaction"
}

variable "lambda_subnet_ids" {
  description = "Private subnet IDs for the wallet-service Lambda ENIs — production must supply real values"
  type        = list(string)
  default     = []
}

variable "lambda_security_group_ids" {
  description = "Security group IDs attached to the wallet-service Lambda — production must supply real values"
  type        = list(string)
  default     = []
}

variable "wallet_lambda_package_dir" {
  description = "Staging directory produced by scripts/package-lambda.sh (dist + production node_modules)"
  type        = string
  default     = null
}
