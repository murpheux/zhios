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

variable "jwt_secret_arn" {
  description = "ARN of an existing Secrets Manager secret holding JWT_SECRET (create out-of-band, never in HCL)"
  type        = string
}

variable "mongo_uri_parameter_name" {
  description = "SSM Parameter Store name (SecureString) holding MONGODB_URI"
  type        = string
  default     = "/zuma/mongodb-uri"
}

variable "lambda_subnet_ids" {
  description = "Private subnet IDs for the wallet-service Lambda ENIs \u2014 production must supply real values"
  type        = list(string)
  default     = []
}

variable "lambda_security_group_ids" {
  description = "Security group IDs attached to the wallet-service Lambda \u2014 production must supply real values"
  type        = list(string)
  default     = []
}
