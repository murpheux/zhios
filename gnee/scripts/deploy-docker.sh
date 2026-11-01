#!/usr/bin/env bash
# Builds and runs gnee/web-spa as a single LOCAL container (plain `docker run`, not swarm/stack)
# on http://localhost:8080 — localhost counts as a secure context, so OIDC PKCE works without TLS.
# Nothing baked into the image is secret (public OIDC SPA client — see
# infrastructure/docker/web-spa.Dockerfile). Values come from env vars first, then 1Password;
# a failed or empty `op read` aborts the script.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=lib/common.sh
source scripts/lib/common.sh

# Local-only default: the zuma compose stack's gateway (scripts/dev-up.sh --full)
VITE_ZUMA_GATEWAY_URL="${VITE_ZUMA_GATEWAY_URL:-http://localhost:3003/graphql}"
VITE_OIDC_REDIRECT_URI="${VITE_OIDC_REDIRECT_URI:-http://localhost:8080/callback}"
resolve_oidc_config

IMAGE_TAG="${IMAGE_TAG:-gnee/web-spa:local}"
CONTAINER_NAME="gnee-web-spa"

ZUMA_GATEWAY_ORIGIN="$(url_origin "$VITE_ZUMA_GATEWAY_URL")"
OIDC_AUTHORITY_ORIGIN="$(url_origin "$VITE_OIDC_AUTHORITY")"

build_web_spa_image "$IMAGE_TAG"

if docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  docker rm -f "$CONTAINER_NAME" >/dev/null
fi
docker run --rm -d \
  --name "$CONTAINER_NAME" \
  -p 127.0.0.1:8080:8080 \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  -e ZUMA_GATEWAY_ORIGIN="$ZUMA_GATEWAY_ORIGIN" \
  -e OIDC_AUTHORITY_ORIGIN="$OIDC_AUTHORITY_ORIGIN" \
  "$IMAGE_TAG" >/dev/null

echo "gnee-web-spa running: http://localhost:8080"
