#!/usr/bin/env bash
# Builds gnee/web-spa, pushes it to a registry reachable by every swarm node,
# then deploys/updates the stack. Per CLAUDE.md, prefer the scarlet-daemon
# docker context over raw SSH when targeting the swarm manager:
#   docker context use scarlet-daemon && ./scripts/deploy-swarm.sh
set -euo pipefail

cd "$(dirname "$0")/.."

op_or_default() {
  local ref="$1" fallback="$2"
  op read "$ref" 2>/dev/null || echo "$fallback"
}

REGISTRY="${REGISTRY:?set REGISTRY, e.g. scarlet:5000 — swarm workers pull from it, not the manager's local build cache}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD)}"
STACK_NAME="${STACK_NAME:-gnee}"

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

REGISTRY="$REGISTRY" IMAGE_TAG="$IMAGE_TAG" \
  docker stack deploy -c infrastructure/docker/web-spa-stack.yml "$STACK_NAME"

echo "Deployed ${REGISTRY}/gnee/web-spa:${IMAGE_TAG} to swarm stack '${STACK_NAME}'."
echo "Check rollout: docker stack services ${STACK_NAME}"
