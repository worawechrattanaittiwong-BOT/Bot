#property strict
#property version   "1.040"
#define SCENOVA_PRODUCT_VERSION "2.0.8"
#property description "MT5 SaaS Fast Basket Engine - Cloud/Local"
#property description "Use Demo and forward testing before live trading."

enum ENUM_ENTRY_MODE
{
   ENTRY_AUTO_MOMENTUM = 0,
   ENTRY_BUY_ONLY      = 1,
   ENTRY_SELL_ONLY     = 2
};

enum ENUM_BOT_STATE
{
   STATE_STOPPED   = 0,
   STATE_RUNNING   = 1,
   STATE_SAFE_STOP = 2
};

enum ENUM_CLOSE_REASON
{
   CLOSE_REASON_NONE        = 0,
   CLOSE_REASON_DAILY_LOSS  = 1,
   CLOSE_REASON_DAILY_PROFIT = 2,
   CLOSE_REASON_BASKET_LOSS = 3,
   CLOSE_REASON_TRAIL       = 4,
   CLOSE_REASON_SAFE_STOP   = 5,
   CLOSE_REASON_REMOTE      = 6
};

enum ENUM_RESCUE_STATE
{
   RESCUE_NORMAL   = 0,
   RESCUE_WARNING  = 1,
   RESCUE_ACTIVE   = 2,
   RESCUE_RECOVERY = 3,
   RESCUE_EXIT     = 4
};

input string          InpApiBase              = "https://snvea-bot.online/backend";
input string          InpInstanceId           = "";
input string          InpInstallToken         = "";
input long            InpMagic                = 26090501;
input double          InpLot                  = 0.01;
input int             InpMaxPositions         = 10;
input double          InpBasketTriggerMoney   = 2.00;
input double          InpBasketTrailMoney     = 0.50;
input double          InpMaxBasketLossMoney   = 10.00;
input double          InpDailyLossMoney       = 25.00;
input double          InpDailyProfitTargetMoney = 0.00;
input bool            InpDailyProfitContinueAfterTarget = false;
input double          InpDailyProfitDrawdownPercent = 20.00;
input double          InpBasketProfitTargetMoney = 0.00;
input double          InpPerPositionProfitMoney = 0.00;
input double          InpProfitRunTrailPercent = 0.00;
// AUTO = EA protects profitable Baskets, MANUAL = use the configured target,
// OFF = no money-profit exit (Broker SL and risk controls remain active).
input string          InpProfitTargetMode       = "AUTO";
// 0 = use the profile/system ATR Stop Loss. Positive = fixed manual SL distance in points.
input double          InpManualStopLossPoints  = 0.0;
// Legacy compatibility only. EA 1.017 no longer closes a Position by floating loss money.
input double          InpPerPositionLossMoney = 0.00;
// Used only while the adaptive spread profile is warming up or unavailable.
// Once enough live samples exist, the EA uses broker/symbol rolling percentiles.
// Used only when Adaptive Engine is OFF. In adaptive mode the EA learns the
// live broker/symbol spread distribution and has no fixed spread number.
input int             InpMaxSpreadPoints      = 0;
input int             InpMinOrderIntervalMs   = 300;
input int             InpMaxOrdersPerMinute   = 120;
input ENUM_ENTRY_MODE InpEntryMode            = ENTRY_AUTO_MOMENTUM;

input int             InpMomentumTicks        = 20;
input double          InpMomentumEntryPoints  = 8.0;
input double          InpStrongFlowPoints     = 25.0;
input double          InpFlowTrailBoost       = 0.60;
input bool            InpPauseOnManualTrade   = true;
input int             InpHeartbeatSeconds     = 3;
input int             InpMaxOfflineLeaseSeconds = 600;

// Adaptive Engine: deterministic, testable safeguards. The configured lot is
// always treated as a ceiling; adaptive sizing can reduce it, never increase it.
input bool            InpAdaptiveEngine        = true;
input double          InpRiskPerOrderPercent   = 0.25;
// When enabled, a risk-sized volume below the broker minimum may use the
// broker minimum lot instead of blocking the entry. This can exceed RiskPerOrder%.
input bool            InpAllowMinimumLotOverride = false;
input double          InpHardStopAtrMultiplier = 2.00;
input int             InpAtrPeriod             = 14;
input bool            InpConfidenceGateEnabled = false;
input int             InpConfidenceThreshold   = 55;
input int             InpSessionStartHour      = 0;
input int             InpSessionEndHour        = 24;
// 0 = fully adaptive. A positive value is only a soft volatility marker;
 // it never blocks trading by itself.
input double          InpMaxAtrPoints          = 0.0;

// Intelligence v4: post-entry recovery and EMA intelligence. These features
// never decide whether the first trade is permitted.
input bool            InpAdaptiveRescueEngine  = true;
input double          InpRescueMaxHedgeRatio   = 0.65;
input int             InpTimeRescueMinutes     = 20;
input bool            InpShowEmaOnChart        = true;

ENUM_BOT_STATE g_state = STATE_STOPPED;
bool   g_access = false;
bool   g_runAuthorized = false;
bool   g_trailArmed = false;
double g_peakProfit = 0.0;
double g_dayStartEquity = 0.0;
double g_dailyClosedProfit = 0.0;
bool   g_dailyProfitLocked = false;
bool   g_dailyProfitTargetArmed = false;
int    g_dayKey = -1;
int    g_basketPeakPositionCount = 0;
double g_basketCycleRealizedProfit = 0.0;
double g_profitRunPeak = 0.0;
double g_smartProfitDefenseFloor = 0.0;
double g_smartProfitDefenseLastProfit = 0.0;
string g_smartProfitDefenseReason = "NONE";
bool   g_smartProfitDefenseActive = false;
ulong  g_lastOrderMs = 0;
datetime g_orderWindowStart = 0;
int    g_ordersInWindow = 0;
datetime g_lastHeartbeat = 0;
datetime g_lastSuccessfulHeartbeat = 0;
datetime g_lastRunAuthorization = 0;
datetime g_lastServerContactAt = 0;
long   g_lastHeartbeatLatencyMs = 0;
int    g_lastHeartbeatHttpStatus = 0;
string g_executionStatus = "INITIALIZING";
long   g_lastOrderRetcode = 0;
int    g_lastOrderError = 0;
datetime g_lastOrderAt = 0;
int    g_pendingCloseReason = CLOSE_REASON_NONE;

double g_lot;
int    g_maxPositions;
double g_triggerMoney;
double g_trailMoney;
double g_maxBasketLoss;
double g_dailyLoss;
double g_dailyProfitTarget;
bool   g_dailyProfitContinueAfterTarget;
double g_dailyProfitDrawdownPercent;
double g_basketProfitTarget;
double g_perPositionProfit;
double g_profitRunTrailPercent;
string g_profitTargetMode;
double g_perPositionLoss;
double g_manualStopLossPoints;
int    g_maxSpread;
int    g_minOrderIntervalMs;
int    g_maxOrdersPerMinute;
ENUM_ENTRY_MODE g_entryMode;
bool   g_adaptiveEngine;
double g_riskPerOrderPercent;
bool   g_allowMinimumLotOverride;
double g_hardStopAtrMultiplier;
int    g_atrPeriod;
bool   g_confidenceGateEnabled;
int    g_confidenceThreshold;
int    g_sessionStartHour;
int    g_sessionEndHour;
double g_maxAtrPoints;
string g_marketRegime = "INITIALIZING";
string g_marketRegimeDetail = "INITIALIZING";
int    g_trendM1 = 0;
int    g_trendM5 = 0;
int    g_trendM15 = 0;
int    g_trendM30 = 0;
int    g_trendH1 = 0;
int    g_macroTrendDirection = 0;
string g_entryBias = "BOTH";

// Price-location intelligence. These values are derived from the same
// M1/M5/M15/M30/H1 market context used by the entry engine and are also sent
// to the web terminal for auditability.
double g_nearestSupport = 0.0;
double g_nearestResistance = 0.0;
double g_majorSupport = 0.0;
double g_majorResistance = 0.0;
double g_supportStrength = 0.0;
double g_resistanceStrength = 0.0;
double g_m5Support = 0.0;
double g_m5Resistance = 0.0;
string g_supportTimeframe = "NONE";
string g_resistanceTimeframe = "NONE";
double g_bullishOrderBlockLow = 0.0;
double g_bullishOrderBlockHigh = 0.0;
double g_bearishOrderBlockLow = 0.0;
double g_bearishOrderBlockHigh = 0.0;
double g_bullishOrderBlockStrength = 0.0;
double g_bearishOrderBlockStrength = 0.0;
double g_bullishOrderBlockQuality = 0.0;
double g_bearishOrderBlockQuality = 0.0;
int    g_bullishOrderBlockMitigations = 0;
int    g_bearishOrderBlockMitigations = 0;
int    g_bullishOrderBlockAgeBars = 0;
int    g_bearishOrderBlockAgeBars = 0;
string g_bullishOrderBlockState = "NONE";
string g_bearishOrderBlockState = "NONE";
string g_bullishOrderBlockTimeframe = "NONE";
string g_bearishOrderBlockTimeframe = "NONE";
string g_orderBlockTimeframe = "NONE";
double g_fibSwingLow = 0.0;
double g_fibSwingHigh = 0.0;
datetime g_fibSwingLowTime = 0;
datetime g_fibSwingHighTime = 0;
int    g_fibDirection = 0;
double g_fibRetracement = 0.0;
double g_fibConfluenceScore = 0.0;
double g_fibSetupScore = 0.0;
string g_fibSetupGrade = "NONE";
string g_fibTimeframe = "NONE";
int    g_fibM5Direction = 0;
double g_fibM5Retracement = 0.0;
double g_fibM5Strength = 0.0;
int    g_fibM15Direction = 0;
double g_fibM15Retracement = 0.0;
double g_fibM15Strength = 0.0;
double g_structureScore = 0.0;
double g_locationScore = 0.0;
double g_entryScore = 0.0;
double g_entryQualityScore = 0.0;
string g_entryQuality = "C";
string g_entryModel = "NONE";
string g_entryTrigger = "NONE";

// EMA Intelligence ---------------------------------------------------------
#define EMA_TF_COUNT 5
#define EMA_PERIOD_COUNT 4
int g_emaHandles[EMA_TF_COUNT][EMA_PERIOD_COUNT];
int g_emaChartHandles[EMA_PERIOD_COUNT];
double g_ema9 = 0.0;
double g_ema21 = 0.0;
double g_ema50 = 0.0;
double g_ema200 = 0.0;
double g_emaDistanceAtr = 0.0;
double g_emaConfluenceScoreBuy = 0.0;
double g_emaConfluenceScoreSell = 0.0;
int g_emaTrendM1 = 0;
int g_emaTrendM5 = 0;
int g_emaTrendM15 = 0;
int g_emaTrendM30 = 0;
int g_emaTrendH1 = 0;
string g_emaStack = "MIXED";
string g_emaSlope = "FLAT";
string g_emaVolatilityState = "NORMAL";
string g_emaPriceVs200 = "UNKNOWN";
string g_emaReclaimState = "NONE";
datetime g_lastEmaRefreshAt = 0;
datetime g_lastEmaDrawBar = 0;
datetime g_lastEmaDrawAt = 0;

// Candlestick / Price Action intelligence. Advisory only for first entries.
string g_priceActionBuy = "NONE";
string g_priceActionSell = "NONE";
double g_priceActionBuyScore = 0.0;
double g_priceActionSellScore = 0.0;

// Adaptive Basket Rescue & Recovery ---------------------------------------
bool g_rescueEnabled = true;
ENUM_RESCUE_STATE g_rescueState = RESCUE_NORMAL;
datetime g_rescueStartedAt = 0;
datetime g_rescueWarningAt = 0;
int g_rescuePrimaryDirection = 0;
int g_rescueHedgeDirection = 0;
double g_rescueHedgeLot = 0.0;
double g_rescuePrimaryVolume = 0.0;
double g_rescueNetExposure = 0.0;
double g_rescueReversalScore = 0.0;
bool g_rescueReversalConfirmed = false;
string g_rescueReversalReason = "NONE";
double g_rescueRequiredMoney = 0.0;
double g_rescueRecoveredMoney = 0.0;
double g_rescueInitialDeficit = 0.0;
double g_rescueTargetMoney = 0.0;
double g_rescueRecoveryPrice = 0.0;
double g_rescueRealizedProfit = 0.0;
double g_rescueCombinedProfit = 0.0;
double g_rescuePrimaryProfit = 0.0;
double g_rescueHedgeProfit = 0.0;
int g_rescuePartialCloseCount = 0;
long g_rescueOldestAgeSeconds = 0;
datetime g_lastRescueEvaluationAt = 0;
datetime g_lastRescueOrderAt = 0;
datetime g_rescueReversalCandidateSince = 0;
datetime g_rescuePrimaryRecoverySince = 0;
datetime g_rescueHedgeLockedUntil = 0;
double g_rescueLastAdjustedScore = 0.0;

// Anti-chase / price-location intelligence. These states are intentionally
// visible in telemetry so waiting for a pullback/retest is never a hidden gate.
bool   g_antiChaseActive = false;
int    g_antiChaseDirection = 0;
double g_exhaustionScore = 0.0;
double g_extensionAtr = 0.0;
double g_adverseWickRatio = 0.0;
string g_priceLocationState = "NORMAL";
string g_antiChaseReason = "NONE";
bool   g_breakoutRetestRequired = false;
bool   g_breakoutRetestReady = false;
double g_breakoutReferenceLevel = 0.0;

// Market-cycle intelligence. These are advisory inputs, not blanket gates.
double g_rsiM1 = 50.0;
double g_rsiM5 = 50.0;
double g_adxM5 = 0.0;
double g_plusDiM5 = 0.0;
double g_minusDiM5 = 0.0;
double g_vwapM5 = 0.0;
double g_demandZoneScore = 0.0;
double g_supplyZoneScore = 0.0;
double g_reversalOpportunityScore = 0.0;
int    g_reversalOpportunityDirection = 0;
string g_marketCycleState = "INITIALIZING";
double g_fillUrgency = 0.0;
int    g_fillExpectedPositions = 1;

// Same-side re-entry after a reversal exit is event-driven, never time-based.
int      g_marketRearmDirection = 0;
datetime g_marketRearmAt = 0;
string   g_marketRearmReason = "NONE";

datetime g_lastMarketContextUpdate = 0;
string g_fiboObjectName = "";
bool   g_fiboVisible = false;
double g_signalConfidence = 0.0;
double g_modelConfidence = 0.0;
double g_historicalWinProbability = 0.0;
int    g_historicalWinSamples = 0;
double g_buyWinProbability = 0.0;
int    g_buyWinSamples = 0;
double g_sellWinProbability = 0.0;
int    g_sellWinSamples = 0;
string g_confidenceSource = "MODEL";
double g_effectiveConfidenceThreshold = 55.0;
double g_atrPoints = 0.0;
double g_atrRatio = 1.0;
double g_adaptiveLot = 0.0;
bool   g_minimumLotOverrideActive = false;
string g_adaptiveBlockReason = "";
string g_cachedAdaptiveBlockReason = "";
int    g_consecutiveLosses = 0;
int    g_effectiveLadderTargetPositions = 1;
string g_performanceRiskMode = "NORMAL";
datetime g_lastAdaptiveEvaluation = 0;
int    g_cachedAdaptiveDirection = 0;

#define SPREAD_HISTORY_CAPACITY 1800
#define SPREAD_MIN_SAMPLES 60
double g_spreadHistory[SPREAD_HISTORY_CAPACITY];
int    g_spreadHistoryCount = 0;
int    g_spreadHistoryIndex = 0;
datetime g_lastSpreadSampleAt = 0;
double g_spreadMedian = 0.0;
double g_spreadP90 = 0.0;
double g_spreadP95 = 0.0;
double g_spreadP99 = 0.0;
double g_adaptiveSpreadLimit = 0.0;
string g_spreadStatus = "WARMUP";
int    g_spreadHighSeconds = 0;
double g_spreadConfidencePenalty = 0.0;

double g_adaptiveMomentumThreshold = 0.0;
int    g_adaptiveMaxPositions = 1;
int    g_adaptiveEntrySpacingMs = 0;
double g_atrBaselinePoints = 0.0;
double g_executionQuality = 100.0;
int    g_executionAttempts = 0;
int    g_executionAccepted = 0;
double g_averageSlippagePoints = 0.0;
datetime g_lastEntryAt = 0;
double g_pyramidProgressPoints = 0.0;
double g_pyramidRequiredPoints = 0.0;
int    g_ladderRung = 0;
double g_ladderProgressPoints = 0.0;
double g_ladderRequiredPoints = 0.0;
double g_ladderExtremePrice = 0.0;
double g_ladderPullbackPoints = 0.0;
double g_ladderPullbackRequiredPoints = 0.0;
bool   g_ladderPullbackArmed = false;
datetime g_ladderPullbackArmedAt = 0;
string g_ladderMode = "IDLE";
double g_dynamicStopPrice = 0.0;
double g_dynamicTakeProfitPrice = 0.0;
datetime g_lastDynamicProtectionAt = 0;
int    g_journalSent = 0;
int    g_journalFailed = 0;
string g_sessionProfile = "UNKNOWN";
bool   g_spreadProfileRestored = false;

long     g_basketJournalId = 0;
datetime g_basketJournalStartedAt = 0;
int      g_basketJournalDirection = 0;
double   g_basketJournalVolume = 0.0;
double   g_basketJournalProfit = 0.0;
string   g_basketJournalTrigger = "NONE";
string   g_basketJournalModel = "NONE";
string   g_basketJournalQuality = "C";
double   g_basketJournalQualityScore = 0.0;
string   g_basketJournalRegime = "UNKNOWN";
string   g_basketJournalRegimeDetail = "UNKNOWN";
double   g_basketJournalFibScore = 0.0;
double   g_basketJournalOrderBlockQuality = 0.0;
double   g_basketJournalConfidence = 0.0;
string   g_basketJournalSession = "UNKNOWN";

bool     g_pendingBasketJournal = false;
datetime g_pendingBasketRetryAt = 0;
long     g_pendingBasketId = 0;
datetime g_pendingBasketStartedAt = 0;
datetime g_pendingBasketEndedAt = 0;
int      g_pendingBasketDirection = 0;
double   g_pendingBasketVolume = 0.0;
double   g_pendingBasketProfit = 0.0;
int      g_pendingBasketPeakPositions = 0;
string   g_pendingBasketTrigger = "NONE";
string   g_pendingBasketModel = "NONE";
string   g_pendingBasketQuality = "C";
double   g_pendingBasketQualityScore = 0.0;
string   g_pendingBasketRegime = "UNKNOWN";
string   g_pendingBasketRegimeDetail = "UNKNOWN";
double   g_pendingBasketFibScore = 0.0;
double   g_pendingBasketOrderBlockQuality = 0.0;
double   g_pendingBasketConfidence = 0.0;
string   g_pendingBasketSession = "UNKNOWN";

bool   g_burstActive = false;
bool   g_burstNeedsRearm = false;
int    g_burstDirection = 0;
int    g_burstTargetPositions = 0;
int    g_burstRequestsSent = 0;
datetime g_burstStartedAt = 0;
double g_burstTargetMoney = 0.0;
double g_burstLossMoney = 0.0;
ulong  g_lastChartStatusMs = 0;

double g_ticks[128];
int    g_tickCount = 0;

string ChartStatusObjectName(string suffix)
{
   return StringFormat("SCENOVA_STATUS_%I64d_%s", InpMagic, suffix);
}

void SetChartStatusText(string suffix, string text, int y, int fontSize, color textColor)
{
   string name = ChartStatusObjectName(suffix);
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_RIGHT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_ANCHOR, ANCHOR_RIGHT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, 30);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, fontSize);
   ObjectSetInteger(0, name, OBJPROP_COLOR, textColor);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
   ObjectSetString(0, name, OBJPROP_FONT, "Segoe UI Semibold");
   ObjectSetString(0, name, OBJPROP_TEXT, text);
}

void RenderChartStatus(string connectionText, color statusColor, string executionText)
{
   string panel = ChartStatusObjectName("PANEL");
   if(ObjectFind(0, panel) < 0)
      ObjectCreate(0, panel, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, panel, OBJPROP_CORNER, CORNER_RIGHT_UPPER);
   ObjectSetInteger(0, panel, OBJPROP_XDISTANCE, 12);
   ObjectSetInteger(0, panel, OBJPROP_YDISTANCE, 16);
   ObjectSetInteger(0, panel, OBJPROP_XSIZE, 360);
   ObjectSetInteger(0, panel, OBJPROP_YSIZE, 150);
   ObjectSetInteger(0, panel, OBJPROP_BGCOLOR, C'7,11,18');
   ObjectSetInteger(0, panel, OBJPROP_COLOR, C'57,68,91');
   ObjectSetInteger(0, panel, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, panel, OBJPROP_BACK, false);
   ObjectSetInteger(0, panel, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, panel, OBJPROP_HIDDEN, true);

   SetChartStatusText("TITLE", "SCENOVA  •  " + connectionText, 30, 14, statusColor);
   SetChartStatusText("ACCOUNT", "Account   " + IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN)), 62, 11, clrWhite);
   SetChartStatusText("STATE", "State       " + StateText(), 88, 11, clrWhite);
   SetChartStatusText("EXECUTION", "Execution  " + executionText, 114, 11, C'177,187,207');
   SetChartStatusText("VERSION", "EA v1.029", 137, 9, C'104,117,142');
   ChartRedraw(0);
}

void RefreshChartStatus(bool force=false)
{
   ulong nowMs = GetTickCount64();
   if(!force && nowMs - g_lastChartStatusMs < 500)
      return;
   g_lastChartStatusMs = nowMs;

   if(MQLInfoInteger(MQL_TESTER))
   {
      RenderChartStatus("TESTER", clrDeepSkyBlue, g_executionStatus);
      return;
   }

   bool terminalOnline = TerminalConnectedNow();
   bool serverFresh = g_lastSuccessfulHeartbeat > 0 &&
      TimeCurrent() - g_lastSuccessfulHeartbeat <= InpMaxOfflineLeaseSeconds;
   string connectionText = !terminalOnline ? "MT5 OFFLINE" : serverFresh ? "CONNECTED" : "CONNECTING";
   color statusColor = !terminalOnline ? clrTomato : serverFresh ? clrLimeGreen : clrGold;
   RenderChartStatus(connectionText, statusColor, g_executionStatus);
}

void ClearChartStatus()
{
   string suffixes[6] = {"PANEL","TITLE","ACCOUNT","STATE","EXECUTION","VERSION"};
   for(int i = 0; i < ArraySize(suffixes); i++)
      ObjectDelete(0, ChartStatusObjectName(suffixes[i]));
   ChartRedraw(0);
}

ENUM_TIMEFRAMES EmaTimeframeAt(int index)
{
   if(index == 0) return PERIOD_M1;
   if(index == 1) return PERIOD_M5;
   if(index == 2) return PERIOD_M15;
   if(index == 3) return PERIOD_M30;
   return PERIOD_H1;
}

int EmaPeriodAt(int index)
{
   if(index == 0) return 9;
   if(index == 1) return 21;
   if(index == 2) return 50;
   return 200;
}

color EmaColorAt(int index)
{
   if(index == 0) return clrDodgerBlue;
   if(index == 1) return clrGold;
   if(index == 2) return clrMagenta;
   return clrRed;
}

string EmaObjectPrefix()
{
   return StringFormat("SCN_EMA_%I64d_", InpMagic);
}

bool InitializeEmaIntelligence()
{
   bool ok = true;
   for(int t = 0; t < EMA_TF_COUNT; t++)
   {
      for(int p = 0; p < EMA_PERIOD_COUNT; p++)
      {
         g_emaHandles[t][p] = iMA(
            _Symbol,
            EmaTimeframeAt(t),
            EmaPeriodAt(p),
            0,
            MODE_EMA,
            PRICE_CLOSE
         );
         if(g_emaHandles[t][p] == INVALID_HANDLE)
            ok = false;
      }
   }

   for(int p = 0; p < EMA_PERIOD_COUNT; p++)
   {
      g_emaChartHandles[p] = iMA(
         _Symbol,
         PERIOD_CURRENT,
         EmaPeriodAt(p),
         0,
         MODE_EMA,
         PRICE_CLOSE
      );
      if(g_emaChartHandles[p] == INVALID_HANDLE)
         ok = false;
   }
   return ok;
}

void DeleteEmaObjects()
{
   string prefix = EmaObjectPrefix();
   int total = ObjectsTotal(0);
   for(int i = total - 1; i >= 0; i--)
   {
      string name = ObjectName(0, i);
      if(StringFind(name, prefix) == 0)
         ObjectDelete(0, name);
   }
   ChartRedraw(0);
}

void ReleaseEmaIntelligence()
{
   for(int t = 0; t < EMA_TF_COUNT; t++)
   {
      for(int p = 0; p < EMA_PERIOD_COUNT; p++)
      {
         if(g_emaHandles[t][p] != INVALID_HANDLE)
         {
            IndicatorRelease(g_emaHandles[t][p]);
            g_emaHandles[t][p] = INVALID_HANDLE;
         }
      }
   }
   for(int p = 0; p < EMA_PERIOD_COUNT; p++)
   {
      if(g_emaChartHandles[p] != INVALID_HANDLE)
      {
         IndicatorRelease(g_emaChartHandles[p]);
         g_emaChartHandles[p] = INVALID_HANDLE;
      }
   }
   DeleteEmaObjects();
}

bool EmaValueByIndex(int tfIndex, int periodIndex, int shift, double &value)
{
   value = 0.0;
   if(tfIndex < 0 || tfIndex >= EMA_TF_COUNT ||
      periodIndex < 0 || periodIndex >= EMA_PERIOD_COUNT)
      return false;
   int handle = g_emaHandles[tfIndex][periodIndex];
   if(handle == INVALID_HANDLE)
      return false;

   double buffer[];
   ArraySetAsSeries(buffer, true);
   if(CopyBuffer(handle, 0, shift, 1, buffer) < 1)
      return false;
   value = buffer[0];
   return value > 0.0;
}

int EmaDirectionForTf(int tfIndex)
{
   double e9=0.0,e21=0.0,e50=0.0,e200=0.0;
   if(!EmaValueByIndex(tfIndex,0,1,e9) ||
      !EmaValueByIndex(tfIndex,1,1,e21) ||
      !EmaValueByIndex(tfIndex,2,1,e50) ||
      !EmaValueByIndex(tfIndex,3,1,e200))
      return 0;

   if(e9 > e21 && e21 > e50 && e50 > e200)
      return 1;
   if(e9 < e21 && e21 < e50 && e50 < e200)
      return -1;

   if(e9 > e21 && e21 > e50)
      return 1;
   if(e9 < e21 && e21 < e50)
      return -1;
   return 0;
}

double EmaConfluenceScore(int direction)
{
   int dirs[5] = {
      g_emaTrendM1,
      g_emaTrendM5,
      g_emaTrendM15,
      g_emaTrendM30,
      g_emaTrendH1
   };
   double weights[5] = {8.0, 12.0, 18.0, 22.0, 25.0};
   double score = 0.0;
   double total = 0.0;
   for(int i = 0; i < 5; i++)
   {
      total += weights[i];
      if(dirs[i] == direction)
         score += weights[i];
      else if(dirs[i] == -direction)
         score -= weights[i] * 0.35;
   }
   return MathMax(0.0, MathMin(100.0, 50.0 + score / MathMax(1.0,total) * 50.0));
}

void RefreshEmaIntelligence(bool force)
{
   datetime now = TimeCurrent();
   if(!force && g_lastEmaRefreshAt > 0 && now == g_lastEmaRefreshAt)
      return;
   g_lastEmaRefreshAt = now;

   EmaValueByIndex(1,0,1,g_ema9);
   EmaValueByIndex(1,1,1,g_ema21);
   EmaValueByIndex(1,2,1,g_ema50);
   EmaValueByIndex(1,3,1,g_ema200);

   g_emaTrendM1 = EmaDirectionForTf(0);
   g_emaTrendM5 = EmaDirectionForTf(1);
   g_emaTrendM15 = EmaDirectionForTf(2);
   g_emaTrendM30 = EmaDirectionForTf(3);
   g_emaTrendH1 = EmaDirectionForTf(4);

   if(g_ema9 > g_ema21 && g_ema21 > g_ema50 && g_ema50 > g_ema200)
      g_emaStack = "BULL_9>21>50>200";
   else if(g_ema9 < g_ema21 && g_ema21 < g_ema50 && g_ema50 < g_ema200)
      g_emaStack = "BEAR_9<21<50<200";
   else
      g_emaStack = "MIXED";

   double e9Past=0.0,e21Past=0.0,e50Past=0.0;
   EmaValueByIndex(1,0,4,e9Past);
   EmaValueByIndex(1,1,4,e21Past);
   EmaValueByIndex(1,2,4,e50Past);
   int up = 0;
   int down = 0;
   if(g_ema9 > e9Past) up++; else if(g_ema9 < e9Past) down++;
   if(g_ema21 > e21Past) up++; else if(g_ema21 < e21Past) down++;
   if(g_ema50 > e50Past) up++; else if(g_ema50 < e50Past) down++;
   g_emaSlope = up >= 2 ? "UP" : down >= 2 ? "DOWN" : "FLAT";

   MqlTick tick;
   double price = 0.0;
   if(SymbolInfoTick(_Symbol, tick))
      price = (tick.bid + tick.ask) * 0.5;

   g_emaPriceVs200 = price > 0.0 && g_ema200 > 0.0
      ? (price >= g_ema200 ? "ABOVE_EMA200" : "BELOW_EMA200")
      : "UNKNOWN";

   double atrPrice = MathMax(
      _Point * 10.0,
      AverageTrueRangePoints(PERIOD_M5, g_atrPeriod) * _Point
   );
   double hi = MathMax(g_ema9, MathMax(g_ema21, g_ema50));
   double lo = MathMin(g_ema9, MathMin(g_ema21, g_ema50));
   double bandAtr = atrPrice > 0.0 ? (hi - lo) / atrPrice : 0.0;
   g_emaDistanceAtr = price > 0.0 && g_ema21 > 0.0 && atrPrice > 0.0
      ? MathAbs(price - g_ema21) / atrPrice
      : 0.0;

   if(bandAtr <= 0.18)
      g_emaVolatilityState = "COMPRESSION";
   else if(bandAtr >= 0.65)
      g_emaVolatilityState = "EXPANSION";
   else
      g_emaVolatilityState = "NORMAL";

   g_emaConfluenceScoreBuy = EmaConfluenceScore(1);
   g_emaConfluenceScoreSell = EmaConfluenceScore(-1);

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   double e21Now=0.0,e21Prev=0.0;
   if(CopyRates(_Symbol, PERIOD_M5, 1, 2, rates) >= 2 &&
      EmaValueByIndex(1,1,1,e21Now) &&
      EmaValueByIndex(1,1,2,e21Prev))
   {
      if(rates[1].close <= e21Prev && rates[0].close > e21Now)
         g_emaReclaimState = "RECLAIM_EMA21_UP";
      else if(rates[1].close >= e21Prev && rates[0].close < e21Now)
         g_emaReclaimState = "LOSE_EMA21_DOWN";
      else
         g_emaReclaimState = "NONE";
   }
}

void DrawEmaCurves()
{
   if(!InpShowEmaOnChart || MQLInfoInteger(MQL_TESTER))
      return;

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   const int bars = 70;
   if(CopyRates(_Symbol, PERIOD_CURRENT, 0, bars + 1, rates) < bars + 1)
      return;

   datetime currentBar = rates[0].time;
   datetime now = TimeCurrent();
   if(g_lastEmaDrawBar == currentBar &&
      g_lastEmaDrawAt > 0 &&
      now - g_lastEmaDrawAt < 5)
      return;
   g_lastEmaDrawBar = currentBar;
   g_lastEmaDrawAt = now;

   string prefix = EmaObjectPrefix();
   for(int p = 0; p < EMA_PERIOD_COUNT; p++)
   {
      int handle = g_emaChartHandles[p];
      if(handle == INVALID_HANDLE)
         continue;

      double values[];
      ArraySetAsSeries(values, true);
      if(CopyBuffer(handle, 0, 0, bars + 1, values) < bars + 1)
         continue;

      color lineColor = EmaColorAt(p);
      int width = p >= 2 ? 2 : 1;
      for(int i = 0; i < bars; i++)
      {
         string name = prefix + IntegerToString(EmaPeriodAt(p)) + "_" + IntegerToString(i);
         if(ObjectFind(0, name) < 0)
         {
            if(!ObjectCreate(
               0,name,OBJ_TREND,0,
               rates[i+1].time,values[i+1],
               rates[i].time,values[i]
            ))
               continue;
         }
         else
         {
            ObjectMove(0,name,0,rates[i+1].time,values[i+1]);
            ObjectMove(0,name,1,rates[i].time,values[i]);
         }

         ObjectSetInteger(0,name,OBJPROP_COLOR,lineColor);
         ObjectSetInteger(0,name,OBJPROP_WIDTH,width);
         ObjectSetInteger(0,name,OBJPROP_RAY_RIGHT,false);
         ObjectSetInteger(0,name,OBJPROP_BACK,true);
         ObjectSetInteger(0,name,OBJPROP_SELECTABLE,false);
         ObjectSetInteger(0,name,OBJPROP_HIDDEN,true);
      }

      string labelName = prefix + "LABEL_" + IntegerToString(EmaPeriodAt(p));
      if(ObjectFind(0,labelName) < 0)
         ObjectCreate(0,labelName,OBJ_LABEL,0,0,0);
      ObjectSetInteger(0,labelName,OBJPROP_CORNER,CORNER_LEFT_UPPER);
      ObjectSetInteger(0,labelName,OBJPROP_XDISTANCE,12);
      ObjectSetInteger(0,labelName,OBJPROP_YDISTANCE,20 + p * 17);
      ObjectSetInteger(0,labelName,OBJPROP_FONTSIZE,9);
      ObjectSetInteger(0,labelName,OBJPROP_COLOR,lineColor);
      ObjectSetInteger(0,labelName,OBJPROP_SELECTABLE,false);
      ObjectSetString(
         0,labelName,OBJPROP_TEXT,
         "EMA " + IntegerToString(EmaPeriodAt(p)) + "  " +
         DoubleToString(values[0], SymbolDigitsNow())
      );
   }
   ChartRedraw(0);
}

double EmaTrailReference(int direction)
{
   RefreshEmaIntelligence(false);
   if(g_ema21 <= 0.0 || g_ema50 <= 0.0)
      return 0.0;

   if(direction > 0)
      return g_marketRegimeDetail == "TREND_ACCELERATION"
         ? MathMax(g_ema21,g_ema50)
         : g_ema21;
   return g_marketRegimeDetail == "TREND_ACCELERATION"
      ? MathMin(g_ema21,g_ema50)
      : g_ema21;
}

int OnInit()
{
   for(int t = 0; t < EMA_TF_COUNT; t++)
      for(int p = 0; p < EMA_PERIOD_COUNT; p++)
         g_emaHandles[t][p] = INVALID_HANDLE;
   for(int p = 0; p < EMA_PERIOD_COUNT; p++)
      g_emaChartHandles[p] = INVALID_HANDLE;

   g_lot = InpLot;
   g_maxPositions = InpMaxPositions;
   g_triggerMoney = InpBasketTriggerMoney;
   g_trailMoney = InpBasketTrailMoney;
   g_maxBasketLoss = InpMaxBasketLossMoney;
   g_dailyLoss = InpDailyLossMoney;
   g_dailyProfitTarget = InpDailyProfitTargetMoney;
   g_dailyProfitContinueAfterTarget = InpDailyProfitContinueAfterTarget;
   g_dailyProfitDrawdownPercent = MathMax(0.0, MathMin(95.0, InpDailyProfitDrawdownPercent));
   g_basketProfitTarget = InpBasketProfitTargetMoney;
   g_perPositionProfit = InpPerPositionProfitMoney;
   g_profitRunTrailPercent = InpProfitRunTrailPercent;
   g_profitTargetMode = InpProfitTargetMode;
   StringToUpper(g_profitTargetMode);
   if(g_profitTargetMode != "AUTO" &&
      g_profitTargetMode != "MANUAL" &&
      g_profitTargetMode != "OFF")
      g_profitTargetMode =
         (g_basketProfitTarget > 0.0 || g_perPositionProfit > 0.0)
         ? "MANUAL" : "AUTO";

   // Two mutually-exclusive profit modes:
   // 1) Basket target, optionally followed by percentage giveback from peak.
   // 2) Per-position target, closing each Position independently.
   if(g_profitTargetMode != "MANUAL")
   {
      g_basketProfitTarget = 0.0;
      g_perPositionProfit = 0.0;
      g_profitRunTrailPercent = 0.0;
      g_triggerMoney = 0.0;
      g_trailMoney = 0.0;
   }
   else if(g_perPositionProfit > 0.0)
   {
      g_basketProfitTarget = 0.0;
      g_profitRunTrailPercent = 0.0;
      g_triggerMoney = 0.0;
      g_trailMoney = 0.0;
   }
   else if(g_basketProfitTarget > 0.0)
   {
      g_triggerMoney = 0.0;
      g_trailMoney = 0.0;
   }
   else
   {
      g_profitRunTrailPercent = 0.0;
   }
   // Money-based per-position loss is retired in 1.017. A real Broker SL is
   // always used instead: manual fixed distance when enabled, otherwise system ATR.
   g_perPositionLoss = 0.0;
   g_manualStopLossPoints = MathMax(0.0, InpManualStopLossPoints);
   g_maxSpread = InpMaxSpreadPoints;
   g_minOrderIntervalMs = InpMinOrderIntervalMs;
   g_maxOrdersPerMinute = InpMaxOrdersPerMinute;
   g_entryMode = InpEntryMode;
   g_adaptiveEngine = InpAdaptiveEngine;
   g_riskPerOrderPercent = MathMax(0.01, MathMin(5.0, InpRiskPerOrderPercent));
   g_allowMinimumLotOverride = InpAllowMinimumLotOverride;
   g_hardStopAtrMultiplier = MathMax(0.5, MathMin(10.0, InpHardStopAtrMultiplier));
   g_atrPeriod = MathMax(5, MathMin(100, InpAtrPeriod));
   g_confidenceGateEnabled = InpConfidenceGateEnabled;
   g_confidenceThreshold = MathMax(40, MathMin(95, InpConfidenceThreshold));
   g_sessionStartHour = MathMax(0, MathMin(23, InpSessionStartHour));
   g_sessionEndHour = MathMax(1, MathMin(24, InpSessionEndHour));
   g_maxAtrPoints = MathMax(0.0, InpMaxAtrPoints);
   g_rescueEnabled = InpAdaptiveRescueEngine;
   g_adaptiveMomentumThreshold = InpMomentumEntryPoints;
   g_adaptiveMaxPositions = g_maxPositions;
   g_adaptiveEntrySpacingMs = g_minOrderIntervalMs;

   RestoreDailyRiskState();
   RestoreAdaptiveRiskState();
   RestoreSpreadProfile();
   LoadBasketCycleState();
   ApplyUnifiedTradingEngine();

   if(!InitializeEmaIntelligence())
      Print("EMA Intelligence: one or more EMA handles are not ready yet.");
   RefreshEmaIntelligence(true);
   DrawEmaCurves();
   RestoreRescueState();

   if(!MQLInfoInteger(MQL_TESTER))
   {
      bool apiOk = (StringFind(InpApiBase, "https://") == 0 || StringFind(InpApiBase, "http://") == 0);
      if(!apiOk || StringLen(InpInstanceId) < 8 || StringLen(InpInstallToken) < 8)
      {
         Print("SCENOVA CONFIG ERROR: connection settings are missing. Load SCENOVA-FastBasketBot.set in Inputs.");
         RenderChartStatus("CONFIG REQUIRED", clrTomato, "Load SCENOVA-FastBasketBot.set");
         return(INIT_PARAMETERS_INCORRECT);
      }
   }

   // A 200 ms timer drives the controlled multi-position queue. Heartbeat keeps
   // its own second-based gate and is never sent at this frequency.
   EventSetMillisecondTimer(200);

   // Strategy Tester cannot use WebRequest. In tester mode only,
   // run the trading engine locally so historical tests work even when markets are closed.
   if(MQLInfoInteger(MQL_TESTER))
   {
      g_access = true;
      g_runAuthorized = true;
      g_state = STATE_RUNNING;
      g_lastSuccessfulHeartbeat = TimeCurrent();
      g_lastRunAuthorization = TimeCurrent();
      Print("Strategy Tester mode: SaaS heartbeat bypassed for historical testing only.");
   }

   RefreshChartStatus(true);
   Print("Bot SaaS EA initialized. Instance=", InpInstanceId);
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   DeleteTradingFibonacci();
   ReleaseEmaIntelligence();
   ClearChartStatus();
}

