#property strict
#property version   "1.018"
#define SCENOVA_PRODUCT_VERSION "2.0.8"
#property description "MT5 SaaS Fast Basket Engine - Cloud/Local"
#property description "Use Demo and forward testing before live trading."

enum ENUM_ENTRY_MODE
{
   ENTRY_AUTO_MOMENTUM = 0,
   ENTRY_BUY_ONLY      = 1,
   ENTRY_SELL_ONLY     = 2
};

enum ENUM_TRADING_PROFILE
{
   PROFILE_SAFE       = 0,
   PROFILE_BALANCED   = 1,
   PROFILE_AGGRESSIVE = 2,
   PROFILE_BURST_10   = 3,
   // Keeps the full entry intelligence, but uses the user-configured Lot
   // directly and removes adaptive volume throttling. Max Positions and Broker
   // constraints remain authoritative.
   PROFILE_MAXIMUM    = 4
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

input string          InpApiBase              = "https://snvea-bot.online/backend";
input string          InpInstanceId           = "";
input string          InpInstallToken         = "";
input long            InpMagic                = 26090501;
input ENUM_TRADING_PROFILE InpTradingProfile  = PROFILE_BALANCED;

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
input int             InpConfidenceThreshold   = 70;
input int             InpSessionStartHour      = 0;
input int             InpSessionEndHour        = 24;
// 0 = fully adaptive. A positive value is only a soft volatility marker;
 // it never blocks trading by itself.
input double          InpMaxAtrPoints          = 0.0;

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
double g_perPositionLoss;
double g_manualStopLossPoints;
int    g_maxSpread;
int    g_minOrderIntervalMs;
int    g_maxOrdersPerMinute;
ENUM_ENTRY_MODE g_entryMode;
ENUM_TRADING_PROFILE g_tradingProfile;

bool   g_adaptiveEngine;
double g_riskPerOrderPercent;
bool   g_allowMinimumLotOverride;
double g_hardStopAtrMultiplier;
int    g_atrPeriod;
int    g_confidenceThreshold;
int    g_sessionStartHour;
int    g_sessionEndHour;
double g_maxAtrPoints;
string g_marketRegime = "INITIALIZING";
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
double g_bullishOrderBlockLow = 0.0;
double g_bullishOrderBlockHigh = 0.0;
double g_bearishOrderBlockLow = 0.0;
double g_bearishOrderBlockHigh = 0.0;
string g_orderBlockTimeframe = "NONE";
double g_fibSwingLow = 0.0;
double g_fibSwingHigh = 0.0;
datetime g_fibSwingLowTime = 0;
datetime g_fibSwingHighTime = 0;
int    g_fibDirection = 0;
double g_fibRetracement = 0.0;
double g_structureScore = 0.0;
double g_locationScore = 0.0;
double g_entryScore = 0.0;
string g_entryModel = "NONE";
datetime g_lastMarketContextUpdate = 0;
string g_fiboObjectName = "";
bool   g_fiboVisible = false;
double g_signalConfidence = 0.0;
double g_atrPoints = 0.0;
double g_atrRatio = 1.0;
double g_adaptiveLot = 0.0;
bool   g_minimumLotOverrideActive = false;
string g_adaptiveBlockReason = "";
string g_cachedAdaptiveBlockReason = "";
int    g_consecutiveLosses = 0;
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
string g_sessionProfile = "UNKNOWN";
bool   g_spreadProfileRestored = false;

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
   SetChartStatusText("VERSION", "EA v1.018", 137, 9, C'104,117,142');
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

int OnInit()
{
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

   // Two mutually-exclusive profit modes:
   // 1) Basket target, optionally followed by percentage giveback from peak.
   // 2) Per-position target, closing each Position independently.
   if(g_perPositionProfit > 0.0)
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
   g_tradingProfile = InpTradingProfile;
   g_adaptiveEngine = InpAdaptiveEngine;
   g_riskPerOrderPercent = MathMax(0.01, MathMin(5.0, InpRiskPerOrderPercent));
   g_allowMinimumLotOverride = InpAllowMinimumLotOverride;
   g_hardStopAtrMultiplier = MathMax(0.5, MathMin(10.0, InpHardStopAtrMultiplier));
   g_atrPeriod = MathMax(5, MathMin(100, InpAtrPeriod));
   g_confidenceThreshold = MathMax(40, MathMin(95, InpConfidenceThreshold));
   g_sessionStartHour = MathMax(0, MathMin(23, InpSessionStartHour));
   g_sessionEndHour = MathMax(1, MathMin(24, InpSessionEndHour));
   g_maxAtrPoints = MathMax(0.0, InpMaxAtrPoints);
   g_adaptiveMomentumThreshold = InpMomentumEntryPoints;
   g_adaptiveMaxPositions = g_maxPositions;
   g_adaptiveEntrySpacingMs = g_minOrderIntervalMs;

   RestoreDailyRiskState();
   RestoreAdaptiveRiskState();
   RestoreSpreadProfile();
   LoadBasketCycleState();
   ApplyTradingProfile();

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

   // A 200 ms timer drives the controlled Burst queue. Heartbeat still keeps
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
   ClearChartStatus();
}

void OnTick()
{
   UpdateMomentum();
   SampleSpread();
   RefreshDailyBaselineIfNeeded();

   if(g_access && g_lastSuccessfulHeartbeat > 0 &&
      TimeCurrent() - g_lastSuccessfulHeartbeat > InpMaxOfflineLeaseSeconds)
   {
      Print("SaaS lease expired while API is unreachable. Disabling new entries.");
      g_access = false;
      g_runAuthorized = false;
   }

   int count = BasketPositionCount();
   if(count > 0)
   {
      UpdateBasketPeakPositionCount(count);
      EnsureBurstTargets(g_burstActive ? MathMax(1, g_burstTargetPositions) : count);
   }
   else
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
      if(count > 0) CloseAllBasket("DAILY_LOSS");
      g_state = STATE_SAFE_STOP;
      g_runAuthorized = false;
      g_executionStatus = "DAILY_LOSS_LOCK";
      return;
   }

