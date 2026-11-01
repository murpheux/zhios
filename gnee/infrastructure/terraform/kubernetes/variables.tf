variable "kubeconfig_path" {
  description = "Path to the kubeconfig file to deploy with."
  type        = string
  default     = "~/.kube/config"
}

variable "kube_context" {
  description = "kubeconfig context to use (null = current-context)."
  type        = string
  default     = null
}

variable "web_spa_image" {
  description = "Fully-qualified image reference for gnee/web-spa with an explicit tag or digest (built from infrastructure/docker/web-spa.Dockerfile and pushed to a registry reachable by the cluster)."
  type        = string

  validation {
    condition     = !endswith(var.web_spa_image, ":latest") && can(regex("[:@]", var.web_spa_image))
    error_message = "web_spa_image must carry an explicit version tag or @sha256 digest, never :latest."
  }
}

variable "web_spa_host" {
  description = "Public hostname served over HTTPS by the Ingress (TLS cert issued by cert-manager)."
  type        = string
}

variable "cert_manager_cluster_issuer" {
  description = "cert-manager ClusterIssuer name used for the web-spa TLS certificate."
  type        = string
}

variable "ingress_class_name" {
  description = "IngressClass of the cluster's ingress controller."
  type        = string
  default     = "nginx"
}

variable "zuma_gateway_origin" {
  description = "Origin (https://host[:port], no path) of the zuma GraphQL gateway, allowed in the CSP connect-src."
  type        = string

  validation {
    condition     = can(regex("^https://[^/]+$", var.zuma_gateway_origin))
    error_message = "zuma_gateway_origin must be an https origin with no path, e.g. https://api.wallet.example.com"
  }
}

variable "oidc_authority_origin" {
  description = "Origin (https://host[:port], no path) of the OIDC provider, allowed in the CSP connect-src."
  type        = string

  validation {
    condition     = can(regex("^https://[^/]+$", var.oidc_authority_origin))
    error_message = "oidc_authority_origin must be an https origin with no path, e.g. https://idp.example.com"
  }
}
