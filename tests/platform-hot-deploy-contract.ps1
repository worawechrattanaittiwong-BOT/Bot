$ErrorActionPreference = 'Stop'

$deploy = [System.IO.File]::ReadAllText((Resolve-Path 'scripts/auto-deploy-vps.sh'))

foreach ($required in @(
  'REPO_FULL_NAME="${REPO_FULL_NAME:-SCENOVA-EA/Bot}"',
  '[SCENOVA] CI passed',
  '[SCENOVA] Integration Smoke passed',
  '"build: publish EA v"*" [skip ea build]"',
  'customer bots/positions do not block platform Web/API deployment',
  'bash scripts/deploy-hostinger.sh',
  'curl --fail --silent --show-error --max-time 20'
)) {
  if (-not $deploy.Contains($required)) { throw "Platform hot-deploy contract missing: $required" }
}

foreach ($forbidden in @(
  'RUNTIME_STATE=',
  'ACTIVE_BOTS',
  'FRESH_OPEN_POSITIONS',
  'STALE_REPORTED_POSITIONS',
  'waiting for Safe Maintenance',
  'safe-deploy gate:'
)) {
  if ($deploy.Contains($forbidden)) { throw "Platform deploy must not depend on customer trading runtime: $forbidden" }
}

Write-Host 'Platform hot-deploy independent-runtime contract PASS'
