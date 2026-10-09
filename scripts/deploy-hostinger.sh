#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE="infrastructure/linux/docker-compose.hostinger.yml"

# Use the same lock as the timer, inherited when called by auto-deploy-vps.sh.
if [ "${SCENOVA_DEPLOY_LOCK_HELD:-0}" != 1 ]; then
  DEPLOY_LOCK_FILE="${SCENOVA_DEPLOY_LOCK_FILE:-/run/lock/scenova-auto-deploy.lock}"
  mkdir -p "$(dirname "$DEPLOY_LOCK_FILE")"
  exec 9>"$DEPLOY_LOCK_FILE"
  flock -n 9 || { echo '[SCENOVA] another deploy is already running'; exit 1; }
  export SCENOVA_DEPLOY_LOCK_HELD=1
fi

if [ -z "${DEPLOY_SHA:-}" ]; then
  git fetch --quiet origin '+refs/heads/main:refs/remotes/origin/main'
  DEPLOY_SHA="$(git rev-parse origin/main)"
fi
[[ "$DEPLOY_SHA" =~ ^[a-f0-9]{40}$ ]] || { echo '[SCENOVA] invalid deploy commit'; exit 1; }
[ "$DEPLOY_SHA" = "$(git rev-parse origin/main)" ] || { echo '[SCENOVA] deploy target must be the fetched origin/main'; exit 1; }
git diff --quiet && git diff --cached --quiet || { echo '[SCENOVA] commit or save local edits before deployment'; exit 1; }
if [ "$(git rev-parse HEAD)" != "$DEPLOY_SHA" ]; then
  git merge --ff-only "$DEPLOY_SHA"
  [ "$(git rev-parse HEAD)" = "$DEPLOY_SHA" ] || { echo '[SCENOVA] local commits diverge from origin/main'; exit 1; }
  # Run the deploy code from the selected release, not the previously loaded script.
  export DEPLOY_SHA
  exec bash "$ROOT/scripts/deploy-hostinger.sh"
fi
. "$ROOT/scripts/lib/api-deploy.sh"

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

# Keep the live reverse proxy aligned with the 300 MB Trading Mode Guide
# upload contract. Older production hosts may still have a historical 20 MB
# limit even though configure-domain.sh now writes 320 MB.
if [ -n "$APP_DOMAIN" ] && command -v nginx >/dev/null 2>&1; then
  NGINX_SITE="/etc/nginx/sites-available/$APP_DOMAIN"
  if [ -f "$NGINX_SITE" ]; then
    if grep -Eq '^[[:space:]]*client_max_body_size[[:space:]]+[^;]+;' "$NGINX_SITE"; then
      sed -i -E 's#^([[:space:]]*)client_max_body_size[[:space:]]+[^;]+;#\1client_max_body_size 320m;#g' "$NGINX_SITE"
    else
      sed -i '0,/server[[:space:]]*{/s//server {\n    client_max_body_size 320m;/' "$NGINX_SITE"
    fi
    nginx -t
    systemctl reload nginx
  fi
fi

set -a
. ./.env.hostinger
set +a

# Build from an immutable, tracked Git snapshot. Untracked dist, node_modules,
# tsbuildinfo and credentials on the VPS never become build inputs.
RELEASE_CONTEXT="$(mktemp -d /tmp/scenova-release.XXXXXXXX)"
trap 'rm -rf -- "$RELEASE_CONTEXT"' EXIT
git archive "$DEPLOY_SHA" | tar -x -C "$RELEASE_CONTEXT"
export DEPLOY_BUILD_CONTEXT="$RELEASE_CONTEXT"
export API_BUILD_SHA="$DEPLOY_SHA"
API_SOURCE_SHA256="$(api_source_digest "$RELEASE_CONTEXT")"
API_BUILD_ID="$(date -u +%Y%m%dT%H%M%SZ)-$(openssl rand -hex 4)"
export API_SOURCE_SHA256 API_BUILD_ID
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-linux}"
COMPOSE_CMD=(docker compose --project-name "$COMPOSE_PROJECT_NAME" --env-file .env.hostinger -f "$COMPOSE")

echo "[SCENOVA] building origin/main=$API_BUILD_SHA source=$API_SOURCE_SHA256 build=$API_BUILD_ID"
"${COMPOSE_CMD[@]}" build --no-cache --pull api
API_IMAGE="scenova-api:$API_BUILD_SHA-$API_BUILD_ID"
API_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$API_IMAGE")"
docker run --rm -i --network none --entrypoint node -w /app "$API_IMAGE_ID" - verify "$API_BUILD_SHA" "$API_SOURCE_SHA256" "$API_BUILD_ID" < scripts/api-build-integrity.cjs
"${COMPOSE_CMD[@]}" build --pull web

"${COMPOSE_CMD[@]}" up -d postgres redis

