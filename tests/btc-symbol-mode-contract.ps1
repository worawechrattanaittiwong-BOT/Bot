$ErrorActionPreference = "Stop"

function Read-Text([string]$path) {
  if (-not (Test-Path $path)) { throw "Missing source: $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
}
function Block([string]$text,[string]$sig) {
  $s=$text.IndexOf($sig); if($s -lt 0){throw "Missing $sig"}
  $b=$text.IndexOf("{",$s); $d=0
  for($i=$b;$i -lt $text.Length;$i++){
    if($text[$i] -eq "{"){$d++}
    elseif($text[$i] -eq "}"){$d--; if($d -eq 0){return $text.Substring($s,$i-$s+1)}}
  }
  throw "Unclosed $sig"
}
function Need([string]$text,[string]$needle,[string]$message) {
  if(-not $text.Contains($needle)){throw $message}
}

$ea = Read-Text 'mt5/FastBasketBot.mq5'
$flip = Read-Text 'mt5/include/FlipLockV1.mqh'
$api = Read-Text 'apps/api/src/bot.controller.ts'
$symbolApi = Read-Text 'apps/api/src/trading-symbol.controller.ts'
$web = Read-Text 'apps/web/app/dashboard/page.tsx'
$popup = Read-Text 'apps/web/components/SystemPopupProvider.tsx'
$globals = Read-Text 'apps/web/app/globals.css'
$premium = Read-Text 'apps/web/app/premium-dashboard.css'
$release = Read-Text 'apps/api/src/release-version.ts'

$btc = Block $ea 'bool IsBitcoinSymbol()'
$zero = Block $ea 'bool ZeroGridModeEnabled()'
$session = Block $ea 'string MarketSessionStateNow()'
$deviation = Block $ea 'int DynamicDeviationPoints()'
$send = Block $ea 'bool SendMarketOrder(int direction)'
$modify = Block $ea 'bool ModifyPositionProtection(ulong ticket, double sl, double tp)'
$onTick = Block $ea 'void OnTick()'

Need $btc 'StringFind(symbol,"BTC")>=0' 'BTC symbol detection missing'
Need $btc 'StringFind(symbol,"XBT")>=0' 'XBT symbol detection missing'
Need $ea 'double SymbolTickSizeNow()' 'broker tick-size helper missing'
Need $ea 'double NormalizeStopPriceToTick' 'stop tick normalization missing'
Need $ea 'double NormalizeTargetPriceToTick' 'target tick normalization missing'
Need $send 'request.deviation = DynamicDeviationPoints();' 'shared order sender must use symbol-aware deviation'
Need $send 'NormalizeStopPriceToTick(request.sl,direction)' 'orders must normalize SL to broker tick size'
Need $send 'NormalizeTargetPriceToTick(request.tp,direction)' 'orders must normalize TP to broker tick size'
Need $modify 'NormalizeStopPriceToTick(sl,direction)' 'SL modifications must normalize to tick size'
Need $modify 'NormalizeTargetPriceToTick(tp,direction)' 'TP modifications must normalize to tick size'
Need $deviation 'IsBitcoinSymbol()' 'BTC deviation profile missing'
Need $deviation 'spread*3.0' 'BTC deviation must scale from live spread'
Need $session 'if(IsBitcoinSymbol())' 'BTC weekend/session handling missing'
Need $session 'cryptoTick.time' 'BTC session fallback must require a live broker tick'
Need $zero 'return !IsBitcoinSymbol()' 'ZERO GRID must be disabled for BTC at runtime'
Need $onTick 'BTC_ZERO_GRID_BLOCKED' 'stale BTC ZERO GRID settings must be visibly blocked'
Need $ea 'RACE_M5_20_STRUCTURE' 'RACE entry model must advertise M5 20-bar structure flow'

Need $flip 'NormalizeStopPriceToTick(stop,direction)' 'FLIP starter SL must use broker tick size'
Need $flip 'NormalizeTargetPriceToTick(triggerPrice,direction)' 'FLIP pending trigger must use broker tick size'

Need $api 'function isBitcoinTradingSymbol' 'Bot API BTC classifier missing'
Need $api 'ZERO GRID ไม่รองรับ BTC/XBT' 'Bot API must reject BTC ZERO GRID'
Need $api 'BTC/XBT รองรับ AUTO, RACE, COUNTER, FLIP LOCK และ MANUAL เท่านั้น' 'Start guard must reject stale BTC ZERO GRID'

# Initial Cloud MT5 provisioning remains XAU-only. Existing accounts may
# switch to BTC/XBT only when their EA confirms the exact Market Watch name.
# Neither path may infer or manufacture a broker suffix.
Need $symbolApi '!alreadyConnected && !requestedSymbol.toUpperCase().startsWith("XAU")' 'Initial Cloud MT5 connection must reject non-XAU selection'
Need $symbolApi 'connectedAccountSymbolChoices(instance.metrics)' 'Connected-account Symbol changes must use the real EA Market Watch'
Need $symbolApi 'discoveredXauSymbols' 'Initial Cloud discovery retains Worker XAU-only options'
Need $symbolApi 'item.toUpperCase() === requestedSymbol.toUpperCase()' 'Cloud Trading Symbol API must require an exact discovered symbol'

Need $web 'const isBitcoinSymbol = tradingSymbol.includes("BTC") || tradingSymbol.includes("XBT");' 'Dashboard BTC classifier missing'
Need $web 'zeroGridBlockedForSymbol' 'Dashboard BTC ZERO gate missing'
Need $web 'ZERO GRID ถูกบล็อก' 'Dashboard must explain BTC-supported modes'
Need $web 'disabled={zeroGridBlockedForSymbol||modeAvailability.ZERO_GRID===false}' 'ZERO GRID option must be disabled for BTC or OWNER disabled mode'
Need $web 'แจ้งเตือนก่อนเทรด BTC' 'BTC Start must show the dedicated risk warning'
Need $web 'size:"large"' 'BTC warning must use the large reading popup variant'
Need $web 'ปรับจูนโดยอิงพฤติกรรมของ XAUUSD เป็นหลัก' 'BTC warning must disclose XAUUSD-first tuning'
Need $web 'ยังไม่ได้ปรับจูนเฉพาะสำหรับตลาด BTC' 'BTC warning must disclose that BTC-specific tuning is not complete'
Need $web 'scenova:btc-risk:v1:' 'BTC acknowledgement must be remembered per Slot and mode'
Need $web 'COUNTER ไม่มี Broker SL ต่อออเดอร์และอาจสะสมหลาย Position' 'COUNTER BTC warning must disclose no per-order Broker SL and inventory risk'
Need $web 'ความผันผวนและไส้เทียนของ BTC อาจทำให้ SL / Flip เกิดถี่ขึ้น' 'FLIP LOCK BTC persistent warning missing'
Need $web 'BTC · High Volatility' 'BTC dashboard warning badge missing'
Need $popup 'acknowledgeLabel?: string;' 'System Popup must support a required acknowledgement checkbox'
Need $popup 'size?: "default" | "large";' 'System Popup must support a large reading confirm variant'
Need $popup 'sc-system-popup-large' 'System Popup must render the large reading class'
Need $popup 'sc-system-popup-acknowledge' 'System Popup acknowledgement control missing'
Need $globals '.sc-system-popup-acknowledge{' 'System Popup acknowledgement styling missing'
Need $globals 'Large reading confirm · BTC risk warning' 'Desktop BTC large reading styling missing'
Need $globals 'width:min(700px,calc(100vw - 64px));' 'Desktop BTC warning must be wide enough for comfortable reading'
Need $globals 'font-size:15px;' 'Desktop BTC warning body text must remain readable'
Need $globals 'align-self:start;' 'Desktop BTC warning icon must align to the top of the warning copy'
Need $premium '.cc-bot-v2-embedded .cc-btc-risk-note{' 'Embedded BTC warning must stay visible'

$eaVersionMatch = [regex]::Match($ea, '#property\s+version\s+"([^"]+)"')
$releaseVersionMatch = [regex]::Match($release, 'DEFAULT_EA_VERSION\s*=\s*"([^"]+)"')
if(-not $eaVersionMatch.Success -or -not $releaseVersionMatch.Success){
  throw 'EA release version marker missing'
}
if($eaVersionMatch.Groups[1].Value -ne $releaseVersionMatch.Groups[1].Value){
  throw ("EA/API version mismatch: EA={0} API={1}" -f $eaVersionMatch.Groups[1].Value,$releaseVersionMatch.Groups[1].Value)
}

Write-Host 'BTC symbol support and mode gate contract PASS'
