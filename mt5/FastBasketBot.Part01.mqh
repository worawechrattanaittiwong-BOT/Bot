enum ENUM_ENTRY_MODE
{
   ENTRY_AUTO_MOMENTUM = 0,
   ENTRY_BUY_ONLY      = 1,
   ENTRY_SELL_ONLY     = 2
};

// Brain V20 AUTO-only decision context -------------------------------------
// These structures are intentionally isolated from RACE/Turbo and the legacy
// ASSISTED/MANUAL execution paths. AUTO evaluates BUY and SELL independently
// and publishes only the selected side into the shared execution telemetry.
struct AUTO_V20_LEVELS
{
   double nearestSupport;
   double nearestResistance;
   double majorSupport;
   double majorResistance;
   double nearestSupportDistanceAtr;
   double nearestResistanceDistanceAtr;
   double majorSupportDistanceAtr;
   double majorResistanceDistanceAtr;
   double nearestSupportStrength;
   double nearestResistanceStrength;
   double majorSupportStrength;
   double majorResistanceStrength;
   double formingBase;
   double formingCeiling;
   string roleFlipState;
};

struct AUTO_V20_PULLBACK
{
   int direction;
   double swingStart;
   double swingExtreme;
   double swingRangeAtr;
   double retracement;
   bool sequenceValid;
   bool started;
   bool resumed;
   bool tooDeep;
   double score;
   string state;
};

struct AUTO_V20_SIDE
{
   int direction;
   double confidence;
   double rankScore;
   double macroScore;
   double executionScore;
   double momentumScore;
   double momentumWithPoints;
   double momentumAgainstPoints;
   double locationScore;
   double pullbackScore;
   double pullbackSwingStart;
   double pullbackSwingExtreme;
   double pullbackRetracement;
   string pullbackState;
   double entryPrice;
   double tpPrice;
   double slPrice;
   double rr;
   double expectedProfitMoney;
   double expectedLossMoney;
   double knownCostMoney;
   double plannedLot;
   double aggregateRiskMoney;
   double winProbability;
   int winSamples;
   double averageNet;
   string model;
   string reason;
   string rejectReason;
   bool reversal;
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
   CLOSE_REASON_REMOTE      = 6,
   CLOSE_REASON_BRAIN_REVERSAL = 7,
   CLOSE_REASON_TACTICAL       = 8,
   CLOSE_REASON_RESCUE         = 9
};

enum ENUM_RESCUE_STATE
{
   RESCUE_NORMAL   = 0,
   RESCUE_WARNING  = 1,
   RESCUE_ACTIVE   = 2,
   RESCUE_RECOVERY = 3,
   RESCUE_EXIT     = 4
};