void OnTick()
{
   UpdateMomentum();
   SampleSpread();
   RefreshEmaIntelligence(false);
   DrawEmaCurves();
   RefreshDailyBaselineIfNeeded();

   if(g_access && g_lastSuccessfulHeartbeat > 0 &&
      TimeCurrent() - g_lastSuccessfulHeartbeat > InpMaxOfflineLeaseSeconds)
   {
      Print("SaaS lease expired while API is unreachable. Disabling new entries.");
      g_access = false;
      g_runAuthorized = false;
   }

   int count = BasketPositionCount();
   int rescueCount = RescuePositionCount();
   if(count > 0)
   {
      UpdateBasketPeakPositionCount(count);
      EnsureBurstTargets(g_burstActive ? MathMax(1, g_burstTargetPositions) : count);
   }
   else if(rescueCount <= 0)
      ResetBasketCycleState();

   double profit = BasketProfit();
   double momentum = MomentumPoints();
   double dailyProfit = DailyBotProfit();
   g_executionStatus = "EVALUATING";

   if(g_pendingCloseReason != CLOSE_REASON_NONE)
   {
      g_state = STATE_SAFE_STOP;
      g_runAuthorized = false;
      bool closed = CloseAllBasket(CloseReasonText(g_pendingCloseReason));
      g_executionStatus = closed ? CloseCompletionStatus(g_pendingCloseReason) : "CLOSE_RETRY";
      return;
   }

   if(HandleDailyProfitControl(count))
      return;

   if(g_dailyLoss > 0.0 && AccountInfoDouble(ACCOUNT_EQUITY) <= g_dayStartEquity - g_dailyLoss)
   {
      if(count > 0 || rescueCount > 0) CloseAllBasket("DAILY_LOSS");
      g_state = STATE_SAFE_STOP;
      g_runAuthorized = false;
      g_executionStatus = "DAILY_LOSS_LOCK";
      return;
   }

   if(count <= 0 && rescueCount > 0)
   {
      RefreshMarketContext(false);
      ManageAdaptiveRescue();
      g_executionStatus = "RESCUE_EXIT";
      return;
   }

   if(count > 0)
   {
      // Dynamic protection never decides whether an entry is allowed. It only
      // manages exits after a Position exists.
      RefreshMarketContext(false);
      RecoverOpenBasketJournal();
      ManageDynamicProtection();

      bool rescueManaging = ManageAdaptiveRescue();
      if(g_rescueState == RESCUE_ACTIVE ||
         g_rescueState == RESCUE_RECOVERY ||
         g_rescueState == RESCUE_EXIT)
      {
         double rescueLossLimit = EffectiveBasketLossLimit();
         double rescueCycleProfit = RescueCombinedCycleProfit();
         if(rescueLossLimit > 0.0 && rescueCycleProfit <= -rescueLossLimit)
         {
            CloseAllBasket("MAX_BASKET_LOSS");
            ResetTrail();
            return;
         }

         // Rescue/Recovery owns position management until the Cycle is closed
         // or the original structure recovers. It never affects first entry.
         if(rescueManaging)
            return;
      }

      // Per-position profit/loss controls are evaluated before basket-level
      // controls. Per-position profit and total Basket profit are mutually
      // exclusive settings, enforced by both Server and EA.
      bool closedIndividual = g_profitTargetMode == "MANUAL"
         ? ManagePerPositionTargets()
         : false;
      if(closedIndividual)
      {
         count = BasketPositionCount();
         profit = BasketProfit();
         dailyProfit = DailyBotProfit();

         if(HandleDailyProfitControl(count))
            return;

         if(count == 0)
         {
            ResetTrail();
            ResetBasketCycleState();
            g_executionStatus = "POSITION_TARGET_CLOSED";
            return;
         }
      }

      double cycleProfit = BasketCycleProfit();
      double effectiveBasketTarget = EffectiveBasketProfitTarget();

      // Auto mode protects a genuinely positive Cycle. A confirmed reversal
      // may bank profit before the dynamic target instead of letting a winner
      // turn red. Manual and Off are never overridden by this decision.
      int profitDefenseDirection = BasketDirection();
      string profitDefenseReason = "NONE";
      if(g_profitTargetMode == "AUTO" &&
         profitDefenseDirection != 0 &&
         SmartProfitReversalDetected(
            profitDefenseDirection,
            cycleProfit,
            profitDefenseReason
         ))
      {
         CloseAllBasket("SMART_PROFIT_REVERSAL");
         ArmMarketRearm(profitDefenseDirection,profitDefenseReason);
         ResetTrail();
         g_executionStatus = "SMART_PROFIT_REVERSAL";
         g_adaptiveBlockReason = profitDefenseReason;
         return;
      }

      if(g_profitTargetMode == "AUTO" &&
         AutoProfitGivebackDetected(profitDefenseDirection,cycleProfit))
      {
         CloseAllBasket("AUTO_PROFIT_GIVEBACK");
         ArmMarketRearm(profitDefenseDirection,"PROFIT_GIVEBACK");
         ResetTrail();
         g_executionStatus = "AUTO_PROFIT_GIVEBACK";
         return;
      }

      // If no manual Basket/per-position target is configured, multi-position
      // trading falls back to an automatic cycle target.
      if(g_profitTargetMode == "MANUAL" &&
         g_basketProfitTarget > 0.0 && g_perPositionProfit <= 0.0)
      {
         if(g_profitRunTrailPercent > 0.0)
         {
            // Arm percentage giveback only after the configured Basket target
            // has actually been reached. Before that, do not trail profit.
            if(g_profitRunPeak <= 0.0 && cycleProfit >= g_basketProfitTarget)
            {
               g_profitRunPeak = cycleProfit;
               SaveBasketCycleState();
               g_executionStatus = "BASKET_PROFIT_RUN_ON";
            }

            if(g_profitRunPeak > 0.0)
            {
               if(cycleProfit > g_profitRunPeak)
               {
                  g_profitRunPeak = cycleProfit;
                  SaveBasketCycleState();
               }

               double closeLevel =
                  g_profitRunPeak * (1.0 - g_profitRunTrailPercent / 100.0);
               if(cycleProfit <= closeLevel)
               {
                  CloseAllBasket("PROFIT_RUN_PERCENT_TRAIL");
                  ResetTrail();
                  g_executionStatus = "PROFIT_RUN_PERCENT_TRAIL";
                  return;
               }
            }
         }
         else if(cycleProfit >= g_basketProfitTarget)
         {
            CloseAllBasket("BASKET_PROFIT_TARGET");
            ResetTrail();
            g_executionStatus = "BASKET_PROFIT_TARGET";
            return;
         }
      }
      else if(g_profitTargetMode == "AUTO" &&
              g_perPositionProfit <= 0.0 &&
              effectiveBasketTarget > 0.0)
      {
         // Automatic Basket mode protects a meaningful unrealized winner when
         // the execution structure rolls over before the full target. Explicit
         // user Basket/position targets are never overridden by this logic.
         if(cycleProfit > g_profitRunPeak + 0.05)
         {
            g_profitRunPeak = cycleProfit;
            SaveBasketCycleState();
         }

         if(cycleProfit >= effectiveBasketTarget)
         {
            CloseAllBasket("BASKET_PROFIT_TARGET");
            ResetTrail();
            g_executionStatus = "BASKET_PROFIT_TARGET";
            return;
         }

      }

      double effectiveBasketLoss = EffectiveBasketLossLimit();
      double lossControlProfit =
         (g_rescueState != RESCUE_NORMAL || RescuePositionCount() > 0)
         ? RescueCombinedCycleProfit()
         : (BasketFillEnabled() ? cycleProfit : profit);
      if(effectiveBasketLoss > 0.0 && lossControlProfit <= -effectiveBasketLoss)
      {
         CloseAllBasket("MAX_BASKET_LOSS");
         ResetTrail();
         return;
      }

      if(g_triggerMoney > 0.0 && g_trailMoney > 0.0 &&
         !g_trailArmed && profit >= g_triggerMoney)
      {
         g_trailArmed = true;
         g_peakProfit = profit;
      }

      if(g_trailArmed)
      {
         if(profit > g_peakProfit) g_peakProfit = profit;

         double effectiveTrail = g_trailMoney;
         int basketDirection = BasketDirection();

         bool flowStrong =
            (basketDirection > 0 && momentum >= InpStrongFlowPoints) ||
            (basketDirection < 0 && momentum <= -InpStrongFlowPoints);

         if(flowStrong)
            effectiveTrail = g_trailMoney * (1.0 + MathMax(0.0, InpFlowTrailBoost));

         if(g_adaptiveEngine)
         {
            if((g_marketRegime == "TREND_UP" || g_marketRegime == "TREND_DOWN") &&
               flowStrong && g_signalConfidence >= g_confidenceThreshold + 10)
               effectiveTrail *= 1.35;
            else if(g_marketRegime == "RANGE" ||
                    g_signalConfidence < g_confidenceThreshold + 5)
               effectiveTrail *= 0.70;
         }

         if(profit <= g_peakProfit - effectiveTrail)
         {
            CloseAllBasket("PROFIT_TRAIL");
            ResetTrail();
            return;
         }
      }

      if(g_state == STATE_SAFE_STOP && !g_trailArmed && profit >= 0.0)
      {
         CloseAllBasket("SAFE_STOP_BREAKEVEN");
         ResetTrail();
         return;
      }

      if(closedIndividual)
      {
         // Do not replace a position on the same tick that it was closed by
         // a profit/loss rule. Re-evaluate the basket on the next market tick.
         return;
      }
   }
   else
   {
      ResetTrail();
      ResetBasketCycleState();
      if(g_state == STATE_SAFE_STOP)
      {
         g_state = STATE_STOPPED;
         g_executionStatus = "STOPPED";
         return;
      }
   }

   if(g_state != STATE_RUNNING)
   {
      g_executionStatus = (g_state == STATE_SAFE_STOP ? "SAFE_STOP" : "STOPPED");
      return;
   }

   if(!g_access)
   {
      g_executionStatus = "NO_ACCESS";
      return;
   }

   // New orders are allowed only while the website has very recently
   // confirmed desiredState=RUNNING. Existing positions can still be managed.
   if(!MQLInfoInteger(MQL_TESTER) && !EntryLeaseValid())
   {
      g_executionStatus = "CONTROL_NOT_FRESH";
      return;
   }

   // WARNING pauses only additional positions while Rescue evaluates the open
   // Basket. It is post-entry management, not a first-entry filter.
   if(count > 0 && g_rescueState == RESCUE_WARNING)
   {
      g_executionStatus = g_rescueOldestAgeSeconds >= RescueTimeThresholdSeconds()
         ? "TIME_RESCUE_WARNING"
         : "RESCUE_WARNING";
      return;
   }

   string permissionStatus = TradePermissionStatus();
   if(permissionStatus != "OK")
   {
      g_executionStatus = permissionStatus;
      return;
   }

   if(BasketFillEnabled() && g_burstActive)
   {
      ProcessBurstQueue();
      return;
   }

   if(BasketFillEnabled() && count > 0)
   {
      g_executionStatus = g_burstTargetPositions > 0 && g_burstRequestsSent >= g_burstTargetPositions
         ? "BASKET_FILL_COMPLETE"
         : "BASKET_MANAGING";
      return;
   }

   // A completed Basket can start a new cycle as soon as a fresh signal passes.
   // There is no profile-specific rearm wait or hidden cooldown.
   g_burstNeedsRearm = false;

   if(!CanSendOrder())
   {
      g_executionStatus = "ORDER_RATE_LIMIT";
      return;
   }

   if(!AdaptiveSpreadAllowed())
   {
      g_executionStatus = "SPREAD_TOO_HIGH";
      return;
   }

   int direction = AdaptiveEntryDirection(momentum);
   if(direction == 0)
   {
      g_executionStatus = g_adaptiveBlockReason == "" ? "WAITING_MOMENTUM" : g_adaptiveBlockReason;
      return;
   }

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

   if(count >= (g_adaptiveEngine ? g_adaptiveMaxPositions : g_maxPositions))
   {
      g_executionStatus = "MAX_POSITIONS";
      return;
   }

   // Never hedge against the current basket. Check this before the add gate
   // so a trend flip is reported honestly as a direction lock, not as a vague
   // "waiting to add" state.
   if(count > 0)
   {
      int basketDirection = BasketDirection();
      if(basketDirection == 0)
      {
         g_executionStatus = "MIXED_BASKET_BLOCKED";
         return;
      }
      if(direction != basketDirection)
      {
         g_executionStatus = "WAITING_DIRECTION_LOCK";
         return;
      }
   }

   if(count > 0 && !BasketFillEnabled() && !AdaptiveBasketAddAllowed(direction))
   {
      g_executionStatus = "WAITING_BASKET_ADD";
      return;
   }

   if(!OpenTradingAllowedForDirection(direction))
   {
      g_executionStatus = "SYMBOL_DIRECTION_BLOCKED";
      return;
   }

   if(!MarketLocationEntryAllowed(direction, false))
   {
      g_executionStatus = g_adaptiveBlockReason;
      return;
   }

   g_executionStatus = direction > 0 ? "READY_BUY" : "READY_SELL";
   bool sent = SendMarketOrder(direction);
   if(sent || BasketFillEnabled())
   {
      RegisterOrderRequest();
      if(BasketFillEnabled())
         ArmBurst(direction);
   }
}

void OnTimer()
{
   SampleSpread();
   RefreshEmaIntelligence(false);
   DrawEmaCurves();

   if(MQLInfoInteger(MQL_TESTER))
   {
      ProcessBurstQueue();
      RefreshChartStatus();
      return;
   }

   datetime now = TimeCurrent();
   int heartbeatSeconds = MathMax(1, InpHeartbeatSeconds);
   if(now - g_lastHeartbeat >= heartbeatSeconds)
   {
      g_lastHeartbeat = now;
      SendHeartbeat();
   }
   FlushPendingBasketJournal();
   ProcessBurstQueue();
   RefreshChartStatus();
}

void OnTradeTransaction(
   const MqlTradeTransaction &trans,
   const MqlTradeRequest &request,
   const MqlTradeResult &result
)
{
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD || trans.deal == 0)
      return;

   if(!HistoryDealSelect(trans.deal))
      return;

   string symbol = HistoryDealGetString(trans.deal, DEAL_SYMBOL);
   long magic = HistoryDealGetInteger(trans.deal, DEAL_MAGIC);

   if(symbol == _Symbol && magic == RescueMagic())
   {
      double rescueDealNet =
         HistoryDealGetDouble(trans.deal,DEAL_PROFIT) +
         HistoryDealGetDouble(trans.deal,DEAL_SWAP) +
         HistoryDealGetDouble(trans.deal,DEAL_COMMISSION);

      g_rescueRealizedProfit += rescueDealNet;
      if(g_basketJournalId != 0)
         g_basketJournalProfit += rescueDealNet;

      RecalculateDailyClosedProfit();
      SaveRescueState();
      PostRescueJournalDeal(trans.deal);

      long rescueEntry = HistoryDealGetInteger(trans.deal,DEAL_ENTRY);
      if((rescueEntry == DEAL_ENTRY_OUT ||
          rescueEntry == DEAL_ENTRY_OUT_BY ||
          rescueEntry == DEAL_ENTRY_INOUT) &&
         BasketPositionCount() == 0 &&
         RescuePositionCount() == 0)
         FinalizeBasketJournal();
      return;
   }

   if(symbol == _Symbol && magic == InpMagic)
   {
      RecordBasketDeal(trans.deal);
      RecalculateDailyClosedProfit();
      TrackBasketJournalDeal(trans.deal);

      // Journal is best-effort observability only. A network/database failure
      // must never change trading state or block order execution.
      PostTradeJournalDeal(trans.deal);

      long dealEntry = HistoryDealGetInteger(trans.deal, DEAL_ENTRY);
      if(BasketFillEnabled() &&
         (dealEntry == DEAL_ENTRY_OUT || dealEntry == DEAL_ENTRY_OUT_BY) &&
         BasketPositionCount() == 0)
      {
         g_burstActive = false;
         g_burstNeedsRearm = false;
         g_burstTargetPositions = 0;
         g_burstRequestsSent = 0;
         g_burstTargetMoney = 0.0;
         g_burstLossMoney = 0.0;
      }
      return;
   }

   if(InpPauseOnManualTrade &&
      symbol == _Symbol &&
      !IsScenovaMagic(magic) &&
      g_state == STATE_RUNNING)
   {
      Print("Manual/external trade detected on ", _Symbol, ". Entering SAFE_STOP.");
      g_state = STATE_SAFE_STOP;
      g_runAuthorized = false;
   }
}

string OpenPositionsTelemetryJson()
{
   string json = "[";
   bool first = true;
   MqlTick tick;
   bool haveTick = SymbolInfoTick(_Symbol, tick);
   int digits = SymbolDigitsNow();

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol ||
         PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;

      long type = PositionGetInteger(POSITION_TYPE);
      string side = type == POSITION_TYPE_BUY ? "BUY" : "SELL";
      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl = PositionGetDouble(POSITION_SL);
      double volume = PositionGetDouble(POSITION_VOLUME);
      double profit =
         PositionGetDouble(POSITION_PROFIT) +
         PositionGetDouble(POSITION_SWAP);
      double currentPrice = openPrice;
      if(haveTick)
         currentPrice = type == POSITION_TYPE_BUY ? tick.bid : tick.ask;
      double movePoints = 0.0;
      if(_Point > 0.0)
         movePoints = type == POSITION_TYPE_BUY
            ? (currentPrice - openPrice) / _Point
            : (openPrice - currentPrice) / _Point;
      double slDistancePoints = 0.0;
      if(sl > 0.0 && _Point > 0.0)
         slDistancePoints = MathAbs(currentPrice - sl) / _Point;

      string item = StringFormat(
         "{\"ticket\":\"%I64u\",\"side\":\"%s\",\"volume\":%.4f,\"openPrice\":%s,\"currentPrice\":%s,\"sl\":%s,\"profit\":%.2f,\"movePoints\":%.1f,\"slDistancePoints\":%.1f,\"openedAt\":%I64d}",
         ticket,
         side,
         volume,
         DoubleToString(openPrice, digits),
         DoubleToString(currentPrice, digits),
         DoubleToString(sl, digits),
         profit,
         movePoints,
         slDistancePoints,
         (long)PositionGetInteger(POSITION_TIME)
      );

      if(!first)
         json += ",";
      json += item;
      first = false;
   }

   json += "]";
   return json;
}

string ChartBarsTelemetryJson(ENUM_TIMEFRAMES timeframe, int maxBars)
{
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int requested = MathMax(20, MathMin(120, maxBars));
   int copied = CopyRates(_Symbol, timeframe, 0, requested, rates);
   if(copied <= 0)
      return "[]";

   int digits = SymbolDigitsNow();
   string json = "[";
   bool first = true;

   for(int i = copied - 1; i >= 0; i--)
   {
      if(!first)
         json += ",";
      json += StringFormat(
         "{\"time\":%I64d,\"open\":%s,\"high\":%s,\"low\":%s,\"close\":%s,\"volume\":%I64d}",
         (long)rates[i].time,
         DoubleToString(rates[i].open, digits),
         DoubleToString(rates[i].high, digits),
         DoubleToString(rates[i].low, digits),
         DoubleToString(rates[i].close, digits),
         (long)rates[i].tick_volume
      );
      first = false;
   }

   json += "]";
   return json;
}

string ChartTelemetryJson()
{
   return
      "{\"M1\":"  + ChartBarsTelemetryJson(PERIOD_M1, 80) +
      ",\"M5\":"  + ChartBarsTelemetryJson(PERIOD_M5, 80) +
      ",\"M15\":" + ChartBarsTelemetryJson(PERIOD_M15, 80) +
      ",\"H1\":"  + ChartBarsTelemetryJson(PERIOD_H1, 80) + "}";
}

void SendHeartbeat()
{
   if(StringLen(InpApiBase) < 8 || StringLen(InpInstanceId) < 8 || StringLen(InpInstallToken) < 8)
      return;

   string stateText = StateText();
   string terminalConnected = TerminalConnectedNow() ? "true" : "false";
   string terminalTradeAllowed = TerminalTradeAllowedNow() ? "true" : "false";
   string mqlTradeAllowed = EaTradeAllowedNow() ? "true" : "false";
   string accountTradeAllowed = AccountTradeAllowedNow() ? "true" : "false";
   string accountTradeExpert = AccountExpertAllowedNow() ? "true" : "false";
   string tradeReady = TradePermissionStatus() == "OK" ? "true" : "false";
   string dailyProfitLockedText = g_dailyProfitLocked ? "true" : "false";
   string dailyProfitTargetArmedText = g_dailyProfitTargetArmed ? "true" : "false";
   string dailyProfitContinueText = g_dailyProfitContinueAfterTarget ? "true" : "false";
   string adaptiveEngineText = g_adaptiveEngine ? "true" : "false";
   string minimumLotOverrideEnabledText = g_allowMinimumLotOverride ? "true" : "false";
   string minimumLotOverrideActiveText = g_minimumLotOverrideActive ? "true" : "false";
   double telemetrySpreadLimit = g_adaptiveEngine && g_adaptiveSpreadLimit > 0.0
      ? g_adaptiveSpreadLimit
      : (double)g_maxSpread;
   double telemetryLot = g_adaptiveEngine && g_adaptiveLot > 0.0
      ? g_adaptiveLot
      : NormalizeTradeVolume(g_lot);

   string payload = StringFormat(
      "{\"instanceId\":\"%s\",\"installToken\":\"%s\",\"state\":\"%s\",\"metrics\":{\"accountNumber\":\"%s\",\"eaVersion\":\"1.040\",\"productVersion\":\"%s\",\"symbol\":\"%s\",\"server\":\"%s\",\"currency\":\"%s\",\"balance\":%.2f,\"equity\":%.2f,\"basketProfit\":%.2f,\"basketCycleProfit\":%.2f,\"basketProfitTarget\":%.2f,\"basketPeakPositions\":%d,\"perPositionProfitTarget\":%.2f,\"profitRunTrailPercent\":%.2f,\"profitRunPeak\":%.2f,\"perPositionLoss\":%.2f,\"dailyProfit\":%.2f,\"dailyProfitTarget\":%.2f,\"dailyProfitContinueAfterTarget\":%s,\"dailyProfitDrawdownPercent\":%.2f,\"dailyProfitTargetArmed\":%s,\"dailyProfitGivebackFloor\":%.2f,\"dailyProfitLocked\":%s,\"peakProfit\":%.2f,\"positions\":%d,\"spreadPoints\":%.1f,\"spreadPrice\":%s,\"pointSize\":%s,\"symbolDigits\":%d,\"maxSpreadPrice\":%s,\"momentumPoints\":%.1f,\"momentumEntryPoints\":%.1f,\"maxSpreadPoints\":%d,\"terminalConnected\":%s,\"terminalTradeAllowed\":%s,\"mqlTradeAllowed\":%s,\"accountTradeAllowed\":%s,\"accountTradeExpert\":%s,\"tradeReady\":%s,\"symbolTradeMode\":%d,\"adaptiveEngine\":%s,\"marketRegime\":\"%s\",\"signalConfidence\":%.1f,\"adaptiveLot\":%.4f,\"atrPoints\":%.1f,\"adaptiveBlockReason\":\"%s\",\"consecutiveLosses\":%d,\"cooldownUntil\":%I64d,\"executionStatus\":\"%s\",\"lastOrderRetcode\":%I64d,\"lastOrderError\":%d,\"lastOrderAt\":%I64d}}",
      InpInstanceId,
      InpInstallToken,
      stateText,
      IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN)),
      SCENOVA_PRODUCT_VERSION,
      _Symbol,
      AccountInfoString(ACCOUNT_SERVER),
      AccountInfoString(ACCOUNT_CURRENCY),
      AccountInfoDouble(ACCOUNT_BALANCE),
      AccountInfoDouble(ACCOUNT_EQUITY),
      BasketProfit(),
      BasketCycleProfit(),
      EffectiveBasketProfitTarget(),
      g_basketPeakPositionCount,
      CurrentPerPositionProfitTarget(),
      g_profitRunTrailPercent,
      g_profitRunPeak,
      g_perPositionLoss,
      DailyBotProfit(),
      g_dailyProfitTarget,
      dailyProfitContinueText,
      g_dailyProfitDrawdownPercent,
      dailyProfitTargetArmedText,
      DailyProfitGivebackFloor(),
      dailyProfitLockedText,
      g_peakProfit,
      BasketPositionCount(),
      CurrentSpreadPoints(),
      DoubleToString(CurrentSpreadPrice(), SymbolDigitsNow()),
      DoubleToString(_Point, SymbolDigitsNow()),
      SymbolDigitsNow(),
      DoubleToString(telemetrySpreadLimit * _Point, SymbolDigitsNow()),
      MomentumPoints(),
      InpMomentumEntryPoints,
      (int)MathRound(telemetrySpreadLimit),
      terminalConnected,
      terminalTradeAllowed,
      mqlTradeAllowed,
      accountTradeAllowed,
      accountTradeExpert,
      tradeReady,
      SymbolTradeModeNow(),
      adaptiveEngineText,
      g_marketRegime,
      g_signalConfidence,
      g_adaptiveLot,
      g_atrPoints,
      g_adaptiveBlockReason,
      g_consecutiveLosses,
      (long)0,
      g_executionStatus,
      g_lastOrderRetcode,
      g_lastOrderError,
      (long)g_lastOrderAt
   );

   // Add diagnostics separately so the stable heartbeat format remains easy to
   // audit and new telemetry cannot shift StringFormat arguments accidentally.
   if(StringLen(payload) >= 2)
   {
      int heartbeatAge = g_lastSuccessfulHeartbeat > 0
         ? (int)MathMax(0, TimeCurrent() - g_lastSuccessfulHeartbeat)
         : -1;
      string diagnostics = StringFormat(
         ",\"heartbeatAgeSeconds\":%d,\"heartbeatLatencyMs\":%I64d,\"heartbeatHttpStatus\":%d,\"lastServerContactAt\":%I64d,\"entryLeaseValid\":%s,\"positionManagementActive\":true,\"spreadSampleCount\":%d,\"spreadMedianPoints\":%.1f,\"spreadP90Points\":%.1f,\"spreadP95Points\":%.1f,\"spreadP99Points\":%.1f,\"adaptiveSpreadLimitPoints\":%.1f,\"adaptiveSpreadLimitPrice\":%s,\"spreadStatus\":\"%s\",\"spreadCost\":%.2f,\"adaptiveMomentumThreshold\":%.1f,\"adaptiveMaxPositions\":%d,\"adaptiveEntrySpacingMs\":%d,\"executionQuality\":%.1f,\"averageSlippagePoints\":%.1f,\"sessionProfile\":\"%s\",\"atrRatio\":%.3f,\"minimumLotOverrideEnabled\":%s,\"minimumLotOverrideActive\":%s,\"trendM5\":%d,\"trendM15\":%d,\"trendH1\":%d,\"entryBias\":\"%s\",\"pyramidProgressPoints\":%.1f,\"pyramidRequiredPoints\":%.1f,\"momentumSamples\":%d,\"momentumSamplesRequired\":%d,\"configuredLot\":%.4f,\"configuredMaxPositions\":%d,\"configuredBasketProfitTarget\":%.2f,\"effectiveBasketProfitTarget\":%.2f,\"configuredMaxBasketLoss\":%.2f,\"effectiveMaxBasketLoss\":%.2f,\"appliedPerPositionProfit\":%.2f,\"appliedPerPositionLoss\":%.2f,\"appliedProfitRunTrailPercent\":%.2f,\"manualStopLossPoints\":%.1f,\"hardStopAtrMultiplier\":%.3f,\"systemHardStopDistancePoints\":%.1f,\"hardStopDistancePoints\":%.1f,\"stopLossMode\":\"%s\",\"profitControlMode\":\"%s\",\"profitTargetMode\":\"%s\"}}",
         heartbeatAge,
         g_lastHeartbeatLatencyMs,
         g_lastHeartbeatHttpStatus,
         (long)g_lastServerContactAt,
         EntryLeaseValid() ? "true" : "false",
         g_spreadHistoryCount,
         g_spreadMedian,
         g_spreadP90,
         g_spreadP95,
         g_spreadP99,
         g_adaptiveSpreadLimit,
         DoubleToString(g_adaptiveSpreadLimit * _Point, SymbolDigitsNow()),
         g_spreadStatus,
         CurrentSpreadCost(telemetryLot),
         g_adaptiveMomentumThreshold,
         g_adaptiveMaxPositions,
         g_adaptiveEntrySpacingMs,
         g_executionQuality,
         g_averageSlippagePoints,
         g_sessionProfile,
         g_atrRatio,
         minimumLotOverrideEnabledText,
         minimumLotOverrideActiveText,
         g_trendM5,
         g_trendM15,
         g_trendH1,
         g_entryBias,
         g_pyramidProgressPoints,
         g_pyramidRequiredPoints,
         g_tickCount,
         MathMin(128, MathMax(2, InpMomentumTicks)),
         g_lot,
         g_maxPositions,
         g_basketProfitTarget,
         EffectiveBasketProfitTarget(),
         g_maxBasketLoss,
         EffectiveBasketLossLimit(),
         g_perPositionProfit,
         g_perPositionLoss,
         g_profitRunTrailPercent,
         g_manualStopLossPoints,
         EffectiveHardStopMultiplier(),
         EffectiveHardStopDistancePoints(),
         EffectiveStopLossDistancePoints(),
         StopLossModeName(),
         ProfitControlModeName(),
         g_profitTargetMode
      );
      payload = StringSubstr(payload, 0, StringLen(payload) - 2) + diagnostics;
      string burstDiagnostics = StringFormat(
         ",\"engineMode\":\"ADAPTIVE\",\"basketFillActive\":%s,\"basketTargetPositions\":%d,\"basketRequestsSent\":%d,\"basketFilledPositions\":%d,\"basketAutoTargetMoney\":%.2f,\"basketLossMoney\":%.2f}}",
         g_burstActive ? "true" : "false",
         g_burstTargetPositions,
         g_burstRequestsSent,
         BasketPositionCount(),
         g_burstTargetMoney,
         g_burstLossMoney
      );
      payload = StringSubstr(payload, 0, StringLen(payload) - 2) + burstDiagnostics;

      // Market-context telemetry makes every entry auditable on the web.
      string marketContextDiagnostics = StringFormat(
         ",\"trendM1\":%d,\"trendM30\":%d,\"effectiveConfidenceThreshold\":%.1f,\"confidenceGateEnabled\":%s,\"entryDecisionMode\":\"SETUP_FIRST_V6\",\"entryTrigger\":\"%s\",\"newsTradingEnabled\":true,\"nearestSupport\":%s,\"nearestResistance\":%s,\"m5Support\":%s,\"m5Resistance\":%s,\"supportTimeframe\":\"%s\",\"resistanceTimeframe\":\"%s\",\"majorSupport\":%s,\"majorResistance\":%s,\"bullishOrderBlockLow\":%s,\"bullishOrderBlockHigh\":%s,\"bearishOrderBlockLow\":%s,\"bearishOrderBlockHigh\":%s,\"orderBlockTimeframe\":\"%s\",\"fibSwingLow\":%s,\"fibSwingHigh\":%s,\"fibDirection\":%d,\"fibRetracement\":%.4f,\"fibTimeframe\":\"%s\",\"fibM5Direction\":%d,\"fibM5Retracement\":%.4f,\"fibM5Strength\":%.1f,\"fibM15Direction\":%d,\"fibM15Retracement\":%.4f,\"fibM15Strength\":%.1f,\"fibConfluenceScore\":%.1f,\"structureScore\":%.1f,\"locationScore\":%.1f,\"entryScore\":%.1f,\"entryModel\":\"%s\",\"fiboVisible\":%s",
         g_trendM1,
         g_trendM30,
         g_effectiveConfidenceThreshold,
         g_confidenceGateEnabled ? "true" : "false",
         g_entryTrigger,
         DoubleToString(g_nearestSupport, SymbolDigitsNow()),
         DoubleToString(g_nearestResistance, SymbolDigitsNow()),
         DoubleToString(g_m5Support, SymbolDigitsNow()),
         DoubleToString(g_m5Resistance, SymbolDigitsNow()),
         g_supportTimeframe,
         g_resistanceTimeframe,
         DoubleToString(g_majorSupport, SymbolDigitsNow()),
         DoubleToString(g_majorResistance, SymbolDigitsNow()),
         DoubleToString(g_bullishOrderBlockLow, SymbolDigitsNow()),
         DoubleToString(g_bullishOrderBlockHigh, SymbolDigitsNow()),
         DoubleToString(g_bearishOrderBlockLow, SymbolDigitsNow()),
         DoubleToString(g_bearishOrderBlockHigh, SymbolDigitsNow()),
         g_orderBlockTimeframe,
         DoubleToString(g_fibSwingLow, SymbolDigitsNow()),
         DoubleToString(g_fibSwingHigh, SymbolDigitsNow()),
         g_fibDirection,
         g_fibRetracement,
         g_fibTimeframe,
         g_fibM5Direction,
         g_fibM5Retracement,
         g_fibM5Strength,
         g_fibM15Direction,
         g_fibM15Retracement,
         g_fibM15Strength,
         g_fibConfluenceScore,
         g_structureScore,
         g_locationScore,
         g_entryScore,
         g_entryModel,
         g_fiboVisible ? "true" : "false"
      );
      string intelligenceV3Diagnostics = StringFormat(
         ",\"marketRegimeDetail\":\"%s\",\"bullishOrderBlockQuality\":%.1f,\"bearishOrderBlockQuality\":%.1f,\"bullishOrderBlockState\":\"%s\",\"bearishOrderBlockState\":\"%s\",\"bullishOrderBlockTimeframe\":\"%s\",\"bearishOrderBlockTimeframe\":\"%s\",\"bullishOrderBlockMitigations\":%d,\"bearishOrderBlockMitigations\":%d,\"bullishOrderBlockAgeBars\":%d,\"bearishOrderBlockAgeBars\":%d,\"fibSetupScore\":%.1f,\"fibSetupGrade\":\"%s\",\"entryQuality\":\"%s\",\"entryQualityScore\":%.1f,\"antiChaseActive\":%s,\"antiChaseDirection\":%d,\"exhaustionScore\":%.1f,\"extensionAtr\":%.2f,\"adverseWickRatio\":%.3f,\"priceLocationState\":\"%s\",\"antiChaseReason\":\"%s\",\"breakoutRetestRequired\":%s,\"breakoutRetestReady\":%s,\"breakoutReferenceLevel\":%s,\"basketLadderRung\":%d,\"basketLadderProgressPoints\":%.1f,\"basketLadderRequiredPoints\":%.1f,\"basketLadderPullbackPoints\":%.1f,\"basketLadderPullbackRequiredPoints\":%.1f,\"basketLadderMode\":\"%s\",\"dynamicStopPrice\":%s,\"dynamicTakeProfitPrice\":%s,\"journalSent\":%d,\"journalFailed\":%d",
         g_marketRegimeDetail,
         g_bullishOrderBlockQuality,
         g_bearishOrderBlockQuality,
         g_bullishOrderBlockState,
         g_bearishOrderBlockState,
         g_bullishOrderBlockTimeframe,
         g_bearishOrderBlockTimeframe,
         g_bullishOrderBlockMitigations,
         g_bearishOrderBlockMitigations,
         g_bullishOrderBlockAgeBars,
         g_bearishOrderBlockAgeBars,
         g_fibSetupScore,
         g_fibSetupGrade,
         g_entryQuality,
         g_entryQualityScore,
         g_antiChaseActive ? "true" : "false",
         g_antiChaseDirection,
         g_exhaustionScore,
         g_extensionAtr,
         g_adverseWickRatio,
         g_priceLocationState,
         g_antiChaseReason,
         g_breakoutRetestRequired ? "true" : "false",
         g_breakoutRetestReady ? "true" : "false",
         DoubleToString(g_breakoutReferenceLevel, SymbolDigitsNow()),
         g_ladderRung,
         g_ladderProgressPoints,
         g_ladderRequiredPoints,
         g_ladderPullbackPoints,
         g_ladderPullbackRequiredPoints,
         g_ladderMode,
         DoubleToString(g_dynamicStopPrice, SymbolDigitsNow()),
         DoubleToString(g_dynamicTakeProfitPrice, SymbolDigitsNow()),
         g_journalSent,
         g_journalFailed
      );
      string probabilityDiagnostics = StringFormat(
         ",\"modelConfidence\":%.1f,\"historicalWinProbability\":%.1f,\"historicalWinSamples\":%d,\"confidenceSource\":\"%s\",\"pendingBasketJournal\":%s",
         g_modelConfidence,
         g_historicalWinProbability,
         g_historicalWinSamples,
         g_confidenceSource,
         g_pendingBasketJournal ? "true" : "false"
      );

      if(BasketPositionCount()>0 || RescuePositionCount()>0)
         UpdateRescueExposure();

      string intelligenceV4Diagnostics = StringFormat(
         ",\"ema9\":%s,\"ema21\":%s,\"ema50\":%s,\"ema200\":%s,\"emaStack\":\"%s\",\"emaSlope\":\"%s\",\"emaVolatilityState\":\"%s\",\"emaPriceVs200\":\"%s\",\"emaReclaimState\":\"%s\",\"emaDistanceAtr\":%.3f,\"emaTrendM1\":%d,\"emaTrendM5\":%d,\"emaTrendM15\":%d,\"emaTrendM30\":%d,\"emaTrendH1\":%d,\"emaConfluenceBuy\":%.1f,\"emaConfluenceSell\":%.1f,\"priceActionBuy\":\"%s\",\"priceActionSell\":\"%s\",\"priceActionBuyScore\":%.1f,\"priceActionSellScore\":%.1f,\"effectiveLadderTargetPositions\":%d,\"performanceRiskMode\":\"%s\",\"consecutiveBasketLosses\":%d,\"rescueState\":\"%s\",\"rescuePrimaryDirection\":%d,\"rescueHedgeDirection\":%d,\"rescuePrimaryVolume\":%.4f,\"rescueHedgeLot\":%.4f,\"rescueNetExposure\":%.4f,\"rescueReversalScore\":%.1f,\"rescueReversalConfirmed\":%s,\"rescueReversalReason\":\"%s\",\"rescueReversalStableSeconds\":%I64d,\"rescueHedgeLockSeconds\":%I64d,\"rescueRequiredMoney\":%.2f,\"rescueRecoveredMoney\":%.2f,\"rescueTargetMoney\":%.2f,\"rescueRecoveryPrice\":%s,\"rescuePrimaryProfit\":%.2f,\"rescueHedgeProfit\":%.2f,\"rescueCombinedProfit\":%.2f,\"rescuePartialCloseCount\":%d,\"rescueOldestAgeSeconds\":%I64d,\"rescuePositionCount\":%d",
         DoubleToString(g_ema9,SymbolDigitsNow()),
         DoubleToString(g_ema21,SymbolDigitsNow()),
         DoubleToString(g_ema50,SymbolDigitsNow()),
         DoubleToString(g_ema200,SymbolDigitsNow()),
         g_emaStack,
         g_emaSlope,
         g_emaVolatilityState,
         g_emaPriceVs200,
         g_emaReclaimState,
         g_emaDistanceAtr,
         g_emaTrendM1,
         g_emaTrendM5,
         g_emaTrendM15,
         g_emaTrendM30,
         g_emaTrendH1,
         g_emaConfluenceScoreBuy,
         g_emaConfluenceScoreSell,
         g_priceActionBuy,
         g_priceActionSell,
         g_priceActionBuyScore,
         g_priceActionSellScore,
         g_effectiveLadderTargetPositions,
         g_performanceRiskMode,
         g_consecutiveLosses,
         RescueStateName(),
         g_rescuePrimaryDirection,
         g_rescueHedgeDirection,
         g_rescuePrimaryVolume,
         g_rescueHedgeLot,
         g_rescueNetExposure,
         g_rescueReversalScore,
         g_rescueReversalConfirmed ? "true" : "false",
         g_rescueReversalReason,
         (long)(g_rescueReversalCandidateSince>0 ? MathMax(0,TimeCurrent()-g_rescueReversalCandidateSince) : 0),
         (long)(g_rescueHedgeLockedUntil>TimeCurrent() ? g_rescueHedgeLockedUntil-TimeCurrent() : 0),
         g_rescueRequiredMoney,
         g_rescueRecoveredMoney,
         g_rescueTargetMoney,
         DoubleToString(g_rescueRecoveryPrice,SymbolDigitsNow()),
         g_rescuePrimaryProfit,
         g_rescueHedgeProfit,
         g_rescueCombinedProfit,
         g_rescuePartialCloseCount,
         g_rescueOldestAgeSeconds,
         RescuePositionCount()
      );

      string smartProfitDiagnostics = StringFormat(
         ",\"smartProfitDefenseActive\":%s,\"smartProfitDefenseReason\":\"%s\",\"smartProfitDefenseFloor\":%.2f,\"smartProfitDefenseLastProfit\":%.2f",
         g_smartProfitDefenseActive ? "true" : "false",
         g_smartProfitDefenseReason,
         g_smartProfitDefenseFloor,
         g_smartProfitDefenseLastProfit
      );

      string positionDiagnostics =
         marketContextDiagnostics + intelligenceV3Diagnostics + probabilityDiagnostics +
         intelligenceV4Diagnostics + smartProfitDiagnostics +
         StringFormat(
            ",\"marketCycleState\":\"%s\",\"rsiM1\":%.1f,\"rsiM5\":%.1f,\"adxM5\":%.1f,\"plusDiM5\":%.1f,\"minusDiM5\":%.1f,\"vwapM5\":%s,\"demandZoneScore\":%.1f,\"supplyZoneScore\":%.1f,\"reversalOpportunityDirection\":%d,\"reversalOpportunityScore\":%.1f,\"fillExpectedPositions\":%d,\"fillUrgency\":%.3f,\"marketRearmDirection\":%d,\"marketRearmReason\":\"%s\"",
            g_marketCycleState,
            g_rsiM1,
            g_rsiM5,
            g_adxM5,
            g_plusDiM5,
            g_minusDiM5,
            DoubleToString(g_vwapM5,SymbolDigitsNow()),
            g_demandZoneScore,
            g_supplyZoneScore,
            g_reversalOpportunityDirection,
            g_reversalOpportunityScore,
            g_fillExpectedPositions,
            g_fillUrgency,
            g_marketRearmDirection,
            g_marketRearmReason
         ) +
         ",\"openPositions\":" + OpenPositionsTelemetryJson() + "}}";
      payload = StringSubstr(payload, 0, StringLen(payload) - 2) + positionDiagnostics;
   }

   string response = "";
   string heartbeatUrl = InpApiBase + "/api/ea/heartbeat";
   ulong heartbeatStartedMs = GetTickCount64();
   int code = HttpPostJson(heartbeatUrl, payload, response);
   g_lastHeartbeatLatencyMs = (long)(GetTickCount64() - heartbeatStartedMs);
   g_lastHeartbeatHttpStatus = code;
   if(code > 0)
      g_lastServerContactAt = TimeCurrent();
   int webError = GetLastError();

   if(code < 200 || code >= 300)
   {
      // Fail closed for new entries immediately when control cannot be verified.
      g_runAuthorized = false;
      if(g_state == STATE_RUNNING)
         g_executionStatus = "CONTROL_NOT_FRESH";

      Print("SCENOVA heartbeat failed. HTTP=", code, " error=", webError, " URL=", heartbeatUrl);

      if(code == -1)
      {
         RenderChartStatus("NETWORK ERROR", clrTomato, "WebRequest error " + IntegerToString(webError));
      }
      else if(code == 401)
      {
         RenderChartStatus("AUTH FAILED", clrTomato, "Reload the newest SCENOVA .set file");
      }
      else
      {
         RenderChartStatus("NOT CONNECTED", clrTomato, "HTTP " + IntegerToString(code));
      }
      return;
   }

   g_lastSuccessfulHeartbeat = TimeCurrent();
   g_access = JsonBool(response, "access", false);

   string desired = JsonString(response, "desiredState", "STOPPED");
   string command = JsonString(response, "commandName", "");

   ApplySettings(response);
   g_buyWinProbability = MathMax(0.0, MathMin(100.0,
      JsonNumber(response, "buyWinProbability", g_buyWinProbability)));
   g_buyWinSamples = (int)MathMax(0.0,
      JsonNumber(response, "buyWinSamples", g_buyWinSamples));
   g_sellWinProbability = MathMax(0.0, MathMin(100.0,
      JsonNumber(response, "sellWinProbability", g_sellWinProbability)));
   g_sellWinSamples = (int)MathMax(0.0,
      JsonNumber(response, "sellWinSamples", g_sellWinSamples));

   // desiredState is authoritative. A stale START/SAFE_STOP command must never
   // override the latest state selected on the website.
   if(!g_access)
   {
      g_state = STATE_SAFE_STOP;
      g_runAuthorized = false;
      g_executionStatus = "NO_ACCESS";
   }
   else if(desired == "RUNNING")
   {
      if(g_dailyProfitLocked)
      {
         g_state = STATE_SAFE_STOP;
         g_runAuthorized = false;
         g_executionStatus = "DAILY_PROFIT_LOCK";
      }
      else
      {
         g_state = STATE_RUNNING;
         g_runAuthorized = true;
         g_lastRunAuthorization = TimeCurrent();
         g_executionStatus = "EVALUATING";
      }
   }
   else if(desired == "SAFE_STOP")
   {
      g_state = STATE_SAFE_STOP;
      g_runAuthorized = false;
      g_executionStatus = "SAFE_STOP";
   }
   else if(desired == "STOPPED")
   {
      g_runAuthorized = false;
      if(BasketPositionCount() == 0)
      {
         g_state = STATE_STOPPED;
         g_executionStatus = "STOPPED";
      }
      else
      {
         g_state = STATE_SAFE_STOP;
         g_executionStatus = "SAFE_STOP";
      }
   }

   // The chart Fibonacci follows the website lifecycle exactly. Internal
   // structure management may continue for open Positions during SAFE_STOP,
   // but the visual object is removed as soon as the user stops the bot.
   if(desired == "RUNNING" && g_state == STATE_RUNNING)
   {
      RefreshMarketContext(true);
      DrawTradingFibonacci();
   }
   else
      DeleteTradingFibonacci();

   if(command == "CLOSE_ALL" && desired == "STOPPED")
   {
      g_state = STATE_SAFE_STOP;
      g_runAuthorized = false;
      g_executionStatus = "SAFE_STOP";
      CloseAllBasket("REMOTE_CLOSE_ALL");
   }

   RenderChartStatus("CONNECTED", clrLimeGreen, g_executionStatus);

   long commandId = (long)JsonNumber(response, "commandId", 0.0);
   if(commandId > 0)
   {
      bool closeConfirmed = (command != "CLOSE_ALL" || BasketPositionCount() == 0);
      if(closeConfirmed)
         AckCommand(commandId);
   }
}