until "${COMPOSE_CMD[@]}" exec -T postgres pg_isready -U bot -d bot >/dev/null 2>&1; do
  sleep 2
done

for migration in   database/001_init.sql   database/002_cloud_worker.sql   database/003_trial_history_lock.sql   database/004_broker_catalog.sql   database/005_local_desktop_agent.sql   database/010_trade_journal.sql   database/011_basket_intelligence.sql   database/012_auto_profit_target_mode.sql   database/013_backtest_performance.sql   database/014_maintenance_mode.sql   database/015_partner_program.sql   database/016_upgrade_regression_safety.sql   database/017_runtime_safety.sql   database/018_runtime_migration.sql   database/019_production_hardening.sql   database/019_server_enrollment.sql   database/020_performance_shares.sql   database/021_cent_account_currency_isolation.sql   database/022_email_verification.sql   database/023_account_security.sql   database/024_referral_program.sql   database/025_password_reset.sql   database/026_trial_authorizations.sql   database/027_trial_sms_activation.sql   database/028_account_phone.sql   database/029_admin_service_links.sql   database/030_admin_api_credentials.sql   database/031_admin_api_credential_test_metadata.sql   database/032_commission_wallet_core.sql   database/033_github_owner_migration.sql   database/034_secure_withdrawals.sql   database/035_withdrawal_advanced_security.sql   database/036_owner_mobile.sql   database/037_promotions.sql   database/038_cloud_fleet_updates.sql   database/039_trial_otp_delivery_channels.sql   database/040_cloud_server_software_updates.sql   database/041_cloud_symbol_reload.sql   database/042_access_groups.sql   database/043_access_group_management.sql   database/044_trial_group_isolation.sql   database/045_access_group_grants.sql   database/046_global_sales_control.sql   database/047_easyslip_slip_payments.sql   database/048_in_app_campaigns.sql   database/049_in_app_campaign_assets.sql   database/050_cloud_primary_slot_integrity.sql   database/051_cloud_addon_pricing.sql   database/052_cloud_capacity_entitlement.sql   database/053_usd_pricing.sql   database/054_ea_release_artifact_snapshot.sql   database/056_github_owner_snv.sql   database/057_broker_server_catalog_verified.sql   database/058_cloud_runtime_rebuild.sql   database/059_exness_mt5_server_directory.sql   database/066_payment_provider_fallback.sql   database/067_mt5_account_display_name.sql   database/068_ai_assistant.sql   database/069_profit_target_defaults.sql   database/070_general_announcements.sql   database/072_vantage_broker_catalog.sql   database/073_vantage_pty_only.sql
do
  # Migration 050 was completed once both partial unique indexes were created.
  # Replaying its historical Slot renumbering can collide with those indexes.
  # Keep customer Slot numbers unchanged if the safety constraints exist.
  if [ "$migration" = "database/050_cloud_primary_slot_integrity.sql" ]; then
    existing_integrity_indexes="$("${COMPOSE_CMD[@]}" exec -T postgres psql -U bot -d bot -v ON_ERROR_STOP=1 -Atqc       "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='license_slots' AND indexname IN ('uq_license_slots_owner_mode_number_live','uq_license_slots_single_primary_live')")"
    if [ "$existing_integrity_indexes" = "2" ]; then
      echo "[SCENOVA] Cloud primary Slot integrity already enforced; skipping historical renumbering"
      continue
    fi
  fi
  "${COMPOSE_CMD[@]}" exec -T postgres psql -U bot -d bot -v ON_ERROR_STOP=1 -f /dev/stdin < "$RELEASE_CONTEXT/$migration"
done

# Recreate only the application services, using the image just built. Do not
# let up rebuild implicitly or substitute a pulled image with the same tag.
"${COMPOSE_CMD[@]}" up -d --no-build --pull never --force-recreate --no-deps --wait --wait-timeout 150 api
verify_api_runtime "$API_BUILD_SHA" "$API_SOURCE_SHA256" "$API_IMAGE_ID" "$API_BUILD_ID"
"${COMPOSE_CMD[@]}" up -d --no-build --pull never --force-recreate --no-deps --wait --wait-timeout 150 web
verify_api_runtime "$API_BUILD_SHA" "$API_SOURCE_SHA256" "$API_IMAGE_ID" "$API_BUILD_ID"

echo ""
echo "========================================"
echo "Bot SaaS deployed; running API compiled code verified"
echo "Commit: $API_BUILD_SHA"
echo "API image: $API_IMAGE_ID"
echo "Web: $PUBLIC_WEB_URL"
echo "API health through web: $PUBLIC_WEB_URL/backend/api/health"
echo "========================================"
echo ""
echo "Check status:"
echo "docker compose --env-file .env.hostinger -f $COMPOSE ps"
