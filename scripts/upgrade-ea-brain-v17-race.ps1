param(
  [Parameter(Mandatory = $false)]
  [string]$EaPath = "mt5\FastBasketBot.mq5",
  [Parameter(Mandatory = $false)]
  [string]$ApiPath = "apps\api\src\bot.controller.ts",
  [Parameter(Mandatory = $false)]
  [string]$WebPath = "apps\web\app\dashboard\page.tsx"
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

# ---------------------------------------------------------------------------
# EA V17: isolated RACE engine. AUTO code path remains intact.
# ---------------------------------------------------------------------------
$ea = Read-Utf8 $EaPath
$eaRef = [ref]$ea

Replace-Required $eaRef '#property version   "1.055"' '#property version   "1.056"' 'EA version 1.056'
Replace-Required $eaRef '#define SCENOVA_EA_VERSION "1.055"' '#define SCENOVA_EA_VERSION "1.056"' 'runtime version 1.056'
Replace-Required $eaRef '#define SCENOVA_PRODUCT_VERSION "2.0.17"' '#define SCENOVA_PRODUCT_VERSION "2.0.18"' 'product version 2.0.18'

$oldInput = @'
input ENUM_ENTRY_MODE InpEntryMode            = ENTRY_AUTO_MOMENTUM;
'@
$newInput = @'
input ENUM_ENTRY_MODE InpEntryMode            = ENTRY_AUTO_MOMENTUM;
// AUTO preserves the normal engine exactly. RACE is an isolated high-speed
// execution mode selected from the web and never changes AUTO entry logic.
input string          InpEngineMode           = "AUTO";
'@
Replace-Required $eaRef $oldInput $newInput 'add engine mode input'

$oldGlobal = @'
ENUM_ENTRY_MODE g_entryMode;
bool   g_adaptiveEngine;
'@
$newGlobal = @'
ENUM_ENTRY_MODE g_entryMode;
string g_engineMode = "AUTO";
int    g_raceDirection = 0;
double g_racePeakProfit = 0.0;
bool   g_raceProfitArmed = false;
bool   g_raceRecoveryWatch = false;
string g_raceState = "IDLE";
datetime g_raceCycleStartedAt = 0;
bool   g_adaptiveEngine;
'@
Replace-Required $eaRef $oldGlobal $newGlobal 'add isolated RACE runtime state'

$oldInit = @'
   g_maxOrdersPerMinute = InpMaxOrdersPerMinute;
   g_entryMode = InpEntryMode;
   g_adaptiveEngine = InpAdaptiveEngine;
'@
$newInit = @'
   g_maxOrdersPerMinute = InpMaxOrdersPerMinute;
   g_entryMode = InpEntryMode;
   g_engineMode = InpEngineMode;
   StringToUpper(g_engineMode);
   if(g_engineMode != "RACE")
      g_engineMode = "AUTO";
   g_adaptiveEngine = InpAdaptiveEngine;
'@
Replace-Required $eaRef $oldInit $newInit 'initialize engine mode without touching AUTO'

$engineSettings = @'
   string requestedEngineMode = JsonString(json, "engineMode", "");
   StringToUpper(requestedEngineMode);
   if(requestedEngineMode == "AUTO" || requestedEngineMode == "RACE")
      g_engineMode = requestedEngineMode;

'@
Insert-BeforeRequired $eaRef '   string mode = JsonString(json, "entryMode", "");' $engineSettings 'requestedEngineMode = JsonString(json, "engineMode"' 'apply engineMode remote setting'

$oldComment = @'
   request.comment = g_tacticalCountertrendActive
      ? "SaaSTactical"
      : "SaaSBasket";
'@
$newComment = @'
   request.comment = g_engineMode == "RACE"
      ? "SaaSRace"
      : (g_tacticalCountertrendActive ? "SaaSTactical" : "SaaSBasket");
'@
Replace-Required $eaRef $oldComment $newComment 'tag RACE positions separately'

$raceBlock = @'
// Brain V17 RACE ------------------------------------------------------------
// RACE is a separate execution engine. AUTO never calls these functions.
// Entry scores, confidence, S/R, pullback and model grades are observation
// only here. The engine chooses a direction from the same live context, then
// fills to the user Max Positions target subject only to operational controls
// and explicit risk/exit protections.
bool RaceModeEnabled()
{
   return g_engineMode == "RACE";
}

bool BasketHasRacePosition()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol ||
         PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;
      if(StringFind(PositionGetString(POSITION_COMMENT), "SaaSRace") >= 0)
         return true;
   }
   return false;
}

