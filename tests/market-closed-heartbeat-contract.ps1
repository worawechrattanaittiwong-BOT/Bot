$ErrorActionPreference = 'Stop'

$ea = [System.IO.File]::ReadAllText((Resolve-Path 'mt5/FastBasketBot.mq5'))
$web = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/app/dashboard/page.tsx'))
$eaApi = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/ea.controller.ts'))
$botApi = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/bot.controller.ts'))

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
  'SCENOVA FATAL: runtime timer could not be armed',
  'terminalOfflineConfirmed',
  'statusNowMs - terminalDisconnectedSinceMs >= 5000',
  'terminalOfflineConfirmed ? "MT5 OFFLINE" : "RECONNECTING"',
  'TERMINAL_PING_LAST',
  '\"brokerPingMs\":%.1f'
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
  'marketSessionClosed ? "MARKET CLOSED" : "REALTIME"',
  'const brokerPingMs = Math.max(0, Number(metrics.brokerPingMs ?? 0));',
  'runtimeModeLabel',
  'runtimeLocationLabel',
  'Ping จริงจาก MT5 ไป Broker Trade Server'
)) {
  if (-not $web.Contains($required)) { throw "Market-closed dashboard contract missing: $required" }
}

foreach ($required in @(
  "command='START'",
  "'ackSource','RUNNING_HEARTBEAT'",
  'heartbeatActualState === "RUNNING"'
)) {
  if (-not $eaApi.Contains($required)) { throw "RUNNING heartbeat command ACK contract missing: $required" }
}

foreach ($required in @(
  'wn.region AS runner_region',
  'LEFT JOIN worker_nodes wn ON wn.runner_id=bi.runner_id'
)) {
  if (-not $botApi.Contains($required)) { throw "Cloud runtime location contract missing: $required" }
}

Write-Host 'Market-closed heartbeat/status contract PASS'