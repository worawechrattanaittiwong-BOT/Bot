$ErrorActionPreference = 'Stop'

$deploy = [System.IO.File]::ReadAllText((Resolve-Path 'scripts/auto-deploy-vps.sh'))

foreach ($required in @(
  'REPO_FULL_NAME="${REPO_FULL_NAME:-SCENOVA-SNV/Bot}"',
  '[SCENOVA] unified CI pipeline passed',
  '"build: publish EA v"*" [skip ea build]"',
  '"[customer-admin-only] build: publish SCENOVA Windows installer v"*',
  '"build: publish SCENOVA Mirror Android [skip mirror build]"',
  'validate_generated_mirror_mobile_shape',
  'verify_generated_mirror_mobile_release',
  'apps/web/public/downloads/SCENOVA-Mirror.apk',
  'apps/web/public/downloads/SCENOVA-Mirror.json',
  'customer bots/positions do not block platform Web/API deployment',
  'bash scripts/deploy-hostinger.sh',
  'for ((attempt=1; attempt<=30; attempt++))',
  'curl --fail --silent --show-error --max-time 5',
  '[SCENOVA] health check passed on attempt',
  '[SCENOVA] health check failed after 30 attempts'
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
