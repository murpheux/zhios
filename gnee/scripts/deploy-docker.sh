#!/usr/bin/env bash
# Builds and runs gnee/web-spa as a single local container (plain `docker run`,
# not swarm/stack). Nothing baked into the image is secret (public OIDC SPA
# client — see infrastructure/docker/web-spa.Dockerfile) but config values
# still come from 1Password when available, so the same op:// references in
# env.example stay the single source of truth across docker/swarm/k8s.
set -euo pipefail

cd "$(dirname "$0")/.."

op_or_default() {
  local ref="$1" fallback="$2"
  op read "$ref" 2>/dev/null || echo "$fallback"
}

VITE_ZUMA_GATEWAY_URL="${VITE_ZUMA_GATEWAY_URL:-$(op_or_default "op://zuma/web-spa-oidc/gateway_url" "http://localhost:3003/graphql")}"
VITE_OIDC_AUTHORITY="${VITE_OIDC_AUTHORITY:-$(op_or_default "op://zuma/web-spa-oidc/authority" "")}"
VITE_OIDC_CLIENT_ID="${VITE_OIDC_CLIENT_ID:-$(op_or_default "op://zuma/web-spa-oidc/client_id" "")}"
VITE_OIDC_REDIRECT_URI="${VITE_OIDC_REDIRECT_URI:-http://localhost:8080/callback}"
IMAGE_TAG="${IMAGE_TAG:-gnee/web-spa:local}"

docker build \
  -f infrastructure/docker/web-spa.Dockerfile \
  --build-arg VITE_ZUMA_GATEWAY_URL="$VITE_ZUMA_GATEWAY_URL" \
  --build-arg VITE_OIDC_AUTHORITY="$VITE_OIDC_AUTHORITY" \
  --build-arg VITE_OIDC_CLIENT_ID="$VITE_OIDC_CLIENT_ID" \
  --build-arg VITE_OIDC_REDIRECT_URI="$VITE_OIDC_REDIRECT_URI" \
  -t "$IMAGE_TAG" \
  .

docker rm -f gnee-web-spa >/dev/null 2>&1 || true
docker run --rm -d --name gnee-web-spa -p 8080:8080 "$IMAGE_TAG"

echo "gnee-web-spa running: http://localhost:8080"
