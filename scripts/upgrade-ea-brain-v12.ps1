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

Replace-Required '#property version   "1.050"' '#property version   "1.051"' 'EA version 1.051'
Replace-Required '#define SCENOVA_EA_VERSION "1.050"' '#define SCENOVA_EA_VERSION "1.051"' 'runtime version 1.051'
Replace-Required '#define SCENOVA_PRODUCT_VERSION "2.0.12"' '#define SCENOVA_PRODUCT_VERSION "2.0.13"' 'product version 2.0.13'

$brainV12 = @'
// Brain V12 ----------------------------------------------------------------
// Direct execution policy requested for production trading:
// - Intelligence remains available for telemetry, exits and basket management.
// - First-entry direction is NOT vetoed by confidence, pullback, RSI, S/R,
//   terminal-zone, anti-chase or Entry Precision filters.
// - Prefer a real setup when one exists, then fall back to live momentum,
//   lower-timeframe trend consensus, and finally macro direction.
// - Operational safety still applies later in OnTick: SaaS access/lease,
//   broker trade permission, explicit BUY_ONLY/SELL_ONLY, rate limit,
//   max positions and extreme spread protection.
int BrainV12DirectDirection(double momentum)
{
   int direction = SetupFirstDirection(momentum);
   if(direction != 0)
   {
      g_adaptiveBlockReason = "";
      return EnforceUserDirectionLock(direction);
   }

   double threshold = MathMax(2.0, g_adaptiveMomentumThreshold);
   double directMomentum = MathMax(1.0, threshold * 0.25);
   if(momentum >= directMomentum)
   {
      g_entryModel = "DIRECT_MOMENTUM";
      g_entryTrigger = "MOMENTUM_BUY";
      g_entryBias = "BUY";
      g_adaptiveBlockReason = "";
      return EnforceUserDirectionLock(1);
   }
   if(momentum <= -directMomentum)
   {
      g_entryModel = "DIRECT_MOMENTUM";
      g_entryTrigger = "MOMENTUM_SELL";
      g_entryBias = "SELL";
      g_adaptiveBlockReason = "";
      return EnforceUserDirectionLock(-1);
   }

   int buyVotes = 0;
   int sellVotes = 0;
   if(g_trendM1 > 0) buyVotes++; else if(g_trendM1 < 0) sellVotes++;
   if(g_trendM5 > 0) buyVotes++; else if(g_trendM5 < 0) sellVotes++;
   if(g_trendM15 > 0) buyVotes++; else if(g_trendM15 < 0) sellVotes++;
   if(g_emaTrendM5 > 0) buyVotes++; else if(g_emaTrendM5 < 0) sellVotes++;
   if(g_emaTrendM15 > 0) buyVotes++; else if(g_emaTrendM15 < 0) sellVotes++;

   if(buyVotes >= 3 && buyVotes > sellVotes)
   {
      g_entryModel = "DIRECT_TREND";
      g_entryTrigger = "TREND_BUY";
      g_entryBias = "BUY";
      g_adaptiveBlockReason = "";
      return EnforceUserDirectionLock(1);
   }
   if(sellVotes >= 3 && sellVotes > buyVotes)
   {
      g_entryModel = "DIRECT_TREND";
      g_entryTrigger = "TREND_SELL";
      g_entryBias = "SELL";
      g_adaptiveBlockReason = "";
      return EnforceUserDirectionLock(-1);
   }

   if(g_macroTrendDirection != 0)
   {
      direction = g_macroTrendDirection;
      g_entryModel = "DIRECT_MACRO";
      g_entryTrigger = direction > 0 ? "MACRO_BUY" : "MACRO_SELL";
      g_entryBias = direction > 0 ? "BUY" : "SELL";
      g_adaptiveBlockReason = "";
      return EnforceUserDirectionLock(direction);
   }

   g_entryModel = "NONE";
   g_entryTrigger = "NONE";
   g_entryBias = "BOTH";
   g_adaptiveBlockReason = "WAITING_DIRECTION";
   return 0;
}
'@
Insert-BeforeRequired 'int AdaptiveEntryDirection(double momentum)' $brainV12 'int BrainV12DirectDirection(double momentum)' 'Brain V12 direct direction function'