enum ENUM_INDICATOR_V6_MODE
{
   INDICATOR_V6_SHADOW      = 0,
   INDICATOR_V6_SOFT_WEIGHT = 1,
   INDICATOR_V6_TIMING      = 2,
   INDICATOR_V6_ADAPTIVE    = 3
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
// AUTO preserves the normal engine exactly. RACE is an isolated high-speed
// execution mode selected from the web and never changes AUTO entry logic.
input string          InpEngineMode           = "AUTO";
// RACE can bank the entire cycle at a small net-money target. Enabled by
// default so the web's 0.50 close-all target also has a safe EA fallback.
input bool            InpRaceCloseAllProfitEnabled = true;
input double          InpRaceCloseAllProfitMoney = 0.50;
#define RACE_VOLUME_WINDOW_SECONDS 10
// ZERO GRID is isolated from AUTO/RACE and requires an MT5 Hedging account.
#define ZERO_GRID_MAX_LEVELS 30
#define ZERO_GRID_DEFAULT_LEVELS 3
input double          InpZeroGridStepPrice     = 3.0;
input bool            InpZeroGridLowVolatilityEnabled = false;
input int             InpZeroGridLevelsPerSide = ZERO_GRID_DEFAULT_LEVELS;
input double          InpZeroGridBaseLot       = 0.01;
input double          InpZeroGridMinNetProfitMoney = 0.50;
input double          InpZeroGridCloseReserveMoney = 0.20;

input int             InpMomentumTicks        = 20;
input double          InpMomentumEntryPoints  = 8.0;
input double          InpStrongFlowPoints     = 25.0;
input double          InpFlowTrailBoost       = 0.60;
input bool            InpPauseOnManualTrade   = true;
input int             InpHeartbeatSeconds     = 5;
input int             InpMaxOfflineLeaseSeconds = 600;

// Adaptive Engine: deterministic, testable safeguards. The configured lot is
// customer-controlled and is used directly after broker volume normalization.
input bool            InpAdaptiveEngine        = true;
input double          InpRiskPerOrderPercent   = 0.25;
// When enabled, a risk-sized volume below the broker minimum may use the
// broker minimum lot instead of blocking the entry. This can exceed RiskPerOrder%.
input bool            InpAllowMinimumLotOverride = false;
input double          InpHardStopAtrMultiplier = 2.00;
input int             InpAtrPeriod             = 14;
input bool            InpConfidenceGateEnabled = true;
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
input int             InpTimeRescueMinutes     = 5;
input bool            InpShowEmaOnChart        = true;

// Indicator Intelligence V6. SHADOW only observes; SOFT_WEIGHT is the default
// production mode; TIMING/ADAPTIVE may briefly wait on multi-factor context
// but never allow a single indicator to veto a trade.
input ENUM_INDICATOR_V6_MODE InpIndicatorV6Mode = INDICATOR_V6_SOFT_WEIGHT;
input int             InpVolumeProfileBars      = 144;
input int             InpDonchianPeriod         = 20;
input int             InpIndicatorMaxWaitSeconds = 20;

ENUM_BOT_STATE g_state = STATE_STOPPED;
bool   g_access = false;
bool   g_runAuthorized = false;
bool   g_safeStopDrainRequested = false;
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
ulong  g_lastHeartbeatTickMs = 0;
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
string g_engineMode = "AUTO";
string g_controlMode = "LEGACY";
// Never allow AUTO/legacy entry before the Server has delivered a real mode.
bool   g_settingsSynchronized = false;
double g_zeroGridStepPrice = 3.0;
bool   g_zeroGridLowVolatilityEnabled = false;
int    g_zeroGridLevelsPerSide = ZERO_GRID_DEFAULT_LEVELS;
double g_zeroGridBaseLot = 0.01;
double g_zeroGridMinNetProfitMoney = 0.50;
double g_zeroGridCloseReserveMoney = 0.20;
double g_zeroGridCenter = 0.0;
double g_zeroGridStartEquity = 0.0;
datetime g_zeroGridCycleStartedAt = 0;
bool   g_zeroGridClosing = false;
ulong  g_zeroGridLastExitBurstMs = 0;
// V3 locks geometry for the lifetime of one cycle. Web setting changes are
// applied only while flat, never halfway through a filled ladder.
double g_zeroGridCycleStepPrice = 0.0;
int    g_zeroGridCycleLevelsPerSide = 0;
double g_zeroGridCycleBaseLot = 0.0;
int    g_zeroGridCycleLowVolatility = -1;
AUTO_V20_LEVELS g_autoV20Levels;
AUTO_V20_SIDE g_autoV20Buy;
AUTO_V20_SIDE g_autoV20Sell;
string g_autoV20Phase = "INITIALIZING";
string g_autoV20PhaseCandidate = "INITIALIZING";
int g_autoV20PhaseCandidateTicks = 0;
datetime g_autoV20PhaseSince = 0;
double g_autoV20LastMomentum = 0.0;
double g_autoV20PreviousMomentum = 0.0;
long g_autoV20DecisionId = 0;
string g_autoV20DecisionKind = "NONE";
string g_autoV20DecisionReason = "NONE";
string g_autoV20RejectReason = "NONE";
string g_autoV20DirectionChangeReason = "NONE";
string g_autoV20AddReason = "NONE";
double g_autoV20AggregateRiskMoney = 0.0;
double g_autoV20BasketStopPrice = 0.0;
double g_autoV20BasketTargetPrice = 0.0;
datetime g_autoV20BasketStartedAt = 0;
double g_autoV20PeakProfit = 0.0;
double g_autoV20Confidence = 0.0;
double g_autoV20WinProbability = 0.0;
int g_autoV20WinSamples = 0;
double g_autoV20AverageNet = 0.0;
int    g_raceDirection = 0;
double g_racePeakProfit = 0.0;
bool   g_raceProfitArmed = false;
bool   g_raceRecoveryWatch = false;
string g_raceState = "IDLE";
datetime g_raceCycleStartedAt = 0;
bool   g_raceCloseAllProfitEnabled = true;
double g_raceCloseAllProfitMoney = 0.50;
// RACE uses a rolling 10-second order-flow window. Exchange/deal-side flags
// are used when the broker publishes them; quote-only symbols fall back to
// uptick/downtick tick-volume counts. No trend/EMA/timeframe signal decides side.
datetime g_raceVolumeBucketSecond[RACE_VOLUME_WINDOW_SECONDS];
double   g_raceVolumeBucketBuy[RACE_VOLUME_WINDOW_SECONDS];
double   g_raceVolumeBucketSell[RACE_VOLUME_WINDOW_SECONDS];
int      g_raceVolumeBucketSamples[RACE_VOLUME_WINDOW_SECONDS];
datetime g_raceVolumeWarmupStartedAt = 0;
datetime g_raceVolumeLastSampleAt = 0;
double   g_raceVolumeLastMid = 0.0;
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
string g_lowerTimeframeState = "NEUTRAL";
string g_reversalStatus = "NONE";
string g_newsMode = "NORMAL";
bool   g_newsCalendarActive = false;
string g_newsEventName = "NONE";
int    g_newsEventMinutes = 9999;
datetime g_lastCalendarRefreshAt = 0;

double g_demandZoneLow = 0.0;
double g_demandZoneHigh = 0.0;
double g_supplyZoneLow = 0.0;
double g_supplyZoneHigh = 0.0;
string g_demandZoneQuality = "WEAK";
string g_supplyZoneQuality = "WEAK";
double g_demandBaseScore = 0.0;
double g_demandDepartureScore = 0.0;
double g_demandFreshnessScore = 0.0;
double g_demandMitigationScore = 0.0;
double g_demandWickScore = 0.0;
double g_demandVolumeScore = 0.0;
double g_demandOverlapScore = 0.0;
double g_supplyBaseScore = 0.0;
double g_supplyDepartureScore = 0.0;
double g_supplyFreshnessScore = 0.0;
double g_supplyMitigationScore = 0.0;
double g_supplyWickScore = 0.0;
double g_supplyVolumeScore = 0.0;
double g_supplyOverlapScore = 0.0;
double g_rsiDivergenceBuyScore = 0.0;
double g_rsiDivergenceSellScore = 0.0;
double g_adxPreviousM5 = 0.0;
double g_plusDiPreviousM5 = 0.0;
double g_minusDiPreviousM5 = 0.0;
double g_vwapDistanceAtr = 0.0;
double g_spaceToTargetAtr = 99.0;

// Entry Precision V3 is an advisory/timing layer. It may briefly wait for a
// better price, but every strategic wait is bounded and falls back to the
// proven Market Cycle V2 path. Safety gates remain separate.
string g_entryPrecisionState = "LEGACY";
string g_entryPrecisionReason = "NONE";
double g_entryPrecisionScore = 50.0;
double g_entryDistanceAtr = 0.0;
double g_expectedMoveAtr = 0.0;
double g_executionCostAtr = 0.0;
double g_setupEvScore = 50.0;
double g_setupWinProbability = 0.0;
int    g_setupWinSamples = 0;
double g_setupAvgWin = 0.0;
double g_setupAvgLoss = 0.0;
double g_setupAverageNet = 0.0;
double g_buyAverageNet = 0.0;
double g_sellAverageNet = 0.0;
string g_setupHistoryModel = "NONE";
string g_setupHistoryRegime = "UNKNOWN";
int    g_setupHistoryDirection = 0;
string g_liquidityState = "NONE";
double g_liquidityScore = 0.0;
string g_microStructureState = "NEUTRAL";
double g_microStructureScore = 0.0;
string g_fvgState = "NONE";
double g_fvgScore = 0.0;
datetime g_precisionWaitStartedAt = 0;
int      g_precisionWaitDirection = 0;
string   g_precisionWaitReason = "NONE";
int      g_precisionWaitMaxSeconds = 0;

// Local Extreme / Tactical V4. Macro bias is never rewritten by this layer.
// It only decides whether the current PRICE is appropriate for continuation.
string g_localExtremeState = "NONE";
double g_localExtremeScore = 0.0;
double g_localExtremeLevel = 0.0;
string g_failedBreakoutState = "NONE";
bool   g_breakoutHoldConfirmed = false;
bool   g_tacticalCountertrendActive = false;
int    g_tacticalCountertrendDirection = 0;
double g_tacticalCountertrendScore = 0.0;
string g_tacticalCountertrendReason = "NONE";
datetime g_localExtremeWaitStartedAt = 0;

// Indicator Intelligence V6 ------------------------------------------------
// Each family measures a different market dimension. Composite scoring caps
// every family so correlated indicators cannot masquerade as independent proof.
ENUM_INDICATOR_V6_MODE g_indicatorV6Mode = INDICATOR_V6_SOFT_WEIGHT;
string g_indicatorActivationStage = "SOFT_WEIGHT";
datetime g_lastIndicatorV6RefreshAt = 0;
int g_indicatorV6Direction = 0;
double g_volumePoc = 0.0;
double g_volumeVah = 0.0;
double g_volumeVal = 0.0;
double g_volumeHvn = 0.0;
double g_volumeLvn = 0.0;
string g_volumeProfileState = "DATA_NOT_READY";
double g_volumeProfileScore = 50.0;
double g_swingAnchoredVwap = 0.0;
double g_impulseAnchoredVwap = 0.0;
double g_multiVwapScore = 50.0;
string g_multiVwapState = "NEUTRAL";
double g_donchianHigh = 0.0;
double g_donchianLow = 0.0;
string g_donchianState = "NEUTRAL";
double g_bbUpper = 0.0;
double g_bbMiddle = 0.0;
double g_bbLower = 0.0;
double g_bbWidthAtr = 0.0;
double g_keltnerUpper = 0.0;
double g_keltnerLower = 0.0;
string g_squeezeState = "NORMAL";
double g_volatilityExpansionScore = 50.0;
double g_macdHistogram = 0.0;
double g_macdHistogramPrevious = 0.0;
double g_macdHistogramSlope = 0.0;
string g_macdState = "NEUTRAL";
double g_stochK = 50.0;
double g_stochD = 50.0;
string g_stochState = "NEUTRAL";
double g_tickVolumeMomentum = 1.0;
double g_obvFlowScore = 50.0;
double g_candleEfficiency = 0.0;
double g_adxSlope = 0.0;
double g_dmiAcceleration = 0.0;
double g_rsiRegularDivBuy = 0.0;
double g_rsiRegularDivSell = 0.0;
double g_rsiHiddenDivBuy = 0.0;
double g_rsiHiddenDivSell = 0.0;
double g_sessionHigh = 0.0;
double g_sessionLow = 0.0;
double g_previousDayHigh = 0.0;
double g_previousDayLow = 0.0;
double g_previousDayClose = 0.0;
double g_weekHigh = 0.0;
double g_weekLow = 0.0;
double g_flipLevel = 0.0;
int g_flipDirection = 0;
string g_levelFlipState = "NONE";
double g_levelFlipScore = 0.0;
double g_emaCompressionScore = 0.0;
string g_premiumDiscountState = "EQUILIBRIUM";
string g_fvgLifecycleState = "NONE";
string g_orderBlockLifecycleState = "NONE";
double g_indicatorLocationScore = 50.0;
double g_indicatorMomentumScore = 50.0;
double g_indicatorStructureScore = 50.0;
double g_indicatorVolatilityScore = 50.0;
double g_indicatorExecutionScore = 50.0;
double g_indicatorCostSpaceScore = 50.0;
double g_indicatorCompositeScore = 50.0;
double g_indicatorTargetPrice = 0.0;
string g_indicatorDecision = "OBSERVE";
string g_indicatorWhy = "DATA_NOT_READY";
datetime g_indicatorWaitStartedAt = 0;
int g_indicatorWaitDirection = 0;
string g_indicatorWaitReason = "NONE";
double g_indicatorHistoryWinProbability = 0.0;
int g_indicatorHistorySamples = 0;
double g_indicatorHistoryExpectedValue = 0.0;
double g_indicatorHistoryEvScore = 50.0;

double g_fillUrgency = 0.0;
int    g_fillExpectedPositions = 1;
string g_fillPhase = "STRICT";
string g_fillBlockReason = "NONE";
string g_lastEntryReason = "NONE";
string g_lastCloseReason = "NONE";

// Strategy Tester audit counters. These never affect live decisions.
datetime g_testCycleStartedAt = 0;
int    g_testCycleDirection = 0;
int    g_testCycleTarget = 0;
double g_testCycleMae = 0.0;
double g_testCycleMfe = 0.0;
bool   g_testCycleFillRecorded = false;
int    g_testCycleSamples = 0;
double g_testMaeSum = 0.0;
double g_testMfeSum = 0.0;
double g_testProfitCaptureSum = 0.0;
int    g_testProfitCaptureSamples = 0;
double g_testFillSecondsSum = 0.0;
int    g_testFillSamples = 0;
int    g_testFillWithin600 = 0;
int    g_testEntryCount = 0;
int    g_testTerminalChaseCount = 0;
int    g_testSameSideChurnCount = 0;
datetime g_testLastBasketClosedAt = 0;
int    g_testLastBasketDirection = 0;
datetime g_testAnchorOpenedAt = 0;
bool   g_testAnchorGreenSeen = false;
double g_testAnchorMae5 = 0.0;
double g_testAnchorMae15 = 0.0;
double g_testAnchorMae30 = 0.0;
double g_testAnchorMae60 = 0.0;
double g_testAnchorMae5Sum = 0.0;
double g_testAnchorMae15Sum = 0.0;
double g_testAnchorMae30Sum = 0.0;
double g_testAnchorMae60Sum = 0.0;
double g_testTimeToGreenSum = 0.0;
int    g_testTimeToGreenSamples = 0;
int    g_testGreenWithin60 = 0;
double g_testIndicatorCompositeSum = 0.0;
int    g_testIndicatorEntrySamples = 0;
int    g_testIndicatorWaitEvents = 0;
double g_testIndicatorWaitSecondsSum = 0.0;
int    g_testIndicatorHighQualityEntries = 0;

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
string   g_basketJournalMarketCycle = "INITIALIZING";
string   g_basketJournalPrecisionState = "LEGACY";
string   g_basketJournalLiquidityState = "NONE";
string   g_basketJournalMicroStructureState = "NEUTRAL";
string   g_basketJournalFvgState = "NONE";
double   g_basketJournalPrecisionScore = 50.0;
double   g_basketJournalEntryDistanceAtr = 0.0;
double   g_basketJournalSetupEvScore = 50.0;
double   g_basketJournalIndicatorLocation = 50.0;
double   g_basketJournalIndicatorMomentum = 50.0;
double   g_basketJournalIndicatorStructure = 50.0;
double   g_basketJournalIndicatorVolatility = 50.0;
double   g_basketJournalIndicatorExecution = 50.0;
double   g_basketJournalIndicatorCostSpace = 50.0;
double   g_basketJournalIndicatorComposite = 50.0;
string   g_basketJournalVolumeProfileState = "DATA_NOT_READY";
string   g_basketJournalSqueezeState = "NORMAL";
string   g_basketJournalMacdState = "NEUTRAL";
string   g_basketJournalLevelFlipState = "NONE";
string   g_basketJournalPremiumDiscountState = "EQUILIBRIUM";

long     g_basketJournalAutoDecisionId = 0;
long     g_pendingBasketAutoDecisionId = 0;
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
string   g_pendingBasketMarketCycle = "INITIALIZING";
string   g_pendingBasketPrecisionState = "LEGACY";
string   g_pendingBasketLiquidityState = "NONE";
string   g_pendingBasketMicroStructureState = "NEUTRAL";
string   g_pendingBasketFvgState = "NONE";
double   g_pendingBasketPrecisionScore = 50.0;
double   g_pendingBasketEntryDistanceAtr = 0.0;
double   g_pendingBasketSetupEvScore = 50.0;
double   g_pendingBasketIndicatorLocation = 50.0;
double   g_pendingBasketIndicatorMomentum = 50.0;
double   g_pendingBasketIndicatorStructure = 50.0;
double   g_pendingBasketIndicatorVolatility = 50.0;
double   g_pendingBasketIndicatorExecution = 50.0;
double   g_pendingBasketIndicatorCostSpace = 50.0;
double   g_pendingBasketIndicatorComposite = 50.0;
string   g_pendingBasketVolumeProfileState = "DATA_NOT_READY";
string   g_pendingBasketSqueezeState = "NORMAL";
string   g_pendingBasketMacdState = "NEUTRAL";
string   g_pendingBasketLevelFlipState = "NONE";
string   g_pendingBasketPremiumDiscountState = "EQUILIBRIUM";

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
   SetChartStatusText("VERSION", "EA v" + SCENOVA_EA_VERSION, 137, 9, C'104,117,142');
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
   int heartbeatAge = g_lastSuccessfulHeartbeat > 0
      ? (int)MathMax(0, TimeCurrent() - g_lastSuccessfulHeartbeat)
      : -1;
   int connectedFreshSeconds = MathMax(9, InpHeartbeatSeconds * 4);
   bool serverFresh = heartbeatAge >= 0 && heartbeatAge <= connectedFreshSeconds;
   bool serverWithinLease = heartbeatAge >= 0 && heartbeatAge <= InpMaxOfflineLeaseSeconds;
   string connectionText = !terminalOnline
      ? "MT5 OFFLINE"
      : serverFresh
         ? "CONNECTED"
         : serverWithinLease ? "RECONNECTING" : "CONNECTING";
   color statusColor = !terminalOnline
      ? clrTomato
      : serverFresh ? clrLimeGreen : clrGold;
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
   g_raceCloseAllProfitEnabled = InpRaceCloseAllProfitEnabled;
   g_raceCloseAllProfitMoney = MathMax(0.01, InpRaceCloseAllProfitMoney);
   g_engineMode = InpEngineMode;
   StringToUpper(g_engineMode);
   if(g_engineMode != "RACE" && g_engineMode != "ZERO_GRID")
      g_engineMode = "AUTO";
   g_zeroGridStepPrice = MathAbs(InpZeroGridStepPrice-2.0)<0.000001 ? 2.0 : 3.0;
   g_zeroGridLowVolatilityEnabled = InpZeroGridLowVolatilityEnabled;
   g_zeroGridLevelsPerSide = (int)MathMax(1.0,MathMin((double)ZERO_GRID_MAX_LEVELS,(double)InpZeroGridLevelsPerSide));
   g_zeroGridBaseLot = MathMax(0.01, InpZeroGridBaseLot);
   g_zeroGridMinNetProfitMoney = MathMax(0.01, InpZeroGridMinNetProfitMoney);
   g_zeroGridCloseReserveMoney = MathMax(0.0, InpZeroGridCloseReserveMoney);
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
   g_indicatorV6Mode = InpIndicatorV6Mode;
   g_indicatorActivationStage = IndicatorV6ModeName();
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
      bool apiOk = (StringFind(InpApiBase, "https://") == 0);
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
   FlipLockRemoveAllPending();
   EventKillTimer();
   DeleteTradingFibonacci();
   ReleaseEmaIntelligence();
   ClearChartStatus();
}


