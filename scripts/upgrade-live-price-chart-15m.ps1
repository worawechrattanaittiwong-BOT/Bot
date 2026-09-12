$ErrorActionPreference = 'Stop'

function Read-Utf8([string]$path) {
  return [System.IO.File]::ReadAllText((Resolve-Path $path)).Replace("`r`n", "`n")
}
function Write-Utf8([string]$path,[string]$text) {
  [System.IO.File]::WriteAllText((Resolve-Path $path),$text.Replace("`r`n", "`n"),[System.Text.UTF8Encoding]::new($false))
}
function Replace-Required([ref]$text,[string]$old,[string]$new,[string]$label) {
  $old = $old.Replace("`r`n", "`n")
  $new = $new.Replace("`r`n", "`n")
  if(-not $text.Value.Contains($old)) { throw "Missing patch anchor: $label" }
  $text.Value = $text.Value.Replace($old,$new)
  Write-Host "Patched: $label"
}

$pagePath = 'apps/web/app/dashboard/page.tsx'
$pageValue = Read-Utf8 $pagePath
$page = [ref]$pageValue

Replace-Required $page 'type View = "overview" | "account" | "access" | "backtest";' @'
type View = "overview" | "account" | "access" | "backtest";
const LIVE_PRICE_WINDOW_MS = 15 * 60 * 1000;
'@ '15-minute live price window constant'

Replace-Required $page '  const [botSettingsOpen, setBotSettingsOpen] = useState(false);' @'
  const [botSettingsOpen, setBotSettingsOpen] = useState(false);
  const [livePricePoints, setLivePricePoints] = useState<Array<{t:number;price:number}>>([]);
  const livePriceSlotRef = useRef("");
'@ 'live price in-memory state'

Replace-Required $page '  const metrics = data?.instance?.metrics || {};' @'
  const metrics = data?.instance?.metrics || {};

  useEffect(() => {
    const slotKey = String(data?.selectedSlot?.id || data?.instance?.id || "");
    if (livePriceSlotRef.current !== slotKey) {
      livePriceSlotRef.current = slotKey;
      setLivePricePoints([]);
    }

    const heartbeatMetrics = data?.instance?.metrics || {};
    const marketState = String(heartbeatMetrics.marketSessionState || "").toUpperCase();
    const price = Number(heartbeatMetrics.marketMid || 0);
    if (!slotKey || marketState === "CLOSED" || !Number.isFinite(price) || price <= 0) return;

    const sampledAt = Date.now();
    setLivePricePoints(previous => {
      const cutoff = sampledAt - LIVE_PRICE_WINDOW_MS;
      const trimmed = previous.filter(point => point.t >= cutoff);
      const last = trimmed[trimmed.length - 1];
      if (last && sampledAt - last.t < 1000) return trimmed;
      return [...trimmed, { t: sampledAt, price }];
    });
  }, [data?.instance?.last_seen_at, data?.selectedSlot?.id]);
'@ 'append only current heartbeat price in memory'

Replace-Required $page '  const hourlyWinRate = Array.isArray(data?.tradeJournal?.hourlyWinRate) ? data.tradeJournal.hourlyWinRate : [];' '' 'remove historical hourly performance source'

Replace-Required $page '                  <HourlyWinRateChart points={hourlyWinRate}/>' '                  <LivePriceChart points={livePricePoints} symbol={String(metrics.symbol || settings.symbol || "XAUUSD")} marketClosed={marketSessionClosed}/>' 'render live 15-minute price chart'

