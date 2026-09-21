$ErrorActionPreference = 'Stop'

$analytics = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/performance-analytics.controller.ts'))
$actions = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/performance-actions.controller.ts'))
$web = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/app/performance/page.tsx'))
$public = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/app/shared-performance/[slug]/page.tsx'))

foreach ($required in @(
  "event_type='EXIT'",
  "executedByBot",
  'curveExits',
  'T00:00:00.000+07:00',
  'T23:59:59.999+07:00'
)) {
  if (-not $analytics.Contains($required)) { throw "Performance analytics date/curve contract missing: $required" }
}

foreach ($required in @(
  'publicShare(',
  'availableRange',
  'detailedExits',
  'parsePublicRange',
  '730 days',
  'accountType',
  'accountTradeMode'
)) {
  if (-not $actions.Contains($required)) { throw "Public performance dynamic-share contract missing: $required" }
}

foreach ($required in @(
  'วันนี้',
  '7 วัน',
  '30 วัน',
  '90 วัน',
  'inclusiveDays',
  'chartTickLabel',
  'from={from} to={to}',
  'BOT PERFORMANCE SUMMARY',
  'My Performance Only',
  'account.userId===options?.user?.id',
  'ownAccounts',
  'compactToolbar',
  'แชร์ Read-only'
)) {
  if (-not $web.Contains($required)) { throw "Trading Performance compact date/share contract missing: $required" }
}

if ($web.Contains('customDays')) { throw 'Main Trading Performance page must not render the removed custom-day input' }
if ($web.Contains('className={styles.shareCard}')) { throw 'Share controls must stay integrated into the main toolbar' }
if ($web.Contains('<h1>Trading Performance & Backtest</h1>')) { throw 'Redundant page heading must stay removed' }

foreach ($required in @(
  'กำหนดเอง',
  'shared-performance/',
  'customDays',
  'EquityChart points={curve} from={from} to={to}',
  'REAL ACCOUNT',
  'DEMO ACCOUNT',
  'บัญชีจริง · REAL',
  'บัญชีทดลอง · DEMO',
  'Drawdown %',
  'horizontalGrid',
  'yTickLabel',
  'preserveAspectRatio="xMidYMid meet"',
  'kind==="drawdown"?560:1000',
  'heroRisk',
  'ผลย้อนหลังไม่รับประกันผลลัพธ์ในอนาคต'
)) {
  if (-not $public.Contains($required)) { throw "Shared Performance date selector contract missing: $required" }
}

if ($public.Contains('LIVE READ ONLY')) { throw 'Public performance page must not show system-explanation LIVE READ ONLY badge' }
if ($public.Contains('DATE SELECTABLE')) { throw 'Public performance page must not show system-explanation DATE SELECTABLE badge' }
if ($public.Contains('แกนล่าง =')) { throw 'Public chart header must not show internal axis explanation copy' }
if ($public.Contains('EXIT ที่บอทปิดจริง')) { throw 'Public chart header must not expose implementation explanation' }
if ($public.Contains('className={styles.disclaimer}')) { throw 'Risk warning must live in the hero card, not a separate bottom card' }
if ($public.Contains('Public Read Only')) { throw 'Public page must not show system footer explanation' }

Write-Host 'Performance date range / dynamic public share contract PASS'
