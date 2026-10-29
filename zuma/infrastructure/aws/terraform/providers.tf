# Reference/example only — not production-hardened. Review against your org's security baseline
# (private subnets, IRSA least-privilege, KMS CMKs, etc.) before using this to provision real infra.
terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }

  # Example only — point this at a real backend (S3 + DynamoDB lock table) before use.
  backend "s3" {
    bucket = "CHANGE_ME-zuma-tfstate"
    key    = "zuma/eks/terraform.tfstate"
    region = "us-east-1"
  }
}

provider "aws" {
  region = var.aws_region
}
