$ErrorActionPreference = 'Stop'

$ea = [System.IO.File]::ReadAllText((Resolve-Path 'mt5/FastBasketBot.mq5'))
$web = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/app/dashboard/page.tsx'))

foreach ($required in @(
  'ulong  g_lastHeartbeatTickMs = 0;',
  'ulong heartbeatNowMs=GetTickCount64();',
  'heartbeatNowMs - g_lastHeartbeatTickMs >= heartbeatIntervalMs',
  'string MarketSessionStateNow()',
  'TimeTradeServer()',
  'SymbolInfoSessionTrade(_Symbol, day, session, from, to)',
  'if(day == SATURDAY || day == SUNDAY)',
  'if(MarketSessionStateNow() == "CLOSED")',
  'return "MARKET_CLOSED";',
  'marketSessionState'
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