   if(count > 0)
   {
      // Per-position profit/loss controls are evaluated before basket-level
      // controls. Per-position profit and total Basket profit are mutually
      // exclusive settings, enforced by both Server and EA.
      bool closedIndividual = ManagePerPositionTargets();
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

      // Manual Basket target behaves the same in every profile, including Burst.
      // If no manual Basket/per-position profit target is configured, Burst falls
      // back to its automatic Cycle target.
      if(g_basketProfitTarget > 0.0 && g_perPositionProfit <= 0.0)
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
      else if(IsBurstProfile() &&
              g_perPositionProfit <= 0.0 &&
              effectiveBasketTarget > 0.0 &&
              cycleProfit >= effectiveBasketTarget)
      {
         CloseAllBasket("BASKET_PROFIT_TARGET");
         ResetTrail();
         g_executionStatus = "BASKET_PROFIT_TARGET";
         return;
      }

      double effectiveBasketLoss = EffectiveBasketLossLimit();
      double lossControlProfit = IsBurstProfile() ? cycleProfit : profit;
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

   string permissionStatus = TradePermissionStatus();
   if(permissionStatus != "OK")
   {
      g_executionStatus = permissionStatus;
      return;
   }

   if(IsBurstProfile() && g_burstActive)
   {
      ProcessBurstQueue();
      return;
   }

   if(IsBurstProfile() && count > 0)
   {
      g_executionStatus = g_burstTargetPositions > 0 && g_burstRequestsSent >= g_burstTargetPositions
         ? "BURST_COMPLETE"
         : "BURST_PARTIAL_MANAGING";
      return;
   }

   if(IsBurstProfile() && g_burstNeedsRearm)
   {
      double rearmThreshold = MathMax(2.0, g_adaptiveMomentumThreshold) * 0.35;
      if(MathAbs(momentum) <= rearmThreshold)
         g_burstNeedsRearm = false;
      else
      {
         g_executionStatus = "WAITING_BURST_REARM";
         return;
      }
   }

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

   if(count > 0 && !IsBurstProfile() && !AdaptiveBasketAddAllowed(direction))
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
   if(sent || IsBurstProfile())
   {
      RegisterOrderRequest();
      if(IsBurstProfile())
         ArmBurst(direction);
   }
}

void OnTimer()
{
   SampleSpread();

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

   if(symbol == _Symbol && magic == InpMagic)
   {
      RecordBasketDeal(trans.deal);
      RecalculateDailyClosedProfit();
      UpdateAdaptiveLossState(trans.deal);
      long dealEntry = HistoryDealGetInteger(trans.deal, DEAL_ENTRY);
      if(IsBurstProfile() &&
         (dealEntry == DEAL_ENTRY_OUT || dealEntry == DEAL_ENTRY_OUT_BY) &&
         BasketPositionCount() == 0)
      {
         g_burstActive = false;
         g_burstNeedsRearm = true;
         g_burstTargetPositions = 0;
         g_burstRequestsSent = 0;
         g_burstTargetMoney = 0.0;
         g_burstLossMoney = 0.0;
      }
      return;
   }

   if(InpPauseOnManualTrade &&
      symbol == _Symbol &&
      magic != InpMagic &&
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
      "{\"instanceId\":\"%s\",\"installToken\":\"%s\",\"state\":\"%s\",\"metrics\":{\"accountNumber\":\"%s\",\"eaVersion\":\"1.018\",\"productVersion\":\"%s\",\"symbol\":\"%s\",\"server\":\"%s\",\"currency\":\"%s\",\"balance\":%.2f,\"equity\":%.2f,\"basketProfit\":%.2f,\"basketCycleProfit\":%.2f,\"basketProfitTarget\":%.2f,\"basketPeakPositions\":%d,\"perPositionProfitTarget\":%.2f,\"profitRunTrailPercent\":%.2f,\"profitRunPeak\":%.2f,\"perPositionLoss\":%.2f,\"dailyProfit\":%.2f,\"dailyProfitTarget\":%.2f,\"dailyProfitContinueAfterTarget\":%s,\"dailyProfitDrawdownPercent\":%.2f,\"dailyProfitTargetArmed\":%s,\"dailyProfitGivebackFloor\":%.2f,\"dailyProfitLocked\":%s,\"peakProfit\":%.2f,\"positions\":%d,\"spreadPoints\":%.1f,\"spreadPrice\":%s,\"pointSize\":%s,\"symbolDigits\":%d,\"maxSpreadPrice\":%s,\"momentumPoints\":%.1f,\"momentumEntryPoints\":%.1f,\"maxSpreadPoints\":%d,\"terminalConnected\":%s,\"terminalTradeAllowed\":%s,\"mqlTradeAllowed\":%s,\"accountTradeAllowed\":%s,\"accountTradeExpert\":%s,\"tradeReady\":%s,\"symbolTradeMode\":%d,\"adaptiveEngine\":%s,\"marketRegime\":\"%s\",\"signalConfidence\":%.1f,\"adaptiveLot\":%.4f,\"atrPoints\":%.1f,\"adaptiveBlockReason\":\"%s\",\"consecutiveLosses\":%d,\"cooldownUntil\":%I64d,\"executionStatus\":\"%s\",\"lastOrderRetcode\":%I64d,\"lastOrderError\":%d,\"lastOrderAt\":%I64d}}",
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
         ",\"heartbeatAgeSeconds\":%d,\"heartbeatLatencyMs\":%I64d,\"heartbeatHttpStatus\":%d,\"lastServerContactAt\":%I64d,\"entryLeaseValid\":%s,\"positionManagementActive\":true,\"spreadSampleCount\":%d,\"spreadMedianPoints\":%.1f,\"spreadP90Points\":%.1f,\"spreadP95Points\":%.1f,\"spreadP99Points\":%.1f,\"adaptiveSpreadLimitPoints\":%.1f,\"adaptiveSpreadLimitPrice\":%s,\"spreadStatus\":\"%s\",\"spreadCost\":%.2f,\"adaptiveMomentumThreshold\":%.1f,\"adaptiveMaxPositions\":%d,\"adaptiveEntrySpacingMs\":%d,\"executionQuality\":%.1f,\"averageSlippagePoints\":%.1f,\"sessionProfile\":\"%s\",\"atrRatio\":%.3f,\"minimumLotOverrideEnabled\":%s,\"minimumLotOverrideActive\":%s,\"trendM5\":%d,\"trendM15\":%d,\"trendH1\":%d,\"entryBias\":\"%s\",\"pyramidProgressPoints\":%.1f,\"pyramidRequiredPoints\":%.1f,\"momentumSamples\":%d,\"momentumSamplesRequired\":%d,\"configuredLot\":%.4f,\"configuredMaxPositions\":%d,\"configuredBasketProfitTarget\":%.2f,\"effectiveBasketProfitTarget\":%.2f,\"configuredMaxBasketLoss\":%.2f,\"effectiveMaxBasketLoss\":%.2f,\"appliedPerPositionProfit\":%.2f,\"appliedPerPositionLoss\":%.2f,\"appliedProfitRunTrailPercent\":%.2f,\"manualStopLossPoints\":%.1f,\"hardStopAtrMultiplier\":%.3f,\"systemHardStopDistancePoints\":%.1f,\"hardStopDistancePoints\":%.1f,\"stopLossMode\":\"%s\",\"profitControlMode\":\"%s\"}}",
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
         ProfitControlModeName()
      );
      payload = StringSubstr(payload, 0, StringLen(payload) - 2) + diagnostics;
      string burstDiagnostics = StringFormat(
         ",\"tradingProfile\":\"%s\",\"burstActive\":%s,\"burstTargetPositions\":%d,\"burstRequestsSent\":%d,\"burstFilledPositions\":%d,\"burstTargetMoney\":%.2f,\"burstLossMoney\":%.2f,\"burstNeedsRearm\":%s}}",
         TradingProfileName(),
         g_burstActive ? "true" : "false",
         g_burstTargetPositions,
         g_burstRequestsSent,
         BasketPositionCount(),
         g_burstTargetMoney,
         g_burstLossMoney,
         g_burstNeedsRearm ? "true" : "false"
      );
      payload = StringSubstr(payload, 0, StringLen(payload) - 2) + burstDiagnostics;

      // Market-context telemetry makes every entry auditable on the web.
      string marketContextDiagnostics = StringFormat(
         ",\"trendM1\":%d,\"trendM30\":%d,\"nearestSupport\":%s,\"nearestResistance\":%s,\"majorSupport\":%s,\"majorResistance\":%s,\"bullishOrderBlockLow\":%s,\"bullishOrderBlockHigh\":%s,\"bearishOrderBlockLow\":%s,\"bearishOrderBlockHigh\":%s,\"orderBlockTimeframe\":\"%s\",\"fibSwingLow\":%s,\"fibSwingHigh\":%s,\"fibDirection\":%d,\"fibRetracement\":%.4f,\"structureScore\":%.1f,\"locationScore\":%.1f,\"entryScore\":%.1f,\"entryModel\":\"%s\",\"fiboVisible\":%s",
         g_trendM1,
         g_trendM30,
         DoubleToString(g_nearestSupport, SymbolDigitsNow()),
         DoubleToString(g_nearestResistance, SymbolDigitsNow()),
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
         g_structureScore,
         g_locationScore,
         g_entryScore,
         g_entryModel,
         g_fiboVisible ? "true" : "false"
      );
      string positionDiagnostics =
         marketContextDiagnostics + ",\"openPositions\":" + OpenPositionsTelemetryJson() + "}}";
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

int HttpPostJson(string url, string payload, string &response)
{
   char data[];
   char result[];
   string resultHeaders = "";
   string headers = "Content-Type: application/json\r\n";

   StringToCharArray(payload, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(ArraySize(data) > 0)
      ArrayResize(data, ArraySize(data) - 1);

   ResetLastError();
   int code = WebRequest("POST", url, headers, 5000, data, result, resultHeaders);
   response = CharArrayToString(result, 0, -1, CP_UTF8);
   return code;
}

bool IsBurstProfile()
{
   return g_tradingProfile == PROFILE_BURST_10;
}

bool IsMaximumRiskProfile()
{
   return g_tradingProfile == PROFILE_MAXIMUM;
}

string TradingProfileName()
{
   if(g_tradingProfile == PROFILE_SAFE) return "SAFE";
   if(g_tradingProfile == PROFILE_AGGRESSIVE) return "AGGRESSIVE";
   if(g_tradingProfile == PROFILE_BURST_10) return "BURST_10";
   if(g_tradingProfile == PROFILE_MAXIMUM) return "MAXIMUM";
   return "BALANCED";
}

void ApplyTradingProfile()
{
   g_adaptiveEngine = true;
   g_maxAtrPoints = 0.0;
   if(!IsBurstProfile())
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

   if(g_tradingProfile == PROFILE_SAFE)
   {
      g_minOrderIntervalMs = 1200;
      g_maxOrdersPerMinute = 30;
      g_confidenceThreshold = 80;
      g_riskPerOrderPercent = 0.10;
      g_hardStopAtrMultiplier = 2.50;
      g_allowMinimumLotOverride = false;
   }
   else if(g_tradingProfile == PROFILE_AGGRESSIVE)
   {
      g_minOrderIntervalMs = 350;
      g_maxOrdersPerMinute = 120;
      g_confidenceThreshold = 60;
      g_riskPerOrderPercent = 0.30;
      g_hardStopAtrMultiplier = 1.80;
      g_allowMinimumLotOverride = false;
   }
   else if(g_tradingProfile == PROFILE_BURST_10)
   {
      g_minOrderIntervalMs = 250;
      g_maxOrdersPerMinute = 180;
      g_confidenceThreshold = 60;
      // Burst still uses the adaptive entry brain. Every queued add is
      // revalidated against live spread + market location before it is sent.
      g_riskPerOrderPercent = 0.05;
      g_hardStopAtrMultiplier = 1.70;
      g_allowMinimumLotOverride = true;

      g_triggerMoney = 0.0;
      g_trailMoney = 0.0;
   }
   else if(g_tradingProfile == PROFILE_MAXIMUM)
   {
      // Maximum risk is deliberately permissive on execution, not random on
      // direction. Structure / S-R / Order Block / Fibonacci remain active.
      // The configured Lot is used directly by AdaptiveTradeVolume().
      g_minOrderIntervalMs = 200;
      g_maxOrdersPerMinute = 240;
      g_confidenceThreshold = 50;
      g_riskPerOrderPercent = 5.00;
      g_hardStopAtrMultiplier = 1.70;
      g_allowMinimumLotOverride = true;
   }
   else
   {
      g_minOrderIntervalMs = 700;
      g_maxOrdersPerMinute = 60;
      g_confidenceThreshold = 70;
      g_riskPerOrderPercent = 0.20;
      g_hardStopAtrMultiplier = 2.00;
      g_allowMinimumLotOverride = false;
   }

   g_adaptiveMaxPositions = g_maxPositions;
   g_adaptiveEntrySpacingMs = g_minOrderIntervalMs;
}

void ApplySettings(string json)
{
   string profile = JsonString(json, "tradingProfile", "");
   if(profile == "SAFE") g_tradingProfile = PROFILE_SAFE;
   else if(profile == "AGGRESSIVE") g_tradingProfile = PROFILE_AGGRESSIVE;
   else if(profile == "BURST_10") g_tradingProfile = PROFILE_BURST_10;
   else if(profile == "MAXIMUM") g_tradingProfile = PROFILE_MAXIMUM;
   else if(profile == "BALANCED") g_tradingProfile = PROFILE_BALANCED;

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

   g_basketProfitTarget = MathMax(0.0, JsonNumber(json, "basketProfitTargetMoney", g_basketProfitTarget));
   g_perPositionProfit = MathMax(0.0, JsonNumber(json, "perPositionProfitMoney", g_perPositionProfit));
   g_profitRunTrailPercent = MathMax(0.0, MathMin(95.0, JsonNumber(json, "profitRunTrailPercent", g_profitRunTrailPercent)));

   if(g_perPositionProfit > 0.0)
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

   // Changing Basket target or giveback percentage starts a fresh peak.
   if(MathAbs(previousBasketProfitTarget - g_basketProfitTarget) > 0.0000001 ||
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
   g_confidenceThreshold = (int)MathMax(40.0, MathMin(95.0, JsonNumber(json, "confidenceThreshold", g_confidenceThreshold)));
   g_sessionStartHour = (int)MathMax(0.0, MathMin(23.0, JsonNumber(json, "sessionStartHour", g_sessionStartHour)));
   g_sessionEndHour = (int)MathMax(1.0, MathMin(24.0, JsonNumber(json, "sessionEndHour", g_sessionEndHour)));
   g_maxAtrPoints = MathMax(0.0, JsonNumber(json, "maxAtrPoints", g_maxAtrPoints));
   g_lastAdaptiveEvaluation = 0;

   string mode = JsonString(json, "entryMode", "");
   if(mode == "BUY_ONLY") g_entryMode = ENTRY_BUY_ONLY;
   else if(mode == "SELL_ONLY") g_entryMode = ENTRY_SELL_ONLY;
   else if(mode == "AUTO_MOMENTUM") g_entryMode = ENTRY_AUTO_MOMENTUM;

   ApplyTradingProfile();

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

bool FindNearestPivotLevels(
   ENUM_TIMEFRAMES timeframe,
   int lookback,
   double currentPrice,
   double &support,
   double &resistance
)
{
   support = 0.0;
   resistance = 0.0;
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, timeframe, 1, MathMax(20, lookback), rates);
   if(copied < 10)
      return false;

   for(int i = 2; i < copied - 2; i++)
   {
      bool pivotLow =
         rates[i].low <= rates[i-1].low &&
         rates[i].low <= rates[i-2].low &&
         rates[i].low < rates[i+1].low &&
         rates[i].low < rates[i+2].low;
      bool pivotHigh =
         rates[i].high >= rates[i-1].high &&
         rates[i].high >= rates[i-2].high &&
         rates[i].high > rates[i+1].high &&
         rates[i].high > rates[i+2].high;

      if(pivotLow && rates[i].low < currentPrice &&
         (support <= 0.0 || rates[i].low > support))
         support = rates[i].low;

      if(pivotHigh && rates[i].high > currentPrice &&
         (resistance <= 0.0 || rates[i].high < resistance))
         resistance = rates[i].high;
   }

   // Pivot fallback prevents missing context in a one-way market.
   if(support <= 0.0 || resistance <= 0.0)
   {
      double lowest = rates[0].low;
      double highest = rates[0].high;
      for(int i = 1; i < copied; i++)
      {
         lowest = MathMin(lowest, rates[i].low);
         highest = MathMax(highest, rates[i].high);
      }
      if(support <= 0.0 && lowest < currentPrice) support = lowest;
      if(resistance <= 0.0 && highest > currentPrice) resistance = highest;
   }
   return support > 0.0 || resistance > 0.0;
}

bool FindImpulseRange(
   ENUM_TIMEFRAMES timeframe,
   int lookback,
   double &swingLow,
   datetime &swingLowTime,
   double &swingHigh,
   datetime &swingHighTime
)
{
   swingLow = 0.0;
   swingHigh = 0.0;
   swingLowTime = 0;
   swingHighTime = 0;

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, timeframe, 1, MathMax(30, lookback), rates);
   if(copied < 20)
      return false;

   swingLow = rates[0].low;
   swingHigh = rates[0].high;
   swingLowTime = rates[0].time;
   swingHighTime = rates[0].time;
   for(int i = 1; i < copied; i++)
   {
      if(rates[i].low < swingLow)
      {
         swingLow = rates[i].low;
         swingLowTime = rates[i].time;
      }
      if(rates[i].high > swingHigh)
      {
         swingHigh = rates[i].high;
         swingHighTime = rates[i].time;
      }
   }
   return swingHigh > swingLow;
}

bool FindRecentOrderBlock(
   ENUM_TIMEFRAMES timeframe,
   int lookback,
   bool bullish,
   double atrPrice,
   double &zoneLow,
   double &zoneHigh
)
{
   zoneLow = 0.0;
   zoneHigh = 0.0;
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, timeframe, 1, MathMax(30, lookback), rates);
   if(copied < 12)
      return false;

   double displacementFloor = MathMax(_Point * 5.0, atrPrice * 0.30);
   for(int i = 3; i < copied - 2; i++)
   {
      bool candidate = bullish
         ? rates[i].close < rates[i].open
         : rates[i].close > rates[i].open;
      if(!candidate)
         continue;

      // The newer candle must displace away from the candidate and clear its
      // full range. This is intentionally deterministic and conservative enough
      // to avoid labeling every opposite candle as an Order Block.
      double body = MathAbs(rates[i-1].close - rates[i-1].open);
      bool displaced = bullish
         ? (rates[i-1].close > rates[i].high && body >= displacementFloor)
         : (rates[i-1].close < rates[i].low && body >= displacementFloor);
      if(!displaced)
         continue;

      zoneLow = rates[i].low;
      zoneHigh = rates[i].high;
      return true;
   }
   return false;
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

   const int levelCount = 7;
   double levels[7] = {0.0,0.236,0.382,0.500,0.618,0.786,1.0};
   string labels[7] = {"0.0","23.6","38.2","50.0","61.8","78.6","100.0"};
   ObjectSetInteger(0, name, OBJPROP_LEVELS, levelCount);
   ObjectSetInteger(0, name, OBJPROP_RAY_RIGHT, true);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, true);
   for(int i = 0; i < levelCount; i++)
   {
      ObjectSetDouble(0, name, OBJPROP_LEVELVALUE, i, levels[i]);
      ObjectSetString(0, name, OBJPROP_LEVELTEXT, i, labels[i]);
   }
   g_fiboVisible = true;
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

   double s15=0.0,r15=0.0,s30=0.0,r30=0.0,sH1=0.0,rH1=0.0;
   FindNearestPivotLevels(PERIOD_M15, 120, price, s15, r15);
   FindNearestPivotLevels(PERIOD_M30, 100, price, s30, r30);
   FindNearestPivotLevels(PERIOD_H1, 80, price, sH1, rH1);
   g_nearestSupport = ClosestBelow(price, s15, s30, sH1);
   g_nearestResistance = ClosestAbove(price, r15, r30, rH1);
   g_majorSupport = ClosestBelow(price, s30, sH1, 0.0);
   g_majorResistance = ClosestAbove(price, r30, rH1, 0.0);

   double atrM15Price = AverageTrueRangePoints(PERIOD_M15, g_atrPeriod) * _Point;
   double bull15L=0.0,bull15H=0.0,bear15L=0.0,bear15H=0.0;
   double bull5L=0.0,bull5H=0.0,bear5L=0.0,bear5H=0.0;
   bool haveBull15 = FindRecentOrderBlock(PERIOD_M15, 100, true, atrM15Price, bull15L, bull15H);
   bool haveBear15 = FindRecentOrderBlock(PERIOD_M15, 100, false, atrM15Price, bear15L, bear15H);
   bool haveBull5 = FindRecentOrderBlock(PERIOD_M5, 120, true, atrM15Price * 0.55, bull5L, bull5H);
   bool haveBear5 = FindRecentOrderBlock(PERIOD_M5, 120, false, atrM15Price * 0.55, bear5L, bear5H);

   g_bullishOrderBlockLow = haveBull15 ? bull15L : (haveBull5 ? bull5L : 0.0);
   g_bullishOrderBlockHigh = haveBull15 ? bull15H : (haveBull5 ? bull5H : 0.0);
   g_bearishOrderBlockLow = haveBear15 ? bear15L : (haveBear5 ? bear5L : 0.0);
   g_bearishOrderBlockHigh = haveBear15 ? bear15H : (haveBear5 ? bear5H : 0.0);
   g_orderBlockTimeframe = (haveBull15 || haveBear15) ? "M15" :
                           (haveBull5 || haveBear5) ? "M5" : "NONE";

   FindImpulseRange(
      PERIOD_M15, 90,
      g_fibSwingLow, g_fibSwingLowTime,
      g_fibSwingHigh, g_fibSwingHighTime
   );
   if(g_fibSwingHigh > g_fibSwingLow)
   {
      // Chronological order defines the active impulse.
      g_fibDirection = g_fibSwingHighTime > g_fibSwingLowTime ? 1 : -1;
      double range = g_fibSwingHigh - g_fibSwingLow;
      if(g_fibDirection > 0)
         g_fibRetracement = (g_fibSwingHigh - price) / range;
      else
         g_fibRetracement = (price - g_fibSwingLow) / range;
      g_fibRetracement = MathMax(0.0, MathMin(1.50, g_fibRetracement));
   }
   else
   {
      g_fibDirection = 0;
      g_fibRetracement = 0.0;
   }

   if(g_state == STATE_RUNNING)
      DrawTradingFibonacci();
}

bool PriceInsideOrNearZone(double price, double low, double high, double buffer)
{
   if(low <= 0.0 || high <= 0.0 || high < low)
      return false;
   return price >= low - buffer && price <= high + buffer;
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

   g_locationScore = 12.0;
   bool nearSupport = direction > 0 && g_nearestSupport > 0.0 &&
                      price - g_nearestSupport <= nearBuffer;
   bool nearResistance = direction < 0 && g_nearestResistance > 0.0 &&
                         g_nearestResistance - price <= nearBuffer;
   bool inOrderBlock = direction > 0
      ? PriceInsideOrNearZone(price, g_bullishOrderBlockLow, g_bullishOrderBlockHigh, nearBuffer * 0.35)
      : PriceInsideOrNearZone(price, g_bearishOrderBlockLow, g_bearishOrderBlockHigh, nearBuffer * 0.35);
   bool fibConfluence =
      g_fibDirection == direction &&
      g_fibRetracement >= 0.35 &&
      g_fibRetracement <= 0.82;

   if(nearSupport || nearResistance) g_locationScore += 12.0;
   if(inOrderBlock) g_locationScore += 10.0;
   if(fibConfluence) g_locationScore += 10.0;

   bool breakout = direction > 0
      ? (g_majorResistance > 0.0 && price > g_majorResistance + nearBuffer * 0.20)
      : (g_majorSupport > 0.0 && price < g_majorSupport - nearBuffer * 0.20);

   if(nearSupport || nearResistance || inOrderBlock || fibConfluence)
      g_entryModel = "PULLBACK";
   else if(breakout)
      g_entryModel = "BREAKOUT";
   else
      g_entryModel = "CONTINUATION";

   g_locationScore = MathMax(0.0, MathMin(42.0, g_locationScore));
   g_entryScore = MathMax(0.0, MathMin(100.0, g_structureScore + g_locationScore + 6.0));
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

   double price = (tick.bid + tick.ask) * 0.5;
   double atrPrice = MathMax(_Point * 20.0, AverageTrueRangePoints(PERIOD_M15, g_atrPeriod) * _Point);
   // Keep the hard opposing-zone buffer deliberately narrow. S/R, OB and Fib
   // mostly affect score; they do not all have to agree before an order can fire.
   double hardBuffer = MathMax(_Point * 8.0, atrPrice * 0.12);

   EvaluateMarketLocationScore(direction);

   // Only hard-block a direct entry into an unbroken higher-timeframe opposing
   // zone. Once price genuinely clears the level the block disappears.
   if(direction > 0 && g_majorResistance > price &&
      g_majorResistance - price <= hardBuffer)
   {
      g_adaptiveBlockReason = "BLOCKED_MAJOR_RESISTANCE";
      return false;
   }
   if(direction < 0 && g_majorSupport > 0.0 && price > g_majorSupport &&
      price - g_majorSupport <= hardBuffer)
   {
      g_adaptiveBlockReason = "BLOCKED_MAJOR_SUPPORT";
      return false;
   }

   // During Burst revalidation, stop adding only when both controlling
   // timeframes have flipped against the queued direction. Do not require every
   // lower timeframe, OB and Fib condition to align on each add.
   if(fastRevalidation &&
      g_trendM15 == -direction &&
      g_trendH1 == -direction)
   {
      g_adaptiveBlockReason = "WAITING_TREND_ALIGNMENT";
      return false;
   }
   return true;
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
   g_minimumLotOverrideActive = false;
   double fallback = NormalizeTradeVolume(g_lot);

   // In MAXIMUM mode the customer explicitly accepts the configured exposure.
   // Keep the market-entry intelligence, but do not silently reduce Lot because
   // of ATR, prior losses, drawdown, or execution-quality multipliers.
   if(IsMaximumRiskProfile())
      return fallback;

   if(!g_adaptiveEngine || g_atrPoints <= 0.0 || g_riskPerOrderPercent <= 0.0)
      return fallback;

   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE_LOSS);
   if(tickValue <= 0.0) tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double stopDistance = EffectiveStopLossDistancePoints() * _Point;
   if(tickSize <= 0.0 || tickValue <= 0.0 || stopDistance <= 0.0)
      return fallback;

