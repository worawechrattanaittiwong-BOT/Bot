param(
  [Parameter(Mandatory = $false)]
  [string]$EaPath = "mt5\FastBasketBot.mq5"
)

$ErrorActionPreference = "Stop"

function Read-Utf8([string]$path) {
  if (-not (Test-Path $path)) { throw "File not found: $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
}

function Write-Utf8([string]$path, [string]$text) {
  [System.IO.File]::WriteAllText((Resolve-Path $path), $text, [System.Text.UTF8Encoding]::new($false))
}

function Replace-Required([ref]$textRef, [string]$old, [string]$new, [string]$label) {
  if ($textRef.Value.Contains($new)) {
    Write-Host "$label already applied"
    return
  }
  if (-not $textRef.Value.Contains($old)) { throw "Patch anchor not found: $label" }
  $textRef.Value = $textRef.Value.Replace($old, $new)
  Write-Host "Applied $label"
}

function Insert-BeforeRequired([ref]$textRef, [string]$anchor, [string]$block, [string]$sentinel, [string]$label) {
  if ($textRef.Value.Contains($sentinel)) {
    Write-Host "$label already applied"
    return
  }
  $index = $textRef.Value.IndexOf($anchor, [System.StringComparison]::Ordinal)
  if ($index -lt 0) { throw "Patch anchor not found: $label" }
  $textRef.Value = $textRef.Value.Insert($index, $block + "`r`n`r`n")
  Write-Host "Applied $label"
}

$ea = Read-Utf8 $EaPath
$eaRef = [ref]$ea

Replace-Required $eaRef '#property version   "1.056"' '#property version   "1.057"' 'EA version 1.057'
Replace-Required $eaRef '#define SCENOVA_EA_VERSION "1.056"' '#define SCENOVA_EA_VERSION "1.057"' 'runtime version 1.057'
Replace-Required $eaRef '#define SCENOVA_PRODUCT_VERSION "2.0.18"' '#define SCENOVA_PRODUCT_VERSION "2.0.19"' 'product version 2.0.19'

$harvestBlock = @'
// Brain V18 RACE profit harvest --------------------------------------------
// RACE only: close every profitable RACE ticket continuously. AUTO never
// calls this function. On hedging accounts each blue ticket is closed in full;
// on netting accounts one configured-lot unit is realized per pass because MT5
// exposes only one aggregate position per symbol.
int RaceHarvestProfitablePositions()
{
   int harvested = 0;
   bool hedging = ((ENUM_ACCOUNT_MARGIN_MODE)AccountInfoInteger(ACCOUNT_MARGIN_MODE) ==
                   ACCOUNT_MARGIN_MODE_RETAIL_HEDGING);
   double baseVolume = NormalizeTradeVolume(g_lot);

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol ||
         PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;
      if(StringFind(PositionGetString(POSITION_COMMENT), "SaaSRace") < 0)
         continue;

      double netFloating = PositionGetDouble(POSITION_PROFIT) +
                           PositionGetDouble(POSITION_SWAP);
      if(netFloating <= 0.0)
         continue;

      double positionVolume = PositionGetDouble(POSITION_VOLUME);
      double closeVolume = hedging
         ? positionVolume
         : MathMin(positionVolume, baseVolume);
      if(closeVolume <= 0.0)
         continue;

      if(ClosePositionVolumeByTicket(ticket, closeVolume, "SCNRaceProfit"))
      {
         harvested++;
         g_executionStatus = "RACE_PROFIT_HARVEST";
         g_lastCloseReason = "RACE_PROFIT_HARVEST";
         Print(
            "RACE profit harvest ticket=",ticket,
            " profit=",DoubleToString(netFloating,2),
            " closeVolume=",DoubleToString(closeVolume,2)
         );

         // A netting account has one aggregate position. Realize one unit and
         // let the next tick harvest/refill again instead of flattening the
         // whole aggregate position in one request.
         if(!hedging)
            break;
      }
   }

   return harvested;
}
'@
Insert-BeforeRequired $eaRef 'bool RaceCloseCycle(string reason)' $harvestBlock 'int RaceHarvestProfitablePositions()' 'insert RACE profit harvester'

