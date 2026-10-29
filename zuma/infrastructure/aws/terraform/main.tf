# Reference composition using the community EKS module — pin and review versions before real use.
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = var.cluster_name
  cluster_version = var.cluster_version

  vpc_id     = var.vpc_id
  subnet_ids = var.private_subnet_ids

  # Example-only default; restrict/remove for any real cluster
  cluster_endpoint_public_access = true

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
  retention_in_days = 30
}

# Data sources only — secret values are created and rotated out-of-band (1Password/Secrets Manager
# console/CI), never written as literals in HCL.
data "aws_secretsmanager_secret" "jwt_secret" {
  arn = var.jwt_secret_arn
}

data "aws_ssm_parameter" "mongo_uri" {
  name            = var.mongo_uri_parameter_name
  with_decryption = true
}
