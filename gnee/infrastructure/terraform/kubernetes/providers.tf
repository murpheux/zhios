# Reads the local kubeconfig by default — point KUBE_CONFIG_PATH / var.kube_context at
# whichever cluster you're deploying to (no cluster is provisioned here; this module only
# applies manifests to one that already exists, unlike zuma's AWS EKS module).
terraform {
  required_version = ">= 1.6"
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.31"
    }
  }
}

provider "kubernetes" {
  config_path    = var.kubeconfig_path
  config_context = var.kube_context
}