   double riskMoney = AccountInfoDouble(ACCOUNT_EQUITY) * g_riskPerOrderPercent / 100.0;
   double moneyPerLot = (stopDistance / tickSize) * tickValue;
   if(riskMoney <= 0.0 || moneyPerLot <= 0.0)
      return fallback;

   double calculated = MathMin(g_lot, riskMoney / moneyPerLot);
   double volatilityRatio = g_atrRatio > 0.0 ? g_atrRatio : 1.0;
   double volatilityFactor = 1.0 / MathMax(1.0, volatilityRatio);
   double lossFactor = MathPow(0.75, MathMax(0, g_consecutiveLosses));
   double executionFactor = 0.50 + 0.50 * MathMax(0.0, MathMin(100.0, g_executionQuality)) / 100.0;
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double drawdownRatio = equity > 0.0 ? MathMax(0.0, -DailyBotProfit() / equity) : 0.0;
   double drawdownFactor = MathMax(0.50, 1.0 - drawdownRatio * 10.0);
   calculated *= volatilityFactor * lossFactor * executionFactor * drawdownFactor;
   double brokerMinimum = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   if(calculated + 1e-12 < brokerMinimum)
   {
      // Optional small-account override: keep every other Adaptive/Risk guard,
      // but do not block solely because the broker cannot trade below its
      // minimum volume. Never exceed the user's configured lot ceiling.
      if(!g_allowMinimumLotOverride || brokerMinimum > g_lot + 1e-12)
         return 0.0;

      g_minimumLotOverrideActive = true;
      return NormalizeTradeVolume(brokerMinimum);
   }
   return NormalizeTradeVolume(calculated);
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
   if(g_marketRegime == "HIGH_VOLATILITY") momentumFactor = 1.20;
   else if(g_marketRegime == "QUIET") momentumFactor = 0.70;
   else if(g_marketRegime == "RANGE") momentumFactor = 1.15;
   if(g_atrRatio > 1.0)
      momentumFactor *= MathMin(1.15, MathSqrt(g_atrRatio));
   g_adaptiveMomentumThreshold = MathMax(2.0, InpMomentumEntryPoints * momentumFactor);