void ResetRaceRuntime()
{
   g_raceDirection = 0;
   g_racePeakProfit = 0.0;
   g_raceProfitArmed = false;
   g_raceRecoveryWatch = false;
   g_raceState = "IDLE";
   g_raceCycleStartedAt = 0;
}

int RaceFilledUnits()
{
   double baseVolume = NormalizeTradeVolume(g_lot);
   if(baseVolume <= 0.0)
      return BasketPositionCount();

   double totalVolume = 0.0;
   int positions = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol ||
         PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;
      totalVolume += PositionGetDouble(POSITION_VOLUME);
      positions++;
   }

   int volumeUnits = (int)MathRound(totalVolume / baseVolume);
   return MathMax(positions, MathMax(0, volumeUnits));
}

int RaceAnalysisDirection(double momentum)
{
   // Explicit direction still wins if the user intentionally selected one.
   if(g_entryMode == ENTRY_BUY_ONLY) return 1;
   if(g_entryMode == ENTRY_SELL_ONLY) return -1;

   // Weighted direction selection only; there is deliberately NO minimum score
   // required to trade in RACE mode.
   int bias = 0;
   if(momentum > 0.0) bias += 3;
   else if(momentum < 0.0) bias -= 3;
   bias += g_trendM1 * 2;
   bias += g_trendM5 * 3;
   bias += g_trendM15 * 2;
   bias += g_emaTrendM5 * 2;
   bias += g_emaTrendM15 * 2;
   bias += g_macroTrendDirection * 2;

   if(bias > 0) return 1;
   if(bias < 0) return -1;

   // Tie-break with the latest closed M1 candle. This is market data, not a
   // confidence gate, so RACE still gets a deterministic direction.
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, PERIOD_M1, 1, 1, rates) >= 1)
   {
      if(rates[0].close > rates[0].open) return 1;
      if(rates[0].close < rates[0].open) return -1;
   }
   return 0;
}

double RaceMidProgressPoints(int direction)
{
   MqlTick tick;
   double anchor = BasketAnchorEntryPrice(direction);
   if(anchor <= 0.0 || !SymbolInfoTick(_Symbol, tick))
      return 0.0;
   double mid = (tick.bid + tick.ask) * 0.5;
   return direction > 0
      ? (mid - anchor) / _Point
      : (anchor - mid) / _Point;
}

bool RaceWrongDirectionConfirmed(
   int direction,
   double momentum,
   bool filling,
   string &reasonOut
)
{
   reasonOut = "NONE";
   if(direction == 0)
      return false;

   int opposite = -direction;
   int confirmations = 0;
   if(g_trendM1 == opposite) confirmations += 1;
   if(g_trendM5 == opposite) confirmations += 2;
   if(g_trendM15 == opposite) confirmations += 2;
   if(g_emaTrendM5 == opposite) confirmations += 1;
   if(g_emaTrendM15 == opposite) confirmations += 1;
   if(g_macroTrendDirection == opposite) confirmations += 1;
   if((opposite > 0 && momentum > 0.0) ||
      (opposite < 0 && momentum < 0.0))
      confirmations += 1;

   double atr = MathMax(
      10.0,
      AverageTrueRangePoints(PERIOD_M5, g_atrPeriod)
   );
   double progress = RaceMidProgressPoints(direction);

   // While still racing toward Max Positions, only a strong invalidation may
   // terminate the cycle early. Once full, the exit can react sooner.
   double adverseThreshold = filling ? atr * 0.45 : atr * 0.22;
   int requiredConfirmations = filling ? 6 : 5;
   bool adverse = progress <= -adverseThreshold;
   bool severe = progress <= -atr * (filling ? 0.75 : 0.50);

   if(adverse && confirmations >= requiredConfirmations)
   {
      reasonOut = "RACE_WRONG_DIRECTION_CONFIRMED";
      return true;
   }
   if(severe && confirmations >= MathMax(3, requiredConfirmations - 2))
   {
      reasonOut = "RACE_SEVERE_ADVERSE_REVERSAL";
      return true;
   }
   return false;
}

