#!/usr/bin/env bash
# Installs dependencies and runs the test suite for every workspace package that defines one.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

npm install
npm test --workspaces --if-present
