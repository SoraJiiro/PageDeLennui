#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
OPENFRONT_PATH="${OPENFRONT_PATH:-${SCRIPT_DIR}/../OpenFront}"

if [[ ! -f "${OPENFRONT_PATH}/package.json" ]]; then
  echo "OpenFront introuvable dans ${OPENFRONT_PATH}" >&2
  exit 1
fi

cd "${OPENFRONT_PATH}"

if [[ ! -d node_modules ]]; then
  npm install
fi

export VITE_HOST=lan
export SKIP_BROWSER_OPEN=true
export GAME_ENV=dev
export TURNSTILE_SITE_KEY=1x00000000000000000000AA
export API_KEY=WARNING_DEV_API_KEY_DO_NOT_USE_IN_PRODUCTION
export ADMIN_BOT_API_KEY=WARNING_DEV_ADMIN_BOT_KEY_DO_NOT_USE_IN_PRODUCTION
export DOMAIN=localhost
export GIT_COMMIT=DEV
export PDE_BRIDGE_URL="${PDE_BRIDGE_URL:-http://192.168.197.13:7750/api/integrations/openfront/events}"
export OPENFRONT_BRIDGE_SECRET="${OPENFRONT_BRIDGE_SECRET:-change-this-openfront-bridge-secret}"

npm run start:server-dev > openfront-server.log 2>&1 &
SERVER_PID=$!
npm run start:client > openfront-client.log 2>&1 &
CLIENT_PID=$!

cleanup() {
  kill "${CLIENT_PID}" "${SERVER_PID}" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

LAN_HOST="${OPENFRONT_LAN_HOST:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
LAN_HOST="${LAN_HOST// /}"
LAN_HOST="${LAN_HOST:-localhost}"
echo "OpenFront LAN: http://${LAN_HOST}:9000"
echo "Logs: ${OPENFRONT_PATH}/openfront-server.log et ${OPENFRONT_PATH}/openfront-client.log"

wait "${SERVER_PID}" "${CLIENT_PID}"