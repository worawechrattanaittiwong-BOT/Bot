#!/usr/bin/env bash
set -euo pipefail

EMAIL="${1:-}"
if [ -z "$EMAIL" ]; then
  echo "Usage: bash scripts/set-owner.sh owner@example.com"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f .env.hostinger ]; then
  echo ".env.hostinger not found"
  exit 1
fi

COMPOSE="infrastructure/linux/docker-compose.hostinger.yml"
NORMALIZED="$(printf '%s' "$EMAIL" | tr '[:upper:]' '[:lower:]')"

ROW="$(
  docker compose --env-file .env.hostinger -f "$COMPOSE" exec -T postgres     psql -U bot -d bot -At -v ON_ERROR_STOP=1     -c "UPDATE users SET role='OWNER',status='ACTIVE',updated_at=now() WHERE lower(email)=lower('$NORMALIZED') RETURNING user_code || '|' || email || '|' || role;"
)"

if [ -z "$ROW" ]; then
  echo "No account found for: $EMAIL"
  echo "Register this email on the website first, then run this command again."
  exit 2
fi

echo "SCENOVA owner account ready:"
echo "$ROW"
