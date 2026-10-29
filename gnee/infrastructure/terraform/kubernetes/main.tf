# Reference composition — review before real use, same as zuma/infrastructure/aws/terraform.
# Applies the same manifests under infrastructure/kubernetes/ that `kubectl apply -f`
# would — kept as plain YAML (one source of truth, diffable, usable without Terraform
# too) and only overlaid here with the per-deploy image tag / replica count.
# `kubernetes_manifest` (vs. typed resources like kubernetes_deployment_v1) needs a real
# apiserver reachable at `terraform plan` time to resolve CRD/schema info — if that's not
# true in your environment yet, switch these to typed resources instead.
locals {
  namespace_manifest = yamldecode(file("${path.module}/../../kubernetes/namespace.yaml"))

  deployment_raw = yamldecode(file("${path.module}/../../kubernetes/web-spa/deployment.yaml"))
  deployment_container = merge(
    local.deployment_raw.spec.template.spec.containers[0],
    { image = var.web_spa_image }
  )
  deployment_manifest = merge(local.deployment_raw, {
    spec = merge(local.deployment_raw.spec, {
      replicas = var.web_spa_replicas
      template = merge(local.deployment_raw.spec.template, {
        spec = merge(local.deployment_raw.spec.template.spec, {
          containers = [local.deployment_container]
        })
      })
    })
  })

  service_manifest = yamldecode(file("${path.module}/../../kubernetes/web-spa/service.yaml"))
  hpa_manifest     = yamldecode(file("${path.module}/../../kubernetes/web-spa/hpa.yaml"))
}

resource "kubernetes_manifest" "namespace" {
  manifest = local.namespace_manifest
}

resource "kubernetes_manifest" "web_spa_deployment" {
  manifest   = local.deployment_manifest
  depends_on = [kubernetes_manifest.namespace]
}

resource "kubernetes_manifest" "web_spa_service" {
  manifest   = local.service_manifest
  depends_on = [kubernetes_manifest.namespace]
}

resource "kubernetes_manifest" "web_spa_hpa" {
  manifest   = local.hpa_manifest
  depends_on = [kubernetes_manifest.web_spa_deployment]
}
