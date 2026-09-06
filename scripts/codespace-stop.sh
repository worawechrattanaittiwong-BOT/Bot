#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

stop_pidfile() {
  local file="$1"
  if [ -f "$file" ]; then
    local pid
    pid="$(cat "$file" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$file"
  fi
}

stop_pidfile .run/web.pid
stop_pidfile .run/api.pid

if command -v fuser >/dev/null 2>&1; then
  fuser -k 3000/tcp 2>/dev/null || true
  fuser -k 4000/tcp 2>/dev/null || true
fi

echo "Bot Web/API stopped."