   int rawDirection = 0;
   if(g_entryMode == ENTRY_BUY_ONLY) rawDirection = 1;
   else if(g_entryMode == ENTRY_SELL_ONLY) rawDirection = -1;
   else if(momentum >= g_adaptiveMomentumThreshold) rawDirection = 1;
   else if(momentum <= -g_adaptiveMomentumThreshold) rawDirection = -1;

   if(rawDirection == 0)
   {
      g_signalConfidence = 0.0;
      g_adaptiveBlockReason = "WAITING_MOMENTUM";
      g_cachedAdaptiveBlockReason = g_adaptiveBlockReason;
      return 0;
   }

   double momentumStrength = MathMin(2.0, MathAbs(momentum) / MathMax(1.0, g_adaptiveMomentumThreshold));
   double score = 12.0 + momentumStrength * 10.0;
   bool directionalRegime = g_marketRegime == "TREND_UP" || g_marketRegime == "TREND_DOWN";
   double weightM1 = directionalRegime ? 5.0 : 7.0;
   double weightM5 = directionalRegime ? 9.0 : 10.0;
   double weightM15 = directionalRegime ? 14.0 : 11.0;
   double weightM30 = directionalRegime ? 16.0 : 10.0;
   double weightH1 = directionalRegime ? 18.0 : 10.0;
   if(trendM1 == rawDirection) score += weightM1;
   else if(trendM1 == -rawDirection) score -= weightM1 * 0.25;
   if(trendM5 == rawDirection) score += weightM5;
   else if(trendM5 == -rawDirection) score -= weightM5 * 0.35;
   if(trendM15 == rawDirection) score += weightM15;
   else if(trendM15 == -rawDirection) score -= weightM15 * 0.45;
   if(trendM30 == rawDirection) score += weightM30;
   else if(trendM30 == -rawDirection) score -= weightM30 * 0.55;
   if(trendH1 == rawDirection) score += weightH1;
   else if(trendH1 == -rawDirection) score -= weightH1 * 0.55;
   score += MathMax(0.0, 12.0 - g_spreadConfidencePenalty * 0.60);
   score += g_marketRegime == "HIGH_VOLATILITY" ? 2.0 : g_marketRegime == "QUIET" ? 5.0 : 8.0;
   score += MathMax(0.0, MathMin(8.0, g_executionQuality * 0.08));

