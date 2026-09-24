#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/Bot}"
REPO_FULL_NAME="${REPO_FULL_NAME:-scenova-sketch/Bot}"
LOCK_FILE="/run/lock/scenova-auto-deploy.lock"
STATE_DIR="/var/lib/scenova"
DEPLOYED_SHA_FILE="$STATE_DIR/deployed.sha"

mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[SCENOVA] another deploy is already running"
  exit 0
fi

cd "$REPO_DIR"
git config --global --add safe.directory "$REPO_DIR" >/dev/null 2>&1 || true

# Canonicalize the production remote after the repository owner migration.
# Preserve the existing transport so VPS credentials/deploy keys keep working.
ORIGIN_URL="$(git remote get-url origin 2>/dev/null || true)"
case "$ORIGIN_URL" in
  https://github.com/scenova-sketch/Bot|https://github.com/scenova-sketch/Bot.git|git@github.com:scenova-sketch/Bot.git|ssh://git@github.com:scenova-sketch/Bot.git)
    ;;
  https://github.com/scenava-sys/Bot|https://github.com/scenava-sys/Bot.git|https://github.com/SCENOVA-EA/Bot|https://github.com/SCENOVA-EA/Bot.git|https://github.com/SCENOVA-AI/Bot|https://github.com/SCENOVA-AI/Bot.git)
    echo "[SCENOVA] migrating origin to https://github.com/scenova-sketch/Bot.git"
    git remote set-url origin "https://github.com/scenova-sketch/Bot.git"
    ;;
  git@github.com:scenava-sys/Bot.git|git@github.com:SCENOVA-EA/Bot.git|git@github.com:SCENOVA-AI/Bot.git)
    echo "[SCENOVA] migrating origin to git@github.com:scenova-sketch/Bot.git"
    git remote set-url origin "git@github.com:scenova-sketch/Bot.git"
    ;;
  ssh://git@github.com/scenava-sys/Bot.git|ssh://git@github.com/SCENOVA-EA/Bot.git|ssh://git@github.com/SCENOVA-AI/Bot.git)
    echo "[SCENOVA] migrating origin to ssh://git@github.com/scenova-sketch/Bot.git"
    git remote set-url origin "ssh://git@github.com/scenova-sketch/Bot.git"
    ;;
  *)
    echo "[SCENOVA] unexpected origin: ${ORIGIN_URL:-missing}"
    echo "[SCENOVA] refusing to deploy from a repository other than scenova-sketch/Bot"
    exit 1
    ;;
esac

echo "[SCENOVA] origin: $(git remote get-url origin)"

CURRENT_SHA="$(git rev-parse HEAD)"
DEPLOYED_SHA=""
if [ -f "$DEPLOYED_SHA_FILE" ]; then
  DEPLOYED_SHA="$(cat "$DEPLOYED_SHA_FILE" 2>/dev/null || true)"
fi

echo "[SCENOVA] checking GitHub main..."
git fetch --quiet origin main
REMOTE_SHA="$(git rev-parse origin/main)"

echo "[SCENOVA] repository HEAD: $CURRENT_SHA"
echo "[SCENOVA] deployed SHA: ${DEPLOYED_SHA:-none}"
echo "[SCENOVA] remote main: $REMOTE_SHA"

if [ "$DEPLOYED_SHA" = "$REMOTE_SHA" ]; then
  echo "[SCENOVA] production already deployed: $REMOTE_SHA"
  exit 0
fi

if [ "$CURRENT_SHA" = "$REMOTE_SHA" ]; then
  echo "[SCENOVA] source is current but production image is stale; redeploying"
else
  echo "[SCENOVA] new commit detected: $CURRENT_SHA -> $REMOTE_SHA"
fi

validate_generated_ea_shape() {
  local sha="$1"
  local subject author_email changed

  subject="$(git log -1 --format=%s "$sha" 2>/dev/null || true)"
  author_email="$(git log -1 --format=%ae "$sha" 2>/dev/null || true)"

  case "$subject" in
    "build: publish private FastBasketBot.ex5 [skip ea build]"|\
    "build: publish EA Brain V"*" [skip ea build]"|\
    "build: publish EA v"*" [skip ea build]")
      ;;
    *)
      return 1
      ;;
  esac
  [ "$author_email" = "actions@users.noreply.github.com" ] || return 1

  changed="$(git diff-tree --no-commit-id --name-only -r "$sha" 2>/dev/null || true)"
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    case "$file" in
      mt5/FastBasketBot.mq5|mt5/release/FastBasketBot.ex5|mt5/release/manifest.json)
        ;;
      *)
        return 1
        ;;
    esac
  done <<< "$changed"

  git cat-file -e "$sha:mt5/release/FastBasketBot.ex5" 2>/dev/null || return 1
  git cat-file -e "$sha:mt5/release/manifest.json" 2>/dev/null || return 1
  return 0
}