$componentPattern = '(?s)function HourlyWinRateChart\(\{points\}:\{points:any\[\]\}\) \{.*?\n\}\n\nfunction StatusRow'
$componentReplacement = @'
function LivePriceChart({points,symbol,marketClosed}:{points:Array<{t:number;price:number}>;symbol:string;marketClosed:boolean}) {
  const [nowMs,setNowMs] = useState(()=>Date.now());

  useEffect(() => {
    if (marketClosed) {
      setNowMs(Date.now());
      return;
    }
    const id = window.setInterval(()=>setNowMs(Date.now()),100);
    return () => window.clearInterval(id);
  }, [marketClosed]);

  const width = 940;
  const height = 286;
  const pad = 10;
  const cutoff = nowMs - LIVE_PRICE_WINDOW_MS;
  const visible = points.filter(point=>point.t>=cutoff && point.t<=nowMs+5000);
  const prices = visible.map(point=>point.price);
  const low = prices.length ? Math.min(...prices) : 0;
  const high = prices.length ? Math.max(...prices) : 0;
  const rawRange = Math.max(0,high-low);
  const center = prices.length ? (high+low)/2 : 0;
  const breathingRoom = prices.length
    ? Math.max(rawRange*0.22,Math.abs(center)*0.00004,0.01)
    : 1;
  const minPrice = low-breathingRoom;
  const maxPrice = high+breathingRoom;
  const range = Math.max(0.0000001,maxPrice-minPrice);
  const xFor = (time:number)=>pad+((time-cutoff)/LIVE_PRICE_WINDOW_MS)*(width-pad*2);
  const yFor = (price:number)=>pad+((maxPrice-price)/range)*(height-pad*2);
  const plotted = visible.map(point=>({...point,x:xFor(point.t),y:yFor(point.price)}));
  const linePath = plotted.reduce((path,point,index)=>{
    if(index===0) return "M"+point.x.toFixed(2)+" "+point.y.toFixed(2);
    const previous = plotted[index-1];
    const middleX = (previous.x+point.x)/2;
    return path+" C"+middleX.toFixed(2)+" "+previous.y.toFixed(2)+" "+middleX.toFixed(2)+" "+point.y.toFixed(2)+" "+point.x.toFixed(2)+" "+point.y.toFixed(2);
  },"");
  const areaPath = plotted.length>1
    ? linePath+" L "+plotted[plotted.length-1].x.toFixed(2)+" "+height+" L "+plotted[0].x.toFixed(2)+" "+height+" Z"
    : "";
  const latest = plotted[plotted.length-1];

  return (
    <section className="panel cc-v6-hourly-chart">
      <div className="cc-v6-panel-head">
        <div><span><ScenovaIcon name="trend" size={18}/></span><div><b>ราคาสด {symbol}</b><small>เส้นราคาไหลแบบ Live · เก็บเฉพาะข้อมูล 15 นาทีล่าสุดในหน้านี้</small></div></div>
        <em className={marketClosed?"warn":"good"}>{marketClosed?"MARKET CLOSED":"LIVE · 15 MIN"}</em>
      </div>
      <div className="cc-v6-chart-canvas" style={{height:"278px",marginTop:"10px"}}>
        <svg viewBox={"0 0 "+width+" "+height} preserveAspectRatio="none" role="img" aria-label="กราฟราคาสด 15 นาทีล่าสุด">
          <defs>
            <linearGradient id="hourlyWinLine" x1="0" x2="1"><stop offset="0" stopColor="#48e8ff"/><stop offset=".56" stopColor="#57a9ff"/><stop offset="1" stopColor="#a978ff"/></linearGradient>
            <linearGradient id="hourlyWinArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4fcfff" stopOpacity=".20"/><stop offset="1" stopColor="#7658ff" stopOpacity="0"/></linearGradient>
            <filter id="livePriceGlow"><feGaussianBlur stdDeviation="3.4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            <radialGradient id="livePriceDot"><stop offset="0" stopColor="#f4fdff"/><stop offset=".35" stopColor="#65e4ff"/><stop offset="1" stopColor="#7f6cff"/></radialGradient>
          </defs>
          {areaPath&&<path d={areaPath} className="cc-v6-chart-area"/>}
          {linePath&&<path d={linePath} className="cc-v6-chart-line" filter="url(#livePriceGlow)"/>}
          {latest&&<g>
            <circle cx={latest.x} cy={latest.y} r="5.5" fill="url(#livePriceDot)" stroke="#eafcff" strokeWidth="1.2" vectorEffect="non-scaling-stroke"/>
            {!marketClosed&&<circle cx={latest.x} cy={latest.y} r="8" fill="none" stroke="#62ddff" strokeWidth="1" opacity=".7" vectorEffect="non-scaling-stroke"><animate attributeName="r" values="7;14;7" dur="1.7s" repeatCount="indefinite"/><animate attributeName="opacity" values=".75;0;.75" dur="1.7s" repeatCount="indefinite"/></circle>}
          </g>}
        </svg>
        {!visible.length&&<div className="cc-v6-chart-empty"><ScenovaIcon name="trend" size={24}/><b>{marketClosed?"ตลาดปิดอยู่":"กำลังรอราคาสด"}</b><span>{marketClosed?"เมื่อ Session เปิด กราฟจะเริ่มไหลจากข้อมูลใหม่ทันที":"ข้อมูลจะเริ่มวาดเมื่อ EA ส่งราคาล่าสุดเข้ามา"}</span></div>}
      </div>
    </section>
  );
}

