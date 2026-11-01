terraform {
  required_version = ">= 1.9.0"

  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.6"
    }
  }

  # Local backend on purpose: the docker provider stores every container's env (including the
  # JWT/Mongo secrets) in state. terraform.tfstate is git-ignored and kept at mode 600 by
  # scripts/terraform-run.sh. Do not point this at a shared backend with real secrets.
  backend "local" {
    path = "terraform.tfstate"
  }
}

provider "docker" {
  host     = var.docker_host
  ssh_opts = var.docker_ssh_opts
}
