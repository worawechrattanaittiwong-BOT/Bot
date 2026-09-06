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

for migration in   database/001_init.sql   database/002_cloud_worker.sql   database/003_trial_history_lock.sql   database/004_broker_catalog.sql
do
  docker compose exec -T postgres psql -U bot -d bot -f /dev/stdin < "$migration"
done

export API_INTERNAL_URL="http://127.0.0.1:4000"
export NEXT_PUBLIC_API_URL="/backend"

if [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
  export BOT_WEB_URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
else
  export BOT_WEB_URL="http://127.0.0.1:3000"
fi

export NEXT_PUBLIC_MT5_API_BASE="$BOT_WEB_URL/backend"

mkdir -p .run

stop_pidfile() {
  local file="$1"
  if [ -f "$file" ]; then
    local pid
    pid="$(cat "$file" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      for _ in {1..20}; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.2
      done
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$file"
  fi
}

stop_pidfile .run/web.pid
stop_pidfile .run/api.pid

# Also clear stale dev listeners from previous interrupted runs.
if command -v fuser >/dev/null 2>&1; then
  fuser -k 3000/tcp 2>/dev/null || true
  fuser -k 4000/tcp 2>/dev/null || true
fi

echo "Starting API on :4000 and Web on :3000"

nohup npm run dev:api > /tmp/bot-api.log 2>&1 < /dev/null &
API_PID=$!
echo "$API_PID" > .run/api.pid

nohup npm run dev:web > /tmp/bot-web.log 2>&1 < /dev/null &
WEB_PID=$!
echo "$WEB_PID" > .run/web.pid

for i in {1..60}; do
  API_OK=0
  WEB_OK=0

  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then API_OK=1; fi
  if curl -fsS http://127.0.0.1:3000/ >/dev/null 2>&1; then WEB_OK=1; fi

  if [ "$API_OK" -eq 1 ] && [ "$WEB_OK" -eq 1 ]; then
    if [ -n "${CODESPACE_NAME:-}" ] && command -v gh >/dev/null 2>&1; then
      gh codespace ports visibility 3000:public -c "$CODESPACE_NAME" >/dev/null 2>&1 || true
    fi

    echo ""
    echo "READY"
    echo "Web: $BOT_WEB_URL"
    echo "MT5 WebRequest: $NEXT_PUBLIC_MT5_API_BASE"
    echo ""
    echo "Port 3000 is requested as PUBLIC automatically for browser/MT5 testing."
    echo "The services are running in the background and will keep running if this terminal closes."
    echo "Stop them with: bash scripts/codespace-stop.sh"
    exit 0
  fi

  if ! kill -0 "$WEB_PID" 2>/dev/null; then
    echo ""
    echo "WEB FAILED TO START"
    cat /tmp/bot-web.log || true
    exit 1
  fi

  if ! kill -0 "$API_PID" 2>/dev/null; then
    echo ""
    echo "API FAILED TO START"
    cat /tmp/bot-api.log || true
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