   // Price location is confluence, not a wall of mandatory filters.
   double marketEntryScore = EvaluateMarketLocationScore(rawDirection);
   score = score * 0.72 + marketEntryScore * 0.28;

   // MAXIMUM keeps entry intelligence intact, but prior losses do not make the
   // signal progressively impossible to take.
   if(!IsMaximumRiskProfile())
      score -= MathMin(15.0, g_consecutiveLosses * 4.0);
   g_signalConfidence = MathMax(0.0, MathMin(100.0, score));

   // Position count is controlled only by the user's Max Positions setting.
   // Adaptive Intelligence may decide when to enter, but never lowers this cap.
   g_adaptiveMaxPositions = g_maxPositions;

   double spacingFactor = 1.0;
   if(g_marketRegime == "HIGH_VOLATILITY") spacingFactor = 2.2;
   else if(g_marketRegime == "RANGE") spacingFactor = 1.8;
   else if(g_marketRegime == "QUIET") spacingFactor = 1.4;
   spacingFactor *= 1.0 + g_consecutiveLosses * 0.50;
   spacingFactor *= 1.0 + (100.0 - g_executionQuality) / 100.0;
   g_adaptiveEntrySpacingMs = (int)MathMax(g_minOrderIntervalMs, g_minOrderIntervalMs * spacingFactor);

