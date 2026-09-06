#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  cp .env.example .env
fi

docker compose up -d postgres redis

until docker compose exec -T postgres pg_isready -U bot -d bot >/dev/null 2>&1; do
  sleep 1
done

for migration in database/001_init.sql database/002_cloud_worker.sql database/003_trial_history_lock.sql database/004_broker_catalog.sql; do
  docker compose exec -T postgres psql -U bot -d bot -f /dev/stdin < "$migration"
done

export API_INTERNAL_URL="http://127.0.0.1:4000"
export NEXT_PUBLIC_API_URL="/backend"

if [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
  export BOT_WEB_URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
  export BOT_API_URL="https://${CODESPACE_NAME}-4000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
else
  export BOT_WEB_URL="http://127.0.0.1:3000"
  export BOT_API_URL="http://127.0.0.1:4000"
fi

export NEXT_PUBLIC_MT5_API_BASE="$BOT_API_URL"

echo "Starting API on :4000 and Web on :3000"

npm run dev:api > /tmp/bot-api.log 2>&1 &
API_PID=$!

npm run dev:web > /tmp/bot-web.log 2>&1 &
WEB_PID=$!

cleanup() {
  kill "$API_PID" "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "API PID: $API_PID"
echo "WEB PID: $WEB_PID"

for i in {1..40}; do
  API_OK=0
  WEB_OK=0

  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then API_OK=1; fi
  if curl -fsS http://127.0.0.1:3000 >/dev/null 2>&1; then WEB_OK=1; fi

  if [ "$API_OK" -eq 1 ] && [ "$WEB_OK" -eq 1 ]; then
    echo ""
    echo "READY"
    echo "  Web (open this in your browser): $BOT_WEB_URL"
    echo "  API health: $BOT_API_URL/api/health"
    echo ""
    echo "IMPORTANT: Do NOT open http://localhost:3000 on your own PC."
    echo "localhost refers to your PC, while the app is running inside GitHub Codespaces."
    echo "Use the Codespaces forwarded URL above."
    wait
    exit 0
  fi

  if ! kill -0 "$WEB_PID" 2>/dev/null; then
    echo ""
    echo "WEB FAILED TO START"
    cat /tmp/bot-web.log
    exit 1
  fi

  if ! kill -0 "$API_PID" 2>/dev/null; then
    echo ""
    echo "API FAILED TO START"
    cat /tmp/bot-api.log
    exit 1
  fi

  sleep 1
done

echo ""
echo "Startup timed out."
echo "--- WEB LOG ---"
cat /tmp/bot-web.log || true
echo "--- API LOG ---"
cat /tmp/bot-api.log || true
exit 1
