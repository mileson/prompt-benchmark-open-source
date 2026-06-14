#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

TARGETS=(
  "$ROOT_DIR/node_modules"
  "$ROOT_DIR/apps/web/node_modules"
  "$ROOT_DIR/apps/api/node_modules"
  "$ROOT_DIR/apps/web/.next"
  "$ROOT_DIR/apps/api/dist"
)

for target in "${TARGETS[@]}"; do
  if [[ -e "$target" ]]; then
    rm -rf "$target"
    echo "Removed $target"
  fi
done
