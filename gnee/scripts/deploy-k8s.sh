#!/usr/bin/env bash
# Builds gnee/web-spa, pushes it to a registry reachable by the cluster, then
# applies infrastructure/terraform/kubernetes (which reads the plain YAML
# under infrastructure/kubernetes/ and overlays the image tag/replica count).
set -euo pipefail

cd "$(dirname "$0")/.."

op_or_default() {
  local ref="$1" fallback="$2"
  op read "$ref" 2>/dev/null || echo "$fallback"
}

REGISTRY="${REGISTRY:?set REGISTRY, e.g. your-registry.example.com}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD)}"

VITE_ZUMA_GATEWAY_URL="${VITE_ZUMA_GATEWAY_URL:-$(op_or_default "op://zuma/web-spa-oidc/gateway_url" "http://localhost:3003/graphql")}"
VITE_OIDC_AUTHORITY="${VITE_OIDC_AUTHORITY:-$(op_or_default "op://zuma/web-spa-oidc/authority" "")}"
VITE_OIDC_CLIENT_ID="${VITE_OIDC_CLIENT_ID:-$(op_or_default "op://zuma/web-spa-oidc/client_id" "")}"
VITE_OIDC_REDIRECT_URI="${VITE_OIDC_REDIRECT_URI:?set VITE_OIDC_REDIRECT_URI to this deploy's public /callback URL}"

docker build \
  -f infrastructure/docker/web-spa.Dockerfile \
  --build-arg VITE_ZUMA_GATEWAY_URL="$VITE_ZUMA_GATEWAY_URL" \
  --build-arg VITE_OIDC_AUTHORITY="$VITE_OIDC_AUTHORITY" \
  --build-arg VITE_OIDC_CLIENT_ID="$VITE_OIDC_CLIENT_ID" \
  --build-arg VITE_OIDC_REDIRECT_URI="$VITE_OIDC_REDIRECT_URI" \
  -t "${REGISTRY}/gnee/web-spa:${IMAGE_TAG}" \
  .

docker push "${REGISTRY}/gnee/web-spa:${IMAGE_TAG}"

cd infrastructure/terraform/kubernetes
terraform init -input=false
terraform apply -input=false \
  -var "web_spa_image=${REGISTRY}/gnee/web-spa:${IMAGE_TAG}" \
  "$@"
