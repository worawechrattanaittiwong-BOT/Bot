#!/usr/bin/env bash
set -u
cd "$(dirname "$0")/.."

echo "== Bot Codespaces Status =="
echo -n "Web 3000: "
if curl -fsS --max-time 2 http://127.0.0.1:3000/ >/dev/null 2>&1; then echo "OK"; else echo "DOWN"; fi

echo -n "API 4000: "
if curl -fsS --max-time 2 http://127.0.0.1:4000/api/health >/dev/null 2>&1; then echo "OK"; else echo "DOWN"; fi

echo ""
echo "PID files:"
for f in .run/web.pid .run/api.pid; do
  if [ -f "$f" ]; then
    pid="$(cat "$f" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "  $f -> $pid (alive)"
    else
      echo "  $f -> $pid (dead)"
    fi
  else
    echo "  $f -> missing"
  fi
done

echo ""
echo "--- Web log (last 20 lines) ---"
tail -n 20 /tmp/bot-web.log 2>/dev/null || true
echo ""
echo "--- API log (last 20 lines) ---"
tail -n 20 /tmp/bot-api.log 2>/dev/null || true