bool RaceFlowStillRunning(int direction, double momentum)
{
   int aligned = 0;
   if(g_trendM1 == direction) aligned++;
   if(g_trendM5 == direction) aligned++;
   if(g_emaTrendM5 == direction) aligned++;
   if((direction > 0 && momentum > 0.0) ||
      (direction < 0 && momentum < 0.0))
      aligned++;
   return aligned >= 2;
}

double RaceProfitArmMoney(int filledUnits)
{
   // Positive floating P/L already includes spread. This floor simply avoids
   // closing on microscopic noise while still taking profit quickly.
   return MathMax(0.10, MathMin(5.00, filledUnits * 0.02));
}

double RaceGivebackMoney(double peakProfit, double armMoney)
{
   return MathMax(
      0.05,
      MathMin(MathMax(armMoney, 0.10), peakProfit * 0.25)
   );
}

bool RaceCloseCycle(string reason)
{
   g_raceState = "CLOSING";
   g_executionStatus = reason;
   g_lastCloseReason = reason;
   bool closed = CloseAllBasket(reason);
   if(closed)
      ResetTrail();
   return closed;
}

bool ProcessRaceFill(int direction)
{
   if(direction == 0)
      return false;

   int filledUnits = RaceFilledUnits();
   if(filledUnits >= g_maxPositions)
   {
      g_raceState = "FULL";
      g_executionStatus = "RACE_TARGET_FILLED";
      return true;
   }

   if(g_state != STATE_RUNNING || !g_access ||
      (!MQLInfoInteger(MQL_TESTER) && !EntryLeaseValid()))
   {
      g_executionStatus = "RACE_CONTROL_NOT_FRESH";
      return false;
   }
   if(TradePermissionStatus() != "OK")
   {
      g_executionStatus = "RACE_TRADE_PERMISSION";
      return false;
   }
   if(!CanSendOrder())
   {
      g_executionStatus = "RACE_ORDER_RATE_LIMIT";
      return false;
   }
   if(!AdaptiveSpreadAllowed())
   {
      g_executionStatus = g_spreadStatus == "EXTREME"
         ? "RACE_EXTREME_SPREAD" : "RACE_SPREAD_WAIT";
      return false;
   }
   if(!OpenTradingAllowedForDirection(direction))
   {
      g_executionStatus = "RACE_SYMBOL_DIRECTION_BLOCKED";
      return false;
   }

   // RACE uses the user's configured Lot directly. No adaptive score or risk
   // sizing calculation is allowed to reduce the requested fill count.
   g_adaptiveLot = NormalizeTradeVolume(g_lot);
   if(g_adaptiveLot <= 0.0)
   {
      g_executionStatus = "RACE_INVALID_LOT";
      return false;
   }

   g_entryModel = "RACE_ANALYSIS";
   g_entryTrigger = direction > 0 ? "RACE_BUY" : "RACE_SELL";
   g_entryQuality = "RACE";
   g_entryQualityScore = 0.0;
   g_raceDirection = direction;
   if(g_raceCycleStartedAt <= 0)
      g_raceCycleStartedAt = TimeCurrent();

   bool accepted = SendMarketOrder(direction);
   RegisterOrderRequest();
   if(accepted)
   {
      int after = RaceFilledUnits();
      g_raceState = after >= g_maxPositions ? "FULL" : "FILLING";
      g_executionStatus = after >= g_maxPositions
         ? "RACE_TARGET_FILLED"
         : "RACE_FILLING";
      Print(
         "RACE fill accepted direction=",direction,
         " units=",after,
         " target=",g_maxPositions,
         " lot=",DoubleToString(g_adaptiveLot,2)
      );
      return true;
   }

   g_raceState = "FILL_RETRY";
   return false;
}

bool StartRaceCycle(double momentum)
{
   if(!RaceModeEnabled())
      return false;
   if(BasketPositionCount() > 0 || RescuePositionCount() > 0)
      return false;

   ResetRaceRuntime();
   RefreshMarketContext(false);
   int direction = RaceAnalysisDirection(momentum);
   if(direction == 0)
   {
      g_executionStatus = "RACE_WAIT_MARKET_DATA";
      return false;
   }

   g_burstActive = false;
   g_burstNeedsRearm = false;
   g_burstTargetPositions = 0;
   return ProcessRaceFill(direction);
}

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
Insert-BeforeRequired $eaRef 'void OnTick()' $raceBlock 'bool RaceModeEnabled()' 'insert isolated RACE execution engine'

