$ErrorActionPreference = 'Stop'

$service = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/maintenance.service.ts'))
$ui = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/app/admin/page.tsx'))

$checks = @(
  @{ Name = 'admin stale reconcile reason'; Text = $service; Pattern = 'ADMIN_MAINTENANCE_OVERRIDE_STALE_SNAPSHOT' },
  @{ Name = 'admin stale reconcile audit'; Text = $service; Pattern = 'ADMIN_RECONCILE_STALE_MT5_POSITIONS' },
  @{ Name = 'shutdown invokes admin stale reconcile'; Text = $service; Pattern = 'const adminReconciledStalePositions = await this.reconcileAdminStalePositions(actor);' },
  @{ Name = 'resume reconciles stale cache'; Text = $service; Pattern = 'await this.reconcileAdminStalePositions(actor);' },
  @{ Name = 'fresh MT5 remains safety blocker'; Text = $service; Pattern = 'ยังมี MT5 ที่ออนไลน์และยืนยัน Bot Running หรือ Position จริง' },
  @{ Name = 'draining exposes reopen button'; Text = $ui; Pattern = 'เปิดระบบ (เคลียร์สถานะค้าง)' },
  @{ Name = 'stale account action is explicit'; Text = $ui; Pattern = 'ล้างสถานะค้าง (Admin)' },
  @{ Name = 'freshness is visible to Admin'; Text = $ui; Pattern = 'ข้อมูลเก่า/ขาด heartbeat' }
)

foreach ($check in $checks) {
  if ($check.Text -notlike ('*' + $check.Pattern + '*')) {
    throw ('Missing contract: ' + $check.Name)
  }
}

Write-Host 'Admin maintenance stale-position override contract PASS'
