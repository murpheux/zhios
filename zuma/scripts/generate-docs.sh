#!/usr/bin/env bash
# Fetches the live OpenAPI JSON from each service's Swagger UI and writes it under docs/openapi/.
# Requires the services to already be running (e.g. via scripts/dev-up.sh --full or
# scripts/dev-up.sh followed by `npm run dev -w @zuma/<service>` in separate terminals).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# /docs is only served when DOCS_ENABLED=true (docker-compose.yml sets it for local dev).
mkdir -p docs/openapi

# Parallel "name=url" pairs instead of `declare -A` — associative arrays need bash 4+,
# and macOS still ships bash 3.2 as /bin/bash.
services=(
  "wallet-service=http://localhost:3001"
  "transaction-service=http://localhost:3002"
)

for entry in "${services[@]}"; do
  name="${entry%%=*}"
  base_url="${entry#*=}"
  echo "Fetching OpenAPI JSON for ${name} from ${base_url}/docs/json ..."
  curl --fail --silent --show-error "${base_url}/docs/json" -o "docs/openapi/${name}.json"
done

echo "Wrote docs/openapi/wallet-service.json and docs/openapi/transaction-service.json"
