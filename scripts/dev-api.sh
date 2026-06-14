#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -f "$ROOT_DIR/apps/api/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/apps/api/.env"
  set +a
fi

export PORT="${PORT:-3001}"
export API_PORT="$PORT"
export DATA_SOURCE_PROVIDER="${DATA_SOURCE_PROVIDER:-supabase}"
export AI_BASE_URL="${AI_BASE_URL:-https://open.bigmodel.cn/api/paas/v4}"
export AI_MODEL="${AI_MODEL:-glm-5.1}"
export STANDARD_AI_API_KEY="${STANDARD_AI_API_KEY:-${AI_API_KEY:-}}"
export STANDARD_AI_BASE_URL="${STANDARD_AI_BASE_URL:-$AI_BASE_URL}"
export STANDARD_AI_MODEL="${STANDARD_AI_MODEL:-$AI_MODEL}"
export SILICONFLOW_API_KEY="${SILICONFLOW_API_KEY:-${AI_API_KEY:-}}"
export SILICONFLOW_BASE_URL="${SILICONFLOW_BASE_URL:-$AI_BASE_URL}"
export SILICONFLOW_MODEL="${SILICONFLOW_MODEL:-$AI_MODEL}"
export AI_CONFIG_ENCRYPTION_SECRET="${AI_CONFIG_ENCRYPTION_SECRET:-${SUPABASE_SERVICE_ROLE_KEY:-}}"

cd "$ROOT_DIR"
rm -rf "$ROOT_DIR/apps/api/dist"
exec npm run start:dev --workspace prompt-benchmark-api
