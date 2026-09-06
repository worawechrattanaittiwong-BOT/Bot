#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

WEB_OK=0
API_OK=0

if curl -fsS --max-time 2 http://127.0.0.1:3000/ >/dev/null 2>&1; then WEB_OK=1; fi
if curl -fsS --max-time 2 http://127.0.0.1:4000/api/health >/dev/null 2>&1; then API_OK=1; fi

if [ "$WEB_OK" -eq 1 ] && [ "$API_OK" -eq 1 ]; then
  if [ -n "${CODESPACE_NAME:-}" ] && command -v gh >/dev/null 2>&1; then
    if gh codespace ports visibility 3000:public -c "$CODESPACE_NAME"; then
      echo "Port 3000 visibility: PUBLIC"
    else
      echo "WARNING: Could not make port 3000 public automatically."
      echo "Open the Codespaces Ports panel, right-click port 3000, then choose Port Visibility -> Public."
    fi
  fi
  echo "Bot Web/API already running. Port 3000 requested as PUBLIC."
  exit 0
fi

exec bash scripts/codespace-start.sh
