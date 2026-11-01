# Reference composition — review before real use, same as zuma/infrastructure/aws/terraform.
# Applies the same manifests under infrastructure/kubernetes/ that `kubectl apply -f` would —
# kept as plain YAML (one source of truth, diffable, usable without Terraform too) and only
# overlaid here with the per-deploy image and CSP origins.
#
# Replicas are deliberately NOT set: the HPA owns spec.replicas. The manifest omits the field,
# so kubernetes_manifest (server-side apply) never claims it and won't reset the HPA's scaling.
#
# `kubernetes_manifest` needs a reachable apiserver at plan time to resolve schema info — if
# that's not true in your environment yet, switch these to typed resources instead.
locals {
  manifest_dir = "${path.module}/../../kubernetes"

  namespace_manifest = yamldecode(file("${local.manifest_dir}/namespace.yaml"))

  deployment_raw = yamldecode(file("${local.manifest_dir}/web-spa/deployment.yaml"))
  deployment_container = merge(
    local.deployment_raw.spec.template.spec.containers[0],
    { image = var.web_spa_image }
  )
  deployment_manifest = merge(local.deployment_raw, {
    spec = merge(local.deployment_raw.spec, {
      template = merge(local.deployment_raw.spec.template, {
        spec = merge(local.deployment_raw.spec.template.spec, {
          containers = [local.deployment_container]
        })
      })
    })
  })

  configmap_raw = yamldecode(file("${local.manifest_dir}/web-spa/configmap.yaml"))
  configmap_manifest = merge(local.configmap_raw, {
    data = {
      ZUMA_GATEWAY_ORIGIN   = var.zuma_gateway_origin
      OIDC_AUTHORITY_ORIGIN = var.oidc_authority_origin
    }
  })

  ingress_raw = yamldecode(file("${local.manifest_dir}/web-spa/ingress.yaml"))
  ingress_manifest = merge(local.ingress_raw, {
    metadata = merge(local.ingress_raw.metadata, {
      annotations = merge(local.ingress_raw.metadata.annotations, {
        "cert-manager.io/cluster-issuer" = var.cert_manager_cluster_issuer
      })
    })
    spec = merge(local.ingress_raw.spec, {
      ingressClassName = var.ingress_class_name
      tls              = [merge(local.ingress_raw.spec.tls[0], { hosts = [var.web_spa_host] })]
      rules            = [merge(local.ingress_raw.spec.rules[0], { host = var.web_spa_host })]
    })
  })

  service_manifest = yamldecode(file("${local.manifest_dir}/web-spa/service.yaml"))
  hpa_manifest     = yamldecode(file("${local.manifest_dir}/web-spa/hpa.yaml"))
  pdb_manifest     = yamldecode(file("${local.manifest_dir}/web-spa/pdb.yaml"))

  # Multi-document file: one kubernetes_manifest per policy, keyed by metadata.name
  network_policies = {
    for doc in split("\n---\n", file("${local.manifest_dir}/web-spa/networkpolicy.yaml")) :
    yamldecode(doc).metadata.name => yamldecode(doc)
  }
}

resource "kubernetes_manifest" "namespace" {
  manifest = local.namespace_manifest
}

resource "kubernetes_manifest" "web_spa_configmap" {
  manifest   = local.configmap_manifest
  depends_on = [kubernetes_manifest.namespace]
}

resource "kubernetes_manifest" "web_spa_deployment" {
  manifest   = local.deployment_manifest
  depends_on = [kubernetes_manifest.web_spa_configmap]
}

resource "kubernetes_manifest" "web_spa_service" {
  manifest   = local.service_manifest
  depends_on = [kubernetes_manifest.namespace]
}

resource "kubernetes_manifest" "web_spa_hpa" {
  manifest   = local.hpa_manifest
  depends_on = [kubernetes_manifest.web_spa_deployment]
}

resource "kubernetes_manifest" "web_spa_pdb" {
  manifest   = local.pdb_manifest
  depends_on = [kubernetes_manifest.namespace]
}

resource "kubernetes_manifest" "web_spa_network_policy" {
  for_each   = local.network_policies
  manifest   = each.value
  depends_on = [kubernetes_manifest.namespace]
}

resource "kubernetes_manifest" "web_spa_ingress" {
  manifest   = local.ingress_manifest
  depends_on = [kubernetes_manifest.web_spa_service]
}
