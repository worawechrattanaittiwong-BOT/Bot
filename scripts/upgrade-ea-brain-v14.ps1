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

Replace-Required '#property version   "1.052"' '#property version   "1.053"' 'EA version 1.053'
Replace-Required '#define SCENOVA_EA_VERSION "1.052"' '#define SCENOVA_EA_VERSION "1.053"' 'runtime version 1.053'
Replace-Required '#define SCENOVA_PRODUCT_VERSION "2.0.14"' '#define SCENOVA_PRODUCT_VERSION "2.0.15"' 'product version 2.0.15'

$oldLadderFunction = @'
double LadderFractionForRung(int rung)
{
   if(rung <= 1) return 0.0;
   if(rung == 2) return 0.08;
   if(rung == 3) return 0.16;
   if(rung == 4) return 0.26;
   if(rung == 5) return 0.38;
   if(rung == 6) return 0.52;
   if(rung == 7) return 0.68;
   if(rung == 8) return 0.86;
   if(rung == 9) return 1.06;
   if(rung == 10) return 1.28;
   return 1.28 + (rung - 10) * 0.18;
}
'@

$newLadderFunction = @'
double LadderFractionForRung(int rung)
{
   if(rung <= 1) return 0.0;
   if(rung == 2) return 0.08;
   if(rung == 3) return 0.16;
   if(rung == 4) return 0.26;
   if(rung == 5) return 0.38;
   if(rung == 6) return 0.52;
   if(rung == 7) return 0.68;
   if(rung == 8) return 0.86;
   if(rung == 9) return 1.06;
   if(rung == 10) return 1.28;
   return 1.28 + (rung - 10) * 0.18;
}

// Brain V14: target-aware ladder density. Small Baskets keep the original
// spacing, while large user targets distribute positions across a bounded ATR
// span instead of demanding an impossible 17+ ATR move for 100 positions.
// This changes spacing only; adverse-flow, reversal, permission and spread
// safety still decide whether another position may actually be added.
double BalancedLadderFractionForRung(int rung, int targetPositions)
{
   if(rung <= 1)
      return 0.0;

   int target = MathMax(2, targetPositions);
   if(target <= 10)
      return LadderFractionForRung(rung);

   double progress = (double)(rung - 1) / (double)(target - 1);
   progress = MathMax(0.0, MathMin(1.0, progress));

   double maxSpanAtr = target <= 20 ? 1.50 :
                       target <= 50 ? 2.20 :
                       target <= 100 ? 3.00 :
                       3.00 + MathMin(2.00, (target - 100) * 0.01);

   // Slightly convex curve: early adds are available without clustering at
   // one price, later adds need progressively more favorable continuation.
   double fraction = maxSpanAtr * MathPow(progress, 1.10);
   return MathMax(0.05, fraction);
}
'@
Replace-Required $oldLadderFunction $newLadderFunction 'target-aware ladder curve'

Replace-Required `
'      atr*LadderFractionForRung(nextRung)*qualityFactor*regimeFactor*' `
'      atr*BalancedLadderFractionForRung(nextRung,targetPositions)*qualityFactor*regimeFactor*' `
'use target-aware ladder requirement'

$oldSchedule = @'
   double fillWindowSeconds = 600.0;
   if(fillElapsedSeconds < 180.0)
      g_fillPhase = "STRICT";
   else if(fillElapsedSeconds < 420.0)
      g_fillPhase = "BALANCED";
   else
      g_fillPhase = "COMPLETION";

   double rungCadenceSeconds = targetPositions > 1
      ? fillWindowSeconds/(double)(targetPositions-1)
      : fillWindowSeconds;
   g_fillExpectedPositions = targetPositions <= 1
      ? 1
      : MathMin(
           targetPositions,
           1+(int)MathFloor(fillElapsedSeconds/MathMax(15.0,rungCadenceSeconds))
        );
'@

$newSchedule = @'
   // Brain V14: a large target gets a longer but proportionate fill window.
   // 100 positions are paced across roughly 13 minutes in a sustained valid
   // move instead of being mathematically limited to ~40 scheduled positions.
   double fillWindowSeconds = MathMax(
      600.0,
      MathMin(1800.0, targetPositions * 8.0)
   );
   double strictPhaseSeconds = MathMin(240.0, fillWindowSeconds * 0.30);
   double balancedPhaseSeconds = MathMin(720.0, fillWindowSeconds * 0.72);
   if(fillElapsedSeconds < strictPhaseSeconds)
      g_fillPhase = "STRICT";
   else if(fillElapsedSeconds < balancedPhaseSeconds)
      g_fillPhase = "BALANCED";
   else
      g_fillPhase = "COMPLETION";

   double rungCadenceSeconds = targetPositions > 1
      ? fillWindowSeconds/(double)(targetPositions-1)
      : fillWindowSeconds;
   double minimumCadenceSeconds = targetPositions >= 50 ? 6.0 :
                                  targetPositions >= 20 ? 8.0 : 15.0;
   g_fillExpectedPositions = targetPositions <= 1
      ? 1
      : MathMin(
           targetPositions,
           1+(int)MathFloor(fillElapsedSeconds/MathMax(minimumCadenceSeconds,rungCadenceSeconds))
        );
'@
Replace-Required $oldSchedule $newSchedule 'balanced large-target fill schedule'

$oldScheduledSpacing = @'
      double scheduledSpacingFactor =
         g_fillPhase=="STRICT" ? 0.055 :
         g_fillPhase=="BALANCED" ? 0.040 : 0.028;
      double scheduledSpacing=MathMax(
         2.0,
         atr*scheduledSpacingFactor*spreadSpacingFactor
      );
'@

$newScheduledSpacing = @'
      double targetDensityScale = targetPositions >= 80 ? 0.45 :
                                  targetPositions >= 50 ? 0.55 :
                                  targetPositions >= 20 ? 0.75 : 1.00;
      double scheduledSpacingFactor =
         (g_fillPhase=="STRICT" ? 0.055 :
          g_fillPhase=="BALANCED" ? 0.040 : 0.028) * targetDensityScale;
      double scheduledSpacing=MathMax(
         2.0,
         atr*scheduledSpacingFactor*spreadSpacingFactor
      );
'@
Replace-Required $oldScheduledSpacing $newScheduledSpacing 'target-aware last-entry spacing'

[System.IO.File]::WriteAllText((Resolve-Path $Path), $text, [System.Text.UTF8Encoding]::new($false))
Write-Host "EA Brain V14 balanced ladder patch complete: $Path"