void AckCommand(long commandId)
{
   string payload = StringFormat(
      "{\"instanceId\":\"%s\",\"installToken\":\"%s\",\"commandId\":%I64d,\"state\":\"%s\",\"executionStatus\":\"%s\"}",
      InpInstanceId,
      InpInstallToken,
      commandId,
      StateText(),
      g_executionStatus
   );
   string response = "";
   HttpPostJson(InpApiBase + "/api/ea/ack", payload, response);
}

int HttpPostJsonTimeout(string url, string payload, string &response, int timeoutMs)
{
   char data[];
   char result[];
   string resultHeaders = "";
   string headers = "Content-Type: application/json\r\n";

   StringToCharArray(payload, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(ArraySize(data) > 0)
      ArrayResize(data, ArraySize(data) - 1);

   ResetLastError();
   int code = WebRequest(
      "POST",
      url,
      headers,
      MathMax(250, timeoutMs),
      data,
      result,
      resultHeaders
   );
   response = CharArrayToString(result, 0, -1, CP_UTF8);
   return code;
}

int HttpPostJson(string url, string payload, string &response)
{
   return HttpPostJsonTimeout(url, payload, response, 5000);
}

void PostTradeJournalDeal(ulong dealTicket)
{
   if(MQLInfoInteger(MQL_TESTER) || dealTicket == 0 || !HistoryDealSelect(dealTicket))
      return;

   long dealEntry = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
   if(dealEntry != DEAL_ENTRY_IN &&
      dealEntry != DEAL_ENTRY_OUT &&
      dealEntry != DEAL_ENTRY_OUT_BY &&
      dealEntry != DEAL_ENTRY_INOUT)
      return;

   long dealType = HistoryDealGetInteger(dealTicket, DEAL_TYPE);
   if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL)
      return;

   bool isExit = dealEntry == DEAL_ENTRY_OUT ||
                 dealEntry == DEAL_ENTRY_OUT_BY ||
                 dealEntry == DEAL_ENTRY_INOUT;
   int dealDirection = dealType == DEAL_TYPE_BUY ? 1 : -1;
   int positionDirection = isExit ? -dealDirection : dealDirection;

   double net =
      HistoryDealGetDouble(dealTicket, DEAL_PROFIT) +
      HistoryDealGetDouble(dealTicket, DEAL_SWAP) +
      HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);

   double obQuality = positionDirection > 0
      ? g_bullishOrderBlockQuality
      : g_bearishOrderBlockQuality;
   int basketIndex = isExit
      ? BasketPositionCount() + 1
      : MathMax(1, BasketPositionCount());

   string payload = StringFormat(
      "{\"instanceId\":\"%s\",\"installToken\":\"%s\",\"dealTicket\":\"%I64d\",\"positionId\":\"%I64d\",\"eventType\":\"%s\",\"direction\":\"%s\",\"volume\":%.8f,\"price\":%s,\"netProfit\":%.2f,\"entryTrigger\":\"%s\",\"entryModel\":\"%s\",\"entryQuality\":\"%s\",\"entryQualityScore\":%.2f,\"marketRegime\":\"%s\",\"marketRegimeDetail\":\"%s\",\"fibSetupScore\":%.2f,\"orderBlockQuality\":%.2f,\"confidence\":%.2f,\"basketIndex\":%d}",
      InpInstanceId,
      InpInstallToken,
      (long)dealTicket,
      (long)HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID),
      isExit ? "EXIT" : "ENTRY",
      positionDirection > 0 ? "BUY" : "SELL",
      HistoryDealGetDouble(dealTicket, DEAL_VOLUME),
      DoubleToString(HistoryDealGetDouble(dealTicket, DEAL_PRICE), SymbolDigitsNow()),
      net,
      g_entryTrigger,
      g_entryModel,
      g_entryQuality,
      g_entryQualityScore,
      g_marketRegime,
      g_marketRegimeDetail,
      g_fibSetupScore,
      obQuality,
      g_signalConfidence,
      basketIndex
   );

   string response = "";
   int code = HttpPostJsonTimeout(InpApiBase + "/api/ea/journal", payload, response, 650);
   if(code >= 200 && code < 300)
      g_journalSent++;
   else
      g_journalFailed++;
}

void PostRescueJournalDeal(ulong dealTicket)
{
   if(MQLInfoInteger(MQL_TESTER) || dealTicket==0 || !HistoryDealSelect(dealTicket))
      return;

   long dealEntry=HistoryDealGetInteger(dealTicket,DEAL_ENTRY);
   if(dealEntry!=DEAL_ENTRY_IN &&
      dealEntry!=DEAL_ENTRY_OUT &&
      dealEntry!=DEAL_ENTRY_OUT_BY &&
      dealEntry!=DEAL_ENTRY_INOUT)
      return;

   long dealType=HistoryDealGetInteger(dealTicket,DEAL_TYPE);
   if(dealType!=DEAL_TYPE_BUY && dealType!=DEAL_TYPE_SELL)
      return;

   bool isExit=
      dealEntry==DEAL_ENTRY_OUT ||
      dealEntry==DEAL_ENTRY_OUT_BY ||
      dealEntry==DEAL_ENTRY_INOUT;
   int dealDirection=dealType==DEAL_TYPE_BUY ? 1 : -1;
   int positionDirection=isExit ? -dealDirection : dealDirection;
   double net=
      HistoryDealGetDouble(dealTicket,DEAL_PROFIT)+
      HistoryDealGetDouble(dealTicket,DEAL_SWAP)+
      HistoryDealGetDouble(dealTicket,DEAL_COMMISSION);

   string payload=StringFormat(
      "{\"instanceId\":\"%s\",\"installToken\":\"%s\",\"dealTicket\":\"%I64d\",\"positionId\":\"%I64d\",\"eventType\":\"%s\",\"direction\":\"%s\",\"volume\":%.8f,\"price\":%s,\"netProfit\":%.2f,\"entryTrigger\":\"RESCUE_HEDGE\",\"entryModel\":\"WEIGHT_BALANCE\",\"entryQuality\":\"R\",\"entryQualityScore\":%.2f,\"marketRegime\":\"%s\",\"marketRegimeDetail\":\"%s\",\"fibSetupScore\":%.2f,\"orderBlockQuality\":%.2f,\"confidence\":%.2f,\"basketIndex\":0}",
      InpInstanceId,
      InpInstallToken,
      (long)dealTicket,
      (long)HistoryDealGetInteger(dealTicket,DEAL_POSITION_ID),
      isExit ? "EXIT" : "ENTRY",
      positionDirection>0 ? "BUY" : "SELL",
      HistoryDealGetDouble(dealTicket,DEAL_VOLUME),
      DoubleToString(HistoryDealGetDouble(dealTicket,DEAL_PRICE),SymbolDigitsNow()),
      net,
      g_rescueReversalScore,
      g_marketRegime,
      g_marketRegimeDetail,
      g_fibSetupScore,
      positionDirection>0 ? g_bullishOrderBlockQuality : g_bearishOrderBlockQuality,
      g_signalConfidence
   );

   string response="";
   int code=HttpPostJsonTimeout(InpApiBase+"/api/ea/journal",payload,response,650);
   if(code>=200 && code<300)
      g_journalSent++;
   else
      g_journalFailed++;
}

void ClearActiveBasketJournal()
{
   g_basketJournalId = 0;
   g_basketJournalStartedAt = 0;
   g_basketJournalDirection = 0;
   g_basketJournalVolume = 0.0;
   g_basketJournalProfit = 0.0;
   g_basketJournalTrigger = "NONE";
   g_basketJournalModel = "NONE";
   g_basketJournalQuality = "C";
   g_basketJournalQualityScore = 0.0;
   g_basketJournalRegime = "UNKNOWN";
   g_basketJournalRegimeDetail = "UNKNOWN";
   g_basketJournalFibScore = 0.0;
   g_basketJournalOrderBlockQuality = 0.0;
   g_basketJournalConfidence = 0.0;
   g_basketJournalSession = "UNKNOWN";
}

void CaptureBasketJournalEntry(ulong dealTicket)
{
   long dealType = HistoryDealGetInteger(dealTicket, DEAL_TYPE);
   int direction = dealType == DEAL_TYPE_BUY ? 1 :
                   dealType == DEAL_TYPE_SELL ? -1 : 0;
   if(direction == 0)
      return;

   if(g_basketJournalId == 0)
   {
      g_basketJournalId = (long)dealTicket;
      g_basketJournalStartedAt =
         (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
      g_basketJournalDirection = direction;
      g_basketJournalTrigger = g_entryTrigger;
      g_basketJournalModel = g_entryModel;
      g_basketJournalQuality = g_entryQuality;
      g_basketJournalQualityScore = g_entryQualityScore;
      g_basketJournalRegime = g_marketRegime;
      g_basketJournalRegimeDetail = g_marketRegimeDetail;
      g_basketJournalFibScore = g_fibSetupScore;
      g_basketJournalOrderBlockQuality = direction > 0
         ? g_bullishOrderBlockQuality
         : g_bearishOrderBlockQuality;
      g_basketJournalConfidence = g_signalConfidence;
      g_basketJournalSession = g_sessionProfile;
   }
   g_basketJournalVolume += HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
   UpdateBasketPeakPositionCount(BasketPositionCount());
}

void RecoverOpenBasketJournal()
{
   if(g_basketJournalId != 0)
      return;

   datetime oldestTime = 0;
   ulong oldestTicket = 0;
   int direction = 0;
   double volume = 0.0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol ||
         PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;

      datetime openedAt = (datetime)PositionGetInteger(POSITION_TIME);
      if(oldestTime == 0 || openedAt < oldestTime)
      {
         oldestTime = openedAt;
         oldestTicket = ticket;
         direction = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? 1 : -1;
      }
      volume += PositionGetDouble(POSITION_VOLUME);
   }
   if(oldestTicket == 0)
      return;

   g_basketJournalId = (long)oldestTicket;
   g_basketJournalStartedAt = oldestTime;
   g_basketJournalDirection = direction;
   g_basketJournalVolume = volume;
   g_basketJournalProfit = g_basketCycleRealizedProfit + g_rescueRealizedProfit;
   g_basketJournalTrigger = "RECOVERED";
   g_basketJournalModel = g_entryModel;
   g_basketJournalQuality = g_entryQuality;
   g_basketJournalQualityScore = g_entryQualityScore;
   g_basketJournalRegime = g_marketRegime;
   g_basketJournalRegimeDetail = g_marketRegimeDetail;
   g_basketJournalFibScore = g_fibSetupScore;
   g_basketJournalOrderBlockQuality = direction > 0
      ? g_bullishOrderBlockQuality
      : g_bearishOrderBlockQuality;
   g_basketJournalConfidence = g_signalConfidence;
   g_basketJournalSession = g_sessionProfile;
}

void FinalizeBasketJournal()
{
   if(g_basketJournalId == 0 || g_pendingBasketJournal)
      return;

   g_pendingBasketJournal = true;
   g_pendingBasketRetryAt = 0;
   g_pendingBasketId = g_basketJournalId;
   g_pendingBasketStartedAt = g_basketJournalStartedAt;
   g_pendingBasketEndedAt = TimeCurrent();
   g_pendingBasketDirection = g_basketJournalDirection;
   g_pendingBasketVolume = g_basketJournalVolume;
   g_pendingBasketProfit = g_basketJournalProfit;
   UpdateAdaptiveLossStateFromBasket(g_pendingBasketProfit);
   g_pendingBasketPeakPositions = MathMax(1, g_basketPeakPositionCount);
   g_pendingBasketTrigger = g_basketJournalTrigger;
   g_pendingBasketModel = g_basketJournalModel;
   g_pendingBasketQuality = g_basketJournalQuality;
   g_pendingBasketQualityScore = g_basketJournalQualityScore;
   g_pendingBasketRegime = g_basketJournalRegime;
   g_pendingBasketRegimeDetail = g_basketJournalRegimeDetail;
   g_pendingBasketFibScore = g_basketJournalFibScore;
   g_pendingBasketOrderBlockQuality = g_basketJournalOrderBlockQuality;
   g_pendingBasketConfidence = g_basketJournalConfidence;
   g_pendingBasketSession = g_basketJournalSession;
   ClearActiveBasketJournal();
}

void TrackBasketJournalDeal(ulong dealTicket)
{
   long entry = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
   if(entry == DEAL_ENTRY_IN || entry == DEAL_ENTRY_INOUT)
      CaptureBasketJournalEntry(dealTicket);

   if(g_basketJournalId != 0)
      g_basketJournalProfit +=
         HistoryDealGetDouble(dealTicket, DEAL_PROFIT) +
         HistoryDealGetDouble(dealTicket, DEAL_SWAP) +
         HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);

   if((entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY) &&
      BasketPositionCount() == 0 &&
      RescuePositionCount() == 0)
      FinalizeBasketJournal();
}

void FlushPendingBasketJournal()
{
   if(!g_pendingBasketJournal)
      return;
   if(MQLInfoInteger(MQL_TESTER))
   {
      g_pendingBasketJournal = false;
      return;
   }

   datetime now = TimeCurrent();
   if(g_pendingBasketRetryAt > now)
      return;

   string payload = StringFormat(
      "{\"instanceId\":\"%s\",\"installToken\":\"%s\",\"dealTicket\":\"%I64d\",\"eventType\":\"BASKET\",\"direction\":\"%s\",\"volume\":%.8f,\"price\":0,\"netProfit\":%.2f,\"entryTrigger\":\"%s\",\"entryModel\":\"%s\",\"entryQuality\":\"%s\",\"entryQualityScore\":%.2f,\"marketRegime\":\"%s\",\"marketRegimeDetail\":\"%s\",\"fibSetupScore\":%.2f,\"orderBlockQuality\":%.2f,\"confidence\":%.2f,\"basketIndex\":%d,\"symbol\":\"%s\",\"brokerServer\":\"%s\",\"startedAt\":%I64d,\"endedAt\":%I64d,\"peakPositions\":%d,\"sessionProfile\":\"%s\",\"journalSchema\":3}",
      InpInstanceId,
      InpInstallToken,
      g_pendingBasketId,
      g_pendingBasketDirection > 0 ? "BUY" : "SELL",
      g_pendingBasketVolume,
      g_pendingBasketProfit,
      g_pendingBasketTrigger,
      g_pendingBasketModel,
      g_pendingBasketQuality,
      g_pendingBasketQualityScore,
      g_pendingBasketRegime,
      g_pendingBasketRegimeDetail,
      g_pendingBasketFibScore,
      g_pendingBasketOrderBlockQuality,
      g_pendingBasketConfidence,
      g_pendingBasketPeakPositions,
      _Symbol,
      AccountInfoString(ACCOUNT_SERVER),
      (long)g_pendingBasketStartedAt,
      (long)g_pendingBasketEndedAt,
      g_pendingBasketPeakPositions,
      g_pendingBasketSession
   );

   string response = "";
   int code = HttpPostJsonTimeout(InpApiBase + "/api/ea/journal", payload, response, 650);
   if(code >= 200 && code < 300)
   {
      g_journalSent++;
      g_pendingBasketJournal = false;
      g_pendingBasketId = 0;
      if(g_basketJournalId != 0 && BasketPositionCount() == 0)
         FinalizeBasketJournal();
   }
   else
   {
      g_journalFailed++;
      g_pendingBasketRetryAt = now + 10;
   }
}

bool BasketFillEnabled()
{
   return g_maxPositions > 1;
}

void ApplyUnifiedTradingEngine()
{
   // One transparent engine for every account. Users control Lot, direction,
   // position count and exits; these internal values no longer change behind a
   // hidden trading profile.
   g_adaptiveEngine = true;
   g_maxAtrPoints = 0.0;
   g_minOrderIntervalMs = 300;
   g_maxOrdersPerMinute = 120;
   // Confidence is retained as a quality metric only. It is never an entry gate.
   g_confidenceThreshold = 55;
   g_riskPerOrderPercent = 0.25;
   g_hardStopAtrMultiplier = 2.00;

   // Unified Engine is always available 24h while the market/Broker permits it.
   // Small accounts may use the Broker minimum volume when risk sizing falls
   // below it, but the EA never exceeds the user's configured Lot ceiling.
   g_sessionStartHour = 0;
   g_sessionEndHour = 24;
   g_allowMinimumLotOverride = true;

   if(!BasketFillEnabled())
   {
      g_burstActive = false;
      g_burstNeedsRearm = false;
      g_burstDirection = 0;
      g_burstTargetPositions = 0;
      g_burstRequestsSent = 0;
      g_burstStartedAt = 0;
      g_burstTargetMoney = 0.0;
      g_burstLossMoney = 0.0;
   }

   g_adaptiveMaxPositions = g_maxPositions;
   g_adaptiveEntrySpacingMs = g_minOrderIntervalMs;
}

void ApplySettings(string json)
{
   double previousDailyProfitTarget = g_dailyProfitTarget;
   bool previousDailyContinueAfterTarget = g_dailyProfitContinueAfterTarget;

   g_lot = MathMax(0.01, JsonNumber(json, "lot", g_lot));
   g_maxPositions = (int)MathMax(1.0, JsonNumber(json, "maxPositions", g_maxPositions));
   g_triggerMoney = MathMax(0.0, JsonNumber(json, "basketTriggerMoney", g_triggerMoney));
   g_trailMoney = MathMax(0.0, JsonNumber(json, "basketTrailMoney", g_trailMoney));
   g_maxBasketLoss = MathMax(0.0, JsonNumber(json, "maxBasketLossMoney", g_maxBasketLoss));
   g_dailyLoss = MathMax(0.0, JsonNumber(json, "dailyLossMoney", g_dailyLoss));
   g_dailyProfitTarget = MathMax(0.0, JsonNumber(json, "dailyProfitTargetMoney", g_dailyProfitTarget));
   g_dailyProfitContinueAfterTarget = JsonBool(json, "dailyProfitContinueAfterTarget", g_dailyProfitContinueAfterTarget);
   g_dailyProfitDrawdownPercent = MathMax(0.0, MathMin(95.0, JsonNumber(json, "dailyProfitDrawdownPercent", g_dailyProfitDrawdownPercent)));
   double previousBasketProfitTarget = g_basketProfitTarget;
   double previousProfitRunTrailPercent = g_profitRunTrailPercent;
   string previousProfitTargetMode = g_profitTargetMode;

   g_basketProfitTarget = MathMax(0.0, JsonNumber(json, "basketProfitTargetMoney", g_basketProfitTarget));
   g_perPositionProfit = MathMax(0.0, JsonNumber(json, "perPositionProfitMoney", g_perPositionProfit));
   g_profitRunTrailPercent = MathMax(0.0, MathMin(95.0, JsonNumber(json, "profitRunTrailPercent", g_profitRunTrailPercent)));
   string requestedProfitMode = JsonString(json, "profitTargetMode", "");
   StringToUpper(requestedProfitMode);
   if(requestedProfitMode == "AUTO" ||
      requestedProfitMode == "MANUAL" ||
      requestedProfitMode == "OFF")
      g_profitTargetMode = requestedProfitMode;
   else if(g_profitTargetMode == "")
      g_profitTargetMode =
         (g_basketProfitTarget > 0.0 || g_perPositionProfit > 0.0)
         ? "MANUAL" : "AUTO";

   if(g_profitTargetMode != "MANUAL")
   {
      g_basketProfitTarget = 0.0;
      g_perPositionProfit = 0.0;
      g_profitRunTrailPercent = 0.0;
      g_triggerMoney = 0.0;
      g_trailMoney = 0.0;
      if(g_profitTargetMode == "OFF")
         g_burstTargetMoney = 0.0;
   }
   else if(g_perPositionProfit > 0.0)
   {
      g_basketProfitTarget = 0.0;
      g_profitRunTrailPercent = 0.0;
      g_triggerMoney = 0.0;
      g_trailMoney = 0.0;
   }
   else if(g_basketProfitTarget > 0.0)
   {
      g_triggerMoney = 0.0;
      g_trailMoney = 0.0;
   }
   else
   {
      g_profitRunTrailPercent = 0.0;
   }

   if(g_profitTargetMode != "AUTO")
      g_burstTargetMoney = 0.0;

   // Changing Basket target or giveback percentage starts a fresh peak.
   if(previousProfitTargetMode != g_profitTargetMode ||
      MathAbs(previousBasketProfitTarget - g_basketProfitTarget) > 0.0000001 ||
      MathAbs(previousProfitRunTrailPercent - g_profitRunTrailPercent) > 0.0000001)
   {
      g_profitRunPeak = 0.0;
      SaveBasketCycleState();
   }
   // Legacy money-loss close is intentionally disabled. Per-position risk is
   // enforced by a real Stop Loss attached to the Broker order.
   g_perPositionLoss = 0.0;
   g_manualStopLossPoints = MathMax(0.0, JsonNumber(json, "manualStopLossPoints", g_manualStopLossPoints));
   g_maxSpread = (int)MathMax(0.0, JsonNumber(json, "maxSpreadPoints", g_maxSpread));
   g_minOrderIntervalMs = (int)MathMax(0.0, JsonNumber(json, "minOrderIntervalMs", g_minOrderIntervalMs));
   g_maxOrdersPerMinute = (int)MathMax(1.0, JsonNumber(json, "maxOrdersPerMinute", g_maxOrdersPerMinute));
   g_adaptiveEngine = JsonBool(json, "adaptiveEngine", g_adaptiveEngine);
   g_riskPerOrderPercent = MathMax(0.01, MathMin(5.0, JsonNumber(json, "riskPerOrderPercent", g_riskPerOrderPercent)));
   g_allowMinimumLotOverride = JsonBool(json, "allowMinimumLotOverride", g_allowMinimumLotOverride);
   g_hardStopAtrMultiplier = MathMax(0.5, MathMin(10.0, JsonNumber(json, "hardStopAtrMultiplier", g_hardStopAtrMultiplier)));
   g_atrPeriod = (int)MathMax(5.0, MathMin(100.0, JsonNumber(json, "atrPeriod", g_atrPeriod)));
   g_confidenceGateEnabled = JsonBool(json, "confidenceGateEnabled", g_confidenceGateEnabled);
   g_confidenceThreshold = (int)MathMax(40.0, MathMin(95.0, JsonNumber(json, "confidenceThreshold", g_confidenceThreshold)));
   g_sessionStartHour = (int)MathMax(0.0, MathMin(23.0, JsonNumber(json, "sessionStartHour", g_sessionStartHour)));
   g_sessionEndHour = (int)MathMax(1.0, MathMin(24.0, JsonNumber(json, "sessionEndHour", g_sessionEndHour)));
   g_maxAtrPoints = MathMax(0.0, JsonNumber(json, "maxAtrPoints", g_maxAtrPoints));
   g_lastAdaptiveEvaluation = 0;

   string mode = JsonString(json, "entryMode", "");
   if(mode == "BUY_ONLY") g_entryMode = ENTRY_BUY_ONLY;
   else if(mode == "SELL_ONLY") g_entryMode = ENTRY_SELL_ONLY;
   else if(mode == "AUTO_MOMENTUM") g_entryMode = ENTRY_AUTO_MOMENTUM;

   ApplyUnifiedTradingEngine();

   bool dailyProfitSettingsChanged =
      MathAbs(previousDailyProfitTarget-g_dailyProfitTarget)>0.0000001 ||
      previousDailyContinueAfterTarget!=g_dailyProfitContinueAfterTarget;

   if(g_dailyProfitLocked &&
      dailyProfitSettingsChanged &&
      (g_dailyProfitTarget<=0.0 || DailyBotProfit()<g_dailyProfitTarget))
      UnlockDailyProfitLock("DAILY_TARGET_UPDATED");

   if(g_dailyProfitTargetArmed &&
      (g_dailyProfitTarget <= 0.0 || DailyBotProfit() < g_dailyProfitTarget))
      DisarmDailyProfitRunOn();
}

int EntryDirection(double momentum)
{
   if(g_entryMode == ENTRY_BUY_ONLY) return 1;
   if(g_entryMode == ENTRY_SELL_ONLY) return -1;
   if(momentum >= InpMomentumEntryPoints) return 1;
   if(momentum <= -InpMomentumEntryPoints) return -1;
   return 0;
}

bool AdaptiveSessionAllowed()
{
   MqlDateTime parts;
   datetime now = TimeTradeServer();
   if(now <= 0) now = TimeCurrent();
   TimeToStruct(now, parts);

   if(g_sessionStartHour == 0 && g_sessionEndHour == 24) return true;
   if(g_sessionStartHour < g_sessionEndHour)
      return parts.hour >= g_sessionStartHour && parts.hour < g_sessionEndHour;
   return parts.hour >= g_sessionStartHour || parts.hour < g_sessionEndHour;
}

double AverageTrueRangePoints(ENUM_TIMEFRAMES timeframe, int period)
{
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int required = period + 1;
   if(CopyRates(_Symbol, timeframe, 0, required, rates) < required)
      return 0.0;

   double total = 0.0;
   for(int i = 0; i < period; i++)
   {
      double previousClose = rates[i + 1].close;
      double range = MathMax(rates[i].high - rates[i].low,
                             MathMax(MathAbs(rates[i].high - previousClose),
                                     MathAbs(rates[i].low - previousClose)));
      total += range;
   }
   return (total / period) / _Point;
}

int TimeframeTrend(ENUM_TIMEFRAMES timeframe)
{
   const int fastPeriod = 12;
   const int slowPeriod = 26;
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, timeframe, 1, slowPeriod, rates) < slowPeriod)
      return 0;

   double fast = 0.0;
   double slow = 0.0;
   for(int i = 0; i < slowPeriod; i++)
   {
      slow += rates[i].close;
      if(i < fastPeriod) fast += rates[i].close;
   }
   fast /= fastPeriod;
   slow /= slowPeriod;
   double neutralBand = MathMax(_Point * 2.0, AverageTrueRangePoints(timeframe, g_atrPeriod) * _Point * 0.03);
   if(fast > slow + neutralBand) return 1;
   if(fast < slow - neutralBand) return -1;
   return 0;
}

string TimeframeShortName(ENUM_TIMEFRAMES timeframe)
{
   if(timeframe == PERIOD_M1) return "M1";
   if(timeframe == PERIOD_M5) return "M5";
   if(timeframe == PERIOD_M15) return "M15";
   if(timeframe == PERIOD_M30) return "M30";
   if(timeframe == PERIOD_H1) return "H1";
   return "TF";
}

bool FindClusteredPivotLevels(
   ENUM_TIMEFRAMES timeframe,
   int lookback,
   double currentPrice,
   double atrPrice,
   double &support,
   double &resistance,
   double &supportStrength,
   double &resistanceStrength
)
{
   support = 0.0;
   resistance = 0.0;
   supportStrength = 0.0;
   resistanceStrength = 0.0;
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, timeframe, 1, MathMax(20, lookback), rates);
   if(copied < 10)
      return false;

   double tolerance = MathMax(_Point * 8.0, atrPrice * 0.10);
   double safeAtr = MathMax(_Point * 20.0, atrPrice);
   double bestSupportRank = -1.0e100;
   double bestResistanceRank = -1.0e100;

   // A useful S/R level is not one isolated wick. Score every confirmed pivot
   // by repeated touches, rejection size, recency and distance from live price.
   for(int i = 3; i < copied - 3; i++)
   {
      bool pivotLow = true;
      bool pivotHigh = true;
      for(int depth = 1; depth <= 3; depth++)
      {
         if(rates[i].low >= rates[i-depth].low || rates[i].low > rates[i+depth].low)
            pivotLow = false;
         if(rates[i].high <= rates[i-depth].high || rates[i].high < rates[i+depth].high)
            pivotHigh = false;
      }

      if(pivotLow && rates[i].low < currentPrice)
      {
         int touches = 0;
         for(int j = 2; j < copied - 2; j++)
            if(MathAbs(rates[j].low - rates[i].low) <= tolerance)
               touches++;

         double rejection = MathMax(0.0, rates[i].close - rates[i].low) / safeAtr;
         double recency = 1.0 - (double)i / MathMax(1, copied);
         double strength = MathMin(100.0,
            18.0 + MathMin(5, touches) * 12.0 + MathMin(25.0, rejection * 22.0) + recency * 16.0);
         double distanceAtr = (currentPrice - rates[i].low) / safeAtr;
         double rank = strength - distanceAtr * 2.0;
         if(rank > bestSupportRank)
         {
            bestSupportRank = rank;
            support = rates[i].low;
            supportStrength = strength;
         }
      }

      if(pivotHigh && rates[i].high > currentPrice)
      {
         int touches = 0;
         for(int j = 2; j < copied - 2; j++)
            if(MathAbs(rates[j].high - rates[i].high) <= tolerance)
               touches++;

         double rejection = MathMax(0.0, rates[i].high - rates[i].close) / safeAtr;
         double recency = 1.0 - (double)i / MathMax(1, copied);
         double strength = MathMin(100.0,
            18.0 + MathMin(5, touches) * 12.0 + MathMin(25.0, rejection * 22.0) + recency * 16.0);
         double distanceAtr = (rates[i].high - currentPrice) / safeAtr;
         double rank = strength - distanceAtr * 2.0;
         if(rank > bestResistanceRank)
         {
            bestResistanceRank = rank;
            resistance = rates[i].high;
            resistanceStrength = strength;
         }
      }
   }

   // Keep context available in a one-way market, but mark fallback levels weak.
   if(support <= 0.0 || resistance <= 0.0)
   {
      double lowest = rates[0].low;
      double highest = rates[0].high;
      for(int i = 1; i < copied; i++)
      {
         lowest = MathMin(lowest, rates[i].low);
         highest = MathMax(highest, rates[i].high);
      }
      if(support <= 0.0 && lowest < currentPrice)
      {
         support = lowest;
         supportStrength = 20.0;
      }
      if(resistance <= 0.0 && highest > currentPrice)
      {
         resistance = highest;
         resistanceStrength = 20.0;
      }
   }
   return support > 0.0 || resistance > 0.0;
}