   // AUTO_MOMENTUM is trend-following. When M15/H1 establish a macro bias,
   // do not open the opposite side. BUY_ONLY / SELL_ONLY remain explicit
   // manual direction overrides.
   if(g_entryMode == ENTRY_AUTO_MOMENTUM &&
      g_macroTrendDirection != 0 &&
      rawDirection != g_macroTrendDirection)
   {
      g_adaptiveBlockReason = "WAITING_REGIME_ALIGNMENT";
      g_cachedAdaptiveBlockReason = g_adaptiveBlockReason;
      return 0;
   }

   // Never allow an entry directly against both M30 and H1. M1/M5 are timing
   // frames and are intentionally allowed to pull back against the macro trend.
   if(trendM30 == -rawDirection && trendH1 == -rawDirection)
   {
      g_adaptiveBlockReason = "WAITING_TREND_ALIGNMENT";
      g_cachedAdaptiveBlockReason = g_adaptiveBlockReason;
      return 0;
   }

   if(!MarketLocationEntryAllowed(rawDirection, false))
   {
      g_cachedAdaptiveBlockReason = g_adaptiveBlockReason;
      return 0;
   }

   if(g_signalConfidence < g_confidenceThreshold)
   {
      g_adaptiveBlockReason = "WAITING_CONFIDENCE";
      g_cachedAdaptiveBlockReason = g_adaptiveBlockReason;
      return 0;
   }

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

