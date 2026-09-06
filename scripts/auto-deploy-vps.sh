#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/Bot}"
REPO_FULL_NAME="${REPO_FULL_NAME:-worawechrattanaitthiwong-creator/Bot}"
LOCK_FILE="/run/lock/scenova-auto-deploy.lock"

mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[SCENOVA] another deploy is already running"
  exit 0
fi

cd "$REPO_DIR"
git config --global --add safe.directory "$REPO_DIR" >/dev/null 2>&1 || true

CURRENT_SHA="$(git rev-parse HEAD)"

echo "[SCENOVA] checking GitHub main..."
git fetch --quiet origin main
REMOTE_SHA="$(git rev-parse origin/main)"

if [ "$CURRENT_SHA" = "$REMOTE_SHA" ]; then
  echo "[SCENOVA] already current: $CURRENT_SHA"
  exit 0
fi

echo "[SCENOVA] new commit detected: $CURRENT_SHA -> $REMOTE_SHA"

if command -v gh >/dev/null 2>&1; then
  CI_STATE="$(
    gh run list       --repo "$REPO_FULL_NAME"       --commit "$REMOTE_SHA"       --workflow CI       --limit 1       --json status,conclusion       --jq 'if length == 0 then "missing" else .[0].status + ":" + (. [0].conclusion // "") end'       2>/dev/null || true
  )"

  case "$CI_STATE" in
    completed:success)
      echo "[SCENOVA] CI passed"
      ;;
    completed:failure|completed:cancelled|completed:timed_out|completed:action_required)
      echo "[SCENOVA] CI did not pass ($CI_STATE); deployment blocked"
      exit 0
      ;;
    *)
      echo "[SCENOVA] CI not ready yet ($CI_STATE); waiting for next check"
      exit 0
      ;;
  esac
else
  echo "[SCENOVA] gh CLI unavailable; refusing to deploy without CI verification"
  exit 1
fi

echo "[SCENOVA] updating working tree..."
git reset --hard "$REMOTE_SHA"

echo "[SCENOVA] deploying..."
bash scripts/deploy-hostinger.sh

PUBLIC_WEB_URL="$(grep '^PUBLIC_WEB_URL=' .env.hostinger 2>/dev/null | cut -d= -f2- || true)"
if [ -n "$PUBLIC_WEB_URL" ] && command -v curl >/dev/null 2>&1; then
  echo "[SCENOVA] health check: $PUBLIC_WEB_URL/backend/api/health"
  curl --fail --silent --show-error --max-time 20 "$PUBLIC_WEB_URL/backend/api/health" >/dev/null
fi

echo "[SCENOVA] deploy complete: $REMOTE_SHA"