validate_generated_installer_shape() {
  local sha="$1"
  local subject author_email changed

  subject="$(git log -1 --format=%s "$sha" 2>/dev/null || true)"
  author_email="$(git log -1 --format=%ae "$sha" 2>/dev/null || true)"

  # Support both the legacy [skip ci] release subject and the current versioned
  # release subject. Commits pushed by GITHUB_TOKEN do not start another
  # workflow, so production must be able to validate the generated commit from
  # its trusted shape plus the successful CI result of the source parent.
  case "$subject" in
    "build: publish SCENOVA Windows installer [skip ci]"|\
    "build: publish signed SCENOVA Windows installer [skip ci]"|\
    "build: publish SCENOVA Windows installer v"*|\
    "build: publish signed SCENOVA Windows installer v"*)
      ;;
    *)
      return 1
      ;;
  esac

  [ "$author_email" = "actions@users.noreply.github.com" ] || return 1

  changed="$(git diff-tree --no-commit-id --name-only -r "$sha" 2>/dev/null || true)"
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    case "$file" in
      apps/web/public/downloads/SCENOVA-Setup.exe|apps/web/public/downloads/SCENOVA-Setup-v*.exe)
        ;;
      *)
        return 1
        ;;
    esac
  done <<< "$changed"

  git cat-file -e "$sha:apps/web/public/downloads/SCENOVA-Setup.exe" 2>/dev/null || return 1
  return 0
}

# Generated release commits can legitimately arrive back-to-back (for example
# Windows installer publish followed by EA publish). Walk across only commits
# whose author, subject, changed paths and artifact shape are trusted, then use
# the first normal source commit as the CI anchor.
resolve_ci_anchor() {
  local sha="$1"
  local parent hops=0

  parent="$(git rev-parse "$sha^" 2>/dev/null || true)"
  [ -n "$parent" ] || return 1

  while [ "$hops" -lt 8 ]; do
    if validate_generated_ea_shape "$parent" >/dev/null 2>&1 || \
       validate_generated_installer_shape "$parent" >/dev/null 2>&1; then
      parent="$(git rev-parse "$parent^" 2>/dev/null || true)"
      [ -n "$parent" ] || return 1
      hops=$((hops + 1))
      continue
    fi
    break
  done

  printf '%s\n' "$parent"
}

verify_generated_ea_release() {
  local sha="$1"
  local parent parent_ci parent_smoke

  if ! validate_generated_ea_shape "$sha"; then
    echo "[SCENOVA] generated EA release rejected: untrusted commit shape"
    return 1
  fi

  parent="$(resolve_ci_anchor "$sha" 2>/dev/null || true)"
  [ -n "$parent" ] || return 1

  parent_ci="$(
    gh run list \
      --repo "$REPO_FULL_NAME" \
      --commit "$parent" \
      --workflow CI \
      --limit 1 \
      --json status,conclusion \
      --jq 'if length == 0 then "missing" else .[0].status + ":" + (. [0].conclusion // "") end' \
      2>/dev/null || true
  )"

  if [ "$parent_ci" != "completed:success" ]; then
    echo "[SCENOVA] generated EA release waiting for source CI ($parent_ci)"
    return 1
  fi
  parent_smoke="$(gh run list --repo "$REPO_FULL_NAME" --commit "$parent" --workflow "Integration Smoke" --limit 1 --json status,conclusion --jq 'if length == 0 then "missing" else .[0].status + ":" + (. [0].conclusion // "") end' 2>/dev/null || true)"
  if [ "$parent_smoke" != "completed:success" ]; then
    echo "[SCENOVA] generated EA release waiting for source Integration Smoke ($parent_smoke)"
    return 1
  fi

  echo "[SCENOVA] trusted generated EX5 release verified"
  return 0
}