bool FindActiveImpulse(
   ENUM_TIMEFRAMES timeframe,
   int lookback,
   double atrPrice,
   double &swingLow,
   datetime &swingLowTime,
   double &swingHigh,
   datetime &swingHighTime,
   int &direction,
   double &strength
)
{
   swingLow = 0.0;
   swingHigh = 0.0;
   swingLowTime = 0;
   swingHighTime = 0;
   direction = 0;
   strength = 0.0;

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, timeframe, 1, MathMax(30, lookback), rates);
   if(copied < 20)
      return false;

   // Use the latest confirmed swing pair. The previous implementation used the
   // absolute high/low of the whole window, which often drew a stale Fibonacci.
   int latestLowIndex = -1;
   int latestHighIndex = -1;
   const int depth = 3;
   for(int i = depth; i < copied - depth; i++)
   {
      bool pivotLow = true;
      bool pivotHigh = true;
      for(int j = 1; j <= depth; j++)
      {
         if(rates[i].low >= rates[i-j].low || rates[i].low > rates[i+j].low)
            pivotLow = false;
         if(rates[i].high <= rates[i-j].high || rates[i].high < rates[i+j].high)
            pivotHigh = false;
      }
      if(latestLowIndex < 0 && pivotLow) latestLowIndex = i;
      if(latestHighIndex < 0 && pivotHigh) latestHighIndex = i;
      if(latestLowIndex >= 0 && latestHighIndex >= 0) break;
   }

   if(latestLowIndex < 0 || latestHighIndex < 0 || latestLowIndex == latestHighIndex)
      return false;

   // Series arrays are newest first. A newer high after an older low is a
   // bullish impulse; a newer low after an older high is bearish.
   if(latestHighIndex < latestLowIndex)
   {
      direction = 1;
      swingLow = rates[latestLowIndex].low;
      swingLowTime = rates[latestLowIndex].time;
      swingHigh = rates[latestHighIndex].high;
      swingHighTime = rates[latestHighIndex].time;
   }
   else
   {
      direction = -1;
      swingHigh = rates[latestHighIndex].high;
      swingHighTime = rates[latestHighIndex].time;
      swingLow = rates[latestLowIndex].low;
      swingLowTime = rates[latestLowIndex].time;
   }

   double minimumImpulse = MathMax(_Point * 20.0, atrPrice * 0.75);
   if(swingHigh <= swingLow || swingHigh - swingLow < minimumImpulse)
   {
      direction = 0;
      return false;
   }
   double rangeAtr = (swingHigh - swingLow) / MathMax(_Point * 20.0, atrPrice);
   int newestPivotIndex = MathMin(latestLowIndex, latestHighIndex);
   double recency = 1.0 - (double)newestPivotIndex / MathMax(1, copied);
   strength = MathMin(100.0, 30.0 + MathMin(45.0, rangeAtr * 16.0) + recency * 25.0);
   return true;
}

string OrderBlockStateName(int mitigations)
{
   if(mitigations <= 0) return "FRESH";
   if(mitigations == 1) return "TESTED";
   if(mitigations <= 3) return "MITIGATED";
   return "HEAVY_MITIGATION";
}

bool FindRecentOrderBlock(
   ENUM_TIMEFRAMES timeframe,
   int lookback,
   bool bullish,
   double atrPrice,
   double currentPrice,
   double &zoneLow,
   double &zoneHigh,
   double &strength,
   int &mitigationsOut,
   int &ageBarsOut,
   string &stateOut
)
{
   zoneLow = 0.0;
   zoneHigh = 0.0;
   strength = 0.0;
   mitigationsOut = 0;
   ageBarsOut = 0;
   stateOut = "NONE";

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, timeframe, 1, MathMax(30, lookback), rates);
   if(copied < 12)
      return false;

   double safeAtr = MathMax(_Point * 20.0, atrPrice);
   double displacementFloor = MathMax(_Point * 8.0, safeAtr * 0.55);
   double bestRank = -1.0e100;

   for(int i = 4; i < copied - 9; i++)
   {
      bool candidate = bullish
         ? rates[i].close < rates[i].open
         : rates[i].close > rates[i].open;
      if(!candidate)
         continue;

      double impulseClose = rates[i-1].close;
      double impulseExtreme = bullish ? rates[i-1].high : rates[i-1].low;
      for(int j = i - 2; j >= MathMax(0, i - 3); j--)
      {
         if(bullish)
         {
            impulseClose = MathMax(impulseClose, rates[j].close);
            impulseExtreme = MathMax(impulseExtreme, rates[j].high);
         }
         else
         {
            impulseClose = MathMin(impulseClose, rates[j].close);
            impulseExtreme = MathMin(impulseExtreme, rates[j].low);
         }
      }

      double priorStructure = bullish ? rates[i+1].high : rates[i+1].low;
      for(int j = i + 2; j <= MathMin(copied - 1, i + 8); j++)
         priorStructure = bullish
            ? MathMax(priorStructure, rates[j].high)
            : MathMin(priorStructure, rates[j].low);

      double displacement = bullish
         ? impulseExtreme - rates[i].close
         : rates[i].close - impulseExtreme;
      bool brokeStructure = bullish
         ? impulseClose > priorStructure + safeAtr * 0.03
         : impulseClose < priorStructure - safeAtr * 0.03;
      if(!brokeStructure || displacement < displacementFloor)
         continue;

      double candidateLow = bullish ? rates[i].low : MathMin(rates[i].open, rates[i].close);
      double candidateHigh = bullish ? MathMax(rates[i].open, rates[i].close) : rates[i].high;

      bool invalidated = bullish
         ? currentPrice < candidateLow - safeAtr * 0.08
         : currentPrice > candidateHigh + safeAtr * 0.08;
      int mitigations = 0;
      for(int j = i - 1; j >= 0 && !invalidated; j--)
      {
         if(bullish && rates[j].close < candidateLow - safeAtr * 0.08)
            invalidated = true;
         else if(!bullish && rates[j].close > candidateHigh + safeAtr * 0.08)
            invalidated = true;

         if(rates[j].low <= candidateHigh && rates[j].high >= candidateLow)
            mitigations++;
      }
      if(invalidated)
         continue;

      bool imbalance = i >= 2 && (bullish
         ? rates[i-2].low > rates[i].high
         : rates[i-2].high < rates[i].low);
      double breakMargin = bullish
         ? impulseClose - priorStructure
         : priorStructure - impulseClose;
      double freshness = 1.0 - (double)i / MathMax(1, copied);
      double candidateStrength = 35.0 +
         MathMin(25.0, displacement / safeAtr * 12.0) +
         MathMin(15.0, MathMax(0.0, breakMargin) / safeAtr * 20.0) +
         (imbalance ? 10.0 : 0.0) + freshness * 15.0 -
         MathMax(0, mitigations - 1) * 8.0;
      candidateStrength = MathMax(0.0, MathMin(100.0, candidateStrength));

      // v2 rank values freshness/displacement but does not invalidate a setup
      // simply because it has already been tested. State is advisory.
      double rank = candidateStrength + freshness * 8.0 - MathMax(0, mitigations - 1) * 2.0;
      if(rank > bestRank)
      {
         bestRank = rank;
         zoneLow = candidateLow;
         zoneHigh = candidateHigh;
         strength = candidateStrength;
         mitigationsOut = mitigations;
         ageBarsOut = i;
         stateOut = OrderBlockStateName(mitigations);
      }
   }
   return zoneLow > 0.0 && zoneHigh >= zoneLow;
}

double ClosestBelow(double currentPrice, double a, double b, double c)
{
   double best = 0.0;
   if(a > 0.0 && a < currentPrice) best = a;
   if(b > 0.0 && b < currentPrice && (best <= 0.0 || b > best)) best = b;
   if(c > 0.0 && c < currentPrice && (best <= 0.0 || c > best)) best = c;
   return best;
}

double ClosestAbove(double currentPrice, double a, double b, double c)
{
   double best = 0.0;
   if(a > currentPrice) best = a;
   if(b > currentPrice && (best <= 0.0 || b < best)) best = b;
   if(c > currentPrice && (best <= 0.0 || c < best)) best = c;
   return best;
}

string TradingFibonacciObjectName()
{
   if(g_fiboObjectName != "")
      return g_fiboObjectName;
   g_fiboObjectName = StringFormat("SCN_FIB_%s_%I64d", _Symbol, InpMagic);
   return g_fiboObjectName;
}

void DeleteTradingFibonacci()
{
   string name = TradingFibonacciObjectName();
   if(ObjectFind(0, name) >= 0)
      ObjectDelete(0, name);
   g_fiboVisible = false;
}

void DrawTradingFibonacci()
{
   if(g_fibDirection == 0 ||
      g_fibSwingLow <= 0.0 ||
      g_fibSwingHigh <= g_fibSwingLow ||
      g_fibSwingLowTime <= 0 ||
      g_fibSwingHighTime <= 0)
      return;

   string name = TradingFibonacciObjectName();
   datetime time1 = g_fibDirection > 0 ? g_fibSwingLowTime : g_fibSwingHighTime;
   datetime time2 = g_fibDirection > 0 ? g_fibSwingHighTime : g_fibSwingLowTime;
   double price1 = g_fibDirection > 0 ? g_fibSwingLow : g_fibSwingHigh;
   double price2 = g_fibDirection > 0 ? g_fibSwingHigh : g_fibSwingLow;

   if(ObjectFind(0, name) < 0)
   {
      if(!ObjectCreate(0, name, OBJ_FIBO, 0, time1, price1, time2, price2))
         return;
   }
   else
   {
      ObjectMove(0, name, 0, time1, price1);
      ObjectMove(0, name, 1, time2, price2);
   }

   const int levelCount = 10;
   double levels[10] = {0.0,0.236,0.382,0.500,0.618,0.705,0.786,1.0,1.272,1.618};
   string labels[10] = {
      "0.0  Impulse","23.6","38.2  Pullback","50.0  Value",
      "61.8  Golden","70.5  OTE","78.6","100.0  Origin","127.2  TP","161.8  TP"
   };
   labels[0] = "0.0  " + g_fibTimeframe + " Impulse";
   ObjectSetInteger(0, name, OBJPROP_LEVELS, levelCount);
   ObjectSetInteger(0, name, OBJPROP_RAY_RIGHT, true);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
   for(int i = 0; i < levelCount; i++)
   {
      ObjectSetDouble(0, name, OBJPROP_LEVELVALUE, i, levels[i]);
      ObjectSetString(0, name, OBJPROP_LEVELTEXT, i, labels[i]);
      color levelColor = (i == 4 || i == 5) ? clrGold :
                         (i >= 8 ? clrLimeGreen : C'121,105,255');
      ObjectSetInteger(0, name, OBJPROP_LEVELCOLOR, i, levelColor);
      ObjectSetInteger(0, name, OBJPROP_LEVELSTYLE, i, i >= 8 ? STYLE_DASH : STYLE_SOLID);
      ObjectSetInteger(0, name, OBJPROP_LEVELWIDTH, i, (i == 4 || i == 5) ? 2 : 1);
   }
   g_fiboVisible = true;
}

double FibonacciRetracementAtPrice(int direction, double swingLow, double swingHigh, double price)
{
   double range = swingHigh - swingLow;
   if(direction == 0 || range <= 0.0)
      return 0.0;
   double retracement = direction > 0
      ? (swingHigh - price) / range
      : (price - swingLow) / range;
   return MathMax(0.0, MathMin(1.75, retracement));
}

void RefreshMarketContext(bool force)
{
   datetime now = TimeCurrent();
   if(!force && g_lastMarketContextUpdate > 0 && now == g_lastMarketContextUpdate)
      return;
   g_lastMarketContextUpdate = now;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
      return;
   double price = (tick.bid + tick.ask) * 0.5;

   g_trendM1 = TimeframeTrend(PERIOD_M1);
   g_trendM5 = TimeframeTrend(PERIOD_M5);
   g_trendM15 = TimeframeTrend(PERIOD_M15);
   g_trendM30 = TimeframeTrend(PERIOD_M30);
   g_trendH1 = TimeframeTrend(PERIOD_H1);
   RefreshEmaIntelligence(false);
   RefreshPriceActionIntelligence();

   double atrM15Price = MathMax(_Point * 20.0, AverageTrueRangePoints(PERIOD_M15, g_atrPeriod) * _Point);
   double atrM5Price = MathMax(_Point * 12.0, AverageTrueRangePoints(PERIOD_M5, g_atrPeriod) * _Point);
   double s5=0.0,r5=0.0,s15=0.0,r15=0.0,s30=0.0,r30=0.0,sH1=0.0,rH1=0.0;
   double ss5=0.0,rs5=0.0,ss15=0.0,rs15=0.0,ss30=0.0,rs30=0.0,ssH1=0.0,rsH1=0.0;
   FindClusteredPivotLevels(PERIOD_M5, 180, price, atrM5Price, s5, r5, ss5, rs5);
   FindClusteredPivotLevels(PERIOD_M15, 140, price, atrM15Price, s15, r15, ss15, rs15);
   FindClusteredPivotLevels(PERIOD_M30, 120, price, atrM15Price * 1.35, s30, r30, ss30, rs30);
   FindClusteredPivotLevels(PERIOD_H1, 100, price, atrM15Price * 1.80, sH1, rH1, ssH1, rsH1);
   g_m5Support = s5;
   g_m5Resistance = r5;
   g_nearestSupport = ClosestBelow(price, ClosestBelow(price, s5, s15, s30), sH1, 0.0);
   g_nearestResistance = ClosestAbove(price, ClosestAbove(price, r5, r15, r30), rH1, 0.0);
   g_majorSupport = ClosestBelow(price, s30, sH1, 0.0);
   g_majorResistance = ClosestAbove(price, r30, rH1, 0.0);
   g_supportStrength = g_nearestSupport > 0.0 && MathAbs(g_nearestSupport - s5) < _Point ? ss5 :
                       MathAbs(g_nearestSupport - s15) < _Point ? ss15 :
                       MathAbs(g_nearestSupport - s30) < _Point ? ss30 : ssH1;
   g_resistanceStrength = g_nearestResistance > 0.0 && MathAbs(g_nearestResistance - r5) < _Point ? rs5 :
                          MathAbs(g_nearestResistance - r15) < _Point ? rs15 :
                          MathAbs(g_nearestResistance - r30) < _Point ? rs30 : rsH1;
   g_supportTimeframe = g_nearestSupport <= 0.0 ? "NONE" :
      MathAbs(g_nearestSupport-s5)<_Point ? "M5" :
      MathAbs(g_nearestSupport-s15)<_Point ? "M15" :
      MathAbs(g_nearestSupport-s30)<_Point ? "M30" : "H1";
   g_resistanceTimeframe = g_nearestResistance <= 0.0 ? "NONE" :
      MathAbs(g_nearestResistance-r5)<_Point ? "M5" :
      MathAbs(g_nearestResistance-r15)<_Point ? "M15" :
      MathAbs(g_nearestResistance-r30)<_Point ? "M30" : "H1";

   double bull5L=0.0,bull5H=0.0,bear5L=0.0,bear5H=0.0;
   double bull15L=0.0,bull15H=0.0,bear15L=0.0,bear15H=0.0;
   double bull30L=0.0,bull30H=0.0,bear30L=0.0,bear30H=0.0;
   double bull5Strength=0.0,bear5Strength=0.0;
   double bull15Strength=0.0,bear15Strength=0.0;
   double bull30Strength=0.0,bear30Strength=0.0;
   int bull5Mit=0,bear5Mit=0,bull15Mit=0,bear15Mit=0,bull30Mit=0,bear30Mit=0;
   int bull5Age=0,bear5Age=0,bull15Age=0,bear15Age=0,bull30Age=0,bear30Age=0;
   string bull5State="NONE",bear5State="NONE",bull15State="NONE",bear15State="NONE",bull30State="NONE",bear30State="NONE";

   bool haveBull5 = FindRecentOrderBlock(PERIOD_M5,160,true,atrM15Price*0.55,price,bull5L,bull5H,bull5Strength,bull5Mit,bull5Age,bull5State);
   bool haveBear5 = FindRecentOrderBlock(PERIOD_M5,160,false,atrM15Price*0.55,price,bear5L,bear5H,bear5Strength,bear5Mit,bear5Age,bear5State);
   bool haveBull15 = FindRecentOrderBlock(PERIOD_M15,120,true,atrM15Price,price,bull15L,bull15H,bull15Strength,bull15Mit,bull15Age,bull15State);
   bool haveBear15 = FindRecentOrderBlock(PERIOD_M15,120,false,atrM15Price,price,bear15L,bear15H,bear15Strength,bear15Mit,bear15Age,bear15State);
   bool haveBull30 = FindRecentOrderBlock(PERIOD_M30,100,true,atrM15Price*1.35,price,bull30L,bull30H,bull30Strength,bull30Mit,bull30Age,bull30State);
   bool haveBear30 = FindRecentOrderBlock(PERIOD_M30,100,false,atrM15Price*1.35,price,bear30L,bear30H,bear30Strength,bear30Mit,bear30Age,bear30State);

   double bull5Rank = haveBull5 ? bull5Strength - bull5Mit*2.0 - bull5Age*0.02 : -1.0e100;
   double bull15Rank = haveBull15 ? bull15Strength + 4.0 - bull15Mit*2.0 - bull15Age*0.02 : -1.0e100;
   double bull30Rank = haveBull30 ? bull30Strength + 7.0 - bull30Mit*2.0 - bull30Age*0.02 : -1.0e100;
   double bear5Rank = haveBear5 ? bear5Strength - bear5Mit*2.0 - bear5Age*0.02 : -1.0e100;
   double bear15Rank = haveBear15 ? bear15Strength + 4.0 - bear15Mit*2.0 - bear15Age*0.02 : -1.0e100;
   double bear30Rank = haveBear30 ? bear30Strength + 7.0 - bear30Mit*2.0 - bear30Age*0.02 : -1.0e100;

   if(bull30Rank >= bull15Rank && bull30Rank >= bull5Rank)
   {
      g_bullishOrderBlockLow=bull30L; g_bullishOrderBlockHigh=bull30H; g_bullishOrderBlockStrength=bull30Strength;
      g_bullishOrderBlockMitigations=bull30Mit; g_bullishOrderBlockAgeBars=bull30Age; g_bullishOrderBlockState=bull30State; g_bullishOrderBlockTimeframe="M30";
   }
   else if(bull15Rank >= bull5Rank)
   {
      g_bullishOrderBlockLow=bull15L; g_bullishOrderBlockHigh=bull15H; g_bullishOrderBlockStrength=bull15Strength;
      g_bullishOrderBlockMitigations=bull15Mit; g_bullishOrderBlockAgeBars=bull15Age; g_bullishOrderBlockState=bull15State; g_bullishOrderBlockTimeframe="M15";
   }
   else
   {
      g_bullishOrderBlockLow=bull5L; g_bullishOrderBlockHigh=bull5H; g_bullishOrderBlockStrength=bull5Strength;
      g_bullishOrderBlockMitigations=bull5Mit; g_bullishOrderBlockAgeBars=bull5Age; g_bullishOrderBlockState=bull5State; g_bullishOrderBlockTimeframe=haveBull5?"M5":"NONE";
   }

   if(bear30Rank >= bear15Rank && bear30Rank >= bear5Rank)
   {
      g_bearishOrderBlockLow=bear30L; g_bearishOrderBlockHigh=bear30H; g_bearishOrderBlockStrength=bear30Strength;
      g_bearishOrderBlockMitigations=bear30Mit; g_bearishOrderBlockAgeBars=bear30Age; g_bearishOrderBlockState=bear30State; g_bearishOrderBlockTimeframe="M30";
   }
   else if(bear15Rank >= bear5Rank)
   {
      g_bearishOrderBlockLow=bear15L; g_bearishOrderBlockHigh=bear15H; g_bearishOrderBlockStrength=bear15Strength;
      g_bearishOrderBlockMitigations=bear15Mit; g_bearishOrderBlockAgeBars=bear15Age; g_bearishOrderBlockState=bear15State; g_bearishOrderBlockTimeframe="M15";
   }
   else
   {
      g_bearishOrderBlockLow=bear5L; g_bearishOrderBlockHigh=bear5H; g_bearishOrderBlockStrength=bear5Strength;
      g_bearishOrderBlockMitigations=bear5Mit; g_bearishOrderBlockAgeBars=bear5Age; g_bearishOrderBlockState=bear5State; g_bearishOrderBlockTimeframe=haveBear5?"M5":"NONE";
   }

   double bullStateFactor = g_bullishOrderBlockState=="FRESH" ? 1.00 : g_bullishOrderBlockState=="TESTED" ? 0.95 : g_bullishOrderBlockState=="MITIGATED" ? 0.82 : 0.70;
   double bearStateFactor = g_bearishOrderBlockState=="FRESH" ? 1.00 : g_bearishOrderBlockState=="TESTED" ? 0.95 : g_bearishOrderBlockState=="MITIGATED" ? 0.82 : 0.70;
   g_bullishOrderBlockQuality = MathMax(0.0,MathMin(100.0,g_bullishOrderBlockStrength*bullStateFactor));
   g_bearishOrderBlockQuality = MathMax(0.0,MathMin(100.0,g_bearishOrderBlockStrength*bearStateFactor));
   g_orderBlockTimeframe = g_bullishOrderBlockTimeframe==g_bearishOrderBlockTimeframe
      ? g_bullishOrderBlockTimeframe
      : g_bullishOrderBlockTimeframe+"+"+g_bearishOrderBlockTimeframe;

   // Read both execution (M5) and structure (M15) impulses. The primary Fib is
   // selected by swing quality + trend agreement, while both contribute to the
   // entry score below.
   double fib5Low=0.0,fib5High=0.0,fib15Low=0.0,fib15High=0.0;
   datetime fib5LowTime=0,fib5HighTime=0,fib15LowTime=0,fib15HighTime=0;
   bool haveFib5 = FindActiveImpulse(
      PERIOD_M5, 180, atrM5Price,
      fib5Low, fib5LowTime, fib5High, fib5HighTime,
      g_fibM5Direction, g_fibM5Strength
   );
   bool haveFib15 = FindActiveImpulse(
      PERIOD_M15, 140, atrM15Price,
      fib15Low, fib15LowTime, fib15High, fib15HighTime,
      g_fibM15Direction, g_fibM15Strength
   );
   g_fibM5Retracement = haveFib5
      ? FibonacciRetracementAtPrice(g_fibM5Direction, fib5Low, fib5High, price) : 0.0;
   g_fibM15Retracement = haveFib15
      ? FibonacciRetracementAtPrice(g_fibM15Direction, fib15Low, fib15High, price) : 0.0;

   double fib5Quality = haveFib5
      ? g_fibM5Strength + (g_fibM5Direction == g_trendM5 ? 10.0 : 0.0) : -1.0;
   double fib15Quality = haveFib15
      ? g_fibM15Strength + (g_fibM15Direction == g_trendM15 ? 12.0 : 0.0) + 5.0 : -1.0;
   bool useFib15 = haveFib15 && (!haveFib5 || fib15Quality >= fib5Quality);

   if(useFib15)
   {
      g_fibSwingLow = fib15Low;
      g_fibSwingLowTime = fib15LowTime;
      g_fibSwingHigh = fib15High;
      g_fibSwingHighTime = fib15HighTime;
      g_fibDirection = g_fibM15Direction;
      g_fibRetracement = g_fibM15Retracement;
      g_fibTimeframe = "M15";
   }
   else if(haveFib5)
   {
      g_fibSwingLow = fib5Low;
      g_fibSwingLowTime = fib5LowTime;
      g_fibSwingHigh = fib5High;
      g_fibSwingHighTime = fib5HighTime;
      g_fibDirection = g_fibM5Direction;
      g_fibRetracement = g_fibM5Retracement;
      g_fibTimeframe = "M5";
   }
   else
   {
      g_fibSwingLow = 0.0;
      g_fibSwingHigh = 0.0;
      g_fibDirection = 0;
      g_fibRetracement = 0.0;
      g_fibTimeframe = "NONE";
   }

   RefreshCycleIndicators();

   if(g_state == STATE_RUNNING)
      DrawTradingFibonacci();
}

bool PriceInsideOrNearZone(double price, double low, double high, double buffer)
{
   if(low <= 0.0 || high <= 0.0 || high < low)
      return false;
   return price >= low - buffer && price <= high + buffer;
}

double FibonacciSetupScore(int direction, int fibDirection, double retracement, double strength)
{
   if(fibDirection != direction || retracement < 0.382 || retracement > 0.786)
      return 0.0;
   double score = 4.0 + MathMin(5.0, strength * 0.05);
   if(retracement >= 0.500 && retracement <= 0.705)
      score += 5.0;
   if(MathAbs(retracement - 0.618) <= 0.060)
      score += 3.0;
   return score;
}

bool ConfirmedLevelBreak(int direction, double level, double buffer)
{
   if(level <= 0.0)
      return false;
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, PERIOD_M5, 1, 3, rates) < 3)
      return false;

   if(direction > 0)
      return rates[0].close > level + buffer &&
         (rates[1].close <= level + buffer || rates[0].low <= level + buffer);
   return rates[0].close < level - buffer &&
      (rates[1].close >= level - buffer || rates[0].high >= level - buffer);
}

bool RecentDirectionalRejection(int direction, double zoneLow, double zoneHigh, double buffer)
{
   if(zoneLow <= 0.0 || zoneHigh < zoneLow)
      return false;
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, PERIOD_M5, 1, 2, rates) < 2)
      return false;

   bool touched = rates[0].low <= zoneHigh + buffer && rates[0].high >= zoneLow - buffer;
   if(!touched)
      return false;
   double body = MathMax(_Point, MathAbs(rates[0].close - rates[0].open));
   if(direction > 0)
   {
      double lowerWick = MathMin(rates[0].open, rates[0].close) - rates[0].low;
      return rates[0].close > rates[0].open && lowerWick >= body * 0.60;
   }
   double upperWick = rates[0].high - MathMax(rates[0].open, rates[0].close);
   return rates[0].close < rates[0].open && upperWick >= body * 0.60;
}

bool RecentDirectionalBody(int direction, ENUM_TIMEFRAMES timeframe)
{
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, timeframe, 1, 2, rates) < 2)
      return false;

   double range = MathMax(_Point, rates[0].high - rates[0].low);
   double body = MathAbs(rates[0].close - rates[0].open);
   if(body < range * 0.28)
      return false;

   if(direction > 0)
      return rates[0].close > rates[0].open &&
         rates[0].close >= rates[0].low + range * 0.58;
   return rates[0].close < rates[0].open &&
      rates[0].close <= rates[0].high - range * 0.58;
}

string CandlestickPattern(
   int direction,
   ENUM_TIMEFRAMES timeframe,
   double &scoreOut
)
{
   scoreOut = 0.0;
   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   if(CopyRates(_Symbol,timeframe,1,4,rates) < 4)
      return "NONE";

   double range0 = MathMax(_Point,rates[0].high-rates[0].low);
   double body0 = MathAbs(rates[0].close-rates[0].open);
   double lowerWick0 = MathMin(rates[0].open,rates[0].close)-rates[0].low;
   double upperWick0 = rates[0].high-MathMax(rates[0].open,rates[0].close);

   bool bull0 = rates[0].close > rates[0].open;
   bool bear0 = rates[0].close < rates[0].open;
   bool bull1 = rates[1].close > rates[1].open;
   bool bear1 = rates[1].close < rates[1].open;

   bool engulfing = direction > 0
      ? (bull0 && bear1 &&
         rates[0].open <= rates[1].close &&
         rates[0].close >= rates[1].open)
      : (bear0 && bull1 &&
         rates[0].open >= rates[1].close &&
         rates[0].close <= rates[1].open);
   if(engulfing)
   {
      scoreOut = 38.0;
      return direction > 0 ? "BULL_ENGULFING" : "BEAR_ENGULFING";
   }

   double wickRatio = direction > 0
      ? lowerWick0/range0
      : upperWick0/range0;
   double oppositeWickRatio = direction > 0
      ? upperWick0/range0
      : lowerWick0/range0;
   bool directionClose = direction > 0 ? bull0 : bear0;

   if(wickRatio >= 0.55 && oppositeWickRatio <= 0.20)
   {
      scoreOut = 34.0;
      return direction > 0 ? "BULL_PINBAR" : "BEAR_PINBAR";
   }

   if(directionClose && wickRatio >= 0.35)
   {
      scoreOut = 27.0;
      return direction > 0 ? "BULL_REJECTION" : "BEAR_REJECTION";
   }

   bool breakRetest = direction > 0
      ? (rates[1].close > rates[2].high &&
         rates[0].low <= rates[2].high &&
         rates[0].close > rates[2].high)
      : (rates[1].close < rates[2].low &&
         rates[0].high >= rates[2].low &&
         rates[0].close < rates[2].low);
   if(breakRetest)
   {
      scoreOut = 32.0;
      return direction > 0 ? "BULL_BREAK_RETEST" : "BEAR_BREAK_RETEST";
   }

   if(directionClose && body0 >= range0*0.60)
   {
      scoreOut = 18.0;
      return direction > 0 ? "BULL_BODY" : "BEAR_BODY";
   }

   return "NONE";
}

void RefreshPriceActionIntelligence()
{
   double buyM1=0.0,buyM5=0.0,sellM1=0.0,sellM5=0.0;
   string buy1 = CandlestickPattern(1,PERIOD_M1,buyM1);
   string buy5 = CandlestickPattern(1,PERIOD_M5,buyM5);
   string sell1 = CandlestickPattern(-1,PERIOD_M1,sellM1);
   string sell5 = CandlestickPattern(-1,PERIOD_M5,sellM5);

   if(buyM5 >= buyM1)
   {
      g_priceActionBuy = buy5;
      g_priceActionBuyScore = buyM5;
   }
   else
   {
      g_priceActionBuy = buy1;
      g_priceActionBuyScore = buyM1;
   }

   if(sellM5 >= sellM1)
   {
      g_priceActionSell = sell5;
      g_priceActionSellScore = sellM5;
   }
   else
   {
      g_priceActionSell = sell1;
      g_priceActionSellScore = sellM1;
   }
}

double RsiValue(ENUM_TIMEFRAMES timeframe,int shift)
{
   int handle = iRSI(_Symbol,timeframe,14,PRICE_CLOSE);
   if(handle == INVALID_HANDLE)
      return 50.0;

   double value[1];
   double result = 50.0;
   if(CopyBuffer(handle,0,shift,1,value) == 1)
      result = value[0];
   IndicatorRelease(handle);
   return result;
}

bool AdxSnapshot(
   ENUM_TIMEFRAMES timeframe,
   double &adxOut,
   double &plusDiOut,
   double &minusDiOut
)
{
   adxOut = 0.0;
   plusDiOut = 0.0;
   minusDiOut = 0.0;

   int handle = iADX(_Symbol,timeframe,14);
   if(handle == INVALID_HANDLE)
      return false;

   double adx[1], plusDi[1], minusDi[1];
   bool ok =
      CopyBuffer(handle,0,1,1,adx) == 1 &&
      CopyBuffer(handle,1,1,1,plusDi) == 1 &&
      CopyBuffer(handle,2,1,1,minusDi) == 1;
   if(ok)
   {
      adxOut = adx[0];
      plusDiOut = plusDi[0];
      minusDiOut = minusDi[0];
   }
   IndicatorRelease(handle);
   return ok;
}

double SessionVwap(ENUM_TIMEFRAMES timeframe,int bars)
{
   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   int copied = CopyRates(_Symbol,timeframe,1,MathMax(8,bars),rates);
   if(copied <= 0)
      return 0.0;

   double weighted = 0.0;
   double volumeSum = 0.0;
   for(int i=0;i<copied;i++)
   {
      double volume = (double)rates[i].tick_volume;
      if(volume <= 0.0) volume = 1.0;
      double typical = (rates[i].high + rates[i].low + rates[i].close) / 3.0;
      weighted += typical * volume;
      volumeSum += volume;
   }
   return volumeSum > 0.0 ? weighted / volumeSum : 0.0;
}

double RsiDivergenceScore(int direction)
{
   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   if(CopyRates(_Symbol,PERIOD_M5,1,5,rates) < 5)
      return 0.0;

   double rsiNow = RsiValue(PERIOD_M5,1);
   double rsiOld = RsiValue(PERIOD_M5,4);
   if(direction > 0 &&
      rates[0].low < rates[3].low &&
      rsiNow >= rsiOld + 3.0)
      return 18.0;

   if(direction < 0 &&
      rates[0].high > rates[3].high &&
      rsiNow <= rsiOld - 3.0)
      return 18.0;

   return 0.0;
}

double DemandSupplyZoneScore(int direction)
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return 0.0;

   double price = (tick.bid + tick.ask) * 0.5;
   double atrPrice = MathMax(
      _Point * 20.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod) * _Point
   );
   double score = 0.0;
   double paScore = direction > 0 ? g_priceActionBuyScore : g_priceActionSellScore;

   if(direction > 0)
   {
      if(g_nearestSupport > 0.0 &&
         MathAbs(price-g_nearestSupport) <= atrPrice*0.45)
         score += 16.0 + MathMin(12.0,g_supportStrength*0.12);

      if(g_majorSupport > 0.0 &&
         MathAbs(price-g_majorSupport) <= atrPrice*0.60)
         score += 10.0;

      if(PriceInsideOrNearZone(
         price,
         g_bullishOrderBlockLow,
         g_bullishOrderBlockHigh,
         atrPrice*0.16))
         score += 18.0 + MathMin(14.0,g_bullishOrderBlockQuality*0.14);

      if((g_fibM5Direction < 0 && g_fibM5Retracement <= 0.236) ||
         (g_fibM15Direction < 0 && g_fibM15Retracement <= 0.236))
         score += 10.0;

      if(g_rsiM5 <= 38.0) score += 7.0;
      if(g_vwapM5 > 0.0 && price < g_vwapM5-atrPrice*0.45) score += 7.0;
      if(g_emaReclaimState == "RECLAIM_EMA21_UP") score += 9.0;
   }
   else
   {
      if(g_nearestResistance > 0.0 &&
         MathAbs(price-g_nearestResistance) <= atrPrice*0.45)
         score += 16.0 + MathMin(12.0,g_resistanceStrength*0.12);

      if(g_majorResistance > 0.0 &&
         MathAbs(price-g_majorResistance) <= atrPrice*0.60)
         score += 10.0;

      if(PriceInsideOrNearZone(
         price,
         g_bearishOrderBlockLow,
         g_bearishOrderBlockHigh,
         atrPrice*0.16))
         score += 18.0 + MathMin(14.0,g_bearishOrderBlockQuality*0.14);

      if((g_fibM5Direction > 0 && g_fibM5Retracement <= 0.236) ||
         (g_fibM15Direction > 0 && g_fibM15Retracement <= 0.236))
         score += 10.0;

      if(g_rsiM5 >= 62.0) score += 7.0;
      if(g_vwapM5 > 0.0 && price > g_vwapM5+atrPrice*0.45) score += 7.0;
      if(g_emaReclaimState == "LOSE_EMA21_DOWN") score += 9.0;
   }

   if(paScore >= 18.0) score += 8.0;
   if(paScore >= 30.0) score += 6.0;
   score += RsiDivergenceScore(direction);

   // ADX/DMI measures exhaustion/confluence only; it is not a hard gate.
   if(g_adxM5 > 0.0 && g_adxM5 < 24.0)
      score += 5.0;
   if(direction > 0 && g_plusDiM5 > 0.0 && g_minusDiM5 <= g_plusDiM5*1.25)
      score += 4.0;
   if(direction < 0 && g_minusDiM5 > 0.0 && g_plusDiM5 <= g_minusDiM5*1.25)
      score += 4.0;

   return MathMax(0.0,MathMin(100.0,score));
}

void RefreshCycleIndicators()
{
   g_rsiM1 = RsiValue(PERIOD_M1,1);
   g_rsiM5 = RsiValue(PERIOD_M5,1);
   AdxSnapshot(PERIOD_M5,g_adxM5,g_plusDiM5,g_minusDiM5);
   g_vwapM5 = SessionVwap(PERIOD_M5,48);
   g_demandZoneScore = DemandSupplyZoneScore(1);
   g_supplyZoneScore = DemandSupplyZoneScore(-1);
}

bool ReversalOpportunityReady(int direction,double momentum,double &scoreOut)
{
   scoreOut = direction > 0 ? g_demandZoneScore : g_supplyZoneScore;
   if(direction == 0 || scoreOut < 52.0)
      return false;

   double paScore = direction > 0 ? g_priceActionBuyScore : g_priceActionSellScore;
   bool m1Turn =
      g_trendM1 == direction ||
      RecentDirectionalBody(direction,PERIOD_M1);
   bool m5Support =
      g_trendM5 == direction ||
      RecentDirectionalBody(direction,PERIOD_M5);
   bool emaTurn =
      (direction > 0 && g_emaReclaimState == "RECLAIM_EMA21_UP") ||
      (direction < 0 && g_emaReclaimState == "LOSE_EMA21_DOWN");
   bool momentumTurn = MomentumSupportsDirection(direction,momentum,0.30);
   bool executionConfirmed =
      (m1Turn && (m5Support || emaTurn || paScore >= 22.0 || momentumTurn)) ||
      (emaTurn && paScore >= 18.0) ||
      (m5Support && paScore >= 28.0);

   if(!executionConfirmed)
      return false;

   if(m1Turn) scoreOut += 7.0;
   if(m5Support) scoreOut += 8.0;
   if(emaTurn) scoreOut += 8.0;
   if(momentumTurn) scoreOut += 5.0;
   if(paScore >= 28.0) scoreOut += 7.0;
   scoreOut = MathMin(100.0,scoreOut);

   double threshold = g_macroTrendDirection == -direction ? 70.0 : 60.0;
   return scoreOut >= threshold;
}

