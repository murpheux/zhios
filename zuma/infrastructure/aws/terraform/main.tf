# Reference composition using the community EKS module — pin and review versions before real use.
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = var.cluster_name
  cluster_version = var.cluster_version

  vpc_id     = var.vpc_id
  subnet_ids = var.private_subnet_ids

  # Private API endpoint by default. Public access is only enabled when explicit operator CIDRs
  # are supplied (validated in variables.tf to never include 0.0.0.0/0).
  cluster_endpoint_private_access      = true
  cluster_endpoint_public_access       = length(var.eks_public_access_cidrs) > 0
  cluster_endpoint_public_access_cidrs = var.eks_public_access_cidrs

  eks_managed_node_groups = {
    default = {
      instance_types = var.node_instance_types
      min_size       = var.node_min_size
      max_size       = var.node_max_size
      desired_size   = var.node_desired_size
    }
  }

  tags = {
    Environment = var.environment
    Project     = "zuma"
  }
}

# Central log group for the three Fastify services when running on EKS (via Fluent Bit/CloudWatch agent)
# or Lambda (see lambda.tf).
resource "aws_cloudwatch_log_group" "zuma_services" {
  name              = "/zuma/${var.environment}/services"
  retention_in_days = var.log_retention_days
}

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}
data "aws_region" "current" {}

# Metadata-only lookups: aws_secretsmanager_secret never reads the secret VALUE, so nothing
# sensitive lands in state. Values are created/rotated out-of-band and read by Lambda at runtime.
data "aws_secretsmanager_secret" "jwt_secret" {
  arn = var.jwt_secret_arn
}

data "aws_secretsmanager_secret" "internal_jwt_secret" {
  arn = var.internal_jwt_secret_arn
}

# MONGODB_URI is deliberately NOT read via data "aws_ssm_parameter" (with_decryption would write
# the plaintext URI, credentials included, into state). Only the parameter NAME/ARN is used here;
# lambda-handler.ts fetches and decrypts it at cold start.
locals {
  mongo_uri_parameter_arn = format(
    "arn:%s:ssm:%s:%s:parameter/%s",
    data.aws_partition.current.partition,
    data.aws_region.current.name,
    data.aws_caller_identity.current.account_id,
    trimprefix(var.mongo_uri_parameter_name, "/"),
  )
}
