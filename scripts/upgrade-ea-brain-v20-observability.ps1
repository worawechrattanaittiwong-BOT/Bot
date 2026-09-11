param(
  [Parameter(Mandatory = $false)][string]$EaPath = "mt5\FastBasketBot.mq5",
  [Parameter(Mandatory = $false)][string]$ApiPath = "apps\api\src\ea.controller.ts",
  [Parameter(Mandatory = $false)][string]$WebPath = "apps\web\app\dashboard\page.tsx"
)
$ErrorActionPreference = "Stop"
foreach($p in @($EaPath,$ApiPath,$WebPath)) { if(-not (Test-Path $p)) { throw "File not found: $p" } }
$ea=[System.IO.File]::ReadAllText((Resolve-Path $EaPath))
$api=[System.IO.File]::ReadAllText((Resolve-Path $ApiPath))
$web=[System.IO.File]::ReadAllText((Resolve-Path $WebPath))

function Replace-Ea([string]$old,[string]$new,[string]$label) {
  if($script:ea.Contains($new)){ Write-Host "$label already applied"; return }
  if(-not $script:ea.Contains($old)){ throw "EA anchor missing: $label" }
  $script:ea=$script:ea.Replace($old,$new); Write-Host "EA: $label"
}
function Insert-EaBefore([string]$anchor,[string]$block,[string]$sentinel,[string]$label) {
  if($script:ea.Contains($sentinel)){ Write-Host "$label already applied"; return }
  $i=$script:ea.IndexOf($anchor,[System.StringComparison]::Ordinal)
  if($i -lt 0){ throw "EA anchor missing: $label" }
  $script:ea=$script:ea.Insert($i,$block+"`r`n"); Write-Host "EA: $label"
}
function Insert-EaBeforeInFunction([string]$functionAnchor,[string]$needle,[string]$block,[string]$sentinel,[string]$label) {
  if($script:ea.Contains($sentinel)){ Write-Host "$label already applied"; return }
  $s=$script:ea.IndexOf($functionAnchor,[System.StringComparison]::Ordinal)
  if($s -lt 0){ throw "EA function missing: $label" }
  $i=$script:ea.IndexOf($needle,$s,[System.StringComparison]::Ordinal)
  if($i -lt 0){ throw "EA function needle missing: $label" }
  $script:ea=$script:ea.Insert($i,$block+"`r`n"); Write-Host "EA: $label"
}
function Replace-Api([string]$old,[string]$new,[string]$label) {
  if($script:api.Contains($new)){ Write-Host "$label already applied"; return }
  if(-not $script:api.Contains($old)){ throw "API anchor missing: $label" }
  $script:api=$script:api.Replace($old,$new); Write-Host "API: $label"
}
function Replace-Web([string]$old,[string]$new,[string]$label) {
  if($script:web.Contains($new)){ Write-Host "$label already applied"; return }
  if(-not $script:web.Contains($old)){ throw "Web anchor missing: $label" }
  $script:web=$script:web.Replace($old,$new); Write-Host "Web: $label"
}

Replace-Ea '#property version   "1.059"' '#property version   "1.060"' 'EA version 1.060'
Replace-Ea '#define SCENOVA_EA_VERSION "1.059"' '#define SCENOVA_EA_VERSION "1.060"' 'runtime version 1.060'
Replace-Ea '#define SCENOVA_PRODUCT_VERSION "2.0.21"' '#define SCENOVA_PRODUCT_VERSION "2.0.22"' 'product version 2.0.22'
Replace-Ea 'string g_controlMode = "AUTO";' 'string g_controlMode = "LEGACY";' 'safe legacy default for strict AUTO ownership'
Replace-Ea @'
   if(requestedControlMode == "AUTO" || requestedControlMode == "RACE" ||
      requestedControlMode == "ASSISTED" || requestedControlMode == "MANUAL")
'@ @'
   if(requestedControlMode == "AUTO" || requestedControlMode == "RACE" ||
      requestedControlMode == "ASSISTED" || requestedControlMode == "MANUAL" ||
      requestedControlMode == "LEGACY")
'@ 'allow internal LEGACY control mode'

