#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export API_PORT="${API_PORT:-${PORT:-3001}}"
export WEB_PORT="${WEB_PORT:-3000}"
export PORT="$API_PORT"

cleanup() {
  trap - EXIT INT TERM
  for pid in "${API_PID:-}" "${WEB_PID:-}"; do
    if [[ -n "${pid}" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done
  wait >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

bash "$ROOT_DIR/scripts/dev-api.sh" &
API_PID=$!

# Give API a brief head start so the web app can immediately fetch activity metadata.
sleep 2

bash "$ROOT_DIR/scripts/dev-web.sh" &
WEB_PID=$!

echo "[prompt-benchmark] dev mode ready"
echo "- API:  http://127.0.0.1:${API_PORT}/api"
echo "- Web:  http://127.0.0.1:${WEB_PORT}"

echo "Press Ctrl+C to stop both servers."
while true; do
  if ! kill -0 "$API_PID" >/dev/null 2>&1; then
    wait "$API_PID" || true
    exit 1
  fi

  if ! kill -0 "$WEB_PID" >/dev/null 2>&1; then
    wait "$WEB_PID" || true
    exit 1
  fi

  sleep 1
done
