#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export WEB_PORT="${WEB_PORT:-3000}"
export API_PORT="${API_PORT:-${PORT:-3001}}"
export API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:${API_PORT}/api}"
export NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-$API_BASE_URL}"
export NEXT_PUBLIC_APP_ORIGIN="${NEXT_PUBLIC_APP_ORIGIN:-http://127.0.0.1:${WEB_PORT}}"
export NEXT_PUBLIC_DEFAULT_ACTIVITY_SLUG="${NEXT_PUBLIC_DEFAULT_ACTIVITY_SLUG:-1}"

cd "$ROOT_DIR"
exec npm run dev --workspace prompt-benchmark-web -- --hostname 0.0.0.0 --port "$WEB_PORT"