string MarketCycleStateForDirection(int direction,double momentum)
{
   if(direction == 0)
      return "TRANSITION";

   double reversalScore = 0.0;
   if(ReversalOpportunityReady(direction,momentum,reversalScore))
      return "REVERSAL_CONFIRMED";

   bool microAligned = LowerTimeframeSupportsDirection(direction);
   bool microAgainst = g_trendM1 == -direction && g_trendM5 == -direction;
   double adverseZone = direction > 0 ? g_supplyZoneScore : g_demandZoneScore;

   if(adverseZone >= 72.0)
      return direction > 0 ? "SUPPLY_TERMINAL" : "DEMAND_TERMINAL";
   if(microAgainst)
      return "PULLBACK_OR_REVERSAL";
   if(microAligned)
      return "TREND_CONTINUATION";
   return "WAIT_EXECUTION_TURN";
}

void ArmMarketRearm(int direction,string reason)
{
   if(direction == 0)
      return;
   g_marketRearmDirection = direction;
   g_marketRearmAt = TimeCurrent();
   g_marketRearmReason = reason;
}

void ClearMarketRearm()
{
   g_marketRearmDirection = 0;
   g_marketRearmAt = 0;
   g_marketRearmReason = "NONE";
}

bool MarketRearmReady(int direction,double momentum)
{
   if(g_marketRearmDirection == 0 || direction != g_marketRearmDirection)
      return true;

   double reversalScore = 0.0;
   bool zoneTurn = ReversalOpportunityReady(direction,momentum,reversalScore);
   bool freshClosedBody = RecentDirectionalBodyAfter(
      direction,
      PERIOD_M1,
      g_marketRearmAt
   );
   bool liveTurn =
      LowerTimeframeSupportsDirection(direction) &&
      (
         MomentumSupportsDirection(direction,momentum,0.45) ||
         (direction > 0 && g_emaReclaimState == "RECLAIM_EMA21_UP") ||
         (direction < 0 && g_emaReclaimState == "LOSE_EMA21_DOWN")
      );

   if(freshClosedBody || liveTurn || zoneTurn)
   {
      ClearMarketRearm();
      return true;
   }
   return false;
}

bool LowerTimeframeSupportsDirection(int direction)
{
   if(direction == 0)
      return false;

   int support = 0;
   int opposition = 0;

   if(g_trendM1 == direction) support += 1;
   else if(g_trendM1 == -direction) opposition += 1;

   if(g_trendM5 == direction) support += 2;
   else if(g_trendM5 == -direction) opposition += 2;

   if(RecentDirectionalBody(direction,PERIOD_M1)) support += 1;
   if(RecentDirectionalBody(direction,PERIOD_M5)) support += 1;

   if(opposition >= 3)
      return false;
   if(support >= 2)
      return true;
   return g_trendM5 == direction && g_trendM1 == 0;
}

bool HigherTimeframeSupportsDirection(int direction)
{
   int votes = 0;
   if(g_trendM15 == direction) votes++;
   if(g_trendM30 == direction) votes++;
   if(g_trendH1 == direction) votes++;
   return votes >= 2;
}

bool MomentumSupportsDirection(int direction, double momentum, double factor)
{
   double threshold = MathMax(1.0, g_adaptiveMomentumThreshold * factor);
   return direction > 0 ? momentum >= threshold : momentum <= -threshold;
}

int RecentDirectionalRun(int direction, ENUM_TIMEFRAMES timeframe, int bars)
{
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int need = MathMax(2, bars);
   if(CopyRates(_Symbol, timeframe, 1, need, rates) < need)
      return 0;

   int run = 0;
   for(int i = 0; i < need; i++)
   {
      bool same = direction > 0
         ? rates[i].close > rates[i].open
         : rates[i].close < rates[i].open;
      if(!same)
         break;
      run++;
   }
   return run;
}

bool DirectionalExhaustion(
   int direction,
   double &scoreOut,
   double &extensionAtrOut,
   double &wickRatioOut,
   string &reasonOut
)
{
   scoreOut = 0.0;
   extensionAtrOut = 0.0;
   wickRatioOut = 0.0;
   reasonOut = "NONE";

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
      return false;

   double price = (tick.bid + tick.ask) * 0.5;
   double atrPrice = MathMax(
      _Point * 12.0,
      AverageTrueRangePoints(PERIOD_M5, g_atrPeriod) * _Point
   );

   double terminalRetracement = 2.0;
   if(g_fibM15Direction == direction)
      terminalRetracement = MathMin(terminalRetracement, g_fibM15Retracement);
   if(g_fibM5Direction == direction)
      terminalRetracement = MathMin(terminalRetracement, g_fibM5Retracement);

   double impulseRange = 0.0;
   if(g_fibDirection == direction && g_fibSwingHigh > g_fibSwingLow)
      impulseRange = g_fibSwingHigh - g_fibSwingLow;
   extensionAtrOut = impulseRange > 0.0
      ? impulseRange / atrPrice * MathMax(0.0, 1.0 - MathMin(1.0, terminalRetracement))
      : 0.0;

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, PERIOD_M5, 1, 4, rates) >= 4)
   {
      double range = MathMax(_Point, rates[0].high - rates[0].low);
      double lowerWick = MathMin(rates[0].open, rates[0].close) - rates[0].low;
      double upperWick = rates[0].high - MathMax(rates[0].open, rates[0].close);
      wickRatioOut = direction < 0 ? lowerWick / range : upperWick / range;

      if(wickRatioOut >= 0.35) scoreOut += 18.0;
      if(wickRatioOut >= 0.55) scoreOut += 12.0;
   }

   if(terminalRetracement <= 0.236)
   {
      scoreOut += 30.0;
      reasonOut = "FIB_TERMINAL_ZONE";
   }
   if(terminalRetracement <= 0.10)
      scoreOut += 15.0;

   if(extensionAtrOut >= 1.25)
   {
      scoreOut += 18.0;
      if(reasonOut == "NONE") reasonOut = "EXTENDED_IMPULSE";
   }
   if(extensionAtrOut >= 1.80)
      scoreOut += 12.0;

   int run = RecentDirectionalRun(direction, PERIOD_M5, 4);
   if(run >= 3)
      scoreOut += 12.0;

   bool nearTerminalLevel = direction < 0
      ? (g_nearestSupport > 0.0 && price - g_nearestSupport <= atrPrice * 0.25)
      : (g_nearestResistance > 0.0 && g_nearestResistance - price <= atrPrice * 0.25);
   if(nearTerminalLevel)
   {
      scoreOut += 18.0;
      if(reasonOut == "NONE") reasonOut = direction < 0 ? "NEAR_SUPPORT" : "NEAR_RESISTANCE";
   }

   if(wickRatioOut >= 0.45 && reasonOut == "NONE")
      reasonOut = "ADVERSE_WICK";

   return scoreOut >= 55.0;
}

bool PullbackRetestReady(int direction, double momentum)
{
   bool fibPullback =
      (g_fibM15Direction == direction &&
       g_fibM15Retracement >= 0.236 && g_fibM15Retracement <= 0.786) ||
      (g_fibM5Direction == direction &&
       g_fibM5Retracement >= 0.236 && g_fibM5Retracement <= 0.786);
   bool executionTurn =
      RecentDirectionalBody(direction, PERIOD_M1) ||
      RecentDirectionalBody(direction, PERIOD_M5) ||
      MomentumSupportsDirection(direction, momentum, 0.20);

   if(fibPullback && executionTurn)
      return true;

   // Fallback when an active Fib cannot be formed: demand a measurable pullback
   // from the recent M5 extreme, then a fresh directional execution candle.
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, PERIOD_M5, 1, 10, rates) < 10)
      return false;

   double atrPrice = MathMax(
      _Point * 12.0,
      AverageTrueRangePoints(PERIOD_M5, g_atrPeriod) * _Point
   );
   double extreme = direction > 0 ? rates[0].high : rates[0].low;
   for(int i = 1; i < 10; i++)
      extreme = direction > 0 ? MathMax(extreme, rates[i].high) : MathMin(extreme, rates[i].low);

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
      return false;
   double current = direction > 0 ? tick.bid : tick.ask;
   double pullback = direction > 0 ? extreme - current : current - extreme;

   return pullback >= atrPrice * 0.18 && executionTurn;
}

bool CleanBreakoutImpulse(int direction, double level, double buffer)
{
   if(level <= 0.0)
      return false;

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, PERIOD_M5, 1, 2, rates) < 2)
      return false;

   double atrPrice = MathMax(
      _Point * 12.0,
      AverageTrueRangePoints(PERIOD_M5, g_atrPeriod) * _Point
   );
   double range = MathMax(_Point, rates[0].high - rates[0].low);
   double body = MathAbs(rates[0].close - rates[0].open);
   double bodyRatio = body / range;
   double adverseWick = direction > 0
      ? rates[0].high - MathMax(rates[0].open, rates[0].close)
      : MathMin(rates[0].open, rates[0].close) - rates[0].low;
   double adverseWickRatio = adverseWick / range;
   double closeDistance = MathAbs(rates[0].close - level);

   bool directionalClose = direction > 0
      ? rates[0].close > level + buffer
      : rates[0].close < level - buffer;

   return directionalClose &&
      bodyRatio >= 0.45 &&
      adverseWickRatio <= 0.30 &&
      range <= atrPrice * 1.60 &&
      closeDistance <= atrPrice * 0.80;
}

bool BreakoutRetestConfirmed(int direction, double level, double buffer)
{
   if(level <= 0.0)
      return false;

   ENUM_TIMEFRAMES timeframes[2] = {PERIOD_M1, PERIOD_M5};
   for(int t = 0; t < 2; t++)
   {
      MqlRates rates[];
      ArraySetAsSeries(rates, true);
      if(CopyRates(_Symbol, timeframes[t], 1, 3, rates) < 3)
         continue;

      if(direction > 0)
      {
         bool broke = rates[1].close > level + buffer;
         bool retested = rates[0].low <= level + buffer * 1.5;
         bool held = rates[0].close > level && rates[0].close > rates[0].open;
         if(broke && retested && held)
            return true;
      }
      else
      {
         bool broke = rates[1].close < level - buffer;
         bool retested = rates[0].high >= level - buffer * 1.5;
         bool held = rates[0].close < level && rates[0].close < rates[0].open;
         if(broke && retested && held)
            return true;
      }
   }
   return false;
}

void RegisterAntiChase(
   int direction,
   double score,
   double extensionAtr,
   double wickRatio,
   string reason,
   double referenceLevel,
   bool breakoutRetest
)
{
   if(!g_antiChaseActive || score >= g_exhaustionScore)
   {
      g_antiChaseActive = true;
      g_antiChaseDirection = direction;
      g_exhaustionScore = score;
      g_extensionAtr = extensionAtr;
      g_adverseWickRatio = wickRatio;
      g_antiChaseReason = reason;
      g_breakoutReferenceLevel = referenceLevel;
      g_breakoutRetestRequired = breakoutRetest;
      g_priceLocationState = breakoutRetest ? "WAIT_BREAKOUT_RETEST" : "WAIT_PULLBACK";
   }
}

bool AntiChaseLocationReady(
   int direction,
   double momentum,
   bool breakoutModel,
   double breakoutLevel,
   double breakoutBuffer,
   string &triggerOverride
)
{
   triggerOverride = "NONE";

   double exhaustion = 0.0;
   double extensionAtr = 0.0;
   double adverseWick = 0.0;
   string reason = "NONE";
   bool exhausted = DirectionalExhaustion(
      direction,
      exhaustion,
      extensionAtr,
      adverseWick,
      reason
   );

   if(breakoutModel)
   {
      bool retestReady = BreakoutRetestConfirmed(
         direction,
         breakoutLevel,
         breakoutBuffer
      );
      bool cleanBreak = CleanBreakoutImpulse(
         direction,
         breakoutLevel,
         breakoutBuffer
      );

      if(retestReady)
      {
         g_breakoutRetestReady = true;
         g_breakoutRetestRequired = false;
         g_breakoutReferenceLevel = breakoutLevel;
         g_exhaustionScore = exhaustion;
         g_extensionAtr = extensionAtr;
         g_adverseWickRatio = adverseWick;
         g_priceLocationState = "BREAKOUT_RETEST_READY";
         g_antiChaseReason = "RETEST_CONFIRMED";
         triggerOverride = "BREAKOUT_RETEST";
         return true;
      }

      if(cleanBreak && !exhausted)
      {
         g_breakoutRetestReady = false;
         g_breakoutRetestRequired = false;
         g_breakoutReferenceLevel = breakoutLevel;
         return true;
      }

      RegisterAntiChase(
         direction,
         MathMax(exhaustion, 55.0),
         extensionAtr,
         adverseWick,
         exhausted ? reason : "BREAKOUT_EXTENDED_OR_WICKY",
         breakoutLevel,
         true
      );
      return false;
   }

   if(!exhausted)
      return true;

   if(PullbackRetestReady(direction, momentum))
   {
      g_exhaustionScore = exhaustion;
      g_extensionAtr = extensionAtr;
      g_adverseWickRatio = adverseWick;
      g_priceLocationState = "PULLBACK_RETEST_READY";
      g_antiChaseReason = reason;
      triggerOverride = "PULLBACK_RETEST";
      return true;
   }

   RegisterAntiChase(
      direction,
      exhaustion,
      extensionAtr,
      adverseWick,
      reason,
      0.0,
      false
   );
   return false;
}

bool ExecutionConfirmationReady(
   int direction,
   double momentum,
   bool requireHigherTimeframe
)
{
   bool higher = HigherTimeframeSupportsDirection(direction);
   bool micro = LowerTimeframeSupportsDirection(direction);
   bool emaExecution =
      g_emaTrendM5 == direction ||
      (g_emaTrendM1 == direction && g_emaTrendM15 == direction);
   bool emaMacro =
      g_emaTrendM15 == direction ||
      g_emaTrendM30 == direction ||
      g_emaTrendH1 == direction;

   double paScore = direction > 0
      ? g_priceActionBuyScore
      : g_priceActionSellScore;
   bool priceAction = paScore >= 18.0;
   bool emaReclaim =
      (direction > 0 && g_emaReclaimState == "RECLAIM_EMA21_UP") ||
      (direction < 0 && g_emaReclaimState == "LOSE_EMA21_DOWN");
   bool momentumReady = MomentumSupportsDirection(direction,momentum,0.40);

   if(requireHigherTimeframe && !higher)
      return false;

   // A fallback continuation needs an execution event, not only an old trend
   // average. Any one of Price Action / EMA reclaim / live momentum may trigger,
   // but it must sit on top of EMA + lower-timeframe directional agreement.
   return micro &&
      emaExecution &&
      (emaMacro || higher) &&
      (priceAction || emaReclaim || momentumReady);
}

bool NewsImpulseExecutionReady(int direction,double momentum)
{
   if(g_marketRegime != "HIGH_VOLATILITY")
      return false;

   double paScore = direction > 0
      ? g_priceActionBuyScore
      : g_priceActionSellScore;
   bool emaAligned =
      g_emaTrendM5 == direction &&
      (g_emaTrendM15 == direction || g_emaTrendM30 == direction);
   bool priceAction = paScore >= 18.0;
   bool trendAligned =
      g_trendM5 == direction &&
      (g_trendM15 == direction || g_trendM30 == direction);

   // News/high-volatility trading remains active without demanding every
   // indicator at once. Anti-chase still protects terminal spikes.
   int evidence = 0;
   if(trendAligned) evidence++;
   if(emaAligned) evidence++;
   if(priceAction) evidence++;
   if(LowerTimeframeSupportsDirection(direction)) evidence++;

   return MomentumSupportsDirection(direction,momentum,0.70) &&
      evidence >= 2;
}

bool DirectSetupReady(
   int direction,
   double momentum,
   string &modelOut,
   double &scoreOut
)
{
   scoreOut = EvaluateMarketLocationScore(direction);
   modelOut = g_entryModel;

   bool microSupport = LowerTimeframeSupportsDirection(direction);
   bool higherSupport = HigherTimeframeSupportsDirection(direction);
   bool lightMomentum = MomentumSupportsDirection(direction, momentum, 0.30);
   bool strongMomentum = MomentumSupportsDirection(
      direction,
      momentum,
      g_marketRegime == "HIGH_VOLATILITY" ? 0.65 : 0.80
   );
   double paScore = direction > 0
      ? g_priceActionBuyScore
      : g_priceActionSellScore;
   bool priceActionReady = paScore >= 18.0;
   bool emaExecution =
      g_emaTrendM5 == direction ||
      (g_emaTrendM1 == direction && g_emaTrendM15 == direction);
   bool emaReclaim =
      (direction > 0 && g_emaReclaimState == "RECLAIM_EMA21_UP") ||
      (direction < 0 && g_emaReclaimState == "LOSE_EMA21_DOWN");

   double atrPrice = MathMax(
      _Point * 20.0,
      AverageTrueRangePoints(PERIOD_M15, g_atrPeriod) * _Point
   );
   double breakoutBuffer = MathMax(_Point * 8.0, atrPrice * 0.18) * 0.18;
   double breakoutLevel = direction > 0 ? g_majorResistance : g_majorSupport;
   string locationTrigger = "NONE";

   // Breakout no longer means "sell/buy immediately". A clean, compact break
   // may execute directly; an extended/wicky break must retest first.
   if(modelOut == "BREAKOUT")
   {
      if(!AntiChaseLocationReady(
         direction,
         momentum,
         true,
         breakoutLevel,
         breakoutBuffer,
         locationTrigger
      ))
         return false;

      if(locationTrigger != "NONE")
         modelOut = locationTrigger;
      return true;
   }

   // All other setups pass through terminal-location awareness. This protects
   // against selling the bottom / buying the top while preserving valid
   // pullback, OB, Fib, level and continuation entries.
   if(!AntiChaseLocationReady(
      direction,
      momentum,
      false,
      0.0,
      0.0,
      locationTrigger
   ))
      return false;

   if(locationTrigger != "NONE")
      modelOut = locationTrigger;

   if(modelOut == "PULLBACK_RETEST")
      return microSupport &&
         emaExecution &&
         (priceActionReady || emaReclaim || lightMomentum);

   // Pullback/reaction models already have a real location thesis. They still
   // need a fresh execution turn so an old OB/Fib level cannot trigger by itself.
   if(g_entryModel == "OB_FIB_PULLBACK" ||
      g_entryModel == "ORDER_BLOCK_PULLBACK" ||
      g_entryModel == "FIB_PULLBACK" ||
      g_entryModel == "LEVEL_REACTION")
      return microSupport &&
         (priceActionReady || emaReclaim || lightMomentum);

   if(g_entryModel == "CONTINUATION")
      return ExecutionConfirmationReady(direction,momentum,true);

   if(g_marketRegime == "HIGH_VOLATILITY" &&
      NewsImpulseExecutionReady(direction,momentum))
      return true;

   if(g_entryModel == "CAUTION_ZONE")
      return strongMomentum &&
         microSupport &&
         higherSupport &&
         emaExecution &&
         priceActionReady;

   // No bare trend/momentum fallback here. If there is no identifiable setup
   // and no confirmed execution event, the engine waits for the next event.
   return false;
}

int SetupFirstDirection(double momentum)
{
   g_entryTrigger = "NONE";
   g_antiChaseActive = false;
   g_antiChaseDirection = 0;
   g_exhaustionScore = 0.0;
   g_extensionAtr = 0.0;
   g_adverseWickRatio = 0.0;
   g_priceLocationState = "NORMAL";
   g_antiChaseReason = "NONE";
   g_breakoutRetestRequired = false;
   g_breakoutRetestReady = false;
   g_breakoutReferenceLevel = 0.0;

   if(g_entryMode == ENTRY_BUY_ONLY || g_entryMode == ENTRY_SELL_ONLY)
   {
      int fixedDirection = g_entryMode == ENTRY_BUY_ONLY ? 1 : -1;
      string fixedModel = "NONE";
      double fixedScore = 0.0;
      if(DirectSetupReady(fixedDirection, momentum, fixedModel, fixedScore))
      {
         EvaluateMarketLocationScore(fixedDirection);
         g_entryTrigger = fixedModel != "NONE" ? fixedModel : g_entryModel;
         return fixedDirection;
      }

      if(ExecutionConfirmationReady(fixedDirection,momentum,true))
      {
         string locationTrigger = "NONE";
         if(AntiChaseLocationReady(
            fixedDirection,
            momentum,
            false,
            0.0,
            0.0,
            locationTrigger
         ))
         {
            EvaluateMarketLocationScore(fixedDirection);
            g_entryTrigger = locationTrigger != "NONE"
               ? locationTrigger
               : "STRUCTURE_EXECUTION";
            return fixedDirection;
         }
      }
      return 0;
   }

   string buyModel = "NONE";
   string sellModel = "NONE";
   double buyScore = 0.0;
   double sellScore = 0.0;
   bool buyReady = DirectSetupReady(1, momentum, buyModel, buyScore);
   bool sellReady = DirectSetupReady(-1, momentum, sellModel, sellScore);

   int chosen = 0;
   string chosenModel = "NONE";
   if(buyReady && !sellReady)
   {
      chosen = 1;
      chosenModel = buyModel;
   }
   else if(sellReady && !buyReady)
   {
      chosen = -1;
      chosenModel = sellModel;
   }
   else if(buyReady && sellReady)
   {
      // Score selects between two already-valid setups. It is not an entry gate.
      if(MathAbs(buyScore - sellScore) >= 4.0)
         chosen = buyScore > sellScore ? 1 : -1;
      else if(momentum > 0.0)
         chosen = 1;
      else if(momentum < 0.0)
         chosen = -1;
      else if(g_macroTrendDirection != 0)
         chosen = g_macroTrendDirection;
      else
         chosen = buyScore >= sellScore ? 1 : -1;
      chosenModel = chosen > 0 ? buyModel : sellModel;
   }

   // Demand/Supply reversal can override a late macro continuation, but only
   // after an actual M1/M5/EMA/PA execution turn confirms it.
   if(g_macroTrendDirection != 0)
   {
      int reversalDirection = -g_macroTrendDirection;
      double reversalScore = 0.0;
      if(ReversalOpportunityReady(reversalDirection,momentum,reversalScore) &&
         (chosen == 0 || chosen == g_macroTrendDirection))
      {
         chosen = reversalDirection;
         chosenModel = "REVERSAL_ZONE";
         g_reversalOpportunityDirection = reversalDirection;
         g_reversalOpportunityScore = reversalScore;
      }
   }

   if(chosen == 0 && g_macroTrendDirection != 0 &&
      ExecutionConfirmationReady(g_macroTrendDirection,momentum,true))
   {
      string locationTrigger = "NONE";
      if(AntiChaseLocationReady(
         g_macroTrendDirection,
         momentum,
         false,
         0.0,
         0.0,
         locationTrigger
      ))
      {
         chosen = g_macroTrendDirection;
         chosenModel = locationTrigger != "NONE"
            ? locationTrigger
            : "STRUCTURE_EXECUTION";
      }
   }

   if(chosen == 0 && g_marketRegime == "HIGH_VOLATILITY")
   {
      int momentumDirection = momentum > 0.0 ? 1 : momentum < 0.0 ? -1 : 0;
      if(momentumDirection != 0 &&
         NewsImpulseExecutionReady(momentumDirection,momentum))
      {
         string locationTrigger = "NONE";
         if(AntiChaseLocationReady(
            momentumDirection,
            momentum,
            false,
            0.0,
            0.0,
            locationTrigger
         ))
         {
            chosen = momentumDirection;
            chosenModel = locationTrigger != "NONE"
               ? locationTrigger
               : "NEWS_EXECUTION";
         }
      }
   }

   if(chosen != 0)
   {
      // If the opposite direction was exhausted but this direction has a valid
      // setup, do not let the opposite anti-chase state pollute the UI.
      if(g_antiChaseActive && g_antiChaseDirection != chosen)
      {
         g_antiChaseActive = false;
         g_antiChaseDirection = 0;
         g_exhaustionScore = 0.0;
         g_extensionAtr = 0.0;
         g_adverseWickRatio = 0.0;
         g_antiChaseReason = "NONE";
         g_breakoutRetestRequired = false;
         g_breakoutRetestReady = false;
         g_breakoutReferenceLevel = 0.0;
         g_priceLocationState =
            (chosenModel == "PULLBACK_RETEST" || chosenModel == "BREAKOUT_RETEST")
            ? "RETEST_READY"
            : "NORMAL";
      }

      if(!g_antiChaseActive)
      {
         if(chosenModel == "BREAKOUT_RETEST")
            g_priceLocationState = "BREAKOUT_RETEST_READY";
         else if(chosenModel == "PULLBACK_RETEST")
            g_priceLocationState = "PULLBACK_RETEST_READY";
         else
         {
            g_priceLocationState = "NORMAL";
            g_exhaustionScore = 0.0;
            g_extensionAtr = 0.0;
            g_adverseWickRatio = 0.0;
            g_antiChaseReason = "NONE";
            g_breakoutRetestRequired = false;
            g_breakoutRetestReady = false;
            g_breakoutReferenceLevel = 0.0;
         }
      }

      EvaluateMarketLocationScore(chosen);
      g_entryTrigger = chosenModel != "NONE" ? chosenModel : g_entryModel;
      g_marketCycleState = MarketCycleStateForDirection(chosen,momentum);
   }
   else
      g_marketCycleState = g_macroTrendDirection == 0
         ? "TRANSITION"
         : MarketCycleStateForDirection(g_macroTrendDirection,momentum);

   return chosen;
}


double EvaluateMarketLocationScore(int direction)
{
   RefreshMarketContext(false);
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
      return 0.0;
   double price = (tick.bid + tick.ask) * 0.5;
   double atrPrice = MathMax(_Point * 20.0, AverageTrueRangePoints(PERIOD_M15, g_atrPeriod) * _Point);
   double nearBuffer = MathMax(_Point * 8.0, atrPrice * 0.18);

   g_structureScore = 18.0;
   if(g_trendM1 == direction) g_structureScore += 5.0;
   else if(g_trendM1 == -direction) g_structureScore -= 2.25;
   if(g_trendM5 == direction) g_structureScore += 8.0;
   else if(g_trendM5 == -direction) g_structureScore -= 3.60;
   if(g_trendM15 == direction) g_structureScore += 12.0;
   else if(g_trendM15 == -direction) g_structureScore -= 5.40;
   if(g_trendM30 == direction) g_structureScore += 12.0;
   else if(g_trendM30 == -direction) g_structureScore -= 5.40;
   if(g_trendH1 == direction) g_structureScore += 15.0;
   else if(g_trendH1 == -direction) g_structureScore -= 6.75;
   g_structureScore = MathMax(0.0, MathMin(52.0, g_structureScore));

   g_locationScore = 8.0;
   bool nearSupport = direction > 0 && g_nearestSupport > 0.0 &&
                       price - g_nearestSupport <= nearBuffer;
   bool nearResistance = direction < 0 && g_nearestResistance > 0.0 &&
                         g_nearestResistance - price <= nearBuffer;
   bool inOrderBlock = direction > 0
      ? PriceInsideOrNearZone(price, g_bullishOrderBlockLow, g_bullishOrderBlockHigh, nearBuffer * 0.35)
      : PriceInsideOrNearZone(price, g_bearishOrderBlockLow, g_bearishOrderBlockHigh, nearBuffer * 0.35);
   double desiredLevelStrength = direction > 0 ? g_supportStrength : g_resistanceStrength;
   double desiredObStrength = direction > 0 ? g_bullishOrderBlockStrength : g_bearishOrderBlockStrength;
   double desiredObQuality = direction > 0 ? g_bullishOrderBlockQuality : g_bearishOrderBlockQuality;
   double desiredObLow = direction > 0 ? g_bullishOrderBlockLow : g_bearishOrderBlockLow;
   double desiredObHigh = direction > 0 ? g_bullishOrderBlockHigh : g_bearishOrderBlockHigh;

   double fibM5Score = FibonacciSetupScore(
      direction, g_fibM5Direction, g_fibM5Retracement, g_fibM5Strength);
   double fibM15Score = FibonacciSetupScore(
      direction, g_fibM15Direction, g_fibM15Retracement, g_fibM15Strength);
   g_fibConfluenceScore = MathMax(fibM5Score, fibM15Score);
   if(fibM5Score > 0.0 && fibM15Score > 0.0 &&
      g_fibM5Direction == g_fibM15Direction)
      g_fibConfluenceScore = MathMin(22.0,
         g_fibConfluenceScore + MathMin(fibM5Score, fibM15Score) * 0.45 + 3.0);
   bool fibConfluence = g_fibConfluenceScore > 0.0;

   // Fibonacci Setup Scoring v2: normalized 0-100 quality. This score is
   // advisory and never becomes a standalone entry permission.
   double primaryRetracement = direction == g_fibM15Direction
      ? g_fibM15Retracement
      : direction == g_fibM5Direction ? g_fibM5Retracement : 0.0;
   double primaryFibStrength = direction == g_fibM15Direction
      ? g_fibM15Strength
      : direction == g_fibM5Direction ? g_fibM5Strength : 0.0;
   g_fibSetupScore = 0.0;
   if(primaryRetracement >= 0.382 && primaryRetracement <= 0.786)
   {
      g_fibSetupScore = 22.0 + MathMin(20.0, primaryFibStrength * 0.20);
      if(primaryRetracement >= 0.500 && primaryRetracement <= 0.705)
         g_fibSetupScore += 18.0;
      if(MathAbs(primaryRetracement - 0.618) <= 0.050)
         g_fibSetupScore += 12.0;
      else if(MathAbs(primaryRetracement - 0.705) <= 0.045)
         g_fibSetupScore += 8.0;
   }
   if(fibM5Score > 0.0 && fibM15Score > 0.0 &&
      g_fibM5Direction == direction && g_fibM15Direction == direction)
      g_fibSetupScore += 15.0;
   if(inOrderBlock) g_fibSetupScore += MathMin(8.0, desiredObQuality * 0.08);
   if(nearSupport || nearResistance) g_fibSetupScore += MathMin(7.0, desiredLevelStrength * 0.07);
   g_fibSetupScore = MathMax(0.0, MathMin(100.0, g_fibSetupScore));
   g_fibSetupGrade = g_fibSetupScore >= 80.0 ? "A" :
                     g_fibSetupScore >= 60.0 ? "B" :
                     g_fibSetupScore > 0.0 ? "C" : "NONE";

   int confluenceCount = 0;
   if(nearSupport || nearResistance)
   {
      g_locationScore += 4.0 + desiredLevelStrength * 0.10;
      confluenceCount++;
   }
   if(inOrderBlock)
   {
      g_locationScore += 4.0 + desiredObStrength * 0.10;
      confluenceCount++;
   }
   if(fibConfluence)
   {
      g_locationScore += g_fibConfluenceScore;
      confluenceCount++;
   }
   if(RecentDirectionalRejection(direction, desiredObLow, desiredObHigh, nearBuffer * 0.25))
      g_locationScore += 7.0;
   if(confluenceCount >= 2)
      g_locationScore += 6.0;

   double breakoutLevel = direction > 0 ? g_majorResistance : g_majorSupport;
   bool breakout = ConfirmedLevelBreak(direction, breakoutLevel, nearBuffer * 0.18);
   if(breakout)
      g_locationScore += 12.0;

   // Opposing areas reduce confidence but never become a hidden hard block.
   bool nearOpposingLevel = direction > 0
      ? (g_majorResistance > price && g_majorResistance - price <= nearBuffer)
      : (g_majorSupport > 0.0 && price > g_majorSupport && price - g_majorSupport <= nearBuffer);
   bool inOpposingOrderBlock = direction > 0
      ? PriceInsideOrNearZone(price, g_bearishOrderBlockLow, g_bearishOrderBlockHigh, nearBuffer * 0.25)
      : PriceInsideOrNearZone(price, g_bullishOrderBlockLow, g_bullishOrderBlockHigh, nearBuffer * 0.25);
   double opposingObStrength = direction > 0 ? g_bearishOrderBlockStrength : g_bullishOrderBlockStrength;
   if(nearOpposingLevel && !breakout)
      g_locationScore -= 12.0;
   if(inOpposingOrderBlock)
      g_locationScore -= 6.0 + opposingObStrength * 0.06;

   if(inOrderBlock && fibConfluence)
      g_entryModel = "OB_FIB_PULLBACK";
   else if(inOrderBlock)
      g_entryModel = "ORDER_BLOCK_PULLBACK";
   else if(fibConfluence)
      g_entryModel = "FIB_PULLBACK";
   else if(nearSupport || nearResistance)
      g_entryModel = "LEVEL_REACTION";
   else if(breakout)
      g_entryModel = "BREAKOUT";
   else if(nearOpposingLevel || inOpposingOrderBlock)
      g_entryModel = "CAUTION_ZONE";
   else
      g_entryModel = "CONTINUATION";

   g_locationScore = MathMax(0.0, MathMin(48.0, g_locationScore));
   g_entryScore = MathMax(0.0, MathMin(100.0, g_structureScore + g_locationScore));

   // Entry Quality A/B/C is a readable quality label, not a gate.
   double setupBonus =
      g_entryModel == "OB_FIB_PULLBACK" ? 10.0 :
      g_entryModel == "BREAKOUT" ? 8.0 :
      g_entryModel == "ORDER_BLOCK_PULLBACK" ? 7.0 :
      g_entryModel == "FIB_PULLBACK" ? 6.0 :
      g_entryModel == "LEVEL_REACTION" ? 5.0 : 2.0;
   double emaQuality = direction > 0
      ? g_emaConfluenceScoreBuy
      : g_emaConfluenceScoreSell;
   double priceActionQuality = direction > 0
      ? g_priceActionBuyScore
      : g_priceActionSellScore;

   g_entryQualityScore =
      g_entryScore * 0.45 +
      g_fibSetupScore * 0.18 +
      desiredObQuality * 0.12 +
      emaQuality * 0.12 +
      MathMin(100.0,priceActionQuality*2.0) * 0.08 +
      setupBonus;
   if(HigherTimeframeSupportsDirection(direction))
      g_entryQualityScore += 5.0;
   g_entryQualityScore = MathMax(0.0, MathMin(100.0, g_entryQualityScore));
   g_entryQuality = g_entryQualityScore >= 75.0 ? "A" :
                    g_entryQualityScore >= 55.0 ? "B" : "C";
   return g_entryScore;
}

bool MarketLocationEntryAllowed(int direction, bool fastRevalidation)
{
   RefreshMarketContext(false);
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
   {
      g_adaptiveBlockReason = "NO_TICK";
      return false;
   }

   EvaluateMarketLocationScore(direction);

   double exhaustion = 0.0;
   double extensionAtr = 0.0;
   double adverseWick = 0.0;
   string exhaustionReason = "NONE";
   bool exhausted = DirectionalExhaustion(
      direction,
      exhaustion,
      extensionAtr,
      adverseWick,
      exhaustionReason
   );

   double adverseZone = direction > 0
      ? g_supplyZoneScore
      : g_demandZoneScore;
   double terminalThreshold = fastRevalidation ? 82.0 : 74.0;

   // Only a strong terminal-zone + exhaustion combination vetoes execution.
   // Normal S/R/Fib/OB/RSI/ADX/VWAP remain advisory so the EA keeps trading.
   if(exhausted && adverseZone >= terminalThreshold)
   {
      g_adaptiveBlockReason = direction > 0
         ? "WAIT_TERMINAL_SUPPLY"
         : "WAIT_TERMINAL_DEMAND";
      g_priceLocationState = direction > 0
         ? "SUPPLY_TERMINAL"
         : "DEMAND_TERMINAL";
      return false;
   }

   return true;
}

double DynamicConfidenceThreshold(int direction)
{
   double threshold = MathMax(48.0, MathMin(60.0, (double)g_confidenceThreshold));

   if(g_entryModel == "OB_FIB_PULLBACK")
      threshold = MathMin(threshold, 48.0);
   else if(g_entryModel == "ORDER_BLOCK_PULLBACK")
      threshold = MathMin(threshold, 50.0);
   else if(g_entryModel == "FIB_PULLBACK")
      threshold = MathMin(threshold, 50.0);
   else if(g_entryModel == "LEVEL_REACTION")
      threshold = MathMin(threshold, 52.0);
   else if(g_entryModel == "BREAKOUT")
      threshold = MathMin(threshold, 52.0);

   if(g_locationScore >= 40.0)
      threshold = MathMin(threshold, 49.0);
   else if(g_locationScore >= 32.0)
      threshold = MathMin(threshold, 52.0);

   if(g_fibConfluenceScore >= 14.0)
      threshold = MathMin(threshold, 50.0);

   if(g_entryModel == "CAUTION_ZONE")
      threshold = MathMax(threshold, 60.0);

   if(g_macroTrendDirection != 0 && direction != g_macroTrendDirection)
      threshold = MathMax(threshold, 60.0);

   if(g_trendM30 == -direction && g_trendH1 == -direction)
      threshold = MathMax(threshold, 64.0);

   // High volatility/news does not raise the threshold.
   g_effectiveConfidenceThreshold = MathMax(48.0, MathMin(64.0, threshold));
   return g_effectiveConfidenceThreshold;
}



double EffectiveHardStopMultiplier()
{
   double multiplier = g_hardStopAtrMultiplier;
   if(g_marketRegime == "HIGH_VOLATILITY") multiplier *= 1.25;
   else if(g_marketRegime == "QUIET") multiplier *= 0.85;
   return MathMax(0.5, MathMin(10.0, multiplier));
}

