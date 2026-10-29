output "namespace" {
  value = local.namespace_manifest.metadata.name
}

output "service_name" {
  value = "${local.service_manifest.metadata.name}.${local.namespace_manifest.metadata.name}.svc.cluster.local"
}