$oldManage = @'
bool ManageRaceBasket(double momentum)
{
   int positions = BasketPositionCount();
   if(positions <= 0)
   {
      ResetRaceRuntime();
      return false;
   }

   if(g_raceState == "CLOSING")
   {
      CloseAllBasket("RACE_CLOSE_RETRY");
      return true;
   }

   RefreshMarketContext(false);
   int direction = BasketDirection();
   if(direction == 0)
   {
      g_raceState = "MIXED_BASKET";
      g_executionStatus = "RACE_MIXED_BASKET";
      return true;
   }
   g_raceDirection = direction;

   int filledUnits = RaceFilledUnits();
   bool filling = filledUnits < g_maxPositions;
   double cycleProfit = BasketCycleProfit();

   // Explicit user loss control remains a hard safety boundary in every mode.
   double lossLimit = EffectiveBasketLossLimit();
   if(lossLimit > 0.0 && cycleProfit <= -lossLimit)
   {
      RaceCloseCycle("RACE_MAX_BASKET_LOSS");
      return true;
   }

   string wrongReason = "NONE";
   if(RaceWrongDirectionConfirmed(direction,momentum,filling,wrongReason))
   {
      RaceCloseCycle(wrongReason);
      return true;
   }

   // Max Positions means the requested target in RACE mode. Until full, no
   // profit score/quality/location logic is allowed to stop additional entries.
   if(filling)
   {
      if(cycleProfit < 0.0)
         g_raceRecoveryWatch = true;
      g_raceState = "FILLING";
      ProcessRaceFill(direction);
      return true;
   }

   double armMoney = RaceProfitArmMoney(filledUnits);

   // If a dragged cycle was judged recoverable, take the recovered profit
   // quickly instead of trying to turn it into a long runner.
   if(g_raceRecoveryWatch)
   {
      double recoveryCloseMoney = MathMax(0.02, armMoney * 0.25);
      if(cycleProfit >= recoveryCloseMoney)
      {
         RaceCloseCycle("RACE_RECOVERY_PROFIT");
         return true;
      }
      g_raceState = "RECOVERY_WAIT";
      g_executionStatus = "RACE_RECOVERY_WAIT";
      return true;
   }

   if(cycleProfit >= armMoney)
   {
      bool flowing = RaceFlowStillRunning(direction,momentum);

      // Profit arrived but flow is no longer extending: bank it immediately.
      if(!flowing && !g_raceProfitArmed)
      {
         RaceCloseCycle("RACE_QUICK_PROFIT");
         return true;
      }

      if(!g_raceProfitArmed)
      {
         g_raceProfitArmed = true;
         g_racePeakProfit = cycleProfit;
      }
      if(cycleProfit > g_racePeakProfit)
         g_racePeakProfit = cycleProfit;

      double giveback = RaceGivebackMoney(g_racePeakProfit, armMoney);
      if(cycleProfit <= g_racePeakProfit - giveback)
      {
         RaceCloseCycle("RACE_PROFIT_GIVEBACK");
         return true;
      }

      if(!flowing && cycleProfit > 0.0)
      {
         RaceCloseCycle("RACE_FLOW_ENDED_PROFIT");
         return true;
      }

      g_raceState = "PROFIT_RUN";
      g_executionStatus = "RACE_PROFIT_RUN";
      return true;
   }

   if(cycleProfit < 0.0)
   {
      g_raceRecoveryWatch = true;
      g_raceState = "RECOVERY_WAIT";
      g_executionStatus = "RACE_RECOVERY_WAIT";
      return true;
   }

   g_raceState = "FULL_WAIT_PROFIT";
   g_executionStatus = "RACE_FULL_WAIT_PROFIT";
   return true;
}
'@

