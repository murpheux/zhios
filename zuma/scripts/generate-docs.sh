#!/usr/bin/env bash
# Fetches the live OpenAPI JSON from each service's Swagger UI and writes it under docs/openapi/.
# Requires the services to already be running (e.g. via scripts/dev-up.sh --full or
# scripts/dev-up.sh followed by `npm run dev -w @zuma/<service>` in separate terminals).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

mkdir -p docs/openapi

declare -A services=(
  ["wallet-service"]="http://localhost:3001"
  ["transaction-service"]="http://localhost:3002"
)

for name in "${!services[@]}"; do
  base_url="${services[$name]}"
  echo "Fetching OpenAPI JSON for ${name} from ${base_url}/docs/json ..."
  curl --fail --silent --show-error "${base_url}/docs/json" -o "docs/openapi/${name}.json"
done

echo "Wrote docs/openapi/wallet-service.json and docs/openapi/transaction-service.json"