Replace-Ea @'
   double locationScore;
   double pullbackScore;
   double entryPrice;
'@ @'
   double locationScore;
   double pullbackScore;
   double pullbackSwingStart;
   double pullbackSwingExtreme;
   double pullbackRetracement;
   string pullbackState;
   double entryPrice;
'@ 'persist unified pullback audit in side snapshot'
Replace-Ea @'
   side.locationScore=0.0;
   side.pullbackScore=0.0;
   side.entryPrice=0.0;
'@ @'
   side.locationScore=0.0;
   side.pullbackScore=0.0;
   side.pullbackSwingStart=0.0;
   side.pullbackSwingExtreme=0.0;
   side.pullbackRetracement=0.0;
   side.pullbackState="NONE";
   side.entryPrice=0.0;
'@ 'reset pullback audit snapshot'
Replace-Ea @'
   AutoV20EvaluatePullback(direction,momentum,pb);
   side.pullbackScore=pb.score;

   double location=0.0;
'@ @'
   AutoV20EvaluatePullback(direction,momentum,pb);
   side.pullbackScore=pb.score;
   side.pullbackSwingStart=pb.swingStart;
   side.pullbackSwingExtreme=pb.swingExtreme;
   side.pullbackRetracement=pb.retracement;
   side.pullbackState=pb.state;

   double location=0.0;
'@ 'capture unified pullback values per side'

Replace-Ea @'
double g_setupAvgWin = 0.0;
double g_setupAvgLoss = 0.0;
string g_setupHistoryModel = "NONE";
'@ @'
double g_setupAvgWin = 0.0;
double g_setupAvgLoss = 0.0;
double g_setupAverageNet = 0.0;
double g_buyAverageNet = 0.0;
double g_sellAverageNet = 0.0;
string g_setupHistoryModel = "NONE";
'@ 'separate historical average net globals'