double OldestPrimaryPositionProfit()
{
   datetime oldest=0;
   double profit=0.0;
   bool found=false;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic)
         continue;
      datetime opened=(datetime)PositionGetInteger(POSITION_TIME);
      if(!found || opened<oldest)
      {
         found=true;
         oldest=opened;
         profit=PositionGetDouble(POSITION_PROFIT);
      }
   }
   return found ? profit : 0.0;
}

void TesterStartCycleIfNeeded(int direction,int positionsBefore)
{
   if(!MQLInfoInteger(MQL_TESTER))
      return;

   g_testEntryCount++;
   double adverseZone = direction > 0 ? g_supplyZoneScore : g_demandZoneScore;
   double space = SpaceToTargetAtr(direction);
   if(adverseZone >= 75.0 && space <= 0.30)
      g_testTerminalChaseCount++;

   if(positionsBefore > 0 || g_testCycleStartedAt > 0)
      return;

   // Capture the V6 context at the anchor entry. This is measurement only and
   // never changes Strategy Tester execution.
   RefreshIndicatorV6Scores(direction,MomentumPoints());
   g_testIndicatorCompositeSum += g_indicatorCompositeScore;
   g_testIndicatorEntrySamples++;
   if(g_indicatorCompositeScore>=78.0)
      g_testIndicatorHighQualityEntries++;

   if(g_testLastBasketClosedAt > 0 &&
      g_testLastBasketDirection == direction &&
      TimeCurrent()-g_testLastBasketClosedAt <= 120)
      g_testSameSideChurnCount++;

   g_testCycleStartedAt = TimeCurrent();
   g_testCycleDirection = direction;
   g_testCycleTarget = MathMax(1,g_maxPositions);
   g_testCycleMae = 0.0;
   g_testCycleMfe = 0.0;
   g_testCycleFillRecorded = false;
   g_testAnchorOpenedAt = TimeCurrent();
   g_testAnchorGreenSeen = false;
   g_testAnchorMae5 = 0.0;
   g_testAnchorMae15 = 0.0;
   g_testAnchorMae30 = 0.0;
   g_testAnchorMae60 = 0.0;
}

