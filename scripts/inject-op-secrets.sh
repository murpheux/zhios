#!/usr/bin/env bash
# Renders the git-ignored root .env from deploy/env/local.env.tpl (op:// references only) via
# `op inject`. Values are written to the file only — never printed.
#
# Usage: scripts/inject-op-secrets.sh [output-file]     (default: <repo-root>/.env)
# Refuses to overwrite an existing file.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
template="${repo_root}/deploy/env/local.env.tpl"
out="${1:-${repo_root}/.env}"

command -v op >/dev/null 2>&1 || {
  echo "error: 1Password CLI (op) not found; use 'make secrets-local' instead" >&2
  exit 1
}
[[ -f "$template" ]] || {
  echo "error: template not found: ${template}" >&2
  exit 1
}
if [[ -e "$out" ]]; then
  echo "error: ${out} already exists; refusing to overwrite (remove it first to re-render)" >&2
  exit 1
fi

umask 077
if ! op inject --in-file "$template" --out-file "$out" >/dev/null; then
  rm -f -- "$out"
  echo "error: op inject failed (signed in? vault 'zuma', item 'local-stack' and its fields exist?)" >&2
  exit 1
fi
chmod 600 "$out"

echo "wrote ${out} from ${template#"${repo_root}/"} (mode 600; values not shown)"
