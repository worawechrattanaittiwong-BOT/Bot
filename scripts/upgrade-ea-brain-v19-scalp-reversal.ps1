param(
  [Parameter(Mandatory = $false)]
  [string]$Path = "mt5\FastBasketBot.mq5"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path $Path)) { throw "EA source not found: $Path" }
$text = [System.IO.File]::ReadAllText((Resolve-Path $Path))

function Replace-Required([string]$old, [string]$new, [string]$label) {
  if ($script:text.Contains($new)) {
    Write-Host "$label already applied"
    return
  }
  if (-not $script:text.Contains($old)) { throw "Patch anchor not found: $label" }
  $script:text = $script:text.Replace($old, $new)
  Write-Host "Applied $label"
}

function Insert-BeforeRequired([string]$anchor, [string]$block, [string]$sentinel, [string]$label) {
  if ($script:text.Contains($sentinel)) {
    Write-Host "$label already applied"
    return
  }
  $index = $script:text.IndexOf($anchor, [System.StringComparison]::Ordinal)
  if ($index -lt 0) { throw "Patch anchor not found: $label" }
  $script:text = $script:text.Insert($index, $block + "`r`n`r`n")
  Write-Host "Applied $label"
}

Replace-Required '#property version   "1.057"' '#property version   "1.058"' 'EA version 1.058'
Replace-Required '#define SCENOVA_EA_VERSION "1.057"' '#define SCENOVA_EA_VERSION "1.058"' 'runtime version 1.058'
Replace-Required '#define SCENOVA_PRODUCT_VERSION "2.0.19"' '#define SCENOVA_PRODUCT_VERSION "2.0.20"' 'product version 2.0.20'

$brainV19 = @'
// Brain V19 -----------------------------------------------------------------
// SCALP PULLBACK / REVERSAL policy for AUTO mode.
//
// Product intent:
// - Do NOT chase a falling M1 move with a fresh SELL.
// - Do NOT chase a rising M1 move with a fresh BUY.
// - M5/M15/M30 describe context only; they do not fire the order.
// - M1 is the execution trigger after a pullback/turn.
// - The engine is deliberately permissive after an M1 turn so it can scalp
//   frequently, while avoiding the old trend-following behaviour where a large
//   red candle immediately accumulated SELL weight.
// - Existing SaaS permission, spread, max-position, basket, rescue and stop
//   protections remain unchanged outside this direction selector.

int BrainV19ContextScore(int direction)
{
   if(direction == 0)
      return 0;

   int score = 0;
   if(g_trendM5 == direction) score += 2;
   else if(g_trendM5 == -direction) score -= 2;

   if(g_trendM15 == direction) score += 2;
   else if(g_trendM15 == -direction) score -= 2;

   if(g_trendM30 == direction) score += 2;
   else if(g_trendM30 == -direction) score -= 2;

   if(g_emaTrendM5 == direction) score += 1;
   else if(g_emaTrendM5 == -direction) score -= 1;

   if(g_emaTrendM15 == direction) score += 1;
   else if(g_emaTrendM15 == -direction) score -= 1;

   if(g_emaTrendM30 == direction) score += 1;
   else if(g_emaTrendM30 == -direction) score -= 1;

   return score;
}

bool BrainV19RecentDrive(int direction, double momentum)
{
   if(direction == 0)
      return false;

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, PERIOD_M1, 1, 4, rates);
   if(copied < 3)
      return false;

   double atr = MathMax(10.0, AverageTrueRangePoints(PERIOD_M1, g_atrPeriod));
   int directionalBars = 0;
   double directionalBodyPoints = 0.0;

   for(int i = 0; i < 3; i++)
   {
      bool directional = direction > 0
         ? rates[i].close > rates[i].open
         : rates[i].close < rates[i].open;
      if(directional)
      {
         directionalBars++;
         directionalBodyPoints += MathAbs(rates[i].close - rates[i].open) / _Point;
      }
   }

   double latestBody = MathAbs(rates[0].close - rates[0].open) / _Point;
   bool latestDirectional = direction > 0
      ? rates[0].close > rates[0].open
      : rates[0].close < rates[0].open;
   bool latestStrong = latestDirectional && latestBody >= atr * 0.30;
   bool clusteredDrive = directionalBars >= 2 && directionalBodyPoints >= atr * 0.52;

   double threshold = MathMax(2.0, g_adaptiveMomentumThreshold);
   bool livePressure = direction > 0
      ? momentum >= threshold * 0.30
      : momentum <= -threshold * 0.30;

   return latestStrong || clusteredDrive || livePressure;
}

