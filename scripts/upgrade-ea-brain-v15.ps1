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

Replace-Required '#property version   "1.053"' '#property version   "1.054"' 'EA version 1.054'
Replace-Required '#define SCENOVA_EA_VERSION "1.053"' '#define SCENOVA_EA_VERSION "1.054"' 'runtime version 1.054'
Replace-Required '#define SCENOVA_PRODUCT_VERSION "2.0.15"' '#define SCENOVA_PRODUCT_VERSION "2.0.16"' 'product version 2.0.16'

$balancedAdd = @'
// Brain V15 -----------------------------------------------------------------
// Basket continuation is deliberately much lighter than first-entry logic.
// Max Positions is the user's exact ceiling. Once the first position exists,
// the add engine only needs: same Basket direction, no severe adverse move,
// and real price separation/progress from the latest filled position.
// S/R, RSI, pullback, terminal-zone, Entry Precision and continuation-score
// logic remain telemetry/quality inputs but cannot veto a valid continuation.
bool BrainV15BalancedAddReady(int direction, int count, int targetPositions, double atr)
{
   if(direction == 0 || count <= 0 || count >= targetPositions)
      return false;

   double targetScale = targetPositions >= 80 ? 0.018 :
                        targetPositions >= 50 ? 0.022 :
                        targetPositions >= 20 ? 0.028 : 0.035;
   double requiredProgress = MathMax(3.0, atr * targetScale);
   double progress = BasketFavorableProgressPoints(direction);

   double lastEntry = LastBasketEntryPrice(direction);
   MqlTick tick;
   if(lastEntry <= 0.0 || !SymbolInfoTick(_Symbol, tick))
      return false;

   double current = direction > 0 ? tick.bid : tick.ask;
   double betterPricePoints = direction > 0
      ? (lastEntry - current) / _Point
      : (current - lastEntry) / _Point;
   bool modestPullback =
      betterPricePoints >= MathMax(2.0, atr * 0.025) &&
      betterPricePoints <= MathMax(4.0, atr * 0.35);

   if(progress >= requiredProgress || modestPullback)
   {
      g_ladderMode = "V15_BALANCED_ADD_READY";
      g_fillBlockReason = "NONE";
      return true;
   }

   g_ladderMode = "V15_WAIT_ADD_SPACE";
   g_fillBlockReason = "V15_WAIT_ADD_SPACE";
   g_ladderRequiredPoints = requiredProgress;
   return false;
}
'@
Insert-BeforeRequired 'bool BasketLadderReady(int direction, int count, int targetPositions)' $balancedAdd 'bool BrainV15BalancedAddReady(int direction, int count, int targetPositions, double atr)' 'insert V15 balanced add engine'

# After the initial rung/ATR/timing calculations, let the V15 add engine decide.
$anchor = @'
   g_ladderPullbackRequiredPoints = MathMax(
      2.0,
      MathMin(atr*pullbackFactor,MathMax(2.0,g_ladderRequiredPoints*0.35))
   );

'@
$replacement = @'
   g_ladderPullbackRequiredPoints = MathMax(
      2.0,
      MathMin(atr*pullbackFactor,MathMax(2.0,g_ladderRequiredPoints*0.35))
   );

   // V15: do not run the old add-entry intelligence gauntlet. The first entry
   // remains smart; continuation adds are governed by balanced price spacing.
   if(BrainV15BalancedAddReady(direction,count,targetPositions,atr))
      return true;
   return false;

'@
Replace-Required $anchor $replacement 'route BasketLadderReady through V15 add policy'

# Remove the legacy local-zone veto from the old ladder tail as well. That tail
# is bypassed by V15, but keeping an inactive hard-veto signature makes policy
# validation ambiguous and risks accidental reactivation in a later refactor.
$oldLadderAddLocation = @'
   string addLocationReason="NONE";
   if(!BasketAddLocationAllowed(direction,count,addLocationReason))
   {
      g_ladderMode="WAIT_LOCAL_EXTREME";
      g_fillBlockReason=addLocationReason;
      return false;
   }