void TesterUpdateCycleMetrics(int count,double cycleProfit)
{
   if(!MQLInfoInteger(MQL_TESTER) || count <= 0)
      return;

   if(g_testCycleStartedAt <= 0)
   {
      g_testCycleStartedAt = TimeCurrent();
      g_testCycleDirection = BasketDirection();
      g_testCycleTarget = MathMax(1,g_maxPositions);
      g_testCycleMae = 0.0;
      g_testCycleMfe = 0.0;
      g_testCycleFillRecorded = false;
   }

   g_testCycleMae = MathMax(g_testCycleMae,MathMax(0.0,-cycleProfit));
   g_testCycleMfe = MathMax(g_testCycleMfe,MathMax(0.0,cycleProfit));

   // Measure the first/anchor entry separately from later Basket rungs. These
   // metrics target the user's main complaint: entering and immediately going
   // materially negative. They are tester-only and never control live trades.
   if(g_testAnchorOpenedAt > 0)
   {
      long age=(long)MathMax(0,TimeCurrent()-g_testAnchorOpenedAt);
      double anchorProfit=OldestPrimaryPositionProfit();
      double adverse=MathMax(0.0,-anchorProfit);
      if(age<=5)  g_testAnchorMae5=MathMax(g_testAnchorMae5,adverse);
      if(age<=15) g_testAnchorMae15=MathMax(g_testAnchorMae15,adverse);
      if(age<=30) g_testAnchorMae30=MathMax(g_testAnchorMae30,adverse);
      if(age<=60) g_testAnchorMae60=MathMax(g_testAnchorMae60,adverse);
      if(!g_testAnchorGreenSeen && anchorProfit>0.0)
      {
         g_testAnchorGreenSeen=true;
         g_testTimeToGreenSum+=(double)age;
         g_testTimeToGreenSamples++;
         if(age<=60)
            g_testGreenWithin60++;
      }
   }

   if(!g_testCycleFillRecorded && count >= MathMax(1,g_testCycleTarget))
   {
      double seconds = MathMax(0.0,(double)(TimeCurrent()-g_testCycleStartedAt));
      g_testFillSecondsSum += seconds;
      g_testFillSamples++;
      if(seconds <= 600.0)
         g_testFillWithin600++;
      g_testCycleFillRecorded = true;
   }
}

