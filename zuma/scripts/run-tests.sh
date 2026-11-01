#!/usr/bin/env bash
# Installs dependencies and runs the test suite for every workspace package that defines one.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# npm ci: reproducible install from package-lock.json (never rewrites the lockfile)
npm ci --no-audit --no-fund
npm test --workspaces --if-present