double EffectiveHardStopDistancePoints()
{
   if(!g_adaptiveEngine || g_atrPoints <= 0.0 || g_hardStopAtrMultiplier <= 0.0)
      return 0.0;

   double brokerMinimumPoints =
      (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   return MathMax(
      g_atrPoints * EffectiveHardStopMultiplier(),
      brokerMinimumPoints + 1.0
   );
}

double EffectiveStopLossDistancePoints()
{
   double brokerMinimumPoints =
      (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);

   if(g_manualStopLossPoints > 0.0)
      return MathMax(g_manualStopLossPoints, brokerMinimumPoints + 1.0);

   return EffectiveHardStopDistancePoints();
}

string StopLossModeName()
{
   return g_manualStopLossPoints > 0.0 ? "MANUAL_POINTS" : "SYSTEM_ATR";
}

double AdaptiveTradeVolume()
{
   // Lot is customer-controlled. Adaptive intelligence may decide WHEN to
   // trade, spacing, direction, confidence and protection, but it must never
   // silently reduce the customer's configured order volume.
   g_minimumLotOverrideActive = false;
   return NormalizeTradeVolume(g_lot);
}

string DetailedMarketRegime(double momentum, int direction)
{
   double absMomentum = MathAbs(momentum);
   double threshold = MathMax(1.0, g_adaptiveMomentumThreshold);

   if(g_marketRegime == "HIGH_VOLATILITY")
   {
      if(absMomentum >= threshold * 0.55)
         return "NEWS_IMPULSE";
      return "VOLATILITY_EXPANSION";
   }

   if(g_entryModel == "BREAKOUT")
      return "BREAKOUT_EXPANSION";

   if(direction != 0)
   {
      bool microAgainst = g_trendM1 == -direction || g_trendM5 == -direction;
      if(microAgainst)
         return "TREND_PULLBACK";
      if(absMomentum >= threshold * 0.85)
         return "TREND_ACCELERATION";
      return "TREND_CONTINUATION";
   }

   if(g_marketRegime == "QUIET")
      return "LOW_VOLATILITY";

   if(g_trendM5 != 0 && (g_trendM5 == g_trendM15 || g_trendM5 == g_trendM30))
      return "RANGE_BREAK_ATTEMPT";

   if(g_marketRegime == "RANGE")
      return "RANGE_ROTATION";

   return "TRANSITION";
}

int AdaptiveEntryDirection(double momentum)
{
   g_minimumLotOverrideActive = false;
   if(!g_adaptiveEngine)
   {
      int rawDirection = EntryDirection(momentum);
      g_adaptiveBlockReason = "";
      g_marketRegime = "DISABLED";
      g_signalConfidence = rawDirection == 0 ? 0.0 : 100.0;
      g_modelConfidence = g_signalConfidence;
      g_historicalWinProbability = 0.0;
      g_historicalWinSamples = 0;
      g_confidenceSource = "MODEL";
      g_adaptiveLot = NormalizeTradeVolume(g_lot);
      return rawDirection;
   }

   datetime now = TimeCurrent();
   if(!AdaptiveSessionAllowed())
   {
      g_adaptiveBlockReason = "SESSION_BLOCKED";
      return 0;
   }

   // Cache expensive multi-timeframe history reads for one second.
   if(g_lastAdaptiveEvaluation == now)
   {
      g_adaptiveBlockReason = g_cachedAdaptiveBlockReason;
      return g_cachedAdaptiveDirection;
   }
   g_lastAdaptiveEvaluation = now;
   g_cachedAdaptiveDirection = 0;
   g_adaptiveBlockReason = "";

   g_atrPoints = AverageTrueRangePoints(PERIOD_M15, g_atrPeriod);
   g_atrBaselinePoints = AverageTrueRangePoints(PERIOD_M15, MathMax(30, g_atrPeriod * 3));
   if(g_atrPoints <= 0.0)
   {
      g_marketRegime = "DATA_NOT_READY";
      g_signalConfidence = 0.0;
      g_modelConfidence = 0.0;
      g_adaptiveBlockReason = "ADAPTIVE_DATA_NOT_READY";
      g_cachedAdaptiveBlockReason = g_adaptiveBlockReason;
      return 0;
   }

   RefreshMarketContext(false);
   int trendM1 = g_trendM1;
   int trendM5 = g_trendM5;
   int trendM15 = g_trendM15;
   int trendM30 = g_trendM30;
   int trendH1 = g_trendH1;

   // Treat M30/H1 as the higher-timeframe macro consensus, with M15 used as
   // the bridge between structure and execution.
   // Opposite higher-timeframe trends are
   // mixed/range, not TREND_UP/TREND_DOWN based on one timeframe alone.
   int regimeDirection = 0;
   if(trendM30 == trendH1)
      regimeDirection = trendM30;
   else if(trendM30 == 0)
      regimeDirection = trendH1;
   else if(trendH1 == 0)
      regimeDirection = trendM30;
   else if(trendM15 == trendH1)
      regimeDirection = trendH1;
   g_macroTrendDirection = regimeDirection;
   g_entryBias = regimeDirection > 0 ? "BUY" : regimeDirection < 0 ? "SELL" : "BOTH";
   g_atrRatio = g_atrBaselinePoints > 0.0 ? g_atrPoints / g_atrBaselinePoints : 1.0;

   // ATR is a volatility input, not an on/off switch. A high reading moves the
   // engine into a defensive profile: smaller lot, fewer positions, wider
   // spacing and stronger confirmation. This keeps market-open trading usable.
   bool atrSoftLimitExceeded = g_maxAtrPoints > 0.0 && g_atrPoints > g_maxAtrPoints;
   if(atrSoftLimitExceeded || g_atrRatio >= 1.60)
      g_marketRegime = "HIGH_VOLATILITY";
   else if(g_atrRatio <= 0.55)
      g_marketRegime = "QUIET";
   else if(regimeDirection > 0)
      g_marketRegime = "TREND_UP";
   else if(regimeDirection < 0)
      g_marketRegime = "TREND_DOWN";
   else
      g_marketRegime = "RANGE";

   g_sessionProfile = CurrentSessionProfile();
   double momentumFactor = 1.0;
   // News/high-volatility trading remains enabled; ATR expansion must not make
   // the entry trigger harder simply because a news impulse is in progress.
   if(g_marketRegime == "HIGH_VOLATILITY") momentumFactor = 0.95;
   else if(g_marketRegime == "QUIET") momentumFactor = 0.70;
   else if(g_marketRegime == "RANGE") momentumFactor = 1.10;
   g_adaptiveMomentumThreshold = MathMax(2.0, InpMomentumEntryPoints * momentumFactor);

   // Setup-first: S/R, Order Block, Fibonacci, Breakout and Structure can all
   // trigger an entry directly. Momentum accelerates timing but is not the only
   // path into the market.
   int rawDirection = SetupFirstDirection(momentum);
   g_marketRegimeDetail = DetailedMarketRegime(momentum, rawDirection);

   if(rawDirection == 0)
   {
      g_signalConfidence = 0.0;
      g_modelConfidence = 0.0;
      g_historicalWinProbability = 0.0;
      g_historicalWinSamples = 0;
      g_confidenceSource = "MODEL";
      g_effectiveConfidenceThreshold = 0.0;
      g_adaptiveBlockReason = g_antiChaseActive
         ? (g_breakoutRetestRequired ? "WAITING_BREAKOUT_RETEST" : "WAITING_PULLBACK_RETEST")
         : "WAITING_SETUP";
      g_cachedAdaptiveBlockReason = g_adaptiveBlockReason;
      return 0;
   }

   double momentumStrength = MathMin(2.0, MathAbs(momentum) / MathMax(1.0, g_adaptiveMomentumThreshold));
   double score = 12.0 + momentumStrength * 10.0;
   bool directionalRegime = g_marketRegime == "TREND_UP" || g_marketRegime == "TREND_DOWN";
   double weightM1 = directionalRegime ? 8.0 : 8.0;
   double weightM5 = directionalRegime ? 12.0 : 11.0;
   double weightM15 = directionalRegime ? 14.0 : 11.0;
   double weightM30 = directionalRegime ? 14.0 : 10.0;
   double weightH1 = directionalRegime ? 15.0 : 10.0;
   if(trendM1 == rawDirection) score += weightM1;
   else if(trendM1 == -rawDirection) score -= weightM1 * 0.70;
   if(trendM5 == rawDirection) score += weightM5;
   else if(trendM5 == -rawDirection) score -= weightM5 * 0.60;
   if(trendM15 == rawDirection) score += weightM15;
   else if(trendM15 == -rawDirection) score -= weightM15 * 0.45;
   if(trendM30 == rawDirection) score += weightM30;
   else if(trendM30 == -rawDirection) score -= weightM30 * 0.45;
   if(trendH1 == rawDirection) score += weightH1;
   else if(trendH1 == -rawDirection) score -= weightH1 * 0.45;
   score += MathMax(0.0, 12.0 - g_spreadConfidencePenalty * 0.60);
   score += g_marketRegime == "HIGH_VOLATILITY" ? 5.0 : g_marketRegime == "QUIET" ? 5.0 : 8.0;
   score += MathMax(0.0, MathMin(8.0, g_executionQuality * 0.08));

   // Price location is confluence, not a wall of mandatory filters.
   double marketEntryScore = EvaluateMarketLocationScore(rawDirection);
   score = score * 0.64 + marketEntryScore * 0.36;

   // Higher-timeframe disagreement is a confidence penalty, not a veto. A
   // strong OB/Fib/level reaction can still trade, while weak counter-trend
   // setups naturally fall below the selected profile's confidence threshold.
   if(g_entryMode == ENTRY_AUTO_MOMENTUM &&
      g_macroTrendDirection != 0 && rawDirection != g_macroTrendDirection)
      score -= 10.0;
   if(trendM30 == -rawDirection && trendH1 == -rawDirection)
      score -= 12.0;

   score -= MathMin(15.0, g_consecutiveLosses * 4.0);
   g_modelConfidence = MathMax(0.0, MathMin(100.0, score));
   g_historicalWinProbability = rawDirection > 0
      ? g_buyWinProbability
      : g_sellWinProbability;
   g_historicalWinSamples = rawDirection > 0
      ? g_buyWinSamples
      : g_sellWinSamples;

   // Convert the old formula score into a probability estimate backed by real
   // completed Baskets. Twelve samples are required before history can affect
   // execution; a 24-sample prior prevents a short lucky/unlucky run from
   // taking control. As history grows, the real win rate becomes dominant.
   if(g_historicalWinSamples >= 12)
   {
      const double priorSamples = 24.0;
      g_signalConfidence =
         (g_modelConfidence * priorSamples +
          g_historicalWinProbability * g_historicalWinSamples) /
         (priorSamples + g_historicalWinSamples);
      g_confidenceSource = g_historicalWinSamples >= 30
         ? "BASKET_HISTORY"
         : "BLENDED";
   }
   else
   {
      g_signalConfidence = g_modelConfidence;
      g_confidenceSource = "MODEL";
   }
   g_signalConfidence = MathMax(0.0, MathMin(100.0, g_signalConfidence));

   // Position count is controlled only by the user's Max Positions setting.
   // Adaptive Intelligence may decide when to enter, but never lowers this cap.
   g_adaptiveMaxPositions = g_maxPositions;

   // No hidden adaptive waiting. Once a real setup is ready, only the normal
   // order-rate protection applies.
   g_adaptiveEntrySpacingMs = g_minOrderIntervalMs;
   g_effectiveConfidenceThreshold = 0.0;

   if(!MarketLocationEntryAllowed(rawDirection, false))
   {
      g_cachedAdaptiveBlockReason = g_adaptiveBlockReason;
      return 0;
   }

   // Confidence is optional. Default OFF means the score is telemetry only and
   // can never prevent a valid setup-first entry. Users who explicitly enable
   // the filter get the Dynamic Confidence gate back.
   if(g_confidenceGateEnabled)
   {
      double liveConfidenceThreshold = DynamicConfidenceThreshold(rawDirection);
      if(g_signalConfidence < liveConfidenceThreshold)
      {
         g_adaptiveBlockReason = "WAITING_CONFIDENCE";
         g_cachedAdaptiveBlockReason = g_adaptiveBlockReason;
         return 0;
      }
   }
   else
      g_effectiveConfidenceThreshold = 0.0;

   g_adaptiveLot = AdaptiveTradeVolume();
   if(g_adaptiveLot <= 0.0)
   {
      g_adaptiveBlockReason = "RISK_LIMIT_TOO_SMALL";
      g_cachedAdaptiveBlockReason = g_adaptiveBlockReason;
      return 0;
   }
   g_cachedAdaptiveBlockReason = "";
   g_cachedAdaptiveDirection = rawDirection;
   return rawDirection;
}

string CurrentSessionProfile()
{
   MqlDateTime parts;
   datetime now = TimeTradeServer();
   if(now <= 0) now = TimeCurrent();
   TimeToStruct(now, parts);
   if(parts.hour < 7) return "ASIAN";
   if(parts.hour < 13) return "LONDON";
   if(parts.hour < 22) return "NEW_YORK";
   return "ROLLOVER";
}

double LastBasketEntryPrice(int direction)
{
   long newestTime = -1;
   ulong newestTicket = 0;
   double newestPrice = 0.0;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol ||
         PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;

      long type = PositionGetInteger(POSITION_TYPE);
      if((direction > 0 && type != POSITION_TYPE_BUY) ||
         (direction < 0 && type != POSITION_TYPE_SELL))
         continue;

      long openedAt = (long)PositionGetInteger(POSITION_TIME_MSC);
      if(openedAt > newestTime || (openedAt == newestTime && ticket > newestTicket))
      {
         newestTime = openedAt;
         newestTicket = ticket;
         newestPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      }
   }
   return newestPrice;
}

double BasketFavorableProgressPoints(int direction)
{
   MqlTick tick;
   double lastPrice = LastBasketEntryPrice(direction);
   if(lastPrice <= 0.0 || !SymbolInfoTick(_Symbol, tick))
      return 0.0;

   if(direction > 0)
      return (tick.bid - lastPrice) / _Point;
   return (lastPrice - tick.ask) / _Point;
}

bool DirectionalMomentumStillValid(int direction, double thresholdMultiplier)
{
   double momentum = MomentumPoints();
   double threshold = g_adaptiveMomentumThreshold * thresholdMultiplier;
   return direction > 0 ? momentum >= threshold : momentum <= -threshold;
}

bool AdaptiveBasketAddAllowed(int direction)
{
   int count = BasketPositionCount();
   g_pyramidProgressPoints = 0.0;
   g_pyramidRequiredPoints = 0.0;

   if(!g_adaptiveEngine || count <= 0)
      return true;
   if(direction != BasketDirection())
      return false;

   if(count >= g_adaptiveMaxPositions)
      return false;

   // MaxPositions is a ceiling, not "fire all positions now".
   // Every add must happen on the profitable side of the latest entry.
   g_pyramidProgressPoints = BasketFavorableProgressPoints(direction);

   bool directionalTrend =
      (g_macroTrendDirection > 0 && direction > 0) ||
      (g_macroTrendDirection < 0 && direction < 0);

   // Adds use favorable price progress + live setup/structure. Confidence is
   // not a gate here either.
   g_pyramidRequiredPoints = MathMax(3.0, g_atrPoints * (directionalTrend ? 0.05 : 0.04));
   if(g_pyramidProgressPoints < g_pyramidRequiredPoints)
      return false;

   EvaluateMarketLocationScore(direction);
   if(g_entryModel == "CAUTION_ZONE")
      return DirectionalMomentumStillValid(direction, 0.55) &&
         LowerTimeframeSupportsDirection(direction);

   if(LowerTimeframeSupportsDirection(direction) ||
      HigherTimeframeSupportsDirection(direction) ||
      DirectionalMomentumStillValid(direction, 0.35))
      return true;

   return false;
}

void PersistAdaptiveRiskState()
{
   GlobalVariableSet(DailyRiskStateKey("ALOSS2"), (double)g_consecutiveLosses);
}

void RestoreAdaptiveRiskState()
{
   // ALOSS in older builds counted every losing position. v1.027 counts one
   // completed Basket/Rescue Cycle as one decision, so migrate to a clean key.
   string lossKey = DailyRiskStateKey("ALOSS2");
   g_consecutiveLosses = GlobalVariableCheck(lossKey)
      ? (int)GlobalVariableGet(lossKey)
      : 0;

   string legacyLossKey = DailyRiskStateKey("ALOSS");
   if(GlobalVariableCheck(legacyLossKey)) GlobalVariableDel(legacyLossKey);

   string cooldownKey = DailyRiskStateKey("ACOOL");
   if(GlobalVariableCheck(cooldownKey)) GlobalVariableDel(cooldownKey);
}

void UpdateAdaptiveLossStateFromBasket(double net)
{
   // One losing 10-position Basket is one losing decision, not ten losses.
   // Track streak at completed Cycle level so risk scaling is statistically sane.
   if(net < -0.01)
      g_consecutiveLosses++;
   else if(net > 0.01)
      g_consecutiveLosses = 0;
   PersistAdaptiveRiskState();
}

string SpreadProfileKey(string suffix)
{
   string brokerServer = AccountInfoString(ACCOUNT_SERVER);
   long serverHash = 0;
   for(int i = 0; i < StringLen(brokerServer); i++)
      serverHash = (serverHash * 31 + StringGetCharacter(brokerServer, i)) % 1000000007;
   return StringFormat(
      "SCN_SPR_%I64d_%I64d_%I64d_%s_%s",
      (long)AccountInfoInteger(ACCOUNT_LOGIN),
      InpMagic,
      serverHash,
      _Symbol,
      suffix
   );
}

void PersistSpreadProfile()
{
   if(g_spreadMedian <= 0.0 || g_spreadP95 <= 0.0)
      return;
   GlobalVariableSet(SpreadProfileKey("MED"), g_spreadMedian);
   GlobalVariableSet(SpreadProfileKey("P90"), g_spreadP90);
   GlobalVariableSet(SpreadProfileKey("P95"), g_spreadP95);
   GlobalVariableSet(SpreadProfileKey("P99"), g_spreadP99);
}

void RestoreSpreadProfile()
{
   string medianKey = SpreadProfileKey("MED");
   string p95Key = SpreadProfileKey("P95");
   if(!GlobalVariableCheck(medianKey) || !GlobalVariableCheck(p95Key))
      return;

   g_spreadMedian = GlobalVariableGet(medianKey);
   g_spreadP95 = GlobalVariableGet(p95Key);
   string p90Key = SpreadProfileKey("P90");
   string p99Key = SpreadProfileKey("P99");
   g_spreadP90 = GlobalVariableCheck(p90Key) ? GlobalVariableGet(p90Key) : g_spreadMedian;
   g_spreadP99 = GlobalVariableCheck(p99Key) ? GlobalVariableGet(p99Key) : g_spreadP95;
   g_spreadProfileRestored = g_spreadMedian > 0.0 && g_spreadP95 > 0.0;
}

double SpreadPercentile(double &sorted[], int count, double percentile)
{
   if(count <= 0) return 0.0;
   int index = (int)MathFloor((count - 1) * MathMax(0.0, MathMin(1.0, percentile)));
   return sorted[index];
}

void RecalculateSpreadProfile()
{
   if(g_spreadHistoryCount <= 0)
      return;

   double sorted[];
   ArrayResize(sorted, g_spreadHistoryCount);
   for(int i = 0; i < g_spreadHistoryCount; i++)
      sorted[i] = g_spreadHistory[i];
   ArraySort(sorted);

   g_spreadMedian = SpreadPercentile(sorted, g_spreadHistoryCount, 0.50);
   g_spreadP90 = SpreadPercentile(sorted, g_spreadHistoryCount, 0.90);
   g_spreadP95 = SpreadPercentile(sorted, g_spreadHistoryCount, 0.95);
   g_spreadP99 = SpreadPercentile(sorted, g_spreadHistoryCount, 0.99);

   // P95 follows normal broker conditions while the median multiplier prevents
   // a compressed session from making the gate unrealistically narrow.
   g_adaptiveSpreadLimit = MathMax(g_spreadP95 * 1.15, g_spreadMedian * 1.75);
   g_adaptiveSpreadLimit = MathMax(g_adaptiveSpreadLimit, 1.0);
}

void SampleSpread()
{
   datetime now = TimeCurrent();
   if(now <= 0 || now == g_lastSpreadSampleAt)
      return;

   double spread = CurrentSpreadPoints();
   if(spread <= 0.0 || spread >= 999999.0)
      return;

   g_lastSpreadSampleAt = now;
   g_spreadHistory[g_spreadHistoryIndex] = spread;
   g_spreadHistoryIndex = (g_spreadHistoryIndex + 1) % SPREAD_HISTORY_CAPACITY;
   if(g_spreadHistoryCount < SPREAD_HISTORY_CAPACITY)
      g_spreadHistoryCount++;

   if((!g_spreadProfileRestored && g_spreadHistoryCount <= 60) ||
      (!g_spreadProfileRestored && g_spreadHistoryCount % 5 == 0) ||
      (g_spreadProfileRestored && g_spreadHistoryCount >= SPREAD_MIN_SAMPLES && g_spreadHistoryCount % 5 == 0))
      RecalculateSpreadProfile();

   bool profileReady = g_spreadHistoryCount >= SPREAD_MIN_SAMPLES || g_spreadProfileRestored;
   if(!profileReady)
   {
      // During warm-up use the broker's own live distribution. The configured
      // spread is only a floor, never an arbitrary hard ceiling.
      double bootstrapLimit = 0.0;
      if(g_spreadHistoryCount >= 5 && g_spreadMedian > 0.0)
         bootstrapLimit = MathMax(g_spreadP95 * 1.35, g_spreadMedian * 2.25);
      if(bootstrapLimit <= 0.0)
         bootstrapLimit = MathMax(1.0, spread * 2.25);
      g_adaptiveSpreadLimit = bootstrapLimit;
      g_spreadStatus = "WARMUP";
   }

   double elevatedLevel = g_spreadP90 > 0.0 ? g_spreadP90 : g_adaptiveSpreadLimit * 0.75;
   bool aboveLimit = spread > g_adaptiveSpreadLimit;
   if(aboveLimit)
      g_spreadHighSeconds++;
   else
      g_spreadHighSeconds = 0;

   double emergencySpreadLimit = MathMax(
      g_adaptiveSpreadLimit * 3.0,
      MathMax(g_spreadP99 * 2.0, g_spreadMedian * 5.0)
   );
   if(emergencySpreadLimit <= 0.0)
      emergencySpreadLimit = MathMax(1.0, spread * 3.0);

   if(spread > emergencySpreadLimit)
      g_spreadStatus = "EXTREME";
   else if(g_spreadHighSeconds >= 3)
      g_spreadStatus = "NEWS_WIDE";
   else if(aboveLimit || spread > elevatedLevel)
      g_spreadStatus = profileReady ? "ELEVATED" : "WARMUP";
   else
      g_spreadStatus = profileReady ? "NORMAL" : "WARMUP";

   g_spreadConfidencePenalty = 0.0;
   if(spread > elevatedLevel && g_adaptiveSpreadLimit > elevatedLevel)
   {
      // News spread should not become a hidden 20-point Confidence veto.
      // EXTREME spread is already blocked by AdaptiveSpreadAllowed().
      double maxSpreadPenalty = g_spreadStatus == "NEWS_WIDE" ? 4.0 : 10.0;
      g_spreadConfidencePenalty = MathMin(
         maxSpreadPenalty,
         maxSpreadPenalty * (spread - elevatedLevel) /
            MathMax(1.0, g_adaptiveSpreadLimit - elevatedLevel)
      );
   }

   if(g_spreadHistoryCount >= SPREAD_MIN_SAMPLES && g_spreadHistoryCount % 60 == 0)
      PersistSpreadProfile();
}

bool AdaptiveSpreadAllowed()
{
   double current = CurrentSpreadPoints();
   if(current <= 0.0 || current >= 999999.0)
      return false;

   if(!g_adaptiveEngine)
      return g_maxSpread <= 0 || current <= g_maxSpread;

   // Allow normal news-session widening. Only an extreme spread several times
   // the learned broker distribution remains a hard execution stop.
   if(g_adaptiveSpreadLimit <= 0.0)
      return true;

   double emergencySpreadLimit = MathMax(
      g_adaptiveSpreadLimit * 3.0,
      MathMax(g_spreadP99 * 2.0, g_spreadMedian * 5.0)
   );
   if(emergencySpreadLimit <= 0.0)
      return true;
   return current <= emergencySpreadLimit;
}

double CurrentSpreadPoints()
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick)) return 999999.0;
   return (double)MathRound((tick.ask - tick.bid) / _Point);
}

double CurrentSpreadPrice()
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick)) return 0.0;
   return MathMax(0.0, tick.ask - tick.bid);
}

double CurrentSpreadCost(double volume)
{
   MqlTick tick;
   if(volume <= 0.0 || !SymbolInfoTick(_Symbol, tick) || tick.ask <= tick.bid)
      return 0.0;

   double profit = 0.0;
   if(OrderCalcProfit(ORDER_TYPE_BUY, _Symbol, volume, tick.ask, tick.bid, profit))
      return MathAbs(profit);

   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE_LOSS);
   if(tickValue <= 0.0) tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   if(tickSize <= 0.0 || tickValue <= 0.0)
      return 0.0;
   return MathAbs((tick.ask - tick.bid) / tickSize * tickValue * volume);
}

double EffectiveBasketProfitTarget()
{
   if(g_profitTargetMode == "OFF")
      return 0.0;

   // Per-position profit mode is mutually exclusive with Basket profit.
   if(g_profitTargetMode == "MANUAL" && g_perPositionProfit > 0.0)
      return 0.0;

   // Explicit website setting always wins.
   if(g_profitTargetMode == "MANUAL" && g_basketProfitTarget > 0.0)
      return g_basketProfitTarget;

   // Automatic Basket target is a fallback when the user left Basket profit off.
   if(g_profitTargetMode == "AUTO" &&
      BasketFillEnabled() && g_burstTargetMoney > 0.0)
      return g_burstTargetMoney;

   return 0.0;
}

double EffectiveBasketLossLimit()
{
   // 0 means OFF exactly. Never invent a hidden Basket loss behind the user's
   // setting in every workflow.
   return MathMax(0.0, g_maxBasketLoss);
}

void EnsureBurstTargets(int plannedPositions)
{
   if(g_profitTargetMode != "AUTO" ||
      !BasketFillEnabled() ||
      g_burstTargetMoney > 0.0)
      return;

   int targetCount = MathMax(1, plannedPositions);
   double volume = g_adaptiveLot > 0.0 ? g_adaptiveLot : NormalizeTradeVolume(g_lot);
   double plannedSpreadCost = CurrentSpreadCost(volume) * targetCount;
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double fallbackTarget = MathMax(0.50, MathMax(plannedSpreadCost * 0.50, equity * 0.0002));
   double dynamicTarget = 0.0;

   int direction = BasketDirection();
   double anchorPrice = BasketAnchorEntryPrice(direction);
   if(direction != 0 && anchorPrice > 0.0)
   {
      double stopPrice = DynamicInitialStopPrice(direction, anchorPrice);
      double takeProfitPrice = DynamicTakeProfitPrice(direction, anchorPrice, stopPrice);
      double projectedPerPosition = 0.0;
      ENUM_ORDER_TYPE orderType = direction > 0 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
      if(takeProfitPrice > 0.0 &&
         OrderCalcProfit(orderType, _Symbol, volume, anchorPrice, takeProfitPrice, projectedPerPosition))
      {
         // Ladder entries occur progressively, so use a conservative portion of
         // the anchor projection instead of pretending all ten fills are at rung 1.
         dynamicTarget = MathAbs(projectedPerPosition) * targetCount * 0.60;
         if(equity > 0.0)
            dynamicTarget = MathMin(dynamicTarget, equity * 0.005);
         g_dynamicStopPrice = stopPrice;
         g_dynamicTakeProfitPrice = takeProfitPrice;
      }
   }

   // Keep the automatic reward meaningful relative to the configured loss
   // budget. Smart Profit Defense may still bank a smaller positive Cycle when
   // the graph confirms a reversal.
   double expectancyFloor = 0.0;
   if(g_maxBasketLoss > 0.0)
   {
      expectancyFloor = g_maxBasketLoss * 0.30;
      if(equity > 0.0)
         expectancyFloor = MathMin(expectancyFloor,equity * 0.01);
   }

   g_burstTargetMoney = MathMax(
      fallbackTarget,
      MathMax(dynamicTarget,expectancyFloor)
   );

   // Loss protection is never synthesized. If the user sets Basket Loss to 0,
   // the effective Basket loss is OFF.
   g_burstLossMoney = 0.0;
}

double BasketAnchorEntryPrice(int direction)
{
   long oldestTime = 0;
   double oldestPrice = 0.0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol ||
         PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;
      long type = PositionGetInteger(POSITION_TYPE);
      if((direction > 0 && type != POSITION_TYPE_BUY) ||
         (direction < 0 && type != POSITION_TYPE_SELL))
         continue;

      long openedAt = (long)PositionGetInteger(POSITION_TIME_MSC);
      if(oldestTime == 0 || openedAt < oldestTime)
      {
         oldestTime = openedAt;
         oldestPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      }
   }
   return oldestPrice;
}

double BasketProgressFromAnchorPoints(int direction)
{
   MqlTick tick;
   double anchorPrice = BasketAnchorEntryPrice(direction);
   if(anchorPrice <= 0.0 || !SymbolInfoTick(_Symbol, tick))
      return 0.0;
   return direction > 0
      ? (tick.bid - anchorPrice) / _Point
      : (anchorPrice - tick.ask) / _Point;
}

int EffectiveLadderTargetPositions(int direction)
{
   int target = MathMax(1,g_maxPositions);
   g_performanceRiskMode = target <= 1 ? "SINGLE" : "USER_TARGET";
   return target;
}

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

bool RecentDirectionalBodyAfter(
   int direction,
   ENUM_TIMEFRAMES timeframe,
   datetime since
)
{
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, timeframe, 1, 2, rates) < 2)
      return false;
   if(since > 0 && rates[0].time < since)
      return false;

   double range = MathMax(_Point, rates[0].high - rates[0].low);
   double body = MathAbs(rates[0].close - rates[0].open);
   if(body < range * 0.25)
      return false;

   return direction > 0
      ? rates[0].close > rates[0].open
      : rates[0].close < rates[0].open;
}

bool BasketLadderReady(int direction, int count, int targetPositions)
{
   int nextRung = count + 1;
   g_ladderRung = MathMax(1, nextRung);
   g_ladderProgressPoints = MathMax(0.0, BasketProgressFromAnchorPoints(direction));

   if(nextRung <= 1)
   {
      g_ladderRequiredPoints = 0.0;
      g_ladderPullbackPoints = 0.0;
      g_ladderPullbackRequiredPoints = 0.0;
      g_ladderMode = "INITIAL";
      return true;
   }

   double atr = g_atrPoints > 0.0
      ? g_atrPoints
      : AverageTrueRangePoints(PERIOD_M15, g_atrPeriod);
   atr = MathMax(10.0, atr);

   double fillElapsedSeconds = g_burstStartedAt > 0
      ? MathMax(0.0,(double)(TimeCurrent()-g_burstStartedAt))
      : 0.0;
   double fillWindowSeconds = 600.0;
   double rungCadenceSeconds = targetPositions > 1
      ? fillWindowSeconds / (double)(targetPositions-1)
      : fillWindowSeconds;
   g_fillExpectedPositions = targetPositions <= 1
      ? 1
      : MathMin(
           targetPositions,
           1 + (int)MathFloor(fillElapsedSeconds/MathMax(15.0,rungCadenceSeconds))
        );
   bool fillBehindSchedule = count < g_fillExpectedPositions;
   g_fillUrgency = MathMax(0.0,MathMin(1.0,fillElapsedSeconds/fillWindowSeconds));

   double qualityFactor = g_entryQuality == "A" ? 0.95 :
                          g_entryQuality == "B" ? 1.10 : 1.30;
   if(fillBehindSchedule)
      qualityFactor *= MathMax(0.58,1.0-g_fillUrgency*0.35);
   double regimeFactor =
      g_marketRegimeDetail == "NEWS_IMPULSE" ? 1.15 :
      g_marketRegime == "HIGH_VOLATILITY" ? 1.10 :
      g_marketRegimeDetail == "TREND_ACCELERATION" ? 0.95 : 1.0;

   g_ladderRequiredPoints = MathMax(
      3.0,
      atr * LadderFractionForRung(nextRung) * qualityFactor * regimeFactor
   );

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
   {
      g_ladderMode = "NO_TICK";
      return false;
   }

   double current = direction > 0 ? tick.bid : tick.ask;
   if(g_ladderExtremePrice <= 0.0)
      g_ladderExtremePrice = current;

   // Track the most favorable price after the previous rung.
   if(direction > 0)
      g_ladderExtremePrice = MathMax(g_ladderExtremePrice, current);
   else
      g_ladderExtremePrice = MathMin(g_ladderExtremePrice, current);

   g_ladderPullbackPoints = direction > 0
      ? MathMax(0.0, (g_ladderExtremePrice - current) / _Point)
      : MathMax(0.0, (current - g_ladderExtremePrice) / _Point);

   double pullbackFactor =
      g_marketRegimeDetail == "NEWS_IMPULSE" ? 0.080 :
      g_marketRegime == "HIGH_VOLATILITY" ? 0.100 : 0.120;
   g_ladderPullbackRequiredPoints = MathMax(
      2.0,
      MathMin(
         atr * pullbackFactor,
         MathMax(2.0, g_ladderRequiredPoints * 0.35)
      )
   );

   // Completion-oriented path: when the Basket falls behind the user's target
   // pace, allow the next rung on a fresh execution turn without waiting for a
   // large favorable move first. This never fires from time alone.
   if(fillBehindSchedule)
   {
      double scheduledPa = direction > 0
         ? g_priceActionBuyScore
         : g_priceActionSellScore;
      bool scheduledTurn = RecentDirectionalBody(direction,PERIOD_M1);
      bool scheduledConfirm =
         LowerTimeframeSupportsDirection(direction) ||
         (direction > 0 && g_emaReclaimState == "RECLAIM_EMA21_UP") ||
         (direction < 0 && g_emaReclaimState == "LOSE_EMA21_DOWN") ||
         scheduledPa >= 20.0 ||
         MomentumSupportsDirection(direction,MomentumPoints(),0.35);

      if(scheduledTurn && scheduledConfirm)
      {
         g_ladderMode = "SCHEDULED_RETEST_READY";
         return true;
      }
   }

   if(!g_ladderPullbackArmed &&
      g_ladderProgressPoints < g_ladderRequiredPoints)
   {
      g_ladderMode = fillBehindSchedule
         ? "WAIT_SCHEDULED_TURN"
         : "WAIT_PROGRESS";
      return false;
   }

   // Critical anti-chase change: once the next rung distance is reached, do
   // not add at the new extreme. Wait for a small pullback first.
   if(!g_ladderPullbackArmed)
   {
      if(g_ladderPullbackPoints < g_ladderPullbackRequiredPoints)
      {
         g_ladderMode = "WAIT_PULLBACK";
         return false;
      }

      g_ladderPullbackArmed = true;
      g_ladderPullbackArmedAt = TimeCurrent();
      g_ladderMode = "WAIT_CONTINUATION";
      return false;
   }

   // After the pullback, require a fresh execution turn back in Basket
   // direction. This converts the Ladder from "add on new low/high" into
   // "add after pullback + continuation".
   bool m1Turn = RecentDirectionalBodyAfter(
      direction,
      PERIOD_M1,
      g_ladderPullbackArmedAt
   );
   bool emaContinuation =
      g_emaTrendM1 == direction &&
      g_emaTrendM5 == direction;
   double paScore = direction > 0
      ? g_priceActionBuyScore
      : g_priceActionSellScore;
   bool continuation =
      m1Turn &&
      (
         MomentumSupportsDirection(direction,MomentumPoints(),0.30) ||
         emaContinuation ||
         paScore >= 18.0
      );

   if(!continuation)
   {
      g_ladderMode = "WAIT_CONTINUATION";
      return false;
   }

   double exhaustion = 0.0;
   double extensionAtr = 0.0;
   double adverseWick = 0.0;
   string exhaustionReason = "NONE";
   bool exhausted = DirectionalExhaustion(
      direction,
      exhaustion,
      extensionAtr,
      adverseWick,
      exhaustionReason
   );
   if(exhausted && !PullbackRetestReady(direction, MomentumPoints()))
   {
      g_ladderMode = "EXHAUSTION_PULLBACK";
      return false;
   }

   g_ladderMode = "PULLBACK_CONTINUATION_READY";
   return true;
}

void ArmBurst(int direction)
{
   if(!BasketFillEnabled() || g_burstActive)
      return;

   g_burstDirection = direction;
   g_effectiveLadderTargetPositions = EffectiveLadderTargetPositions(direction);
   g_burstTargetPositions = MathMax(1,g_effectiveLadderTargetPositions);
   g_burstRequestsSent = MathMax(1, BasketPositionCount());
   g_burstStartedAt = TimeCurrent();
   g_ladderRung = MathMax(1, BasketPositionCount() + 1);
   g_ladderProgressPoints = 0.0;
   g_ladderRequiredPoints = 0.0;
   g_ladderExtremePrice = 0.0;
   g_ladderPullbackPoints = 0.0;
   g_ladderPullbackRequiredPoints = 0.0;
   g_ladderPullbackArmed = false;
   g_ladderPullbackArmedAt = 0;
   g_ladderMode = "ARMED";
   g_burstActive = g_burstRequestsSent < g_burstTargetPositions;
   g_burstNeedsRearm = false;
   EnsureBurstTargets(g_burstTargetPositions);
   Print(
      "Basket fill armed direction=", direction,
      " target=", DoubleToString(g_burstTargetMoney, 2),
      " loss=", DoubleToString(g_burstLossMoney, 2)
   );
}

void AbortBurst(string reason)
{
   if(!g_burstActive) return;
   g_burstActive = false;
   g_executionStatus = "BASKET_FILL_ABORTED";
   g_adaptiveBlockReason = reason;
   Print("Basket fill aborted: ", reason, " filled=", BasketPositionCount());
}

void ProcessBurstQueue()
{
   if(!BasketFillEnabled() || !g_burstActive)
      return;

   if(g_state != STATE_RUNNING || !g_access ||
      (!MQLInfoInteger(MQL_TESTER) && !EntryLeaseValid()))
   {
      AbortBurst("CONTROL_NOT_FRESH");
      return;
   }
   if(TradePermissionStatus() != "OK")
   {
      AbortBurst("TRADE_PERMISSION");
      return;
   }
   int count = BasketPositionCount();
   if(count >= g_burstTargetPositions)
   {
      g_burstActive = false;
      g_burstNeedsRearm = false;
      g_executionStatus = "BASKET_FILL_COMPLETE";
      g_ladderMode = "COMPLETE";
      return;
   }
   // Rung 1 was opened immediately by the setup engine. Additional positions
   // are staged transparently by the Ladder rather than fired in one burst.
   if(!BasketLadderReady(g_burstDirection, count, g_burstTargetPositions))
   {
      g_executionStatus =
         g_ladderMode == "WAIT_PULLBACK" ||
         g_ladderMode == "EXHAUSTION_PULLBACK"
         ? "BASKET_LADDER_PULLBACK_WAIT"
         : g_ladderMode == "WAIT_CONTINUATION"
           ? "BASKET_LADDER_CONTINUATION_WAIT"
           : "BASKET_LADDER_WAIT";
      return;
   }

   if(!CanSendOrder())
      return;
   if(!AdaptiveSpreadAllowed())
   {
      g_executionStatus = "SPREAD_TOO_HIGH";
      return;
   }
   if(!MarketLocationEntryAllowed(g_burstDirection, true))
   {
      g_executionStatus = g_adaptiveBlockReason;
      return;
   }
   bool accepted = SendMarketOrder(g_burstDirection);
   RegisterOrderRequest();
   int filled = BasketPositionCount();
   if(accepted)
      g_burstRequestsSent = MathMax(g_burstRequestsSent + 1, filled);

   bool completed = filled >= g_burstTargetPositions;
   if(completed)
   {
      g_executionStatus = "BASKET_FILL_COMPLETE";
      g_ladderMode = "COMPLETE";
      g_burstActive = false;
      g_burstNeedsRearm = false;
   }
   else if(accepted)
   {
      g_executionStatus = "BASKET_LADDER_ADVANCE";
      g_ladderRung = filled + 1;
      g_ladderExtremePrice = 0.0;
      g_ladderPullbackPoints = 0.0;
      g_ladderPullbackRequiredPoints = 0.0;
      g_ladderPullbackArmed = false;
      g_ladderPullbackArmedAt = 0;
   }
}