bool BrainV19M1TurnReady(int direction)
{
   if(direction == 0)
      return false;

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, PERIOD_M1, 1, 4, rates);
   if(copied < 3)
      return false;

   double atr = MathMax(10.0, AverageTrueRangePoints(PERIOD_M1, g_atrPeriod));
   bool latestDirectional = direction > 0
      ? rates[0].close > rates[0].open
      : rates[0].close < rates[0].open;
   double latestBody = MathAbs(rates[0].close - rates[0].open) / _Point;

   bool priorOpposite = false;
   for(int i = 1; i < 3; i++)
   {
      bool opposite = direction > 0
         ? rates[i].close < rates[i].open
         : rates[i].close > rates[i].open;
      if(opposite)
      {
         priorOpposite = true;
         break;
      }
   }

   bool closedTurn = latestDirectional &&
                     priorOpposite &&
                     latestBody >= atr * 0.08;
   bool liveTurn = RecentDirectionalBody(direction, PERIOD_M1) && priorOpposite;
   bool sequenceTurn = BrainV8RecentPullbackSequence(direction);

   return closedTurn || liveTurn || sequenceTurn;
}

int BrainV19LocationEvidence(int direction)
{
   if(direction == 0)
      return 0;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
      return 0;

   double price = (tick.bid + tick.ask) * 0.5;
   double atrPrice = MathMax(
      _Point * 10.0,
      AverageTrueRangePoints(PERIOD_M5, g_atrPeriod) * _Point
   );
   if(atrPrice <= 0.0)
      return 0;

   int evidence = 0;
   if(direction > 0)
   {
      bool inDemand = PriceInsideOrNearZone(
         price, g_demandZoneLow, g_demandZoneHigh, atrPrice * 0.16
      );
      bool nearSupport = g_nearestSupport > 0.0 && g_nearestSupport <= price &&
         (price - g_nearestSupport) / atrPrice <= 0.42;
      bool nearMajorSupport = g_majorSupport > 0.0 && g_majorSupport <= price &&
         (price - g_majorSupport) / atrPrice <= 0.55;
      if(inDemand || nearSupport || nearMajorSupport)
         evidence++;
      if(g_rsiM1 <= 48.0 || g_rsiM5 <= 46.0)
         evidence++;
      if(g_demandZoneScore >= 48.0)
         evidence++;
   }
   else
   {
      bool inSupply = PriceInsideOrNearZone(
         price, g_supplyZoneLow, g_supplyZoneHigh, atrPrice * 0.16
      );
      bool nearResistance = g_nearestResistance > price &&
         (g_nearestResistance - price) / atrPrice <= 0.42;
      bool nearMajorResistance = g_majorResistance > price &&
         (g_majorResistance - price) / atrPrice <= 0.55;
      if(inSupply || nearResistance || nearMajorResistance)
         evidence++;
      if(g_rsiM1 >= 52.0 || g_rsiM5 >= 54.0)
         evidence++;
      if(g_supplyZoneScore >= 48.0)
         evidence++;
   }
   return evidence;
}

bool BrainV19ScalpReversalReady(int direction, double momentum)
{
   if(!BrainV19M1TurnReady(direction))
      return false;

   int evidence = BrainV19LocationEvidence(direction);
   int context = BrainV19ContextScore(direction);

   // Higher timeframes are context, not a trigger. A mildly opposing M5/M15/M30
   // is acceptable for a scalp; unanimous strong opposition simply requires
   // more local evidence before catching the turn.
   if(context >= -2)
      evidence++;

   string microState = "NEUTRAL";
   double micro = MicroStructureScore(direction, microState);
   if(micro >= 50.0)
      evidence++;

   bool oppositeStillStrong = MomentumSupportsDirection(-direction, momentum, 0.70);
   bool turnMomentum = MomentumSupportsDirection(direction, momentum, 0.10);
   if(!oppositeStillStrong || turnMomentum)
      evidence++;

   // Two supporting observations plus the mandatory M1 turn are enough. This
   // deliberately keeps entry frequency high instead of rebuilding the old
   // multi-filter starvation problem.
   int requiredEvidence = context <= -6 ? 3 : 2;
   return evidence >= requiredEvidence;
}