'@
$newLadderAddLocation = @'
   string addLocationReason="NONE";
   // V15: local-zone analysis remains observable only; it cannot veto a
   // balanced continuation add.
   BasketAddLocationAllowed(direction,count,addLocationReason);

'@
Replace-Required $oldLadderAddLocation $newLadderAddLocation 'remove legacy ladder local-zone veto'

# ProcessBurstQueue must not re-apply first-entry location/zone gates to adds.
$oldMarketLocation = @'
   if(!MarketLocationEntryAllowed(g_burstDirection,true))
   {
      g_fillBlockReason=g_adaptiveBlockReason;
      g_executionStatus=g_adaptiveBlockReason;
      return;
   }

'@
$newMarketLocation = @'
   // V15: MarketLocation is telemetry for continuation adds, not a hard veto.
   MarketLocationEntryAllowed(g_burstDirection,true);

'@
Replace-Required $oldMarketLocation $newMarketLocation 'remove continuation market-location veto'

$oldAddLocation = @'
   string finalAddLocationReason="NONE";
   if(!BasketAddLocationAllowed(
      g_burstDirection,
      count,
      finalAddLocationReason))
   {
      g_fillBlockReason=finalAddLocationReason;
      g_executionStatus=finalAddLocationReason;
      g_ladderMode="WAIT_LOCAL_EXTREME";
      return;
   }

'@
$newAddLocation = @'
   string finalAddLocationReason="NONE";
   // V15: keep the local-extreme calculation visible, but do not let it veto
   // an otherwise valid balanced continuation add.
   BasketAddLocationAllowed(
      g_burstDirection,
      count,
      finalAddLocationReason
   );

'@
Replace-Required $oldAddLocation $newAddLocation 'remove continuation local-zone veto'

# Rescue WARNING must not freeze a basket that is still filling toward the user target.
$oldWarning = @'
   if(g_rescueState==RESCUE_WARNING)
   {
      g_burstActive=false;
      g_burstNeedsRearm=false;

'@
$newWarning = @'
   if(g_rescueState==RESCUE_WARNING)
   {
      // V15: a warning observes recovery risk but does not freeze a valid
      // Basket fill before the configured Max Positions target is reached.
      if(BasketFillEnabled() &&
         g_burstTargetPositions > BasketPositionCount())
      {
         g_executionStatus = g_rescueOldestAgeSeconds >= RescueTimeThresholdSeconds()
            ? "TIME_RESCUE_WARNING_FILL_CONTINUES"
            : "RESCUE_WARNING_FILL_CONTINUES";
         SaveRescueState();
         return false;
      }

      g_burstActive=false;
      g_burstNeedsRearm=false;

'@
Replace-Required $oldWarning $newWarning 'allow basket fill during rescue warning'

$oldOnTickWarning = @'
   if(count > 0 && g_rescueState == RESCUE_WARNING)
   {
      g_executionStatus = g_rescueOldestAgeSeconds >= RescueTimeThresholdSeconds()
         ? "TIME_RESCUE_WARNING"
         : "RESCUE_WARNING";
      return;
   }

'@
$newOnTickWarning = @'
   if(count > 0 && g_rescueState == RESCUE_WARNING && !g_burstActive)
   {
      g_executionStatus = g_rescueOldestAgeSeconds >= RescueTimeThresholdSeconds()
         ? "TIME_RESCUE_WARNING"
         : "RESCUE_WARNING";
      return;
   }

'@
Replace-Required $oldOnTickWarning $newOnTickWarning 'do not pause active basket fill on warning'

[System.IO.File]::WriteAllText((Resolve-Path $Path), $text, [System.Text.UTF8Encoding]::new($false))
Write-Host "EA Brain V15 balanced basket continuation patch complete: $Path"
