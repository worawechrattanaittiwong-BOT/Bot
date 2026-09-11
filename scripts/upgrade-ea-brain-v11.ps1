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

Replace-Required '#property version   "1.049"' '#property version   "1.050"' 'EA version 1.050'
Replace-Required '#define SCENOVA_EA_VERSION "1.049"' '#define SCENOVA_EA_VERSION "1.050"' 'runtime version 1.050'
Replace-Required '#define SCENOVA_PRODUCT_VERSION "2.0.11"' '#define SCENOVA_PRODUCT_VERSION "2.0.12"' 'product version 2.0.12'

# Brain V11: prevent a self-locking confidence loop.
# Losing baskets previously reduced model confidence while confidence itself was
# a mandatory hard gate. Once the score fell below the gate, no new basket could
# open, so the loss streak could never be reset by a later winning basket.
Replace-Required `
'   score -= MathMin(15.0, g_consecutiveLosses * 4.0);' `
'   // Brain V11: loss history is advisory and bounded. It may make the engine
   // more selective, but it must never create a self-locking no-trade state.
   score -= MathMin(6.0, g_consecutiveLosses * 1.5);' `
'bounded loss-streak confidence penalty'

$oldConfidenceGate = @'
   g_effectiveConfidenceThreshold = confidenceFloor;
   if(g_signalConfidence < confidenceFloor)
   {
      g_adaptiveBlockReason = "WAITING_CONFIDENCE";
      return false;
   }
'@

$newConfidenceGate = @'
   g_effectiveConfidenceThreshold = confidenceFloor;

   // Brain V11: confidence is a quality preference, not a permanent deadlock.
   // Market location, model confirmation and directional structure remain hard
   // safety gates. Only catastrophically weak confidence can veto an entry.
   // This lets the EA recover naturally after a losing streak instead of
   // requiring a trade to reset a streak while simultaneously forbidding it.
   bool confidenceBelowPreferred = g_signalConfidence < confidenceFloor;
   double catastrophicFloor = MathMax(38.0, confidenceFloor - 18.0);
   if(g_confidenceGateEnabled &&
      confidenceBelowPreferred &&
      g_signalConfidence < catastrophicFloor)
   {
      g_adaptiveBlockReason = "WAITING_CONFIDENCE_EXTREME";
      return false;
   }
'@
Replace-Required $oldConfidenceGate $newConfidenceGate 'soft confidence recovery gate'

Replace-Required `
'   // Brain V8: confidence is a mandatory execution gate and remains visible for audit.
   // DynamicConfidenceThreshold remains visible as the effective threshold.
   // Pullback + Structure gates are enforced immediately above.
   // BrainV8QualityGate above owns the authoritative confidence threshold for
   // this decision. Do not overwrite telemetry with a weaker display value.' `
'   // Brain V11: confidence remains visible for audit but is no longer allowed
   // to deadlock the engine after a losing streak. Market Location, model
   // confirmation and Structure remain the authoritative hard safety gates.
   // BrainV8QualityGate owns the preferred confidence threshold telemetry.' `
'confidence policy documentation'

[System.IO.File]::WriteAllText((Resolve-Path $Path), $text, [System.Text.UTF8Encoding]::new($false))
Write-Host "EA Brain V11 starvation fix complete: $Path"
