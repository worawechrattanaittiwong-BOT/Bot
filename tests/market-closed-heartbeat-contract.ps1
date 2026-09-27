$ErrorActionPreference = 'Stop'

$ea = [System.IO.File]::ReadAllText((Resolve-Path 'mt5/FastBasketBot.mq5'))
$web = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/app/dashboard/page.tsx'))

foreach ($pattern in @(
  'ulong\s+g_lastHeartbeatTickMs\s*=\s*0;',
  'ulong\s+heartbeatNowMs\s*=\s*GetTickCount64\(\);',
  'heartbeatNowMs\s*-\s*g_lastHeartbeatTickMs\s*>=\s*heartbeatIntervalMs'
  'bool\s+ArmRuntimeTimer\(\)'
  'EventSetTimer\(1\)'
  'g_lastTimerEventTickMs\s*=\s*GetTickCount64\(\)'
)) {
  if ($ea -notmatch $pattern) { throw "Market-closed EA heartbeat regex missing: $pattern" }
}

foreach ($required in @(
  'string MarketSessionStateNow()',
  '\"runtimeContract\":\"" + SCENOVA_RUNTIME_CONTRACT + "\"',
  '\"livePriceTelemetrySuppressed\":true',
  'TimeTradeServer()',
  'SymbolInfoSessionTrade(_Symbol, day, session, from, to)',
  'if(day == SATURDAY || day == SUNDAY)',
  'if(MarketSessionStateNow() == "CLOSED")',
  'return "MARKET_CLOSED";',
  'marketSessionState',
  'Keep control-plane liveness ahead of chart/history work',
  'SCENOVA FATAL: runtime timer could not be armed'
)) {
  if (-not $ea.Contains($required)) { throw "Market-closed EA contract missing: $required" }
}

$legacyGate = "   datetime now = TimeCurrent();`n   int heartbeatSeconds = MathMax(1, InpHeartbeatSeconds);`n   if(now - g_lastHeartbeat >= heartbeatSeconds)"
if ($ea.Replace("`r`n", "`n").Contains($legacyGate)) { throw 'Legacy tick-time heartbeat gate is still active' }

foreach ($required in @(
  'const marketSessionClosed =',
  'marketSessionState === "CLOSED"',
  'ตลาดปิด — MT5/EA ยังเชื่อมต่อ · รอ Session เปิด',
  'ตลาดปิดชั่วคราว',
  'MT5 และ EA ยังเชื่อมต่ออยู่',
  'EA Heartbeat ขาดช่วง',
  'marketSessionClosed ? "MARKET CLOSED" : "REALTIME"'
)) {
  if (-not $web.Contains($required)) { throw "Market-closed dashboard contract missing: $required" }
}

Write-Host 'Market-closed heartbeat/status contract PASS'