Replace-Ea @'
   g_sellWinSamples = (int)MathMax(0.0,
      JsonNumber(response, "sellWinSamples", g_sellWinSamples));
   g_setupWinProbability = MathMax(0.0,MathMin(100.0,
'@ @'
   g_sellWinSamples = (int)MathMax(0.0,
      JsonNumber(response, "sellWinSamples", g_sellWinSamples));
   g_buyAverageNet = JsonNumber(response, "buyAverageNet", g_buyAverageNet);
   g_sellAverageNet = JsonNumber(response, "sellAverageNet", g_sellAverageNet);
   g_setupWinProbability = MathMax(0.0,MathMin(100.0,
'@ 'read direction average net from server'
Replace-Ea @'
   g_setupAvgLoss = MathMin(0.0,
      JsonNumber(response,"setupAvgLoss",g_setupAvgLoss));
   g_setupEvScore = MathMax(0.0,MathMin(100.0,
'@ @'
   g_setupAvgLoss = MathMin(0.0,
      JsonNumber(response,"setupAvgLoss",g_setupAvgLoss));
   g_setupAverageNet = JsonNumber(response,"setupAverageNet",g_setupAverageNet);
   g_setupEvScore = MathMax(0.0,MathMin(100.0,
'@ 'read setup average net from server'

Replace-Ea @'
      double p=side.winProbability/100.0;
      side.averageNet=p*g_setupAvgWin+(1.0-p)*g_setupAvgLoss;
'@ @'
      side.averageNet=g_setupAverageNet;
'@ 'use actual setup average net'
Replace-Ea @'
      side.winProbability=g_buyWinProbability;
      side.winSamples=g_buyWinSamples;
      side.averageNet=0.0;
'@ @'
      side.winProbability=g_buyWinProbability;
      side.winSamples=g_buyWinSamples;
      side.averageNet=g_buyAverageNet;
'@ 'use actual BUY average net'
Replace-Ea @'
      side.winProbability=g_sellWinProbability;
      side.winSamples=g_sellWinSamples;
      side.averageNet=0.0;
'@ @'
      side.winProbability=g_sellWinProbability;
      side.winSamples=g_sellWinSamples;
      side.averageNet=g_sellAverageNet;
'@ 'use actual SELL average net'

$autoDiag = @'
      if(StringLen(payload) >= 2)
      {
         int auditDirection=g_cachedAdaptiveDirection;
         AUTO_V20_SIDE auditSide;
         AutoV20ResetSide(auditSide,auditDirection);
         if(auditDirection>0) auditSide=g_autoV20Buy;
         else if(auditDirection<0) auditSide=g_autoV20Sell;
         string autoV20Diagnostics=StringFormat(
            ",\"controlMode\":\"%s\",\"autoV20Active\":%s,\"autoV20DecisionId\":%I64d,\"autoV20DecisionKind\":\"%s\",\"autoV20DecisionReason\":\"%s\",\"autoV20RejectReason\":\"%s\",\"autoV20DirectionChangeReason\":\"%s\",\"autoV20AddReason\":\"%s\",\"autoV20Phase\":\"%s\",\"autoV20BuyScore\":%.2f,\"autoV20SellScore\":%.2f,\"autoV20BuyConfidence\":%.2f,\"autoV20SellConfidence\":%.2f,\"autoV20Confidence\":%.2f,\"autoV20WinProbability\":%.2f,\"autoV20WinSamples\":%d,\"autoV20AverageNet\":%.2f,\"autoV20MomentumWithPoints\":%.2f,\"autoV20MomentumAgainstPoints\":%.2f,\"autoV20NearestSupport\":%s,\"autoV20NearestResistance\":%s,\"autoV20MajorSupport\":%s,\"autoV20MajorResistance\":%s,\"autoV20SupportDistanceAtr\":%.4f,\"autoV20ResistanceDistanceAtr\":%.4f,\"autoV20FormingBase\":%s,\"autoV20FormingCeiling\":%s,\"autoV20RoleFlipState\":\"%s\",\"autoV20SwingStart\":%s,\"autoV20SwingExtreme\":%s,\"autoV20PullbackRetracement\":%.4f,\"autoV20PullbackState\":\"%s\",\"autoV20PlannedEntry\":%s,\"autoV20TpPrice\":%s,\"autoV20SlPrice\":%s,\"autoV20RR\":%.3f,\"autoV20ExpectedProfitMoney\":%.2f,\"autoV20ExpectedLossMoney\":%.2f,\"autoV20KnownCostMoney\":%.2f,\"autoV20AggregateRiskMoney\":%.2f}}",
            g_controlMode,
            AutoV20Enabled() ? "true" : "false",
            g_autoV20DecisionId,
            g_autoV20DecisionKind,
            g_autoV20DecisionReason,
            g_autoV20RejectReason,
            g_autoV20DirectionChangeReason,
            g_autoV20AddReason,
            g_autoV20Phase,
            g_autoV20Buy.rankScore,
            g_autoV20Sell.rankScore,
            g_autoV20Buy.confidence,
            g_autoV20Sell.confidence,
            g_autoV20Confidence,
            g_autoV20WinProbability,
            g_autoV20WinSamples,
            g_autoV20AverageNet,
            auditSide.momentumWithPoints,
            auditSide.momentumAgainstPoints,
            DoubleToString(g_autoV20Levels.nearestSupport,SymbolDigitsNow()),
            DoubleToString(g_autoV20Levels.nearestResistance,SymbolDigitsNow()),
            DoubleToString(g_autoV20Levels.majorSupport,SymbolDigitsNow()),
            DoubleToString(g_autoV20Levels.majorResistance,SymbolDigitsNow()),
            g_autoV20Levels.nearestSupportDistanceAtr,
            g_autoV20Levels.nearestResistanceDistanceAtr,
            DoubleToString(g_autoV20Levels.formingBase,SymbolDigitsNow()),
            DoubleToString(g_autoV20Levels.formingCeiling,SymbolDigitsNow()),
            g_autoV20Levels.roleFlipState,
            DoubleToString(auditSide.pullbackSwingStart,SymbolDigitsNow()),
            DoubleToString(auditSide.pullbackSwingExtreme,SymbolDigitsNow()),
            auditSide.pullbackRetracement,
            auditSide.pullbackState,
            DoubleToString(auditSide.entryPrice,SymbolDigitsNow()),
            DoubleToString(auditSide.tpPrice,SymbolDigitsNow()),
            DoubleToString(auditSide.slPrice,SymbolDigitsNow()),
            auditSide.rr,
            auditSide.expectedProfitMoney,
            auditSide.expectedLossMoney,
            auditSide.knownCostMoney,
            g_autoV20AggregateRiskMoney
         );
         payload=StringSubstr(payload,0,StringLen(payload)-2)+autoV20Diagnostics;
      }
'@
Insert-EaBefore '   string response = "";`r`n   string heartbeatUrl = InpApiBase + "/api/ea/heartbeat";' $autoDiag 'autoV20Diagnostics=StringFormat' 'append AUTO V20 heartbeat audit telemetry'

$entryAudit = @'
   if(!isExit && AutoV20Enabled() && StringLen(payload)>=1)
   {
      AUTO_V20_SIDE auditSide;
      AutoV20ResetSide(auditSide,positionDirection);
      if(positionDirection>0) auditSide=g_autoV20Buy;
      else auditSide=g_autoV20Sell;
      string audit=StringFormat(
         ",\"autoDecisionId\":%I64d,\"autoDecisionKind\":\"%s\",\"autoDecisionReason\":\"%s\",\"autoDirectionChangeReason\":\"%s\",\"autoAddReason\":\"%s\",\"autoBuyScore\":%.2f,\"autoSellScore\":%.2f,\"autoMomentumWithPoints\":%.2f,\"autoMomentumAgainstPoints\":%.2f,\"autoNearestSupport\":%s,\"autoNearestResistance\":%s,\"autoSupportDistanceAtr\":%.4f,\"autoResistanceDistanceAtr\":%.4f,\"autoSwingStart\":%s,\"autoSwingExtreme\":%s,\"autoPullbackRetracement\":%.4f,\"autoPullbackState\":\"%s\",\"autoTpPrice\":%s,\"autoSlPrice\":%s,\"autoRR\":%.3f,\"autoKnownCostMoney\":%.2f,\"autoExpectedProfitMoney\":%.2f,\"autoExpectedLossMoney\":%.2f,\"autoAggregateRiskMoney\":%.2f,\"modelConfidence\":%.2f,\"winProbability\":%.2f,\"winSamples\":%d,\"averageNet\":%.2f}",
         g_autoV20DecisionId,g_autoV20DecisionKind,g_autoV20DecisionReason,
         g_autoV20DirectionChangeReason,g_autoV20AddReason,
         g_autoV20Buy.rankScore,g_autoV20Sell.rankScore,
         auditSide.momentumWithPoints,auditSide.momentumAgainstPoints,
         DoubleToString(g_autoV20Levels.nearestSupport,SymbolDigitsNow()),
         DoubleToString(g_autoV20Levels.nearestResistance,SymbolDigitsNow()),
         g_autoV20Levels.nearestSupportDistanceAtr,
         g_autoV20Levels.nearestResistanceDistanceAtr,
         DoubleToString(auditSide.pullbackSwingStart,SymbolDigitsNow()),
         DoubleToString(auditSide.pullbackSwingExtreme,SymbolDigitsNow()),
         auditSide.pullbackRetracement,auditSide.pullbackState,
         DoubleToString(auditSide.tpPrice,SymbolDigitsNow()),
         DoubleToString(auditSide.slPrice,SymbolDigitsNow()),
         auditSide.rr,auditSide.knownCostMoney,auditSide.expectedProfitMoney,
         auditSide.expectedLossMoney,g_autoV20AggregateRiskMoney,
         auditSide.confidence,auditSide.winProbability,auditSide.winSamples,auditSide.averageNet
      );
      payload=StringSubstr(payload,0,StringLen(payload)-1)+audit;
   }

'@
Insert-EaBeforeInFunction 'void PostTradeJournalDeal(ulong dealTicket)' '   string response = "";' $entryAudit 'autoDecisionId' 'attach AUTO decision audit to ENTRY ticket'

$journalGlobals = @'
long     g_basketJournalAutoDecisionId = 0;
long     g_pendingBasketAutoDecisionId = 0;
'@
Insert-EaBefore 'bool     g_pendingBasketJournal = false;' $journalGlobals 'g_basketJournalAutoDecisionId' 'basket AUTO decision link globals'
Replace-Ea @'
   g_basketJournalPremiumDiscountState = "EQUILIBRIUM";
}
'@ @'
   g_basketJournalPremiumDiscountState = "EQUILIBRIUM";
   g_basketJournalAutoDecisionId = 0;
}
'@ 'clear basket AUTO decision link'
Replace-Ea @'
      g_basketJournalPremiumDiscountState = g_premiumDiscountState;
   }
'@ @'
      g_basketJournalPremiumDiscountState = g_premiumDiscountState;
      g_basketJournalAutoDecisionId = AutoV20Enabled() ? g_autoV20DecisionId : 0;
   }
'@ 'capture first AUTO decision id on Basket'
Replace-Ea @'
   g_basketJournalPremiumDiscountState = g_premiumDiscountState;
}

void FinalizeBasketJournal()
'@ @'
   g_basketJournalPremiumDiscountState = g_premiumDiscountState;
   g_basketJournalAutoDecisionId = 0;
}

void FinalizeBasketJournal()
'@ 'recovered basket has no synthetic decision id'
Replace-Ea @'
   g_pendingBasketPremiumDiscountState = g_basketJournalPremiumDiscountState;
   ClearActiveBasketJournal();
'@ @'
   g_pendingBasketPremiumDiscountState = g_basketJournalPremiumDiscountState;
   g_pendingBasketAutoDecisionId = g_basketJournalAutoDecisionId;
   ClearActiveBasketJournal();
'@ 'copy AUTO decision link into pending Basket journal'

$basketAudit = @'
   if(g_pendingBasketAutoDecisionId>0 && StringLen(payload)>=1)
   {
      string audit=StringFormat(",\"autoDecisionId\":%I64d}",g_pendingBasketAutoDecisionId);
      payload=StringSubstr(payload,0,StringLen(payload)-1)+audit;
   }

'@
Insert-EaBeforeInFunction 'void FlushPendingBasketJournal()' '   string response = "";' $basketAudit 'g_pendingBasketAutoDecisionId>0' 'link completed Basket to first AUTO decision'

# API: canonical runtime control mode. Missing historical mode remains LEGACY
# unless it is unambiguously old AUTO_MOMENTUM or RACE.
Replace-Api @'
    const runtimeSettings = { ...(settings?.settings || {}) };
    if (String(runtimeSettings.engineMode || "").toUpperCase() === "RACE") {
'@ @'
    const runtimeSettings = { ...(settings?.settings || {}) };
    const savedControlMode = String(runtimeSettings.controlMode || "").toUpperCase();
    if (!["AUTO", "RACE", "ASSISTED", "MANUAL"].includes(savedControlMode)) {
      const engineMode = String(runtimeSettings.engineMode || "AUTO").toUpperCase();
      const entryMode = String(runtimeSettings.entryMode || "AUTO_MOMENTUM").toUpperCase();
      runtimeSettings.controlMode = engineMode === "RACE"
        ? "RACE"
        : entryMode === "AUTO_MOMENTUM" ? "AUTO" : "LEGACY";
    }
    if (String(runtimeSettings.engineMode || "").toUpperCase() === "RACE") {
'@ 'send canonical controlMode to EA'

Replace-Api @'
         direction,
         COUNT(*) FILTER (WHERE net_profit<>0)::int AS samples,
         COUNT(*) FILTER (WHERE net_profit>0)::int AS wins
'@ @'
         direction,
         COUNT(*) FILTER (WHERE net_profit<>0)::int AS samples,
         COUNT(*) FILTER (WHERE net_profit>0)::int AS wins,
         COALESCE(AVG(net_profit),0)::float8 AS avg_net
'@ 'calculate average net per completed Basket direction'
Replace-Api @'
    const byDirection = new Map<string, { samples: number; wins: number }>();
'@ @'
    const byDirection = new Map<string, { samples: number; wins: number; averageNet: number }>();
'@ 'type direction statistics with average net'
Replace-Api @'
      byDirection.set(String(row.direction), {
        samples: Number(row.samples || 0),
        wins: Number(row.wins || 0)
      });
'@ @'
      byDirection.set(String(row.direction), {
        samples: Number(row.samples || 0),
        wins: Number(row.wins || 0),
        averageNet: Number(row.avg_net || 0)
      });
'@ 'map average net statistics'
Replace-Api @'
    const buy = byDirection.get("BUY") || { samples: 0, wins: 0 };
    const sell = byDirection.get("SELL") || { samples: 0, wins: 0 };
'@ @'
    const buy = byDirection.get("BUY") || { samples: 0, wins: 0, averageNet: 0 };
    const sell = byDirection.get("SELL") || { samples: 0, wins: 0, averageNet: 0 };
'@ 'default direction average net statistics'
Replace-Api @'
      buyWinProbability: rate(buy.wins, buy.samples),
      buyWinSamples: buy.samples,
      sellWinProbability: rate(sell.wins, sell.samples),
      sellWinSamples: sell.samples
'@ @'
      buyWinProbability: rate(buy.wins, buy.samples),
      buyWinSamples: buy.samples,
      buyAverageNet: buy.averageNet,
      sellWinProbability: rate(sell.wins, sell.samples),
      sellWinSamples: sell.samples,
      sellAverageNet: sell.averageNet
'@ 'return direction average net statistics'

Replace-Api @'
      setupAvgWin: 0,
      setupAvgLoss: 0,
      setupExpectedValue: 0,
'@ @'
      setupAvgWin: 0,
      setupAvgLoss: 0,
      setupAverageNet: 0,
      setupExpectedValue: 0,
'@ 'neutral setup average net'
Replace-Api @'
         COALESCE(AVG(net_profit) FILTER (WHERE net_profit>0),0)::float8 AS avg_win,
         COALESCE(AVG(net_profit) FILTER (WHERE net_profit<0),0)::float8 AS avg_loss
'@ @'
         COALESCE(AVG(net_profit) FILTER (WHERE net_profit>0),0)::float8 AS avg_win,
         COALESCE(AVG(net_profit) FILTER (WHERE net_profit<0),0)::float8 AS avg_loss,
         COALESCE(AVG(net_profit),0)::float8 AS avg_net
'@ 'calculate setup average net'
Replace-Api @'
    const avgWin = Math.max(0, Number(row?.avg_win || 0));
    const avgLoss = Math.min(0, Number(row?.avg_loss || 0));
    const winProbability = samples > 0 ? wins / samples * 100 : 0;
'@ @'
    const avgWin = Math.max(0, Number(row?.avg_win || 0));
    const avgLoss = Math.min(0, Number(row?.avg_loss || 0));
    const averageNet = Number(row?.avg_net || 0);
    const winProbability = samples > 0 ? wins / samples * 100 : 0;
'@ 'read setup average net'
Replace-Api @'
      setupAvgWin: avgWin,
      setupAvgLoss: avgLoss,
      setupExpectedValue: expectedValue,
'@ @'
      setupAvgWin: avgWin,
      setupAvgLoss: avgLoss,
      setupAverageNet: averageNet,
      setupExpectedValue: expectedValue,
'@ 'return setup average net'

# Journal request + metadata fields.
Replace-Api @'
    premiumDiscountState?: string;
  }) {
'@ @'
    premiumDiscountState?: string;
    autoDecisionId?: number;
    autoDecisionKind?: string;
    autoDecisionReason?: string;
    autoDirectionChangeReason?: string;
    autoAddReason?: string;
    autoBuyScore?: number;
    autoSellScore?: number;
    autoMomentumWithPoints?: number;
    autoMomentumAgainstPoints?: number;
    autoNearestSupport?: number;
    autoNearestResistance?: number;
    autoSupportDistanceAtr?: number;
    autoResistanceDistanceAtr?: number;
    autoSwingStart?: number;
    autoSwingExtreme?: number;
    autoPullbackRetracement?: number;
    autoPullbackState?: string;
    autoTpPrice?: number;
    autoSlPrice?: number;
    autoRR?: number;
    autoKnownCostMoney?: number;
    autoExpectedProfitMoney?: number;
    autoExpectedLossMoney?: number;
    autoAggregateRiskMoney?: number;
    modelConfidence?: number;
    winProbability?: number;
    winSamples?: number;
    averageNet?: number;
  }) {
'@ 'accept AUTO V20 journal audit fields'
Replace-Api @'
          levelFlipState: text(body.levelFlipState, 48),
          premiumDiscountState: text(body.premiumDiscountState, 32)
'@ @'
          levelFlipState: text(body.levelFlipState, 48),
          premiumDiscountState: text(body.premiumDiscountState, 32),
          autoDecisionId: Math.max(0, Math.trunc(n(body.autoDecisionId))),
          autoDecisionKind: text(body.autoDecisionKind, 16),
          autoDecisionReason: text(body.autoDecisionReason, 96),
          autoDirectionChangeReason: text(body.autoDirectionChangeReason, 96),
          autoAddReason: text(body.autoAddReason, 96),
          autoBuyScore: Math.max(0, Math.min(100, n(body.autoBuyScore))),
          autoSellScore: Math.max(0, Math.min(100, n(body.autoSellScore))),
          autoMomentumWithPoints: Math.max(0, n(body.autoMomentumWithPoints)),
          autoMomentumAgainstPoints: Math.max(0, n(body.autoMomentumAgainstPoints)),
          autoNearestSupport: Math.max(0, n(body.autoNearestSupport)),
          autoNearestResistance: Math.max(0, n(body.autoNearestResistance)),
          autoSupportDistanceAtr: Math.max(0, n(body.autoSupportDistanceAtr)),
          autoResistanceDistanceAtr: Math.max(0, n(body.autoResistanceDistanceAtr)),
          autoSwingStart: Math.max(0, n(body.autoSwingStart)),
          autoSwingExtreme: Math.max(0, n(body.autoSwingExtreme)),
          autoPullbackRetracement: Math.max(0, n(body.autoPullbackRetracement)),
          autoPullbackState: text(body.autoPullbackState, 64),
          autoTpPrice: Math.max(0, n(body.autoTpPrice)),
          autoSlPrice: Math.max(0, n(body.autoSlPrice)),
          autoRR: Math.max(0, n(body.autoRR)),
          autoKnownCostMoney: Math.max(0, n(body.autoKnownCostMoney)),
          autoExpectedProfitMoney: Math.max(0, n(body.autoExpectedProfitMoney)),
          autoExpectedLossMoney: Math.max(0, n(body.autoExpectedLossMoney)),
          autoAggregateRiskMoney: Math.max(0, n(body.autoAggregateRiskMoney)),
          modelConfidence: Math.max(0, Math.min(100, n(body.modelConfidence))),
          winProbability: Math.max(0, Math.min(100, n(body.winProbability))),
          winSamples: Math.max(0, Math.trunc(n(body.winSamples))),
          averageNet: n(body.averageNet)
'@ 'persist AUTO V20 journal audit metadata'

# Web: make the two concepts unmistakably separate and expose core AUTO audit.
Replace-Web '<InsightRow label="Confidence" value={Number(metrics.signalConfidence||0).toFixed(0)+"%"} tone={Number(metrics.signalConfidence||0)>=70?"good":"neutral"}/>' @'
<InsightRow label="Confidence (สูตร)" value={Number(metrics.signalConfidence||0).toFixed(0)+"%"} tone={Number(metrics.signalConfidence||0)>=70?"good":"neutral"}/>
                      {Boolean(metrics.autoV20Active) ? <>
                        <InsightRow label="Win Probability (Basket จริง)" value={Number(metrics.autoV20WinProbability||0).toFixed(1)+"% · "+Number(metrics.autoV20WinSamples||0)+" รอบ"}/>
                        <InsightRow label="กำไรเฉลี่ยสุทธิ / Basket" value={Number(metrics.autoV20AverageNet||0).toFixed(2)}/>
                        <InsightRow label="AUTO BUY / SELL" value={Number(metrics.autoV20BuyScore||0).toFixed(0)+" / "+Number(metrics.autoV20SellScore||0).toFixed(0)}/>
                        <InsightRow label="R:R แผนเข้า" value={Number(metrics.autoV20RR||0).toFixed(2)+" · Cost "+Number(metrics.autoV20KnownCostMoney||0).toFixed(2)}/>
                        <InsightRow label="AUTO Phase" value={String(metrics.autoV20Phase||"INITIALIZING")}/>
                      </> : null}
'@ 'show Formula Confidence separately from real Win Probability'

Replace-Web @'
    WAIT_FRESH_EXECUTION_EVENT: "รอ EMA reclaim / Price Action / Momentum / Zone reaction ใหม่ก่อนเข้าอีกครั้ง"
'@ @'
    WAIT_FRESH_EXECUTION_EVENT: "รอ EMA reclaim / Price Action / Momentum / Zone reaction ใหม่ก่อนเข้าอีกครั้ง",
    AUTO_V20_WAIT_CONFLICT: "AUTO รอ · คะแนน BUY/SELL ยังใกล้กันเกินไป",
    AUTO_V20_WAIT_QUALITY: "AUTO รอ · คุณภาพ Setup กลางยังไม่ถึงเกณฑ์",
    AUTO_V20_WAIT_RR: "AUTO รอ · TP/SL จริงยังไม่คุ้มความเสี่ยง",
    AUTO_V20_WAIT_ADD: "AUTO รอเพิ่มไม้ · ต้องเดินถูกทางหรือ Pullback กลับไปต่อก่อน",
    AUTO_V20_RISK_LIMIT: "AUTO ไม่เพิ่มไม้ · ความเสี่ยงรวมถึงขอบเขตที่ตั้งไว้"
'@ 'human labels for AUTO V20 waits'
Replace-Web @'
    REMOTE_CLOSE_ALL: "ปิด Basket · ผู้ใช้สั่งปิดทั้งหมด"
'@ @'
    REMOTE_CLOSE_ALL: "ปิด Basket · ผู้ใช้สั่งปิดทั้งหมด",
    AUTO_V20_STRUCTURE_STOP: "AUTO ปิด · ราคาเสียโครงสร้างที่วางไว้",
    AUTO_V20_CONFIRMED_WRONG: "AUTO ปิด · M5/M1/Momentum ยืนยันว่าเข้าไม่ถูกทาง",
    AUTO_V20_MODERATE_TARGET: "AUTO ปิด · ถึงเป้ากำไรพอประมาณ",
    AUTO_V20_PROFIT_GIVEBACK: "AUTO ปิด · กำไรย่อจาก Peak 25%",
    AUTO_V20_TIME_BANK_PROFIT: "AUTO ปิด · ถือครบช่วงประเมินและแรงเริ่มหมด",
    AUTO_V20_TIME_STOP: "AUTO ปิด · ถือเกินกรอบเวลาโดยยังไม่ฟื้น"
'@ 'human labels for AUTO V20 exits'

foreach($s in @(
  '#property version   "1.060"',
  'string g_controlMode = "LEGACY";',
  'g_setupAverageNet',
  'autoV20Diagnostics=StringFormat',
  'autoDecisionId',
  'g_basketJournalAutoDecisionId',
  'g_pendingBasketAutoDecisionId'
)){ if(-not $ea.Contains($s)){ throw "EA final sentinel missing: $s" } }
foreach($s in @('buyAverageNet','setupAverageNet','autoDecisionReason','modelConfidence','averageNet')){ if(-not $api.Contains($s)){ throw "API final sentinel missing: $s" } }
foreach($s in @('Confidence (สูตร)','Win Probability (Basket จริง)','AUTO_V20_WAIT_RR','AUTO_V20_MODERATE_TARGET')){ if(-not $web.Contains($s)){ throw "Web final sentinel missing: $s" } }

[System.IO.File]::WriteAllText((Resolve-Path $EaPath),$ea,[System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText((Resolve-Path $ApiPath),$api,[System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText((Resolve-Path $WebPath),$web,[System.Text.UTF8Encoding]::new($false))
Write-Host "AUTO V20 observability/statistics patch complete"
