#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE="infrastructure/linux/docker-compose.hostinger.yml"

if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

PUBLIC_IP="$(curl -4 -fsS --max-time 5 https://api.ipify.org || true)"
if [ -z "$PUBLIC_IP" ]; then
  PUBLIC_IP="$(hostname -I | awk '{print $1}')"
fi

if [ ! -f .env.hostinger ]; then
  umask 077
  POSTGRES_PASSWORD="$(openssl rand -hex 24)"
  JWT_SECRET="$(openssl rand -hex 48)"
  ADMIN_KEY="$(openssl rand -hex 32)"
  WORKER_KEY="$(openssl rand -hex 32)"
  CREDENTIAL_MASTER_KEY="$(openssl rand -base64 32 | tr -d '\n')"
  cat > .env.hostinger <<EOF
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
JWT_SECRET=$JWT_SECRET
ADMIN_KEY=$ADMIN_KEY
WORKER_KEY=$WORKER_KEY
CREDENTIAL_MASTER_KEY=$CREDENTIAL_MASTER_KEY
PUBLIC_WEB_URL=http://$PUBLIC_IP:3000
WEB_ORIGIN=http://$PUBLIC_IP:3000
EOF
fi

set -a
. ./.env.hostinger
set +a

docker compose --env-file .env.hostinger -f "$COMPOSE" up -d --build postgres redis

until docker compose --env-file .env.hostinger -f "$COMPOSE" exec -T postgres pg_isready -U bot -d bot >/dev/null 2>&1; do
  sleep 2
done

for migration in   database/001_init.sql   database/002_cloud_worker.sql   database/003_trial_history_lock.sql   database/004_broker_catalog.sql
do
  docker compose --env-file .env.hostinger -f "$COMPOSE" exec -T postgres     psql -U bot -d bot -v ON_ERROR_STOP=1 -f /dev/stdin < "$migration"
done

docker compose --env-file .env.hostinger -f "$COMPOSE" up -d --build api web

echo ""
echo "========================================"
echo "Bot SaaS is starting on Hostinger VPS"
echo "Web: http://$PUBLIC_IP:3000"
echo "API health through web: http://$PUBLIC_IP:3000/backend/api/health"
echo "========================================"
echo ""
echo "Check status:"
echo "docker compose --env-file .env.hostinger -f $COMPOSE ps"
