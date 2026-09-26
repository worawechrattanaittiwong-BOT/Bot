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

BOT_WEB_PORT="${BOT_WEB_PORT:-3100}"
APP_DOMAIN="${APP_DOMAIN:-}"

if [ ! -f .env.hostinger ]; then
  umask 077
  POSTGRES_PASSWORD="$(openssl rand -hex 24)"
  JWT_SECRET="$(openssl rand -hex 48)"
  ADMIN_KEY="$(openssl rand -hex 32)"
  WORKER_KEY="$(openssl rand -hex 32)"
  PAYOUT_WORKER_KEY="$(openssl rand -hex 32)"
  CREDENTIAL_MASTER_KEY="$(openssl rand -base64 32 | tr -d '\n')"
  if [ -n "$APP_DOMAIN" ]; then
    PUBLIC_URL="https://$APP_DOMAIN"
  else
    PUBLIC_URL="http://$PUBLIC_IP:$BOT_WEB_PORT"
  fi

  cat > .env.hostinger <<EOF
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
JWT_SECRET=$JWT_SECRET
ADMIN_KEY=$ADMIN_KEY
WORKER_KEY=$WORKER_KEY
PAYOUT_WORKER_KEY=$PAYOUT_WORKER_KEY
CREDENTIAL_MASTER_KEY=$CREDENTIAL_MASTER_KEY
BOT_WEB_PORT=$BOT_WEB_PORT
APP_DOMAIN=$APP_DOMAIN
PUBLIC_WEB_URL=$PUBLIC_URL
WEB_ORIGIN=$PUBLIC_URL
RESEND_API_KEY=
EMAIL_FROM='SCENOVA <no-reply@mail.snvea-bot.online>'
EMAIL_VERIFICATION_REQUIRED=false
OMISE_SECRET_KEY=
OMISE_WEBHOOK_SECRET=
OWNER_OMISE_RESERVE_SATANG=0
EOF
fi

if ! grep -q '^PAYOUT_WORKER_KEY=' .env.hostinger; then
  echo "PAYOUT_WORKER_KEY=$(openssl rand -hex 32)" >> .env.hostinger
fi
if ! grep -q '^RESEND_API_KEY=' .env.hostinger; then
  echo 'RESEND_API_KEY=' >> .env.hostinger
fi
if ! grep -q '^EMAIL_FROM=' .env.hostinger; then
  echo "EMAIL_FROM='SCENOVA <no-reply@mail.snvea-bot.online>'" >> .env.hostinger
fi
if ! grep -q '^EMAIL_VERIFICATION_REQUIRED=' .env.hostinger; then
  echo 'EMAIL_VERIFICATION_REQUIRED=false' >> .env.hostinger
fi

if ! grep -q '^OMISE_SECRET_KEY=' .env.hostinger; then
  echo 'OMISE_SECRET_KEY=' >> .env.hostinger
fi
if ! grep -q '^OMISE_WEBHOOK_SECRET=' .env.hostinger; then
  echo 'OMISE_WEBHOOK_SECRET=' >> .env.hostinger
fi
if ! grep -q '^OWNER_OMISE_RESERVE_SATANG=' .env.hostinger; then
  echo 'OWNER_OMISE_RESERVE_SATANG=0' >> .env.hostinger
fi

if grep -q '^BOT_WEB_PORT=' .env.hostinger; then
  sed -i -E "s#^BOT_WEB_PORT=.*#BOT_WEB_PORT=$BOT_WEB_PORT#" .env.hostinger
else
  echo "BOT_WEB_PORT=$BOT_WEB_PORT" >> .env.hostinger
fi

ENV_DOMAIN="$(grep '^APP_DOMAIN=' .env.hostinger 2>/dev/null | cut -d= -f2- || true)"
if [ -z "$APP_DOMAIN" ] && [ -n "$ENV_DOMAIN" ]; then
  APP_DOMAIN="$ENV_DOMAIN"
fi

if grep -q '^APP_DOMAIN=' .env.hostinger; then
  sed -i -E "s#^APP_DOMAIN=.*#APP_DOMAIN=$APP_DOMAIN#" .env.hostinger
else
  echo "APP_DOMAIN=$APP_DOMAIN" >> .env.hostinger
fi

if [ -n "$APP_DOMAIN" ]; then
  PUBLIC_URL="https://$APP_DOMAIN"
else
  PUBLIC_URL="http://$PUBLIC_IP:$BOT_WEB_PORT"
fi

sed -i -E "s#^PUBLIC_WEB_URL=.*#PUBLIC_WEB_URL=$PUBLIC_URL#" .env.hostinger
sed -i -E "s#^WEB_ORIGIN=.*#WEB_ORIGIN=$PUBLIC_URL#" .env.hostinger

set -a
. ./.env.hostinger
set +a

docker compose --env-file .env.hostinger -f "$COMPOSE" up -d --build postgres redis

until docker compose --env-file .env.hostinger -f "$COMPOSE" exec -T postgres pg_isready -U bot -d bot >/dev/null 2>&1; do
  sleep 2
done

for migration in   database/001_init.sql   database/002_cloud_worker.sql   database/003_trial_history_lock.sql   database/004_broker_catalog.sql   database/005_local_desktop_agent.sql   database/010_trade_journal.sql   database/011_basket_intelligence.sql   database/012_auto_profit_target_mode.sql   database/013_backtest_performance.sql   database/014_maintenance_mode.sql   database/015_partner_program.sql   database/016_upgrade_regression_safety.sql   database/017_runtime_safety.sql   database/018_runtime_migration.sql   database/019_production_hardening.sql   database/019_server_enrollment.sql   database/020_performance_shares.sql   database/021_cent_account_currency_isolation.sql   database/022_email_verification.sql   database/023_account_security.sql   database/024_referral_program.sql   database/025_password_reset.sql   database/026_trial_authorizations.sql   database/027_trial_sms_activation.sql   database/028_account_phone.sql   database/029_admin_service_links.sql   database/030_admin_api_credentials.sql   database/031_admin_api_credential_test_metadata.sql   database/032_commission_wallet_core.sql   database/033_github_owner_migration.sql   database/034_secure_withdrawals.sql   database/035_withdrawal_advanced_security.sql   database/036_owner_mobile.sql   database/037_promotions.sql
do
  docker compose --env-file .env.hostinger -f "$COMPOSE" exec -T postgres     psql -U bot -d bot -v ON_ERROR_STOP=1 -f /dev/stdin < "$migration"
done

docker compose --env-file .env.hostinger -f "$COMPOSE" up -d --build api web

echo ""
echo "========================================"
echo "Bot SaaS is starting on Hostinger VPS"
echo "Web: $PUBLIC_WEB_URL"
echo "API health through web: $PUBLIC_WEB_URL/backend/api/health"
echo "========================================"
echo ""
echo "Check status:"
echo "docker compose --env-file .env.hostinger -f $COMPOSE ps"