   // MAXIMUM means the user accepts exposure up to Max Positions. The full
   // market-location gate still runs before SendMarketOrder(), so do not add a
   // second adaptive pyramid throttle here.
   if(IsMaximumRiskProfile())
      return true;
   if(count >= g_adaptiveMaxPositions)
      return false;

   // MaxPositions is a ceiling, not "fire all positions now".
   // Every add must happen on the profitable side of the latest entry.
   g_pyramidProgressPoints = BasketFavorableProgressPoints(direction);

   bool directionalTrend =
      (g_macroTrendDirection > 0 && direction > 0) ||
      (g_macroTrendDirection < 0 && direction < 0);

   if(g_marketRegime == "HIGH_VOLATILITY")
   {
      int highVolCap = MathMin(2, MathMax(1, g_adaptiveMaxPositions));
      if(count >= highVolCap)
         return false;
      g_pyramidRequiredPoints = MathMax(5.0, g_atrPoints * 0.10);
      if(g_pyramidProgressPoints < g_pyramidRequiredPoints)
         return false;
      if(g_signalConfidence < g_confidenceThreshold + 12)
         return false;
      if(!DirectionalMomentumStillValid(direction, 1.10))
         return false;
      return true;
   }

   if(directionalTrend)
   {
      g_pyramidRequiredPoints = MathMax(3.0, g_atrPoints * 0.06);
      if(g_pyramidProgressPoints < g_pyramidRequiredPoints)
         return false;
      if(g_signalConfidence < g_confidenceThreshold + 3)
         return false;
      // After the first impulse a healthy trend can slow down. The old 110%
      // momentum requirement often left MaxPositions=4 baskets stuck at 1.
      // Favorable price progress + 75% continuation is a safer add condition.
      if(!DirectionalMomentumStillValid(direction, 0.75))
         return false;
      return true;
   }

   g_pyramidRequiredPoints = MathMax(3.0, g_atrPoints * 0.05);
   if(g_pyramidProgressPoints < g_pyramidRequiredPoints)
      return false;
   if(g_signalConfidence < g_confidenceThreshold + 5)
      return false;
   if(!DirectionalMomentumStillValid(direction, 1.10))
      return false;
   return true;
}

void PersistAdaptiveRiskState()
{
   GlobalVariableSet(DailyRiskStateKey("ALOSS"), (double)g_consecutiveLosses);
}

void RestoreAdaptiveRiskState()
{
   string lossKey = DailyRiskStateKey("ALOSS");
   if(GlobalVariableCheck(lossKey)) g_consecutiveLosses = (int)GlobalVariableGet(lossKey);
   // Remove cooldown state left by older EA versions. Loss history may still
   // reduce risk, but it never delays or blocks the next valid signal.
   string cooldownKey = DailyRiskStateKey("ACOOL");
   if(GlobalVariableCheck(cooldownKey)) GlobalVariableDel(cooldownKey);
}

void UpdateAdaptiveLossState(ulong dealTicket)
{
   long entry = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
   if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY)
      return;

   double net = HistoryDealGetDouble(dealTicket, DEAL_PROFIT)
              + HistoryDealGetDouble(dealTicket, DEAL_SWAP)
              + HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
   if(net < 0.0)
      g_consecutiveLosses++;
   else if(net > 0.0)
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

   if(g_spreadHighSeconds >= 3)
      g_spreadStatus = profileReady ? "BLOCKED" : "FALLBACK_BLOCKED";
   else if(aboveLimit || spread > elevatedLevel)
      g_spreadStatus = profileReady ? "ELEVATED" : "WARMUP";
   else
      g_spreadStatus = profileReady ? "NORMAL" : "WARMUP";

   g_spreadConfidencePenalty = 0.0;
   if(spread > elevatedLevel && g_adaptiveSpreadLimit > elevatedLevel)
      g_spreadConfidencePenalty = MathMin(
         20.0,
         20.0 * (spread - elevatedLevel) / (g_adaptiveSpreadLimit - elevatedLevel)
      );

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

   // Adaptive mode never falls back to a broker-agnostic fixed number.
   if(g_adaptiveSpreadLimit <= 0.0)
      return true;
   return g_spreadHighSeconds < 3;
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
   // Per-position profit mode is mutually exclusive with Basket profit.
   if(g_perPositionProfit > 0.0)
      return 0.0;

   // Explicit website setting always wins.
   if(g_basketProfitTarget > 0.0)
      return g_basketProfitTarget;

   // Burst auto target is only a fallback when the user left Basket profit off.
   if(IsBurstProfile() && g_burstTargetMoney > 0.0)
      return g_burstTargetMoney;

   return 0.0;
}

