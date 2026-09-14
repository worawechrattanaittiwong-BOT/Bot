$ErrorActionPreference = 'Stop'

$service = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/maintenance.service.ts'))
$ui = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/app/admin/page.tsx'))
$ea = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/ea.controller.ts'))

$checks = @(
  @{ Name = 'global shutdown enters maintenance directly'; Text = $service; Pattern = "SET status='MAINTENANCE'" },
  @{ Name = 'global hard stop audit exists'; Text = $service; Pattern = 'GLOBAL_HARD_MAINTENANCE_STOP' },
  @{ Name = 'global hard stop revokes bot desires'; Text = $service; Pattern = "UPDATE bot_instances SET desired_state='STOPPED'" },
  @{ Name = 'global close all source exists'; Text = $service; Pattern = 'SYSTEM_HARD_MAINTENANCE' },
  @{ Name = 'per account admin force close exists'; Text = $service; Pattern = 'ADMIN_FORCE_CLOSE_ACCOUNT' },
  @{ Name = 'per account server snapshot becomes zero'; Text = $service; Pattern = "'positions',0" },
  @{ Name = 'owner UI hard shutdown label'; Text = $ui; Pattern = 'ปิดระบบทันที (Admin)' },
  @{ Name = 'owner UI per-account force label'; Text = $ui; Pattern = 'บังคับปิดทั้งหมด (Admin)' },
  @{ Name = 'owner UI explains non-blocking telemetry'; Text = $ui; Pattern = 'ไม่สามารถบล็อก Global Maintenance ได้' },
  @{ Name = 'owner UI reopen exists'; Text = $ui; Pattern = 'เปิดระบบหลังอัปเดต' },
  @{ Name = 'EA entitlement is revoked during maintenance'; Text = $ea; Pattern = 'entitlementAccess && !Boolean(maintenanceState.blockStarts)' }
)

foreach ($check in $checks) {
  if ($check.Text -notlike ('*' + $check.Pattern + '*')) {
    throw ('Missing contract: ' + $check.Name)
  }
}

Write-Host 'Admin Global Hard Maintenance contract PASS'
