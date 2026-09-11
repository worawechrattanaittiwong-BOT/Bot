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

function Replace-RegexRequired([ref]$textRef, [string]$pattern, [string]$replacement, [string]$sentinel, [string]$label) {
  if ($textRef.Value.Contains($sentinel)) {
    Write-Host "$label already applied"
    return
  }
  $regex = [regex]::new($pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if (-not $regex.IsMatch($textRef.Value)) { throw "Patch regex anchor not found: $label" }
  $textRef.Value = $regex.Replace($textRef.Value, $replacement, 1)
  Write-Host "Applied $label"
}

$ea = Read-Utf8 $EaPath
$eaRef = [ref]$ea

Replace-Required $eaRef '#property version   "1.057"' '#property version   "1.058"' 'EA version 1.058'
Replace-Required $eaRef '#define SCENOVA_EA_VERSION "1.057"' '#define SCENOVA_EA_VERSION "1.058"' 'runtime version 1.058'
Replace-Required $eaRef '#define SCENOVA_PRODUCT_VERSION "2.0.19"' '#define SCENOVA_PRODUCT_VERSION "2.0.20"' 'product version 2.0.20'

$m5DirectionBlock = @'
int RaceM5CandleDirection()
{
   // RACE AUTO reads one thing only for side selection: the latest completed
   // M5 candle. Closed-bar data keeps the chosen side stable and prevents an
   // intrabar flip from opening the opposite direction inside the same cycle.
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, PERIOD_M5, 1, 1, rates) < 1)
      return 0;

   if(rates[0].close > rates[0].open) return 1;
   if(rates[0].close < rates[0].open) return -1;
   return 0;
}

int RaceAnalysisDirection(double momentum)
{
   // Manual direction remains available to the customer.
   if(g_entryMode == ENTRY_BUY_ONLY) return 1;
   if(g_entryMode == ENTRY_SELL_ONLY) return -1;

   // AUTO RACE deliberately ignores Momentum/M1/M15/EMA/Macro for choosing
   // the side. One closed M5 candle decides BUY or SELL for the next cycle.
   return RaceM5CandleDirection();
}

double RaceMidProgressPoints
'@
Replace-RegexRequired $eaRef 'int RaceAnalysisDirection\(double momentum\)\s*\{.*?\}\s*\r?\n\s*double RaceMidProgressPoints' $m5DirectionBlock 'int RaceM5CandleDirection()' 'replace RACE side selection with one closed M5 candle'

$m5WrongDirectionBlock = @'
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

   // RACE directional invalidation also uses only the latest completed M5
   // candle. The opposite candle alone is not enough to close; price must also
   // have moved meaningfully against the active cycle.
   int m5Direction = RaceM5CandleDirection();
   if(m5Direction == 0 || m5Direction == direction)
      return false;

   double atr = MathMax(
      10.0,
      AverageTrueRangePoints(PERIOD_M5, g_atrPeriod)
   );
   double progress = RaceMidProgressPoints(direction);
   double adverseThreshold = filling ? atr * 0.45 : atr * 0.22;
   bool adverse = progress <= -adverseThreshold;
   bool severe = progress <= -atr * (filling ? 0.75 : 0.50);

   if(severe)
   {
      reasonOut = "RACE_M5_SEVERE_REVERSAL";
      return true;
   }
   if(adverse)
   {
      reasonOut = "RACE_M5_OPPOSITE_CONFIRMED";
      return true;
   }
   return false;
}

bool RaceFlowStillRunning(int direction, double momentum)
{
   // Profit-run direction in RACE follows the same single completed M5 candle.
   return RaceM5CandleDirection() == direction;
}

double RaceProfitArmMoney
'@
Replace-RegexRequired $eaRef 'bool RaceWrongDirectionConfirmed\(.*?\r?\n\}\s*\r?\n\s*bool RaceFlowStillRunning\(.*?\r?\n\}\s*\r?\n\s*double RaceProfitArmMoney' $m5WrongDirectionBlock 'RACE_M5_OPPOSITE_CONFIRMED' 'make RACE direction management M5-only'

$oldProcessHead = @'
bool ProcessRaceFill(int direction)
{
   if(direction == 0)
      return false;

   int filledUnits = RaceFilledUnits();
'@
$newProcessHead = @'
bool ProcessRaceFill(int direction)
{
   if(direction == 0)
      return false;

   // One-way cycle lock: once a RACE cycle has any open position, every new
   // fill must stay on that same side. A new BUY/SELL decision is allowed only
   // after the entire RACE basket is flat.
   int existingPositions = BasketPositionCount();
   if(existingPositions > 0)
   {
      int existingDirection = BasketDirection();
      if(existingDirection == 0)
      {
         g_executionStatus = "RACE_MIXED_BASKET_BLOCK";
         return false;
      }
      if(existingDirection != direction ||
         (g_raceDirection != 0 && g_raceDirection != direction))
      {
         g_executionStatus = "RACE_DIRECTION_LOCK";
         return false;
      }
   }

   int filledUnits = RaceFilledUnits();
'@
Replace-Required $eaRef $oldProcessHead $newProcessHead 'lock RACE fills to one side until flat'

Replace-Required $eaRef '   g_entryModel = "RACE_ANALYSIS";' '   g_entryModel = "RACE_M5_ONE_CANDLE";' 'label RACE M5 entry model'
Replace-Required $eaRef '   g_entryTrigger = direction > 0 ? "RACE_BUY" : "RACE_SELL";' '   g_entryTrigger = direction > 0 ? "RACE_M5_BUY" : "RACE_M5_SELL";' 'label RACE M5 entry trigger'

foreach ($sentinel in @(
  '#property version   "1.058"',
  '#define SCENOVA_PRODUCT_VERSION "2.0.20"',
  'int RaceM5CandleDirection()',
  'CopyRates(_Symbol, PERIOD_M5, 1, 1, rates)',
  'return RaceM5CandleDirection();',
  'RACE_M5_OPPOSITE_CONFIRMED',
  'RACE_M5_SEVERE_REVERSAL',
  'RACE_DIRECTION_LOCK',
  'RACE_MIXED_BASKET_BLOCK',
  'RACE_M5_ONE_CANDLE',
  'RACE_M5_BUY',
  'RACE_M5_SELL'
)) {
  if (-not $eaRef.Value.Contains($sentinel)) {
    throw "Brain V19 sentinel missing: $sentinel"
  }
}

Write-Utf8 $EaPath $eaRef.Value
Write-Host "Brain V19 RACE M5 one-candle direction lock applied"
