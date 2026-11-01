#!/usr/bin/env bash
# Stages the wallet-service Lambda bundle that infrastructure/aws/terraform/lambda.tf zips:
#   <stage>/lambda-handler.js, app.js, ...   compiled services/wallet-service/dist (zip root)
#   <stage>/node_modules/                    production-only deps resolved from package-lock.json,
#                                            @zuma/shared-* copied in as real dirs (no symlinks)
# Usage (from anywhere): scripts/package-lambda.sh [stage-dir]
# Default stage dir: infrastructure/aws/terraform/.build/wallet-service-lambda
# Needs network access to the npm registry (npm ci). Run before `terraform plan/apply`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGE="${1:-${ROOT}/infrastructure/aws/terraform/.build/wallet-service-lambda}"
WORKSPACE="@zuma/wallet-service"
SERVICE_DIR="services/wallet-service"
SHARED_PACKAGES=(common config logging observability http)

case "$STAGE" in
  "" | "/" | "$HOME" | "$ROOT")
    echo "error: refusing to use '${STAGE}' as the staging dir" >&2
    exit 1
    ;;
esac

WORK="$(mktemp -d)"
cleanup() { rm -rf -- "$WORK"; }
trap cleanup EXIT

cd "$ROOT"

echo "==> Installing and building the monorepo"
npm ci --no-audit --no-fund
npm run build

echo "==> Resolving production dependencies for ${WORKSPACE} from package-lock.json"
# Mirror the workspace layout with manifests + compiled output only, so the install is driven
# by the committed lockfile and shared packages carry dist/ but no sources or dev tooling.
cp package.json package-lock.json "$WORK/"
while IFS= read -r manifest; do
  mkdir -p "$WORK/$(dirname "$manifest")"
  cp "$manifest" "$WORK/$manifest"
done < <(find shared services graphql -mindepth 2 -maxdepth 2 -name package.json)
for pkg in "${SHARED_PACKAGES[@]}"; do
  cp -R "shared/${pkg}/dist" "$WORK/shared/${pkg}/dist"
done
(
  cd "$WORK"
  # --ignore-scripts: no runtime dependency needs an install script
  npm ci --omit=dev --ignore-scripts --no-audit --no-fund --workspace "$WORKSPACE"
)

echo "==> Staging bundle into ${STAGE}"
rm -rf -- "$STAGE"
mkdir -p "$STAGE"
cp -R "${SERVICE_DIR}/dist/." "$STAGE/"
# -L dereferences the workspace symlinks (node_modules/@zuma/shared-* -> ../../shared/*)
cp -RL "$WORK/node_modules" "$STAGE/node_modules"
if [[ -d "$WORK/${SERVICE_DIR}/node_modules" ]]; then
  # Version-conflicted deps npm nested under the workspace itself
  cp -RL "$WORK/${SERVICE_DIR}/node_modules/." "$STAGE/node_modules/"
fi
# Drop CLI shims and self-links to the deployable workspaces — not needed at runtime
rm -rf -- "$STAGE/node_modules/.bin" "$STAGE/node_modules/.package-lock.json" \
  "$STAGE/node_modules/@zuma/wallet-service" \
  "$STAGE/node_modules/@zuma/transaction-service" \
  "$STAGE/node_modules/@zuma/graphql-gateway"

if [[ ! -f "$STAGE/lambda-handler.js" ]]; then
  echo "error: ${STAGE}/lambda-handler.js missing — did the wallet-service build fail?" >&2
  exit 1
fi

echo "==> Done: $(du -sh "$STAGE" | cut -f1) staged."
echo "    Next: terraform -chdir=infrastructure/aws/terraform plan -input=false"
