$ErrorActionPreference = 'Stop'

function Read-Normalized([string]$path) {
  return [System.IO.File]::ReadAllText((Resolve-Path $path)).Replace("`r`n", "`n")
}

function Write-Utf8([string]$path, [string]$text) {
  [System.IO.File]::WriteAllText((Resolve-Path $path), $text.Replace("`r`n", "`n"), [System.Text.UTF8Encoding]::new($false))
}

function Replace-Required([string]$text, [string]$old, [string]$new, [string]$label) {
  $old = $old.Replace("`r`n", "`n")
  $new = $new.Replace("`r`n", "`n")
  if (-not $text.Contains($old)) { throw "Patch anchor not found: $label" }
  Write-Host "Patched: $label"
  return $text.Replace($old, $new)
}

# ---------------------------------------------------------------------------
# EA heartbeat: use a monotonic local clock so the heartbeat keeps running
# during weekends / broker session closes when TimeCurrent() may stop moving.
# Trading decisions remain tick-driven; this changes connectivity telemetry only.
# ---------------------------------------------------------------------------
$eaPath = 'mt5/FastBasketBot.mq5'
$ea = Read-Normalized $eaPath

$ea = Replace-Required $ea @'
datetime g_lastHeartbeat = 0;
datetime g_lastSuccessfulHeartbeat = 0;
'@ @'
datetime g_lastHeartbeat = 0;
ulong  g_lastHeartbeatTickMs = 0;
datetime g_lastSuccessfulHeartbeat = 0;
'@ 'monotonic heartbeat state'

$ea = Replace-Required $ea @'
   datetime now = TimeCurrent();
   int heartbeatSeconds = MathMax(1, InpHeartbeatSeconds);
   if(now - g_lastHeartbeat >= heartbeatSeconds)
   {
      g_lastHeartbeat = now;
      SendHeartbeat();
   }
'@ @'
   // TimeCurrent() can freeze when a broker is not producing ticks (weekend /
   // closed session). Drive the transport heartbeat from a monotonic terminal
   // clock instead. This keeps SaaS connectivity truthful without generating
   // any trading activity while the market is closed.
   ulong heartbeatNowMs = GetTickCount64();
   ulong heartbeatIntervalMs = (ulong)MathMax(1, InpHeartbeatSeconds) * 1000;
   if(g_lastHeartbeatTickMs == 0 ||
      heartbeatNowMs - g_lastHeartbeatTickMs >= heartbeatIntervalMs)
   {
      g_lastHeartbeatTickMs = heartbeatNowMs;
      g_lastHeartbeat = TimeCurrent();
      SendHeartbeat();
   }
'@ 'heartbeat timer independent of ticks'

