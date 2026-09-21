$ErrorActionPreference = 'Stop'

function Read-Text([string]$path) {
  if (-not (Test-Path $path)) { throw "Missing source: $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path $path)
  )
}

$sidebar = Read-Text 'apps/web/components/OwnerSidebar.tsx'
$dashboard = Read-Text 'apps/web/app/dashboard/page.tsx'
$performance = Read-Text 'apps/web/app/performance/page.tsx'
$layout = Read-Text 'apps/web/app/layout.tsx'
$api = Read-Text 'apps/api/src/performance-analytics.controller.ts'

foreach ($required in @(
  'sharedTradingNavItems',
  'customerNavItems',
  'label:"Control Center"',
  'label:"MT5 & EA"',
  'label:"Backtest & Performance"',
  'href:"/performance"',
  'function CustomerSidebar',
  'function CustomerMobileNav',
  'elevated ? [...ownerNavItems] : [...customerNavItems]'
)) {
  if (-not $sidebar.Contains($required)) {
    throw "Unified role sidebar contract missing: $required"
  }
}

foreach ($required in @(
  'CustomerSidebar',
  'CustomerMobileNav',
  'userCode={data.user?.user_code}',
  'partner={data.partner}',
  'role={String(data.user?.role || "OWNER")}'
)) {
  if (-not $dashboard.Contains($required)) {
    throw "Dashboard unified sidebar wiring missing: $required"
  }
}

if ($dashboard.Contains('const navItems: Array<{id:View;label:string;hint:string}>')) {
  throw 'Legacy customer-only dashboard nav list must stay removed'
}

foreach ($required in @(
  'CustomerSidebar, OwnerSidebar',
  '<CustomerSidebar activeKey="trading-backtest"',
  'userCode={options?.user?.user_code}',
  'My Performance Only',
  'เลือกรายงาน Backtest ของคุณ',
  'แสดงเฉพาะ Backtest ที่ผูกกับบัญชีของคุณ'
)) {
  if (-not $performance.Contains($required)) {
    throw "Customer performance/backtest contract missing: $required"
  }
}

if ($performance.Contains('Trading Performance</Link>')) {
  throw 'Customer performance sidebar must use the shared Backtest & Performance label'
}

if ($layout.Contains('CustomerNavigationLabels')) {
  throw 'Legacy DOM-based customer navigation relabeler must stay disabled'
}

foreach ($required in @(
  'WHERE a.user_id=$1',
  'const accessClause = this.elevated(actor) ? "" : " AND a.user_id=$2"',
  'const clause = this.elevated(actor) ? "" : " AND br.owner_user_id=$2"',
  'WHERE owner_user_id=$1'
)) {
  if (-not $api.Contains($required)) {
    throw "Customer own-only performance authorization missing: $required"
  }
}

Write-Host 'Unified role sidebar + customer own Backtest/Performance contract PASS'
