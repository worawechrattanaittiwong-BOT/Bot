#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root."
  exit 1
fi

REPO_DIR="${REPO_DIR:-/opt/Bot}"
REPO_FULL_NAME="${REPO_FULL_NAME:-scenova-sketch/Bot}"

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "Git repository not found at $REPO_DIR"
  exit 1
fi

cd "$REPO_DIR"

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required."
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated for root."
  echo "Run: gh auth login"
  exit 1
fi

chmod +x scripts/auto-deploy-vps.sh scripts/deploy-hostinger.sh

cat > /etc/systemd/system/scenova-auto-deploy.service <<EOF
[Unit]
Description=SCENOVA MT5 BOT EA Auto Deploy
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=oneshot
User=root
Environment=HOME=/root
Environment=REPO_DIR=$REPO_DIR
Environment=REPO_FULL_NAME=$REPO_FULL_NAME
ExecStart=/bin/bash $REPO_DIR/scripts/auto-deploy-vps.sh
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=6
EOF

cat > /etc/systemd/system/scenova-auto-deploy.timer <<'EOF'
[Unit]
Description=Check SCENOVA GitHub main for production updates

[Timer]
OnBootSec=45s
OnUnitActiveSec=60s
AccuracySec=10s
Persistent=true
Unit=scenova-auto-deploy.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now scenova-auto-deploy.timer

# Run once immediately so the current main can deploy without waiting a minute.
systemctl start scenova-auto-deploy.service || {
  echo ""
  echo "Initial deploy check failed. Logs:"
  journalctl -u scenova-auto-deploy.service -n 80 --no-pager
  exit 1
}

echo ""
echo "================================================"
echo "SCENOVA AUTO DEPLOY ENABLED"
echo "Repository: $REPO_FULL_NAME"
echo "Checks GitHub main every 60 seconds"
echo "Deploys only after CI succeeds"
echo "================================================"
systemctl --no-pager status scenova-auto-deploy.timer || true
