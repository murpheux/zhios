#!/usr/bin/env bash
# Builds gnee/web-spa, pushes it to a registry reachable by the cluster, then applies
# infrastructure/terraform/kubernetes (plain YAML under infrastructure/kubernetes/ overlaid with
# image, hostname, cert-manager issuer and CSP origins). `terraform apply` prompts for approval.
#
# Required: REGISTRY, WEB_SPA_HOST, CERT_MANAGER_CLUSTER_ISSUER. Gateway URL and OIDC settings
# come from env vars or 1Password; a failed or empty `op read` aborts. No localhost defaults.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=lib/common.sh
source scripts/lib/common.sh

REGISTRY="${REGISTRY:?set REGISTRY, e.g. your-registry.example.com}"
WEB_SPA_HOST="${WEB_SPA_HOST:?set WEB_SPA_HOST to the public hostname, e.g. wallet.example.com}"
CERT_MANAGER_CLUSTER_ISSUER="${CERT_MANAGER_CLUSTER_ISSUER:?set CERT_MANAGER_CLUSTER_ISSUER, e.g. letsencrypt-prod}"
if [[ -z "${IMAGE_TAG:-}" ]]; then
  IMAGE_TAG="$(git rev-parse --short HEAD)"
fi

VITE_ZUMA_GATEWAY_URL="$(config_value VITE_ZUMA_GATEWAY_URL "op://zuma/web-spa-oidc/gateway_url")"
require_remote_https_url VITE_ZUMA_GATEWAY_URL "$VITE_ZUMA_GATEWAY_URL"
VITE_OIDC_REDIRECT_URI="${VITE_OIDC_REDIRECT_URI:-https://${WEB_SPA_HOST}/callback}"
require_remote_https_url VITE_OIDC_REDIRECT_URI "$VITE_OIDC_REDIRECT_URI"
resolve_oidc_config
require_remote_https_url VITE_OIDC_AUTHORITY "$VITE_OIDC_AUTHORITY"

ZUMA_GATEWAY_ORIGIN="$(url_origin "$VITE_ZUMA_GATEWAY_URL")"
OIDC_AUTHORITY_ORIGIN="$(url_origin "$VITE_OIDC_AUTHORITY")"
IMAGE="${REGISTRY}/gnee/web-spa:${IMAGE_TAG}"

build_web_spa_image "$IMAGE"
docker push "$IMAGE"

terraform -chdir=infrastructure/terraform/kubernetes init -input=false
terraform -chdir=infrastructure/terraform/kubernetes apply -input=false \
  -var "web_spa_image=${IMAGE}" \
  -var "web_spa_host=${WEB_SPA_HOST}" \
  -var "cert_manager_cluster_issuer=${CERT_MANAGER_CLUSTER_ISSUER}" \
  -var "zuma_gateway_origin=${ZUMA_GATEWAY_ORIGIN}" \
  -var "oidc_authority_origin=${OIDC_AUTHORITY_ORIGIN}" \
  "$@"