int BrainV19CommitDirection(int direction, string model, string trigger)
{
   g_entryModel = model;
   g_entryTrigger = trigger;
   g_entryBias = direction > 0 ? "BUY" : "SELL";
   g_adaptiveBlockReason = "";
   g_priceLocationState = direction > 0
      ? "M1_DIP_BUY_READY"
      : "M1_RALLY_SELL_READY";
   g_reversalStatus = direction > 0
      ? "SCALP_PULLBACK_BUY"
      : "SCALP_PULLBACK_SELL";
   return EnforceUserDirectionLock(direction);
}

int BrainV19ScalpDirection(double momentum)
{
   bool recentDownDrive = BrainV19RecentDrive(-1, momentum);
   bool recentUpDrive = BrainV19RecentDrive(1, momentum);
   bool buyTurn = BrainV19M1TurnReady(1);
   bool sellTurn = BrainV19M1TurnReady(-1);

   // Highest priority: fade the completed pullback only AFTER M1 turns.
   // Example: red impulse -> WAIT -> first valid bullish M1 turn -> BUY.
   if(recentDownDrive && buyTurn && BrainV19ScalpReversalReady(1, momentum))
      return BrainV19CommitDirection(1, "SCALP_DIP_REVERSAL", "M1_BUY_TURN");

   if(recentUpDrive && sellTurn && BrainV19ScalpReversalReady(-1, momentum))
      return BrainV19CommitDirection(-1, "SCALP_RALLY_REVERSAL", "M1_SELL_TURN");

   // Core anti-chase contract. A fresh bearish drive is never converted into
   // a continuation SELL; a fresh bullish drive is never converted into a
   // continuation BUY. Wait for the opposite M1 turn instead.
   if(recentDownDrive && !buyTurn)
   {
      g_entryModel = "SCALP_WAIT_DIP";
      g_entryTrigger = "WAIT_M1_BUY_TURN";
      g_entryBias = "BUY";
      g_adaptiveBlockReason = "WAIT_DIP_BUY_CONFIRM";
      g_priceLocationState = "FALLING_WAIT_BUY";
      return 0;
   }

   if(recentUpDrive && !sellTurn)
   {
      g_entryModel = "SCALP_WAIT_RALLY";
      g_entryTrigger = "WAIT_M1_SELL_TURN";
      g_entryBias = "SELL";
      g_adaptiveBlockReason = "WAIT_RALLY_SELL_CONFIRM";
      g_priceLocationState = "RISING_WAIT_SELL";
      return 0;
   }

   // Quiet/ranging market: M1 still owns execution. M5/M15/M30 only break a
   // tie; they never create a trade by themselves.
   bool buyReady = buyTurn && BrainV19ScalpReversalReady(1, momentum);
   bool sellReady = sellTurn && BrainV19ScalpReversalReady(-1, momentum);

   if(buyReady && sellReady)
   {
      int buyContext = BrainV19ContextScore(1);
      int sellContext = BrainV19ContextScore(-1);
      if(buyContext >= sellContext)
         return BrainV19CommitDirection(1, "SCALP_RANGE_REVERSAL", "M1_BUY_TURN");
      return BrainV19CommitDirection(-1, "SCALP_RANGE_REVERSAL", "M1_SELL_TURN");
   }
   if(buyReady)
      return BrainV19CommitDirection(1, "SCALP_RANGE_REVERSAL", "M1_BUY_TURN");
   if(sellReady)
      return BrainV19CommitDirection(-1, "SCALP_RANGE_REVERSAL", "M1_SELL_TURN");

   g_entryModel = "SCALP_WAIT_M1";
   g_entryTrigger = "WAIT_PULLBACK_TURN";
   g_entryBias = "BOTH";
   g_adaptiveBlockReason = "WAIT_M1_PULLBACK_TURN";
   g_priceLocationState = "WAIT_M1_TURN";
   return 0;
}
'@

Insert-BeforeRequired 'int AdaptiveEntryDirection(double momentum)' $brainV19 'int BrainV19ScalpDirection(double momentum)' 'Brain V19 scalp pullback/reversal engine'
Replace-Required 'int rawDirection = BrainV13SmartDirection(momentum);' 'int rawDirection = BrainV19ScalpDirection(momentum);' 'route AUTO first entry through Brain V19 scalp direction'

[System.IO.File]::WriteAllText((Resolve-Path $Path), $text, [System.Text.UTF8Encoding]::new($false))
Write-Host "EA Brain V19 scalp pullback/reversal patch complete: $Path"