$newManage = @'
bool ManageRaceBasket(double momentum)
{
   int positions = BasketPositionCount();
   if(positions <= 0)
   {
      ResetRaceRuntime();
      return false;
   }

   if(g_raceState == "CLOSING")
   {
      CloseAllBasket("RACE_CLOSE_RETRY");
      return true;
   }

   RefreshMarketContext(false);
   int direction = BasketDirection();
   if(direction == 0)
   {
      g_raceState = "MIXED_BASKET";
      g_executionStatus = "RACE_MIXED_BASKET";
      return true;
   }
   g_raceDirection = direction;

   // V18: harvest blue RACE positions first, before any Basket-level profit
   // logic. Realized winners are then replenished back toward Max Positions.
   // This path is RACE-only and never changes AUTO position management.
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

   int filledUnits = RaceFilledUnits();
   bool filling = filledUnits < g_maxPositions;
   double floatingProfit = BasketProfit();
   double cycleProfit = BasketCycleProfit();

   // Explicit user loss control remains a hard safety boundary in every mode.
   double lossLimit = EffectiveBasketLossLimit();
   if(lossLimit > 0.0 && cycleProfit <= -lossLimit)
   {
      RaceCloseCycle("RACE_MAX_BASKET_LOSS");
      return true;
   }

   string wrongReason = "NONE";
   if(RaceWrongDirectionConfirmed(direction,momentum,filling,wrongReason))
   {
      RaceCloseCycle(wrongReason);
      return true;
   }

   // Max Positions means the requested target in RACE mode. Until full, no
   // profit score/quality/location logic is allowed to stop additional entries.
   if(filling)
   {
      if(floatingProfit < 0.0)
         g_raceRecoveryWatch = true;
      g_raceState = "FILLING";
      ProcessRaceFill(direction);
      return true;
   }

   double armMoney = RaceProfitArmMoney(filledUnits);

   // If a dragged cycle was judged recoverable, take the recovered NET cycle
   // profit quickly. Harvested winners count toward that recovery on purpose.
   if(g_raceRecoveryWatch)
   {
      double recoveryCloseMoney = MathMax(0.02, armMoney * 0.25);
      if(cycleProfit >= recoveryCloseMoney)
      {
         RaceCloseCycle("RACE_RECOVERY_PROFIT");
         return true;
      }
      g_raceState = "RECOVERY_WAIT";
      g_executionStatus = "RACE_RECOVERY_WAIT";
      return true;
   }

   // Normal RACE profit-run logic now looks only at the still-open Basket.
   // Realized harvested winners must not accidentally trigger a full-cycle
   // close immediately after an individual blue ticket was banked.
   if(floatingProfit >= armMoney)
   {
      bool flowing = RaceFlowStillRunning(direction,momentum);

      if(!flowing && !g_raceProfitArmed)
      {
         RaceCloseCycle("RACE_QUICK_PROFIT");
         return true;
      }

      if(!g_raceProfitArmed)
      {
         g_raceProfitArmed = true;
         g_racePeakProfit = floatingProfit;
      }
      if(floatingProfit > g_racePeakProfit)
         g_racePeakProfit = floatingProfit;

      double giveback = RaceGivebackMoney(g_racePeakProfit, armMoney);
      if(floatingProfit <= g_racePeakProfit - giveback)
      {
         RaceCloseCycle("RACE_PROFIT_GIVEBACK");
         return true;
      }

      if(!flowing && floatingProfit > 0.0)
      {
         RaceCloseCycle("RACE_FLOW_ENDED_PROFIT");
         return true;
      }

      g_raceState = "PROFIT_RUN";
      g_executionStatus = "RACE_PROFIT_RUN";
      return true;
   }

   if(floatingProfit < 0.0)
   {
      g_raceRecoveryWatch = true;
      g_raceState = "RECOVERY_WAIT";
      g_executionStatus = "RACE_RECOVERY_WAIT";
      return true;
   }

   g_raceState = "FULL_WAIT_PROFIT";
   g_executionStatus = "RACE_FULL_WAIT_PROFIT";
   return true;
}
'@

Replace-Required $eaRef $oldManage $newManage 'replace RACE manager with continuous profit harvest/refill'

Write-Utf8 $EaPath $eaRef.Value

$final = Read-Utf8 $EaPath
foreach ($sentinel in @(
  '#property version   "1.057"',
  '#define SCENOVA_PRODUCT_VERSION "2.0.19"',
  'int RaceHarvestProfitablePositions()',
  'RACE_PROFIT_HARVEST',
  'RACE_HARVEST_REFILL',
  'double floatingProfit = BasketProfit();',
  'if(floatingProfit >= armMoney)',
  'if(RaceModeEnabled() && count <= 0 && rescueCount <= 0)',
  'int direction = AdaptiveEntryDirection(momentum);'
)) {
  if (-not $final.Contains($sentinel)) {
    throw "V18 sentinel missing: $sentinel"
  }
}

Write-Host "Brain V18 RACE continuous profit harvest patch complete"