int SymbolDigitsNow()
{
   return (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
}

bool CanSendOrder()
{
   ulong nowMs = GetTickCount64();
   int spacingMs = BasketFillEnabled()
      ? g_minOrderIntervalMs
      : (g_adaptiveEngine ? g_adaptiveEntrySpacingMs : g_minOrderIntervalMs);
   if(nowMs - g_lastOrderMs < (ulong)MathMax(0, spacingMs))
      return false;

   datetime now = TimeCurrent();
   if(g_orderWindowStart == 0 || now - g_orderWindowStart >= 60)
   {
      g_orderWindowStart = now;
      g_ordersInWindow = 0;
   }

   return g_ordersInWindow < g_maxOrdersPerMinute;
}

bool EntryLeaseValid()
{
   if(MQLInfoInteger(MQL_TESTER)) return true;
   int freshnessSeconds = MathMax(10, MathMax(1, InpHeartbeatSeconds) * 3);
   return g_access && g_runAuthorized && g_lastRunAuthorization > 0 &&
          TimeCurrent() - g_lastRunAuthorization <= freshnessSeconds;
}

void RegisterOrderRequest()
{
   g_lastOrderMs = GetTickCount64();
   if(g_orderWindowStart == 0)
      g_orderWindowStart = TimeCurrent();
   g_ordersInWindow++;
}

int BasketPositionCount()
{
   int count = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL) == _Symbol &&
         PositionGetInteger(POSITION_MAGIC) == InpMagic)
         count++;
   }
   return count;
}

double BasketProfit()
{
   double total = 0.0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol ||
         PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;
      total += PositionGetDouble(POSITION_PROFIT);
      total += PositionGetDouble(POSITION_SWAP);
   }
   return total;
}

string BasketPeakGlobalKey()
{
   return StringFormat(
      "SCN_BPK_%I64d_%I64d_%s",
      (long)AccountInfoInteger(ACCOUNT_LOGIN),
      InpMagic,
      _Symbol
   );
}

string BasketRealizedGlobalKey()
{
   return StringFormat(
      "SCN_BRL_%I64d_%I64d_%s",
      (long)AccountInfoInteger(ACCOUNT_LOGIN),
      InpMagic,
      _Symbol
   );
}

string ProfitRunPeakGlobalKey()
{
   return StringFormat(
      "SCN_PRP_%I64d_%I64d_%s",
      (long)AccountInfoInteger(ACCOUNT_LOGIN),
      InpMagic,
      _Symbol
   );
}

string DailyProfitArmedGlobalKey()
{
   return StringFormat(
      "SCN_DPA_%I64d_%I64d_%s",
      (long)AccountInfoInteger(ACCOUNT_LOGIN),
      InpMagic,
      _Symbol
   );
}

string DailyProfitLockGlobalKey()
{
   return StringFormat(
      "SCN_DPL_%I64d_%I64d_%s",
      (long)AccountInfoInteger(ACCOUNT_LOGIN),
      InpMagic,
      _Symbol
   );
}

void SaveBasketCycleState()
{
   GlobalVariableSet(BasketPeakGlobalKey(), (double)g_basketPeakPositionCount);
   GlobalVariableSet(BasketRealizedGlobalKey(), g_basketCycleRealizedProfit);
   GlobalVariableSet(ProfitRunPeakGlobalKey(), g_profitRunPeak);
}

void LoadBasketCycleState()
{
   int count = BasketPositionCount();
   if(count <= 0)
   {
      ResetBasketCycleState();
      return;
   }

   string peakKey = BasketPeakGlobalKey();
   string realizedKey = BasketRealizedGlobalKey();
   string profitRunPeakKey = ProfitRunPeakGlobalKey();

   g_basketPeakPositionCount = count;
   if(GlobalVariableCheck(peakKey))
      g_basketPeakPositionCount =
         (int)MathMax((double)count, GlobalVariableGet(peakKey));

   g_basketCycleRealizedProfit = 0.0;
   if(GlobalVariableCheck(realizedKey))
      g_basketCycleRealizedProfit = GlobalVariableGet(realizedKey);

   g_profitRunPeak = 0.0;
   if(GlobalVariableCheck(profitRunPeakKey))
      g_profitRunPeak = GlobalVariableGet(profitRunPeakKey);

   SaveBasketCycleState();
}

void ResetBasketCycleState()
{
   if(g_basketPeakPositionCount == 0 &&
      MathAbs(g_basketCycleRealizedProfit) < 0.0000001 &&
      MathAbs(g_profitRunPeak) < 0.0000001 &&
      !g_smartProfitDefenseActive &&
      g_smartProfitDefenseReason == "NONE" &&
      MathAbs(g_smartProfitDefenseLastProfit) < 0.0000001)
      return;

   g_basketPeakPositionCount = 0;
   g_basketCycleRealizedProfit = 0.0;
   g_profitRunPeak = 0.0;
   g_smartProfitDefenseFloor = 0.0;
   g_smartProfitDefenseLastProfit = 0.0;
   g_smartProfitDefenseReason = "NONE";
   g_smartProfitDefenseActive = false;

   string peakKey = BasketPeakGlobalKey();
   string realizedKey = BasketRealizedGlobalKey();
   string profitRunPeakKey = ProfitRunPeakGlobalKey();
   if(GlobalVariableCheck(peakKey)) GlobalVariableDel(peakKey);
   if(GlobalVariableCheck(realizedKey)) GlobalVariableDel(realizedKey);
   if(GlobalVariableCheck(profitRunPeakKey)) GlobalVariableDel(profitRunPeakKey);
}

void UpdateBasketPeakPositionCount(int count)
{
   if(count <= 0) return;
   if(count > g_basketPeakPositionCount)
   {
      g_basketPeakPositionCount = count;
      SaveBasketCycleState();
   }
}

void RecordBasketDeal(ulong deal)
{
   if(deal == 0 || !HistoryDealSelect(deal))
      return;

   if(HistoryDealGetString(deal, DEAL_SYMBOL) != _Symbol ||
      HistoryDealGetInteger(deal, DEAL_MAGIC) != InpMagic)
      return;

   g_basketCycleRealizedProfit += HistoryDealGetDouble(deal, DEAL_PROFIT);
   g_basketCycleRealizedProfit += HistoryDealGetDouble(deal, DEAL_SWAP);
   g_basketCycleRealizedProfit += HistoryDealGetDouble(deal, DEAL_COMMISSION);
   SaveBasketCycleState();
}

double BasketCycleProfit()
{
   return g_basketCycleRealizedProfit + BasketProfit();
}

double CurrentPerPositionProfitTarget()
{
   return MathMax(0.0, g_perPositionProfit);
}

double SmartProfitProtectionFloor(int direction)
{
   double volume = direction == 0
      ? MathMax(SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN),g_lot)
      : MathMax(
         SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN),
         VolumeForMagic(InpMagic,direction)
      );

   // Closing a positive Cycle can still pay commission. Keep a small reserve
   // so "protect profit" does not intentionally turn a tiny winner negative.
   double costReserve = CurrentSpreadCost(volume) * 0.35;
   double configuredReference = g_basketProfitTarget > 0.0
      ? g_basketProfitTarget * 0.05
      : 0.0;
   return MathMax(0.10,MathMax(costReserve,configuredReference));
}

bool SmartProfitReversalDetected(
   int direction,
   double cycleProfit,
   string &reasonOut
)
{
   reasonOut = "NONE";
   g_smartProfitDefenseActive = false;
   g_smartProfitDefenseReason = "NONE";
   g_smartProfitDefenseLastProfit = cycleProfit;

   if(direction == 0 || cycleProfit <= 0.0)
      return false;

   double floor = SmartProfitProtectionFloor(direction);
   g_smartProfitDefenseFloor = floor;
   if(cycleProfit < floor)
      return false;

   int opposite = -direction;
   bool m1Flip = g_trendM1 == opposite;
   bool m5Flip = g_trendM5 == opposite;
   bool m15Flip = g_trendM15 == opposite;
   bool emaFlip =
      g_emaTrendM5 == opposite ||
      (direction > 0 && g_emaReclaimState == "LOSE_EMA21_DOWN") ||
      (direction < 0 && g_emaReclaimState == "RECLAIM_EMA21_UP");
   bool emaMacroFlip =
      g_emaTrendM15 == opposite ||
      g_emaTrendM30 == opposite;
   double oppositePa = direction > 0
      ? g_priceActionSellScore
      : g_priceActionBuyScore;
   bool momentumFlip = MomentumSupportsDirection(
      opposite,
      MomentumPoints(),
      0.35
   );

   bool structuralFlip =
      m5Flip && (m15Flip || emaMacroFlip);
   bool executionFlip =
      m5Flip && emaFlip && oppositePa >= 28.0 && momentumFlip;
   bool strongPriceActionFlip =
      oppositePa >= 40.0 &&
      m5Flip &&
      (emaFlip || momentumFlip);
   bool confirmed =
      (structuralFlip && (oppositePa >= 22.0 || momentumFlip)) ||
      executionFlip ||
      strongPriceActionFlip ||
      (m15Flip && emaMacroFlip && momentumFlip);

   // One-minute noise is a warning only, never a profit-close trigger alone.
   if(m1Flip && !m5Flip && !m15Flip)
      confirmed = false;

   if(!confirmed)
      return false;

   if(m15Flip && emaMacroFlip)
      reasonOut = "M15_EMA_REVERSAL";
   else if(oppositePa >= 34.0)
      reasonOut = "PRICE_ACTION_REVERSAL";
   else if(m1Flip && m5Flip)
      reasonOut = "M1_M5_REVERSAL";
   else
      reasonOut = "EMA_MOMENTUM_REVERSAL";

   g_smartProfitDefenseActive = true;
   g_smartProfitDefenseReason = reasonOut;
   return true;
}

bool AutoProfitGivebackDetected(int direction,double cycleProfit)
{
   if(direction == 0 || cycleProfit <= 0.0)
      return false;

   double floor = SmartProfitProtectionFloor(direction);
   g_smartProfitDefenseFloor = floor;
   g_smartProfitDefenseLastProfit = cycleProfit;

   if(cycleProfit > g_profitRunPeak)
   {
      double previousPeak = g_profitRunPeak;
      g_profitRunPeak = cycleProfit;
      // Persist only when the peak crosses another $0.05 step. Keeping the
      // live peak every tick is useful, but disk/global writes every tick are not.
      if(MathFloor(g_profitRunPeak * 20.0) > MathFloor(previousPeak * 20.0))
         SaveBasketCycleState();
      return false;
   }

   // Do not react to a few cents of noise. Auto arms only after the Cycle has
   // enough profit left to cover the close reserve with room to spare.
   double minimumPeak = MathMax(0.35,floor * 2.20);
   if(g_profitRunPeak < minimumPeak || cycleProfit <= floor)
      return false;

   bool strongTrend =
      g_trendM5 == direction &&
      g_trendM15 == direction &&
      (g_entryQuality == "A" || g_adxM5 >= 24.0);
   double oppositePa = direction > 0
      ? g_priceActionSellScore
      : g_priceActionBuyScore;
   bool confirmedMicroAgainst =
      g_trendM1 == -direction &&
      g_trendM5 == -direction;
   bool fragileMarket =
      g_marketRegime == "RANGE" ||
      (g_entryQuality == "C" && confirmedMicroAgainst) ||
      (confirmedMicroAgainst && oppositePa >= 24.0);
   double givebackPercent = strongTrend ? 0.45 : fragileMarket ? 0.26 : 0.34;

   double volume = MathMax(
      SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN),
      VolumeForMagic(InpMagic,direction)
   );
   double minimumGiveback = MathMax(0.10,CurrentSpreadCost(volume) * 0.25);
   double closeLevel = MathMax(
      floor,
      g_profitRunPeak - MathMax(minimumGiveback,g_profitRunPeak * givebackPercent)
   );
   if(cycleProfit > closeLevel)
      return false;

   g_smartProfitDefenseActive = true;
   g_smartProfitDefenseReason = "PROFIT_GIVEBACK";
   return true;
}

bool ManagePerPositionTargets()
{
   double profitTarget = CurrentPerPositionProfitTarget();
   bool closedAny = false;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;

      if(PositionGetString(POSITION_SYMBOL) != _Symbol ||
         PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;

      double positionProfit =
         PositionGetDouble(POSITION_PROFIT) +
         PositionGetDouble(POSITION_SWAP);

      bool closeForProfit =
         profitTarget > 0.0 &&
         positionProfit >= profitTarget;

      if(!closeForProfit)
         continue;

      Print(
         "POSITION_PROFIT_TARGET",
         " ticket=", ticket,
         " pnl=", DoubleToString(positionProfit, 2),
         " target=", DoubleToString(profitTarget, 2)
      );

      if(ClosePositionByTicket(ticket))
      {
         closedAny = true;
         g_executionStatus = "POSITION_PROFIT_CLOSED";
      }
   }

   return closedAny;
}

datetime BrokerDayStart()
{
   MqlDateTime t;
   TimeToStruct(TimeCurrent(), t);
   t.hour = 0;
   t.min = 0;
   t.sec = 0;
   return StructToTime(t);
}

void RecalculateDailyClosedProfit()
{
   g_dailyClosedProfit = 0.0;

   datetime from = BrokerDayStart();
   datetime to = TimeCurrent();
   if(!HistorySelect(from, to))
      return;

   int deals = (int)HistoryDealsTotal();
   for(int i = 0; i < deals; i++)
   {
      ulong deal = HistoryDealGetTicket(i);
      if(deal == 0)
         continue;

      if(HistoryDealGetString(deal, DEAL_SYMBOL) != _Symbol ||
         !IsScenovaMagic(HistoryDealGetInteger(deal, DEAL_MAGIC)))
         continue;

      g_dailyClosedProfit += HistoryDealGetDouble(deal, DEAL_PROFIT);
      g_dailyClosedProfit += HistoryDealGetDouble(deal, DEAL_SWAP);
      g_dailyClosedProfit += HistoryDealGetDouble(deal, DEAL_COMMISSION);
   }
}

double DailyBotProfit()
{
   return g_dailyClosedProfit + BasketProfit() + RescueProfit();
}

double DailyProfitGivebackFloor()
{
   if(g_dailyProfitTarget <= 0.0)
      return 0.0;

   double percent = MathMax(0.0, MathMin(95.0, g_dailyProfitDrawdownPercent));
   return g_dailyProfitTarget * (1.0 - percent / 100.0);
}

void LoadDailyProfitRunOnState()
{
   string key = DailyProfitArmedGlobalKey();
   g_dailyProfitTargetArmed = false;

   if(!GlobalVariableCheck(key))
      return;

   int armedDay = (int)GlobalVariableGet(key);
   if(armedDay == g_dayKey)
      g_dailyProfitTargetArmed = true;
   else
      GlobalVariableDel(key);
}

void ArmDailyProfitRunOn()
{
   if(g_dailyProfitTargetArmed)
      return;

   g_dailyProfitTargetArmed = true;
   GlobalVariableSet(DailyProfitArmedGlobalKey(), (double)g_dayKey);
   Print(
      "DAILY_PROFIT_RUN_ON armed. Target=",
      DoubleToString(g_dailyProfitTarget, 2),
      " floor=",
      DoubleToString(DailyProfitGivebackFloor(), 2)
   );
}

void DisarmDailyProfitRunOn()
{
   g_dailyProfitTargetArmed = false;
   string key = DailyProfitArmedGlobalKey();
   if(GlobalVariableCheck(key))
      GlobalVariableDel(key);
}

bool HandleDailyProfitControl(int count)
{
   double dailyProfit = DailyBotProfit();

   if(g_dailyProfitLocked)
   {
      if(count > 0)
         CloseAllBasket("DAILY_PROFIT_LOCK");

      g_state = STATE_SAFE_STOP;
      g_runAuthorized = false;
      g_executionStatus = "DAILY_PROFIT_LOCK";
      ResetTrail();
      return true;
   }

   if(g_dailyProfitTarget <= 0.0)
   {
      if(g_dailyProfitTargetArmed)
         DisarmDailyProfitRunOn();
      return false;
   }

   bool continueAfterTarget =
      g_dailyProfitContinueAfterTarget &&
      g_dailyProfitDrawdownPercent > 0.0;

   if(continueAfterTarget)
   {
      if(!g_dailyProfitTargetArmed && dailyProfit >= g_dailyProfitTarget)
         ArmDailyProfitRunOn();

      if(g_dailyProfitTargetArmed)
      {
         double floor = DailyProfitGivebackFloor();
         if(dailyProfit <= floor)
         {
            LockDailyProfitGiveback();
            if(count > 0)
               CloseAllBasket("DAILY_PROFIT_GIVEBACK");

            g_state = STATE_SAFE_STOP;
            g_runAuthorized = false;
            g_executionStatus = "DAILY_PROFIT_GIVEBACK_LOCK";
            ResetTrail();
            return true;
         }
      }

      return false;
   }

   if(g_dailyProfitTargetArmed)
      DisarmDailyProfitRunOn();

   if(dailyProfit >= g_dailyProfitTarget)
   {
      LockDailyProfitTarget();
      if(count > 0)
         CloseAllBasket("DAILY_PROFIT_TARGET");

      g_state = STATE_SAFE_STOP;
      g_runAuthorized = false;
      g_executionStatus = "DAILY_PROFIT_LOCK";
      ResetTrail();
      return true;
   }

   return false;
}

void UnlockDailyProfitLock(string reason)
{
   if(!g_dailyProfitLocked)
      return;

   g_dailyProfitLocked=false;
   DisarmDailyProfitRunOn();

   string key=DailyProfitLockGlobalKey();
   if(GlobalVariableCheck(key))
      GlobalVariableDel(key);

   if(g_pendingCloseReason==CLOSE_REASON_DAILY_PROFIT &&
      BasketPositionCount()==0 &&
      RescuePositionCount()==0)
   {
      g_pendingCloseReason=CLOSE_REASON_NONE;
      PersistPendingClose();
   }

   g_executionStatus="DAILY_PROFIT_TARGET_UPDATED";
   Print(
      "DAILY_PROFIT_LOCK cleared reason=",reason,
      " current=",DoubleToString(DailyBotProfit(),2),
      " newTarget=",DoubleToString(g_dailyProfitTarget,2)
   );
}

void LoadDailyProfitLock()
{
   string key = DailyProfitLockGlobalKey();
   g_dailyProfitLocked = false;

   if(!GlobalVariableCheck(key))
      return;

   int lockedDay = (int)GlobalVariableGet(key);
   if(lockedDay == g_dayKey)
      g_dailyProfitLocked = true;
   else
      GlobalVariableDel(key);
}

void LockDailyProfitTarget()
{
   if(g_dailyProfitLocked)
      return;

   DisarmDailyProfitRunOn();
   g_dailyProfitLocked = true;
   GlobalVariableSet(DailyProfitLockGlobalKey(), (double)g_dayKey);
   Print(
      "DAILY_PROFIT_TARGET reached. Daily bot P/L=",
      DoubleToString(DailyBotProfit(), 2),
      " target=",
      DoubleToString(g_dailyProfitTarget, 2)
   );
}

void LockDailyProfitGiveback()
{
   if(g_dailyProfitLocked)
      return;

   DisarmDailyProfitRunOn();
   g_dailyProfitLocked = true;
   GlobalVariableSet(DailyProfitLockGlobalKey(), (double)g_dayKey);
   Print(
      "DAILY_PROFIT_GIVEBACK reached. Daily bot P/L=",
      DoubleToString(DailyBotProfit(), 2),
      " floor=",
      DoubleToString(DailyProfitGivebackFloor(), 2)
   );
}

int BasketDirection()
{
   int buys = 0;
   int sells = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol ||
         PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;
      long type = PositionGetInteger(POSITION_TYPE);
      if(type == POSITION_TYPE_BUY) buys++;
      if(type == POSITION_TYPE_SELL) sells++;
   }
   if(buys > 0 && sells == 0) return 1;
   if(sells > 0 && buys == 0) return -1;
   return 0;
}

ENUM_ORDER_TYPE_FILLING AllowedFillingMode()
{
   long filling = SymbolInfoInteger(_Symbol, SYMBOL_FILLING_MODE);
   if((filling & SYMBOL_FILLING_FOK) == SYMBOL_FILLING_FOK)
      return ORDER_FILLING_FOK;
   if((filling & SYMBOL_FILLING_IOC) == SYMBOL_FILLING_IOC)
      return ORDER_FILLING_IOC;
   return ORDER_FILLING_RETURN;
}

double NormalizeTradeVolume(double volume)
{
   double minVolume = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxVolume = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);

   volume = MathMax(minVolume, MathMin(maxVolume, volume));
   if(step > 0.0)
   {
      volume = MathFloor((volume + 1e-12) / step) * step;
      volume = MathMax(minVolume, MathMin(maxVolume, volume));
   }

   return NormalizeDouble(volume, 8);
}

bool TradeResultAccepted(const MqlTradeResult &result)
{
   return (
      result.retcode == TRADE_RETCODE_DONE ||
      result.retcode == TRADE_RETCODE_PLACED ||
      result.retcode == TRADE_RETCODE_DONE_PARTIAL
   );
}

long RescueMagic()
{
   return InpMagic + 910001;
}

bool IsScenovaMagic(long magic)
{
   return magic == InpMagic || magic == RescueMagic();
}

string RescueStateName()
{
   if(g_rescueState == RESCUE_WARNING) return "WARNING";
   if(g_rescueState == RESCUE_ACTIVE) return "RESCUE";
   if(g_rescueState == RESCUE_RECOVERY) return "RECOVERY";
   if(g_rescueState == RESCUE_EXIT) return "EXIT";
   return "NORMAL";
}

string RescueGlobalKey(string suffix)
{
   return StringFormat(
      "SCN_RSC_%I64d_%I64d_%s_%s",
      (long)AccountInfoInteger(ACCOUNT_LOGIN),
      InpMagic,
      _Symbol,
      suffix
   );
}

void SaveRescueState()
{
   GlobalVariableSet(RescueGlobalKey("state"),(double)g_rescueState);
   GlobalVariableSet(RescueGlobalKey("start"),(double)g_rescueStartedAt);
   GlobalVariableSet(RescueGlobalKey("dir"),(double)g_rescuePrimaryDirection);
   GlobalVariableSet(RescueGlobalKey("real"),g_rescueRealizedProfit);
   GlobalVariableSet(RescueGlobalKey("def"),g_rescueInitialDeficit);
   GlobalVariableSet(RescueGlobalKey("target"),g_rescueTargetMoney);
   GlobalVariableSet(RescueGlobalKey("partial"),(double)g_rescuePartialCloseCount);
}

void ResetRescueState()
{
   g_rescueState = RESCUE_NORMAL;
   g_rescueStartedAt = 0;
   g_rescueWarningAt = 0;
   g_rescuePrimaryDirection = 0;
   g_rescueHedgeDirection = 0;
   g_rescueHedgeLot = 0.0;
   g_rescuePrimaryVolume = 0.0;
   g_rescueNetExposure = 0.0;
   g_rescueReversalScore = 0.0;
   g_rescueReversalConfirmed = false;
   g_rescueReversalReason = "NONE";
   g_rescueRequiredMoney = 0.0;
   g_rescueRecoveredMoney = 0.0;
   g_rescueInitialDeficit = 0.0;
   g_rescueTargetMoney = 0.0;
   g_rescueRecoveryPrice = 0.0;
   g_rescueRealizedProfit = 0.0;
   g_rescueCombinedProfit = 0.0;
   g_rescuePrimaryProfit = 0.0;
   g_rescueHedgeProfit = 0.0;
   g_rescuePartialCloseCount = 0;
   g_rescueOldestAgeSeconds = 0;
   g_rescueReversalCandidateSince = 0;
   g_rescuePrimaryRecoverySince = 0;
   g_rescueHedgeLockedUntil = 0;
   g_rescueLastAdjustedScore = 0.0;

   string keys[7] = {"state","start","dir","real","def","target","partial"};
   for(int i=0;i<ArraySize(keys);i++)
   {
      string key = RescueGlobalKey(keys[i]);
      if(GlobalVariableCheck(key))
         GlobalVariableDel(key);
   }
}

void RestoreRescueState()
{
   if(GlobalVariableCheck(RescueGlobalKey("state")))
      g_rescueState = (ENUM_RESCUE_STATE)(int)GlobalVariableGet(RescueGlobalKey("state"));
   if(GlobalVariableCheck(RescueGlobalKey("start")))
      g_rescueStartedAt = (datetime)(long)GlobalVariableGet(RescueGlobalKey("start"));
   if(GlobalVariableCheck(RescueGlobalKey("dir")))
      g_rescuePrimaryDirection = (int)GlobalVariableGet(RescueGlobalKey("dir"));
   if(GlobalVariableCheck(RescueGlobalKey("real")))
      g_rescueRealizedProfit = GlobalVariableGet(RescueGlobalKey("real"));
   if(GlobalVariableCheck(RescueGlobalKey("def")))
      g_rescueInitialDeficit = GlobalVariableGet(RescueGlobalKey("def"));
   if(GlobalVariableCheck(RescueGlobalKey("target")))
      g_rescueTargetMoney = GlobalVariableGet(RescueGlobalKey("target"));
   if(GlobalVariableCheck(RescueGlobalKey("partial")))
      g_rescuePartialCloseCount = (int)GlobalVariableGet(RescueGlobalKey("partial"));

   if(BasketPositionCount() == 0 && RescuePositionCount() == 0)
      ResetRescueState();
}

int RescuePositionCount()
{
   int count = 0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL)==_Symbol &&
         PositionGetInteger(POSITION_MAGIC)==RescueMagic())
         count++;
   }
   return count;
}

double FloatingProfitForMagic(long magic)
{
   double total=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=magic)
         continue;
      total += PositionGetDouble(POSITION_PROFIT);
      total += PositionGetDouble(POSITION_SWAP);
   }
   return total;
}

double VolumeForMagic(long magic,int direction)
{
   double total=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=magic)
         continue;
      long type=PositionGetInteger(POSITION_TYPE);
      if((direction>0 && type==POSITION_TYPE_BUY) ||
         (direction<0 && type==POSITION_TYPE_SELL))
         total += PositionGetDouble(POSITION_VOLUME);
   }
   return total;
}

double RescueProfit()
{
   return FloatingProfitForMagic(RescueMagic());
}

double RescueCombinedCycleProfit()
{
   return BasketCycleProfit() + g_rescueRealizedProfit + RescueProfit();
}

long OldestPrimaryPositionAgeSeconds()
{
   datetime oldest=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic)
         continue;
      datetime opened=(datetime)PositionGetInteger(POSITION_TIME);
      if(oldest==0 || opened<oldest)
         oldest=opened;
   }
   return oldest>0 ? (long)MathMax(0,TimeCurrent()-oldest) : 0;
}

bool AccountSupportsHedging()
{
   long mode=AccountInfoInteger(ACCOUNT_MARGIN_MODE);
   return mode==ACCOUNT_MARGIN_MODE_RETAIL_HEDGING;
}

bool RescueHedgeGranularityAvailable()
{
   if(!AccountSupportsHedging() || g_rescuePrimaryVolume<=0.0)
      return false;
   double minVolume=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN);
   double maxRatio=MathMax(0.20,MathMin(0.85,InpRescueMaxHedgeRatio));
   return g_rescuePrimaryVolume*maxRatio>=minVolume-1e-12;
}

double NormalizeRescueVolume(double volume)
{
   double minVolume=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN);
   double maxVolume=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX);
   double step=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
   if(volume < minVolume-1e-12)
      return 0.0;
   volume=MathMin(maxVolume,volume);
   if(step>0.0)
      volume=MathFloor((volume+1e-12)/step)*step;
   if(volume < minVolume-1e-12)
      return 0.0;
   return NormalizeDouble(volume,8);
}

double RescueThresholdMoney()
{
   double equity=MathMax(1.0,AccountInfoDouble(ACCOUNT_EQUITY));
   int count=MathMax(1,BasketPositionCount());
   double spreadReserve=CurrentSpreadCost(MathMax(SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN),g_lot))*count*3.0;
   double threshold=MathMax(1.0,MathMax(spreadReserve,equity*0.0035));
   if(g_maxBasketLoss>0.0)
      threshold=MathMin(threshold,MathMax(1.0,g_maxBasketLoss*0.45));
   return threshold;
}

long RescueTimeThresholdSeconds()
{
   double factor=1.0;
   if(g_marketRegime=="HIGH_VOLATILITY") factor=0.55;
   else if(g_marketRegime=="QUIET") factor=1.45;
   else if(g_marketRegimeDetail=="TREND_ACCELERATION") factor=0.75;
   int minutes=MathMax(5,InpTimeRescueMinutes);
   return (long)MathMax(300.0,minutes*60.0*factor);
}

double RescueReversalScore(int primaryDirection,string &reasonOut)
{
   int opposite=-primaryDirection;
   double score=0.0;
   reasonOut="NONE";

   if(LowerTimeframeSupportsDirection(opposite))
      score+=18.0;
   if(g_trendM15==opposite)
      score+=15.0;
   if(g_trendM30==opposite)
      score+=10.0;
   if(g_trendH1==opposite)
      score+=8.0;

   int emaDirs[3]={g_emaTrendM1,g_emaTrendM5,g_emaTrendM15};
   double emaWeights[3]={6.0,10.0,12.0};
   for(int i=0;i<3;i++)
      if(emaDirs[i]==opposite)
         score+=emaWeights[i];

   double paScore=opposite>0 ? g_priceActionBuyScore : g_priceActionSellScore;
   string paName=opposite>0 ? g_priceActionBuy : g_priceActionSell;
   score+=MathMin(15.0,paScore*0.40);

   bool emaReclaimAgainst=
      (opposite>0 && g_emaReclaimState=="RECLAIM_EMA21_UP") ||
      (opposite<0 && g_emaReclaimState=="LOSE_EMA21_DOWN");
   if(emaReclaimAgainst)
      score+=10.0;

   MqlTick tick;
   if(SymbolInfoTick(_Symbol,tick))
   {
      double price=(tick.bid+tick.ask)*0.5;
      double atrPrice=MathMax(_Point*10.0,AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point);
      bool oppositeOb=opposite>0
         ? PriceInsideOrNearZone(price,g_bullishOrderBlockLow,g_bullishOrderBlockHigh,atrPrice*0.12)
         : PriceInsideOrNearZone(price,g_bearishOrderBlockLow,g_bearishOrderBlockHigh,atrPrice*0.12);
      if(oppositeOb)
         score+=8.0;
   }

   bool oppositeFib=
      (g_fibM5Direction==opposite && g_fibM5Retracement>=0.382 && g_fibM5Retracement<=0.786) ||
      (g_fibM15Direction==opposite && g_fibM15Retracement>=0.382 && g_fibM15Retracement<=0.786);
   if(oppositeFib)
      score+=7.0;

   if(g_antiChaseActive && g_antiChaseDirection==primaryDirection)
      score+=9.0;

   score=MathMax(0.0,MathMin(100.0,score));
   if(score>=75.0)
      reasonOut="STRUCTURE_EMA_PRICE_ACTION";
   else if(score>=65.0)
      reasonOut=paName!="NONE" ? paName : "REVERSAL_CONFIRMED";
   else if(score>=52.0)
      reasonOut="REVERSAL_BUILDING";
   else
      reasonOut="PRIMARY_STRUCTURE_HOLDING";
   return score;
}

bool SendRescueOrder(int direction,double requestedVolume)
{
   if(!AccountSupportsHedging() ||
      TradePermissionStatus()!="OK" ||
      !OpenTradingAllowedForDirection(direction) ||
      g_spreadStatus=="EXTREME")
      return false;

   double volume=NormalizeRescueVolume(requestedVolume);
   if(volume<=0.0 || !CanSendOrder())
      return false;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return false;

   MqlTradeRequest request={};
   MqlTradeResult result={};
   request.action=TRADE_ACTION_DEAL;
   request.magic=RescueMagic();
   request.symbol=_Symbol;
   request.volume=volume;
   request.deviation=30;
   request.type_filling=AllowedFillingMode();
   request.comment="SCNRescue";
   request.type=direction>0 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   request.price=direction>0 ? tick.ask : tick.bid;
   request.sl=DynamicInitialStopPrice(direction,request.price);
   request.tp=0.0;

   ResetLastError();
   if(!OrderSend(request,result) || !TradeResultAccepted(result))
   {
      g_lastOrderError=GetLastError();
      g_lastOrderRetcode=(long)result.retcode;
      g_lastOrderAt=TimeCurrent();
      return false;
   }

   RegisterOrderRequest();
   g_lastRescueOrderAt=TimeCurrent();
   g_executionStatus="RESCUE_HEDGE_OPENED";
   return true;
}

bool ClosePositionVolumeByTicket(ulong ticket,double requestedVolume,string comment)
{
   if(ticket==0 || !PositionSelectByTicket(ticket))
      return false;

   string symbol=PositionGetString(POSITION_SYMBOL);
   double currentVolume=PositionGetDouble(POSITION_VOLUME);
   long positionType=PositionGetInteger(POSITION_TYPE);
   long magic=PositionGetInteger(POSITION_MAGIC);
   double minVolume=SymbolInfoDouble(symbol,SYMBOL_VOLUME_MIN);
   double step=SymbolInfoDouble(symbol,SYMBOL_VOLUME_STEP);

   double volume=MathMin(currentVolume,requestedVolume);
   if(step>0.0)
      volume=MathFloor((volume+1e-12)/step)*step;
   volume=NormalizeDouble(volume,8);
   if(volume<minVolume-1e-12)
      return false;

   MqlTick tick;
   if(!SymbolInfoTick(symbol,tick))
      return false;

   MqlTradeRequest request={};
   MqlTradeResult result={};
   request.action=TRADE_ACTION_DEAL;
   request.position=ticket;
   request.magic=magic;
   request.symbol=symbol;
   request.volume=volume;
   request.deviation=30;
   request.type_filling=AllowedFillingMode();
   request.comment=comment;
   if(positionType==POSITION_TYPE_BUY)
   {
      request.type=ORDER_TYPE_SELL;
      request.price=tick.bid;
   }
   else
   {
      request.type=ORDER_TYPE_BUY;
      request.price=tick.ask;
   }

   ResetLastError();
   if(!OrderSend(request,result))
      return false;
   return TradeResultAccepted(result);
}

bool CloseRescuePositions()
{
   bool allClosed=true;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=RescueMagic())
         continue;
      if(!ClosePositionVolumeByTicket(
         ticket,
         PositionGetDouble(POSITION_VOLUME),
         "SCNRescueClose"
      ))
         allClosed=false;
   }
   return allClosed && RescuePositionCount()==0;
}

bool ReduceRescueVolume(double requestedVolume)
{
   double remaining=requestedVolume;
   double minVolume=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN);
   for(int i=PositionsTotal()-1;i>=0 && remaining>=minVolume-1e-12;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=RescueMagic())
         continue;
      double volume=PositionGetDouble(POSITION_VOLUME);
      double closeVolume=MathMin(volume,remaining);
      if(ClosePositionVolumeByTicket(ticket,closeVolume,"SCNRescueTrim"))
         remaining-=closeVolume;
   }
   return remaining<minVolume;
}

double WorstPrimaryLossAbs()
{
   double worst=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic)
         continue;
      double pnl=PositionGetDouble(POSITION_PROFIT)+PositionGetDouble(POSITION_SWAP);
      if(pnl<worst)
         worst=pnl;
   }
   return MathAbs(MathMin(0.0,worst));
}

bool PartialCloseWorstPrimary()
{
   ulong worstTicket=0;
   double worstProfit=0.0;
   double worstVolume=0.0;
   int primaryCount=BasketPositionCount();

   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic)
         continue;
      double pnl=PositionGetDouble(POSITION_PROFIT)+PositionGetDouble(POSITION_SWAP);
      if(worstTicket==0 || pnl<worstProfit)
      {
         worstTicket=ticket;
         worstProfit=pnl;
         worstVolume=PositionGetDouble(POSITION_VOLUME);
      }
   }

   if(worstTicket==0 || worstProfit>=0.0)
      return false;

   double minVolume=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN);
   double closeVolume=0.0;
   if(worstVolume>=minVolume*2.0-1e-12)
      closeVolume=worstVolume*0.50;
   else if(primaryCount>1)
      closeVolume=worstVolume;
   else
      return false;

   if(ClosePositionVolumeByTicket(worstTicket,closeVolume,"SCNRecoveryPartial"))
   {
      g_rescuePartialCloseCount++;
      SaveRescueState();
      return true;
   }
   return false;
}

void UpdateRescueExposure()
{
   int direction=BasketDirection();
   if(direction==0)
      direction=g_rescuePrimaryDirection;
   g_rescuePrimaryDirection=direction;
   g_rescueHedgeDirection=direction==0 ? 0 : -direction;
   g_rescuePrimaryVolume=direction==0 ? 0.0 : VolumeForMagic(InpMagic,direction);
   g_rescueHedgeLot=g_rescueHedgeDirection==0 ? 0.0 : VolumeForMagic(RescueMagic(),g_rescueHedgeDirection);
   g_rescueNetExposure=
      direction*g_rescuePrimaryVolume +
      g_rescueHedgeDirection*g_rescueHedgeLot;
   g_rescuePrimaryProfit=BasketCycleProfit();
   g_rescueHedgeProfit=g_rescueRealizedProfit+RescueProfit();
   g_rescueCombinedProfit=g_rescuePrimaryProfit+g_rescueHedgeProfit;
   g_rescueOldestAgeSeconds=OldestPrimaryPositionAgeSeconds();

   g_rescueRecoveryPrice=0.0;
   MqlTick tick;
   double tickSize=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
   double tickValue=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_VALUE);
   if(tickValue<=0.0)
      tickValue=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_VALUE_PROFIT);
   if(SymbolInfoTick(_Symbol,tick) &&
      MathAbs(g_rescueNetExposure)>1e-8 &&
      tickSize>0.0 && tickValue>0.0)
   {
      double currentPrice=(tick.bid+tick.ask)*0.5;
      double moneyNeeded=MathMax(0.0,g_rescueTargetMoney-g_rescueCombinedProfit);
      double moneyPerPrice=
         MathAbs(g_rescueNetExposure)*tickValue/tickSize;
      if(moneyPerPrice>0.0)
      {
         double priceMove=moneyNeeded/moneyPerPrice;
         g_rescueRecoveryPrice=NormalizeDouble(
            currentPrice+(g_rescueNetExposure>0.0 ? priceMove : -priceMove),
            SymbolDigitsNow()
         );
      }
   }
}