void TesterFinalizeCycle(int direction,double closeProfit)
{
   if(!MQLInfoInteger(MQL_TESTER) || g_testCycleStartedAt <= 0)
      return;

   g_testCycleSamples++;
   g_testMaeSum += g_testCycleMae;
   g_testMfeSum += g_testCycleMfe;
   g_testAnchorMae5Sum += g_testAnchorMae5;
   g_testAnchorMae15Sum += g_testAnchorMae15;
   g_testAnchorMae30Sum += g_testAnchorMae30;
   g_testAnchorMae60Sum += g_testAnchorMae60;
   if(g_testCycleMfe > 0.0)
   {
      g_testProfitCaptureSum += MathMax(
         0.0,
         MathMin(1.0,MathMax(0.0,closeProfit)/g_testCycleMfe)
      );
      g_testProfitCaptureSamples++;
   }

   g_testLastBasketClosedAt = TimeCurrent();
   g_testLastBasketDirection = direction;
   g_testCycleStartedAt = 0;
   g_testCycleDirection = 0;
   g_testCycleTarget = 0;
   g_testCycleMae = 0.0;
   g_testCycleMfe = 0.0;
   g_testCycleFillRecorded = false;
   g_testAnchorOpenedAt = 0;
   g_testAnchorGreenSeen = false;
   g_testAnchorMae5 = 0.0;
   g_testAnchorMae15 = 0.0;
   g_testAnchorMae30 = 0.0;
   g_testAnchorMae60 = 0.0;
}