verify_generated_installer_release() {
  local sha="$1"
  local parent parent_ci parent_smoke

  if ! validate_generated_installer_shape "$sha"; then
    echo "[SCENOVA] generated installer release rejected: untrusted commit shape"
    return 1
  fi

  parent="$(resolve_ci_anchor "$sha" 2>/dev/null || true)"
  [ -n "$parent" ] || return 1

  parent_ci="$(
    gh run list \
      --repo "$REPO_FULL_NAME" \
      --commit "$parent" \
      --workflow CI \
      --limit 1 \
      --json status,conclusion \
      --jq 'if length == 0 then "missing" else .[0].status + ":" + (. [0].conclusion // "") end' \
      2>/dev/null || true
  )"

  if [ "$parent_ci" != "completed:success" ]; then
    echo "[SCENOVA] generated installer release waiting for source CI ($parent_ci)"
    return 1
  fi
  parent_smoke="$(gh run list --repo "$REPO_FULL_NAME" --commit "$parent" --workflow "Integration Smoke" --limit 1 --json status,conclusion --jq 'if length == 0 then "missing" else .[0].status + ":" + (. [0].conclusion // "") end' 2>/dev/null || true)"
  if [ "$parent_smoke" != "completed:success" ]; then
    echo "[SCENOVA] generated installer release waiting for source Integration Smoke ($parent_smoke)"
    return 1
  fi

  echo "[SCENOVA] trusted generated Windows installer release verified"
  return 0
}

if command -v gh >/dev/null 2>&1; then
  CI_STATE="$(
    gh run list \
      --repo "$REPO_FULL_NAME" \
      --commit "$REMOTE_SHA" \
      --workflow CI \
      --limit 1 \
      --json status,conclusion \
      --jq 'if length == 0 then "missing" else .[0].status + ":" + (. [0].conclusion // "") end' \
      2>/dev/null || true
  )"

  case "$CI_STATE" in
    completed:success)
      echo "[SCENOVA] CI passed"
      SMOKE_STATE="$(gh run list --repo "$REPO_FULL_NAME" --commit "$REMOTE_SHA" --workflow "Integration Smoke" --limit 1 --json status,conclusion --jq 'if length == 0 then "missing" else .[0].status + ":" + (. [0].conclusion // "") end' 2>/dev/null || true)"
      if [ "$SMOKE_STATE" != "completed:success" ]; then
        echo "[SCENOVA] Integration Smoke not ready/passed ($SMOKE_STATE); deployment blocked"
        exit 0
      fi
      echo "[SCENOVA] Integration Smoke passed"
      ;;
    completed:failure|completed:cancelled|completed:timed_out|completed:action_required)
      echo "[SCENOVA] CI did not pass ($CI_STATE); deployment blocked"
      exit 0
      ;;
    *)
      if verify_generated_ea_release "$REMOTE_SHA"; then
        echo "[SCENOVA] generated EX5 release accepted without a direct CI run"
      elif verify_generated_installer_release "$REMOTE_SHA"; then
        echo "[SCENOVA] generated Windows installer release accepted without a direct CI run"
      else
        echo "[SCENOVA] CI not ready yet ($CI_STATE); waiting for next check"
        exit 0
      fi
      ;;
  esac
else
  echo "[SCENOVA] gh CLI unavailable; refusing to deploy without CI verification"
  exit 1
fi

# Platform Web/API releases are independent from customer MT5 trading runtime.
# A green main deploy must not stop, restart, or force-close customer EAs, and
# active bots/open positions must not block a platform release. Global
# Maintenance remains an explicit owner control for major maintenance only.
# Per-customer EA reload/update safety is enforced separately by the Local MT5
# update flow (bot stopped + no open positions before UPDATE_EA_RESTART).
echo "[SCENOVA] hot-deploy policy: customer bots/positions do not block platform Web/API deployment"

echo "[SCENOVA] updating working tree..."
git reset --hard "$REMOTE_SHA"

echo "[SCENOVA] deploying..."
bash scripts/deploy-hostinger.sh

PUBLIC_WEB_URL="$(grep '^PUBLIC_WEB_URL=' .env.hostinger 2>/dev/null | cut -d= -f2- || true)"
if [ -n "$PUBLIC_WEB_URL" ] && command -v curl >/dev/null 2>&1; then
  HEALTH_URL="$PUBLIC_WEB_URL/backend/api/health"
  echo "[SCENOVA] health check: $HEALTH_URL"

  HEALTH_OK=0
  for ((attempt=1; attempt<=30; attempt++)); do
    if curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" >/dev/null; then
      HEALTH_OK=1
      echo "[SCENOVA] health check passed on attempt $attempt"
      break
    fi
    echo "[SCENOVA] health check not ready ($attempt/30); retrying in 2s"
    sleep 2
  done
  if [ "$HEALTH_OK" -ne 1 ]; then
    echo "[SCENOVA] health check failed after 30 attempts"
    exit 1
  fi
fi

mkdir -p "$STATE_DIR"
printf '%s\n' "$REMOTE_SHA" > "$DEPLOYED_SHA_FILE"
echo "[SCENOVA] deploy complete: $REMOTE_SHA"
echo "[SCENOVA] production marker updated: $DEPLOYED_SHA_FILE"
