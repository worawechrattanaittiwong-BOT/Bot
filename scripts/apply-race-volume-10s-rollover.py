from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
EA = ROOT / "mt5/FastBasketBot.mq5"
RELEASE = ROOT / "apps/api/src/release-version.ts"
ZERO_CONTRACT = ROOT / "tests/zero-grid-runtime-contract.ps1"
CI = ROOT / ".github/workflows/ci.yml"
NEW_TEST = ROOT / "tests/race-volume-rollover-contract.ps1"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if text.count(old) != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {text.count(old)}")
    return text.replace(old, new, 1)


def block_span(text: str, signature: str):
    start = text.find(signature)
    if start < 0:
        raise RuntimeError(f"missing function: {signature}")
    brace = text.find("{", start)
    if brace < 0:
        raise RuntimeError(f"missing opening brace: {signature}")
    depth = 0
    for i in range(brace, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return start, i + 1
    raise RuntimeError(f"unclosed function: {signature}")


def replace_function(text: str, signature: str, new_block: str) -> str:
    start, end = block_span(text, signature)
    return text[:start] + new_block.rstrip() + text[end:]


ea = EA.read_text(encoding="utf-8")

ea = replace_once(ea, '#property version   "1.0.22"', '#property version   "1.0.23"', "EA property version")
ea = replace_once(ea, '#define SCENOVA_EA_VERSION "1.0.22"', '#define SCENOVA_EA_VERSION "1.0.23"', "EA version define")
ea = replace_once(ea, '#define SCENOVA_PRODUCT_VERSION "1.0.22"', '#define SCENOVA_PRODUCT_VERSION "1.0.23"', "product version define")
ea = replace_once(ea, '#define SCENOVA_RUNTIME_CONTRACT "ZERO_GRID_LOW_VOLATILITY_V2"', '#define SCENOVA_RUNTIME_CONTRACT "RACE_VOLUME_10S_ROLLOVER_V1"', "runtime contract")

ea = replace_once(
    ea,
    'input double          InpRaceCloseAllProfitMoney = 0.50;\n// ZERO GRID is isolated from AUTO/RACE and requires an MT5 Hedging account.',
    'input double          InpRaceCloseAllProfitMoney = 0.50;\n#define RACE_VOLUME_WINDOW_SECONDS 10\n// ZERO GRID is isolated from AUTO/RACE and requires an MT5 Hedging account.',
    "RACE volume window constant",
)

ea = replace_once(
    ea,
    'bool   g_raceCloseAllProfitEnabled = true;\ndouble g_raceCloseAllProfitMoney = 0.50;\nbool   g_adaptiveEngine;',
    '''bool   g_raceCloseAllProfitEnabled = true;
double g_raceCloseAllProfitMoney = 0.50;
// RACE uses a rolling 10-second order-flow window. Exchange/deal-side flags
// are used when the broker publishes them; quote-only symbols fall back to
// uptick/downtick tick-volume counts. No trend/EMA/timeframe signal decides side.
datetime g_raceVolumeBucketSecond[RACE_VOLUME_WINDOW_SECONDS];
double   g_raceVolumeBucketBuy[RACE_VOLUME_WINDOW_SECONDS];
double   g_raceVolumeBucketSell[RACE_VOLUME_WINDOW_SECONDS];
int      g_raceVolumeBucketSamples[RACE_VOLUME_WINDOW_SECONDS];
datetime g_raceVolumeWarmupStartedAt = 0;
datetime g_raceVolumeLastSampleAt = 0;
double   g_raceVolumeLastMid = 0.0;
bool   g_adaptiveEngine;''',
    "RACE volume globals",
)

volume_helpers = r'''
void RaceResetVolumeWindow(datetime now)
{
   for(int i=0;i<RACE_VOLUME_WINDOW_SECONDS;i++)
   {
      g_raceVolumeBucketSecond[i]=0;
      g_raceVolumeBucketBuy[i]=0.0;
      g_raceVolumeBucketSell[i]=0.0;
      g_raceVolumeBucketSamples[i]=0;
   }
   g_raceVolumeWarmupStartedAt=now;
   g_raceVolumeLastSampleAt=0;
   g_raceVolumeLastMid=0.0;
}

void RaceSampleVolumePressure()
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return;

   datetime now=(tick.time>0 ? (datetime)tick.time : TimeCurrent());
   if(now<=0)
      return;

   if(g_raceVolumeWarmupStartedAt<=0 ||
      (g_raceVolumeLastSampleAt>0 && now-g_raceVolumeLastSampleAt>RACE_VOLUME_WINDOW_SECONDS))
      RaceResetVolumeWindow(now);

   int slot=(int)((long)now % RACE_VOLUME_WINDOW_SECONDS);
   if(g_raceVolumeBucketSecond[slot]!=now)
   {
      g_raceVolumeBucketSecond[slot]=now;
      g_raceVolumeBucketBuy[slot]=0.0;
      g_raceVolumeBucketSell[slot]=0.0;
      g_raceVolumeBucketSamples[slot]=0;
   }

   double mid=(tick.bid+tick.ask)*0.5;
   int side=0;
   double weight=1.0;
   bool flaggedBuy=((tick.flags & TICK_FLAG_BUY)!=0);
   bool flaggedSell=((tick.flags & TICK_FLAG_SELL)!=0);

   // Prefer real deal-side volume when the broker publishes it. Most OTC FX/
   // metal feeds expose quote ticks instead, so classify those by uptick/down-
   // tick and count one unit of tick volume per directional price update.
   if(flaggedBuy!=flaggedSell)
   {
      side=flaggedBuy ? 1 : -1;
      double reported=(tick.volume_real>0.0 ? tick.volume_real : (double)tick.volume);
      if(reported>0.0)
         weight=reported;
   }
   else if(g_raceVolumeLastMid>0.0)
   {
      double epsilon=MathMax(_Point*0.05,0.00000001);
      if(mid>g_raceVolumeLastMid+epsilon) side=1;
      else if(mid<g_raceVolumeLastMid-epsilon) side=-1;
   }

   if(side>0)
   {
      g_raceVolumeBucketBuy[slot]+=weight;
      g_raceVolumeBucketSamples[slot]++;
   }
   else if(side<0)
   {
      g_raceVolumeBucketSell[slot]+=weight;
      g_raceVolumeBucketSamples[slot]++;
   }

   g_raceVolumeLastMid=mid;
   g_raceVolumeLastSampleAt=now;
}

void RaceVolumeSnapshot(double &buyPressure,double &sellPressure,int &samples)
{
   buyPressure=0.0;
   sellPressure=0.0;
   samples=0;
   datetime now=TimeCurrent();
   for(int i=0;i<RACE_VOLUME_WINDOW_SECONDS;i++)
   {
      datetime stamp=g_raceVolumeBucketSecond[i];
      if(stamp<=0 || stamp>now || now-stamp>=RACE_VOLUME_WINDOW_SECONDS)
         continue;
      buyPressure+=g_raceVolumeBucketBuy[i];
      sellPressure+=g_raceVolumeBucketSell[i];
      samples+=g_raceVolumeBucketSamples[i];
   }
}

bool RaceVolumeWindowReady()
{
   if(g_raceVolumeWarmupStartedAt<=0 ||
      TimeCurrent()-g_raceVolumeWarmupStartedAt<RACE_VOLUME_WINDOW_SECONDS)
      return false;
   double buyPressure=0.0;
   double sellPressure=0.0;
   int samples=0;
   RaceVolumeSnapshot(buyPressure,sellPressure,samples);
   return samples>0;
}

int RaceVolumeDirection()
{
   if(!RaceVolumeWindowReady())
      return 0;
   double buyPressure=0.0;
   double sellPressure=0.0;
   int samples=0;
   RaceVolumeSnapshot(buyPressure,sellPressure,samples);
   if(samples<=0 || MathAbs(buyPressure-sellPressure)<=0.00000001)
      return 0;
   return buyPressure>sellPressure ? 1 : -1;
}

'''
anchor = "int RaceM5CandleDirection()"
if anchor not in ea:
    raise RuntimeError("missing RaceM5CandleDirection anchor")
ea = ea.replace(anchor, volume_helpers + anchor, 1)

ea = replace_function(
    ea,
    "int RaceAnalysisDirection(double momentum)",
    r'''int RaceAnalysisDirection(double momentum)
{
   // Explicit customer direction remains an override. AUTO RACE ignores
   // trend/EMA/timeframes and follows only the rolling 10-second volume side.
   if(g_entryMode == ENTRY_BUY_ONLY) return 1;
   if(g_entryMode == ENTRY_SELL_ONLY) return -1;
   return RaceVolumeDirection();
}''',
)

ea = replace_function(
    ea,
    "bool RaceFlowStillRunning(int direction, double momentum)",
    r'''bool RaceFlowStillRunning(int direction, double momentum)
{
   // RACE profit-run continuation follows the same 10-second volume majority
   // used for entry. Trend, EMA and candle direction do not participate.
   return RaceVolumeDirection() == direction;
}''',
)

# Per-position RACE harvesting must respect the configured per-position money
# target when the user selected that exit style. Other RACE profiles keep the
# existing positive-ticket harvest fallback.
h_start, h_end = block_span(ea, "int RaceHarvestProfitablePositions()")
harvest = ea[h_start:h_end]
harvest = replace_once(
    harvest,
    "   double baseVolume = NormalizeTradeVolume(g_lot);\n\n   for(int i = PositionsTotal() - 1; i >= 0; i--)",
    '''   double baseVolume = NormalizeTradeVolume(g_lot);
   double perPositionTarget =
      (g_profitTargetMode == "MANUAL" && g_perPositionProfit > 0.0)
      ? g_perPositionProfit
      : 0.0;

   for(int i = PositionsTotal() - 1; i >= 0; i--)''',
    "RACE per-position target declaration",
)
harvest = replace_once(
    harvest,
    "      if(netFloating <= 0.0)\n         continue;",
    '''      if(perPositionTarget > 0.0)
      {
         if(netFloating + 0.00000001 < perPositionTarget)
            continue;
      }
      else if(netFloating <= 0.0)
         continue;''',
    "RACE per-position target check",
)
ea = ea[:h_start] + harvest + ea[h_end:]

# Start a RACE cycle only after a complete 10-second volume window exists.
s_start, s_end = block_span(ea, "bool StartRaceCycle(double momentum)")
start_block = ea[s_start:s_end]
start_block = replace_once(
    start_block,
    '''   ResetRaceRuntime();
   RefreshMarketContext(false);
   int direction = RaceAnalysisDirection(momentum);
   if(direction == 0)
   {
      g_executionStatus = "RACE_WAIT_MARKET_DATA";
      return false;
   }''',
    '''   ResetRaceRuntime();
   int direction = RaceAnalysisDirection(momentum);
   if(direction == 0)
   {
      g_executionStatus = RaceVolumeWindowReady()
         ? "RACE_VOLUME_BALANCED"
         : "RACE_VOLUME_WARMUP";
      return false;
   }''',
    "RACE start volume warmup",
)
ea = ea[:s_start] + start_block + ea[s_end:]

# Active RACE cycle: harvest eligible winners first. If the 10-second majority
# flips, stop adding the old side immediately. Close/re-arm only when already
# banked + floating P/L can flatten the old cycle at non-negative net P/L.
m_start, m_end = block_span(ea, "bool ManageRaceBasket(double momentum)")
manage = ea[m_start:m_end]
wrong_pattern = re.compile(
    r'\n\s*string wrongReason = "NONE";\n\s*if\(RaceWrongDirectionConfirmed\(direction,momentum,filling,wrongReason\)\)\n\s*\{\n\s*RaceCloseCycle\(wrongReason\);\n\s*return true;\n\s*\}\n',
    re.M,
)
manage, removed = wrong_pattern.subn("\n", manage, count=1)
if removed != 1:
    raise RuntimeError(f"RACE old M5 reversal block: expected 1, found {removed}")

rollover = r'''
   // RACE_VOLUME_10S_ROLLOVER_V1: direction comes only from the rolling
   // 10-second BUY/SELL pressure window. If pressure flips, never add another
   // order on the stale side. The old cycle is flattened only when its realized
   // + floating net P/L is non-negative; otherwise existing positions keep
   // their normal per-position profit exits and hard loss protection.
   int volumeDirection = RaceAnalysisDirection(momentum);
   if(volumeDirection != 0 && volumeDirection != direction)
   {
      if(cycleProfit >= 0.0)
      {
         RaceCloseCycle("RACE_VOLUME_ROLLOVER");
         return true;
      }
      g_raceRecoveryWatch = true;
      g_raceState = "ROLLOVER_WAIT";
      g_executionStatus = volumeDirection > 0
         ? "RACE_VOLUME_ROLLOVER_WAIT_BUY"
         : "RACE_VOLUME_ROLLOVER_WAIT_SELL";
      return true;
   }
'''
marker = "\n   // Max Positions remains the requested RACE fill target, but it can no longer"
if marker not in manage:
    raise RuntimeError("RACE fill marker missing")
manage = manage.replace(marker, "\n" + rollover.rstrip() + marker, 1)

old_fill = '''   if(filling)
   {
      if(floatingProfit < 0.0)
         g_raceRecoveryWatch = true;
      g_raceState = "FILLING";
      RefreshMarketContext(false);
      ProcessRaceFill(direction);
      return true;
   }'''
new_fill = '''   if(filling)
   {
      if(volumeDirection == 0)
      {
         g_raceState = "VOLUME_WAIT";
         g_executionStatus = RaceVolumeWindowReady()
            ? "RACE_VOLUME_BALANCED"
            : "RACE_VOLUME_WARMUP";
         return true;
      }
      if(floatingProfit < 0.0)
         g_raceRecoveryWatch = true;
      g_raceState = "FILLING";
      RefreshMarketContext(false);
      ProcessRaceFill(direction);
      return true;
   }'''
manage = replace_once(manage, old_fill, new_fill, "RACE fill volume gate")
ea = ea[:m_start] + manage + ea[m_end:]

ea = replace_once(
    ea,
    "void OnTick()\n{\n   SampleSpread();",
    "void OnTick()\n{\n   SampleSpread();\n   RaceSampleVolumePressure();",
    "RACE volume sampling in OnTick",
)

EA.write_text(ea, encoding="utf-8", newline="\n")

release = RELEASE.read_text(encoding="utf-8")
release = replace_once(release, 'DEFAULT_EA_VERSION = "1.0.22"', 'DEFAULT_EA_VERSION = "1.0.23"', "API EA version")
release = replace_once(release, 'EA_RUNTIME_CONTRACT = "ZERO_GRID_LOW_VOLATILITY_V2"', 'EA_RUNTIME_CONTRACT = "RACE_VOLUME_10S_ROLLOVER_V1"', "API runtime contract")
RELEASE.write_text(release, encoding="utf-8", newline="\n")

zero = ZERO_CONTRACT.read_text(encoding="utf-8")
zero = zero.replace('ZERO_GRID_LOW_VOLATILITY_V2', 'RACE_VOLUME_10S_ROLLOVER_V1')
ZERO_CONTRACT.write_text(zero, encoding="utf-8", newline="\n")

NEW_TEST.write_text(r'''$ErrorActionPreference = "Stop"

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
$release = Read-Text 'apps/api/src/release-version.ts'
$analysis = Block $ea 'int RaceAnalysisDirection(double momentum)'
$flow = Block $ea 'bool RaceFlowStillRunning(int direction, double momentum)'
$harvest = Block $ea 'int RaceHarvestProfitablePositions()'
$start = Block $ea 'bool StartRaceCycle(double momentum)'
$manage = Block $ea 'bool ManageRaceBasket(double momentum)'
$onTick = Block $ea 'void OnTick()'

Need $ea '#define RACE_VOLUME_WINDOW_SECONDS 10' 'RACE volume window must be exactly 10 seconds'
Need $ea 'void RaceSampleVolumePressure()' 'RACE volume sampler missing'
Need $ea 'int RaceVolumeDirection()' 'RACE volume direction helper missing'
Need $onTick 'RaceSampleVolumePressure();' 'RACE volume must be sampled on every tick'
Need $analysis 'return RaceVolumeDirection();' 'AUTO RACE direction must use volume only'
if($analysis.Contains('RaceM5CandleDirection()')){throw 'RACE entry must not use M5 candle direction'}
Need $flow 'RaceVolumeDirection() == direction' 'RACE profit flow must follow 10-second volume side'
Need $start 'RACE_VOLUME_WARMUP' 'RACE must wait for 10-second warmup before first AUTO entry'
Need $manage 'RACE_VOLUME_10S_ROLLOVER_V1' 'RACE safe rollover marker missing'
Need $manage 'volumeDirection != direction' 'RACE must detect a volume-side flip'
Need $manage 'cycleProfit >= 0.0' 'RACE rollover must not force-close a negative net cycle'
Need $manage 'RACE_VOLUME_ROLLOVER' 'RACE rollover close reason missing'
Need $manage 'RACE_VOLUME_ROLLOVER_WAIT_BUY' 'RACE BUY rollover wait state missing'
Need $manage 'RACE_VOLUME_ROLLOVER_WAIT_SELL' 'RACE SELL rollover wait state missing'
Need $harvest 'g_perPositionProfit > 0.0' 'RACE per-position exit must honor configured target'
Need $harvest 'netFloating + 0.00000001 < perPositionTarget' 'RACE must wait until each ticket reaches its money target'
Need $ea 'RACE_DIRECTION_LOCK' 'RACE must keep mixed BUY/SELL baskets blocked'
Need $release 'DEFAULT_EA_VERSION = "1.0.23"' 'EA version must be bumped for RACE runtime change'
Need $release 'EA_RUNTIME_CONTRACT = "RACE_VOLUME_10S_ROLLOVER_V1"' 'API runtime contract must match EA'

Write-Host 'RACE 10-second volume + safe rollover contract: PASS'
''', encoding="utf-8", newline="\n")

ci = CI.read_text(encoding="utf-8")
ci = replace_once(
    ci,
    '''      - name: RACE close-all profit contract
        shell: pwsh
        run: ./tests/race-close-all-profit-contract.ps1''',
    '''      - name: RACE close-all profit contract
        shell: pwsh
        run: ./tests/race-close-all-profit-contract.ps1
      - name: RACE 10-second volume and safe rollover contract
        shell: pwsh
        run: ./tests/race-volume-rollover-contract.ps1''',
    "CI RACE volume contract step",
)
CI.write_text(ci, encoding="utf-8", newline="\n")

print("RACE volume rollover patch applied")