$oldRaceExistingAnchor = @'
   if(count <= 0 && rescueCount > 0)
   {
      RefreshMarketContext(false);
      ManageAdaptiveRescue();
      g_executionStatus = "RESCUE_EXIT";
      return;
   }

   if(count > 0)
   {
'@
$newRaceExistingAnchor = @'
   if(count <= 0 && rescueCount > 0)
   {
      RefreshMarketContext(false);
      ManageAdaptiveRescue();
      g_executionStatus = "RESCUE_EXIT";
      return;
   }

   // Strict mode ownership: a RACE Basket is always managed by RACE until it
   // is flat, even if the web switches back to AUTO mid-cycle. Conversely an
   // AUTO Basket never becomes a RACE Basket just because the setting changed.
   if(count > 0 && BasketHasRacePosition())
   {
      ManageRaceBasket(momentum);
      return;
   }

   if(count > 0)
   {
'@
Replace-Required $eaRef $oldRaceExistingAnchor $newRaceExistingAnchor 'route existing RACE basket away from AUTO management'

$oldRaceStartAnchor = @'
   string permissionStatus = TradePermissionStatus();
   if(permissionStatus != "OK")
   {
      g_executionStatus = permissionStatus;
      return;
   }

   // V16 self-healing: ProcessBurstQueue can abort on a transient lease or
'@
$newRaceStartAnchor = @'
   string permissionStatus = TradePermissionStatus();
   if(permissionStatus != "OK")
   {
      g_executionStatus = permissionStatus;
      return;
   }

   // RACE starts only from a flat account. AUTO below is intentionally left
   // untouched and never evaluates this branch unless engineMode=RACE.
   if(RaceModeEnabled() && count <= 0 && rescueCount <= 0)
   {
      StartRaceCycle(momentum);
      return;
   }

   // V16 self-healing: ProcessBurstQueue can abort on a transient lease or
'@
Replace-Required $eaRef $oldRaceStartAnchor $newRaceStartAnchor 'start RACE only when flat and selected'

Write-Utf8 $EaPath $eaRef.Value

# ---------------------------------------------------------------------------
# API: accept only AUTO/RACE engineMode. Existing entryMode behavior unchanged.
# ---------------------------------------------------------------------------
$api = Read-Utf8 $ApiPath
$apiRef = [ref]$api
$apiEngine = @'
    if (body.engineMode !== undefined) {
      const engineMode = String(body.engineMode || "").toUpperCase();
      if (!["AUTO", "RACE"].includes(engineMode)) {
        throw new BadRequestException("Engine Mode ไม่ถูกต้อง");
      }
      clean.engineMode = engineMode;
    }

'@
Insert-BeforeRequired $apiRef '    if (body.entryMode !== undefined) {' $apiEngine 'body.engineMode !== undefined' 'validate engineMode in API'
Write-Utf8 $ApiPath $apiRef.Value

# ---------------------------------------------------------------------------
# Web: add a fourth, explicit RACE mode card. AUTO remains the default.
# ---------------------------------------------------------------------------
$web = Read-Utf8 $WebPath
$webRef = [ref]$web

$oldDefault = @'
  indicatorV6Mode: "SOFT_WEIGHT",
  entryMode: "AUTO_MOMENTUM"
};
'@
$newDefault = @'
  indicatorV6Mode: "SOFT_WEIGHT",
  engineMode: "AUTO",
  entryMode: "AUTO_MOMENTUM"
};
'@
Replace-Required $webRef $oldDefault $newDefault 'default engineMode AUTO'

$oldModalVars = @'
  const entryMode = String(props.settings?.entryMode || "AUTO_MOMENTUM");
  const profitTargetMode = String(props.settings?.profitTargetMode || "AUTO").toUpperCase();
  const manualSl = Number(props.settings?.manualStopLossPoints || 0);
  const hasManualExit = profitTargetMode === "MANUAL" || manualSl > 0;
  const controlMode = entryMode === "AUTO_MOMENTUM" ? "AUTO" : hasManualExit ? "MANUAL" : "ASSISTED";