double EffectiveBasketLossLimit()
{
   // 0 means OFF exactly. Never invent a hidden Basket loss behind the user's
   // setting, including in Burst or Maximum-risk workflows.
   return MathMax(0.0, g_maxBasketLoss);
}

void EnsureBurstTargets(int plannedPositions)
{
   if(!IsBurstProfile() || g_burstTargetMoney > 0.0)
      return;

   int targetCount = MathMax(1, plannedPositions);
   double volume = g_adaptiveLot > 0.0 ? g_adaptiveLot : NormalizeTradeVolume(g_lot);
   double plannedSpreadCost = CurrentSpreadCost(volume) * targetCount;
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   g_burstTargetMoney = MathMax(0.50, MathMax(plannedSpreadCost * 0.50, equity * 0.0002));

   // Loss protection is never synthesized. If the user sets Basket Loss to 0,
   // the effective Basket loss is OFF.
   g_burstLossMoney = 0.0;
}

void ArmBurst(int direction)
{
   if(!IsBurstProfile() || g_burstActive)
      return;

   g_burstDirection = direction;
   g_burstTargetPositions = MathMax(1, g_maxPositions);
   g_burstRequestsSent = 1;
   g_burstStartedAt = TimeCurrent();
   g_burstActive = g_burstRequestsSent < g_burstTargetPositions;
   g_burstNeedsRearm = false;
   EnsureBurstTargets(g_burstTargetPositions);
   Print(
      "BURST_10 armed direction=", direction,
      " target=", DoubleToString(g_burstTargetMoney, 2),
      " loss=", DoubleToString(g_burstLossMoney, 2)
   );
}

void AbortBurst(string reason)
{
   if(!g_burstActive) return;
   g_burstActive = false;
   g_executionStatus = "BURST_ABORTED";
   g_adaptiveBlockReason = reason;
   Print("BURST_10 aborted: ", reason, " filled=", BasketPositionCount());
}

void ProcessBurstQueue()
{
   if(!IsBurstProfile() || !g_burstActive)
      return;

   if(g_state != STATE_RUNNING || !g_access ||
      (!MQLInfoInteger(MQL_TESTER) && !EntryLeaseValid()))
   {
      AbortBurst("CONTROL_NOT_FRESH");
      return;
   }
   int burstTimeoutSeconds = MathMax(15, (g_burstTargetPositions * g_minOrderIntervalMs) / 1000 + 10);
   if(TimeCurrent() - g_burstStartedAt > burstTimeoutSeconds)
   {
      AbortBurst("BURST_TIMEOUT");
      return;
   }
   if(TradePermissionStatus() != "OK")
   {
      AbortBurst("TRADE_PERMISSION");
      return;
   }
   int count = BasketPositionCount();
   if(count >= g_burstTargetPositions || g_burstRequestsSent >= g_burstTargetPositions)
   {
      g_burstActive = false;
      if(count == 0) g_burstNeedsRearm = true;
      g_executionStatus = "BURST_COMPLETE";
      return;
   }
   // Revalidate each queued add. Keep this deliberately light: do not demand
   // every timeframe/Fib/OB signal again, but never keep firing into a new
   // major opposing zone or after M15+H1 have flipped against the Basket.
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
   g_burstRequestsSent++;
   int filled = BasketPositionCount();
   bool completed = filled >= g_burstTargetPositions || g_burstRequestsSent >= g_burstTargetPositions;
   if(completed)
      g_executionStatus = "BURST_COMPLETE";
   else if(accepted)
      g_executionStatus = "BURST_FILLING";
   // On rejection keep the exact MT5 retcode status from SendMarketOrder, then
   // continue with the next requested attempt. MT5/Broker decides every order.
   if(filled >= g_burstTargetPositions || g_burstRequestsSent >= g_burstTargetPositions)
   {
      g_burstActive = false;
      if(filled == 0) g_burstNeedsRearm = true;
   }
}

int SymbolDigitsNow()
{
   return (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
}

bool CanSendOrder()
{
   ulong nowMs = GetTickCount64();
   int spacingMs = IsBurstProfile()
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
      MathAbs(g_profitRunPeak) < 0.0000001)
      return;

   g_basketPeakPositionCount = 0;
   g_basketCycleRealizedProfit = 0.0;
   g_profitRunPeak = 0.0;

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
         HistoryDealGetInteger(deal, DEAL_MAGIC) != InpMagic)
         continue;

      g_dailyClosedProfit += HistoryDealGetDouble(deal, DEAL_PROFIT);
      g_dailyClosedProfit += HistoryDealGetDouble(deal, DEAL_SWAP);
      g_dailyClosedProfit += HistoryDealGetDouble(deal, DEAL_COMMISSION);
   }
}

double DailyBotProfit()
{
   return g_dailyClosedProfit + BasketProfit();
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

string ProfitControlModeName()
{
   if(g_perPositionProfit > 0.0)
      return "PER_POSITION";
   if(g_basketProfitTarget > 0.0 && g_profitRunTrailPercent > 0.0)
      return "BASKET_RUN_ON";
   if(g_basketProfitTarget > 0.0)
      return "BASKET_FIXED";
   if(IsBurstProfile())
      return "BURST_AUTO";
   return "NONE";
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

   double effectiveStopLossPoints = EffectiveStopLossDistancePoints();
   if(effectiveStopLossPoints > 0.0)
   {
      int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
      double stopDistance = effectiveStopLossPoints * _Point;
      request.sl = NormalizeDouble(
         direction > 0 ? tick.ask - stopDistance : tick.bid + stopDistance,
         digits
      );
   }

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
   request.magic = InpMagic;
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
      StringFind(reason, "BASKET_PROFIT") == 0)
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
         PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;
      ClosePositionByTicket(ticket);
   }

   bool closed = BasketPositionCount() == 0;
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