$ea = Replace-Required $ea @'
string TradePermissionStatus()
{
'@ @'
string MarketSessionStateNow()
{
   if(!TerminalConnectedNow())
      return "TERMINAL_OFFLINE";

   // TimeTradeServer() advances between ticks and is therefore suitable for
   // checking the broker's published trading sessions while the market is idle.
   datetime serverNow = TimeTradeServer();
   if(serverNow <= 0)
      serverNow = TimeCurrent();

   MqlDateTime nowParts;
   if(serverNow <= 0 || !TimeToStruct(serverNow, nowParts))
      return "UNKNOWN";

   ENUM_DAY_OF_WEEK day = (ENUM_DAY_OF_WEEK)nowParts.day_of_week;
   int nowSeconds = nowParts.hour * 3600 + nowParts.min * 60 + nowParts.sec;
   bool foundSession = false;

   for(uint session = 0; session < 32; session++)
   {
      datetime from = 0;
      datetime to = 0;
      if(!SymbolInfoSessionTrade(_Symbol, day, session, from, to))
         break;

      foundSession = true;
      MqlDateTime fromParts;
      MqlDateTime toParts;
      if(!TimeToStruct(from, fromParts) || !TimeToStruct(to, toParts))
         continue;

      int fromSeconds = fromParts.hour * 3600 + fromParts.min * 60 + fromParts.sec;
      int toSeconds = toParts.hour * 3600 + toParts.min * 60 + toParts.sec;

      // A full-day session is represented by equal endpoints on some brokers.
      if(fromSeconds == toSeconds)
         return "OPEN";

      bool active = fromSeconds < toSeconds
         ? (nowSeconds >= fromSeconds && nowSeconds < toSeconds)
         : (nowSeconds >= fromSeconds || nowSeconds < toSeconds);
      if(active)
         return "OPEN";
   }

   if(foundSession)
      return "CLOSED";

   // Brokers commonly publish no Saturday/Sunday session rows at all. Treat
   // that as closed. On weekdays, missing metadata stays UNKNOWN rather than
   // falsely blocking a symbol whose server does not expose session tables.
   if(day == SATURDAY || day == SUNDAY)
      return "CLOSED";

   return "UNKNOWN";
}

string TradePermissionStatus()
{
'@ 'broker session state detection'

$ea = Replace-Required $ea @'
   int mode = SymbolTradeModeNow();
   if(mode == SYMBOL_TRADE_MODE_DISABLED || mode == SYMBOL_TRADE_MODE_CLOSEONLY)
      return "SYMBOL_TRADING_DISABLED";

   return "OK";
'@ @'
   int mode = SymbolTradeModeNow();
   if(mode == SYMBOL_TRADE_MODE_DISABLED || mode == SYMBOL_TRADE_MODE_CLOSEONLY)
      return "SYMBOL_TRADING_DISABLED";

   if(MarketSessionStateNow() == "CLOSED")
      return "MARKET_CLOSED";

   return "OK";
'@ 'closed session blocks new orders cleanly'

$ea = Replace-Required $ea @'
   string heartbeatUrl = InpApiBase + "/api/ea/heartbeat";
'@ @'
   // Publish market-session telemetry independently of bot RUNNING/SAFE_STOP.
   // The dashboard can therefore say "market closed" without pretending MT5
   // disconnected and without waiting for an OrderSend rejection.
   if(StringLen(payload) >= 2)
   {
      string marketSessionState = MarketSessionStateNow();
      string marketSessionDiagnostics = StringFormat(
         ",\"marketSessionState\":\"%s\",\"marketSessionOpen\":%s}}",
         marketSessionState,
         marketSessionState == "OPEN" ? "true" : "false"
      );
      payload = StringSubstr(payload, 0, StringLen(payload) - 2) + marketSessionDiagnostics;
   }

   string heartbeatUrl = InpApiBase + "/api/ea/heartbeat";
'@ 'market session heartbeat telemetry'

Write-Utf8 $eaPath $ea

# ---------------------------------------------------------------------------
# Dashboard: distinguish three states clearly:
# 1) market closed but MT5/EA connected,
# 2) Agent online but EA heartbeat stale,
# 3) true connection loss.
# ---------------------------------------------------------------------------
$webPath = 'apps/web/app/dashboard/page.tsx'
$web = Read-Normalized $webPath

$web = Replace-Required $web @'
  const isAgentOnline = Boolean(data?.instance?.agent_online || data?.instance?.device_online);
  const heartbeatLatencyMs = Number(metrics.heartbeatLatencyMs ?? 0);
'@ @'
  const isAgentOnline = Boolean(data?.instance?.agent_online || data?.instance?.device_online);
  const marketSessionState = String(metrics.marketSessionState || "").toUpperCase();
  const marketSessionClosed =
    marketSessionState === "CLOSED" ||
    String(metrics.executionStatus || "").toUpperCase() === "MARKET_CLOSED";
  const heartbeatLatencyMs = Number(metrics.heartbeatLatencyMs ?? 0);
'@ 'dashboard market session state'

$web = Replace-Required $web @'
  const marketTradeLabel =
    !isMt5Online
      ? (isAgentOnline ? "Agent เชื่อมแล้ว · รอ EA Heartbeat — ยังส่งออเดอร์ไม่ได้" : "รอ MT5 เชื่อมต่อ")
      : String(liveStatus.code||"") === "MARKET_CLOSED"
        ? "ตลาดปิด — รอ Session"
        : metrics.tradeReady === true
'@ @'
  const marketTradeLabel =
    marketSessionClosed
      ? "ตลาดปิด — MT5/EA ยังเชื่อมต่อ · รอ Session เปิด"
      : !isMt5Online
        ? (isAgentOnline ? "Agent เชื่อมแล้ว · EA Heartbeat ขาดช่วง — ตรวจ EA โดยไม่สรุปว่า MT5 หลุด" : "รอ MT5 เชื่อมต่อ")
        : metrics.tradeReady === true
'@ 'market status copy precedence'

$web = Replace-Required $web @'
              {!isMt5Online && (
                <div className="cc-connect-alert">
                  <div className="cc-alert-icon"><ScenovaIcon name="info" size={20}/></div>
                  <div className="cc-alert-copy"><b>ยังไม่ได้เชื่อมต่อ MT5</b><span>{data.account.mode === "LOCAL" ? "เปิด MetaTrader 5 เพื่อเชื่อมต่อ" : "กำลังรอการเชื่อมต่อ"}</span></div>
                  <button className="btn cc-alert-action" onClick={()=>setActiveView("account")}>ไปหน้าการเชื่อมต่อ →</button>
                </div>
              )}
'@ @'
              {marketSessionClosed ? (
                <div className="cc-connect-alert">
                  <div className="cc-alert-icon"><ScenovaIcon name="timer" size={20}/></div>
                  <div className="cc-alert-copy"><b>ตลาดปิดชั่วคราว</b><span>MT5 และ EA ยังเชื่อมต่ออยู่ · ระบบจะรอ Session เปิดโดยอัตโนมัติ</span></div>
                  <button type="button" className="btn cc-alert-action" disabled>รอเปิดตลาด</button>
                </div>
              ) : !isMt5Online && (
                <div className="cc-connect-alert">
                  <div className="cc-alert-icon"><ScenovaIcon name="info" size={20}/></div>
                  <div className="cc-alert-copy">
                    <b>{isAgentOnline ? "EA Heartbeat ขาดช่วง" : "ยังไม่ได้เชื่อมต่อ MT5"}</b>
                    <span>{isAgentOnline ? "Windows Agent ยังเชื่อมอยู่ · ตรวจว่า EA ยังติดอยู่บนกราฟก่อนเชื่อม MT5 ใหม่" : data.account.mode === "LOCAL" ? "เปิด MetaTrader 5 เพื่อเชื่อมต่อ" : "กำลังรอการเชื่อมต่อ"}</span>
                  </div>
                  <button className="btn cc-alert-action" onClick={()=>setActiveView("account")}>{isAgentOnline ? "ตรวจการเชื่อมต่อ →" : "ไปหน้าการเชื่อมต่อ →"}</button>
                </div>
              )}
'@ 'market closed and stale heartbeat banners'

$web = Replace-Required $web @'
                <div className="cc-v6-telemetry-live"><i/>REALTIME</div>
'@ @'
                <div className="cc-v6-telemetry-live"><i/>{marketSessionClosed ? "MARKET CLOSED" : "REALTIME"}</div>
'@ 'telemetry market closed badge'

Write-Utf8 $webPath $web

# ---------------------------------------------------------------------------
# Permanent regression contract.
# ---------------------------------------------------------------------------
$testPath = 'tests/market-closed-heartbeat-contract.ps1'
$test = @'
$ErrorActionPreference = 'Stop'

$ea = [System.IO.File]::ReadAllText((Resolve-Path 'mt5/FastBasketBot.mq5'))
$web = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/app/dashboard/page.tsx'))

foreach ($required in @(
  'ulong  g_lastHeartbeatTickMs = 0;',
  'ulong heartbeatNowMs = GetTickCount64();',
  'heartbeatNowMs - g_lastHeartbeatTickMs >= heartbeatIntervalMs',
  'string MarketSessionStateNow()',
  'TimeTradeServer()',
  'SymbolInfoSessionTrade(_Symbol, day, session, from, to)',
  'if(day == SATURDAY || day == SUNDAY)',
  'if(MarketSessionStateNow() == "CLOSED")',
  'return "MARKET_CLOSED";',
  '"marketSessionState"'
)) {
  if (-not $ea.Contains($required)) { throw "Market-closed EA contract missing: $required" }
}

$legacyGate = @'
   datetime now = TimeCurrent();
   int heartbeatSeconds = MathMax(1, InpHeartbeatSeconds);
   if(now - g_lastHeartbeat >= heartbeatSeconds)
'@
if ($ea.Contains($legacyGate)) { throw 'Legacy tick-time heartbeat gate is still active' }

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
'@
[System.IO.File]::WriteAllText($testPath, $test.Replace("`r`n", "`n"), [System.Text.UTF8Encoding]::new($false))

# Keep the regression check in normal CI.
$ciPath = '.github/workflows/ci.yml'
$ci = Read-Normalized $ciPath
if (-not $ci.Contains('Market-closed heartbeat and status contract')) {
  $ci = Replace-Required $ci @'
      - name: Manual EA update one-click restart contract
        shell: pwsh
        run: ./tests/manual-ea-update-contract.ps1
'@ @'
      - name: Manual EA update one-click restart contract
        shell: pwsh
        run: ./tests/manual-ea-update-contract.ps1
      - name: Market-closed heartbeat and status contract
        shell: pwsh
        run: ./tests/market-closed-heartbeat-contract.ps1
'@ 'permanent CI regression step'
  Write-Utf8 $ciPath $ci
}

Write-Host 'Market-closed heartbeat patch applied successfully.'
