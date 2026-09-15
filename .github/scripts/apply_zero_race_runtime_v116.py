from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)


def function_span(text: str, signature: str) -> tuple[int, int]:
    start = text.find(signature)
    if start < 0:
        raise SystemExit(f"function not found: {signature}")
    brace = text.find("{", start)
    if brace < 0:
        raise SystemExit(f"opening brace not found: {signature}")
    depth = 0
    for i in range(brace, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return start, i + 1
    raise SystemExit(f"closing brace not found: {signature}")


def replace_function(text: str, signature: str, new_block: str) -> str:
    start, end = function_span(text, signature)
    return text[:start] + new_block.rstrip() + "\n" + text[end:]


ea_path = "mt5/FastBasketBot.mq5"
ea = read(ea_path)

# Promote runtime so every installed 1.0.15 is forced to receive this fix.
for old, new, label in [
    ('#property version   "1.0.15"', '#property version   "1.0.16"', 'property version'),
    ('#define SCENOVA_EA_VERSION "1.0.15"', '#define SCENOVA_EA_VERSION "1.0.16"', 'EA version'),
    ('#define SCENOVA_PRODUCT_VERSION "1.0.15"', '#define SCENOVA_PRODUCT_VERSION "1.0.16"', 'product version'),
]:
    ea = replace_once(ea, old, new, label)

# Broker/feed latency: PRICE_OFF is transient and must be retried in ZERO.
ea = replace_once(
    ea,
    '''      bool retryable=\n         result.retcode==TRADE_RETCODE_INVALID_PRICE ||\n         result.retcode==TRADE_RETCODE_INVALID_STOPS ||\n         result.retcode==TRADE_RETCODE_PRICE_CHANGED ||\n         result.retcode==TRADE_RETCODE_REQUOTE;''',
    '''      bool retryable=\n         result.retcode==TRADE_RETCODE_INVALID_PRICE ||\n         result.retcode==TRADE_RETCODE_INVALID_STOPS ||\n         result.retcode==TRADE_RETCODE_PRICE_CHANGED ||\n         result.retcode==TRADE_RETCODE_PRICE_OFF ||\n         result.retcode==TRADE_RETCODE_REQUOTE;''',
    'ZERO PRICE_OFF retry',
)

helpers = r'''double ZeroGridPendingLevelVolume(bool buySide,int level)
{
   string wanted=ZeroGridComment(buySide,level);
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket)) continue;
      if(OrderGetString(ORDER_SYMBOL)!=_Symbol || OrderGetInteger(ORDER_MAGIC)!=InpMagic) continue;
      if(OrderGetString(ORDER_COMMENT)!=wanted) continue;
      return OrderGetDouble(ORDER_VOLUME_INITIAL);
   }
   return 0.0;
}

bool ZeroGridCancelPendingLevel(bool buySide,int level)
{
   string wanted=ZeroGridComment(buySide,level);
   bool ok=true;
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket)) continue;
      if(OrderGetString(ORDER_SYMBOL)!=_Symbol || OrderGetInteger(ORDER_MAGIC)!=InpMagic) continue;
      if(OrderGetString(ORDER_COMMENT)!=wanted) continue;

      MqlTradeRequest request={};
      MqlTradeResult result={};
      request.action=TRADE_ACTION_REMOVE;
      request.order=ticket;
      request.magic=InpMagic;
      request.symbol=_Symbol;
      ResetLastError();
      bool sent=OrderSend(request,result);
      if(sent && TradeResultAccepted(result))
         RegisterOrderRequest();
      else
         ok=false;
   }
   return ok;
}

bool ZeroGridFlatLevelPairValid(int level)
{
   double expected=NormalizeTradeVolume(ZeroGridEffectiveBaseLot()*level);
   double buyVolume=ZeroGridPendingLevelVolume(true,level);
   double sellVolume=ZeroGridPendingLevelVolume(false,level);
   double volumeStep=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
   double tolerance=MathMax(0.0000001,volumeStep*0.25);
   if(expected<=0.0 || buyVolume<=0.0 || sellVolume<=0.0) return false;
   return MathAbs(buyVolume-sellVolume)<=tolerance &&
          MathAbs(buyVolume-expected)<=tolerance &&
          MathAbs(sellVolume-expected)<=tolerance;
}

'''
needle = "bool ZeroGridEnsureLadder()\n{"
if "bool ZeroGridFlatLevelPairValid(int level)" not in ea:
    if needle not in ea:
        raise SystemExit("ZERO EnsureLadder insertion point missing")
    ea = ea.replace(needle, helpers + needle, 1)

new_ensure = r'''bool ZeroGridEnsureLadder()
{
   if(g_zeroGridCenter<=0.0)
      return false;

   int positions=ZeroGridPositionCount();
   int nettingDirection=ZeroGridAccountIsNetting() ? ZeroGridPositionDirection() : 0;
   int levels=ZeroGridEffectiveLevelsPerSide();
   bool needBuy=nettingDirection>=0;
   bool needSell=nettingDirection<=0;

   // ZERO_PAIR_ATOMIC_V116: while the cycle is flat, BUY and SELL pending
   // orders are allowed to exist only as an exact level pair. The expected
   // volume for both sides is the ZERO base lot multiplied by the same level.
   // If the broker accepts only one side, roll that side back immediately and
   // retry the pair on the next ZERO maintenance pass. Never leave a lopsided
   // BUY/SELL ladder such as 0.06 versus 0.03 while flat.
   if(positions==0 && needBuy && needSell)
   {
      for(int level=1;level<=levels;level++)
      {
         double buyVolume=ZeroGridPendingLevelVolume(true,level);
         double sellVolume=ZeroGridPendingLevelVolume(false,level);
         bool buyExists=buyVolume>0.0;
         bool sellExists=sellVolume>0.0;

         if((buyExists || sellExists) && !ZeroGridFlatLevelPairValid(level))
         {
            if(buyExists) ZeroGridCancelPendingLevel(true,level);
            if(sellExists) ZeroGridCancelPendingLevel(false,level);
            g_executionStatus="ZERO_GRID_PAIR_REPAIR";
            return false;
         }

         if(!buyExists && !sellExists)
         {
            bool buySent=ZeroGridSendPending(true,level);
            bool sellSent=buySent && ZeroGridSendPending(false,level);
            if(!buySent || !sellSent || !ZeroGridFlatLevelPairValid(level))
            {
               if(ZeroGridPendingLevelVolume(true,level)>0.0)
                  ZeroGridCancelPendingLevel(true,level);
               if(ZeroGridPendingLevelVolume(false,level)>0.0)
                  ZeroGridCancelPendingLevel(false,level);
               g_executionStatus="ZERO_GRID_PAIR_ROLLBACK";
               return false;
            }
         }
      }

      // Flat ZERO is READY only when the full configured ladder exists and
      // every level is a valid BUY/SELL pair with equal configured volume.
      if(ZeroGridPendingCount()!=levels*2)
      {
         g_executionStatus="ZERO_GRID_WAIT_FULL_LADDER";
         return false;
      }
      for(int level=1;level<=levels;level++)
      {
         if(!ZeroGridFlatLevelPairValid(level))
         {
            g_executionStatus="ZERO_GRID_WAIT_FULL_LADDER";
            return false;
         }
      }
      return true;
   }

   // Once a level has triggered into a Position, normal ZERO ladder ownership
   // continues. At that point pending counts can differ naturally because one
   // side has become a live Position; this is not a flat-ladder imbalance.
   bool complete=true;
   int attemptsThisPass=0;
   int maxAttemptsPerPass=MathMin(60,levels*2+4);

   if(needBuy && !ZeroGridLevelExists(true,1))
   {
      attemptsThisPass++;
      if(!ZeroGridSendPending(true,1)) complete=false;
   }
   if(needSell && !ZeroGridLevelExists(false,1))
   {
      attemptsThisPass++;
      if(!ZeroGridSendPending(false,1)) complete=false;
   }

   for(int level=2;level<=levels;level++)
   {
      if(needBuy && !ZeroGridLevelExists(true,level))
      {
         attemptsThisPass++;
         if(!ZeroGridSendPending(true,level)) complete=false;
         if(attemptsThisPass>=maxAttemptsPerPass) break;
      }
      if(needSell && !ZeroGridLevelExists(false,level))
      {
         attemptsThisPass++;
         if(!ZeroGridSendPending(false,level)) complete=false;
         if(attemptsThisPass>=maxAttemptsPerPass) break;
      }
   }
   return complete;
}'''
ea = replace_function(ea, "bool ZeroGridEnsureLadder()", new_ensure)

# A new cycle is not READY unless EnsureLadder confirms the whole configured set.
ea = replace_once(
    ea,
    '''   ZeroGridEnsureLadder();\n   if(ZeroGridAccountIsNetting())''',
    '''   bool ladderReady=ZeroGridEnsureLadder();\n   if(!ladderReady) return true;\n   if(ZeroGridAccountIsNetting())''',
    'Start ZERO full ladder gate',
)
# Manage path: do not overwrite pair/build retry status with READY/ACTIVE.
ea = replace_once(
    ea,
    '''   ZeroGridEnsureLadder();\n   if(positions>0)''',
    '''   bool ladderReady=ZeroGridEnsureLadder();\n   if(!ladderReady) return true;\n   if(positions>0)''',
    'Manage ZERO full ladder gate',
)

# Async-close race fix: a flat ZERO cycle still belongs to ManageZeroGrid while
# closing=true, even after the broker has already removed every Position/Order.
ea = replace_once(
    ea,
    '''   if(ZeroGridPositionCount()>0 || ZeroGridPendingCount()>0)\n   {\n      ManageZeroGrid();\n      return;\n   }''',
    '''   if(g_zeroGridClosing || ZeroGridPositionCount()>0 || ZeroGridPendingCount()>0)\n   {\n      ManageZeroGrid();\n      return;\n   }''',
    'OnTick ZERO async close ownership',
)

# Reset the close burst timer with the cycle so an immediate next cycle is clean.
ea = replace_once(
    ea,
    '''   g_zeroGridCycleStartedAt=0;\n   g_zeroGridClosing=false;\n   g_zeroGridCycleStepPrice=0.0;''',
    '''   g_zeroGridCycleStartedAt=0;\n   g_zeroGridClosing=false;\n   g_zeroGridLastExitBurstMs=0;\n   g_zeroGridCycleStepPrice=0.0;''',
    'ZERO close burst reset',
)

# Timer maintenance removes dependence on the next market tick after async close
# and keeps retrying an incomplete flat pair until the full configured ladder exists.
ea = replace_once(
    ea,
    '''   FlushPendingBasketJournal();\n   if(LegacyBasketEngineEnabled())''',
    '''   FlushPendingBasketJournal();\n\n   // ZERO_GRID_TIMER_MAINTENANCE_V116: ZERO is isolated from AUTO/RACE and may\n   // finalize an async close or finish/retry its exact paired ladder from the\n   // 200ms timer instead of waiting for another market tick.\n   bool zeroTimerOwnsRuntime =\n      g_zeroGridClosing ||\n      ZeroGridPositionCount()>0 ||\n      ZeroGridPendingCount()>0 ||\n      (ZeroGridModeEnabled() && BasketPositionCount()<=0 && RescuePositionCount()<=0);\n   if(g_settingsSynchronized && zeroTimerOwnsRuntime)\n   {\n      if(g_zeroGridClosing ||\n         (ZeroGridModeEnabled() && g_state==STATE_RUNNING && g_access && TradePermissionStatus()=="OK"))\n         ManageZeroGrid();\n   }\n\n   if(LegacyBasketEngineEnabled())''',
    'ZERO timer maintenance',
)

# RACE: harvest profitable tickets before the Max Positions fill gate. A winner
# must not remain open merely because the requested basket is still filling.
old_race = r'''   // Max Positions means the requested target in RACE mode. Until full, no
   // profit score/quality/location logic is allowed to stop additional entries.
   if(filling)
   {
      if(floatingProfit < 0.0)
         g_raceRecoveryWatch = true;
      g_raceState = "FILLING";
      ProcessRaceFill(direction);
      return true;
   }

   // Stability: complete the requested RACE fill first. Harvesting starts
   // only after Max Positions is reached, preventing open/close/refill churn
   // while the Basket is still being built. Entry/exit signals are unchanged.
   int harvested = RaceHarvestProfitablePositions();
   if(harvested > 0)
   {
      g_raceProfitArmed = false;
      g_racePeakProfit = 0.0;

      int remainingPositions = BasketPositionCount();
      if(remainingPositions <= 0)
      {
         ResetRaceRuntime();
         g_executionStatus = "RACE_PROFIT_HARVEST_FLAT";
         return true;
      }

      int remainingUnits = RaceFilledUnits();
      if(remainingUnits < g_maxPositions)
      {
         g_raceState = "HARVEST_REFILL";
         g_executionStatus = "RACE_HARVEST_REFILL";
         ProcessRaceFill(direction);
         return true;
      }
   }
'''
new_race = r'''   // RACE_PROFIT_FIRST_V116: profitable RACE tickets are harvested before
   // the Max Positions fill gate. Profit exit is never delayed just because the
   // basket is still building. Refill, if needed, happens on a later pass.
   int harvested = RaceHarvestProfitablePositions();
   if(harvested > 0)
   {
      g_raceProfitArmed = false;
      g_racePeakProfit = 0.0;

      if(BasketPositionCount() <= 0)
      {
         ResetRaceRuntime();
         g_executionStatus = "RACE_PROFIT_HARVEST_FLAT";
         return true;
      }

      g_raceState = "HARVESTED_PROFIT";
      g_executionStatus = "RACE_PROFIT_HARVEST";
      return true;
   }

   // Max Positions remains the requested RACE fill target, but it can no longer
   // block an already-profitable ticket from being banked first.
   if(filling)
   {
      if(floatingProfit < 0.0)
         g_raceRecoveryWatch = true;
      g_raceState = "FILLING";
      ProcessRaceFill(direction);
      return true;
   }
'''
ea = replace_once(ea, old_race, new_race, 'RACE profit-before-fill')

# Safety assertions: AUTO ownership remains untouched; ZERO and RACE markers
# must be present and ZERO's flat ladder must be strict pair-by-pair.
for required in [
    'ZERO_PAIR_ATOMIC_V116',
    'ZERO_GRID_PAIR_ROLLBACK',
    'ZERO_GRID_WAIT_FULL_LADDER',
    'ZERO_GRID_TIMER_MAINTENANCE_V116',
    'if(g_zeroGridClosing || ZeroGridPositionCount()>0 || ZeroGridPendingCount()>0)',
    'RACE_PROFIT_FIRST_V116',
    'result.retcode==TRADE_RETCODE_PRICE_OFF',
]:
    if required not in ea:
        raise SystemExit(f"required runtime marker missing: {required}")
if 'bool AutoV20ManageOpenBasket(double momentum)' not in ea:
    raise SystemExit('AUTO V20 runtime unexpectedly missing')

write(ea_path, ea)

release_path = "apps/api/src/release-version.ts"
release = read(release_path)
release = replace_once(
    release,
    'export const DEFAULT_EA_VERSION = "1.0.15";',
    'export const DEFAULT_EA_VERSION = "1.0.16";',
    'API EA version',
)
write(release_path, release)

close_test_path = "tests/zero-grid-close-geometry-contract.ps1"
close_test = read(close_test_path)
close_test = replace_once(
    close_test,
    'Require-Contains $ea \'#property version   "1.0.15"\' \'EA version bump\'',
    'Require-Contains $ea \'#property version   "1.0.16"\' \'EA version bump\'',
    'ZERO close test version',
)
write(close_test_path, close_test)

contract = r'''param(
  [Parameter(Mandatory = $false)][string]$EaPath = "mt5\\FastBasketBot.mq5"
)
$ErrorActionPreference = "Stop"
$ea = [System.IO.File]::ReadAllText((Resolve-Path $EaPath))

function Block([string]$sig) {
  $s=$ea.IndexOf($sig); if($s -lt 0){throw "Missing $sig"}
  $b=$ea.IndexOf("{",$s); $d=0
  for($i=$b;$i -lt $ea.Length;$i++){
    if($ea[$i] -eq "{"){$d++}
    elseif($ea[$i] -eq "}"){$d--; if($d -eq 0){return $ea.Substring($s,$i-$s+1)}}
  }
  throw "Unclosed $sig"
}

$zero=Block "bool ZeroGridEnsureLadder()"
$start=Block "bool StartZeroGridCycle()"
$manage=Block "bool ManageZeroGrid()"
$onTick=Block "void OnTick()"
$onTimer=Block "void OnTimer()"
$race=Block "bool ManageRaceBasket(double momentum)"

if(-not $zero.Contains("ZERO_PAIR_ATOMIC_V116")){throw "ZERO atomic pair marker missing"}
if(-not $zero.Contains("ZeroGridFlatLevelPairValid(level)")){throw "ZERO pair validation missing"}
if(-not $zero.Contains("ZERO_GRID_PAIR_ROLLBACK")){throw "ZERO pair rollback missing"}
if(-not $zero.Contains("ZeroGridPendingCount()!=levels*2")){throw "ZERO full configured ladder check missing"}
if(-not $start.Contains("bool ladderReady=ZeroGridEnsureLadder();")){throw "ZERO Start must require complete ladder"}
if(-not $manage.Contains("bool ladderReady=ZeroGridEnsureLadder();")){throw "ZERO Manage must preserve build/retry status"}
if(-not $onTick.Contains("g_zeroGridClosing || ZeroGridPositionCount()>0 || ZeroGridPendingCount()>0")){throw "ZERO async close finalization ownership missing"}
if(-not $onTimer.Contains("ZERO_GRID_TIMER_MAINTENANCE_V116")){throw "ZERO timer maintenance missing"}
if(-not $ea.Contains("g_zeroGridLastExitBurstMs=0;")){throw "ZERO burst reset missing"}
if(-not $ea.Contains("TRADE_RETCODE_PRICE_OFF")){throw "ZERO PRICE_OFF retry missing"}

$h=$race.IndexOf("RaceHarvestProfitablePositions()")
$f=$race.IndexOf("if(filling)")
if($h -lt 0 -or $f -lt 0 -or $h -gt $f){throw "RACE profit harvest must happen before fill gate"}
if($race.Contains("Harvesting starts only after Max Positions is reached")){throw "obsolete RACE profit delay still present"}
if(-not $race.Contains("RACE_PROFIT_FIRST_V116")){throw "RACE v1.0.16 marker missing"}
if(-not $ea.Contains('EffectiveExecutionMode() == "AUTO"')){throw "AUTO isolation unexpectedly changed"}

Write-Host "ZERO paired full ladder + async rearm + RACE profit-first contract: PASS"
'''
write("tests/zero-race-runtime-v116-contract.ps1", contract)