double OnTester()
{
   double avgMae = g_testCycleSamples > 0
      ? g_testMaeSum/g_testCycleSamples : 0.0;
   double avgMfe = g_testCycleSamples > 0
      ? g_testMfeSum/g_testCycleSamples : 0.0;
   double capture = g_testProfitCaptureSamples > 0
      ? g_testProfitCaptureSum/g_testProfitCaptureSamples*100.0 : 0.0;
   double avgFillSeconds = g_testFillSamples > 0
      ? g_testFillSecondsSum/g_testFillSamples : 0.0;
   double fill10Rate = g_testFillSamples > 0
      ? (double)g_testFillWithin600/g_testFillSamples*100.0 : 0.0;
   double terminalRate = g_testEntryCount > 0
      ? (double)g_testTerminalChaseCount/g_testEntryCount*100.0 : 0.0;
   double churnRate = g_testCycleSamples > 0
      ? (double)g_testSameSideChurnCount/g_testCycleSamples*100.0 : 0.0;
   double entryMae5 = g_testCycleSamples > 0
      ? g_testAnchorMae5Sum/g_testCycleSamples : 0.0;
   double entryMae15 = g_testCycleSamples > 0
      ? g_testAnchorMae15Sum/g_testCycleSamples : 0.0;
   double entryMae30 = g_testCycleSamples > 0
      ? g_testAnchorMae30Sum/g_testCycleSamples : 0.0;
   double entryMae60 = g_testCycleSamples > 0
      ? g_testAnchorMae60Sum/g_testCycleSamples : 0.0;
   double timeToGreen = g_testTimeToGreenSamples > 0
      ? g_testTimeToGreenSum/g_testTimeToGreenSamples : 0.0;
   double green60Rate = g_testCycleSamples > 0
      ? (double)g_testGreenWithin60/g_testCycleSamples*100.0 : 0.0;
   double avgIndicatorComposite = g_testIndicatorEntrySamples > 0
      ? g_testIndicatorCompositeSum/g_testIndicatorEntrySamples : 0.0;
   double avgIndicatorWaitSeconds = g_testIndicatorWaitEvents > 0
      ? g_testIndicatorWaitSecondsSum/g_testIndicatorWaitEvents : 0.0;
   double highQualityEntryPct = g_testIndicatorEntrySamples > 0
      ? (double)g_testIndicatorHighQualityEntries/
        g_testIndicatorEntrySamples*100.0 : 0.0;

   PrintFormat(
      "SCENOVA_BACKTEST_V6 cycles=%d orders=%d avgMAE=%.4f avgMFE=%.4f profitCapturePct=%.2f terminalChasePct=%.2f avgFillSeconds=%.1f fillWithin10MinPct=%.2f sameSideChurnPct=%.2f entryMAE5=%.4f entryMAE15=%.4f entryMAE30=%.4f entryMAE60=%.4f avgTimeToGreenSec=%.1f greenWithin60Pct=%.2f avgIndicatorComposite=%.2f indicatorWaitEvents=%d avgIndicatorWaitSeconds=%.2f highQualityEntryPct=%.2f",
      g_testCycleSamples,
      g_testEntryCount,
      avgMae,
      avgMfe,
      capture,
      terminalRate,
      avgFillSeconds,
      fill10Rate,
      churnRate,
      entryMae5,
      entryMae15,
      entryMae30,
      entryMae60,
      timeToGreen,
      green60Rate,
      avgIndicatorComposite,
      g_testIndicatorWaitEvents,
      avgIndicatorWaitSeconds,
      highQualityEntryPct
   );

   // Native MT5 report remains authoritative for Drawdown, Win Rate and
   // Profit Factor. Return capture as an optional Custom max criterion.
   return capture;
}

