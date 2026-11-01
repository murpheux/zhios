# ---------------------------------------------------------------------------------------------
# Docker endpoint
# ---------------------------------------------------------------------------------------------

variable "docker_host" {
  description = <<-EOT
    Docker daemon endpoint. Linux: unix:///var/run/docker.sock. Docker Desktop on macOS:
    unix:///Users/<you>/.docker/run/docker.sock (scripts/terraform-run.sh fills this from
    $DOCKER_HOST or the current docker context). Swarm manager: ssh://_ai_daemon@scarlet
    (plain containers on that node, ports bound to ITS loopback).
  EOT
  type        = string
  default     = "unix:///var/run/docker.sock"

  validation {
    condition     = can(regex("^(unix|tcp|ssh|npipe)://", var.docker_host))
    error_message = "docker_host must start with unix://, tcp://, ssh:// or npipe://."
  }
}

variable "docker_ssh_opts" {
  description = "Extra ssh options for ssh:// docker hosts (non-interactive, host keys verified)."
  type        = list(string)
  default     = ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=10"]
}

# ---------------------------------------------------------------------------------------------
# Naming / images
# ---------------------------------------------------------------------------------------------

variable "name_prefix" {
  description = "Prefix for container, network and volume names."
  type        = string
  default     = "zhios"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,30}$", var.name_prefix))
    error_message = "name_prefix must be kebab-case, 2-31 chars."
  }
}

variable "image_prefix" {
  description = "Repository prefix for locally built images (same tags as docker compose builds)."
  type        = string
  default     = "zhios"
}

variable "image_tag" {
  description = "Tag for locally built images. Never 'latest'."
  type        = string
  default     = "local"

  validation {
    condition     = var.image_tag != "latest"
    error_message = "Use an explicit image tag, not 'latest'."
  }
}

variable "build_images" {
  description = <<-EOT
    true: Terraform builds the images (docker_image build blocks, via the buildx builder below).
    false: reuse images already built locally with the same tags (`make build-images`, i.e.
    docker compose build) — fallback if the provider's build path misbehaves on your Docker.
  EOT
  type        = bool
  default     = true
}

variable "buildx_builder" {
  description = <<-EOT
    buildx builder used for image builds. The Dockerfiles use BuildKit features
    (RUN --mount=type=cache), which the legacy builder rejects. "default" is the builder every
    Docker install has.
  EOT
  type        = string
  default     = "default"
}

variable "mongo_image" {
  description = "MongoDB image. TODO: pin by digest (docker buildx imagetools inspect mongo:7.0.14)."
  type        = string
  default     = "mongo:7.0.14"
}

# ---------------------------------------------------------------------------------------------
# Published ports (always bound to bind_address)
# ---------------------------------------------------------------------------------------------

variable "bind_address" {
  description = "Host address for every published port. Keep loopback; nothing here is hardened for LAN exposure."
  type        = string
  default     = "127.0.0.1"
}

variable "web_port" {
  description = "Host port for web-spa."
  type        = number
  default     = 8080
}

variable "gateway_port" {
  description = "Host port for graphql-gateway."
  type        = number
  default     = 3003
}

variable "wallet_port" {
  description = "Host port for wallet-service."
  type        = number
  default     = 3001
}

variable "transaction_port" {
  description = "Host port for transaction-service."
  type        = number
  default     = 3002
}

variable "idp_port" {
  description = "Host port for the mock OIDC provider. Part of the token issuer (http://localhost:<idp_port>/zuma)."
  type        = number
  default     = 8090
}

variable "log_level" {
  description = "zuma services LOG_LEVEL."
  type        = string
  default     = "info"
}

# ---------------------------------------------------------------------------------------------
# Secrets — supply ONLY via TF_VAR_* from `op run` or scripts/terraform-run.sh, never tfvars.
# They end up in local state (container env), so use local-only values, not production ones.
# ---------------------------------------------------------------------------------------------

variable "mongo_root_username" {
  description = "MongoDB root user."
  type        = string
  default     = "zuma_admin"
}

variable "mongo_root_password" {
  description = "MongoDB root password (URL-encoded into MONGODB_URI)."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.mongo_root_password) >= 16
    error_message = "mongo_root_password must be at least 16 characters."
  }
}

variable "jwt_secret" {
  description = "HS256 secret required by the shared env schema (unused for user tokens while JWKS is enabled)."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.jwt_secret) >= 32
    error_message = "jwt_secret must be at least 32 characters."
  }
}

variable "internal_jwt_secret" {
  description = "Service-to-service HS256 secret (x-service-token). Must differ from jwt_secret."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.internal_jwt_secret) >= 32 && var.internal_jwt_secret != var.jwt_secret
    error_message = "internal_jwt_secret must be at least 32 characters and differ from jwt_secret."
  }
}

variable "metrics_token" {
  description = "Bearer token guarding /metrics."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.metrics_token) >= 16
    error_message = "metrics_token must be at least 16 characters."
  }
}
