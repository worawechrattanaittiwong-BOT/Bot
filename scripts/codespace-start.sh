#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  cp .env.example .env
fi

docker compose up -d postgres redis

until docker compose exec -T postgres pg_isready -U bot -d bot >/dev/null 2>&1; do
  sleep 1
done

docker compose exec -T postgres psql -U bot -d bot -f /dev/stdin < database/001_init.sql
docker compose exec -T postgres psql -U bot -d bot -f /dev/stdin < database/002_cloud_worker.sql
docker compose exec -T postgres psql -U bot -d bot -f /dev/stdin < database/003_trial_history_lock.sql

echo "Starting API on :4000 and Web on :3000"

npm run dev:api > /tmp/bot-api.log 2>&1 &
API_PID=$!

npm run dev:web -- --hostname 0.0.0.0 > /tmp/bot-web.log 2>&1 &
WEB_PID=$!

echo "API PID: $API_PID"
echo "WEB PID: $WEB_PID"
echo "Logs:"
echo "  tail -f /tmp/bot-api.log"
echo "  tail -f /tmp/bot-web.log"
echo "Open the forwarded port 3000 from the Codespaces Ports panel."

wait