'@
$newModalVars = @'
  const entryMode = String(props.settings?.entryMode || "AUTO_MOMENTUM");
  const engineMode = String(props.settings?.engineMode || "AUTO").toUpperCase();
  const profitTargetMode = String(props.settings?.profitTargetMode || "AUTO").toUpperCase();
  const manualSl = Number(props.settings?.manualStopLossPoints || 0);
  const hasManualExit = profitTargetMode === "MANUAL" || manualSl > 0;
  const controlMode = engineMode === "RACE" ? "RACE" : entryMode === "AUTO_MOMENTUM" ? "AUTO" : hasManualExit ? "MANUAL" : "ASSISTED";
'@
Replace-Required $webRef $oldModalVars $newModalVars 'derive explicit RACE control mode'

$oldModeCopy = @'
  const modeCopy:Record<string,{title:string;subtitle:string}> = {
    AUTO:{title:"อัตโนมัติ",subtitle:"EA เลือกทิศทาง จุดเข้า และจังหวะปิด"},
    ASSISTED:{title:"ช่วยตัดสินใจ",subtitle:"คุณกำหนดฝั่ง EA เลือกจุดเข้าและทางออก"},
    MANUAL:{title:"กำหนดเอง",subtitle:"คุณกำหนดฝั่ง จำนวน Lot เป้ากำไร และ SL"}
  };
'@
$newModeCopy = @'
  const modeCopy:Record<string,{title:string;subtitle:string}> = {
    AUTO:{title:"อัตโนมัติ",subtitle:"EA เลือกทิศทาง จุดเข้า และจังหวะปิดตามระบบปกติ"},
    RACE:{title:"โหมดซิ่ง",subtitle:"เปิดให้ครบ Max Positions แบบไม่ใช้คะแนนกั้น แล้วบริหารกำไร/การโดนลากแยกจาก AUTO"},
    ASSISTED:{title:"ช่วยตัดสินใจ",subtitle:"คุณกำหนดฝั่ง EA เลือกจุดเข้าและทางออก"},
    MANUAL:{title:"กำหนดเอง",subtitle:"คุณกำหนดฝั่ง จำนวน Lot เป้ากำไร และ SL"}
  };
'@
Replace-Required $webRef $oldModeCopy $newModeCopy 'add RACE mode copy'

$oldApply = @'
  const applyControlMode = (mode:string) => {
    const fixedDirection = entryMode === "SELL_ONLY" ? "SELL_ONLY" : "BUY_ONLY";
    props.onEdit?.("confidenceGateEnabled",false);
    if (mode === "AUTO") {
'@
$newApply = @'
  const applyControlMode = (mode:string) => {
    const fixedDirection = entryMode === "SELL_ONLY" ? "SELL_ONLY" : "BUY_ONLY";
    props.onEdit?.("confidenceGateEnabled",false);
    if (mode === "RACE") {
      props.onEdit?.("engineMode","RACE");
      props.onEdit?.("entryMode","AUTO_MOMENTUM");
      props.onEdit?.("profitTargetMode","AUTO");
      props.onEdit?.("manualStopLossPoints",0);
      return;
    }
    props.onEdit?.("engineMode","AUTO");
    if (mode === "AUTO") {
'@
Replace-Required $webRef $oldApply $newApply 'isolate RACE setting from AUTO/assisted/manual'

$oldCards = @'
                {id:"AUTO",icon:"brain",tag:"แนะนำ"},
                {id:"ASSISTED",icon:"target",tag:"กึ่งอัตโนมัติ"},
                {id:"MANUAL",icon:"settings",tag:"ควบคุมละเอียด"}
'@
$newCards = @'
                {id:"AUTO",icon:"brain",tag:"แนะนำ"},
                {id:"RACE",icon:"status",tag:"เร็วสุด"},
                {id:"ASSISTED",icon:"target",tag:"กึ่งอัตโนมัติ"},
                {id:"MANUAL",icon:"settings",tag:"ควบคุมละเอียด"}
'@
Replace-Required $webRef $oldCards $newCards 'show RACE mode card'

$oldHero = '<span>{settings.entryMode === "AUTO_MOMENTUM" ? "AUTO SMART" : settings.entryMode}</span>'
$newHero = '<span>{String(settings.engineMode || "AUTO").toUpperCase() === "RACE" ? "RACE" : settings.entryMode === "AUTO_MOMENTUM" ? "AUTO SMART" : settings.entryMode}</span>'
Replace-Required $webRef $oldHero $newHero 'show RACE chip in dashboard hero'

Write-Utf8 $WebPath $webRef.Value

Write-Host "Brain V17 isolated RACE mode patch complete"
