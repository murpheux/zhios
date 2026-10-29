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
  description = "Fully-qualified image reference for gnee/web-spa (built from infrastructure/docker/web-spa.Dockerfile and pushed to a registry reachable by the cluster)."
  type        = string
}

variable "web_spa_replicas" {
  description = "Deployment replica count — overrides the manifest's default of 2."
  type        = number
  default     = 2
}
