#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "Usage: bash scripts/configure-domain.sh example.com"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f .env.hostinger ]; then
  echo ".env.hostinger not found. Run deploy-hostinger.sh first."
  exit 1
fi

BOT_WEB_PORT="$(grep '^BOT_WEB_PORT=' .env.hostinger 2>/dev/null | cut -d= -f2- || true)"
BOT_WEB_PORT="${BOT_WEB_PORT:-3100}"

apt-get update
apt-get install -y nginx certbot python3-certbot-nginx

cat > "/etc/nginx/sites-available/$DOMAIN" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;

    client_max_body_size 20m;

    # MT5 WebRequest is synchronous. Isolate heartbeat traffic and close the
    # client connection after each response so Windows MT5 cannot reuse a stale
    # HTTPS connection for the next heartbeat.
    location = /backend/api/ea/heartbeat {
        proxy_pass http://127.0.0.1:$BOT_WEB_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_connect_timeout 3s;
        proxy_send_timeout 8s;
        proxy_read_timeout 8s;
        keepalive_timeout 0;
        keepalive_requests 1;
    }

    location / {
        proxy_pass http://127.0.0.1:$BOT_WEB_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

ln -sfn "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
nginx -t
systemctl reload nginx

if grep -q '^APP_DOMAIN=' .env.hostinger; then
  sed -i -E "s#^APP_DOMAIN=.*#APP_DOMAIN=$DOMAIN#" .env.hostinger
else
  echo "APP_DOMAIN=$DOMAIN" >> .env.hostinger
fi
sed -i -E "s#^PUBLIC_WEB_URL=.*#PUBLIC_WEB_URL=https://$DOMAIN#" .env.hostinger
sed -i -E "s#^WEB_ORIGIN=.*#WEB_ORIGIN=https://$DOMAIN#" .env.hostinger

certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --redirect --non-interactive --agree-tos --register-unsafely-without-email

docker compose --env-file .env.hostinger -f infrastructure/linux/docker-compose.hostinger.yml up -d --build web api

echo ""
echo "Domain ready:"
echo "https://$DOMAIN"
echo "https://$DOMAIN/backend/api/health"