// ZERO GRID V3 - deterministic symmetric breakout ladder -------------------
// Mirrors the intended floating-stop-grid concept without allowing mode leakage:
// a fixed cycle identity, nearest broker-legal live-price first triggers, exact
// inter-level step spacing, linear lot ladder, and cost-aware net-profit exit. Hedging
// keeps both sides available; Netting/Exchange locks to the first triggered side.
string EffectiveExecutionMode()
{
   // Live MT5 must never guess an execution mode at startup. The first valid
   // settings heartbeat selects the owner. Strategy Tester keeps the input
   // fallback so historical tests remain deterministic/offline.
   if(!MQLInfoInteger(MQL_TESTER) && !g_settingsSynchronized)
      return "UNSYNCED";

   string control=g_controlMode;
   StringToUpper(control);
   if(control == "ZERO_GRID") return "ZERO_GRID";
   if(control == "RACE") return "RACE";
   if(control == "AUTO" || control == "FLIP_LOCK" || control == "PARALLEL_UNIVERSE" ||
      control == "ASSISTED" || control == "MANUAL")
      return "AUTO";

   string engine=g_engineMode;
   StringToUpper(engine);
   if(engine == "ZERO_GRID" || engine == "RACE") return engine;
   return "AUTO";
}

bool ZeroGridModeEnabled()
{
   return EffectiveExecutionMode() == "ZERO_GRID";
}

double ZeroGridAllowedStep(double requested)
{
   return MathAbs(requested-2.0)<0.000001 ? 2.0 : 3.0;
}

bool ZeroGridAccountIsHedging()
{
   ENUM_ACCOUNT_MARGIN_MODE mode=(ENUM_ACCOUNT_MARGIN_MODE)AccountInfoInteger(ACCOUNT_MARGIN_MODE);
   return mode == ACCOUNT_MARGIN_MODE_RETAIL_HEDGING;
}

bool ZeroGridHedgingAllowed()
{
   if(MQLInfoInteger(MQL_TESTER))
      return true;
   return ZeroGridAccountIsHedging();
}

bool ZeroGridAccountIsNetting()
{
   ENUM_ACCOUNT_MARGIN_MODE mode=(ENUM_ACCOUNT_MARGIN_MODE)AccountInfoInteger(ACCOUNT_MARGIN_MODE);
   return mode == ACCOUNT_MARGIN_MODE_RETAIL_NETTING || mode == ACCOUNT_MARGIN_MODE_EXCHANGE;
}

string ZeroGridAccountModeLabel()
{
   if(ZeroGridAccountIsHedging()) return "HEDGING";
   if(ZeroGridAccountIsNetting()) return "NETTING";
   return "UNKNOWN";
}

bool ZeroGridStopOrdersSupported()
{
   long orderMode=SymbolInfoInteger(_Symbol,SYMBOL_ORDER_MODE);
   return (orderMode & SYMBOL_ORDER_STOP) == SYMBOL_ORDER_STOP;
}