function StatusRow
'@
$newPage = [regex]::Replace($page.Value,$componentPattern,$componentReplacement,1)
if($newPage -eq $page.Value) { throw 'Could not replace HourlyWinRateChart component' }
Write-Utf8 $pagePath $newPage

$eaPath = 'mt5/FastBasketBot.mq5'
$eaValue = Read-Utf8 $eaPath
$ea = [ref]$eaValue
$oldTelemetry = @'
      string marketSessionState = MarketSessionStateNow();
      string marketSessionDiagnostics = StringFormat(
         ",\"marketSessionState\":\"%s\",\"marketSessionOpen\":%s}}",
         marketSessionState,
         marketSessionState == "OPEN" ? "true" : "false"
      );
'@
$newTelemetry = @'
      string marketSessionState = MarketSessionStateNow();
      MqlTick marketTick;
      bool marketTickReady = SymbolInfoTick(_Symbol, marketTick);
      int marketDigits = SymbolDigitsNow();
      string marketBidText = marketTickReady ? DoubleToString(marketTick.bid, marketDigits) : "0";
      string marketAskText = marketTickReady ? DoubleToString(marketTick.ask, marketDigits) : "0";
      string marketMidText = marketTickReady ? DoubleToString((marketTick.bid + marketTick.ask) * 0.5, marketDigits) : "0";
      string marketSessionDiagnostics = StringFormat(
         ",\"marketSessionState\":\"%s\",\"marketSessionOpen\":%s,\"marketBid\":%s,\"marketAsk\":%s,\"marketMid\":%s}}",
         marketSessionState,
         marketSessionState == "OPEN" ? "true" : "false",
         marketBidText,
         marketAskText,
         marketMidText
      );
'@
Replace-Required $ea $oldTelemetry $newTelemetry 'publish current quote in heartbeat without price history'
Write-Utf8 $eaPath $ea.Value

$testPath = 'tests/live-price-chart-15m-contract.ps1'
$test = @'
$ErrorActionPreference = 'Stop'
$page = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/app/dashboard/page.tsx'))
$ea = [System.IO.File]::ReadAllText((Resolve-Path 'mt5/FastBasketBot.mq5'))

foreach($needle in @(
  'const LIVE_PRICE_WINDOW_MS = 15 * 60 * 1000;',
  'const [livePricePoints, setLivePricePoints]',
  'marketState === "CLOSED"',
  '<LivePriceChart points={livePricePoints}',
  'function LivePriceChart(',
  'window.setInterval(()=>setNowMs(Date.now()),100)',
  'เก็บเฉพาะข้อมูล 15 นาทีล่าสุดในหน้านี้',
  'MARKET CLOSED',
  'LIVE · 15 MIN'
)) {
  if(-not $page.Contains($needle)) { throw "Missing live-price chart contract: $needle" }
}
if($page.Contains('<HourlyWinRateChart points={hourlyWinRate}/>')) { throw 'Historical hourly chart is still rendered' }
if($page.Contains('localStorage.setItem("livePrice')) { throw 'Live price chart must not persist browser history' }
foreach($needle in @('marketBid','marketAsk','marketMid')) {
  if(-not $ea.Contains($needle)) { throw "EA heartbeat quote field missing: $needle" }
}
Write-Host '15-minute in-memory live price chart contract PASS'
'@
[System.IO.File]::WriteAllText((Join-Path (Get-Location) $testPath),$test,[System.Text.UTF8Encoding]::new($false))

Write-Host '15-minute flowing live price chart patch prepared'