double RescueDesiredHedgeRatio()
{
   double maxRatio=MathMax(0.20,MathMin(0.85,InpRescueMaxHedgeRatio));
   double normalized=MathMax(0.0,MathMin(1.0,(g_rescueReversalScore-60.0)/40.0));
   double ratio=0.30+normalized*(maxRatio-0.30);
   return MathMax(0.0,MathMin(maxRatio,ratio));
}

void AdjustRescueHedge()
{
   if(g_rescuePrimaryDirection==0 || g_rescuePrimaryVolume<=0.0)
      return;

   datetime now=TimeCurrent();
   // Do not rebalance every few ticks in a sideways market. Spread/commission
   // from Hedge churn can be more expensive than the protection itself.
   if(g_lastRescueOrderAt>0 && now-g_lastRescueOrderAt<60)
      return;

   double ratio=RescueDesiredHedgeRatio();
   double desired=g_rescuePrimaryVolume*ratio;
   double current=VolumeForMagic(RescueMagic(),-g_rescuePrimaryDirection);
   double minVolume=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN);

   if(current+minVolume*0.50<desired)
   {
      double add=NormalizeRescueVolume(desired-current);
      if(add>0.0 && SendRescueOrder(-g_rescuePrimaryDirection,add))
      {
         g_rescueHedgeLockedUntil=now+120;
         g_rescueLastAdjustedScore=g_rescueReversalScore;
      }
   }
   else if(current>desired+minVolume*0.75)
   {
      // Never trim a freshly opened Hedge on a one-minute noise reversal.
      if(now<g_rescueHedgeLockedUntil)
         return;

      double trim=NormalizeRescueVolume(current-desired);
      if(trim>0.0 && ReduceRescueVolume(trim))
      {
         g_lastRescueOrderAt=now;
         g_rescueLastAdjustedScore=g_rescueReversalScore;
      }
   }
}

bool CloseRecoveryCycle(string reason)
{
   g_rescueState=RESCUE_EXIT;
   g_executionStatus="RESCUE_EXIT";
   SaveRescueState();

   bool primaryClosed=CloseAllBasket(reason);
   bool hedgeClosed=CloseRescuePositions();
   if(primaryClosed && hedgeClosed)
   {
      ResetRescueState();
      g_executionStatus="RESCUE_CYCLE_CLOSED";
      return true;
   }
   return false;
}

bool ManageAdaptiveRescue()
{
   if(!g_rescueEnabled)
      return false;

   datetime now=TimeCurrent();
   if(g_lastRescueEvaluationAt>0 && now-g_lastRescueEvaluationAt<2)
      return g_rescueState!=RESCUE_NORMAL;
   g_lastRescueEvaluationAt=now;

   int primaryCount=BasketPositionCount();
   int rescueCount=RescuePositionCount();

   if(primaryCount<=0)
   {
      if(rescueCount>0)
      {
         g_rescueState=RESCUE_EXIT;
         g_executionStatus="RESCUE_EXIT";
         CloseRescuePositions();
         return true;
      }
      if(g_rescueState!=RESCUE_NORMAL || g_rescueRealizedProfit!=0.0)
         ResetRescueState();
      return false;
   }

   UpdateRescueExposure();
   int direction=g_rescuePrimaryDirection;
   if(direction==0)
      return false;

   string reversalReason="NONE";
   g_rescueReversalScore=RescueReversalScore(direction,reversalReason);
   g_rescueReversalReason=reversalReason;

   long timeLimit=RescueTimeThresholdSeconds();
   bool timeRescue=g_rescueOldestAgeSeconds>=timeLimit && g_rescueCombinedProfit<0.0;

   bool reversalCandidate =
      g_rescueReversalScore>=70.0 ||
      (timeRescue && g_rescueReversalScore>=58.0);
   if(reversalCandidate)
   {
      if(g_rescueReversalCandidateSince==0)
         g_rescueReversalCandidateSince=now;
   }
   else
      g_rescueReversalCandidateSince=0;

   long confirmationSeconds=timeRescue ? 15 : 25;
   g_rescueReversalConfirmed=
      g_rescueReversalCandidateSince>0 &&
      now-g_rescueReversalCandidateSince>=confirmationSeconds;

   double rescueThreshold=RescueThresholdMoney();
   double warningThreshold=MathMax(0.50,rescueThreshold*0.55);
   bool lossWarning=g_rescueCombinedProfit<=-warningThreshold;
   bool rescueLoss=g_rescueCombinedProfit<=-rescueThreshold;
   bool severeLoss=false;
   if(g_maxBasketLoss>0.0 &&
      g_rescueCombinedProfit<=-g_maxBasketLoss*0.65)
   {
      rescueLoss=true;
      severeLoss=true;
   }

   // A normal pullback should not pause the Basket just because P/L is red.
   // WARNING requires evidence that the market is actually building a reversal,
   // a time-stalled trade, or a loss already approaching the user's hard limit.
   bool warningEvidence=
      g_rescueReversalScore>=40.0 ||
      timeRescue ||
      severeLoss;

   if(g_rescueState==RESCUE_NORMAL &&
      ((lossWarning && warningEvidence) ||
       (timeRescue && g_rescueCombinedProfit<0.0)))
   {
      g_rescueState=RESCUE_WARNING;
      g_rescueWarningAt=now;
      g_executionStatus="RESCUE_WARNING";
      SaveRescueState();
   }

   if(g_rescueState==RESCUE_WARNING)
   {
      g_burstActive=false;
      g_burstNeedsRearm=false;

      if((g_rescueCombinedProfit>=0.0 && rescueCount==0) ||
         (!timeRescue && !severeLoss &&
          g_rescueReversalScore<35.0 &&
          g_rescueCombinedProfit>-rescueThreshold))
      {
         ResetRescueState();
         return false;
      }

      if(g_rescueReversalConfirmed && (rescueLoss || timeRescue))
      {
         g_rescueState=RESCUE_ACTIVE;
         g_rescueStartedAt=now;
         g_rescueHedgeLockedUntil=now+120;
         g_rescuePrimaryRecoverySince=0;
         g_rescueLastAdjustedScore=g_rescueReversalScore;
         g_rescueTargetMoney=MathMax(
            0.20,
            CurrentSpreadCost(MathMax(SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN),g_lot))*0.50
         );
         g_rescueInitialDeficit=MathMax(
            g_rescueTargetMoney,
            g_rescueTargetMoney-g_rescueCombinedProfit
         );
         SaveRescueState();
      }
      else
      {
         g_executionStatus=timeRescue ? "TIME_RESCUE_WARNING" : "RESCUE_WARNING";
         return true;
      }
   }

   if(g_rescueState==RESCUE_ACTIVE || g_rescueState==RESCUE_RECOVERY)
   {
      g_burstActive=false;
      g_burstNeedsRearm=false;

      if(g_rescueState==RESCUE_ACTIVE && g_rescueReversalConfirmed)
      {
         if(RescueHedgeGranularityAvailable())
            AdjustRescueHedge();
         else
         {
            // Netting accounts or very small positions cannot create a
            // fractional opposite Hedge. Fall back to controlled exposure
            // reduction rather than over-hedging beyond the configured ratio.
            g_rescueState=RESCUE_RECOVERY;
            g_rescueReversalReason=AccountSupportsHedging()
               ? "RECOVERY_NO_HEDGE_GRANULARITY"
               : "RECOVERY_NETTING_ACCOUNT";

            if(now-g_lastRescueOrderAt>=60 &&
               g_rescueReversalScore>=70.0)
            {
               if(PartialCloseWorstPrimary())
                  g_lastRescueOrderAt=now;
               else if(timeRescue && g_rescueReversalScore>=82.0)
               {
                  CloseRecoveryCycle("RESCUE_CONTROLLED_EXIT");
                  return true;
               }
            }
            SaveRescueState();
         }
      }

      UpdateRescueExposure();

      double currentDeficit=MathMax(0.0,g_rescueTargetMoney-g_rescueCombinedProfit);
      g_rescueRequiredMoney=currentDeficit;
      g_rescueRecoveredMoney=MathMax(0.0,g_rescueInitialDeficit-currentDeficit);

      if(g_rescueCombinedProfit>=g_rescueTargetMoney)
      {
         CloseRecoveryCycle("RESCUE_RECOVERY_EXIT");
         return true;
      }

      if(g_rescueInitialDeficit>0.0 &&
         currentDeficit<=g_rescueInitialDeficit*0.35)
      {
         g_rescueState=RESCUE_RECOVERY;
         SaveRescueState();
      }

      // Original-structure recovery must persist before unwinding a Hedge.
      // This hysteresis prevents Hedge -> close -> Hedge loops in chop.
      bool primaryRecoveryCandidate =
         g_rescueReversalScore<35.0 &&
         g_rescueCombinedProfit>-warningThreshold;
      if(primaryRecoveryCandidate)
      {
         if(g_rescuePrimaryRecoverySince==0)
            g_rescuePrimaryRecoverySince=now;
      }
      else
         g_rescuePrimaryRecoverySince=0;

      if(g_rescuePrimaryRecoverySince>0 &&
         now-g_rescuePrimaryRecoverySince>=60 &&
         now>=g_rescueHedgeLockedUntil)
      {
         CloseRescuePositions();
         if(RescuePositionCount()==0)
         {
            g_rescueState=RESCUE_WARNING;
            g_rescueReversalReason="PRIMARY_STRUCTURE_RECOVERED_STABLE";
            g_rescueReversalCandidateSince=0;
            g_rescuePrimaryRecoverySince=0;
            SaveRescueState();
         }
      }

      // Partial close is funded by Rescue profit and never increases lot.
      double hedgeAvailable=MathMax(0.0,g_rescueHedgeProfit);
      double worstLoss=WorstPrimaryLossAbs();
      if(worstLoss>0.0 &&
         hedgeAvailable>=worstLoss*0.70 &&
         g_rescueCombinedProfit>-g_rescueInitialDeficit*0.70 &&
         g_rescuePartialCloseCount<MathMax(1,g_maxPositions/2))
      {
         PartialCloseWorstPrimary();
         UpdateRescueExposure();
         if(g_rescueState==RESCUE_ACTIVE)
            AdjustRescueHedge();
      }

      g_executionStatus=g_rescueState==RESCUE_RECOVERY
         ? "RESCUE_RECOVERY"
         : "RESCUE_ACTIVE";
      SaveRescueState();
      return true;
   }

   return g_rescueState!=RESCUE_NORMAL;
}

bool TerminalConnectedNow()
{
   return TerminalInfoInteger(TERMINAL_CONNECTED) != 0;
}

bool TerminalTradeAllowedNow()
{
   return TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) != 0;
}

bool EaTradeAllowedNow()
{
   return MQLInfoInteger(MQL_TRADE_ALLOWED) != 0;
}

bool AccountTradeAllowedNow()
{
   return AccountInfoInteger(ACCOUNT_TRADE_ALLOWED) != 0;
}

bool AccountExpertAllowedNow()
{
   return AccountInfoInteger(ACCOUNT_TRADE_EXPERT) != 0;
}

int SymbolTradeModeNow()
{
   return (int)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_MODE);
}

string TradePermissionStatus()
{
   if(!TerminalConnectedNow()) return "TERMINAL_DISCONNECTED";
   if(!TerminalTradeAllowedNow()) return "ALGO_TRADING_OFF";
   if(!EaTradeAllowedNow()) return "EA_TRADING_DISABLED";
   if(!AccountTradeAllowedNow()) return "ACCOUNT_TRADING_DISABLED";
   if(!AccountExpertAllowedNow()) return "ACCOUNT_EXPERT_DISABLED";

   int mode = SymbolTradeModeNow();
   if(mode == SYMBOL_TRADE_MODE_DISABLED || mode == SYMBOL_TRADE_MODE_CLOSEONLY)
      return "SYMBOL_TRADING_DISABLED";

   return "OK";
}

bool OpenTradingAllowedForDirection(int direction)
{
   int mode = SymbolTradeModeNow();
   if(mode == SYMBOL_TRADE_MODE_FULL) return true;
   if(mode == SYMBOL_TRADE_MODE_LONGONLY) return direction > 0;
   if(mode == SYMBOL_TRADE_MODE_SHORTONLY) return direction < 0;
   return false;
}

string RetcodeExecutionStatus(long retcode)
{
   if(retcode == TRADE_RETCODE_MARKET_CLOSED) return "MARKET_CLOSED";
   if(retcode == TRADE_RETCODE_TRADE_DISABLED) return "TRADE_DISABLED";
   if(retcode == TRADE_RETCODE_CLIENT_DISABLES_AT) return "ALGO_TRADING_OFF";
   if(retcode == TRADE_RETCODE_SERVER_DISABLES_AT) return "SERVER_ALGO_DISABLED";
   if(retcode == TRADE_RETCODE_NO_MONEY) return "NO_MONEY";
   if(retcode == TRADE_RETCODE_TOO_MANY_REQUESTS) return "BROKER_RATE_LIMIT";
   if(retcode == TRADE_RETCODE_INVALID_VOLUME) return "INVALID_VOLUME";
   if(retcode == TRADE_RETCODE_PRICE_OFF) return "NO_PRICE";
   if(retcode == TRADE_RETCODE_PRICE_CHANGED || retcode == TRADE_RETCODE_REQUOTE) return "PRICE_CHANGED";
   return "ORDER_REJECTED";
}

void RecordExecutionQuality(bool accepted, double slippagePoints)
{
   g_executionAttempts++;
   if(accepted) g_executionAccepted++;
   if(accepted && slippagePoints >= 0.0)
   {
      if(g_executionAccepted <= 1) g_averageSlippagePoints = slippagePoints;
      else g_averageSlippagePoints = g_averageSlippagePoints * 0.85 + slippagePoints * 0.15;
   }

   double successRate = g_executionAttempts > 0
      ? (double)g_executionAccepted / g_executionAttempts
      : 1.0;
   double referenceSpread = MathMax(1.0, g_spreadMedian > 0.0 ? g_spreadMedian : CurrentSpreadPoints());
   double slippagePenalty = MathMin(30.0, g_averageSlippagePoints / referenceSpread * 30.0);
   g_executionQuality = MathMax(0.0, MathMin(100.0, successRate * 100.0 - slippagePenalty));

   // Keep the rolling profile responsive and prevent very old incidents from
   // dominating execution quality forever.
   if(g_executionAttempts >= 100)
   {
      g_executionAttempts = MathMax(1, g_executionAttempts / 2);
      g_executionAccepted = MathMin(g_executionAttempts, g_executionAccepted / 2);
   }
}

double DynamicInitialStopPrice(int direction, double entryPrice)
{
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   double atrPoints = g_atrPoints > 0.0 ? g_atrPoints : AverageTrueRangePoints(PERIOD_M15, g_atrPeriod);
   double atrPrice = MathMax(_Point * 10.0, atrPoints * _Point);
   double baseDistance = MathMax(1.0, EffectiveStopLossDistancePoints()) * _Point;
   double baseStop = direction > 0 ? entryPrice - baseDistance : entryPrice + baseDistance;

   double structure = 0.0;
   if(direction > 0)
   {
      structure = ClosestBelow(entryPrice, g_nearestSupport, g_bullishOrderBlockLow, g_majorSupport);
      if(structure > 0.0)
      {
         double structuralStop = structure - atrPrice * 0.12;
         if(structuralStop > baseStop && structuralStop < entryPrice)
            baseStop = structuralStop;
      }
   }
   else
   {
      structure = ClosestAbove(entryPrice, g_nearestResistance, g_bearishOrderBlockHigh, g_majorResistance);
      if(structure > 0.0)
      {
         double structuralStop = structure + atrPrice * 0.12;
         if(structuralStop < baseStop && structuralStop > entryPrice)
            baseStop = structuralStop;
      }
   }

   // Structural intelligence may tighten risk, but never inside the Broker's
   // legal Stops Level. This prevents Dynamic SL from turning into an order
   // rejection / hidden entry blocker.
   double minStopPoints = MathMax(
      (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL),
      0.0
   ) + 2.0;
   if(direction > 0)
      baseStop = MathMin(baseStop, entryPrice - minStopPoints * _Point);
   else
      baseStop = MathMax(baseStop, entryPrice + minStopPoints * _Point);

   return NormalizeDouble(baseStop, digits);
}

double DynamicTakeProfitPrice(int direction, double entryPrice, double stopPrice)
{
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   double atrPoints = g_atrPoints > 0.0 ? g_atrPoints : AverageTrueRangePoints(PERIOD_M15, g_atrPeriod);
   double atrPrice = MathMax(_Point * 10.0, atrPoints * _Point);
   double riskDistance = MathMax(atrPrice * 0.45, MathAbs(entryPrice - stopPrice));

   double rewardMultiple = g_entryQuality == "A" ? 1.85 :
                           g_entryQuality == "B" ? 1.55 : 1.30;
   if(g_marketRegimeDetail == "NEWS_IMPULSE")
      rewardMultiple = MathMax(rewardMultiple, 2.10);
   else if(g_marketRegimeDetail == "TREND_ACCELERATION")
      rewardMultiple = MathMax(rewardMultiple, 1.90);

   double target = direction > 0
      ? entryPrice + riskDistance * rewardMultiple
      : entryPrice - riskDistance * rewardMultiple;

   double opposing = direction > 0 ? g_nearestResistance : g_nearestSupport;
   if(direction > 0 && opposing > entryPrice + atrPrice * 0.55)
   {
      double levelTarget = opposing - atrPrice * 0.06;
      if(levelTarget > entryPrice + riskDistance * 0.80 &&
         (g_entryQuality != "A" || levelTarget <= target))
         target = levelTarget;
   }
   else if(direction < 0 && opposing > 0.0 && opposing < entryPrice - atrPrice * 0.55)
   {
      double levelTarget = opposing + atrPrice * 0.06;
      if(levelTarget < entryPrice - riskDistance * 0.80 &&
         (g_entryQuality != "A" || levelTarget >= target))
         target = levelTarget;
   }

   // A-grade trend/news setups may target the 127.2 Fib extension when it is
   // beyond the nearby reaction target but still within a sane R multiple.
   if(g_entryQuality == "A" && g_fibDirection == direction &&
      g_fibSwingHigh > g_fibSwingLow)
   {
      double range = g_fibSwingHigh - g_fibSwingLow;
      double extension = direction > 0
         ? g_fibSwingHigh + range * 0.272
         : g_fibSwingLow - range * 0.272;
      if(direction > 0 && extension > target &&
         extension <= entryPrice + riskDistance * 2.60)
         target = extension;
      else if(direction < 0 && extension < target &&
              extension >= entryPrice - riskDistance * 2.60)
         target = extension;
   }

   return NormalizeDouble(target, digits);
}

bool ModifyPositionProtection(ulong ticket, double sl, double tp)
{
   if(ticket == 0 || !PositionSelectByTicket(ticket))
      return false;

   MqlTradeRequest request = {};
   MqlTradeResult result = {};
   request.action = TRADE_ACTION_SLTP;
   request.position = ticket;
   request.magic = InpMagic;
   request.symbol = PositionGetString(POSITION_SYMBOL);
   request.sl = sl;
   request.tp = tp;

   ResetLastError();
   if(!OrderSend(request, result))
      return false;
   return TradeResultAccepted(result);
}

void ManageDynamicProtection()
{
   datetime now = TimeCurrent();
   if(g_lastDynamicProtectionAt > 0 && now - g_lastDynamicProtectionAt < 2)
      return;
   g_lastDynamicProtectionAt = now;

   int count = BasketPositionCount();
   if(count <= 0)
      return;

   g_atrPoints = AverageTrueRangePoints(PERIOD_M15, g_atrPeriod);
   double atr = MathMax(10.0, g_atrPoints);
   double minStopPoints = MathMax(
      (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL),
      (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_FREEZE_LEVEL)
   ) + 2.0;

   int basketDirection = BasketDirection();
   double anchorPrice = BasketAnchorEntryPrice(basketDirection);
   if(anchorPrice > 0.0 && basketDirection != 0)
   {
      double basketStop = DynamicInitialStopPrice(basketDirection, anchorPrice);
      g_dynamicStopPrice = basketStop;
      g_dynamicTakeProfitPrice = DynamicTakeProfitPrice(basketDirection, anchorPrice, basketStop);
   }

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
      return;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol ||
         PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;

      long type = PositionGetInteger(POSITION_TYPE);
      int direction = type == POSITION_TYPE_BUY ? 1 : -1;
      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double currentSL = PositionGetDouble(POSITION_SL);
      double currentTP = PositionGetDouble(POSITION_TP);
      double marketPrice = direction > 0 ? tick.bid : tick.ask;
      double profitPoints = direction > 0
         ? (marketPrice - openPrice) / _Point
         : (openPrice - marketPrice) / _Point;

      double desiredSL = currentSL;
      if(profitPoints >= atr * 0.55)
      {
         double breakEven = direction > 0
            ? openPrice + atr * 0.04 * _Point
            : openPrice - atr * 0.04 * _Point;
         if(direction > 0)
            desiredSL = currentSL <= 0.0 ? breakEven : MathMax(currentSL, breakEven);
         else
            desiredSL = currentSL <= 0.0 ? breakEven : MathMin(currentSL, breakEven);
      }

      if(profitPoints >= atr * 1.10)
      {
         double trail = direction > 0
            ? marketPrice - atr * 0.55 * _Point
            : marketPrice + atr * 0.55 * _Point;
         if(direction > 0)
            desiredSL = desiredSL <= 0.0 ? trail : MathMax(desiredSL, trail);
         else
            desiredSL = desiredSL <= 0.0 ? trail : MathMin(desiredSL, trail);
      }

      // EMA Dynamic Trailing: once profit is established, EMA21/50 becomes a
      // structural trailing reference. It only tightens SL; it never widens it.
      if(profitPoints >= atr * 0.70)
      {
         double emaRef = EmaTrailReference(direction);
         if(emaRef > 0.0)
         {
            double emaTrail = direction > 0
               ? emaRef - atr * 0.10 * _Point
               : emaRef + atr * 0.10 * _Point;

            if(direction > 0 && emaTrail > openPrice && emaTrail < marketPrice)
               desiredSL = desiredSL <= 0.0 ? emaTrail : MathMax(desiredSL,emaTrail);
            else if(direction < 0 && emaTrail < openPrice && emaTrail > marketPrice)
               desiredSL = desiredSL <= 0.0 ? emaTrail : MathMin(desiredSL,emaTrail);
         }
      }

      int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
      if(direction > 0 && desiredSL > 0.0)
         desiredSL = MathMin(desiredSL, tick.bid - minStopPoints * _Point);
      else if(direction < 0 && desiredSL > 0.0)
         desiredSL = MathMax(desiredSL, tick.ask + minStopPoints * _Point);
      desiredSL = desiredSL > 0.0 ? NormalizeDouble(desiredSL, digits) : 0.0;

      // Only Auto owns a system-generated Broker TP. Manual follows the money
      // target selected by the user and Off leaves profit exits disabled.
      double desiredTP = currentTP;
      if(g_profitTargetMode == "AUTO" &&
         count == 1 &&
         g_perPositionProfit <= 0.0 &&
         g_basketProfitTarget <= 0.0)
      {
         double baseStop = desiredSL > 0.0
            ? desiredSL
            : DynamicInitialStopPrice(direction, openPrice);
         desiredTP = DynamicTakeProfitPrice(direction, openPrice, baseStop);
         if(direction > 0)
            desiredTP = MathMax(desiredTP, tick.ask + minStopPoints * _Point);
         else
            desiredTP = MathMin(desiredTP, tick.bid - minStopPoints * _Point);
         desiredTP = NormalizeDouble(desiredTP, digits);
      }

      bool slChanged = desiredSL > 0.0 &&
         (currentSL <= 0.0 || MathAbs(desiredSL - currentSL) >= _Point * 2.0);
      bool clearSystemTP = g_profitTargetMode != "AUTO" && currentTP > 0.0;
      if(clearSystemTP)
         desiredTP = 0.0;
      bool tpChanged = clearSystemTP ||
         (desiredTP > 0.0 &&
          (currentTP <= 0.0 || MathAbs(desiredTP - currentTP) >= _Point * 4.0));

      if(slChanged || tpChanged)
         ModifyPositionProtection(ticket, slChanged ? desiredSL : currentSL, tpChanged ? desiredTP : currentTP);
   }
}

string ProfitControlModeName()
{
   if(g_profitTargetMode == "AUTO")
      return "AUTO_SMART";
   if(g_profitTargetMode == "OFF")
      return "OFF";
   if(g_perPositionProfit > 0.0)
      return "MANUAL_PER_POSITION";
   if(g_basketProfitTarget > 0.0 && g_profitRunTrailPercent > 0.0)
      return "MANUAL_BASKET_RUN_ON";
   if(g_basketProfitTarget > 0.0)
      return "MANUAL_BASKET_FIXED";
   return "MANUAL_NONE";
}

bool SendMarketOrder(int direction)
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
   {
      g_lastOrderError = GetLastError();
      g_lastOrderRetcode = 0;
      g_lastOrderAt = TimeCurrent();
      g_executionStatus = "NO_TICK";
      return false;
   }

   MqlTradeRequest request = {};
   MqlTradeResult result = {};

   request.action = TRADE_ACTION_DEAL;
   request.magic = InpMagic;
   request.symbol = _Symbol;
   request.volume = g_adaptiveEngine ? g_adaptiveLot : NormalizeTradeVolume(g_lot);
   request.deviation = 30;
   request.type_filling = AllowedFillingMode();
   request.comment = "SaaSBasket";

   if(direction > 0)
   {
      request.type = ORDER_TYPE_BUY;
      request.price = tick.ask;
   }
   else
   {
      request.type = ORDER_TYPE_SELL;
      request.price = tick.bid;
   }

   double entryPrice = request.price;
   request.sl = DynamicInitialStopPrice(direction, entryPrice);
   if(g_profitTargetMode == "AUTO" &&
      request.sl > 0.0 &&
      !BasketFillEnabled() &&
      g_perPositionProfit <= 0.0 &&
      g_basketProfitTarget <= 0.0)
   {
      request.tp = DynamicTakeProfitPrice(direction, entryPrice, request.sl);
      double minTargetPoints = MathMax(
         (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL),
         0.0
      ) + 2.0;
      int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
      if(direction > 0)
         request.tp = NormalizeDouble(
            MathMax(request.tp, entryPrice + minTargetPoints * _Point),
            digits
         );
      else
         request.tp = NormalizeDouble(
            MathMin(request.tp, entryPrice - minTargetPoints * _Point),
            digits
         );
   }

   g_dynamicStopPrice = request.sl;
   g_dynamicTakeProfitPrice = request.tp > 0.0
      ? request.tp
      : DynamicTakeProfitPrice(direction, entryPrice, request.sl);

   g_adaptiveLot = request.volume;

   ResetLastError();
   if(!OrderSend(request, result))
   {
      RecordExecutionQuality(false, 0.0);
      g_lastOrderError = GetLastError();
      g_lastOrderRetcode = (long)result.retcode;
      g_lastOrderAt = TimeCurrent();
      g_executionStatus = RetcodeExecutionStatus((long)result.retcode);
      Print("OrderSend failed. error=", g_lastOrderError, " retcode=", result.retcode);
      return false;
   }

   g_lastOrderRetcode = (long)result.retcode;
   g_lastOrderError = GetLastError();
   g_lastOrderAt = TimeCurrent();

   if(!TradeResultAccepted(result))
   {
      RecordExecutionQuality(false, 0.0);
      g_executionStatus = RetcodeExecutionStatus((long)result.retcode);
      Print("Order rejected. retcode=", result.retcode, " comment=", result.comment);
      return false;
   }

   double fillPrice = result.price > 0.0 ? result.price : request.price;
   double slippagePoints = MathAbs(fillPrice - request.price) / _Point;
   RecordExecutionQuality(true, slippagePoints);
   g_lastEntryAt = TimeCurrent();
   g_executionStatus = "ORDER_ACCEPTED";
   return true;
}

bool ClosePositionByTicket(ulong ticket)
{
   if(ticket == 0 || !PositionSelectByTicket(ticket))
      return false;

   string symbol = PositionGetString(POSITION_SYMBOL);
   double volume = PositionGetDouble(POSITION_VOLUME);
   long positionType = PositionGetInteger(POSITION_TYPE);

   MqlTick tick;
   if(!SymbolInfoTick(symbol, tick))
      return false;

   MqlTradeRequest request = {};
   MqlTradeResult result = {};

   request.action = TRADE_ACTION_DEAL;
   request.position = ticket;
   request.magic = PositionGetInteger(POSITION_MAGIC);
   request.symbol = symbol;
   request.volume = NormalizeTradeVolume(volume);
   request.deviation = 30;
   request.type_filling = AllowedFillingMode();
   request.comment = "SaaSBasketClose";

   if(positionType == POSITION_TYPE_BUY)
   {
      request.type = ORDER_TYPE_SELL;
      request.price = tick.bid;
   }
   else
   {
      request.type = ORDER_TYPE_BUY;
      request.price = tick.ask;
   }

   if(!OrderSend(request, result))
   {
      Print("Close order failed. ticket=", ticket, " error=", GetLastError(), " retcode=", result.retcode);
      return false;
   }

   if(!TradeResultAccepted(result))
   {
      Print("Close rejected. ticket=", ticket, " retcode=", result.retcode, " comment=", result.comment);
      return false;
   }

   return true;
}

int CloseReasonCode(string reason)
{
   if(StringFind(reason, "DAILY_PROFIT") == 0) return CLOSE_REASON_DAILY_PROFIT;
   if(StringFind(reason, "DAILY_LOSS") == 0) return CLOSE_REASON_DAILY_LOSS;
   if(StringFind(reason, "MAX_BASKET_LOSS") == 0) return CLOSE_REASON_BASKET_LOSS;
   if(StringFind(reason, "PROFIT_RUN") == 0 ||
      StringFind(reason, "PROFIT_TRAIL") == 0 ||
      StringFind(reason, "BASKET_PROFIT") == 0 ||
      StringFind(reason, "SMART_PROFIT") == 0 ||
      StringFind(reason, "AUTO_PROFIT") == 0)
      return CLOSE_REASON_TRAIL;
   if(StringFind(reason, "SAFE_STOP") == 0) return CLOSE_REASON_SAFE_STOP;
   if(StringFind(reason, "REMOTE_CLOSE_ALL") == 0) return CLOSE_REASON_REMOTE;
   return CLOSE_REASON_NONE;
}

string CloseReasonText(int reasonCode)
{
   if(reasonCode == CLOSE_REASON_DAILY_PROFIT) return "DAILY_PROFIT_LOCK";
   if(reasonCode == CLOSE_REASON_DAILY_LOSS) return "DAILY_LOSS";
   if(reasonCode == CLOSE_REASON_BASKET_LOSS) return "MAX_BASKET_LOSS";
   if(reasonCode == CLOSE_REASON_TRAIL) return "PROFIT_TRAIL";
   if(reasonCode == CLOSE_REASON_SAFE_STOP) return "SAFE_STOP_BREAKEVEN";
   if(reasonCode == CLOSE_REASON_REMOTE) return "REMOTE_CLOSE_ALL";
   return "CLOSE_ALL";
}

string CloseCompletionStatus(int reasonCode)
{
   if(reasonCode == CLOSE_REASON_DAILY_PROFIT) return "DAILY_PROFIT_LOCK";
   if(reasonCode == CLOSE_REASON_DAILY_LOSS) return "DAILY_LOSS_LOCK";
   if(reasonCode == CLOSE_REASON_BASKET_LOSS) return "MAX_BASKET_LOSS";
   if(reasonCode == CLOSE_REASON_TRAIL) return "PROFIT_TRAIL";
   if(reasonCode == CLOSE_REASON_SAFE_STOP) return "SAFE_STOP";
   return "STOPPED";
}

void PersistPendingClose()
{
   GlobalVariableSet(DailyRiskStateKey("close"), (double)g_pendingCloseReason);
}

bool CloseAllBasket(string reason)
{
   Print("CloseAllBasket reason=", reason);
   int reasonCode = CloseReasonCode(reason);
   if(reasonCode != CLOSE_REASON_NONE)
   {
      g_pendingCloseReason = reasonCode;
      PersistPendingClose();
   }

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol ||
         !IsScenovaMagic(PositionGetInteger(POSITION_MAGIC)))
         continue;
      ClosePositionByTicket(ticket);
   }

   bool closed = BasketPositionCount() == 0 && RescuePositionCount() == 0;
   if(closed && reasonCode != CLOSE_REASON_NONE)
   {
      g_pendingCloseReason = CLOSE_REASON_NONE;
      PersistPendingClose();
   }
   return closed;
}

void ResetTrail()
{
   g_trailArmed = false;
   g_peakProfit = 0.0;
}

int RequiredMomentumTicks()
{
   return MathMin(128, MathMax(2, InpMomentumTicks));
}

void UpdateMomentum()
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
      return;

   double mid = (tick.bid + tick.ask) * 0.5;
   int maxTicks = RequiredMomentumTicks();

   if(g_tickCount < maxTicks)
   {
      g_ticks[g_tickCount] = mid;
      g_tickCount++;
   }
   else
   {
      for(int i = 1; i < maxTicks; i++)
         g_ticks[i - 1] = g_ticks[i];
      g_ticks[maxTicks - 1] = mid;
   }
}

double MomentumPoints()
{
   // Wait for the full configured window before trading. Previously two ticks
   // were enough after attach/restart, which could create a wrong-side micro
   // signal before the 20-tick window had actually formed.
   if(g_tickCount < RequiredMomentumTicks())
      return 0.0;
   return (g_ticks[g_tickCount - 1] - g_ticks[0]) / _Point;
}

void ResetDailyBaseline()
{
   MqlDateTime t;
   TimeToStruct(TimeCurrent(), t);
   g_dayKey = t.year * 1000 + t.day_of_year;
   g_dayStartEquity = AccountInfoDouble(ACCOUNT_EQUITY);
   PersistDailyRiskState();
   RecalculateDailyClosedProfit();
   LoadDailyProfitRunOnState();
   LoadDailyProfitLock();
}

string DailyRiskStateKey(string suffix)
{
   string loginId = StringFormat("%I64d", (long)AccountInfoInteger(ACCOUNT_LOGIN));
   string magicId = StringFormat("%I64d", InpMagic);
   int loginStart = StringLen(loginId) > 10 ? StringLen(loginId) - 10 : 0;
   int magicStart = StringLen(magicId) > 10 ? StringLen(magicId) - 10 : 0;
   return StringFormat(
      "SCN.R.%s.%s.%s.%s",
      StringSubstr(loginId, loginStart, 10),
      StringSubstr(magicId, magicStart, 10),
      StringSubstr(_Symbol, 0, 10),
      suffix
   );
}

void PersistDailyRiskState()
{
   GlobalVariableSet(DailyRiskStateKey("day"), (double)g_dayKey);
   GlobalVariableSet(DailyRiskStateKey("equity"), g_dayStartEquity);
}

void RestoreDailyRiskState()
{
   MqlDateTime t;
   TimeToStruct(TimeCurrent(), t);
   int today = t.year * 1000 + t.day_of_year;
   string dayKey = DailyRiskStateKey("day");
   string equityKey = DailyRiskStateKey("equity");

   if(GlobalVariableCheck(dayKey) && GlobalVariableCheck(equityKey) &&
      (int)GlobalVariableGet(dayKey) == today)
   {
      g_dayKey = today;
      g_dayStartEquity = GlobalVariableGet(equityKey);
      RecalculateDailyClosedProfit();
      LoadDailyProfitRunOnState();
      LoadDailyProfitLock();
   }
   else
   {
      ResetDailyBaseline();
   }

   string closeKey = DailyRiskStateKey("close");
   if(BasketPositionCount() > 0 && GlobalVariableCheck(closeKey))
   {
      int restoredReason = (int)GlobalVariableGet(closeKey);
      g_pendingCloseReason =
         (restoredReason >= CLOSE_REASON_DAILY_LOSS && restoredReason <= CLOSE_REASON_REMOTE)
         ? restoredReason
         : CLOSE_REASON_NONE;
   }
   else
   {
      g_pendingCloseReason = CLOSE_REASON_NONE;
      PersistPendingClose();
   }
}

void RefreshDailyBaselineIfNeeded()
{
   MqlDateTime t;
   TimeToStruct(TimeCurrent(), t);
   int key = t.year * 1000 + t.day_of_year;
   if(key != g_dayKey)
      ResetDailyBaseline();
}

string StateText()
{
   if(g_state == STATE_RUNNING) return "RUNNING";
   if(g_state == STATE_SAFE_STOP) return "SAFE_STOP";
   return "STOPPED";
}

string JsonString(string json, string key, string fallback)
{
   string marker = "\"" + key + "\":\"";
   int start = StringFind(json, marker);
   if(start < 0) return fallback;
   start += StringLen(marker);
   int end = StringFind(json, "\"", start);
   if(end < 0) return fallback;
   return StringSubstr(json, start, end - start);
}

double JsonNumber(string json, string key, double fallback)
{
   string marker = "\"" + key + "\":";
   int start = StringFind(json, marker);
   if(start < 0) return fallback;
   start += StringLen(marker);

   int end = start;
   int len = StringLen(json);
   while(end < len)
   {
      ushort c = StringGetCharacter(json, end);
      bool numeric = (c >= '0' && c <= '9') || c == '-' || c == '+' || c == '.' || c == 'e' || c == 'E';
      if(!numeric) break;
      end++;
   }

   if(end <= start) return fallback;
   return StringToDouble(StringSubstr(json, start, end - start));
}

bool JsonBool(string json, string key, bool fallback)
{
   string marker = "\"" + key + "\":";
   int start = StringFind(json, marker);
   if(start < 0) return fallback;
   start += StringLen(marker);
   string tail = StringSubstr(json, start, 5);
   if(StringFind(tail, "true") == 0) return true;
   if(StringFind(tail, "false") == 0) return false;
   return fallback;
}