string ZeroGridComment(bool buySide,int level)
{
   return "SaaSZeroGrid" + (buySide ? "B" : "S") + StringFormat("%02d",level);
}

bool IsZeroGridComment(string comment)
{
   return StringFind(comment,"SaaSZeroGrid") == 0;
}

string ZeroGridStateKey(string suffix)
{
   string magicPart=IntegerToString((int)(InpMagic % 1000000));
   return "SCNZG_" + IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN)) + "_" + _Symbol + "_" + magicPart + "_" + suffix;
}

void SaveZeroGridCycleState()
{
   if(g_zeroGridCenter > 0.0)
      GlobalVariableSet(ZeroGridStateKey("CENTER"),g_zeroGridCenter);
   if(g_zeroGridStartEquity > 0.0)
      GlobalVariableSet(ZeroGridStateKey("EQUITY"),g_zeroGridStartEquity);
   if(g_zeroGridCycleStartedAt > 0)
      GlobalVariableSet(ZeroGridStateKey("START"),(double)g_zeroGridCycleStartedAt);
   if(g_zeroGridCycleStepPrice > 0.0)
      GlobalVariableSet(ZeroGridStateKey("STEP"),g_zeroGridCycleStepPrice);
   if(g_zeroGridCycleLevelsPerSide > 0)
      GlobalVariableSet(ZeroGridStateKey("LEVELS"),(double)g_zeroGridCycleLevelsPerSide);
   if(g_zeroGridCycleBaseLot > 0.0)
      GlobalVariableSet(ZeroGridStateKey("BASELOT"),g_zeroGridCycleBaseLot);
   if(g_zeroGridCycleLowVolatility >= 0)
      GlobalVariableSet(ZeroGridStateKey("LOWVOL"),(double)g_zeroGridCycleLowVolatility);
}

void LoadZeroGridCycleState()
{
   if(g_zeroGridCenter <= 0.0 && GlobalVariableCheck(ZeroGridStateKey("CENTER")))
      g_zeroGridCenter=GlobalVariableGet(ZeroGridStateKey("CENTER"));
   if(g_zeroGridStartEquity <= 0.0 && GlobalVariableCheck(ZeroGridStateKey("EQUITY")))
      g_zeroGridStartEquity=GlobalVariableGet(ZeroGridStateKey("EQUITY"));
   if(g_zeroGridCycleStartedAt <= 0 && GlobalVariableCheck(ZeroGridStateKey("START")))
      g_zeroGridCycleStartedAt=(datetime)(long)GlobalVariableGet(ZeroGridStateKey("START"));
   if(g_zeroGridCycleStepPrice <= 0.0 && GlobalVariableCheck(ZeroGridStateKey("STEP")))
      g_zeroGridCycleStepPrice=GlobalVariableGet(ZeroGridStateKey("STEP"));
   if(g_zeroGridCycleLevelsPerSide <= 0 && GlobalVariableCheck(ZeroGridStateKey("LEVELS")))
      g_zeroGridCycleLevelsPerSide=(int)MathRound(GlobalVariableGet(ZeroGridStateKey("LEVELS")));
   if(g_zeroGridCycleBaseLot <= 0.0 && GlobalVariableCheck(ZeroGridStateKey("BASELOT")))
      g_zeroGridCycleBaseLot=GlobalVariableGet(ZeroGridStateKey("BASELOT"));
   if(g_zeroGridCycleLowVolatility < 0)
   {
      if(GlobalVariableCheck(ZeroGridStateKey("LOWVOL")))
         g_zeroGridCycleLowVolatility=(int)MathRound(GlobalVariableGet(ZeroGridStateKey("LOWVOL")));
      else if(g_zeroGridCycleStepPrice > 0.0)
         g_zeroGridCycleLowVolatility=g_zeroGridCycleStepPrice < 1.0 ? 1 : 0;
   }
}

void ResetZeroGridCycleState()
{
   g_zeroGridCenter=0.0;
   g_zeroGridStartEquity=0.0;
   g_zeroGridCycleStartedAt=0;
   g_zeroGridClosing=false;
   g_zeroGridLastExitBurstMs=0;
   g_zeroGridCycleStepPrice=0.0;
   g_zeroGridCycleLevelsPerSide=0;
   g_zeroGridCycleBaseLot=0.0;
   g_zeroGridCycleLowVolatility=-1;
   string keys[7]={"CENTER","EQUITY","START","STEP","LEVELS","BASELOT","LOWVOL"};
   for(int i=0;i<ArraySize(keys);i++)
      if(GlobalVariableCheck(ZeroGridStateKey(keys[i])))
         GlobalVariableDel(ZeroGridStateKey(keys[i]));
}

bool ZeroGridOwnsSelectedPosition()
{
   if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
      PositionGetInteger(POSITION_MAGIC)!=InpMagic)
      return false;

   string comment=PositionGetString(POSITION_COMMENT);
   if(ZeroGridAccountIsHedging())
      return IsZeroGridComment(comment);

   LoadZeroGridCycleState();
   if(g_zeroGridCycleStartedAt<=0)
      return false;
   datetime opened=(datetime)PositionGetInteger(POSITION_TIME);
   return opened >= g_zeroGridCycleStartedAt-5;
}