$oldDirectionPipeline = @'
   int rawDirection = SetupFirstDirection(momentum);
   rawDirection = ApplyLocalExtremeDecision(rawDirection,momentum);
   rawDirection = BrainV10ApplyTrendPhasePolicy(rawDirection, momentum);
   g_marketRegimeDetail = DetailedMarketRegime(momentum, rawDirection);
'@
$newDirectionPipeline = @'
   // Brain V12: take the real market direction directly. Setup intelligence is
   // preferred, but no price-location or pullback policy is allowed to turn a
   // valid BUY/SELL direction back into zero.
   int rawDirection = BrainV12DirectDirection(momentum);
   g_marketRegimeDetail = DetailedMarketRegime(momentum, rawDirection);
'@
Replace-Required $oldDirectionPipeline $newDirectionPipeline 'direct first-entry direction pipeline'

$oldAdaptiveGates = @'
   if(!MarketLocationEntryAllowed(rawDirection, false))
   {
      g_cachedAdaptiveBlockReason = g_adaptiveBlockReason;
      return 0;
   }

   if(!BrainV9ModelConfirmationReady(rawDirection, momentum))
   {
      g_cachedAdaptiveBlockReason = g_adaptiveBlockReason;
      return 0;
   }

   if(!BrainV8QualityGate(rawDirection, momentum))
   {
      g_cachedAdaptiveBlockReason = g_adaptiveBlockReason;
      return 0;
   }
'@
$newAdaptiveGates = @'
   // Brain V12: market-location, pullback/confirmation and confidence/structure
   // engines are telemetry only for FIRST ENTRY. They must not veto a valid
   // BUY/SELL direction. Existing exit and basket-management protections stay.
   g_adaptiveBlockReason = "";
'@
Replace-Required $oldAdaptiveGates $newAdaptiveGates 'remove adaptive first-entry hard gates'

$oldRearmGate = @'
   if(g_marketRearmDirection != 0)
   {
      if(direction == g_marketRearmDirection &&
         !MarketRearmReady(direction,momentum))
      {
         g_executionStatus = "WAITING_MARKET_REARM";
         g_adaptiveBlockReason = "WAIT_FRESH_EXECUTION_EVENT";
         return;
      }
      if(direction != g_marketRearmDirection)
         ClearMarketRearm();
   }
'@
$newRearmGate = @'
   // Brain V12: a previous exit may not freeze the next valid market direction.
   // Clear legacy rearm state instead of waiting for another confirmation gate.
   if(g_marketRearmDirection != 0)
      ClearMarketRearm();
'@
Replace-Required $oldRearmGate $newRearmGate 'remove first-entry market rearm wait'

$oldOnTickLocationGate = @'
   if(!MarketLocationEntryAllowed(direction, false))
   {
      g_executionStatus = g_adaptiveBlockReason;
      return;
   }

   // Entry Precision V3 may wait only for a clearly chased first entry and only
   // for a bounded number of seconds. It never affects Basket adds or safety.
   if(!EntryPrecisionReady(direction,momentum,count==0))
   {
      g_executionStatus="WAITING_BETTER_PRICE";
      g_adaptiveBlockReason="WAITING_BETTER_PRICE";
      return;
   }
'@
$newOnTickLocationGate = @'
   // Brain V12: do not re-run market-location or Entry Precision as order
   // blockers here. Direction is already decided; proceed to market execution.
   g_adaptiveBlockReason = "";
'@
Replace-Required $oldOnTickLocationGate $newOnTickLocationGate 'remove OnTick first-entry market gates'

Replace-Required `
'   // Brain V11: confidence remains visible for audit but is no longer allowed
   // to deadlock the engine after a losing streak. Market Location, model
   // confirmation and Structure remain the authoritative hard safety gates.
   // BrainV8QualityGate owns the preferred confidence threshold telemetry.' `
'   // Brain V12: confidence, structure, market location, RSI, support/resistance,
   // pullback and Entry Precision remain visible for telemetry but are not
   // allowed to block the first BUY/SELL order. Operational safety owns gating.' `
'Brain V12 policy documentation'

[System.IO.File]::WriteAllText((Resolve-Path $Path), $text, [System.Text.UTF8Encoding]::new($false))
Write-Host "EA Brain V12 direct execution patch complete: $Path"
