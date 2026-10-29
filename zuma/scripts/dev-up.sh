#!/usr/bin/env bash
# Brings up local dev dependencies for zuma. By default starts only MongoDB so each
# service can be run with `npm run dev` for fast iteration/hot-reload. Pass --full to
# instead bring up the entire docker-compose stack (all services containerized).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ "${1:-}" == "--full" ]]; then
  echo "Starting full docker-compose stack (mongo, wallet-service, transaction-service, graphql-gateway)..."
  docker compose up -d --build
  echo "Services: wallet-service :3001, transaction-service :3002, graphql-gateway :3003"
  exit 0
fi

echo "Starting MongoDB only (docker compose up -d mongo)..."
docker compose up -d mongo

cat <<'EOF'

MongoDB is up on localhost:27017.

Run each service in its own terminal:
  npm run dev -w @zuma/wallet-service
  npm run dev -w @zuma/transaction-service
  npm run dev -w @zuma/graphql-gateway

Copy each service's .env.example to .env first if you haven't already, e.g.:
  cp services/wallet-service/.env.example services/wallet-service/.env
  cp services/transaction-service/.env.example services/transaction-service/.env
  cp graphql/.env.example graphql/.env

Or re-run this script with --full to run everything inside Docker instead.
EOF
