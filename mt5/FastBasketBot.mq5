#property strict
#property version   "1.1.31"
#define SCENOVA_EA_VERSION "1.1.31"
#define SCENOVA_PRODUCT_VERSION "1.1.31"
#define SCENOVA_BUILD_ID "SOURCE"
#define SCENOVA_RUNTIME_CONTRACT "RACE_CONFIGURED_LOSS_ONLY_V1"
#property description "MT5 SaaS Fast Basket Engine - Cloud/Local"
#property description "Use Demo and forward testing before live trading."

enum ENUM_ENTRY_MODE
{
   ENTRY_AUTO_MOMENTUM = 0,
   ENTRY_BUY_ONLY      = 1,
   ENTRY_SELL_ONLY     = 2
};

// AUTO-only decision context -----------------------------------------------
// These structures are intentionally isolated from RACE/Turbo and the legacy
// ASSISTED/MANUAL execution paths. AUTO evaluates BUY and SELL independently
// and publishes only the selected side into the shared execution telemetry.
struct AUTO_LEVELS
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

struct AUTO_PULLBACK
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

struct AUTO_SIDE
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
input bool            InpCloudRelay           = false;
input string          InpStartupSymbol        = "";
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
input double          InpRacePerPositionProfitMoney = 0.50;
// COUNTER has one exit only: close each owned position at this money profit.
input double          InpCounterPerPositionProfitMoney = 0.50;
#define LOCAL_EXECUTION_PLANE_V1 "MT5_TICK_DIRECT_V1"
#define LOCAL_EXECUTION_NETWORK_QUIET_MS 300
#define LOCAL_EXECUTION_HEARTBEAT_MAX_DEFER_MS 5000
#define LOCAL_EXECUTION_LIVE_HTTP_TIMEOUT_MS 120
#define LOCAL_EXECUTION_HEARTBEAT_HTTP_TIMEOUT_MS 1200
#define FLAT_HEARTBEAT_HTTP_TIMEOUT_MS 4000
#define FLAT_HEARTBEAT_RETRY_DELAY_MS 100
#define CLOUD_RELAY_PENDING_CODE -5902
#define CLOUD_LIVE_EXECUTION_INTERVAL_MS 200
#define ZERO_GRID_JOURNAL_FORCE_INTERVAL_MS 3000
#define ZERO_GRID_JOURNAL_HTTP_TIMEOUT_MS 500
#define LOCAL_DYNAMIC_PROTECTION_INTERVAL_MS 150
#define DEFERRED_DEAL_JOURNAL_MAX 256
#define AUTO_POLICY "AUTO_BALANCED_EXIT"
#define AUTO_EXIT_CYCLE_GRACE_SECONDS 30
#define AUTO_EXIT_LAST_FILL_GRACE_SECONDS 15
#define AUTO_EXIT_CONFIRM_SECONDS 10
#define AUTO_EXIT_SEVERE_CONFIRM_SECONDS 6
// First-entry quality gate. AUTO must observe a fresh, continuously valid
// setup after RUNNING is authorized; historical chart context alone is not
// enough to fire immediately on the first market tick.
#define AUTO_FIRST_ENTRY_START_WARMUP_SECONDS 5
#define AUTO_FIRST_ENTRY_STABLE_CONFIRM_SECONDS 2
#define AUTO_FIRST_ENTRY_SIGNAL_GAP_SECONDS 2
#define AUTO_FIRST_ENTRY_MIN_NET_RR 1.10
// A wrong-direction exit is an emergency quality correction, not a tiny-loss
// scalper. Require a meaningful fraction of the original SL distance first.
#define AUTO_WRONG_DIRECTION_MIN_R 0.25
// AUTO initial Broker SL standard for XAUUSD: use a fixed 0.01-lot reference
// so the price distance corresponds to about USD 10 on a standard USD account.
// Actual configured Lot never changes the SL price distance; e.g. 0.02 lot
// keeps the same SL price and therefore carries about twice the money risk.
#define AUTO_REFERENCE_SL_LOT 0.01
#define AUTO_REFERENCE_SL_USD 10.00
// "ประมาณ USD 10" means a dynamic band, not a fixed USD 10 floor.
// ATR/structure chooses the actual stop inside this band.
#define AUTO_REFERENCE_SL_MIN_RATIO 0.80
#define AUTO_REFERENCE_SL_MAX_RATIO 1.20
// Non-XAU / non-USD fallback remains volatility based.
#define AUTO_STOP_ATR_FLOOR 1.25
#define AUTO_STOP_ATR_CAP 2.40
#define AUTO_STOP_SPREAD_MULTIPLIER 4.00
#define RACE_VOLUME_WINDOW_SECONDS 30
#define RACE_SIGNAL_MAX_WAIT_SECONDS 60
#define RACE_VOLUME_MIN_DOMINANCE 0.55
// RACE 1.1.20 entry brain reads about 20 completed M5 candles. The legacy
// 30-second sampler remains for compatibility telemetry only and does not
// choose RACE entry, add, reversal or profit-run direction.
#define RACE_M5_LOOKBACK_BARS 20
#define RACE_FILL_INTERVAL_MS 2000
#define RACE_FILL_PROGRESS_ATR 0.03
#define RACE_ZONE_BREAK_BUFFER_ATR 0.12
#define RACE_ZONE_NEAR_ATR 0.18
#define RACE_AUTO_STOP_ATR_BASE 1.50
#define RACE_AUTO_STOP_ATR_WIDE 1.60
#define RACE_AUTO_STOP_ATR_FLOOR 1.00
#define RACE_AUTO_STOP_ATR_CAP 1.80
#define RACE_PROFIT_ARM_MIN_LOCK_RATIO 0.70
#define RACE_VOLUME_HISTORY_SECONDS 60
#define RACE_EXIT_CYCLE_GRACE_SECONDS 15
#define RACE_EXIT_LAST_FILL_GRACE_SECONDS 10
#define RACE_EXIT_CONFIRM_SECONDS 8
#define RACE_EXIT_SEVERE_CONFIRM_SECONDS 5
// COUNTER entry pacing is internal operational safety, not a trading signal.
#define COUNTER_FILL_INTERVAL_MS 1000
#define COUNTER_MAX_ORDERS_PER_MINUTE 30
// COUNTER Recenter is internal inventory balance protection. It is based only
// on BUY/SELL entry-price geometry and market volatility, never account size.
#define COUNTER_RECENTER_MIN_GAP_POINTS 20.0
#define COUNTER_RECENTER_SPREAD_MULTIPLIER 8.0
#define COUNTER_RECENTER_ATR_M1_MULTIPLIER 1.10
#define COUNTER_RECENTER_ATR_M5_MULTIPLIER 0.45
#define COUNTER_RECENTER_RELEASE_RATIO 0.65
// ZERO GRID is isolated from AUTO/RACE and requires an MT5 Hedging account.
#define ZERO_GRID_MAX_LEVELS 30
#define ZERO_GRID_DEFAULT_LEVELS 3
#define ZERO_GRID_DEFAULT_BASE_LOT 0.03
#define ZERO_GRID_LOW_VOL_FIRST_GAP 2.00
#define ZERO_GRID_LOW_VOL_STEP_PRICE 1.00
#define ZERO_GRID_PENDING_REQUEST_GUARD_MS 10000
#define ZERO_GRID_FLAT_CONFIRM_MS 1500
input double          InpZeroGridFirstGapPrice = 3.0; // distance from cycle center to L1
input double          InpZeroGridStepPrice     = 3.0; // distance between subsequent levels
input int             InpZeroGridLevelsPerSide = ZERO_GRID_DEFAULT_LEVELS;
input double          InpZeroGridBaseLot       = ZERO_GRID_DEFAULT_BASE_LOT; // allowed: 0.03 / 0.06 / 0.09
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
input bool            InpAdaptiveRescueEngine  = false; // Disabled: no recovery hedge/opposite rescue orders
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
bool   g_serverEntrySuppressed = false;
bool   g_safeStopDrainRequested = false;
bool   g_trailArmed = false;
double g_peakProfit = 0.0;
double g_dayStartEquity = 0.0;
// Daily P/L is accounted by execution owner. g_dailyClosedProfit remains a
// compatibility/telemetry mirror of the currently active owner only.
double g_dailyClosedProfit = 0.0;
double g_dailyClosedProfitAuto = 0.0;
double g_dailyClosedProfitRace = 0.0;
double g_dailyClosedProfitCounter = 0.0;
double g_dailyClosedProfitFlipLock = 0.0;
double g_dailyClosedProfitManual = 0.0;
bool   g_dailyProfitLocked = false;
bool   g_dailyLossLocked = false;
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
ulong  g_lastMarketTickMs = 0;
ulong  g_lastCloudLiveExecutionSnapshotMs = 0;
ulong  g_lastTimerEventTickMs = 0;
ulong  g_timerArmedAtTickMs = 0;
datetime g_lastSuccessfulHeartbeat = 0;
datetime g_lastRunAuthorization = 0;
datetime g_lastServerContactAt = 0;
long   g_lastHeartbeatLatencyMs = 0;
int    g_lastHeartbeatHttpStatus = 0;
int    g_lastHttpTransportError = 0;
bool   g_cloudHeartbeatPending = false;
string g_cloudHeartbeatRequestId = "";
string g_cloudHeartbeatRequestFile = "";
string g_cloudHeartbeatResponseFile = "";
ulong  g_cloudHeartbeatStartedMs = 0;
int    g_cloudHeartbeatTimeoutMs = 0;
long   g_cloudHeartbeatLastLatencyMs = 0;
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

// Runtime mirrors above keep backward compatibility. These are the authoritative
// per-mode risk profiles delivered by the Server and are selected from the live
// Basket owner, not merely the currently clicked website mode.
double g_autoMaxBasketLoss;
double g_autoDailyLoss;
double g_autoDailyProfitTarget;
double g_raceMaxBasketLoss;
double g_raceDailyLoss;
double g_raceDailyProfitTarget;
double g_flipLockMaxBasketLoss;
double g_flipLockDailyLoss;
double g_flipLockDailyProfitTarget;
double g_manualMaxBasketLoss;
double g_manualDailyLoss;
double g_manualDailyProfitTarget;

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
double g_zeroGridFirstGapPrice = 3.0;
double g_zeroGridStepPrice = 3.0;
int    g_zeroGridLevelsPerSide = ZERO_GRID_DEFAULT_LEVELS;
double g_zeroGridBaseLot = ZERO_GRID_DEFAULT_BASE_LOT;
double g_zeroGridMinNetProfitMoney = 0.50;
double g_zeroGridCloseReserveMoney = 0.20;
double g_zeroGridCenter = 0.0;
double g_zeroGridStartEquity = 0.0;
datetime g_zeroGridCycleStartedAt = 0;
bool   g_zeroGridClosing = false;
ulong  g_zeroGridLastExitBurstMs = 0;
ulong  g_zeroGridFlatObservedMs = 0;
ulong  g_zeroGridPendingBuyRequestMs[ZERO_GRID_MAX_LEVELS+1];
ulong  g_zeroGridPendingSellRequestMs[ZERO_GRID_MAX_LEVELS+1];
// V3 locks geometry for the lifetime of one cycle. Web setting changes are
// applied only while flat, never halfway through a filled ladder.
double g_zeroGridCycleFirstGapPrice = 0.0;
double g_zeroGridCycleStepPrice = 0.0;
int    g_zeroGridCycleLevelsPerSide = 0;
double g_zeroGridCycleBaseLot = 0.0;
int    g_zeroGridCycleLowVolatility = -1;
AUTO_LEVELS g_autoLevels;
AUTO_SIDE g_autoBuy;
AUTO_SIDE g_autoSell;
string g_autoPhase = "INITIALIZING";
string g_autoPhaseCandidate = "INITIALIZING";
int g_autoPhaseCandidateTicks = 0;
datetime g_autoPhaseSince = 0;
double g_autoLastMomentum = 0.0;
double g_autoPreviousMomentum = 0.0;
long g_autoDecisionId = 0;
string g_autoDecisionKind = "NONE";
string g_autoDecisionReason = "NONE";
string g_autoRejectReason = "NONE";
string g_autoDirectionChangeReason = "NONE";
string g_autoAddReason = "NONE";
double g_autoAggregateRiskMoney = 0.0;
double g_autoBasketStopPrice = 0.0;
double g_autoBasketTargetPrice = 0.0;
datetime g_autoBasketStartedAt = 0;
datetime g_autoLastFillAt = 0;
datetime g_autoExitCandidateSince = 0;
double g_autoExitCandidatePeakAdverse = 0.0;
double g_autoLotCeiling = 0.0;
double g_autoPeakProfit = 0.0;
datetime g_autoFirstEntryRunStartedAt = 0;
datetime g_autoFirstEntryCandidateSince = 0;
datetime g_autoFirstEntryCandidateLastSeenAt = 0;
int g_autoFirstEntryCandidateDirection = 0;
double g_autoConfidence = 0.0;
double g_autoWinProbability = 0.0;
int g_autoWinSamples = 0;
double g_autoAverageNet = 0.0;
int    g_raceDirection = 0;
double g_racePeakProfit = 0.0;
bool   g_raceProfitArmed = false;
bool   g_raceTargetProfitArmed = false;
bool   g_raceRecoveryWatch = false;
string g_raceState = "IDLE";
datetime g_raceCycleStartedAt = 0;
datetime g_raceLastFillAt = 0;
ulong  g_raceLastFillMs = 0;
double g_raceLastFillPrice = 0.0;
int    g_raceLastFillDirection = 0;
ulong  g_raceLastExitBurstMs = 0;
datetime g_raceExitCandidateSince = 0;
double g_raceExitCandidatePeakAdverse = 0.0;
bool   g_raceCloseAllProfitEnabled = true;
double g_raceCloseAllProfitMoney = 0.50;
string g_raceProfitTargetMode = "BASKET";
double g_racePerPositionProfitMoney = 0.50;
// COUNTER keeps no SL/TP/basket/daily/recovery logic. Recenter only prevents
// its own BUY/SELL inventory averages from drifting farther apart over time.
double g_counterPerPositionProfitMoney = 0.50;
datetime g_counterOrderWindowStart = 0;
int      g_counterOrdersInWindow = 0;
bool     g_counterRecenterActive = false;
double   g_counterRecenterGapPoints = 0.0;
double   g_counterRecenterTriggerPoints = 0.0;
// Legacy 30-second order-flow storage/functions are retained only for source
// compatibility; OnTick no longer samples them. RACE 1.1.20 trading decisions
// do NOT read this window. COUNTER keeps its existing 2-second Bid helper.
datetime g_raceVolumeBucketSecond[RACE_VOLUME_HISTORY_SECONDS];
double   g_raceVolumeBucketBuy[RACE_VOLUME_HISTORY_SECONDS];
double   g_raceVolumeBucketSell[RACE_VOLUME_HISTORY_SECONDS];
int      g_raceVolumeBucketSamples[RACE_VOLUME_HISTORY_SECONDS];
datetime g_raceVolumeWarmupStartedAt = 0;
datetime g_raceVolumeLastSampleAt = 0;
double   g_raceVolumeLastMid = 0.0;
// RACE VNext Phase 1 telemetry. These fields are isolated to RACE and never
// participate in AUTO/MANUAL/FLIP/ZERO execution.
double   g_raceVNextFlowScore = 0.0;
int      g_raceVNextStructureDirection = 0;
int      g_raceVNextRejectionDirection = 0;
string   g_raceVNextLegPhase = "UNKNOWN";
double   g_raceVNextDecisionScore = 0.0;
// RACE VNext Phase 2 exposure/loss telemetry. These never alter another mode.
double   g_raceExposureTotalLot = 0.0;
double   g_raceExposureProjectedLot = 0.0;
double   g_raceExposureAverageEntry = 0.0;
double   g_raceExposureMoneyPerPoint = 0.0;
double   g_raceExposureEstimatedCostMoney = 0.0;
double   g_raceExposureNoisePoints = 0.0;
double   g_raceExposureNoiseMoney = 0.0;
double   g_raceExposureProjectedStructureLossMoney = 0.0;
double   g_raceExposureStructureInvalidPrice = 0.0;
bool     g_raceExposureRiskMismatch = false;
string   g_raceLossState = "NORMAL";
// RACE VNext Phase 3 re-entry observer. Kept outside ResetRaceRuntime so the
// flat-transition clock survives the normal per-cycle state reset.
bool     g_raceHadExposure = false;
bool     g_raceReentryPending = false;
datetime g_raceReentryStartedAt = 0;
double   g_raceLastObservedCycleProfit = 0.0;
int      g_raceReentryObserveSeconds = 6;
// RACE VNext Phase 4 news-pause telemetry. RACE only; existing baskets are
// never force-closed merely because an event window became active.
bool     g_raceNewsPauseActive = false;
string   g_raceNewsPauseEvent = "NONE";
int      g_raceNewsPauseMinutes = 9999;
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
bool g_rescueEnabled = false;
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
ulong  g_lastDynamicProtectionTickMs = 0;
int    g_journalSent = 0;
ulong  g_deferredJournalTickets[DEFERRED_DEAL_JOURNAL_MAX];
bool   g_deferredJournalRescue[DEFERRED_DEAL_JOURNAL_MAX];
int    g_deferredJournalHead = 0;
int    g_deferredJournalCount = 0;
ulong  g_lastZeroGridJournalAttemptMs = 0;
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

   // MetaTrader may briefly report TERMINAL_CONNECTED=false while the broker
   // session is renegotiating even though the next tick/heartbeat is healthy.
   // Debounce only the chart label; trading permission checks continue to read
   // TerminalConnectedNow() directly and are not relaxed by this UI grace.
   static ulong terminalDisconnectedSinceMs = 0;
   ulong statusNowMs = GetTickCount64();
   if(terminalOnline)
      terminalDisconnectedSinceMs = 0;
   else if(terminalDisconnectedSinceMs == 0)
      terminalDisconnectedSinceMs = statusNowMs;

   bool terminalOfflineConfirmed =
      !terminalOnline &&
      statusNowMs >= terminalDisconnectedSinceMs &&
      statusNowMs - terminalDisconnectedSinceMs >= 5000;

   string connectionText = !terminalOnline
      ? (terminalOfflineConfirmed ? "MT5 OFFLINE" : "RECONNECTING")
      : serverFresh
         ? "CONNECTED"
         : serverWithinLease ? "RECONNECTING" : "CONNECTING";
   color statusColor = terminalOfflineConfirmed
      ? clrTomato
      : terminalOnline && serverFresh ? clrLimeGreen : clrGold;
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

bool ArmRuntimeTimer()
{
   EventKillTimer();

   // Production heartbeat/control does not need a 200 ms timer. A one-second
   // system timer is intentionally used because it remains independent from
   // market ticks while avoiding high-resolution startup/queue edge cases on
   // unattended Windows Server terminals. Price-sensitive execution remains
   // tick-driven in OnTick().
   for(int attempt=1; attempt<=5; attempt++)
   {
      ResetLastError();
      if(EventSetTimer(1))
      {
         g_timerArmedAtTickMs=GetTickCount64();
         g_lastTimerEventTickMs=0;
         Print("SCENOVA runtime timer armed. period=1s attempt=",attempt);
         return true;
      }

      int err=GetLastError();
      Print("SCENOVA runtime timer arm failed. attempt=",attempt," error=",err);
      Sleep(200);
   }

   return false;
}

bool PublishEaAttachMarker()
{
   if(MQLInfoInteger(MQL_TESTER))
      return true;

   ResetLastError();
   int ready=FileOpen("scenova-ea-ready.txt",FILE_WRITE|FILE_TXT|FILE_ANSI,0,CP_UTF8);
   if(ready==INVALID_HANDLE)
   {
      Print("SCENOVA attach marker failed. error=",GetLastError());
      return false;
   }

   FileWriteString(
      ready,
      SCENOVA_EA_VERSION+"\r\n"+
      InpInstanceId+"\r\n"+
      IntegerToString((long)TimeLocal())
   );
   FileFlush(ready);
   FileClose(ready);
   return true;
}

bool SwitchCloudChartToExactStartupSymbol()
{
   if(!InpCloudRelay)
      return false;

   string requested=InpStartupSymbol;
   if(StringLen(requested)<=0)
      return false;

   // The Web/API already validated this exact broker-native symbol against the
   // connected MT5 account. Never add/remove suffixes and never substitute a
   // sibling symbol such as XAUUSD/XAUUSDm/XAUUSDc.
   if(StringCompare(requested,_Symbol,false)==0)
      return false;

   if(!SymbolSelect(requested,true))
   {
      Print("SCENOVA CLOUD SYMBOL: exact symbol unavailable requested=",requested,
            " current=",_Symbol);
      return false;
   }

   ResetLastError();
   if(!ChartSetSymbolPeriod(0,requested,PERIOD_M5))
   {
      Print("SCENOVA CLOUD SYMBOL: exact chart switch failed ",
            _Symbol," -> ",requested,
            " error=",GetLastError());
      return false;
   }

   Print("SCENOVA CLOUD SYMBOL: exact symbol selected ",
         _Symbol," -> ",requested);
   return true;
}

int OnInit()
{
   for(int t = 0; t < EMA_TF_COUNT; t++)
      for(int p = 0; p < EMA_PERIOD_COUNT; p++)
         g_emaHandles[t][p] = INVALID_HANDLE;
   for(int p = 0; p < EMA_PERIOD_COUNT; p++)
      g_emaChartHandles[p] = INVALID_HANDLE;

   if(!MQLInfoInteger(MQL_TESTER))
   {
      bool apiOk = (StringFind(InpApiBase, "https://") == 0);
      if(!apiOk || StringLen(InpInstanceId) < 8 || StringLen(InpInstallToken) < 8)
      {
         Print("SCENOVA CONFIG ERROR: connection settings are missing. Load SCENOVA-FastBasketBot.set in Inputs.");
         RenderChartStatus("CONFIG REQUIRED", clrTomato, "Load SCENOVA-FastBasketBot.set");
         return(INIT_PARAMETERS_INCORRECT);
      }

      // Cloud Symbol is customer-confirmed and broker-native. The EA must
      // run on that exact chart only; it is never allowed to guess a sibling
      // suffix or continue on a different symbol.
      if(StringLen(InpStartupSymbol)<=0)
      {
         Print("SCENOVA CONFIG ERROR: exact startup symbol is missing.");
         RenderChartStatus("SYMBOL REQUIRED", clrTomato, "Confirm XAU Symbol on SCENOVA");
         return(INIT_PARAMETERS_INCORRECT);
      }

      if(StringCompare(InpStartupSymbol,_Symbol,false)!=0)
      {
         if(SwitchCloudChartToExactStartupSymbol())
            return(INIT_SUCCEEDED);

         Print("SCENOVA CONFIG ERROR: exact startup symbol unavailable. requested=",
               InpStartupSymbol," current=",_Symbol);
         RenderChartStatus("SYMBOL MISMATCH", clrTomato, InpStartupSymbol);
         return(INIT_FAILED);
      }

      // Do not publish the Worker-ready marker yet. A chart can load the
      // EA far enough to reach this point and still fail later in OnInit before
      // Cloud heartbeat/control is alive. The marker is published only after
      // initialization, initial heartbeat queueing and timer arming succeed.
   }

   g_lot = InpLot;
   g_maxPositions = InpMaxPositions;
   g_triggerMoney = InpBasketTriggerMoney;
   g_trailMoney = InpBasketTrailMoney;
   g_maxBasketLoss = InpMaxBasketLossMoney;
   g_dailyLoss = InpDailyLossMoney;
   g_dailyProfitTarget = InpDailyProfitTargetMoney;

   g_autoMaxBasketLoss = g_maxBasketLoss;
   g_autoDailyLoss = g_dailyLoss;
   g_autoDailyProfitTarget = g_dailyProfitTarget;
   g_raceMaxBasketLoss = g_maxBasketLoss;
   g_raceDailyLoss = g_dailyLoss;
   g_raceDailyProfitTarget = g_dailyProfitTarget;
   g_flipLockMaxBasketLoss = g_maxBasketLoss;
   g_flipLockDailyLoss = g_dailyLoss;
   g_flipLockDailyProfitTarget = g_dailyProfitTarget;
   g_manualMaxBasketLoss = g_maxBasketLoss;
   g_manualDailyLoss = g_dailyLoss;
   g_manualDailyProfitTarget = g_dailyProfitTarget;

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
   if(g_profitTargetMode == "OFF")
   {
      g_basketProfitTarget = 0.0;
      g_perPositionProfit = 0.0;
      g_profitRunTrailPercent = 0.0;
      g_triggerMoney = 0.0;
      g_trailMoney = 0.0;
   }
   else if(g_profitTargetMode == "AUTO")
   {
      // AUTO may use an explicit money Basket target. When configured, that
      // target is authoritative and closes immediately; smart profit exits
      // are bypassed until the target or a risk/loss exit is reached.
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
      // Hard Basket target means no run-on/giveback after the target.
      g_profitRunTrailPercent = 0.0;
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
   g_raceProfitTargetMode = g_raceCloseAllProfitEnabled ? "BASKET" : "OFF";
   g_racePerPositionProfitMoney = MathMax(0.01, InpRacePerPositionProfitMoney);
   g_counterPerPositionProfitMoney = MathMax(0.01, InpCounterPerPositionProfitMoney);
   g_engineMode = InpEngineMode;
   StringToUpper(g_engineMode);
   if(g_engineMode != "RACE" && g_engineMode != "COUNTER" && g_engineMode != "ZERO_GRID")
      g_engineMode = "AUTO";
   g_zeroGridFirstGapPrice = ZeroGridAllowedFirstGap(InpZeroGridFirstGapPrice);
   g_zeroGridStepPrice = ZeroGridAllowedStep(InpZeroGridStepPrice);
   g_zeroGridLevelsPerSide = (int)MathMax(1.0,MathMin((double)ZERO_GRID_MAX_LEVELS,(double)InpZeroGridLevelsPerSide));
   g_zeroGridBaseLot = ZeroGridAllowedBaseLot(InpZeroGridBaseLot);
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
   g_rescueEnabled = false; // Recovery/hedge engine permanently disabled.
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

   // Strategy Tester cannot use WebRequest. In tester mode only,
   // run the trading engine locally so historical tests work even when markets are closed.
   if(MQLInfoInteger(MQL_TESTER))
   {
      g_access = true;
      g_runAuthorized = true;
      g_state = STATE_RUNNING;
      g_lastSuccessfulHeartbeat = TimeCurrent();
      g_lastRunAuthorization = TimeCurrent();
      g_autoFirstEntryRunStartedAt = TimeCurrent();
      Print("Strategy Tester mode: SaaS heartbeat bypassed for historical testing only.");
   }

   if(!MQLInfoInteger(MQL_TESTER))
   {
      // Establish control immediately at startup instead of waiting for the
      // first timer pass. This also gives Windows/MT5 time to finish account
      // initialization before the independent runtime timer is armed.
      g_lastHeartbeatTickMs = GetTickCount64();
      g_lastHeartbeat = TimeCurrent();
      SendHeartbeat();
   }

   if(!ArmRuntimeTimer())
   {
      Print("SCENOVA FATAL: runtime timer could not be armed; refusing false-online state.");
      RenderChartStatus("TIMER ERROR",clrTomato,"Restart MT5 / check terminal log");
      return(INIT_FAILED);
   }

   if(!MQLInfoInteger(MQL_TESTER))
   {
      // Worker readiness must mean more than "the EA appeared on a chart".
      // Cloud SendHeartbeat() is non-blocking: a successful first call leaves a
      // relay request pending for the Worker. Require that request before the
      // ready marker so RELOAD/REBUILD cannot report success for a half-started
      // EA that never reaches SaaS control.
      if(InpCloudRelay && !g_cloudHeartbeatPending)
      {
         Print("SCENOVA FATAL: initial Cloud heartbeat was not queued; refusing false-ready marker.");
         RenderChartStatus("HEARTBEAT ERROR",clrTomato,"Cloud relay did not initialize");
         return(INIT_FAILED);
      }

      if(!PublishEaAttachMarker())
      {
         Print("SCENOVA FATAL: runtime-ready marker could not be published.");
         RenderChartStatus("READY ERROR",clrTomato,"Restart MT5 / check terminal files");
         return(INIT_FAILED);
      }
   }

   RefreshChartStatus(true);
   Print("Bot SaaS EA initialized. Instance=", InpInstanceId);
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   if(!MQLInfoInteger(MQL_TESTER))
      FileDelete("scenova-ea-ready.txt");
   FlipLockRemoveAllPending();
   EventKillTimer();
   DeleteTradingFibonacci();
   AutoRelease();
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
   if(control == "COUNTER") return "COUNTER";
   if(control == "FLIP_LOCK") return "FLIP_LOCK";
   if(control == "AUTO") return "AUTO";
   if(control == "MANUAL" || control == "ASSISTED" || control == "LEGACY")
      return "MANUAL";

   string engine=g_engineMode;
   StringToUpper(engine);
   if(engine == "ZERO_GRID" || engine == "RACE" || engine == "COUNTER") return engine;
   return "AUTO";
}

bool ZeroGridModeEnabled()
{
   // BTC/XBT is intentionally excluded from ZERO GRID. Its fixed-price ladder
   // geometry was designed for metals and must never create a new crypto grid.
   return !IsBitcoinSymbol() && EffectiveExecutionMode() == "ZERO_GRID";
}

double ZeroGridAllowedFirstGap(double requested)
{
   if(MathAbs(requested-2.0)<0.000001) return 2.0;
   return 3.0;
}

double ZeroGridAllowedStep(double requested)
{
   if(MathAbs(requested-0.5)<0.000001) return 0.5;
   if(MathAbs(requested-1.0)<0.000001) return 1.0;
   if(MathAbs(requested-2.0)<0.000001) return 2.0;
   if(MathAbs(requested-4.0)<0.000001) return 4.0;
   return 3.0;
}

double ZeroGridAllowedBaseLot(double requested)
{
   if(MathAbs(requested-0.01)<0.000001) return 0.01;
   if(MathAbs(requested-0.02)<0.000001) return 0.02;
   if(MathAbs(requested-0.03)<0.000001) return 0.03;
   if(MathAbs(requested-0.04)<0.000001) return 0.04;
   if(MathAbs(requested-0.05)<0.000001) return 0.05;
   if(MathAbs(requested-0.06)<0.000001) return 0.06;
   if(MathAbs(requested-0.07)<0.000001) return 0.07;
   if(MathAbs(requested-0.08)<0.000001) return 0.08;
   if(MathAbs(requested-0.09)<0.000001) return 0.09;
   return ZERO_GRID_DEFAULT_BASE_LOT;
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
   if(g_zeroGridCycleFirstGapPrice > 0.0)
      GlobalVariableSet(ZeroGridStateKey("FIRSTGAP"),g_zeroGridCycleFirstGapPrice);
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
   if(g_zeroGridCycleFirstGapPrice <= 0.0 && GlobalVariableCheck(ZeroGridStateKey("FIRSTGAP")))
      g_zeroGridCycleFirstGapPrice=ZeroGridAllowedFirstGap(GlobalVariableGet(ZeroGridStateKey("FIRSTGAP")));
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
         g_zeroGridCycleLowVolatility=g_zeroGridCycleStepPrice <= ZERO_GRID_LOW_VOL_STEP_PRICE ? 1 : 0;
   }
}

void ResetZeroGridCycleState()
{
   g_zeroGridCenter=0.0;
   g_zeroGridStartEquity=0.0;
   g_zeroGridCycleStartedAt=0;
   g_zeroGridClosing=false;
   g_zeroGridLastExitBurstMs=0;
   g_zeroGridFlatObservedMs=0;
   ArrayInitialize(g_zeroGridPendingBuyRequestMs,0);
   ArrayInitialize(g_zeroGridPendingSellRequestMs,0);
   g_zeroGridCycleFirstGapPrice=0.0;
   g_zeroGridCycleStepPrice=0.0;
   g_zeroGridCycleLevelsPerSide=0;
   g_zeroGridCycleBaseLot=0.0;
   g_zeroGridCycleLowVolatility=-1;
   string keys[8]={"CENTER","EQUITY","START","FIRSTGAP","STEP","LEVELS","BASELOT","LOWVOL"};
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

int ZeroGridPositionCount()
{
   LoadZeroGridCycleState();
   int count=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(ZeroGridOwnsSelectedPosition()) count++;
   }
   return count;
}

int ZeroGridPendingCount()
{
   int count=0;
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket)) continue;
      if(OrderGetString(ORDER_SYMBOL)!=_Symbol || OrderGetInteger(ORDER_MAGIC)!=InpMagic) continue;
      if(IsZeroGridComment(OrderGetString(ORDER_COMMENT))) count++;
   }
   return count;
}

bool ZeroGridFlatConfirmedForReset()
{
   int positions=ZeroGridPositionCount();
   int pending=ZeroGridPendingCount();
   if(positions>0 || pending>0)
   {
      g_zeroGridFlatObservedMs=0;
      return false;
   }

   ulong nowMs=GetTickCount64();
   if(g_zeroGridFlatObservedMs==0 || nowMs<g_zeroGridFlatObservedMs)
   {
      g_zeroGridFlatObservedMs=nowMs;
      return false;
   }
   return nowMs-g_zeroGridFlatObservedMs>=ZERO_GRID_FLAT_CONFIRM_MS;
}

int ZeroGridForeignPositionCount()
{
   int count=0;
   bool netting=ZeroGridAccountIsNetting();
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;

      long magic=PositionGetInteger(POSITION_MAGIC);
      string comment=PositionGetString(POSITION_COMMENT);
      if(magic==InpMagic && IsZeroGridComment(comment)) continue;

      // Netting merges all exposure on one symbol, so any existing position on
      // this symbol must be treated as foreign. Hedging can safely coexist with
      // unrelated/manual positions as long as they are not owned by this EA.
      if(netting || magic==InpMagic) count++;
   }
   return count;
}

bool ZeroGridLevelExists(bool buySide,int level)
{
   string wanted=ZeroGridComment(buySide,level);
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket)) continue;
      if(OrderGetString(ORDER_SYMBOL)==_Symbol &&
         OrderGetInteger(ORDER_MAGIC)==InpMagic &&
         OrderGetString(ORDER_COMMENT)==wanted)
         return true;
   }
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL)==_Symbol &&
         PositionGetInteger(POSITION_MAGIC)==InpMagic &&
         PositionGetString(POSITION_COMMENT)==wanted)
         return true;
   }

   LoadZeroGridCycleState();
   if(g_zeroGridCycleStartedAt>0 && HistorySelect(g_zeroGridCycleStartedAt,TimeCurrent()+60))
   {
      int total=HistoryOrdersTotal();
      for(int i=0;i<total;i++)
      {
         ulong ticket=HistoryOrderGetTicket(i);
         if(ticket==0) continue;
         if(HistoryOrderGetString(ticket,ORDER_SYMBOL)!=_Symbol) continue;
         if(HistoryOrderGetInteger(ticket,ORDER_MAGIC)!=InpMagic) continue;
         if(HistoryOrderGetString(ticket,ORDER_COMMENT)!=wanted) continue;
         long state=HistoryOrderGetInteger(ticket,ORDER_STATE);
         if(state==ORDER_STATE_FILLED || state==ORDER_STATE_PARTIAL)
            return true;
      }
   }
   return false;
}

double ZeroGridCycleNet()
{
   LoadZeroGridCycleState();
   double total=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(!ZeroGridOwnsSelectedPosition()) continue;
      total += PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
   }

   if(g_zeroGridCycleStartedAt>0 && HistorySelect(g_zeroGridCycleStartedAt,TimeCurrent()+60))
   {
      int totalDeals=HistoryDealsTotal();
      for(int i=0;i<totalDeals;i++)
      {
         ulong deal=HistoryDealGetTicket(i);
         if(deal==0) continue;
         if(HistoryDealGetString(deal,DEAL_SYMBOL)!=_Symbol) continue;
         if(HistoryDealGetInteger(deal,DEAL_MAGIC)!=InpMagic) continue;
         total += HistoryDealGetDouble(deal,DEAL_PROFIT);
         total += HistoryDealGetDouble(deal,DEAL_SWAP);
         total += HistoryDealGetDouble(deal,DEAL_COMMISSION);
         total += HistoryDealGetDouble(deal,DEAL_FEE);
      }
   }
   return total;
}

double ZeroGridEstimatedExitCostMoney()
{
   LoadZeroGridCycleState();
   if(g_zeroGridCycleStartedAt<=0) return 0.0;

   double openVolume=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(!ZeroGridOwnsSelectedPosition()) continue;
      openVolume += MathMax(0.0,PositionGetDouble(POSITION_VOLUME));
   }
   if(openVolume<=0.0) return 0.0;

   if(!HistorySelect(g_zeroGridCycleStartedAt,TimeCurrent()+60)) return 0.0;
   double entryCost=0.0;
   double entryVolume=0.0;
   int totalDeals=HistoryDealsTotal();
   for(int i=0;i<totalDeals;i++)
   {
      ulong deal=HistoryDealGetTicket(i);
      if(deal==0) continue;
      if(HistoryDealGetString(deal,DEAL_SYMBOL)!=_Symbol) continue;
      if(HistoryDealGetInteger(deal,DEAL_MAGIC)!=InpMagic) continue;
      long entry=HistoryDealGetInteger(deal,DEAL_ENTRY);
      if(entry!=DEAL_ENTRY_IN && entry!=DEAL_ENTRY_INOUT) continue;
      double volume=HistoryDealGetDouble(deal,DEAL_VOLUME);
      if(volume<=0.0) continue;
      entryVolume += volume;
      entryCost += MathAbs(HistoryDealGetDouble(deal,DEAL_COMMISSION));
      entryCost += MathAbs(HistoryDealGetDouble(deal,DEAL_FEE));
   }
   if(entryVolume<=0.0 || entryCost<=0.0) return 0.0;

   // MT5 does not expose future closing commission in advance. Estimate it
   // from observed entry cost per lot. Spread is already in POSITION_PROFIT.
   return (entryCost/entryVolume)*openVolume;
}

double ZeroGridRequiredCloseNet()
{
   // User target is absolute: once ZERO cycle net P/L reaches the configured
   // amount, close immediately. No hidden reserve or estimated exit-cost buffer.
   return MathMax(0.01,g_zeroGridMinNetProfitMoney);
}

double ZeroGridTickSize()
{
   double tick=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
   if(tick<=0.0) tick=_Point;
   return MathMax(_Point,tick);
}

double ZeroGridMinPendingDistancePrice()
{
   // New pending orders are constrained by StopsLevel. FreezeLevel mainly
   // limits later modify/delete operations near market and must not push the
   // first ZERO trigger farther away than the broker requires for placement.
   long stops=SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL);
   double brokerDistance=(double)MathMax((long)0,stops)*_Point;
   return MathMax(ZeroGridTickSize(),brokerDistance);
}

// ZERO GRID V2.1 geometry: the first entry hugs the live market at the broker-safe
// Stops/Freeze boundary, while the configured Grid Step is reserved for spacing
// BETWEEN levels. This avoids compressed/duplicate pending prices when price moves.
double ZeroGridEffectiveStepPrice()
{
   double tick=ZeroGridTickSize();
   double source=g_zeroGridCycleStepPrice>0.0
      ? g_zeroGridCycleStepPrice
      : g_zeroGridStepPrice;
   double requested=MathMax(source,tick);
   double units=MathCeil((requested/tick)-1e-10);
   return NormalizeDouble(units*tick,_Digits);
}

int ZeroGridEffectiveLevelsPerSide()
{
   int source=g_zeroGridCycleLevelsPerSide>0 ? g_zeroGridCycleLevelsPerSide : g_zeroGridLevelsPerSide;
   return (int)MathMax(1.0,MathMin((double)ZERO_GRID_MAX_LEVELS,(double)source));
}

double ZeroGridEffectiveBaseLot()
{
   double source=g_zeroGridCycleBaseLot>0.0 ? g_zeroGridCycleBaseLot : g_zeroGridBaseLot;
   return ZeroGridAllowedBaseLot(source);
}

bool ZeroGridEffectiveLowVolatilityEnabled()
{
   // Migration-only compatibility for a cycle that was already active on 1.1.4.
   // New cycles from 1.1.5 never enable this path.
   return g_zeroGridCycleLowVolatility == 1;
}

double ZeroGridEffectiveLevelLot(int level)
{
   double baseLot=ZeroGridEffectiveBaseLot();
   double requested=ZeroGridEffectiveLowVolatilityEnabled()
      ? baseLot
      : baseLot*MathMax(1,level);
   return NormalizeTradeVolume(requested);
}

double ZeroGridEffectiveFirstGapPrice()
{
   // A legacy in-flight cycle without FIRSTGAP keeps the old 3.00 offset.
   if(g_zeroGridCycleFirstGapPrice > 0.0)
      return ZeroGridAllowedFirstGap(g_zeroGridCycleFirstGapPrice);
   if(g_zeroGridCycleStartedAt > 0)
      return 3.0;
   return ZeroGridAllowedFirstGap(g_zeroGridFirstGapPrice);
}

double ZeroGridEntryGapPrice()
{
   // The first offset is independent from the spacing of deeper levels.
   // The old low-volatility branch is only for migration of active cycles.
   double tick=ZeroGridTickSize();
   double preferredGap=ZeroGridEffectiveLowVolatilityEnabled() ? ZERO_GRID_LOW_VOL_FIRST_GAP : ZeroGridEffectiveFirstGapPrice();
   double brokerSafeGap=ZeroGridMinPendingDistancePrice()+tick*2.0;
   double gap=MathMax(preferredGap,brokerSafeGap);
   double units=MathCeil((gap/tick)-1e-10);
   return NormalizeDouble(units*tick,_Digits);
}

double ZeroGridNormalizeCenterPrice(double rawPrice)
{
   double tick=ZeroGridTickSize();
   double units=MathRound(rawPrice/tick);
   return NormalizeDouble(units*tick,_Digits);
}

bool ZeroGridRequestedConfigChanged()
{
   if(g_zeroGridCycleStartedAt<=0) return false;
   double tick=ZeroGridTickSize();
   double requestedStep=MathMax(g_zeroGridStepPrice,tick);
   requestedStep=NormalizeDouble(MathCeil((requestedStep/tick)-1e-10)*tick,_Digits);
   int requestedLevels=(int)MathMax(1.0,MathMin((double)ZERO_GRID_MAX_LEVELS,(double)g_zeroGridLevelsPerSide));
   double requestedLot=ZeroGridAllowedBaseLot(g_zeroGridBaseLot);
   return MathAbs(requestedStep-ZeroGridEffectiveStepPrice())>tick*0.5 ||
          MathAbs(ZeroGridAllowedFirstGap(g_zeroGridFirstGapPrice)-ZeroGridEffectiveFirstGapPrice())>tick*0.5 ||
          requestedLevels!=ZeroGridEffectiveLevelsPerSide() ||
          MathAbs(requestedLot-ZeroGridEffectiveBaseLot())>0.0000001;
}

double ZeroGridNormalizePendingPrice(bool buySide,double rawPrice)
{
   double tick=ZeroGridTickSize();
   double units=rawPrice/tick;
   double price=buySide
      ? MathCeil(units-1e-10)*tick
      : MathFloor(units+1e-10)*tick;
   return NormalizeDouble(price,_Digits);
}

double ZeroGridExistingPendingAnchorPrice(bool buySide)
{
   string prefix=buySide ? "SaaSZeroGridB" : "SaaSZeroGridS";
   double step=ZeroGridEffectiveStepPrice();
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket)) continue;
      if(OrderGetString(ORDER_SYMBOL)!=_Symbol || OrderGetInteger(ORDER_MAGIC)!=InpMagic) continue;
      string comment=OrderGetString(ORDER_COMMENT);
      if(StringFind(comment,prefix)!=0) continue;
      int level=(int)StringToInteger(StringSubstr(comment,StringLen(prefix)));
      if(level<1) continue;
      double orderPrice=OrderGetDouble(ORDER_PRICE_OPEN);
      double anchor=buySide
         ? orderPrice-step*(level-1)
         : orderPrice+step*(level-1);
      return ZeroGridNormalizePendingPrice(buySide,anchor);
   }
   return 0.0;
}

double ZeroGridPendingAnchorPrice(bool buySide)
{
   LoadZeroGridCycleState();
   if(g_zeroGridCenter<=0.0) return 0.0;

   // Preserve exact ladder geometry after the first level exists.
   double existing=ZeroGridExistingPendingAnchorPrice(buySide);
   if(existing>0.0) return existing;

   MqlTick live;
   if(!SymbolInfoTick(_Symbol,live)) return 0.0;

   double gap=ZeroGridEntryGapPrice();
   // New cycles use the same saved midpoint to place BUY1 and SELL1 at
   // center +/- first gap. Keep pre-upgrade in-flight cycles on their old
   // live-quote geometry; do not move existing trades during an EA update.
   bool legacyLiveAnchor=g_zeroGridCycleFirstGapPrice<=0.0 &&
                         !ZeroGridEffectiveLowVolatilityEnabled();
   double raw=legacyLiveAnchor
      ? (buySide ? live.ask+gap : live.bid-gap)
      : (buySide ? g_zeroGridCenter+gap : g_zeroGridCenter-gap);
   double brokerSafe=ZeroGridMinPendingDistancePrice()+ZeroGridTickSize();
   double legal=buySide ? live.ask+brokerSafe : live.bid-brokerSafe;
   if(buySide && raw<legal) raw=legal;
   if(!buySide && raw>legal) raw=legal;

   return ZeroGridNormalizePendingPrice(buySide,raw);
}

double ZeroGridPendingLevelPrice(bool buySide,int level)
{
   if(level<1) return 0.0;
   double anchor=ZeroGridPendingAnchorPrice(buySide);
   if(anchor<=0.0) return 0.0;
   double step=ZeroGridEffectiveStepPrice();
   double raw=buySide
      ? anchor+step*(level-1)
      : anchor-step*(level-1);
   return ZeroGridNormalizePendingPrice(buySide,raw);
}

int ZeroGridPositionDirection()
{
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(!ZeroGridOwnsSelectedPosition()) continue;
      return PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY ? 1 : -1;
   }
   return 0;
}

ENUM_ORDER_TYPE_TIME ZeroGridPendingTimeType()
{
   long modes=SymbolInfoInteger(_Symbol,SYMBOL_EXPIRATION_MODE);
   if((modes & SYMBOL_EXPIRATION_GTC)==SYMBOL_EXPIRATION_GTC)
      return ORDER_TIME_GTC;
   if((modes & SYMBOL_EXPIRATION_DAY)==SYMBOL_EXPIRATION_DAY)
      return ORDER_TIME_DAY;
   if((modes & SYMBOL_EXPIRATION_SPECIFIED)==SYMBOL_EXPIRATION_SPECIFIED)
      return ORDER_TIME_SPECIFIED;
   if((modes & SYMBOL_EXPIRATION_SPECIFIED_DAY)==SYMBOL_EXPIRATION_SPECIFIED_DAY)
      return ORDER_TIME_SPECIFIED_DAY;
   return ORDER_TIME_GTC;
}

datetime ZeroGridPendingExpiration(ENUM_ORDER_TYPE_TIME typeTime)
{
   if(typeTime==ORDER_TIME_SPECIFIED || typeTime==ORDER_TIME_SPECIFIED_DAY)
      return TimeCurrent()+30*24*60*60;
   return 0;
}

bool ZeroGridRecenterFlatCycle()
{
   if(ZeroGridPositionCount()>0 || ZeroGridPendingCount()>0)
      return false;
   MqlTick live;
   if(!SymbolInfoTick(_Symbol,live))
      return false;
   double mid=(live.bid+live.ask)*0.5;
   g_zeroGridCenter=ZeroGridNormalizeCenterPrice(mid);
   g_zeroGridCycleStartedAt=TimeCurrent();
   g_zeroGridClosing=false;
   SaveZeroGridCycleState();
   return g_zeroGridCenter>0.0;
}

bool ZeroGridPendingRequestInFlight(bool buySide,int level)
{
   if(level<1 || level>ZERO_GRID_MAX_LEVELS)
      return false;
   ulong sentAt=buySide
      ? g_zeroGridPendingBuyRequestMs[level]
      : g_zeroGridPendingSellRequestMs[level];
   if(sentAt==0)
      return false;
   if(ZeroGridLevelExists(buySide,level))
   {
      if(buySide) g_zeroGridPendingBuyRequestMs[level]=0;
      else g_zeroGridPendingSellRequestMs[level]=0;
      return false;
   }
   ulong nowMs=GetTickCount64();
   if(nowMs>=sentAt && nowMs-sentAt<ZERO_GRID_PENDING_REQUEST_GUARD_MS)
      return true;
   if(buySide) g_zeroGridPendingBuyRequestMs[level]=0;
   else g_zeroGridPendingSellRequestMs[level]=0;
   return false;
}

void ZeroGridMarkPendingRequest(bool buySide,int level)
{
   if(level<1 || level>ZERO_GRID_MAX_LEVELS)
      return;
   ulong nowMs=GetTickCount64();
   if(buySide) g_zeroGridPendingBuyRequestMs[level]=nowMs;
   else g_zeroGridPendingSellRequestMs[level]=nowMs;
}

bool ZeroGridSendPending(bool buySide,int level)
{
   if(level<1 || level>ZeroGridEffectiveLevelsPerSide())
      return true;
   if(ZeroGridLevelExists(buySide,level))
      return true;
   if(!MQLInfoInteger(MQL_TESTER) && ZeroGridPendingRequestInFlight(buySide,level))
      return true;
   if(g_zeroGridCenter<=0.0)
      return false;
   if(!ZeroGridStopOrdersSupported())
   {
      g_executionStatus="ZERO_GRID_STOP_ORDERS_UNSUPPORTED";
      return false;
   }
   if(g_orderWindowStart==0 || TimeCurrent()-g_orderWindowStart>=60)
   {
      g_orderWindowStart=TimeCurrent();
      g_ordersInWindow=0;
   }

   double volume=ZeroGridEffectiveLevelLot(level);
   if(volume<=0.0)
   {
      g_executionStatus="ZERO_GRID_INVALID_LOT";
      return false;
   }

   // L1 is the critical trigger pair. Retry it immediately with a fresh tick
   // and slightly more broker headroom instead of allowing L2+ to leapfrog it.
   // Deeper levels need fewer retries because their anchor is already fixed by L1.
   int maxPlacementAttempts=(level==1 ? 3 : 2);
   for(int attempt=0;attempt<maxPlacementAttempts;attempt++)
   {
      // ZERO_SIMPLE_STABLE_V117: no strategy/rate gate decides whether a
      // configured pending level may be placed. Broker validity checks below
      // are execution requirements, not market/trend filters.

      MqlTick live;
      if(!SymbolInfoTick(_Symbol,live))
      {
         g_executionStatus="ZERO_GRID_WAIT_TICK";
         return false;
      }

      double price=ZeroGridPendingLevelPrice(buySide,level);
      if(price<=0.0)
      {
         g_executionStatus="ZERO_GRID_WAIT_TICK";
         return false;
      }

      // First try keeps the intended ~100-point geometry. If the quote moves
      // while the request is being staged, later L1 attempts add only 1 tick
      // at a time and clamp outward to the latest broker-safe boundary.
      double tickSize=ZeroGridTickSize();
      double retryHeadroom=tickSize*(attempt+1);
      double safeDistance=ZeroGridMinPendingDistancePrice()+retryHeadroom;
      double safeBoundary=buySide
         ? ZeroGridNormalizePendingPrice(true,live.ask+safeDistance)
         : ZeroGridNormalizePendingPrice(false,live.bid-safeDistance);

      bool unsafe=(buySide && price<safeBoundary) || (!buySide && price>safeBoundary);
      if(unsafe)
      {
         // Before L1 exists there is no valid ladder geometry to preserve, so
         // move L1 itself to the nearest legal live boundary. Once L1 exists,
         // never distort the configured spacing of L2+.
         if(level==1 && ZeroGridExistingPendingAnchorPrice(buySide)<=0.0)
            price=safeBoundary;
         else
         {
            g_executionStatus="ZERO_GRID_WAIT_SAFE_GEOMETRY";
            return false;
         }
      }

      MqlTradeRequest request={};
      MqlTradeResult result={};
      request.action=TRADE_ACTION_PENDING;
      request.magic=InpMagic;
      request.symbol=_Symbol;
      request.volume=volume;
      request.price=price;
      request.type=buySide ? ORDER_TYPE_BUY_STOP : ORDER_TYPE_SELL_STOP;
      request.type_time=ZeroGridPendingTimeType();
      request.expiration=ZeroGridPendingExpiration(request.type_time);
      request.type_filling=ORDER_FILLING_RETURN;
      request.comment=ZeroGridComment(buySide,level);

      ResetLastError();
      bool testerMode=(bool)MQLInfoInteger(MQL_TESTER);
      bool sent=false;
      if(testerMode)
         sent=OrderSend(request,result);
      else
         sent=OrderSendAsync(request,result);
      RegisterOrderRequest();
      g_lastOrderRetcode=(long)result.retcode;
      g_lastOrderError=GetLastError();
      g_lastOrderAt=TimeCurrent();

      if(sent && (!testerMode ||
         result.retcode==TRADE_RETCODE_DONE ||
         result.retcode==TRADE_RETCODE_PLACED))
      {
         if(!testerMode)
            ZeroGridMarkPendingRequest(buySide,level);
         return true;
      }

      PrintFormat(
         "ZERO pending retry side=%s level=%d attempt=%d price=%.*f bid=%.*f ask=%.*f retcode=%u error=%d",
         buySide ? "BUY" : "SELL",
         level,
         attempt+1,
         _Digits,price,
         _Digits,live.bid,
         _Digits,live.ask,
         result.retcode,
         g_lastOrderError
      );

      bool retryable=
         result.retcode==TRADE_RETCODE_INVALID_PRICE ||
         result.retcode==TRADE_RETCODE_INVALID_STOPS ||
         result.retcode==TRADE_RETCODE_PRICE_CHANGED ||
         result.retcode==TRADE_RETCODE_PRICE_OFF ||
         result.retcode==TRADE_RETCODE_REQUOTE;
      if(!retryable)
         break;
   }

   g_executionStatus=(level==1 ? "ZERO_GRID_L1_RETRY" : "ZERO_GRID_PENDING_RETRY");
   return false;
}

double ZeroGridPendingLevelVolume(bool buySide,int level)
{
   string wanted=ZeroGridComment(buySide,level);
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket)) continue;
      if(OrderGetString(ORDER_SYMBOL)!=_Symbol || OrderGetInteger(ORDER_MAGIC)!=InpMagic) continue;
      if(OrderGetString(ORDER_COMMENT)!=wanted) continue;
      return OrderGetDouble(ORDER_VOLUME_INITIAL);
   }
   return 0.0;
}

bool ZeroGridCancelPendingLevel(bool buySide,int level)
{
   string wanted=ZeroGridComment(buySide,level);
   bool ok=true;
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket)) continue;
      if(OrderGetString(ORDER_SYMBOL)!=_Symbol || OrderGetInteger(ORDER_MAGIC)!=InpMagic) continue;
      if(OrderGetString(ORDER_COMMENT)!=wanted) continue;

      MqlTradeRequest request={};
      MqlTradeResult result={};
      request.action=TRADE_ACTION_REMOVE;
      request.order=ticket;
      request.magic=InpMagic;
      request.symbol=_Symbol;
      ResetLastError();
      bool sent=OrderSend(request,result);
      if(sent && TradeResultAccepted(result))
         RegisterOrderRequest();
      else
         ok=false;
   }
   return ok;
}

bool ZeroGridFlatLevelPairValid(int level)
{
   double expected=ZeroGridEffectiveLevelLot(level);
   double buyVolume=ZeroGridPendingLevelVolume(true,level);
   double sellVolume=ZeroGridPendingLevelVolume(false,level);
   double volumeStep=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
   double tolerance=MathMax(0.0000001,volumeStep*0.25);
   if(expected<=0.0 || buyVolume<=0.0 || sellVolume<=0.0) return false;
   return MathAbs(buyVolume-sellVolume)<=tolerance &&
          MathAbs(buyVolume-expected)<=tolerance &&
          MathAbs(sellVolume-expected)<=tolerance;
}

bool ZeroGridEnsureLadder()
{
   if(g_zeroGridCenter<=0.0)
      return false;

   int positions=ZeroGridPositionCount();
   int levels=ZeroGridEffectiveLevelsPerSide();

   // ZERO_SIMPLE_STABLE_V117
   // Flat cycle = one simple job: make the configured BUY STOP and SELL STOP
   // ladder complete. Keep every accepted correct pending order and retry only
   // the missing/invalid side. Never tear down a good side just because the
   // broker was slower on its mate.
   if(positions==0)
   {
      for(int level=1;level<=levels;level++)
      {
         double expected=ZeroGridEffectiveLevelLot(level);
         double volumeStep=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
         double tolerance=MathMax(0.0000001,volumeStep*0.25);
         double buyVolume=ZeroGridPendingLevelVolume(true,level);
         double sellVolume=ZeroGridPendingLevelVolume(false,level);

         if(buyVolume>0.0 && MathAbs(buyVolume-expected)>tolerance)
         {
            ZeroGridCancelPendingLevel(true,level);
            buyVolume=0.0;
         }
         if(sellVolume>0.0 && MathAbs(sellVolume-expected)>tolerance)
         {
            ZeroGridCancelPendingLevel(false,level);
            sellVolume=0.0;
         }

         if(buyVolume<=0.0)
            ZeroGridSendPending(true,level);
         if(sellVolume<=0.0)
            ZeroGridSendPending(false,level);
      }

      if(ZeroGridPendingCount()!=levels*2)
      {
         g_executionStatus="ZERO_GRID_BUILDING";
         return false;
      }
      for(int level=1;level<=levels;level++)
      {
         if(!ZeroGridFlatLevelPairValid(level))
         {
            g_executionStatus="ZERO_GRID_BUILDING";
            return false;
         }
      }
      return true;
   }

   // Active cycle: a filled level is never recreated. ZeroGridLevelExists()
   // already treats live positions and cycle history as consumed levels. Only
   // a genuinely missing, still-unfilled pending level is repaired.
   bool complete=true;
   for(int level=1;level<=levels;level++)
   {
      if(!ZeroGridLevelExists(true,level))
         if(!ZeroGridSendPending(true,level)) complete=false;
      if(!ZeroGridLevelExists(false,level))
         if(!ZeroGridSendPending(false,level)) complete=false;
   }
   return complete;
}

void ZeroGridCancelPendingSide(bool buySide)
{
   string prefix=buySide ? "SaaSZeroGridB" : "SaaSZeroGridS";
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket)) continue;
      if(OrderGetString(ORDER_SYMBOL)!=_Symbol || OrderGetInteger(ORDER_MAGIC)!=InpMagic) continue;
      string comment=OrderGetString(ORDER_COMMENT);
      if(StringFind(comment,prefix)!=0) continue;

      MqlTradeRequest request={};
      MqlTradeResult result={};
      request.action=TRADE_ACTION_REMOVE;
      request.order=ticket;
      request.magic=InpMagic;
      request.symbol=_Symbol;
      ResetLastError();
      OrderSend(request,result);
      RegisterOrderRequest();
   }
}

void ZeroGridCancelPending()
{
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket)) continue;
      if(OrderGetString(ORDER_SYMBOL)!=_Symbol || OrderGetInteger(ORDER_MAGIC)!=InpMagic) continue;
      if(!IsZeroGridComment(OrderGetString(ORDER_COMMENT))) continue;

      MqlTradeRequest request={};
      MqlTradeResult result={};
      request.action=TRADE_ACTION_REMOVE;
      request.order=ticket;
      request.magic=InpMagic;
      request.symbol=_Symbol;
      ResetLastError();
      OrderSend(request,result);
      RegisterOrderRequest();
   }
}

// Profit exit geometry: close the smallest owned lot first so a ZERO basket
// exits in a predictable 0.02 -> 0.04 -> 0.06 style sequence. For equal lots,
// prefer a profitable ticket, then the ticket nearest live price. Netting has
// one aggregate symbol position, so the same selector remains compatible.
ulong ZeroGridNearestCloseTicket()
{
   MqlTick tick;
   bool hasTick=SymbolInfoTick(_Symbol,tick);
   double priceTolerance=MathMax(ZeroGridTickSize()*0.5,_Point*0.5);
   double volumeStep=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
   double lotTolerance=MathMax(0.0000001,volumeStep*0.25);
   ulong bestTicket=0;
   double bestVolume=1.0e100;
   int bestProfitRank=99;
   double bestDistance=1.0e100;

   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(!ZeroGridOwnsSelectedPosition()) continue;

      long type=PositionGetInteger(POSITION_TYPE);
      double volume=PositionGetDouble(POSITION_VOLUME);
      double openPrice=PositionGetDouble(POSITION_PRICE_OPEN);
      double floating=PositionGetDouble(POSITION_PROFIT)+PositionGetDouble(POSITION_SWAP);
      int profitRank=floating>=0.0 ? 0 : 1;
      double livePrice=hasTick
         ? (type==POSITION_TYPE_BUY ? tick.bid : tick.ask)
         : openPrice;
      double distance=MathAbs(openPrice-livePrice);

      bool sameLot=bestTicket!=0 && MathAbs(volume-bestVolume)<=lotTolerance;
      bool better=false;
      if(bestTicket==0 || volume<bestVolume-lotTolerance)
         better=true;
      else if(sameLot && profitRank<bestProfitRank)
         better=true;
      else if(sameLot && profitRank==bestProfitRank && distance<bestDistance-priceTolerance)
         better=true;
      else if(sameLot && profitRank==bestProfitRank &&
              MathAbs(distance-bestDistance)<=priceTolerance && ticket<bestTicket)
         better=true;

      if(better)
      {
         bestTicket=ticket;
         bestVolume=volume;
         bestProfitRank=profitRank;
         bestDistance=distance;
      }
   }
   return bestTicket;
}

bool ZeroGridClosePositionAsync(ulong ticket)
{
   if(MQLInfoInteger(MQL_TESTER))
      return ClosePositionByTicket(ticket);
   if(ticket==0 || !PositionSelectByTicket(ticket)) return false;
   if(!ZeroGridOwnsSelectedPosition()) return false;
   string symbol=PositionGetString(POSITION_SYMBOL);
   double volume=PositionGetDouble(POSITION_VOLUME);
   long positionType=PositionGetInteger(POSITION_TYPE);
   MqlTick tick;
   if(!SymbolInfoTick(symbol,tick)) return false;
   MqlTradeRequest request={};
   MqlTradeResult result={};
   request.action=TRADE_ACTION_DEAL;
   request.position=ticket;
   request.magic=PositionGetInteger(POSITION_MAGIC);
   request.symbol=symbol;
   request.volume=NormalizeTradeVolume(volume);
   request.deviation=DynamicDeviationPoints();
   request.type_filling=AllowedFillingMode();
   request.comment="SaaSZeroCloseAll";
   if(positionType==POSITION_TYPE_BUY) { request.type=ORDER_TYPE_SELL; request.price=tick.bid; }
   else { request.type=ORDER_TYPE_BUY; request.price=tick.ask; }
   ResetLastError();
   bool sent=OrderSendAsync(request,result);
   if(!sent || !TradeResultAccepted(result))
   {
      Print("ZERO close-all async rejected ticket=",ticket," error=",GetLastError()," retcode=",result.retcode);
      return false;
   }
   return true;
}

void ZeroGridCancelPendingAsync()
{
   if(MQLInfoInteger(MQL_TESTER))
   {
      ZeroGridCancelPending();
      return;
   }
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket)) continue;
      if(OrderGetString(ORDER_SYMBOL)!=_Symbol || OrderGetInteger(ORDER_MAGIC)!=InpMagic) continue;
      if(!IsZeroGridComment(OrderGetString(ORDER_COMMENT))) continue;
      MqlTradeRequest request={};
      MqlTradeResult result={};
      request.action=TRADE_ACTION_REMOVE;
      request.order=ticket;
      request.magic=InpMagic;
      request.symbol=_Symbol;
      ResetLastError();
      if(OrderSendAsync(request,result) && TradeResultAccepted(result)) RegisterOrderRequest();
      else Print("ZERO cancel-all async rejected order=",ticket," error=",GetLastError()," retcode=",result.retcode);
   }
}

void ZeroGridClosePositions()
{
   // ZERO_GRID_CLOSE_ALL_BURST: profit close is full-basket burst dispatch.
   // Queue every owned position exit before waiting for any broker fill, then
   // cancel remaining ZERO pending orders. MT5 still reports one deal per
   // position, but the EA never waits for ticket A before submitting ticket B.
   ulong nowMs=GetTickCount64();
   if(g_zeroGridLastExitBurstMs>0 && nowMs-g_zeroGridLastExitBurstMs<30) return;
   g_zeroGridLastExitBurstMs=nowMs;
   ulong tickets[];
   int ticketCount=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(!ZeroGridOwnsSelectedPosition()) continue;
      ArrayResize(tickets,ticketCount+1);
      tickets[ticketCount++]=ticket;
   }
   int sent=0;
   for(int i=0;i<ticketCount;i++) if(ZeroGridClosePositionAsync(tickets[i])) sent++;
   ZeroGridCancelPendingAsync();
   if(sent>0) g_executionStatus="ZERO_GRID_CLOSE_ALL_BURST";
}

bool StartZeroGridCycle()
{
   if(!ZeroGridModeEnabled())
      return false;

   // ZERO has no trend, momentum, confidence, ATR, session, spread or heartbeat
   // freshness entry filter. Only explicit RUN/access and real broker ability
   // to trade are allowed to stop a new pending ladder.
   if(g_state!=STATE_RUNNING || !g_access)
   {
      g_executionStatus="ZERO_GRID_STOPPED";
      return true;
   }
   if(!ZeroGridHedgingAllowed())
   {
      ZeroGridCancelPending();
      g_executionStatus="ZERO_GRID_HEDGING_REQUIRED";
      return true;
   }
   string permissionStatus=TradePermissionStatus();
   if(permissionStatus!="OK")
   {
      g_executionStatus=permissionStatus;
      return true;
   }
   if(!ZeroGridStopOrdersSupported())
   {
      g_executionStatus="ZERO_GRID_STOP_ORDERS_UNSUPPORTED";
      return true;
   }

   LoadZeroGridCycleState();
   int ownedPositions=ZeroGridPositionCount();
   int ownedPending=ZeroGridPendingCount();
   if(g_zeroGridCenter<=0.0 && (ownedPositions>0 || ownedPending>0))
   {
      // Never create a second ZERO cycle while MT5 still exposes any order or
      // position owned by the previous cycle. This also covers the async window
      // where persisted center state is missing/stale after a restart.
      g_zeroGridFlatObservedMs=0;
      g_executionStatus="ZERO_GRID_EXISTING_CYCLE_GUARD";
      return true;
   }
   if(g_zeroGridCenter<=0.0 && ZeroGridForeignPositionCount()>0)
   {
      g_executionStatus="ZERO_GRID_FOREIGN_POSITION_BLOCK";
      return true;
   }

   if(g_zeroGridCenter<=0.0)
   {
      // A new cycle always starts from one fresh center and locks only the ZERO
      // settings that define the pending ladder. Nothing from AUTO/RACE is read.
      if(ZeroGridPendingCount()>0)
         ZeroGridCancelPending();

      MqlTick tick;
      if(!SymbolInfoTick(_Symbol,tick))
      {
         g_executionStatus="ZERO_GRID_WAIT_TICK";
         return true;
      }

      double mid=(tick.bid+tick.ask)*0.5;
      g_zeroGridCenter=ZeroGridNormalizeCenterPrice(mid);
      g_zeroGridStartEquity=AccountInfoDouble(ACCOUNT_EQUITY);
      g_zeroGridCycleStartedAt=TimeCurrent();
      g_zeroGridClosing=false;
      g_zeroGridLastExitBurstMs=0;
      g_zeroGridFlatObservedMs=0;
      g_zeroGridCycleLowVolatility=0;
      g_zeroGridCycleFirstGapPrice=ZeroGridAllowedFirstGap(g_zeroGridFirstGapPrice);
      g_zeroGridCycleStepPrice=MathMax(ZeroGridTickSize(),ZeroGridAllowedStep(g_zeroGridStepPrice));
      g_zeroGridCycleLevelsPerSide=(int)MathMax(1.0,MathMin((double)ZERO_GRID_MAX_LEVELS,(double)g_zeroGridLevelsPerSide));
      g_zeroGridCycleBaseLot=ZeroGridAllowedBaseLot(g_zeroGridBaseLot);
      g_orderWindowStart=TimeCurrent();
      g_ordersInWindow=0;
      SaveZeroGridCycleState();
   }

   bool ready=ZeroGridEnsureLadder();
   g_executionStatus=ready ? "ZERO_GRID_READY" : "ZERO_GRID_BUILDING";
   return true;
}

bool ManageZeroGrid()
{
   LoadZeroGridCycleState();
   int positions=ZeroGridPositionCount();
   int pending=ZeroGridPendingCount();

   // Once profit close begins, finish it first. When the account is flat,
   // immediately reset and build the next ZERO pending ladder in the same
   // runtime path. The 200 ms timer also calls this path, so rearm does not
   // depend on receiving another market tick.
   if(g_zeroGridClosing)
   {
      ZeroGridClosePositions();
      if(ZeroGridFlatConfirmedForReset())
      {
         ResetZeroGridCycleState();
         if(ZeroGridModeEnabled() && g_state==STATE_RUNNING && g_access &&
            ZeroGridHedgingAllowed() && TradePermissionStatus()=="OK")
         {
            g_executionStatus="ZERO_GRID_REARMING";
            return StartZeroGridCycle();
         }
         g_executionStatus="ZERO_GRID_STOPPED_FLAT";
      }
      else if(ZeroGridPositionCount()==0 && ZeroGridPendingCount()==0)
         g_executionStatus="ZERO_GRID_WAIT_FLAT_CONFIRM";
      return true;
   }

   // Explicit mode exit / revoked access still removes pending orders immediately.
   // SAFE_STOP is intentionally different: preserve only the pending ladder that
   // already belongs to the current ZERO cycle, let it drain under the normal
   // ZERO profit rule, and never build/replenish another pending order while stopped.
   if(!ZeroGridModeEnabled() || g_state!=STATE_RUNNING || !g_access)
   {
      bool safeStopDrain =
         ZeroGridModeEnabled() &&
         g_state==STATE_SAFE_STOP &&
         g_access &&
         g_safeStopDrainRequested;
      if(!safeStopDrain)
         ZeroGridCancelPending();

      positions=ZeroGridPositionCount();
      pending=ZeroGridPendingCount();
      if(positions<=0 && pending<=0)
      {
         if(!ZeroGridFlatConfirmedForReset())
         {
            g_executionStatus="ZERO_GRID_WAIT_FLAT_CONFIRM";
            return true;
         }
         ResetZeroGridCycleState();
         g_executionStatus="ZERO_GRID_STOPPED_FLAT";
         return true;
      }
      if(ZeroGridCycleNet()>=ZeroGridRequiredCloseNet())
      {
         g_zeroGridClosing=true;
         SaveZeroGridCycleState();
         g_executionStatus="ZERO_GRID_CLOSING_PROFIT";
         ZeroGridClosePositions();
      }
      else
         g_executionStatus="ZERO_GRID_SAFE_DRAIN";
      return true;
   }

   if(!ZeroGridHedgingAllowed())
   {
      ZeroGridCancelPending();
      g_executionStatus="ZERO_GRID_HEDGING_REQUIRED";
      return true;
   }
   string permissionStatus=TradePermissionStatus();
   if(permissionStatus!="OK")
   {
      g_executionStatus=permissionStatus;
      return true;
   }
   if(!ZeroGridStopOrdersSupported())
   {
      g_executionStatus="ZERO_GRID_STOP_ORDERS_UNSUPPORTED";
      return true;
   }

   // A genuinely fresh runtime may start immediately. An already-active cycle
   // must remain continuously flat before its state is reset/rearmed; async STOP
   // fills can briefly make OrdersTotal/PositionsTotal both read zero.
   if(g_zeroGridCenter<=0.0)
      return StartZeroGridCycle();
   if(positions==0 && pending==0)
   {
      if(!ZeroGridFlatConfirmedForReset())
      {
         g_executionStatus="ZERO_GRID_WAIT_FLAT_CONFIRM";
         return true;
      }
      ResetZeroGridCycleState();
      return StartZeroGridCycle();
   }
   g_zeroGridFlatObservedMs=0;

   // The only trading decision inside ZERO: close the ZERO cycle when its own
   // configured real net-profit target is reached. No market opinion is used.
   if(positions>0 && ZeroGridCycleNet()>=ZeroGridRequiredCloseNet())
   {
      g_zeroGridClosing=true;
      SaveZeroGridCycleState();
      g_executionStatus="ZERO_GRID_CLOSING_PROFIT";
      ZeroGridClosePositions();
      if(ZeroGridFlatConfirmedForReset())
      {
         ResetZeroGridCycleState();
         g_executionStatus="ZERO_GRID_REARMING";
         return StartZeroGridCycle();
      }
      if(ZeroGridPositionCount()==0 && ZeroGridPendingCount()==0)
         g_executionStatus="ZERO_GRID_WAIT_FLAT_CONFIRM";
      return true;
   }

   bool ladderReady=ZeroGridEnsureLadder();
   if(positions>0)
      g_executionStatus="ZERO_GRID_ACTIVE";
   else
      g_executionStatus=ladderReady ? "ZERO_GRID_READY" : "ZERO_GRID_BUILDING";
   return true;
}

// Brain V17 RACE ------------------------------------------------------------
// RACE is a separate execution engine. AUTO never calls these functions.
// Entry scores, confidence, S/R, pullback and model grades are observation
// only here. The engine chooses a direction from the same live context, then
// fills to the user Max Positions target subject only to operational controls
// and explicit risk/exit protections.
bool RaceModeEnabled()
{
   return EffectiveExecutionMode() == "RACE";
}

bool BasketHasRacePosition()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol ||
         PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;
      if(StringFind(PositionGetString(POSITION_COMMENT), "SaaSRace") >= 0)
         return true;
   }
   return false;
}

void RaceResetExitCandidate()
{
   g_raceExitCandidateSince = 0;
   g_raceExitCandidatePeakAdverse = 0.0;
}

void ResetRaceRuntime()
{
   g_raceDirection = 0;
   g_racePeakProfit = 0.0;
   g_raceProfitArmed = false;
   g_raceTargetProfitArmed = false;
   g_raceRecoveryWatch = false;
   g_raceState = "IDLE";
   g_raceCycleStartedAt = 0;
   g_raceLastFillAt = 0;
   g_raceLastFillMs = 0;
   g_raceLastFillPrice = 0.0;
   g_raceLastFillDirection = 0;
   g_raceLastExitBurstMs = 0;
   g_raceVNextFlowScore = 0.0;
   g_raceVNextStructureDirection = 0;
   g_raceVNextRejectionDirection = 0;
   g_raceVNextLegPhase = "UNKNOWN";
   g_raceVNextDecisionScore = 0.0;
   g_raceExposureTotalLot = 0.0;
   g_raceExposureProjectedLot = 0.0;
   g_raceExposureAverageEntry = 0.0;
   g_raceExposureMoneyPerPoint = 0.0;
   g_raceExposureEstimatedCostMoney = 0.0;
   g_raceExposureNoisePoints = 0.0;
   g_raceExposureNoiseMoney = 0.0;
   g_raceExposureProjectedStructureLossMoney = 0.0;
   g_raceExposureStructureInvalidPrice = 0.0;
   g_raceExposureRiskMismatch = false;
   g_raceLossState = "NORMAL";
   RaceResetExitCandidate();
}

int RaceFilledUnits()
{
   double baseVolume = NormalizeTradeVolume(g_lot);
   if(baseVolume <= 0.0)
      return BasketPositionCount();

   double totalVolume = 0.0;
   int positions = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol ||
         PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;
      totalVolume += PositionGetDouble(POSITION_VOLUME);
      positions++;
   }

   int volumeUnits = (int)MathRound(totalVolume / baseVolume);
   return MathMax(positions, MathMax(0, volumeUnits));
}

bool RacePerPositionDualDirectionEnabled()
{
   // RACE 1.1.20 owns one structural side at a time in every profit mode.
   // A confirmed Demand/Supply reversal or break closes the old RACE exposure
   // first; the next flat tick may follow the new side. This prevents a RACE
   // cycle from trapping itself with simultaneous BUY and SELL inventory.
   return false;
}

bool ManageRacePerPositionHedgeBasket(double momentum)
{
   if(!RacePerPositionDualDirectionEnabled())
      return false;

   int positions=BasketPositionCount();
   if(positions<=0)
      return false;

   int filledUnits=RaceFilledUnits();
   double floatingProfit=BasketProfit();
   double cycleProfit=BasketCycleProfit();
   g_raceLastObservedCycleProfit=cycleProfit;

   // Keep the existing hard Basket loss exactly as-is even when POSITION mode
   // contains both BUY and SELL tickets.
   double lossLimit=EffectiveBasketLossLimit();
   if(lossLimit>0.0 && cycleProfit<=-lossLimit)
   {
      RaceCloseCycle("RACE_MAX_BASKET_LOSS");
      return true;
   }

   // POSITION mode still owns profit exits ticket-by-ticket.
   int harvested=RaceHarvestProfitablePositions();
   if(harvested>0)
   {
      g_raceProfitArmed=false;
      g_racePeakProfit=0.0;

      if(BasketPositionCount()<=0)
      {
         ResetRaceRuntime();
         g_executionStatus="RACE_PROFIT_HARVEST_FLAT";
         return true;
      }

      g_raceState="HARVESTED_PROFIT";
      g_executionStatus="RACE_PROFIT_HARVEST";
      return true;
   }

   filledUnits=RaceFilledUnits();
   bool filling=filledUnits<g_maxPositions;
   if(!filling)
   {
      g_raceState="FULL_WAIT_PROFIT";
      g_executionStatus="RACE_WAIT_PER_POSITION_TARGET";
      return true;
   }

   int signalDirection=RaceAnalysisDirection(momentum);
   if(signalDirection==0)
   {
      g_raceState="PRICE_FLOW_WAIT";
      g_executionStatus="RACE_PRICE_FLOW_WAIT";
      return true;
   }

   // POSITION/Hedging is open-flow: current analysis chooses BUY or SELL and
   // the existing ticket P/L never vetoes a new fill. Profit remains owned by
   // the configured per-ticket target; Max Positions / explicit loss controls
   // remain authoritative.
   g_raceState="FILLING";
   ProcessRaceFill(signalDirection);
   return true;
}


void RaceResetVolumeWindow(datetime now)
{
   for(int i=0;i<RACE_VOLUME_HISTORY_SECONDS;i++)
   {
      g_raceVolumeBucketSecond[i]=0;
      g_raceVolumeBucketBuy[i]=0.0;
      g_raceVolumeBucketSell[i]=0.0;
      g_raceVolumeBucketSamples[i]=0;
   }
   g_raceVolumeWarmupStartedAt=now;
   g_raceVolumeLastSampleAt=0;
   g_raceVolumeLastMid=0.0;
}

void RaceSampleVolumePressure()
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return;

   datetime now=(tick.time>0 ? (datetime)tick.time : TimeCurrent());
   if(now<=0)
      return;

   if(g_raceVolumeWarmupStartedAt<=0 ||
      (g_raceVolumeLastSampleAt>0 && now-g_raceVolumeLastSampleAt>RACE_VOLUME_WINDOW_SECONDS))
      RaceResetVolumeWindow(now);

   int slot=(int)((long)now % RACE_VOLUME_HISTORY_SECONDS);
   if(g_raceVolumeBucketSecond[slot]!=now)
   {
      g_raceVolumeBucketSecond[slot]=now;
      g_raceVolumeBucketBuy[slot]=0.0;
      g_raceVolumeBucketSell[slot]=0.0;
      g_raceVolumeBucketSamples[slot]=0;
   }

   double mid=(tick.bid+tick.ask)*0.5;
   int side=0;
   double weight=1.0;
   bool flaggedBuy=((tick.flags & TICK_FLAG_BUY)!=0);
   bool flaggedSell=((tick.flags & TICK_FLAG_SELL)!=0);

   // Prefer real deal-side volume when the broker publishes it. Most OTC FX/
   // metal feeds expose quote ticks instead, so classify those by uptick/down-
   // tick and count one unit of tick volume per directional price update.
   if(flaggedBuy!=flaggedSell)
   {
      side=flaggedBuy ? 1 : -1;
      double reported=(tick.volume_real>0.0 ? tick.volume_real : (double)tick.volume);
      if(reported>0.0)
         weight=reported;
   }
   else if(g_raceVolumeLastMid>0.0)
   {
      double epsilon=MathMax(_Point*0.05,0.00000001);
      if(mid>g_raceVolumeLastMid+epsilon) side=1;
      else if(mid<g_raceVolumeLastMid-epsilon) side=-1;
   }

   if(side>0)
   {
      g_raceVolumeBucketBuy[slot]+=weight;
      g_raceVolumeBucketSamples[slot]++;
   }
   else if(side<0)
   {
      g_raceVolumeBucketSell[slot]+=weight;
      g_raceVolumeBucketSamples[slot]++;
   }

   g_raceVolumeLastMid=mid;
   g_raceVolumeLastSampleAt=now;
}

void RaceVolumeSnapshotWindow(int windowSeconds,double &buyPressure,double &sellPressure,int &samples)
{
   buyPressure=0.0;
   sellPressure=0.0;
   samples=0;
   int effectiveWindow=windowSeconds;
   if(effectiveWindow<1) effectiveWindow=1;
   if(effectiveWindow>RACE_VOLUME_HISTORY_SECONDS) effectiveWindow=RACE_VOLUME_HISTORY_SECONDS;
   datetime now=TimeCurrent();
   for(int i=0;i<RACE_VOLUME_HISTORY_SECONDS;i++)
   {
      datetime stamp=g_raceVolumeBucketSecond[i];
      if(stamp<=0 || stamp>now || now-stamp>=effectiveWindow)
         continue;
      buyPressure+=g_raceVolumeBucketBuy[i];
      sellPressure+=g_raceVolumeBucketSell[i];
      samples+=g_raceVolumeBucketSamples[i];
   }
}

void RaceVolumeSnapshot(double &buyPressure,double &sellPressure,int &samples)
{
   RaceVolumeSnapshotWindow(RACE_VOLUME_WINDOW_SECONDS,buyPressure,sellPressure,samples);
}

bool RaceVolumeWindowReady()
{
   if(g_raceVolumeWarmupStartedAt<=0 ||
      TimeCurrent()-g_raceVolumeWarmupStartedAt<RACE_VOLUME_WINDOW_SECONDS)
      return false;
   double buyPressure=0.0;
   double sellPressure=0.0;
   int samples=0;
   RaceVolumeSnapshot(buyPressure,sellPressure,samples);
   return samples>0;
}

int RaceVolumeDirection()
{
   if(!RaceVolumeWindowReady())
      return 0;

   double buyPressure=0.0;
   double sellPressure=0.0;
   int samples=0;
   RaceVolumeSnapshot(buyPressure,sellPressure,samples);

   double totalPressure=buyPressure+sellPressure;
   if(samples<=0 || totalPressure<=0.00000001)
      return 0;

   double leadingPressure=MathMax(buyPressure,sellPressure);
   if(leadingPressure/totalPressure<RACE_VOLUME_MIN_DOMINANCE)
      return 0;

   return buyPressure>sellPressure ? 1 : -1;
}

int RaceM5CandleDirection()
{
   // Stable M5 candle fallback for the RACE structure engine. Primary side
   // selection comes from the 20-bar regime + Demand/Supply context.
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, PERIOD_M5, 1, 1, rates) < 1)
      return 0;

   if(rates[0].close > rates[0].open) return 1;
   if(rates[0].close < rates[0].open) return -1;
   return 0;
}

bool RaceZonePriorityActive(
   int zoneDirection,
   double price,
   double atrPrice,
   bool &broken)
{
   broken=false;
   if(zoneDirection==0 || price<=0.0 || atrPrice<=0.0)
      return false;

   double low=zoneDirection>0 ? g_demandZoneLow : g_supplyZoneLow;
   double high=zoneDirection>0 ? g_demandZoneHigh : g_supplyZoneHigh;
   double score=zoneDirection>0 ? g_demandZoneScore : g_supplyZoneScore;
   if(low<=0.0 || high<low || score<55.0)
      return false;

   // Keep RACE fast: a real break is confirmed from live price, not by waiting
   // for another candle. Once price clears the far edge by 0.12 ATR, the
   // original 60-second flow may continue through the zone immediately.
   double breakBuffer=atrPrice*0.12;
   broken=zoneDirection>0
      ? price < low-breakBuffer
      : price > high+breakBuffer;
   if(broken)
      return false;

   bool inside=price>=low && price<=high;
   bool near=PriceInsideOrNearZone(price,low,high,atrPrice*0.18);

   // Moderate zones get priority only when price is actually inside them.
   // A nearby zone must be stronger (70+) before it can override tick flow.
   return inside || (score>=70.0 && near);
}

int RaceM5TwentyBarRegime(double &scoreOut)
{
   scoreOut=0.0;

   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   int copied=CopyRates(_Symbol,PERIOD_M5,1,RACE_M5_LOOKBACK_BARS,rates);
   if(copied<RACE_M5_LOOKBACK_BARS)
      return 0;

   double atrPrice=MathMax(
      _Point*8.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );
   double stepNoise=MathMax(_Point*2.0,atrPrice*0.025);

   int upSteps=0;
   int downSteps=0;
   int pauseSteps=0;
   for(int i=0;i<copied-1;i++)
   {
      double delta=rates[i].close-rates[i+1].close;
      if(delta>stepNoise) upSteps++;
      else if(delta<-stepNoise) downSteps++;
      else pauseSteps++;
   }

   double netMove=rates[0].close-rates[copied-1].close;
   double netAtr=atrPrice>0.0 ? netMove/atrPrice : 0.0;
   double imbalance=(double)(upSteps-downSteps)/(double)MathMax(1,copied-1);
   scoreOut=MathMax(-100.0,MathMin(100.0,netAtr*28.0+imbalance*55.0));

   // "ลง ลง ลง พัก ลง ลง" remains a down regime even with pauses. Alternating
   // down/up/down/up stays neutral and is handled as a mean-reversion range.
   bool downRegime=
      downSteps>=9 &&
      downSteps>=upSteps+3 &&
      netAtr<=-0.35;
   bool upRegime=
      upSteps>=9 &&
      upSteps>=downSteps+3 &&
      netAtr>=0.35;

   if(downRegime) return -1;
   if(upRegime) return 1;
   return 0;
}

int RaceM5LiveSwingDirection()
{
   MqlRates current[];
   ArraySetAsSeries(current,true);
   if(CopyRates(_Symbol,PERIOD_M5,0,1,current)<1)
      return 0;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return 0;

   double price=(tick.bid+tick.ask)*0.5;
   double atrPrice=MathMax(
      _Point*8.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );
   double noisePrice=MathMax(
      MathMax(_Point*2.0,CurrentSpreadPoints()*_Point),
      atrPrice*0.035
   );
   double delta=price-current[0].open;

   if(delta>noisePrice) return 1;
   if(delta<-noisePrice) return -1;

   // When the forming M5 is still too small, use the latest completed candle
   // only as a stable fallback; never fall back to the two-second Bid signal.
   return RaceM5CandleDirection();
}

int RaceConfirmedZoneBreakDirection()
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return 0;

   MqlRates closed[];
   ArraySetAsSeries(closed,true);
   if(CopyRates(_Symbol,PERIOD_M5,1,1,closed)<1)
      return 0;

   double atrPrice=MathMax(
      _Point*8.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );
   double buffer=atrPrice*RACE_ZONE_BREAK_BUFFER_ATR;
   double price=(tick.bid+tick.ask)*0.5;

   bool demandValid=
      g_demandZoneScore>=50.0 &&
      g_demandZoneLow>0.0 &&
      g_demandZoneHigh>=g_demandZoneLow;
   bool supplyValid=
      g_supplyZoneScore>=50.0 &&
      g_supplyZoneLow>0.0 &&
      g_supplyZoneHigh>=g_supplyZoneLow;

   // A wick alone is not a break. The latest completed M5 must close beyond
   // the far edge with buffer and live price must still be outside the zone.
   if(demandValid &&
      closed[0].close<g_demandZoneLow-buffer &&
      price<g_demandZoneLow-buffer)
      return -1;

   if(supplyValid &&
      closed[0].close>g_supplyZoneHigh+buffer &&
      price>g_supplyZoneHigh+buffer)
      return 1;

   return 0;
}

int RaceHeldZoneReversalDirection()
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return 0;

   double price=(tick.bid+tick.ask)*0.5;
   double atrPrice=MathMax(
      _Point*8.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );
   int breakDirection=RaceConfirmedZoneBreakDirection();

   bool demandHeld=
      breakDirection!=-1 &&
      g_demandZoneScore>=50.0 &&
      g_demandZoneLow>0.0 &&
      g_demandZoneHigh>=g_demandZoneLow &&
      PriceInsideOrNearZone(
         price,
         g_demandZoneLow,
         g_demandZoneHigh,
         atrPrice*RACE_ZONE_NEAR_ATR
      );

   bool supplyHeld=
      breakDirection!=1 &&
      g_supplyZoneScore>=50.0 &&
      g_supplyZoneLow>0.0 &&
      g_supplyZoneHigh>=g_supplyZoneLow &&
      PriceInsideOrNearZone(
         price,
         g_supplyZoneLow,
         g_supplyZoneHigh,
         atrPrice*RACE_ZONE_NEAR_ATR
      );

   if(demandHeld && supplyHeld)
   {
      double demandMid=(g_demandZoneLow+g_demandZoneHigh)*0.5;
      double supplyMid=(g_supplyZoneLow+g_supplyZoneHigh)*0.5;
      return MathAbs(price-demandMid)<=MathAbs(price-supplyMid) ? 1 : -1;
   }
   if(demandHeld) return 1;
   if(supplyHeld) return -1;
   return 0;
}

bool RaceFillPacingReady(int direction)
{
   if(direction==0)
      return false;

   int positions=BasketPositionCount();
   if(positions<=0 || g_raceLastFillMs==0)
      return true;

   ulong nowMs=GetTickCount64();
   if(nowMs-g_raceLastFillMs<(ulong)RACE_FILL_INTERVAL_MS)
   {
      g_executionStatus="RACE_FILL_PACING";
      return false;
   }

   // A new structural side after the old cycle has flattened is treated as a
   // fresh first fill. Same-side additions need real favorable price progress.
   if(g_raceLastFillDirection!=direction || g_raceLastFillPrice<=0.0)
      return true;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return false;

   double currentPrice=direction>0 ? tick.ask : tick.bid;
   double atrPoints=AverageTrueRangePoints(PERIOD_M5,g_atrPeriod);
   if(atrPoints<=0.0)
      return false;

   double requiredPoints=MathMax(
      MathMax(1.0,CurrentSpreadPoints()*0.50),
      atrPoints*RACE_FILL_PROGRESS_ATR
   );
   double progressPoints=direction>0
      ? (currentPrice-g_raceLastFillPrice)/_Point
      : (g_raceLastFillPrice-currentPrice)/_Point;

   if(progressPoints+0.00000001<requiredPoints)
   {
      g_executionStatus="RACE_WAIT_PRICE_PROGRESS";
      return false;
   }
   return true;
}


#include "include\\RaceFlowV2.mqh"
#include "include\\RaceStructureV2.mqh"
#include "include\\RaceLegPhaseV2.mqh"
#include "include\\RaceDecisionV2.mqh"
#include "include\\RaceExposureV1.mqh"
#include "include\\RaceLossV2.mqh"
#include "include\\RaceReentryV1.mqh"
#include "include\\RaceNewsV1.mqh"
#include "include\\RaceTelemetryV1.mqh"

// RACE-only anti-chase guard -------------------------------------------------
// This guard changes only RACE entry/fill timing. It never flips direction,
// closes a Basket, changes Lot/Max Positions, or participates in AUTO/MANUAL/
// FLIP/ZERO logic. When RACE is already stretched at the terminal edge of a
// move, wait for a real pullback followed by a fresh continuation candle.
bool RaceAntiChasePullbackContinuationReady(int direction,double atrM5Price)
{
   if(direction==0 || atrM5Price<=0.0)
      return false;

   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   if(CopyRates(_Symbol,PERIOD_M5,1,3,rates)<3)
      return false;

   double latestBody=MathAbs(rates[0].close-rates[0].open);
   bool latestContinuation=direction>0
      ? rates[0].close>rates[0].open
      : rates[0].close<rates[0].open;

   bool priorPullback=direction>0
      ? rates[1].close<rates[1].open
      : rates[1].close>rates[1].open;

   double priorBody=MathAbs(rates[1].close-rates[1].open);

   // Require a measurable counter-direction pause/pullback first, then a fresh
   // completed M5 candle back in the original RACE direction. This deliberately
   // does not treat a wick-only pause as enough confirmation.
   return latestContinuation &&
          latestBody>=atrM5Price*0.12 &&
          priorPullback &&
          priorBody>=atrM5Price*0.10;
}

bool RaceAntiChaseBlocked(int direction,string &reasonOut)
{
   reasonOut="NONE";
   if(direction==0)
      return false;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return false;

   double price=(tick.bid+tick.ask)*0.5;
   if(price<=0.0)
      return false;

   double atrM5Points=AverageTrueRangePoints(PERIOD_M5,g_atrPeriod);
   double atrM15Points=AverageTrueRangePoints(PERIOD_M15,g_atrPeriod);
   if(atrM5Points<=0.0 || atrM15Points<=0.0)
      return false;

   double atrM5Price=atrM5Points*_Point;
   double atrM15Price=atrM15Points*_Point;

   MqlRates m5[];
   ArraySetAsSeries(m5,true);
   int copiedM5=CopyRates(_Symbol,PERIOD_M5,1,10,m5);
   if(copiedM5<4)
      return false;

   MqlRates m15[];
   ArraySetAsSeries(m15,true);
   int copiedM15=CopyRates(_Symbol,PERIOD_M15,1,10,m15);

   double m5Low=m5[0].low;
   double m5High=m5[0].high;
   for(int i=1;i<copiedM5;i++)
   {
      m5Low=MathMin(m5Low,m5[i].low);
      m5High=MathMax(m5High,m5[i].high);
   }

   double m15Low=0.0;
   double m15High=0.0;
   if(copiedM15>=4)
   {
      m15Low=m15[0].low;
      m15High=m15[0].high;
      for(int i=1;i<copiedM15;i++)
      {
         m15Low=MathMin(m15Low,m15[i].low);
         m15High=MathMax(m15High,m15[i].high);
      }
   }

   bool nearM5Terminal=direction>0
      ? price>=m5High-atrM5Price*0.20
      : price<=m5Low+atrM5Price*0.20;

   bool nearM15Terminal=false;
   if(copiedM15>=4)
   {
      nearM15Terminal=direction>0
         ? price>=m15High-atrM15Price*0.14
         : price<=m15Low+atrM15Price*0.14;
   }

   double latestRange=MathMax(_Point,m5[0].high-m5[0].low);
   double latestBody=MathAbs(m5[0].close-m5[0].open);
   double latestBodyRatio=latestBody/latestRange;
   bool latestDirectional=direction>0
      ? m5[0].close>m5[0].open
      : m5[0].close<m5[0].open;

   // A single large completed M5 expansion candle is the exact case that used
   // to make RACE chase the bottom/top. It is a hard WAIT until pullback +
   // continuation is visible.
   bool largeExpansion=
      latestDirectional &&
      latestBody>=atrM5Price*0.75 &&
      latestBodyRatio>=0.58;

   int sameDirectionBars=0;
   int recent=MathMin(copiedM5,4);
   for(int i=0;i<recent;i++)
   {
      bool same=direction>0
         ? m5[i].close>m5[i].open
         : m5[i].close<m5[i].open;
      if(same)
         sameDirectionBars++;
   }

   double runTravel=direction>0
      ? m5[0].close-m5[recent-1].open
      : m5[recent-1].open-m5[0].close;

   bool stretchedRun=
      sameDirectionBars>=3 &&
      runTravel>=atrM5Price*1.05;

   bool terminalEdge=nearM5Terminal || nearM15Terminal;

   // Protect the still-forming impulse too. Waiting only for the M5 candle to
   // close is too late for RACE because it can fill while the long candle is
   // still extending. Measure live displacement from the latest completed M5
   // close and hard-WAIT once that displacement reaches 0.35 ATR at the edge.
   double liveTravel=direction>0
      ? price-m5[0].close
      : m5[0].close-price;
   bool liveImpulseExtension=
      terminalEdge &&
      liveTravel>=atrM5Price*0.35;

   if(liveImpulseExtension)
   {
      reasonOut=direction>0
         ? "RACE_WAIT_BUY_LIVE_EXTENSION"
         : "RACE_WAIT_SELL_LIVE_EXTENSION";
      return true;
   }

   bool chaseRisk=largeExpansion || (terminalEdge && stretchedRun);
   if(!chaseRisk)
      return false;

   // Never reverse the side here. A valid pullback/continuation simply releases
   // the existing RACE direction; otherwise the fill waits and is re-evaluated.
   if(RaceAntiChasePullbackContinuationReady(direction,atrM5Price))
      return false;

   if(largeExpansion)
      reasonOut=direction>0
         ? "RACE_WAIT_BUY_EXPANSION_PULLBACK"
         : "RACE_WAIT_SELL_EXPANSION_PULLBACK";
   else
      reasonOut=direction>0
         ? "RACE_WAIT_BUY_TERMINAL_PULLBACK"
         : "RACE_WAIT_SELL_TERMINAL_PULLBACK";

   return true;
}

int RaceLivePriceDirection()
{
   // Follow the visible MT5 chart price only. MT5 OTC charts are Bid-based, so
   // spread expansion/contraction cannot manufacture a false BUY/SELL signal.
   // Compare current Bid with the oldest valid Bid from roughly the last 2s.
   MqlTick nowTick;
   if(!SymbolInfoTick(_Symbol,nowTick) || nowTick.bid<=0.0)
      return 0;

   MqlTick ticks[];
   ulong fromMsc=nowTick.time_msc>2000 ? (ulong)nowTick.time_msc-2000 : 0;
   int copied=CopyTicks(_Symbol,ticks,COPY_TICKS_INFO,fromMsc,0);
   if(copied<2)
      return 0;

   double firstBid=0.0;
   double lastBid=0.0;
   for(int i=0;i<copied;i++)
   {
      if(ticks[i].bid<=0.0)
         continue;
      if(firstBid<=0.0)
         firstBid=ticks[i].bid;
      lastBid=ticks[i].bid;
   }

   if(firstBid<=0.0 || lastBid<=0.0)
      return 0;

   double delta=lastBid-firstBid;
   if(delta>0.0) return 1;
   if(delta<0.0) return -1;
   return 0;
}

bool CounterModeEnabled()
{
   return EffectiveExecutionMode() == "COUNTER";
}

bool BasketHasCounterPosition()
{
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic)
         continue;
      if(StringFind(PositionGetString(POSITION_COMMENT),"SaaSCounter")>=0)
         return true;
   }
   return false;
}

int CounterPositionCount()
{
   int count=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic)
         continue;
      if(StringFind(PositionGetString(POSITION_COMMENT),"SaaSCounter")>=0)
         count++;
   }
   return count;
}

int CounterFilledUnitsByDirection(int direction)
{
   if(direction==0)
      return 0;

   long expectedType=direction>0 ? POSITION_TYPE_BUY : POSITION_TYPE_SELL;
   double baseVolume=NormalizeTradeVolume(g_lot);
   double totalVolume=0.0;
   int positions=0;

   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic ||
         StringFind(PositionGetString(POSITION_COMMENT),"SaaSCounter")<0 ||
         PositionGetInteger(POSITION_TYPE)!=expectedType)
         continue;

      totalVolume+=PositionGetDouble(POSITION_VOLUME);
      positions++;
   }

   if(baseVolume<=0.0)
      return positions;

   int volumeUnits=(int)MathRound(totalVolume/baseVolume);
   return MathMax(positions,MathMax(0,volumeUnits));
}

bool CounterSideStats(
   int direction,
   double &averagePrice,
   double &totalVolume,
   int &positions
)
{
   averagePrice=0.0;
   totalVolume=0.0;
   positions=0;
   if(direction==0)
      return false;

   long expectedType=direction>0 ? POSITION_TYPE_BUY : POSITION_TYPE_SELL;
   double weightedPrice=0.0;

   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic ||
         StringFind(PositionGetString(POSITION_COMMENT),"SaaSCounter")<0 ||
         PositionGetInteger(POSITION_TYPE)!=expectedType)
         continue;

      double volume=PositionGetDouble(POSITION_VOLUME);
      double openPrice=PositionGetDouble(POSITION_PRICE_OPEN);
      if(volume<=0.0 || openPrice<=0.0)
         continue;

      weightedPrice+=openPrice*volume;
      totalVolume+=volume;
      positions++;
   }

   if(totalVolume<=0.0 || positions<=0)
      return false;

   averagePrice=weightedPrice/totalVolume;
   return averagePrice>0.0;
}

double CounterRecenterDynamicTriggerPoints()
{
   MqlTick tick;
   double spreadPoints=0.0;
   if(SymbolInfoTick(_Symbol,tick) && tick.ask>tick.bid && _Point>0.0)
      spreadPoints=(tick.ask-tick.bid)/_Point;

   double trigger=MathMax(
      COUNTER_RECENTER_MIN_GAP_POINTS,
      spreadPoints*COUNTER_RECENTER_SPREAD_MULTIPLIER
   );

   double atrM1=AverageTrueRangePoints(PERIOD_M1,g_atrPeriod);
   double atrM5=AverageTrueRangePoints(PERIOD_M5,g_atrPeriod);
   if(atrM1>0.0)
      trigger=MathMax(trigger,atrM1*COUNTER_RECENTER_ATR_M1_MULTIPLIER);
   if(atrM5>0.0)
      trigger=MathMax(trigger,atrM5*COUNTER_RECENTER_ATR_M5_MULTIPLIER);

   return MathMax(COUNTER_RECENTER_MIN_GAP_POINTS,trigger);
}

bool CounterRefreshRecenterState()
{
   double buyAverage=0.0,buyVolume=0.0;
   double sellAverage=0.0,sellVolume=0.0;
   int buyPositions=0,sellPositions=0;

   bool hasBuy=CounterSideStats(1,buyAverage,buyVolume,buyPositions);
   bool hasSell=CounterSideStats(-1,sellAverage,sellVolume,sellPositions);
   if(!hasBuy || !hasSell || _Point<=0.0)
   {
      g_counterRecenterActive=false;
      g_counterRecenterGapPoints=0.0;
      g_counterRecenterTriggerPoints=0.0;
      return false;
   }

   double gapPoints=MathAbs(buyAverage-sellAverage)/_Point;
   double triggerPoints=CounterRecenterDynamicTriggerPoints();
   g_counterRecenterGapPoints=gapPoints;
   g_counterRecenterTriggerPoints=triggerPoints;

   if(g_counterRecenterActive)
   {
      double releasePoints=triggerPoints*COUNTER_RECENTER_RELEASE_RATIO;
      if(gapPoints<=releasePoints)
         g_counterRecenterActive=false;
   }
   else if(gapPoints>=triggerPoints)
   {
      g_counterRecenterActive=true;
   }

   return g_counterRecenterActive;
}

bool CounterProjectedGapAfterFill(
   int direction,
   double entryPrice,
   double &currentGapPoints,
   double &projectedGapPoints
)
{
   currentGapPoints=0.0;
   projectedGapPoints=0.0;
   if(direction==0 || entryPrice<=0.0 || _Point<=0.0)
      return false;

   double buyAverage=0.0,buyVolume=0.0;
   double sellAverage=0.0,sellVolume=0.0;
   int buyPositions=0,sellPositions=0;
   if(!CounterSideStats(1,buyAverage,buyVolume,buyPositions) ||
      !CounterSideStats(-1,sellAverage,sellVolume,sellPositions))
      return false;

   double addVolume=NormalizeTradeVolume(g_lot);
   if(addVolume<=0.0)
      return false;

   currentGapPoints=MathAbs(buyAverage-sellAverage)/_Point;
   if(direction>0)
      buyAverage=(buyAverage*buyVolume+entryPrice*addVolume)/(buyVolume+addVolume);
   else
      sellAverage=(sellAverage*sellVolume+entryPrice*addVolume)/(sellVolume+addVolume);

   projectedGapPoints=MathAbs(buyAverage-sellAverage)/_Point;
   return true;
}

bool CounterRecenterAllowsFill(int direction)
{
   if(!CounterRefreshRecenterState())
      return true;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return false;

   double entryPrice=direction>0 ? tick.ask : tick.bid;
   double currentGapPoints=0.0;
   double projectedGapPoints=0.0;
   if(!CounterProjectedGapAfterFill(
         direction,entryPrice,currentGapPoints,projectedGapPoints))
      return false;

   double improvementTolerance=MathMax(
      0.5,
      g_counterRecenterTriggerPoints*0.01
   );
   if(projectedGapPoints+improvementTolerance<currentGapPoints)
      return true;

   g_executionStatus=direction>0
      ? "COUNTER_RECENTER_BLOCK_BUY"
      : "COUNTER_RECENTER_BLOCK_SELL";
   return false;
}

bool CounterProjectedGapAfterClose(
   ulong ticket,
   double closeVolume,
   double &currentGapPoints,
   double &projectedGapPoints
)
{
   currentGapPoints=0.0;
   projectedGapPoints=0.0;
   if(ticket==0 || closeVolume<=0.0 || _Point<=0.0 ||
      !PositionSelectByTicket(ticket))
      return false;

   if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
      PositionGetInteger(POSITION_MAGIC)!=InpMagic ||
      StringFind(PositionGetString(POSITION_COMMENT),"SaaSCounter")<0)
      return false;

   long type=PositionGetInteger(POSITION_TYPE);
   int direction=type==POSITION_TYPE_BUY ? 1 : -1;
   double openPrice=PositionGetDouble(POSITION_PRICE_OPEN);

   double buyAverage=0.0,buyVolume=0.0;
   double sellAverage=0.0,sellVolume=0.0;
   int buyPositions=0,sellPositions=0;
   if(!CounterSideStats(1,buyAverage,buyVolume,buyPositions) ||
      !CounterSideStats(-1,sellAverage,sellVolume,sellPositions))
      return false;

   currentGapPoints=MathAbs(buyAverage-sellAverage)/_Point;
   if(direction>0)
   {
      double remaining=buyVolume-closeVolume;
      if(remaining<=0.00000001)
         return false;
      buyAverage=(buyAverage*buyVolume-openPrice*closeVolume)/remaining;
   }
   else
   {
      double remaining=sellVolume-closeVolume;
      if(remaining<=0.00000001)
         return false;
      sellAverage=(sellAverage*sellVolume-openPrice*closeVolume)/remaining;
   }

   projectedGapPoints=MathAbs(buyAverage-sellAverage)/_Point;
   return true;
}

bool CounterRecenterAllowsProfitClose(ulong ticket,double closeVolume)
{
   if(!CounterRefreshRecenterState())
      return true;

   double currentGapPoints=0.0;
   double projectedGapPoints=0.0;
   if(!CounterProjectedGapAfterClose(
         ticket,closeVolume,currentGapPoints,projectedGapPoints))
   {
      g_executionStatus="COUNTER_RECENTER_HOLD_PROFIT";
      return false;
   }

   double tolerance=MathMax(0.5,g_counterRecenterTriggerPoints*0.01);
   if(projectedGapPoints<=currentGapPoints+tolerance)
      return true;

   g_executionStatus="COUNTER_RECENTER_HOLD_PROFIT";
   return false;
}

bool CounterCanSendOrder()
{
   ulong nowMs=GetTickCount64();
   if(nowMs-g_lastOrderMs<(ulong)COUNTER_FILL_INTERVAL_MS)
      return false;

   datetime now=TimeCurrent();
   if(g_counterOrderWindowStart==0 || now-g_counterOrderWindowStart>=60)
   {
      g_counterOrderWindowStart=now;
      g_counterOrdersInWindow=0;
   }

   if(g_counterOrdersInWindow>=COUNTER_MAX_ORDERS_PER_MINUTE)
      return false;

   return CanSendOrder();
}

void CounterRegisterOrderRequest()
{
   RegisterOrderRequest();
   if(g_counterOrderWindowStart==0)
      g_counterOrderWindowStart=TimeCurrent();
   g_counterOrdersInWindow++;
}

int CounterSignalDirection()
{
   // Exactly one decision rule: follow visible Bid flow.
   // Price up => BUY, price down => SELL.
   int graphDirection=RaceLivePriceDirection();
   if(graphDirection>0) return 1;
   if(graphDirection<0) return -1;
   return 0;
}

bool SendCounterMarketOrder(int direction)
{
   if(direction==0)
      return false;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
   {
      g_lastOrderError=GetLastError();
      g_lastOrderRetcode=0;
      g_lastOrderAt=TimeCurrent();
      g_executionStatus="COUNTER_NO_TICK";
      return false;
   }

   MqlTradeRequest request={};
   MqlTradeResult result={};
   request.action=TRADE_ACTION_DEAL;
   request.magic=InpMagic;
   request.symbol=_Symbol;
   request.volume=NormalizeTradeVolume(g_lot);
   request.deviation=DynamicDeviationPoints();
   request.type_filling=AllowedFillingMode();
   request.comment="SaaSCounter";
   request.sl=0.0;
   request.tp=0.0;

   if(request.volume<=0.0)
   {
      g_executionStatus="COUNTER_INVALID_LOT";
      return false;
   }

   if(direction>0)
   {
      request.type=ORDER_TYPE_BUY;
      request.price=tick.ask;
   }
   else
   {
      request.type=ORDER_TYPE_SELL;
      request.price=tick.bid;
   }

   ResetLastError();
   bool sent=OrderSendWithPriceRetry(request,result);
   g_lastOrderRetcode=(long)result.retcode;
   g_lastOrderError=GetLastError();
   g_lastOrderAt=TimeCurrent();

   if(!sent || !TradeResultAccepted(result))
   {
      RecordExecutionQuality(false,0.0);
      g_executionStatus=RetcodeExecutionStatus((long)result.retcode);
      Print("COUNTER order rejected. retcode=",result.retcode," comment=",result.comment);
      return false;
   }

   double fillPrice=result.price>0.0 ? result.price : request.price;
   double slippagePoints=MathAbs(fillPrice-request.price)/_Point;
   RecordExecutionQuality(true,slippagePoints);
   g_adaptiveLot=request.volume;
   g_lastEntryReason=direction>0 ? "COUNTER_BUY" : "COUNTER_SELL";
   g_lastEntryAt=TimeCurrent();
   g_executionStatus="COUNTER_ORDER_ACCEPTED";
   return true;
}

int CounterHarvestProfitablePositions()
{
   int harvested=0;
   bool hedging=((ENUM_ACCOUNT_MARGIN_MODE)AccountInfoInteger(ACCOUNT_MARGIN_MODE)==
                 ACCOUNT_MARGIN_MODE_RETAIL_HEDGING);
   double baseVolume=NormalizeTradeVolume(g_lot);
   double target=MathMax(0.01,g_counterPerPositionProfitMoney);

   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic ||
         StringFind(PositionGetString(POSITION_COMMENT),"SaaSCounter")<0)
         continue;

      double displayedProfit=PositionGetDouble(POSITION_PROFIT);
      double positionVolume=PositionGetDouble(POSITION_VOLUME);
      double comparableProfit=displayedProfit;
      if(!hedging && positionVolume>0.0 && baseVolume>0.0)
         comparableProfit=displayedProfit*MathMin(1.0,baseVolume/positionVolume);

      if(comparableProfit+0.00000001<target)
         continue;

      double closeVolume=hedging
         ? positionVolume
         : MathMin(positionVolume,baseVolume);
      if(closeVolume<=0.0)
         continue;

      // When BUY/SELL inventory averages have drifted too far apart, keep a
      // profitable ticket open if removing it would widen that gap further.
      // This preserves profitable anchors until the two COUNTER sides recenter.
      if(!CounterRecenterAllowsProfitClose(ticket,closeVolume))
         continue;

      // Profit close is a hard local MT5 target. Never delay an allowed winning
      // close behind COUNTER entry pacing: once Recenter says the close does not
      // worsen inventory geometry, send it immediately on this tick.
      bool closed=ClosePositionVolumeByTicket(ticket,closeVolume,"SCNCounterProfit");
      CounterRegisterOrderRequest();
      if(closed)
      {
         harvested++;
         g_executionStatus="COUNTER_HARD_PROFIT_CLOSE";
         g_lastCloseReason="COUNTER_HARD_PROFIT_CLOSE";
      }

      // Hedging accounts may have several independent tickets at target on the
      // same tick; keep scanning and close all of them now. Netting exposes one
      // aggregate position, so one configured-lot unit is realized per pass.
      if(!hedging)
         break;
   }

   return harvested;
}

bool ProcessCounterFill(int direction)
{
   if(direction==0)
      return false;

   if(CounterFilledUnitsByDirection(direction)>=g_maxPositions)
   {
      g_executionStatus=direction>0
         ? "COUNTER_BUY_SLOT_FULL"
         : "COUNTER_SELL_SLOT_FULL";
      return true;
   }

   if(g_state!=STATE_RUNNING || !g_access ||
      (!MQLInfoInteger(MQL_TESTER) && !EntryLeaseValid()))
   {
      g_executionStatus="COUNTER_CONTROL_NOT_FRESH";
      return false;
   }

   if(TradePermissionStatus()!="OK")
   {
      g_executionStatus="COUNTER_TRADE_PERMISSION";
      return false;
   }

   if(!OpenTradingAllowedForDirection(direction))
   {
      g_executionStatus="COUNTER_SYMBOL_DIRECTION_BLOCKED";
      return false;
   }

   // Recenter never changes the COUNTER signal. It only refuses a new fill
   // when that exact fill would push BUY/SELL weighted entry averages farther
   // apart while the gap is already abnormally wide.
   if(!CounterRecenterAllowsFill(direction))
      return false;

   if(!CounterCanSendOrder())
   {
      g_executionStatus="COUNTER_FILL_PACING";
      return false;
   }

   bool accepted=SendCounterMarketOrder(direction);
   CounterRegisterOrderRequest();
   if(accepted)
   {
      int sideFilled=CounterFilledUnitsByDirection(direction);
      if(sideFilled>=g_maxPositions)
         g_executionStatus=direction>0
            ? "COUNTER_BUY_SLOT_FULL"
            : "COUNTER_SELL_SLOT_FULL";
      else
         g_executionStatus=direction>0
            ? "COUNTER_FILLING_BUY"
            : "COUNTER_FILLING_SELL";
   }
   return accepted;
}

bool ManageCounterMode()
{
   // Profit is used only as the per-position exit trigger. It never selects side.
   CounterHarvestProfitablePositions();

   if(g_state!=STATE_RUNNING || !g_access ||
      (!MQLInfoInteger(MQL_TESTER) && !EntryLeaseValid()))
   {
      g_executionStatus=CounterPositionCount()>0
         ? "COUNTER_MANAGE_ONLY"
         : "COUNTER_CONTROL_NOT_FRESH";
      return true;
   }

   int direction=CounterSignalDirection();
   if(direction==0)
   {
      g_executionStatus="COUNTER_PRICE_FLOW_WAIT";
      return true;
   }

   // BUY and SELL own independent capacity. A full BUY side must never block
   // a SELL fill, and a full SELL side must never block a BUY fill.
   if(CounterFilledUnitsByDirection(direction)>=g_maxPositions)
   {
      g_executionStatus=direction>0
         ? "COUNTER_BUY_SLOT_FULL"
         : "COUNTER_SELL_SLOT_FULL";
      return true;
   }

   ProcessCounterFill(direction);
   return true;
}

int RaceAnalysisDirection(double momentum)
{
   if(g_entryMode == ENTRY_BUY_ONLY) return 1;
   if(g_entryMode == ENTRY_SELL_ONLY) return -1;

   // RACE 1.1.20: M5 structure is the brain. Refresh Demand/Supply only while
   // RACE owns execution; AUTO/MANUAL/COUNTER/FLIP/ZERO decision paths are not
   // called or modified here.
   RefreshMarketContext(false);

   int breakDirection=RaceConfirmedZoneBreakDirection();
   int zoneReversal=RaceHeldZoneReversalDirection();

   double regimeScore=0.0;
   int regimeDirection=RaceM5TwentyBarRegime(regimeScore);
   int liveSwing=RaceM5LiveSwingDirection();

   int direction=0;
   string phase="M5_SIDEWAY";

   if(breakDirection!=0)
   {
      // Confirmed Demand/Supply break: follow the break.
      direction=breakDirection;
      phase=breakDirection>0 ? "SUPPLY_BREAK_BUY" : "DEMAND_BREAK_SELL";
   }
   else if(zoneReversal!=0)
   {
      // Intact boundary wins over trend chasing: Demand => BUY, Supply => SELL.
      direction=zoneReversal;
      phase=zoneReversal>0 ? "DEMAND_HOLD_BUY" : "SUPPLY_HOLD_SELL";
   }
   else if(regimeDirection!=0)
   {
      // A sequence such as down/down/down/pause/down/down follows the trend.
      direction=regimeDirection;
      phase=regimeDirection>0 ? "M5_20_UP_CONTINUATION" : "M5_20_DOWN_CONTINUATION";
   }
   else if(liveSwing!=0)
   {
      // Alternating M5 sequence is treated as a range: fade the current swing.
      direction=-liveSwing;
      phase=direction>0 ? "M5_SIDEWAY_BUY_DIP" : "M5_SIDEWAY_SELL_RALLY";
   }

   g_raceVNextFlowScore=regimeScore;
   g_raceVNextStructureDirection=regimeDirection;
   g_raceVNextRejectionDirection=zoneReversal;
   g_raceVNextDecisionScore=(double)direction;
   g_raceVNextLegPhase=phase;

   return direction;
}

double RaceMidProgressPoints(int direction)
{
   MqlTick tick;
   double anchor = BasketAnchorEntryPrice(direction);
   if(anchor <= 0.0 || !SymbolInfoTick(_Symbol, tick))
      return 0.0;
   double mid = (tick.bid + tick.ask) * 0.5;
   return direction > 0
      ? (mid - anchor) / _Point
      : (anchor - mid) / _Point;
}

bool RaceWrongDirectionConfirmed(
   int direction,
   double momentum,
   bool filling,
   string &reasonOut
)
{
   reasonOut="NONE";
   if(direction==0)
   {
      RaceResetExitCandidate();
      return false;
   }

   // Demand/Supply break is already confirmed by a completed M5 close plus a
   // live price beyond the buffered far edge. This is a structural invalidation,
   // not a fast tick reversal, so the old side may be abandoned immediately.
   RefreshMarketContext(false);
   int zoneBreakDirection=RaceConfirmedZoneBreakDirection();
   if(zoneBreakDirection!=0 && zoneBreakDirection==-direction)
   {
      RaceResetExitCandidate();
      reasonOut=direction>0
         ? "RACE_DEMAND_BREAK_EXIT"
         : "RACE_SUPPLY_BREAK_EXIT";
      return true;
   }

   datetime now=TimeCurrent();
   if(g_raceCycleStartedAt<=0 ||
      now-g_raceCycleStartedAt<RACE_EXIT_CYCLE_GRACE_SECONDS)
   {
      RaceResetExitCandidate();
      return false;
   }

   if(g_raceLastFillAt>0 &&
      now-g_raceLastFillAt<RACE_EXIT_LAST_FILL_GRACE_SECONDS)
   {
      RaceResetExitCandidate();
      return false;
   }

   RaceV1UpdateExposureTelemetry(direction,0.0);
   double adversePoints=RaceV1AdversePoints(direction);
   double noiseFloor=MathMax(
      g_raceExposureNoisePoints,
      MathMax(0.0,CurrentSpreadPoints())*2.0
   );
   if(adversePoints<=noiseFloor)
   {
      RaceResetExitCandidate();
      return false;
   }

   // Ordinary soft exit is deliberately slower: require broken M5 structure
   // plus an opposite 20-bar M5 regime. No two-second or 30-second flow can
   // close a RACE Basket.
   double regimeScore=0.0;
   int regimeDirection=RaceM5TwentyBarRegime(regimeScore);
   bool oppositeRegime=regimeDirection!=0 && regimeDirection==-direction;
   bool structureBroken=RaceV2StructureBroken(direction);
   if(!oppositeRegime || !structureBroken)
   {
      RaceResetExitCandidate();
      return false;
   }

   int decision=RaceAnalysisDirection(momentum);
   bool severe=decision!=0 && decision==-direction;
   int confirmSeconds=severe
      ? RACE_EXIT_SEVERE_CONFIRM_SECONDS
      : RACE_EXIT_CONFIRM_SECONDS;

   if(g_raceExitCandidateSince<=0)
   {
      g_raceExitCandidateSince=now;
      g_raceExitCandidatePeakAdverse=adversePoints;
      reasonOut=severe
         ? "RACE_M5_REVERSAL_STRONG_CONFIRM"
         : "RACE_M5_REVERSAL_CONFIRM";
      return false;
   }

   if(adversePoints>g_raceExitCandidatePeakAdverse)
      g_raceExitCandidatePeakAdverse=adversePoints;

   if(now-g_raceExitCandidateSince<confirmSeconds)
   {
      reasonOut=severe
         ? "RACE_M5_REVERSAL_STRONG_CONFIRM"
         : "RACE_M5_REVERSAL_CONFIRM";
      return false;
   }

   reasonOut=severe
      ? "RACE_M5_STRONG_REVERSAL"
      : "RACE_M5_STRUCTURE_REVERSAL";
   return true;
}

bool RaceFlowStillRunning(int direction, double momentum)
{
   // Profit management must not dump a trade on short noise. Keep running
   // unless the M5 thesis has genuinely turned against the open side.
   RefreshMarketContext(false);

   int zoneBreakDirection=RaceConfirmedZoneBreakDirection();
   if(zoneBreakDirection!=0 && zoneBreakDirection==-direction)
      return false;

   double regimeScore=0.0;
   int regimeDirection=RaceM5TwentyBarRegime(regimeScore);
   if(regimeDirection==0)
      return true;

   if(regimeDirection==direction)
      return true;

   return !RaceV2StructureBroken(direction);
}

double RaceAutoAtrStopMultiplier(double atrPoints)
{
   // The fallback hard-stop breathes with current transaction noise. Normal
   // RACE conditions stay around 1.50 ATR and widen smoothly toward 1.60 ATR
   // only when spread is large relative to M5 volatility. Structure remains the
   // primary invalidation reference in RaceInitialStopPrice().
   if(atrPoints<=0.0)
      return RACE_AUTO_STOP_ATR_BASE;

   double spreadPoints=CurrentSpreadPoints();
   if(spreadPoints<=0.0 || spreadPoints>=999999.0)
      return RACE_AUTO_STOP_ATR_BASE;

   double spreadRatio=spreadPoints/atrPoints;
   double widenFactor=(spreadRatio-0.05)/0.10;
   widenFactor=MathMax(0.0,MathMin(1.0,widenFactor));

   return RACE_AUTO_STOP_ATR_BASE+
      (RACE_AUTO_STOP_ATR_WIDE-RACE_AUTO_STOP_ATR_BASE)*widenFactor;
}

double RaceAtrStopPoints()
{
   double atr=AverageTrueRangePoints(PERIOD_M5,g_atrPeriod);
   if(atr<=0.0)
      return 0.0;

   double brokerMinimumPoints=MathMax(
      (double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL),
      (double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_FREEZE_LEVEL)
   )+2.0;

   double autoMultiplier=RaceAutoAtrStopMultiplier(atr);
   return MathMax(atr*autoMultiplier,brokerMinimumPoints);
}

double RaceInitialStopPrice(int direction, double entryPrice)
{
   // RACE 1.1.10 structure-first automatic hard stop:
   // - M5 structure defines the preferred invalidation distance,
   // - M5 ATR + spread define the anti-noise floor,
   // - the fallback breathes automatically around 1.50-1.60 ATR,
   // - 1.80 ATR is a real hard safety cap. If broker/spread constraints need
   //   more room than that, RACE skips the entry instead of silently widening.
   double fallbackDistancePoints=RaceAtrStopPoints();
   if(fallbackDistancePoints<=0.0)
   {
      g_executionStatus="RACE_ATR_NOT_READY";
      return 0.0;
   }

   double atrM5Points=AverageTrueRangePoints(PERIOD_M5,g_atrPeriod);
   if(atrM5Points<=0.0)
   {
      g_executionStatus="RACE_ATR_NOT_READY";
      return 0.0;
   }

   double brokerMinimumPoints=MathMax(
      (double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL),
      (double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_FREEZE_LEVEL)
   )+2.0;

   double spreadPoints=CurrentSpreadPoints();
   if(spreadPoints<=0.0 || spreadPoints>=999999.0)
      spreadPoints=0.0;

   double minDistancePoints=MathMax(
      brokerMinimumPoints,
      MathMax(
         atrM5Points*RACE_AUTO_STOP_ATR_FLOOR,
         spreadPoints*3.00
      )
   );
   double maxDistancePoints=atrM5Points*RACE_AUTO_STOP_ATR_CAP;

   if(maxDistancePoints<=0.0 ||
      minDistancePoints>maxDistancePoints)
   {
      g_executionStatus="RACE_STOP_RISK_TOO_WIDE";
      return 0.0;
   }

   double selectedDistancePoints=MathMax(
      minDistancePoints,
      MathMin(maxDistancePoints,fallbackDistancePoints)
   );

   double invalidPrice=RaceV2StructureInvalidPrice(direction);
   if(invalidPrice>0.0)
   {
      double structureBufferPrice=atrM5Points*_Point*0.12;
      double structureStop=direction>0
         ? invalidPrice-structureBufferPrice
         : invalidPrice+structureBufferPrice;
      double structureDistancePoints=direction>0
         ? (entryPrice-structureStop)/_Point
         : (structureStop-entryPrice)/_Point;

      if(structureDistancePoints>0.0)
      {
         selectedDistancePoints=MathMax(
            minDistancePoints,
            MathMin(maxDistancePoints,structureDistancePoints)
         );
      }
   }

   double stop=direction>0
      ? entryPrice-selectedDistancePoints*_Point
      : entryPrice+selectedDistancePoints*_Point;
   g_executionStatus="RACE_STOP_READY";
   return NormalizeStopPriceToTick(stop,direction);
}

bool RaceStopReady()
{
   double atr = AverageTrueRangePoints(PERIOD_M5, g_atrPeriod);
   if(atr <= 0.0)
   {
      g_executionStatus = "RACE_ATR_NOT_READY";
      return false;
   }

   // Publish the exact M5 ATR source used by the RACE v1.0.100 stop.
   g_atrPoints = atr;
   return true;
}

double RaceProfitArmMoney(int filledUnits)
{
   // Positive floating P/L already includes spread. This floor simply avoids
   // closing on microscopic noise while still taking profit quickly.
   return MathMax(0.10, MathMin(5.00, filledUnits * 0.02));
}

double RaceGivebackMoney(double peakProfit, double armMoney)
{
   return MathMax(
      0.05,
      MathMin(MathMax(armMoney, 0.10), peakProfit * 0.25)
   );
}

// Brain V18 RACE profit harvest --------------------------------------------
// RACE only: close every profitable RACE ticket continuously. AUTO never
// calls this function. On hedging accounts each blue ticket is closed in full;
// on netting accounts one configured-lot unit is realized per pass because MT5
// exposes only one aggregate position per symbol.
double RaceDisplayedOpenProfit()
{
   double total=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic ||
         StringFind(PositionGetString(POSITION_COMMENT),"SaaSRace")<0)
         continue;
      // Match the live Profit value shown for the open MT5 position.
      total+=PositionGetDouble(POSITION_PROFIT);
   }
   return total;
}

int RaceHarvestProfitablePositions()
{
   int harvested = 0;
   bool hedging = ((ENUM_ACCOUNT_MARGIN_MODE)AccountInfoInteger(ACCOUNT_MARGIN_MODE) ==
                   ACCOUNT_MARGIN_MODE_RETAIL_HEDGING);
   double baseVolume = NormalizeTradeVolume(g_lot);
   double perPositionTarget =
      (g_raceProfitTargetMode == "POSITION" && g_racePerPositionProfitMoney > 0.0)
      ? g_racePerPositionProfitMoney
      : 0.0;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol ||
         PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;
      if(StringFind(PositionGetString(POSITION_COMMENT), "SaaSRace") < 0)
         continue;

      double displayedProfit = PositionGetDouble(POSITION_PROFIT);
      double positionVolume = PositionGetDouble(POSITION_VOLUME);
      double targetComparableProfit = displayedProfit;
      if(!hedging && positionVolume > 0.0 && baseVolume > 0.0)
      {
         // Netting exposes one aggregate position. Compare the proportional
         // profit of one configured-Lot unit to the user's per-position target,
         // then realize exactly one unit per pass.
         targetComparableProfit =
            displayedProfit * MathMin(1.0, baseVolume / positionVolume);
      }
      if(perPositionTarget <= 0.0 ||
         targetComparableProfit + 0.00000001 < perPositionTarget)
         continue;

      double closeVolume = hedging
         ? positionVolume
         : MathMin(positionVolume, baseVolume);
      if(closeVolume <= 0.0)
         continue;

      if(ClosePositionVolumeByTicket(ticket, closeVolume, "SCNRaceProfit"))
      {
         harvested++;
         g_executionStatus = "RACE_PROFIT_HARVEST";
         g_lastCloseReason = "RACE_PROFIT_HARVEST";
         Print(
            "RACE profit harvest ticket=",ticket,
            " profit=",DoubleToString(displayedProfit,2),
            " closeVolume=",DoubleToString(closeVolume,2)
         );

         // A netting account has one aggregate position. Realize one unit and
         // let the next tick harvest/refill again instead of flattening the
         // whole aggregate position in one request.
         if(!hedging)
            break;
      }
   }

   return harvested;
}

bool RaceClosePositionAsync(ulong ticket)
{
   // Strategy Tester has no live async trade queue, so keep deterministic
   // synchronous close semantics there. Live terminals use burst dispatch.
   if(MQLInfoInteger(MQL_TESTER))
      return ClosePositionByTicket(ticket);

   if(ticket==0 || !PositionSelectByTicket(ticket))
      return false;
   if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
      PositionGetInteger(POSITION_MAGIC)!=InpMagic ||
      StringFind(PositionGetString(POSITION_COMMENT),"SaaSRace")<0)
      return false;

   string symbol=PositionGetString(POSITION_SYMBOL);
   double volume=PositionGetDouble(POSITION_VOLUME);
   long positionType=PositionGetInteger(POSITION_TYPE);

   MqlTick tick;
   if(!SymbolInfoTick(symbol,tick))
      return false;

   MqlTradeRequest request={};
   MqlTradeResult result={};
   request.action=TRADE_ACTION_DEAL;
   request.position=ticket;
   request.magic=PositionGetInteger(POSITION_MAGIC);
   request.symbol=symbol;
   request.volume=NormalizeTradeVolume(volume);
   request.deviation=DynamicDeviationPoints();
   request.type_filling=AllowedFillingMode();
   request.comment="SaaSRaceCloseAll";

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
   bool sent=OrderSendAsync(request,result);
   if(!sent || !TradeResultAccepted(result))
   {
      Print(
         "RACE close-all async rejected ticket=",ticket,
         " error=",GetLastError(),
         " retcode=",result.retcode
      );
      return false;
   }
   return true;
}

int RaceClosePositionsBurst()
{
   // RACE_CLOSE_ALL_BURST: snapshot every owned RACE ticket, then submit every
   // close request back-to-back. Do not wait for one position to disappear
   // before sending the next close. Retry unresolved tickets after 30 ms.
   ulong nowMs=GetTickCount64();
   if(g_raceLastExitBurstMs>0 && nowMs-g_raceLastExitBurstMs<30)
      return 0;
   g_raceLastExitBurstMs=nowMs;

   ulong tickets[];
   int ticketCount=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic ||
         StringFind(PositionGetString(POSITION_COMMENT),"SaaSRace")<0)
         continue;

      ArrayResize(tickets,ticketCount+1);
      tickets[ticketCount++]=ticket;
   }

   int sent=0;
   for(int i=0;i<ticketCount;i++)
      if(RaceClosePositionAsync(tickets[i]))
         sent++;

   return sent;
}

bool RaceCloseCycle(string reason)
{
   g_raceState = "CLOSING";
   g_executionStatus = reason;
   g_lastCloseReason = reason;

   RaceClosePositionsBurst();

   bool closed = !BasketHasRacePosition();
   if(closed)
      ResetTrail();
   return closed;
}

bool ProcessRaceFill(int direction)
{
   if(direction == 0)
      return false;

   // RACE 1.1.20 keeps one structural side per live cycle in every profit
   // target mode. Reversal closes old exposure first; no mixed-side trap.
   int existingPositions = BasketPositionCount();
   if(existingPositions<=0)
      g_raceLastObservedCycleProfit=0.0;

   bool dualDirection=RacePerPositionDualDirectionEnabled();
   if(existingPositions > 0 && !dualDirection)
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
   if(filledUnits >= g_maxPositions)
   {
      g_raceState = "FULL";
      g_executionStatus = "RACE_TARGET_FILLED";
      return true;
   }

   if(g_state != STATE_RUNNING || !g_access ||
      (!MQLInfoInteger(MQL_TESTER) && !EntryLeaseValid()))
   {
      g_executionStatus = "RACE_CONTROL_NOT_FRESH";
      return false;
   }
   if(TradePermissionStatus() != "OK")
   {
      g_executionStatus = "RACE_TRADE_PERMISSION";
      return false;
   }
   if(!RaceFillPacingReady(direction))
      return false;

   if(!CanSendOrder())
   {
      g_executionStatus = "RACE_ORDER_RATE_LIMIT";
      return false;
   }
   // Normal adaptive-spread quality is not a RACE entry gate. Keep only the
   // explicit EXTREME spread protection as a hard safety boundary.
   if(g_spreadStatus == "EXTREME")
   {
      g_executionStatus = "RACE_EXTREME_SPREAD";
      return false;
   }
   if(!OpenTradingAllowedForDirection(direction))
   {
      g_executionStatus = "RACE_SYMBOL_DIRECTION_BLOCKED";
      return false;
   }

   // Never open RACE with a broker-minimum placeholder SL. If ATR is not ready,
   // wait for the next tick instead of creating a position that can be stopped
   // almost immediately by spread/noise.
   if(!RaceStopReady())
      return false;

   // RACE uses the user's configured Lot directly. No adaptive score or risk
   // sizing calculation is allowed to reduce the requested fill count.
   g_adaptiveLot = NormalizeTradeVolume(g_lot);
   if(g_adaptiveLot <= 0.0)
   {
      g_executionStatus = "RACE_INVALID_LOT";
      return false;
   }

   // Phase 2: recalculate total/projected exposure before every fill. This is
   // advisory/risk telemetry only; it never changes the user's configured Lot.
   RaceV1UpdateExposureTelemetry(direction,g_adaptiveLot);
   double projectedLossLimit=EffectiveBasketLossLimit();
   g_raceExposureRiskMismatch =
      projectedLossLimit > 0.0 &&
      g_raceExposureNoiseMoney > projectedLossLimit * 0.80;

   g_entryModel = "RACE_M5_20_STRUCTURE";
   g_entryTrigger = direction > 0 ? "RACE_M5_BUY" : "RACE_M5_SELL";
   g_entryQuality = g_raceVNextLegPhase;
   g_entryQualityScore = 0.0;
   g_raceDirection = direction;
   if(g_raceCycleStartedAt <= 0)
      g_raceCycleStartedAt = TimeCurrent();

   MqlTick raceFillTick;
   double raceRequestedPrice=0.0;
   if(SymbolInfoTick(_Symbol,raceFillTick))
      raceRequestedPrice=direction>0 ? raceFillTick.ask : raceFillTick.bid;

   bool accepted = SendMarketOrder(direction);
   RegisterOrderRequest();
   if(accepted)
   {
      RaceReentryMarkExposure();
      g_raceLastFillAt = TimeCurrent();
      g_raceLastFillMs = GetTickCount64();
      g_raceLastFillPrice = raceRequestedPrice;
      g_raceLastFillDirection = direction;
      RaceResetExitCandidate();
      int after = RaceFilledUnits();
      g_raceState = after >= g_maxPositions ? "FULL" : "FILLING";
      g_executionStatus = after >= g_maxPositions
         ? "RACE_TARGET_FILLED"
         : "RACE_FILLING";
      Print(
         "RACE fill accepted direction=",direction,
         " units=",after,
         " target=",g_maxPositions,
         " lot=",DoubleToString(g_adaptiveLot,2)
      );
      return true;
   }

   g_raceState = "FILL_RETRY";
   return false;
}

bool StartRaceCycle(double momentum)
{
   if(!RaceModeEnabled())
      return false;
   if(BasketPositionCount() > 0 || RescuePositionCount() > 0)
      return false;

   ResetRaceRuntime();

   int direction=RaceAnalysisDirection(momentum);
   if(direction==0)
   {
      g_executionStatus="RACE_M5_STRUCTURE_WAIT";
      return false;
   }

   g_burstActive = false;
   g_burstNeedsRearm = false;
   g_burstTargetPositions = 0;

   bool started=ProcessRaceFill(direction);
   if(!started && BasketPositionCount()==0)
      g_executionStatus =
         g_executionStatus=="" ? "RACE_FILL_RETRY" : g_executionStatus;

   return started;
}

bool ManageRaceBasket(double momentum)
{
   int positions = BasketPositionCount();
   if(positions > 0)
      RaceReentryMarkExposure();
   if(positions <= 0)
   {
      ResetRaceRuntime();
      return false;
   }

   if(g_raceState == "CLOSING")
   {
      RaceClosePositionsBurst();
      if(!BasketHasRacePosition())
         ResetTrail();
      return true;
   }

   // Every RACE profit mode now shares the same one-way structural cycle.
   // Legacy dual-direction helper remains dormant for source compatibility.

   // RACE retains one-way Basket ownership until a structural handoff closes it.
   // RACE close decisions use direct P/L, current price and completed M5 data.
   // Defer expensive market-context refresh to non-close paths only.
   int direction = BasketDirection();
   if(direction == 0)
   {
      RefreshMarketContext(false);
      g_raceState = "MIXED_BASKET";
      g_executionStatus = "RACE_MIXED_BASKET";
      return true;
   }
   g_raceDirection = direction;
   if(g_raceCycleStartedAt <= 0)
   {
      g_raceCycleStartedAt = TimeCurrent();
      // After an EA/terminal restart an already-open RACE basket has no local
      // last-fill timestamp. Rebase it for consistent recovered-cycle telemetry.
      if(g_raceLastFillAt <= 0)
         g_raceLastFillAt = g_raceCycleStartedAt;
      if(g_raceLastFillPrice<=0.0)
      {
         g_raceLastFillPrice=BasketAnchorEntryPrice(direction);
         g_raceLastFillDirection=direction;
         g_raceLastFillMs=GetTickCount64();
      }
   }

   int filledUnits = RaceFilledUnits();
   bool filling = filledUnits < g_maxPositions;
   double floatingProfit = BasketProfit();
   double cycleProfit = BasketCycleProfit();
   g_raceLastObservedCycleProfit=cycleProfit;

   // Explicit user loss control remains a hard safety boundary in every mode.
   double lossLimit = EffectiveBasketLossLimit();
   if(lossLimit > 0.0 && cycleProfit <= -lossLimit)
   {
      RaceCloseCycle("RACE_MAX_BASKET_LOSS");
      return true;
   }

   // Demand/Supply handoff runs before legacy loss-state classification.
   // This makes the requested structure rule authoritative even when the old
   // position is currently negative.
   RefreshMarketContext(false);
   int breakDirection=RaceConfirmedZoneBreakDirection();
   int zoneReversalDirection=RaceHeldZoneReversalDirection();

   if(breakDirection!=0 && breakDirection!=direction)
   {
      string reason=direction>0
         ? "RACE_DEMAND_BREAK_FOLLOW_SELL"
         : "RACE_SUPPLY_BREAK_FOLLOW_BUY";
      RaceCloseCycle(reason);
      return true;
   }

   if(zoneReversalDirection!=0 && zoneReversalDirection!=direction)
   {
      string reason=zoneReversalDirection>0
         ? "RACE_DEMAND_HOLD_REVERSAL_BUY"
         : "RACE_SUPPLY_HOLD_REVERSAL_SELL";
      RaceCloseCycle(reason);
      return true;
   }

   // RACE loss management remains isolated from every other mode. Broker SL
   // and configured money limits stay authoritative hard boundaries. Ordinary
   // soft exits require a confirmed M5 structure/regime reversal.
   RaceV1UpdateExposureTelemetry(direction,0.0);
   g_raceExposureRiskMismatch =
      lossLimit > 0.0 &&
      g_raceExposureNoiseMoney > lossLimit * 0.80;

   string wrongDirectionReason = "NONE";
   if(cycleProfit < 0.0 && floatingProfit < 0.0)
   {
      g_raceLossState=RaceV2LossState(
         direction,
         momentum,
         filling,
         cycleProfit,
         floatingProfit,
         wrongDirectionReason
      );

      if(RaceWrongDirectionConfirmed(
         direction,
         momentum,
         filling,
         wrongDirectionReason
      ))
      {
         RaceCloseCycle(wrongDirectionReason);
         return true;
      }

      if(g_raceLossState=="STRUCTURE_INVALID")
      {
         g_raceRecoveryWatch=true;
         g_raceState="STRUCTURE_INVALID";
         g_executionStatus="RACE_STRUCTURE_INVALID_HOLD";
         return true;
      }
      if(g_raceLossState=="ADVERSE_WATCH")
      {
         // Stop adding exposure while evidence is turning against the Basket.
         // Do not close the existing losing Basket from this soft state.
         g_raceRecoveryWatch=true;
         g_raceState="ADVERSE_WATCH";
         g_executionStatus="RACE_ADVERSE_WATCH";
         return true;
      }
   }
   else
   {
      g_raceLossState="NORMAL";
      RaceResetExitCandidate();
   }

   // RACE Basket target is a hard local MT5 profit target.
   // The EA running on the VPS owns the close decision directly: once the
   // displayed open P&L reaches the configured money target, close every
   // RACE-owned position immediately. Do not wait for Web/API, flow, trailing,
   // giveback, or another structural confirmation.
   bool raceBasketProfitTarget =
      g_raceProfitTargetMode=="BASKET" &&
      g_raceCloseAllProfitMoney>0.0;
   bool racePerPositionProfitTarget =
      g_raceProfitTargetMode=="POSITION" &&
      g_racePerPositionProfitMoney>0.0;
   bool raceStrictProfitTarget =
      raceBasketProfitTarget || racePerPositionProfitTarget;

   g_raceTargetProfitArmed=false;

   double displayedRoundProfit=RaceDisplayedOpenProfit();
   if(raceBasketProfitTarget &&
      displayedRoundProfit>=g_raceCloseAllProfitMoney)
   {
      RaceCloseCycle("RACE_HARD_PROFIT_TARGET");
      return true;
   }

   // Per-position mode closes only the RACE ticket that reached its configured
   // money target. New fills still obey the same one-side M5 structure engine.
   int harvested = racePerPositionProfitTarget
      ? RaceHarvestProfitablePositions()
      : 0;
   if(harvested > 0)
   {
      g_raceProfitArmed = false;
      g_racePeakProfit = 0.0;

      if(BasketPositionCount() <= 0)
      {
         ResetRaceRuntime();
         g_executionStatus = "RACE_PROFIT_HARVEST_FLAT";
         return true;
      }

      g_raceState = "HARVESTED_PROFIT";
      g_executionStatus = "RACE_PROFIT_HARVEST";
      return true;
   }


   int signalDirection=RaceAnalysisDirection(momentum);

   // A non-zone opposite signal in a sideway or transition only pauses adds.
   // It does not dump the open Basket. Ordinary exit still needs the slower
   // M5 structure/regime confirmation above.
   if(signalDirection!=0 && signalDirection!=direction)
   {
      // Sideway swing changes pause additions only. Do not mark recovery or
      // force an early exit; the existing Basket keeps its normal exit contract.
      g_raceState="STRUCTURE_WAIT";
      g_executionStatus="RACE_OPPOSITE_M5_WAIT";
      return true;
   }

   if(filling)
   {
      if(signalDirection==0)
      {
         g_raceState="M5_STRUCTURE_WAIT";
         g_executionStatus="RACE_M5_STRUCTURE_WAIT";
         return true;
      }

      g_raceState="FILLING";
      ProcessRaceFill(direction);
      return true;
   }

   double armMoney = RaceProfitArmMoney(filledUnits);

   // If a dragged cycle was judged recoverable, take the recovered NET cycle
   // profit quickly. Harvested winners count toward that recovery on purpose.
   if(g_raceRecoveryWatch)
   {
      double recoveryCloseMoney = MathMax(0.02, armMoney * 0.25);
      if(!raceStrictProfitTarget && cycleProfit >= recoveryCloseMoney)
      {
         RaceCloseCycle("RACE_RECOVERY_PROFIT");
         return true;
      }
      RefreshMarketContext(false);
      g_raceState = "RECOVERY_WAIT";
      g_executionStatus = "RACE_RECOVERY_WAIT";
      return true;
   }

   // A configured RACE money target owns every profitable exit. Configured
   // loss protections remain active, while quick-profit/giveback cannot bank
   // profit early before the selected Basket/per-position target.
   if(raceStrictProfitTarget)
   {
      g_raceState = filling ? "FILLING" : "FULL_WAIT_PROFIT";
      g_executionStatus = racePerPositionProfitTarget
         ? "RACE_WAIT_PER_POSITION_TARGET"
         : "RACE_WAIT_BASKET_TARGET";
      if(filling && signalDirection == direction)
         ProcessRaceFill(direction);
      return true;
   }

   // Normal RACE profit-run logic now looks only at the still-open Basket.
   // Realized harvested winners must not accidentally trigger a full-cycle
   // close immediately after an individual blue ticket was banked.
   if(floatingProfit >= armMoney)
   {
      bool flowing = RaceFlowStillRunning(direction,momentum);

      if(!flowing && !g_raceProfitArmed)
      {
         RaceCloseCycle("RACE_QUICK_PROFIT");
         return true;
      }

      if(!g_raceProfitArmed)
      {
         g_raceProfitArmed = true;
         g_racePeakProfit = floatingProfit;
      }
      if(floatingProfit > g_racePeakProfit)
         g_racePeakProfit = floatingProfit;

      double giveback = RaceGivebackMoney(g_racePeakProfit, armMoney);
      if(floatingProfit <= g_racePeakProfit - giveback)
      {
         RaceCloseCycle("RACE_PROFIT_GIVEBACK");
         return true;
      }

      if(!flowing && floatingProfit > 0.0)
      {
         RaceCloseCycle("RACE_FLOW_ENDED_PROFIT");
         return true;
      }

      RefreshMarketContext(false);
      g_raceState = "PROFIT_RUN";
      g_executionStatus = "RACE_PROFIT_RUN";
      return true;
   }

   if(floatingProfit < 0.0)
   {
      g_raceRecoveryWatch = true;
      RefreshMarketContext(false);
      g_raceState = "RECOVERY_WAIT";
      g_executionStatus = "RACE_RECOVERY_WAIT";
      return true;
   }

   RefreshMarketContext(false);
   g_raceState = "FULL_WAIT_PROFIT";
   g_executionStatus = "RACE_FULL_WAIT_PROFIT";
   return true;
}

bool FastProfitClosePriority()
{
   // CLOSE_FAST_PATH_V157: exact local profit ownership before any strategy
   // analysis. ZERO and RACE Basket hard targets close from MT5 on the VPS
   // itself; no Web/API round-trip or trailing/giveback confirmation is allowed.
   if(g_zeroGridClosing)
   {
      ZeroGridClosePositions();
      if(ZeroGridFlatConfirmedForReset())
      {
         // Async order/deal visibility can briefly report an empty snapshot.
         // Finalize/reset only after the ZERO-owned account view stayed flat for
         // the confirmation window, so a second cycle can never overlap the first.
         FinalizeBasketJournal();
         ResetZeroGridCycleState();
         g_executionStatus=
            ZeroGridModeEnabled() && g_state==STATE_RUNNING && g_access
            ? "ZERO_GRID_REARMING"
            : "ZERO_GRID_STOPPED_FLAT";
         return false;
      }
      if(ZeroGridPositionCount()==0 && ZeroGridPendingCount()==0)
         g_executionStatus="ZERO_GRID_WAIT_FLAT_CONFIRM";
      return true;
   }

   if(ZeroGridPositionCount()>0 &&
      ZeroGridCycleNet()>=ZeroGridRequiredCloseNet())
   {
      g_zeroGridClosing=true;
      SaveZeroGridCycleState();
      g_executionStatus="ZERO_GRID_CLOSING_PROFIT";
      ZeroGridClosePositions();
      return true;
   }

   if(g_raceState=="CLOSING" && BasketHasRacePosition())
   {
      RaceClosePositionsBurst();
      return true;
   }

   bool profitSettingsReady=MQLInfoInteger(MQL_TESTER) || g_settingsSynchronized;

   if(profitSettingsReady && BasketHasCounterPosition())
   {
      int counterClosed=CounterHarvestProfitablePositions();
      if(counterClosed>0)
         return true;
   }

   if(profitSettingsReady &&
      BasketHasRacePosition() &&
      g_raceProfitTargetMode=="BASKET" &&
      g_raceCloseAllProfitMoney>0.0 &&
      RaceDisplayedOpenProfit()>=g_raceCloseAllProfitMoney)
   {
      RaceCloseCycle("RACE_HARD_PROFIT_TARGET");
      return true;
   }

   return false;
}

bool CloudStoppedFlatIdle()
{
   if(!InpCloudRelay || MQLInfoInteger(MQL_TESTER))
      return false;

   return
      g_state==STATE_STOPPED &&
      g_pendingCloseReason==CLOSE_REASON_NONE &&
      !LocalExecutionExposureActive() &&
      ScenovaAccountPositionCount()<=0 &&
      ScenovaAccountPendingCount()<=0;
}

void OnTick()
{
   // Timer watchdog. Standard timer is independent of market ticks, but a live
   // tick gives us a second recovery path if the terminal ever drops timer
   // delivery after startup.
   if(!MQLInfoInteger(MQL_TESTER))
   {
      ulong watchdogNow=GetTickCount64();
      ulong timerReference=g_lastTimerEventTickMs>0
         ? g_lastTimerEventTickMs
         : g_timerArmedAtTickMs;
      if(timerReference>0 && watchdogNow>=timerReference &&
         watchdogNow-timerReference>7000)
      {
         Print("SCENOVA timer watchdog: no timer event for >7s; re-arming.");
         ArmRuntimeTimer();
      }

      ulong heartbeatFallbackMs=(ulong)MathMax(1,InpHeartbeatSeconds)*1000+10000;
      if(g_lastHeartbeatTickMs>0 &&
         watchdogNow>=g_lastHeartbeatTickMs &&
         watchdogNow-g_lastHeartbeatTickMs>=heartbeatFallbackMs)
      {
         Print("SCENOVA heartbeat watchdog: timer heartbeat overdue; sending from tick.");
         g_lastHeartbeatTickMs=watchdogNow;
         g_lastHeartbeat=TimeCurrent();
         SendHeartbeat();
      }
   }

   // STOPPED + flat Cloud runtimes must stay extremely cheap on every market
   // tick. Running indicator/history/basket work here can monopolize MT5's
   // single EA event queue on a fast symbol and starve the independent Timer
   // that services Cloud heartbeat response files. When there is no SCENOVA
   // exposure and no pending close request, control-plane heartbeat owns the
   // idle runtime and strategy work can wait until the Server authorizes RUNNING.
   if(CloudStoppedFlatIdle())
   {
      g_executionStatus="STOPPED";
      return;
   }

   // Local execution clock: all price-sensitive management reads the MT5 tick
   // directly. SaaS heartbeat/telemetry is never a price source for trading.
   g_lastMarketTickMs=GetTickCount64();
   SampleSpread();
   PublishCloudLiveExecutionSnapshot();

   // Profit target owns the tick before any non-close analysis.
   if(FastProfitClosePriority())
      return;

   bool zeroGridFastPath =
      ZeroGridPositionCount() > 0 ||
      ZeroGridPendingCount() > 0 ||
      (ZeroGridModeEnabled() &&
       BasketPositionCount() <= 0 &&
       RescuePositionCount() <= 0);
   if(!zeroGridFastPath)
   {
      UpdateMomentum();
      RefreshEmaIntelligence(false);
      DrawEmaCurves();
   }
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
   else if(rescueCount <= 0 && !FlipLockModeEnabled())
      ResetBasketCycleState();

   double profit = BasketProfit();
   double momentum = MomentumPoints();
   double dailyProfit = DailyBotProfit();
   if(MQLInfoInteger(MQL_TESTER) && count > 0)
      TesterUpdateCycleMetrics(count,BasketCycleProfit());
   g_executionStatus = "EVALUATING";

   if(g_pendingCloseReason != CLOSE_REASON_NONE)
   {
      int pendingReason=g_pendingCloseReason;
      g_state = STATE_SAFE_STOP;
      g_runAuthorized = false;
      bool closed = pendingReason==CLOSE_REASON_REMOTE
         ? ForceFlatResetAccount("REMOTE_CLOSE_ALL")
         : CloseAllBasket(CloseReasonText(pendingReason));
      g_executionStatus = pendingReason==CLOSE_REASON_REMOTE
         ? (closed ? "FORCE_FLAT_CONFIRMED" : "FORCE_FLAT_RETRY")
         : (closed ? CloseCompletionStatus(pendingReason) : "CLOSE_RETRY");
      return;
   }

   if(g_serverEntrySuppressed &&
      ScenovaAccountPositionCount()<=0 &&
      ScenovaAccountPendingCount()<=0)
   {
      g_runAuthorized = false;
      g_executionStatus = "FIRST_CONNECT_PRIME";
      return;
   }

   // ZERO GRID is a self-contained execution owner. Its visible close contract
   // is zeroGridMinNetProfitMoney + zeroGridCloseReserveMoney + estimated exit
   // cost. Hidden/stale AUTO/RACE daily-profit or daily-loss settings must never
   // liquidate a ZERO cycle before that contract is reached.
   //
   // Route ZERO before the generic daily controls even while the cycle is flat,
   // so switching into ZERO after losses in another mode cannot immediately
   // force SAFE_STOP. Explicit user Close All / pending close reasons above still
   // remain authoritative.
   bool zeroGridOwnsRuntime =
      g_zeroGridClosing ||
      ZeroGridPositionCount()>0 ||
      ZeroGridPendingCount()>0;

   if(IsBitcoinSymbol() &&
      EffectiveExecutionMode()=="ZERO_GRID" &&
      !zeroGridOwnsRuntime)
   {
      g_executionStatus="BTC_ZERO_GRID_BLOCKED";
      return;
   }

   bool zeroGridCanStart =
      ZeroGridModeEnabled() &&
      BasketPositionCount()<=0 &&
      RescuePositionCount()<=0;
   if(zeroGridOwnsRuntime || zeroGridCanStart)
   {
      ManageZeroGrid();
      return;
   }

   // COUNTER is routed before every generic daily/basket risk path. Its only
   // position exit is its configured per-position profit target; explicit user
   // Close All above remains authoritative.
   if(!MQLInfoInteger(MQL_TESTER) &&
      !g_settingsSynchronized &&
      count>0 &&
      BasketHasCounterPosition())
   {
      g_executionStatus="COUNTER_WAIT_SETTINGS_SYNC";
      return;
   }

   bool counterCanStart=
      CounterModeEnabled() &&
      BasketPositionCount()<=0 &&
      RescuePositionCount()<=0;
   if((count>0 && BasketHasCounterPosition()) || counterCanStart)
   {
      ManageCounterMode();
      return;
   }

   // RACE restart safety: an already-open RACE Basket must never inherit the
   // EA input defaults for money loss/profit controls while the Server settings
   // are still unsynchronized. Keep the Position untouched until the first
   // valid settings heartbeat arrives; the Broker-side SL remains active.
   if(!MQLInfoInteger(MQL_TESTER) &&
      !g_settingsSynchronized &&
      count > 0 &&
      BasketHasRacePosition())
   {
      g_executionStatus = "RACE_WAIT_SETTINGS_SYNC";
      return;
   }

   if(HandleDailyProfitControl(count))
      return;

   LoadDailyLossLock();
   double effectiveDailyLoss = EffectiveDailyLossLimit();
   bool dailyLossReached =
      effectiveDailyLoss > 0.0 &&
      DailyBotProfit() <= -effectiveDailyLoss;
   if(g_dailyLossLocked || dailyLossReached)
   {
      if(dailyLossReached && !g_dailyLossLocked)
         LockDailyLoss();
      if(FlipLockModeEnabled()) FlipLockRemoveAllPending();
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

   // FLIP LOCK V4 owns every position carrying its broker tag even if a stale
   // settings heartbeat momentarily reports another mode. A tagged position
   // must never fall through into AUTO/RACE generic management.
   if((FlipLockModeEnabled() && count <= 0) || BasketHasFlipLockPosition())
   {
      // One FLIP LOCK run spans every BUY<->SELL handoff. Preserve realized
      // losses across the broker's brief flat settlement window so the visible
      // "Max Basket Loss" setting is enforced on the whole baton run, not only
      // on the currently-open side.
      double flipLossLimit = EffectiveBasketLossLimit();
      double flipCycleProfit = BasketCycleProfit();
      if(flipLossLimit > 0.0 && flipCycleProfit <= -flipLossLimit)
      {
         FlipLockRemoveAllPending();
         bool flipClosed = count <= 0 ? true : CloseAllBasket("MAX_BASKET_LOSS");
         ResetTrail();
         if(flipClosed)
         {
            FlipLockResetTracking(true);
            ResetBasketCycleState();
         }
         g_executionStatus = "FLIP_LOCK_MAX_BASKET_LOSS";
         return;
      }

      FlipLockManage();
      return;
   }

   // Strict mode ownership: a RACE Basket is always managed by RACE until it
   // is flat, even if the web switches back to AUTO mid-cycle. Conversely an
   // AUTO Basket never becomes a RACE Basket just because the setting changed.
   if(count > 0 && BasketHasRacePosition())
   {
      ManageRaceBasket(momentum);
      return;
   }

   bool autoOwnedBasket = count > 0 && BasketHasAutoPosition();
   bool autoFamilyOwnedBasket = count > 0 && BasketHasAutoFamilyPosition();
   bool manualOwnedBasket = count > 0 && BasketHasManualPosition();

   if(g_basketJournalId == 0)
      RecoverOpenBasketJournal();

   // HARD PROFIT TARGET CONTRACT:
   // AUTO and MANUAL Basket targets are absolute user instructions. Once the
   // full owned cycle reaches the configured money target, close immediately
   // before reversal, giveback, Rescue management or any other profit logic.
   // AUTO Broker TP owns profitable AUTO exits. Tactical and MANUAL targets
   // retain their existing separate behavior.
   bool exclusivelyAutoOwned =
      autoOwnedBasket && !manualOwnedBasket &&
      !BasketHasTacticalPosition() &&
      !BasketHasRacePosition() &&
      !BasketHasCounterPosition() &&
      !BasketHasFlipLockPosition() &&
      ZeroGridPositionCount()==0;
   bool hardBasketProfitOwner =
      (autoFamilyOwnedBasket && !exclusivelyAutoOwned && g_profitTargetMode == "AUTO") ||
      (!autoFamilyOwnedBasket && g_profitTargetMode == "MANUAL");
   if(count > 0 &&
      hardBasketProfitOwner &&
      g_basketProfitTarget > 0.0 &&
      g_perPositionProfit <= 0.0)
   {
      double hardCycleProfit =
         (rescueCount > 0 || g_rescueState != RESCUE_NORMAL)
         ? RescueCombinedCycleProfit()
         : BasketCycleProfit();

      if(hardCycleProfit >= g_basketProfitTarget)
      {
         string hardReason = autoFamilyOwnedBasket
            ? "AUTO_PROFIT_TARGET"
            : "BASKET_PROFIT_TARGET";
         bool hardClosed = CloseAllBasket(hardReason);
         ResetTrail();
         if(hardClosed && autoOwnedBasket)
            AutoResetCycle();
         g_executionStatus = hardReason;
         return;
      }
   }

   if(count > 0)
   {
      bool tacticalBasket=BasketHasTacticalPosition();

      // AUTO ownership follows the broker tag, not the currently selected web
      // mode. A mode switch can stop new AUTO entries but cannot hand its live
      // position to MANUAL/RACE/FLIP management.
      // AUTO exit prices are broker-hosted; no EA market close at TP/SL.
      // Dynamic protection never decides whether an entry is allowed. It only
      // manages exits after a Position exists.
      RefreshMarketContext(false);
      RecoverOpenBasketJournal();
      ManageDynamicProtection();

      if(tacticalBasket)
      {
         g_tacticalCountertrendActive=true;
         g_tacticalCountertrendDirection=BasketDirection();
         string tacticalExitReason="NONE";
         double tacticalCycleProfit=BasketCycleProfit();
         bool strictTacticalProfitTarget=
            g_profitTargetMode=="AUTO" &&
            g_basketProfitTarget>0.0 &&
            tacticalCycleProfit>0.0;
         if(!strictTacticalProfitTarget &&
            TacticalCountertrendExitReady(
               g_tacticalCountertrendDirection,
               momentum,
               tacticalCycleProfit,
               tacticalExitReason))
         {
            CloseAllBasket("TACTICAL_COUNTERTREND_EXIT");
            ResetTrail();
            g_executionStatus="TACTICAL_COUNTERTREND_EXIT";
            g_lastCloseReason=tacticalExitReason;
            return;
         }
      }

      if(!tacticalBasket && autoOwnedBasket)
      {
         if(AutoManageOpenBasket(momentum))
            return;
      }
      else
      {
         // MANUAL is user-owned. Do not let AUTO/legacy reversal brains close
         // the user's basket before its own SL/profit/risk settings are hit.
         if(!manualOwnedBasket)
         {
            if(!tacticalBasket && BrainV8HandleBasketReversal(momentum))
               return;
            if(!tacticalBasket && BrainV13FastWrongEntryCorrection(momentum))
               return;
         }
      }
      bool autoNoRescue=autoOwnedBasket && rescueCount<=0;
      if(autoNoRescue && g_rescueState!=RESCUE_NORMAL) ResetRescueState();
      bool rescueManaging=(tacticalBasket || autoNoRescue) ? false : ManageAdaptiveRescue();
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
      bool closedIndividual = !autoFamilyOwnedBasket && g_profitTargetMode == "MANUAL"
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
      double effectiveBasketTarget = autoOwnedBasket ? 0.0 : EffectiveBasketProfitTarget();

      // AUTO owns target-first early-profit decisions inside AutoManageOpenBasket().

      // If no manual Basket/per-position target is configured, multi-position
      // trading falls back to an automatic cycle target.
      if(!autoFamilyOwnedBasket &&
         g_profitTargetMode == "MANUAL" &&
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

      if(!autoFamilyOwnedBasket &&
         g_triggerMoney > 0.0 && g_trailMoney > 0.0 &&
         !g_trailArmed && profit >= g_triggerMoney)
      {
         g_trailArmed = true;
         g_peakProfit = profit;
      }

      if(!autoFamilyOwnedBasket && g_trailArmed)
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

      if(!exclusivelyAutoOwned && g_state == STATE_SAFE_STOP && !g_trailArmed && profit >= 0.0)
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

      if(autoFamilyOwnedBasket && EffectiveExecutionMode()!="AUTO")
      {
         // The user selected another mode while an AUTO-owned basket is still
         // alive. Continue AUTO exit/risk management only; never add orders from
         // the newly selected mode until AUTO has gone flat.
         g_executionStatus="AUTO_POSITION_OWNERSHIP_LOCK";
         return;
      }
   }
   else
   {
      ResetTrail();
      ResetBasketCycleState();
      if(AutoEnabled())
         AutoResetCycle();
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

   // Hard startup isolation: no execution engine may create a new order
   // until the Server has explicitly selected AUTO/RACE/ZERO_GRID.
   if(!MQLInfoInteger(MQL_TESTER) && !g_settingsSynchronized)
   {
      g_executionStatus = "WAIT_SETTINGS_SYNC";
      return;
   }

   // AUTO/RACE keep the fresh-control entry lease. ZERO GRID is intentionally
   // free-running once Server settings selected ZERO and explicit RUNNING/access hold.
   if(!MQLInfoInteger(MQL_TESTER) && !ZeroGridModeEnabled() && !EntryLeaseValid())
   {
      g_executionStatus = "CONTROL_NOT_FRESH";
      return;
   }

   // WARNING pauses only additional positions while Rescue evaluates the open
   // Basket. It is post-entry management, not a first-entry filter.
   if(count > 0 &&
      g_rescueState == RESCUE_WARNING &&
      !g_burstActive &&
      (!BasketFillEnabled() || count >= g_maxPositions))
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

   // If FLIP LOCK was selected while a foreign AUTO/MANUAL position is still
   // open, never seize that position. Let the previous owner's generic safety
   // management drain it, then FLIP LOCK may start only after the account is flat.
   if(FlipLockModeEnabled())
   {
      FlipLockRemoveAllPending();
      g_executionStatus = "FLIP_LOCK_WAIT_EXISTING_POSITION";
      return;
   }

   // RACE starts only from a flat account. AUTO below is intentionally left
   // untouched and never evaluates this branch unless engineMode=RACE.
   if(RaceModeEnabled() && count <= 0 && rescueCount <= 0)
   {
      StartRaceCycle(momentum);
      return;
   }

   if(AutoEnabled() && count > 0 && !BasketHasAutoPosition())
   {
      // AUTO never adopts a MANUAL/legacy basket. Wait for the previous owner
      // to become flat before Vector Edge may create a new AUTO cycle.
      g_executionStatus="AUTO_WAIT_FOREIGN_POSITION";
      return;
   }

   // V16 self-healing: ProcessBurstQueue can abort on a transient lease or
   // broker-permission interruption. Once control is healthy again, an open
   // Basket below Max Positions is automatically re-armed instead of being
   // stranded forever in BASKET_MANAGING with only one or two positions.
   if(LegacyBasketEngineEnabled() && BasketFillEnabled() && count > 0 && !g_burstActive && count < g_maxPositions)
      BrainV16RearmExistingBasket();

   if(LegacyBasketEngineEnabled() && BasketFillEnabled() && g_burstActive)
   {
      ProcessBurstQueue();
      return;
   }

   if(LegacyBasketEngineEnabled() && BasketFillEnabled() && count > 0)
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
      g_executionStatus = g_spreadStatus == "EXTREME"
         ? "EXTREME_SPREAD" : "SPREAD_TOO_HIGH";
      return;
   }

   int direction = AdaptiveEntryDirection(momentum);
   if(direction == 0)
   {
      g_executionStatus = g_adaptiveBlockReason == "" ? "WAITING_MOMENTUM" : g_adaptiveBlockReason;
      return;
   }

   // Brain V12: a previous exit may not freeze the next valid market direction.
   // Clear legacy rearm state instead of waiting for another confirmation gate.
   if(g_marketRearmDirection != 0)
      ClearMarketRearm();

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

   if(count > 0 && !AutoEnabled() && !BasketFillEnabled() && !AdaptiveBasketAddAllowed(direction))
   {
      g_executionStatus = "WAITING_BASKET_ADD";
      return;
   }

   if(!UserDirectionAllows(direction))
   {
      g_executionStatus = "USER_DIRECTION_LOCK";
      g_adaptiveBlockReason = direction > 0
         ? "USER_DIRECTION_LOCK_SELL_ONLY"
         : "USER_DIRECTION_LOCK_BUY_ONLY";
      return;
   }

   if(!OpenTradingAllowedForDirection(direction))
   {
      g_executionStatus = "SYMBOL_DIRECTION_BLOCKED";
      return;
   }

   // Brain V12: do not re-run market-location or Entry Precision as order
   // blockers here. Direction is already decided; proceed to market execution.
   g_adaptiveBlockReason = "";

   g_executionStatus = direction > 0 ? "READY_BUY" : "READY_SELL";
   bool sent = SendMarketOrder(direction);
   if(sent && AutoEnabled())
      AutoOnOrderSent(direction);
   if(sent || (LegacyBasketEngineEnabled() && BasketFillEnabled() && !g_tacticalCountertrendActive))
   {
      RegisterOrderRequest();
      if(LegacyBasketEngineEnabled() && BasketFillEnabled() && !g_tacticalCountertrendActive)
         ArmBurst(direction);
   }
}

bool SendFlatHeartbeatIfDue()
{
   if(MQLInfoInteger(MQL_TESTER) || LocalExecutionExposureActive())
      return false;

   if(InpCloudRelay && g_cloudHeartbeatPending)
   {
      if(CloudRelayHeartbeatResultReady())
         SendHeartbeat();
      return true;
   }

   ulong heartbeatNowMs=GetTickCount64();
   ulong heartbeatIntervalMs=(ulong)MathMax(1,InpHeartbeatSeconds)*1000;
   bool heartbeatDue=
      g_lastHeartbeatTickMs==0 ||
      heartbeatNowMs-g_lastHeartbeatTickMs>=heartbeatIntervalMs;
   if(!heartbeatDue)
      return false;

   g_lastHeartbeatTickMs=heartbeatNowMs;
   g_lastHeartbeat=TimeCurrent();
   SendHeartbeat();
   return true;
}

void OnTimer()
{
   g_lastTimerEventTickMs=GetTickCount64();

   // A flat/STOPPED Cloud runtime has no exposure to protect. Give a due
   // heartbeat the whole timer pass before indicators/chart/profit work so a
   // closed market or slow history read cannot starve SaaS connectivity.
   if(SendFlatHeartbeatIfDue())
   {
      RefreshChartStatus();
      return;
   }

   // Keep STOPPED Cloud control entirely off the heavy indicator/history path.
   // The 1-second timer remains responsive and a START command is picked up on
   // the next short idle heartbeat instead of waiting behind market analysis.
   if(CloudStoppedFlatIdle())
   {
      RefreshChartStatus();
      return;
   }

   SampleSpread();

   // Timer fallback: close/retry first and do not enter WebRequest while a
   // ZERO/RACE profit close is in progress.
   if(FastProfitClosePriority())
   {
      RefreshChartStatus();
      return;
   }

   if(MQLInfoInteger(MQL_TESTER))
   {
      if(LegacyBasketEngineEnabled())
      {
         BrainV16RearmExistingBasket();
         ProcessBurstQueue();
      }
      RefreshChartStatus();
      return;
   }

   // LOCAL EXECUTION PLANE: broker/price management always runs before any
   // synchronous HTTP. Existing FLIP exposure is protected locally even when
   // SaaS is slow; flat FLIP entries remain tick-driven in OnTick.
   if(BasketHasFlipLockPosition())
      FlipLockManage();

   // Existing ZERO exposure/pending ladder also gets local maintenance before
   // transport work. Starting a brand-new flat ZERO cycle still waits for the
   // normal control/authorization path below/OnTick.
   bool zeroTimerOwnsExposure =
      g_zeroGridClosing ||
      ZeroGridPositionCount()>0 ||
      ZeroGridPendingCount()>0;
   if(g_settingsSynchronized && zeroTimerOwnsExposure)
      ManageZeroGrid();

   // A Cloud relay response is local file I/O only. While one heartbeat is
   // pending, do not enter indicator/history/journal work that could keep this
   // Timer event busy after the Worker has already written the response file.
   // Local exposure protection above still runs first on every Timer event.
   if(InpCloudRelay && g_cloudHeartbeatPending)
   {
      if(CloudRelayHeartbeatResultReady())
         SendHeartbeat();
      RefreshChartStatus();
      return;
   }

   ulong heartbeatNowMs=GetTickCount64();
   ulong heartbeatIntervalMs=(ulong)MathMax(1,InpHeartbeatSeconds)*1000;
   bool heartbeatDue =
      g_lastHeartbeatTickMs==0 ||
      heartbeatNowMs-g_lastHeartbeatTickMs>=heartbeatIntervalMs;
   bool localExposure=LocalExecutionExposureActive();
   bool marketBusy =
      localExposure &&
      g_lastMarketTickMs>0 &&
      heartbeatNowMs>=g_lastMarketTickMs &&
      heartbeatNowMs-g_lastMarketTickMs<LOCAL_EXECUTION_NETWORK_QUIET_MS;
   bool heartbeatOverdue =
      g_lastHeartbeatTickMs==0 ||
      heartbeatNowMs-g_lastHeartbeatTickMs>=
         heartbeatIntervalMs+LOCAL_EXECUTION_HEARTBEAT_MAX_DEFER_MS;
   bool allowNetworkNow=!marketBusy || heartbeatOverdue;
   bool networkUsed=false;

   // Heartbeat is control/telemetry only. During active execution it yields to
   // fast ticks for a bounded defer window, then uses a short HTTP timeout.
   if(heartbeatDue && allowNetworkNow)
   {
      g_lastHeartbeatTickMs=heartbeatNowMs;
      g_lastHeartbeat=TimeCurrent();
      SendHeartbeat();
      networkUsed=true;
      if(InpCloudRelay && g_cloudHeartbeatPending)
      {
         RefreshChartStatus();
         return;
      }
   }

   // Keep control-plane liveness ahead of chart/history work. CopyRates,
   // CopyBuffer and chart redraw are allowed to lag on a closed/disconnected
   // market, but they must never prevent the EA heartbeat from reaching SaaS.
   bool zeroGridFastPath =
      ZeroGridPositionCount() > 0 ||
      ZeroGridPendingCount() > 0 ||
      (ZeroGridModeEnabled() &&
       BasketPositionCount() <= 0 &&
       RescuePositionCount() <= 0);
   if(!zeroGridFastPath)
   {
      RefreshEmaIntelligence(false);
      DrawEmaCurves();
   }

   bool zeroDeferredJournalReady=false;
   if(g_deferredJournalCount>0)
   {
      int zeroJournalSlot=g_deferredJournalHead;
      ulong zeroJournalTicket=g_deferredJournalTickets[zeroJournalSlot];
      bool zeroJournalRescue=g_deferredJournalRescue[zeroJournalSlot];
      zeroDeferredJournalReady=
         !zeroJournalRescue &&
         TradeModeForDeal(zeroJournalTicket)=="ZERO_GRID";
   }

   bool zeroBasketJournalReady=false;
   if(g_pendingBasketJournal && g_pendingBasketRetryAt<=TimeCurrent())
   {
      string zeroPendingMode=TradeModeForDeal((ulong)g_pendingBasketId);
      if(zeroPendingMode=="")
         zeroPendingMode=DailyRiskMode();
      zeroBasketJournalReady=zeroPendingMode=="ZERO_GRID";
   }

   bool zeroJournalForceDue=
      (zeroDeferredJournalReady || zeroBasketJournalReady) &&
      (g_lastZeroGridJournalAttemptMs==0 ||
       heartbeatNowMs-g_lastZeroGridJournalAttemptMs>=ZERO_GRID_JOURNAL_FORCE_INTERVAL_MS);

   // ZERO keeps broker-side pending exposure alive almost continuously, so the
   // normal market-quiet journal slot may never open. Give ZERO one bounded
   // telemetry attempt between heartbeats; heartbeat still has priority and
   // trading management above remains local and first.
   if(!networkUsed && !heartbeatDue && zeroJournalForceDue)
   {
      g_lastZeroGridJournalAttemptMs=heartbeatNowMs;
      if(zeroBasketJournalReady)
         FlushPendingBasketJournal();
      else
         FlushOneDeferredDealJournal();
      networkUsed=true;
   }

   // Other journal traffic keeps the existing market-quiet behavior. Never
   // stack more than one HTTP call in the same timer pass.
   if(!networkUsed && allowNetworkNow)
   {
      if(g_deferredJournalCount>0)
      {
         FlushOneDeferredDealJournal();
         networkUsed=true;
      }
      else if(g_pendingBasketJournal)
      {
         FlushPendingBasketJournal();
         networkUsed=true;
      }
   }

   // New MANUAL/legacy exposure remains server-authorized. Unlike local
   // protection above, never move basket fill/rearm ahead of the latest control work.
   if(LegacyBasketEngineEnabled())
   {
      BrainV16RearmExistingBasket();
      ProcessBurstQueue();
   }

   // Flat ZERO may be started/rearmed only after the latest control work.
   bool zeroTimerCanStart =
      !zeroTimerOwnsExposure &&
      ZeroGridModeEnabled() &&
      BasketPositionCount()<=0 &&
      RescuePositionCount()<=0;
   if(g_settingsSynchronized && zeroTimerCanStart &&
      g_state==STATE_RUNNING && g_access && TradePermissionStatus()=="OK")
      ManageZeroGrid();

   RefreshChartStatus();
}

string RealtimeJsonEscape(string value)
{
   StringReplace(value, "\\", "\\\\");
   StringReplace(value, "\"","\\\"");
   StringReplace(value, "\r", " ");
   StringReplace(value, "\n", " ");
   return value;
}

string RealtimeEventTypeForDealEntry(long dealEntry)
{
   if(dealEntry == DEAL_ENTRY_IN)
      return "ORDER_OPENED";
   if(dealEntry == DEAL_ENTRY_OUT || dealEntry == DEAL_ENTRY_OUT_BY)
      return "ORDER_CLOSED";
   return "ORDER_CHANGED";
}

void PublishRealtimeEvent(string eventType, ulong dealTicket=0)
{
   // Cloud realtime telemetry is deliberately local-file only. No WebRequest
   // is allowed here, so trade execution and broker-side close/open paths never
   // wait for SCENOVA network latency.
   if(MQLInfoInteger(MQL_TESTER) || !InpCloudRelay ||
      StringLen(InpInstanceId) < 8 || StringLen(eventType) <= 0)
      return;

   string eventId =
      IntegerToString((long)TimeLocal()) + "-" +
      IntegerToString((long)GetTickCount64()) + "-" +
      IntegerToString((long)dealTicket);
   string chartTag = IntegerToString((long)ChartID());
   string eventFile =
      "scenova-evt-" + chartTag + "-" + eventId + ".request.txt";

   string payload = StringFormat(
      "{\"eventId\":\"%s\",\"eventType\":\"%s\",\"instanceId\":\"%s\",\"occurredAt\":%I64d,\"state\":\"%s\",\"executionStatus\":\"%s\",\"symbol\":\"%s\",\"positions\":%d,\"openPositions\":%s,\"dealTicket\":\"%I64u\"}",
      RealtimeJsonEscape(eventId),
      RealtimeJsonEscape(eventType),
      RealtimeJsonEscape(InpInstanceId),
      (long)TimeCurrent(),
      RealtimeJsonEscape(StateText()),
      RealtimeJsonEscape(g_executionStatus),
      RealtimeJsonEscape(_Symbol),
      ScenovaAccountPositionCount(),
      OpenPositionsTelemetryJson(),
      dealTicket
   );

   ResetLastError();
   int out = FileOpen(eventFile,FILE_WRITE|FILE_TXT|FILE_ANSI,0,CP_UTF8);
   if(out == INVALID_HANDLE)
      return;

   FileWriteString(out,payload);
   FileClose(out);
}

void PublishCloudLiveExecutionSnapshot()
{
   // Cloud-only fast telemetry path. This is deliberately local file I/O:
   // no WebRequest, no trade decision, no risk decision, and no waiting on SaaS.
   // The Cloud Worker drains only the newest snapshot and pushes it through SSE.
   if(MQLInfoInteger(MQL_TESTER) || !InpCloudRelay ||
      StringLen(InpInstanceId) < 8)
      return;

   int positionCount=ScenovaAccountPositionCount();
   if(positionCount<=0)
      return;

   ulong nowMs=GetTickCount64();
   if(g_lastCloudLiveExecutionSnapshotMs>0 &&
      nowMs>=g_lastCloudLiveExecutionSnapshotMs &&
      nowMs-g_lastCloudLiveExecutionSnapshotMs<CLOUD_LIVE_EXECUTION_INTERVAL_MS)
      return;

   // Throttle before filesystem work so a transient file error can never turn
   // this observability path into a busy loop inside OnTick.
   g_lastCloudLiveExecutionSnapshotMs=nowMs;

   MqlTick tick;
   long occurredAtMs=(long)TimeCurrent()*1000;
   if(SymbolInfoTick(_Symbol,tick) && tick.time_msc>0)
      occurredAtMs=tick.time_msc;

   string eventId=
      "live-" +
      IntegerToString((long)TimeLocal()) + "-" +
      IntegerToString((long)nowMs);
   string chartTag=IntegerToString((long)ChartID());
   string eventFile=
      "scenova-live-" + chartTag + "-" + eventId + ".request.txt";

   string payload=StringFormat(
      "{\"eventId\":\"%s\",\"eventType\":\"LIVE_EXECUTION\",\"instanceId\":\"%s\",\"occurredAt\":%I64d,\"occurredAtMs\":%I64d,\"state\":\"%s\",\"executionStatus\":\"%s\",\"symbol\":\"%s\",\"positions\":%d,\"openPositions\":%s,\"liveExecutionIntervalMs\":%d}",
      RealtimeJsonEscape(eventId),
      RealtimeJsonEscape(InpInstanceId),
      (long)TimeCurrent(),
      occurredAtMs,
      RealtimeJsonEscape(StateText()),
      RealtimeJsonEscape(g_executionStatus),
      RealtimeJsonEscape(_Symbol),
      positionCount,
      OpenPositionsTelemetryJson(),
      CLOUD_LIVE_EXECUTION_INTERVAL_MS
   );

   ResetLastError();
   int out=FileOpen(eventFile,FILE_WRITE|FILE_TXT|FILE_ANSI,0,CP_UTF8);
   if(out==INVALID_HANDLE)
      return;

   FileWriteString(out,payload);
   FileClose(out);
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
   long ownerMagic = IsScenovaMagic(magic)
      ? magic
      : ScenovaOwnerMagicForDeal(trans.deal);

   if(symbol == _Symbol && ownerMagic == RescueMagic())
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
      QueueDeferredDealJournal(trans.deal,true);

      long rescueEntry = HistoryDealGetInteger(trans.deal,DEAL_ENTRY);
      if((rescueEntry == DEAL_ENTRY_OUT ||
          rescueEntry == DEAL_ENTRY_OUT_BY ||
          rescueEntry == DEAL_ENTRY_INOUT) &&
         BasketPositionCount() == 0 &&
         RescuePositionCount() == 0)
         FinalizeBasketJournal();

      PublishRealtimeEvent(
         RealtimeEventTypeForDealEntry(rescueEntry),
         trans.deal
      );
      return;
   }

   if(symbol == _Symbol && ownerMagic == InpMagic)
   {
      RecordBasketDeal(trans.deal);
      RecalculateDailyClosedProfit();
      TrackBasketJournalDeal(trans.deal);

      // Journal is best-effort observability only. Queue the immutable deal
      // ticket and return immediately; HTTP is flushed later from OnTimer.
      QueueDeferredDealJournal(trans.deal,false);

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

      PublishRealtimeEvent(
         RealtimeEventTypeForDealEntry(dealEntry),
         trans.deal
      );
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
      PublishRealtimeEvent("STATE_CHANGED",trans.deal);
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

string MarketWatchSymbolsJson()
{
   int total = SymbolsTotal(true);
   string json = "[";
   int added = 0;
   for(int i = 0; i < total; i++)
   {
      string symbolName = SymbolName(i, true);
      if(StringLen(symbolName) <= 0)
         continue;
      StringReplace(symbolName, "\\", "\\\\");
      StringReplace(symbolName, "\"", "\\\"");
      if(added > 0)
         json += ",";
      json += "\"" + symbolName + "\"";
      added++;
   }
   return json + "]";
}

bool LocalExecutionExposureActive()
{
   return BasketPositionCount()>0 ||
          RescuePositionCount()>0 ||
          ZeroGridPositionCount()>0 ||
          ZeroGridPendingCount()>0 ||
          g_zeroGridClosing;
}

int ExecutionAwareHttpTimeoutMs(const int flatTimeoutMs)
{
   if(LocalExecutionExposureActive())
      return LOCAL_EXECUTION_LIVE_HTTP_TIMEOUT_MS;
   return MathMax(LOCAL_EXECUTION_LIVE_HTTP_TIMEOUT_MS,flatTimeoutMs);
}

int HeartbeatHttpTimeoutMs()
{
   if(LocalExecutionExposureActive())
      return LOCAL_EXECUTION_HEARTBEAT_HTTP_TIMEOUT_MS;
   return FLAT_HEARTBEAT_HTTP_TIMEOUT_MS;
}

bool IsRealHttpStatus(const int code)
{
   return code>=100 && code<=599;
}

bool IsHttpTransportFailure(const int code,const int transportError)
{
   return !IsRealHttpStatus(code) ||
          (transportError>=5200 && transportError<=5203);
}

bool PersistCloudJournalPayload(
   const string payload,
   const ulong dealTicket,
   const string eventType
)
{
   if(!InpCloudRelay || StringLen(payload)<16 || dealTicket==0)
      return false;

   string journalFile=
      "scenova-journal-"+IntegerToString((long)dealTicket)+"-"+eventType+".request.txt";

   // A pending file is already durable. Database idempotency makes a later
   // replay safe even if MT5/Worker restarts between write and acknowledgement.
   if(FileIsExist(journalFile))
      return true;

   ResetLastError();
   int out=FileOpen(journalFile,FILE_WRITE|FILE_TXT|FILE_ANSI,0,CP_UTF8);
   if(out==INVALID_HANDLE)
      return false;

   FileWriteString(out,payload);
   FileFlush(out);
   FileClose(out);
   return FileIsExist(journalFile);
}

void QueueDeferredDealJournal(const ulong dealTicket,const bool rescueDeal)
{
   if(dealTicket==0 || MQLInfoInteger(MQL_TESTER))
      return;

   // Cloud journals become durable at the trade callback boundary using local
   // file I/O only. No network call is made here. If the disk write fails, keep
   // the legacy in-memory queue so OnTimer can retry without affecting trading.
   if(InpCloudRelay)
   {
      bool persisted=rescueDeal
         ? PostRescueJournalDeal(dealTicket)
         : PostTradeJournalDeal(dealTicket);
      if(persisted)
         return;
   }

   if(g_deferredJournalCount>=DEFERRED_DEAL_JOURNAL_MAX)
   {
      // Telemetry must never back-pressure execution. Drop the oldest event if
      // the network has been unavailable for an unusually long active run.
      g_deferredJournalHead=(g_deferredJournalHead+1)%DEFERRED_DEAL_JOURNAL_MAX;
      g_deferredJournalCount--;
      g_journalFailed++;
   }

   int slot=(g_deferredJournalHead+g_deferredJournalCount)%DEFERRED_DEAL_JOURNAL_MAX;
   g_deferredJournalTickets[slot]=dealTicket;
   g_deferredJournalRescue[slot]=rescueDeal;
   g_deferredJournalCount++;
}

void FlushOneDeferredDealJournal()
{
   if(g_deferredJournalCount<=0)
      return;

   int slot=g_deferredJournalHead;
   ulong ticket=g_deferredJournalTickets[slot];
   bool rescueDeal=g_deferredJournalRescue[slot];
   bool zeroGridJournal=
      !rescueDeal &&
      TradeModeForDeal(ticket)=="ZERO_GRID";

   // Cloud retries are durable-file writes only. Never pop the RAM fallback
   // until the event is safely present on disk for Worker delivery.
   if(InpCloudRelay)
   {
      bool persisted=rescueDeal
         ? PostRescueJournalDeal(ticket)
         : PostTradeJournalDeal(ticket);
      if(!persisted)
         return;

      g_deferredJournalTickets[slot]=0;
      g_deferredJournalRescue[slot]=false;
      g_deferredJournalHead=(g_deferredJournalHead+1)%DEFERRED_DEAL_JOURNAL_MAX;
      g_deferredJournalCount--;
      return;
   }

   // ZERO statistics are required by the per-mode dashboard. Do not discard a
   // ZERO deal just because one telemetry request timed out; keep it at the
   // queue head and retry from the bounded ZERO journal slot.
   if(zeroGridJournal)
   {
      g_lastZeroGridJournalAttemptMs=GetTickCount64();
      if(!PostTradeJournalDeal(ticket))
         return;
   }

   g_deferredJournalTickets[slot]=0;
   g_deferredJournalRescue[slot]=false;
   g_deferredJournalHead=(g_deferredJournalHead+1)%DEFERRED_DEAL_JOURNAL_MAX;
   g_deferredJournalCount--;

   if(zeroGridJournal)
      return;
   if(rescueDeal)
      PostRescueJournalDeal(ticket);
   else
      PostTradeJournalDeal(ticket);
}

void SendHeartbeat()
{
   if(StringLen(InpApiBase) < 8 || StringLen(InpInstanceId) < 8 || StringLen(InpInstallToken) < 8)
      return;

   string stateText = StateText();
   string terminalConnected = TerminalConnectedNow() ? "true" : "false";
   long brokerPingMicros = (long)TerminalInfoInteger(TERMINAL_PING_LAST);
   double brokerPingMs = brokerPingMicros > 0
      ? (double)brokerPingMicros / 1000.0
      : 0.0;
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
   double botTodayClosedProfit = BotTodayClosedProfitAllModes();
   double botFloatingProfit = BotFloatingProfitAllModes();
   double botTodayProfit = botTodayClosedProfit + botFloatingProfit;
   int accountScenovaPositions=ScenovaAccountPositionCount();
   int accountScenovaPendingOrders=ScenovaAccountPendingCount();
   string accountFlatConfirmedText=
      (accountScenovaPositions==0 && accountScenovaPendingOrders==0)
      ? "true"
      : "false";

   string payload = StringFormat(
      "{\"instanceId\":\"%s\",\"installToken\":\"%s\",\"state\":\"%s\",\"metrics\":{\"accountNumber\":\"%s\",\"eaVersion\":\"%s\",\"productVersion\":\"%s\",\"buildId\":\"%s\",\"symbol\":\"%s\",\"server\":\"%s\",\"currency\":\"%s\",\"accountTradeMode\":%d,\"balance\":%.2f,\"equity\":%.2f,\"basketProfit\":%.2f,\"basketCycleProfit\":%.2f,\"basketProfitTarget\":%.2f,\"basketPeakPositions\":%d,\"perPositionProfitTarget\":%.2f,\"profitRunTrailPercent\":%.2f,\"profitRunPeak\":%.2f,\"perPositionLoss\":%.2f,\"dailyProfit\":%.2f,\"botTodayProfit\":%.2f,\"botTodayClosedProfit\":%.2f,\"botFloatingProfit\":%.2f,\"dailyProfitTarget\":%.2f,\"dailyProfitContinueAfterTarget\":%s,\"dailyProfitDrawdownPercent\":%.2f,\"dailyProfitTargetArmed\":%s,\"dailyProfitGivebackFloor\":%.2f,\"dailyProfitLocked\":%s,\"peakProfit\":%.2f,\"positions\":%d,\"accountScenovaPositions\":%d,\"accountScenovaPendingOrders\":%d,\"accountFlatConfirmed\":%s,\"spreadPoints\":%.1f,\"spreadPrice\":%s,\"pointSize\":%s,\"symbolDigits\":%d,\"maxSpreadPrice\":%s,\"momentumPoints\":%.1f,\"momentumEntryPoints\":%.1f,\"maxSpreadPoints\":%d,\"terminalConnected\":%s,\"brokerPingMs\":%.1f,\"terminalTradeAllowed\":%s,\"mqlTradeAllowed\":%s,\"accountTradeAllowed\":%s,\"accountTradeExpert\":%s,\"tradeReady\":%s,\"symbolTradeMode\":%d,\"adaptiveEngine\":%s,\"marketRegime\":\"%s\",\"signalConfidence\":%.1f,\"adaptiveLot\":%.4f,\"atrPoints\":%.1f,\"adaptiveBlockReason\":\"%s\",\"consecutiveLosses\":%d,\"cooldownUntil\":%I64d,\"executionStatus\":\"%s\",\"lastOrderRetcode\":%I64d,\"lastOrderError\":%d,\"lastOrderAt\":%I64d}}",
      InpInstanceId,
      InpInstallToken,
      stateText,
      IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN)),
      SCENOVA_EA_VERSION,
      SCENOVA_PRODUCT_VERSION,
      SCENOVA_BUILD_ID,
      _Symbol,
      AccountInfoString(ACCOUNT_SERVER),
      AccountInfoString(ACCOUNT_CURRENCY),
      (int)AccountInfoInteger(ACCOUNT_TRADE_MODE),
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
      botTodayProfit,
      botTodayClosedProfit,
      botFloatingProfit,
      EffectiveDailyProfitTarget(),
      dailyProfitContinueText,
      g_dailyProfitDrawdownPercent,
      dailyProfitTargetArmedText,
      DailyProfitGivebackFloor(),
      dailyProfitLockedText,
      g_peakProfit,
      BasketPositionCount(),
      accountScenovaPositions,
      accountScenovaPendingOrders,
      accountFlatConfirmedText,
      CurrentSpreadPoints(),
      DoubleToString(CurrentSpreadPrice(), SymbolDigitsNow()),
      DoubleToString(_Point, SymbolDigitsNow()),
      SymbolDigitsNow(),
      DoubleToString(telemetrySpreadLimit * _Point, SymbolDigitsNow()),
      MomentumPoints(),
      InpMomentumEntryPoints,
      (int)MathRound(telemetrySpreadLimit),
      terminalConnected,
      brokerPingMs,
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

   // Performance clock telemetry only. This does not participate in entry,
   // exit, sizing, risk, or order-management decisions. It lets the server
   // reconcile the same broker-day window that MT5 uses for closed P/L.
   long performanceBrokerUtcOffsetSeconds=BrokerUtcOffsetSeconds();
   if(StringLen(payload)>=2)
   {
      string performanceClockDiagnostics=StringFormat(
         ",\"brokerTime\":%I64d,\"brokerDayStart\":%I64d,\"brokerUtcOffsetSeconds\":%I64d}}",
         (long)TimeCurrent(),
         (long)BrokerDayStart(),
         performanceBrokerUtcOffsetSeconds
      );
      payload=StringSubstr(payload,0,StringLen(payload)-2)+performanceClockDiagnostics;
   }

   bool suppressLivePriceTelemetry=LocalExecutionExposureActive();
   if(suppressLivePriceTelemetry && StringLen(payload)>=2)
   {
      string liveControlOnly=
         ",\"sessionProfile\":\"" + g_sessionProfile + "\",\"marketSessionState\":\"" + MarketSessionStateNow() + "\",\"executionPriceSource\":\"MT5_LOCAL_TICK\",\"serverPriceControl\":false,\"runtimeContract\":\"" + SCENOVA_RUNTIME_CONTRACT + "\",\"livePriceTelemetrySuppressed\":true,\"openPositions\":" +
         OpenPositionsTelemetryJson() + "}}";
      payload=StringSubstr(payload,0,StringLen(payload)-2)+liveControlOnly;
   }

   // Add diagnostics separately so the stable heartbeat format remains easy to
   // audit and new telemetry cannot shift StringFormat arguments accidentally.
   if(StringLen(payload) >= 2 && !suppressLivePriceTelemetry)
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
         ",\"engineMode\":\"%s\",\"basketFillActive\":%s,\"basketTargetPositions\":%d,\"basketRequestsSent\":%d,\"basketFilledPositions\":%d,\"basketFillProgressText\":\"%d/%d\",\"basketAutoTargetMoney\":%.2f,\"basketLossMoney\":%.2f}}",
         EffectiveExecutionMode(),
         g_burstActive ? "true" : "false",
         g_burstTargetPositions,
         g_burstRequestsSent,
         BasketPositionCount(),
         BasketPositionCount(),
         g_burstTargetPositions > 0 ? g_burstTargetPositions : g_maxPositions,
         g_burstTargetMoney,
         g_burstLossMoney
      );
      payload = StringSubstr(payload, 0, StringLen(payload) - 2) + burstDiagnostics;

      int displayTrendM5=DisplayTimeframeTrend(PERIOD_M5,g_emaTrendM5,g_trendM5);
      int displayTrendM15=DisplayTimeframeTrend(PERIOD_M15,g_emaTrendM15,g_trendM15);
      int displayTrendM30=DisplayTimeframeTrend(PERIOD_M30,g_emaTrendM30,g_trendM30);
      int displayTrendH1=DisplayTimeframeTrend(PERIOD_H1,g_emaTrendH1,g_trendH1);
      string displayTrendDiagnostics=StringFormat(
         ",\"displayTrendM5\":%d,\"displayTrendM15\":%d,\"displayTrendM30\":%d,\"displayTrendH1\":%d",
         displayTrendM5,
         displayTrendM15,
         displayTrendM30,
         displayTrendH1
      );

      // Market-context telemetry makes every entry auditable on the web.
      string marketContextDiagnostics = StringFormat(
         ",\"trendM1\":%d,\"trendM30\":%d,\"effectiveConfidenceThreshold\":%.1f,\"confidenceGateEnabled\":%s,\"entryDecisionMode\":\"INDICATOR_INTELLIGENCE_V6\",\"entryTrigger\":\"%s\",\"newsTradingEnabled\":true,\"nearestSupport\":%s,\"nearestResistance\":%s,\"m5Support\":%s,\"m5Resistance\":%s,\"supportTimeframe\":\"%s\",\"resistanceTimeframe\":\"%s\",\"majorSupport\":%s,\"majorResistance\":%s,\"bullishOrderBlockLow\":%s,\"bullishOrderBlockHigh\":%s,\"bearishOrderBlockLow\":%s,\"bearishOrderBlockHigh\":%s,\"orderBlockTimeframe\":\"%s\",\"fibSwingLow\":%s,\"fibSwingHigh\":%s,\"fibDirection\":%d,\"fibRetracement\":%.4f,\"fibTimeframe\":\"%s\",\"fibM5Direction\":%d,\"fibM5Retracement\":%.4f,\"fibM5Strength\":%.1f,\"fibM15Direction\":%d,\"fibM15Retracement\":%.4f,\"fibM15Strength\":%.1f,\"fibConfluenceScore\":%.1f,\"structureScore\":%.1f,\"locationScore\":%.1f,\"entryScore\":%.1f,\"entryModel\":\"%s\",\"fiboVisible\":%s",
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

      string marketCycleV2Diagnostics = StringFormat(
         ",\"lowerTimeframeState\":\"%s\",\"reversalStatus\":\"%s\",\"newsMode\":\"%s\",\"newsCalendarActive\":%s,\"newsEventMinutes\":%d,\"demandZoneLow\":%s,\"demandZoneHigh\":%s,\"supplyZoneLow\":%s,\"supplyZoneHigh\":%s,\"demandZoneQuality\":\"%s\",\"supplyZoneQuality\":\"%s\",\"demandBaseScore\":%.1f,\"demandDepartureScore\":%.1f,\"demandFreshnessScore\":%.1f,\"demandMitigationScore\":%.1f,\"demandWickScore\":%.1f,\"demandVolumeScore\":%.1f,\"demandOverlapScore\":%.1f,\"supplyBaseScore\":%.1f,\"supplyDepartureScore\":%.1f,\"supplyFreshnessScore\":%.1f,\"supplyMitigationScore\":%.1f,\"supplyWickScore\":%.1f,\"supplyVolumeScore\":%.1f,\"supplyOverlapScore\":%.1f,\"rsiDivergenceBuyScore\":%.1f,\"rsiDivergenceSellScore\":%.1f,\"adxPreviousM5\":%.1f,\"vwapDistanceAtr\":%.3f,\"spaceToTargetAtr\":%.3f,\"fillPhase\":\"%s\",\"fillBlockReason\":\"%s\",\"lastEntryReason\":\"%s\",\"lastCloseReason\":\"%s\"",
         g_lowerTimeframeState,
         g_reversalStatus,
         g_newsMode,
         g_newsCalendarActive ? "true" : "false",
         g_newsEventMinutes,
         DoubleToString(g_demandZoneLow,SymbolDigitsNow()),
         DoubleToString(g_demandZoneHigh,SymbolDigitsNow()),
         DoubleToString(g_supplyZoneLow,SymbolDigitsNow()),
         DoubleToString(g_supplyZoneHigh,SymbolDigitsNow()),
         g_demandZoneQuality,
         g_supplyZoneQuality,
         g_demandBaseScore,
         g_demandDepartureScore,
         g_demandFreshnessScore,
         g_demandMitigationScore,
         g_demandWickScore,
         g_demandVolumeScore,
         g_demandOverlapScore,
         g_supplyBaseScore,
         g_supplyDepartureScore,
         g_supplyFreshnessScore,
         g_supplyMitigationScore,
         g_supplyWickScore,
         g_supplyVolumeScore,
         g_supplyOverlapScore,
         g_rsiDivergenceBuyScore,
         g_rsiDivergenceSellScore,
         g_adxPreviousM5,
         g_vwapDistanceAtr,
         g_spaceToTargetAtr,
         g_fillPhase,
         g_fillBlockReason,
         g_lastEntryReason,
         g_lastCloseReason
      );

      string indicatorV6Diagnostics = StringFormat(
         ",\"indicatorV6Mode\":\"%s\",\"indicatorDecision\":\"%s\",\"indicatorWhy\":\"%s\",\"indicatorLocationScore\":%.1f,\"indicatorMomentumScore\":%.1f,\"indicatorStructureScore\":%.1f,\"indicatorVolatilityScore\":%.1f,\"indicatorExecutionScore\":%.1f,\"indicatorCostSpaceScore\":%.1f,\"indicatorCompositeScore\":%.1f,\"volumePoc\":%s,\"volumeVah\":%s,\"volumeVal\":%s,\"volumeHvn\":%s,\"volumeLvn\":%s,\"volumeProfileState\":\"%s\",\"swingAnchoredVwap\":%s,\"impulseAnchoredVwap\":%s,\"multiVwapState\":\"%s\",\"multiVwapScore\":%.1f,\"donchianHigh\":%s,\"donchianLow\":%s,\"donchianState\":\"%s\",\"bbWidthAtr\":%.3f,\"squeezeState\":\"%s\",\"macdHistogram\":%.6f,\"macdHistogramSlope\":%.6f,\"macdState\":\"%s\",\"stochK\":%.1f,\"stochD\":%.1f,\"stochState\":\"%s\",\"tickVolumeMomentum\":%.3f,\"obvFlowScore\":%.1f,\"candleEfficiency\":%.3f,\"adxSlope\":%.2f,\"dmiAcceleration\":%.2f,\"rsiRegularDivBuy\":%.1f,\"rsiRegularDivSell\":%.1f,\"rsiHiddenDivBuy\":%.1f,\"rsiHiddenDivSell\":%.1f,\"sessionHigh\":%s,\"sessionLow\":%s,\"previousDayHigh\":%s,\"previousDayLow\":%s,\"previousDayClose\":%s,\"weekHigh\":%s,\"weekLow\":%s,\"levelFlipState\":\"%s\",\"flipLevel\":%s,\"emaCompressionScore\":%.1f,\"premiumDiscountState\":\"%s\",\"fvgLifecycleState\":\"%s\",\"orderBlockLifecycleState\":\"%s\",\"indicatorTargetPrice\":%s,\"indicatorHistoryWinProbability\":%.1f,\"indicatorHistorySamples\":%d,\"indicatorHistoryExpectedValue\":%.2f,\"indicatorHistoryEvScore\":%.1f",
         IndicatorV6ModeName(),
         g_indicatorDecision,
         g_indicatorWhy,
         g_indicatorLocationScore,
         g_indicatorMomentumScore,
         g_indicatorStructureScore,
         g_indicatorVolatilityScore,
         g_indicatorExecutionScore,
         g_indicatorCostSpaceScore,
         g_indicatorCompositeScore,
         DoubleToString(g_volumePoc,SymbolDigitsNow()),
         DoubleToString(g_volumeVah,SymbolDigitsNow()),
         DoubleToString(g_volumeVal,SymbolDigitsNow()),
         DoubleToString(g_volumeHvn,SymbolDigitsNow()),
         DoubleToString(g_volumeLvn,SymbolDigitsNow()),
         g_volumeProfileState,
         DoubleToString(g_swingAnchoredVwap,SymbolDigitsNow()),
         DoubleToString(g_impulseAnchoredVwap,SymbolDigitsNow()),
         g_multiVwapState,
         g_multiVwapScore,
         DoubleToString(g_donchianHigh,SymbolDigitsNow()),
         DoubleToString(g_donchianLow,SymbolDigitsNow()),
         g_donchianState,
         g_bbWidthAtr,
         g_squeezeState,
         g_macdHistogram,
         g_macdHistogramSlope,
         g_macdState,
         g_stochK,
         g_stochD,
         g_stochState,
         g_tickVolumeMomentum,
         g_obvFlowScore,
         g_candleEfficiency,
         g_adxSlope,
         g_dmiAcceleration,
         g_rsiRegularDivBuy,
         g_rsiRegularDivSell,
         g_rsiHiddenDivBuy,
         g_rsiHiddenDivSell,
         DoubleToString(g_sessionHigh,SymbolDigitsNow()),
         DoubleToString(g_sessionLow,SymbolDigitsNow()),
         DoubleToString(g_previousDayHigh,SymbolDigitsNow()),
         DoubleToString(g_previousDayLow,SymbolDigitsNow()),
         DoubleToString(g_previousDayClose,SymbolDigitsNow()),
         DoubleToString(g_weekHigh,SymbolDigitsNow()),
         DoubleToString(g_weekLow,SymbolDigitsNow()),
         g_levelFlipState,
         DoubleToString(g_flipLevel,SymbolDigitsNow()),
         g_emaCompressionScore,
         g_premiumDiscountState,
         g_fvgLifecycleState,
         g_orderBlockLifecycleState,
         DoubleToString(g_indicatorTargetPrice,SymbolDigitsNow()),
         g_indicatorHistoryWinProbability,
         g_indicatorHistorySamples,
         g_indicatorHistoryExpectedValue,
         g_indicatorHistoryEvScore
      );

      string positionDiagnostics =
         displayTrendDiagnostics + marketContextDiagnostics + intelligenceV3Diagnostics + probabilityDiagnostics +
         intelligenceV4Diagnostics + smartProfitDiagnostics + marketCycleV2Diagnostics +
         indicatorV6Diagnostics +
         StringFormat(
            ",\"marketCycleState\":\"%s\",\"rsiM1\":%.1f,\"rsiM5\":%.1f,\"adxM5\":%.1f,\"plusDiM5\":%.1f,\"minusDiM5\":%.1f,\"vwapM5\":%s,\"demandZoneScore\":%.1f,\"supplyZoneScore\":%.1f,\"reversalOpportunityDirection\":%d,\"reversalOpportunityScore\":%.1f,\"fillExpectedPositions\":%d,\"fillUrgency\":%.3f,\"marketRearmDirection\":%d,\"marketRearmReason\":\"%s\",\"decisionDirection\":%d,\"entryPrecisionState\":\"%s\",\"entryPrecisionReason\":\"%s\",\"entryPrecisionScore\":%.1f,\"entryDistanceAtr\":%.3f,\"expectedMoveAtr\":%.3f,\"executionCostAtr\":%.4f,\"liquidityState\":\"%s\",\"liquidityScore\":%.1f,\"microStructureState\":\"%s\",\"microStructureScore\":%.1f,\"fvgState\":\"%s\",\"fvgScore\":%.1f,\"precisionWaitSeconds\":%I64d,\"precisionWaitMaxSeconds\":%d,\"setupWinProbability\":%.1f,\"setupWinSamples\":%d,\"setupAvgWin\":%.2f,\"setupAvgLoss\":%.2f,\"setupEvScore\":%.1f,\"localExtremeState\":\"%s\",\"localExtremeScore\":%.1f,\"localExtremeLevel\":%s,\"failedBreakoutState\":\"%s\",\"breakoutHoldConfirmed\":%s,\"tacticalCountertrendActive\":%s,\"tacticalCountertrendDirection\":%d,\"tacticalCountertrendScore\":%.1f,\"tacticalCountertrendReason\":\"%s\"",
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
            g_marketRearmReason,
            g_cachedAdaptiveDirection,
            g_entryPrecisionState,
            g_entryPrecisionReason,
            g_entryPrecisionScore,
            g_entryDistanceAtr,
            g_expectedMoveAtr,
            g_executionCostAtr,
            g_liquidityState,
            g_liquidityScore,
            g_microStructureState,
            g_microStructureScore,
            g_fvgState,
            g_fvgScore,
            (long)(g_precisionWaitStartedAt>0 ? MathMax(0,TimeCurrent()-g_precisionWaitStartedAt) : 0),
            g_precisionWaitMaxSeconds,
            g_setupWinProbability,
            g_setupWinSamples,
            g_setupAvgWin,
            g_setupAvgLoss,
            g_setupEvScore,
            g_localExtremeState,
            g_localExtremeScore,
            DoubleToString(g_localExtremeLevel,SymbolDigitsNow()),
            g_failedBreakoutState,
            g_breakoutHoldConfirmed ? "true" : "false",
            g_tacticalCountertrendActive ? "true" : "false",
            g_tacticalCountertrendDirection,
            g_tacticalCountertrendScore,
            g_tacticalCountertrendReason
         ) +
         ",\"openPositions\":" + OpenPositionsTelemetryJson() + "}}";
      payload = StringSubstr(payload, 0, StringLen(payload) - 2) + positionDiagnostics;
   }

   string response = "";
      if(StringLen(payload) >= 2 && !suppressLivePriceTelemetry)
      {
         int auditDirection=g_cachedAdaptiveDirection;
         AUTO_SIDE auditSide;
         AutoResetSide(auditSide,auditDirection);
         if(auditDirection>0) auditSide=g_autoBuy;
         else if(auditDirection<0) auditSide=g_autoSell;
         string autoDiagnostics=StringFormat(
            ",\"controlMode\":\"%s\",\"autoActive\":%s,\"autoDecisionId\":%I64d,\"autoDecisionKind\":\"%s\",\"autoDecisionReason\":\"%s\",\"autoRejectReason\":\"%s\",\"autoDirectionChangeReason\":\"%s\",\"autoAddReason\":\"%s\",\"autoPhase\":\"%s\",\"autoBuyScore\":%.2f,\"autoSellScore\":%.2f,\"autoBuyConfidence\":%.2f,\"autoSellConfidence\":%.2f,\"autoConfidence\":%.2f,\"autoWinProbability\":%.2f,\"autoWinSamples\":%d,\"autoAverageNet\":%.2f,\"autoMomentumWithPoints\":%.2f,\"autoMomentumAgainstPoints\":%.2f,\"autoNearestSupport\":%s,\"autoNearestResistance\":%s,\"autoMajorSupport\":%s,\"autoMajorResistance\":%s,\"autoSupportDistanceAtr\":%.4f,\"autoResistanceDistanceAtr\":%.4f,\"autoFormingBase\":%s,\"autoFormingCeiling\":%s,\"autoRoleFlipState\":\"%s\",\"autoSwingStart\":%s,\"autoSwingExtreme\":%s,\"autoPullbackRetracement\":%.4f,\"autoPullbackState\":\"%s\",\"autoPlannedEntry\":%s,\"autoTpPrice\":%s,\"autoSlPrice\":%s,\"autoRR\":%.3f,\"autoExpectedProfitMoney\":%.2f,\"autoExpectedLossMoney\":%.2f,\"autoKnownCostMoney\":%.2f,\"autoAggregateRiskMoney\":%.2f}}",
            g_controlMode,
            AutoEnabled() ? "true" : "false",
            g_autoDecisionId,
            g_autoDecisionKind,
            g_autoDecisionReason,
            g_autoRejectReason,
            g_autoDirectionChangeReason,
            g_autoAddReason,
            g_autoPhase,
            g_autoBuy.rankScore,
            g_autoSell.rankScore,
            g_autoBuy.confidence,
            g_autoSell.confidence,
            g_autoConfidence,
            g_autoWinProbability,
            g_autoWinSamples,
            g_autoAverageNet,
            auditSide.momentumWithPoints,
            auditSide.momentumAgainstPoints,
            DoubleToString(g_autoLevels.nearestSupport,SymbolDigitsNow()),
            DoubleToString(g_autoLevels.nearestResistance,SymbolDigitsNow()),
            DoubleToString(g_autoLevels.majorSupport,SymbolDigitsNow()),
            DoubleToString(g_autoLevels.majorResistance,SymbolDigitsNow()),
            g_autoLevels.nearestSupportDistanceAtr,
            g_autoLevels.nearestResistanceDistanceAtr,
            DoubleToString(g_autoLevels.formingBase,SymbolDigitsNow()),
            DoubleToString(g_autoLevels.formingCeiling,SymbolDigitsNow()),
            g_autoLevels.roleFlipState,
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
            g_autoAggregateRiskMoney
         );
         payload=StringSubstr(payload,0,StringLen(payload)-2)+autoDiagnostics;
      }
   // Publish market-session telemetry independently of bot RUNNING/SAFE_STOP.
   // The dashboard can show market closed without pretending MT5 disconnected
   // and without waiting for an OrderSend rejection.
   if(StringLen(payload) >= 2 && !suppressLivePriceTelemetry)
   {
      string marketSessionState = MarketSessionStateNow();
      MqlTick marketTick;
      bool marketTickReady = SymbolInfoTick(_Symbol, marketTick);
      int marketDigits = SymbolDigitsNow();
      string marketBidText = marketTickReady ? DoubleToString(marketTick.bid, marketDigits) : "0";
      string marketAskText = marketTickReady ? DoubleToString(marketTick.ask, marketDigits) : "0";
      string marketMidText = marketTickReady ? DoubleToString((marketTick.bid + marketTick.ask) * 0.5, marketDigits) : "0";
      string marketSessionDiagnostics = StringFormat(
         ",\"marketSessionState\":\"%s\",\"marketSessionOpen\":%s,\"marketBid\":%s,\"marketAsk\":%s,\"marketMid\":%s,\"executionPriceSource\":\"MT5_LOCAL_TICK\",\"serverPriceControl\":false,\"runtimeContract\":\"%s\",\"zeroGridConfiguredFirstGapPrice\":%.2f,\"zeroGridConfiguredStepPrice\":%.2f,\"zeroGridConfiguredLevelsPerSide\":%d,\"zeroGridConfiguredBaseLot\":%.2f,\"zeroGridEffectiveLevelsPerSide\":%d,\"zeroGridMaxLevelsPerSide\":%d,\"zeroGridCycleActive\":%s}}",
         marketSessionState,
         marketSessionState == "OPEN" ? "true" : "false",
         marketBidText,
         marketAskText,
         marketMidText,
         SCENOVA_RUNTIME_CONTRACT,
         g_zeroGridFirstGapPrice,
         g_zeroGridStepPrice,
         g_zeroGridLevelsPerSide,
         g_zeroGridBaseLot,
         ZeroGridEffectiveLevelsPerSide(),
         ZERO_GRID_MAX_LEVELS,
         g_zeroGridCycleStartedAt > 0 ? "true" : "false"
      );
      payload = StringSubstr(payload, 0, StringLen(payload) - 2) + marketSessionDiagnostics;
   }

   // UI-only snapshot of the symbols selected in MT5 Market Watch.
   if(StringLen(payload) >= 2 && !suppressLivePriceTelemetry)
   {
      string marketWatchDiagnostics =
         ",\"marketWatchSymbols\":" + MarketWatchSymbolsJson() +
         ",\"marketWatchCapturedAt\":" +
         StringFormat("%I64d", (long)TimeCurrent()) + "}}";
      payload = StringSubstr(payload, 0, StringLen(payload) - 2) + marketWatchDiagnostics;
   }

   bool raceTelemetryRelevant=
      EffectiveExecutionMode()=="RACE" ||
      BasketHasRacePosition() ||
      g_raceReentryPending ||
      g_raceNewsPauseActive;
   if(raceTelemetryRelevant && StringLen(payload)>=2)
      payload=StringSubstr(payload,0,StringLen(payload)-2)+
         RaceTelemetryCurrentJsonFragment()+"}}";

   string heartbeatUrl = InpApiBase + "/api/ea/heartbeat";
   ulong heartbeatStartedMs = GetTickCount64();
   int code=InpCloudRelay
      ? CloudRelayHeartbeat(payload,response,HeartbeatHttpTimeoutMs())
      : HttpPostJsonTimeout(
           heartbeatUrl,
           payload,
           response,
           HeartbeatHttpTimeoutMs(),
           true
        );
   int webError = g_lastHttpTransportError;

   if(InpCloudRelay && code==CLOUD_RELAY_PENDING_CODE)
      return;

   // MT5 can occasionally return a non-HTTP positive value such as 1003
   // together with ERR_WEBREQUEST_REQUEST_FAILED (5203). That is transport
   // failure, not proof that SCENOVA was contacted. When flat, retry once on a
   // fresh connection. Never add this retry while live exposure exists.
   if(IsHttpTransportFailure(code,webError) && !LocalExecutionExposureActive())
   {
      Sleep(FLAT_HEARTBEAT_RETRY_DELAY_MS);
      response="";
      code=InpCloudRelay
         ? CloudRelayHeartbeat(payload,response,FLAT_HEARTBEAT_HTTP_TIMEOUT_MS)
         : HttpPostJsonTimeout(
              heartbeatUrl,
              payload,
              response,
              FLAT_HEARTBEAT_HTTP_TIMEOUT_MS,
              true
           );
      webError=g_lastHttpTransportError;
      if(InpCloudRelay && code==CLOUD_RELAY_PENDING_CODE)
         return;
   }

   g_lastHeartbeatLatencyMs = InpCloudRelay
      ? g_cloudHeartbeatLastLatencyMs
      : (long)(GetTickCount64() - heartbeatStartedMs);
   bool realHttpStatus=IsRealHttpStatus(code);
   g_lastHeartbeatHttpStatus = realHttpStatus ? code : 0;
   if(realHttpStatus)
      g_lastServerContactAt = TimeCurrent();

   if(code < 200 || code >= 300 || !realHttpStatus)
   {
      // A single Wi-Fi/ISP/API packet loss must not flap RUNNING -> STOPPED ->
      // RUNNING. Keep the last verified RUNNING authorization only for a short
      // bounded grace window. Authentication/authorization failures still fail
      // closed immediately, and the longer offline lease remains the absolute
      // access limit for all new entries.
      bool transientFailure =
         !realHttpStatus || code == 408 || code == 425 || code == 429 || code >= 500;
      int transientGraceSeconds = MathMax(9, MathMin(20, InpHeartbeatSeconds * 5));
      bool verifiedControlStillFresh =
         g_lastSuccessfulHeartbeat > 0 &&
         TimeCurrent() - g_lastSuccessfulHeartbeat <= transientGraceSeconds;

      Print("SCENOVA heartbeat failed. HTTP=", (realHttpStatus ? code : 0),
            " transportCode=", code, " error=", webError, " URL=", heartbeatUrl,
            " transient=", transientFailure, " grace=", verifiedControlStillFresh);

      if(transientFailure && verifiedControlStillFresh)
      {
         if(g_state == STATE_RUNNING && g_runAuthorized)
            g_executionStatus = "CONTROL_RETRYING";
         RenderChartStatus("RECONNECTING", clrGold, g_executionStatus);
         return;
      }

      // Beyond the short grace period, or on a real auth/control rejection,
      // fail closed for NEW entries. Existing Basket risk/profit management
      // continues locally and MT5 itself is never restarted by this logic.
      g_runAuthorized = false;
      if(g_state == STATE_RUNNING)
         g_executionStatus = "CONTROL_NOT_FRESH";

      if(code == 401 || code == 403)
      {
         RenderChartStatus("AUTH FAILED", clrTomato, "Reload the newest SCENOVA .set file");
      }
      else if(!realHttpStatus)
      {
         RenderChartStatus("NETWORK ERROR", clrTomato,
            "WebRequest " + IntegerToString(code) + "/" + IntegerToString(webError));
      }
      else
      {
         RenderChartStatus("NOT CONNECTED", clrTomato, "HTTP " + IntegerToString(code));
      }
      return;
   }

   bool firstSuccessfulHeartbeat = (g_lastSuccessfulHeartbeat <= 0);
   g_lastSuccessfulHeartbeat = TimeCurrent();
   if(firstSuccessfulHeartbeat)
      Print("SCENOVA heartbeat connected. HTTP=", code, " URL=", heartbeatUrl);
   g_access = JsonBool(response, "access", false);

   string desired = JsonString(response, "desiredState", "STOPPED");
   string command = JsonString(response, "commandName", "");
   g_serverEntrySuppressed = JsonBool(response, "entrySuppressed", false);

   ApplySettings(response);
   g_buyWinProbability = MathMax(0.0, MathMin(100.0,
      JsonNumber(response, "buyWinProbability", g_buyWinProbability)));
   g_buyWinSamples = (int)MathMax(0.0,
      JsonNumber(response, "buyWinSamples", g_buyWinSamples));
   g_sellWinProbability = MathMax(0.0, MathMin(100.0,
      JsonNumber(response, "sellWinProbability", g_sellWinProbability)));
   g_sellWinSamples = (int)MathMax(0.0,
      JsonNumber(response, "sellWinSamples", g_sellWinSamples));
   g_buyAverageNet = JsonNumber(response, "buyAverageNet", g_buyAverageNet);
   g_sellAverageNet = JsonNumber(response, "sellAverageNet", g_sellAverageNet);
   g_setupWinProbability = MathMax(0.0,MathMin(100.0,
      JsonNumber(response,"setupWinProbability",g_setupWinProbability)));
   g_setupWinSamples = (int)MathMax(0.0,
      JsonNumber(response,"setupWinSamples",g_setupWinSamples));
   g_setupAvgWin = MathMax(0.0,
      JsonNumber(response,"setupAvgWin",g_setupAvgWin));
   g_setupAvgLoss = MathMin(0.0,
      JsonNumber(response,"setupAvgLoss",g_setupAvgLoss));
   g_setupAverageNet = JsonNumber(response,"setupAverageNet",g_setupAverageNet);
   g_setupEvScore = MathMax(0.0,MathMin(100.0,
      JsonNumber(response,"setupEvScore",g_setupEvScore)));
   g_setupHistoryModel = JsonString(response,"setupModel",g_setupHistoryModel);
   g_setupHistoryRegime = JsonString(response,"setupRegime",g_setupHistoryRegime);
   g_setupHistoryDirection = (int)JsonNumber(
      response,"setupDirection",g_setupHistoryDirection
   );
   g_indicatorHistoryWinProbability = MathMax(0.0,MathMin(100.0,
      JsonNumber(response,"indicatorWinProbability",g_indicatorHistoryWinProbability)));
   g_indicatorHistorySamples = (int)MathMax(0.0,
      JsonNumber(response,"indicatorSamples",g_indicatorHistorySamples));
   g_indicatorHistoryExpectedValue =
      JsonNumber(response,"indicatorExpectedValue",g_indicatorHistoryExpectedValue);
   g_indicatorHistoryEvScore = MathMax(0.0,MathMin(100.0,
      JsonNumber(response,"indicatorEvScore",g_indicatorHistoryEvScore)));

   string realtimeStateBeforeControl = StateText();
   bool runAuthorizedBeforeControl = g_runAuthorized;

   // desiredState is authoritative. A stale START/SAFE_STOP command must never
   // override the latest state selected on the website.
   // Only an explicit website SAFE_STOP is allowed to preserve the active ZERO
   // ladder. Internal safety stops keep their original immediate-stop behavior.
   bool ownerDisabledMode=JsonBool(response,"modeDisabled",false);
   // Administrative mode shutdown must NOT preserve an unfilled ZERO GRID
   // ladder. Customer-initiated SAFE_STOP retains its original drain policy.
   if(ownerDisabledMode && desired=="RUNNING")
      desired="SAFE_STOP";
   g_safeStopDrainRequested = (g_access && desired == "SAFE_STOP" && !ownerDisabledMode);
   if(!g_access)
   {
      g_state = STATE_SAFE_STOP;
      g_runAuthorized = false;
      g_executionStatus = "NO_ACCESS";
   }
   else if(desired == "RUNNING")
   {
      if(g_dailyProfitLocked || g_dailyLossLocked)
      {
         g_state = STATE_SAFE_STOP;
         g_runAuthorized = false;
         g_executionStatus = g_dailyLossLocked
            ? "DAILY_LOSS_LOCK"
            : "DAILY_PROFIT_LOCK";
      }
      else
      {
         g_state = STATE_RUNNING;
         if(g_serverEntrySuppressed)
         {
            // First-connect prime uses the real RUNNING lifecycle once, but
            // must never authorize a market or pending entry.
            g_runAuthorized = false;
            g_lastRunAuthorization = 0;
            g_executionStatus = "FIRST_CONNECT_PRIME";
         }
         else
         {
            g_runAuthorized = true;
            g_lastRunAuthorization = TimeCurrent();
            if(!runAuthorizedBeforeControl || realtimeStateBeforeControl != "RUNNING")
            {
               g_autoFirstEntryRunStartedAt = TimeCurrent();
               g_autoFirstEntryCandidateSince = 0;
               g_autoFirstEntryCandidateLastSeenAt = 0;
               g_autoFirstEntryCandidateDirection = 0;
            }
            g_executionStatus = "EVALUATING";
         }
      }
   }
   else if(desired == "SAFE_STOP")
   {
      g_state = STATE_SAFE_STOP;
      g_runAuthorized = false;
      g_autoFirstEntryRunStartedAt = 0;
      g_autoFirstEntryCandidateSince = 0;
      g_autoFirstEntryCandidateLastSeenAt = 0;
      g_autoFirstEntryCandidateDirection = 0;
      g_executionStatus = "SAFE_STOP";
   }
   else if(desired == "STOPPED")
   {
      g_runAuthorized = false;
      g_autoFirstEntryRunStartedAt = 0;
      g_autoFirstEntryCandidateSince = 0;
      g_autoFirstEntryCandidateLastSeenAt = 0;
      g_autoFirstEntryCandidateDirection = 0;
      if(ScenovaAccountPositionCount()==0 && ScenovaAccountPendingCount()==0)
      {
         g_state = STATE_STOPPED;
         g_executionStatus = "STOPPED";
      }
      else
      {
         g_state = STATE_SAFE_STOP;
         g_executionStatus = "FORCE_FLAT_PENDING";
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

   bool commandCanAck=true;
   if(command == "CLOSE_ALL" && desired == "STOPPED")
   {
      ForceFlatResetAccount("REMOTE_CLOSE_ALL");
   }
   else if(command == "JOURNAL_REPLAY_TODAY")
   {
      commandCanAck=ReplayTodayTradeJournal();
      if(commandCanAck)
         PublishRealtimeEvent("JOURNAL_REPLAY_TODAY");
   }

   if(StateText() != realtimeStateBeforeControl)
      PublishRealtimeEvent("STATE_CHANGED");

   RenderChartStatus("CONNECTED", clrLimeGreen, g_executionStatus);

   long commandId = (long)JsonNumber(response, "commandId", 0.0);
   if(commandId > 0)
   {
      bool closeConfirmed =
         command != "CLOSE_ALL" ||
         (
            ScenovaAccountPositionCount()==0 &&
            ScenovaAccountPendingCount()==0
         );
      if(closeConfirmed && commandCanAck)
         AckCommand(commandId);
   }
}

void AckCommand(long commandId)
{
   int accountScenovaPositions=ScenovaAccountPositionCount();
   int accountScenovaPendingOrders=ScenovaAccountPendingCount();
   string payload = StringFormat(
      "{\"instanceId\":\"%s\",\"installToken\":\"%s\",\"commandId\":%I64d,\"state\":\"%s\",\"executionStatus\":\"%s\",\"accountScenovaPositions\":%d,\"accountScenovaPendingOrders\":%d,\"accountFlatConfirmed\":%s}",
      InpInstanceId,
      InpInstallToken,
      commandId,
      StateText(),
      g_executionStatus,
      accountScenovaPositions,
      accountScenovaPendingOrders,
      (accountScenovaPositions==0 && accountScenovaPendingOrders==0) ? "true" : "false"
   );
   string response = "";
   HttpPostJsonTimeout(
      InpApiBase + "/api/ea/ack",
      payload,
      response,
      ExecutionAwareHttpTimeoutMs(500)
   );
}

int CloudRelayHeartbeat(string payload,string &response,int timeoutMs)
{
   response="";

   // Cloud relay is a local file transport. Never sleep inside the MT5 event
   // handler waiting for the Worker: that can starve Timer events and create a
   // false EA-offline gap even while the Worker/API are healthy.
   if(g_cloudHeartbeatPending)
   {
      if(FileIsExist(g_cloudHeartbeatResponseFile))
      {
         int in=FileOpen(
            g_cloudHeartbeatResponseFile,
            FILE_READ|FILE_TXT|FILE_ANSI,
            0,
            CP_UTF8
         );
         if(in!=INVALID_HANDLE)
         {
            string responseId=FileReadString(in);
            string statusText=FileReadString(in);
            string body=FileReadString(in);
            FileClose(in);

            if(responseId==g_cloudHeartbeatRequestId)
            {
               g_cloudHeartbeatLastLatencyMs=
                  (long)(GetTickCount64()-g_cloudHeartbeatStartedMs);
               FileDelete(g_cloudHeartbeatResponseFile);
               FileDelete(g_cloudHeartbeatRequestFile);
               g_cloudHeartbeatPending=false;
               g_cloudHeartbeatRequestId="";
               g_cloudHeartbeatRequestFile="";
               g_cloudHeartbeatResponseFile="";
               g_cloudHeartbeatStartedMs=0;
               g_cloudHeartbeatTimeoutMs=0;
               response=body;
               g_lastHttpTransportError=0;
               return (int)StringToInteger(statusText);
            }
         }
      }

      int pendingWaitMs=MathMax(300,g_cloudHeartbeatTimeoutMs);
      ulong pendingAgeMs=GetTickCount64()-g_cloudHeartbeatStartedMs;
      if(pendingAgeMs<(ulong)pendingWaitMs)
      {
         g_lastHttpTransportError=0;
         return CLOUD_RELAY_PENDING_CODE;
      }

      g_cloudHeartbeatLastLatencyMs=(long)pendingAgeMs;
      FileDelete(g_cloudHeartbeatRequestFile);
      FileDelete(g_cloudHeartbeatResponseFile);
      g_cloudHeartbeatPending=false;
      g_cloudHeartbeatRequestId="";
      g_cloudHeartbeatRequestFile="";
      g_cloudHeartbeatResponseFile="";
      g_cloudHeartbeatStartedMs=0;
      g_cloudHeartbeatTimeoutMs=0;
      g_lastHttpTransportError=5901;
      return -1;
   }

   string chartTag=IntegerToString((long)ChartID());
   string requestId=
      IntegerToString((long)TimeLocal())+"-"+IntegerToString((long)GetTickCount64());
   // Heartbeat files are single-use. Reusing the same chart filename lets a
   // slow relay response from an older request delete or overwrite the next
   // heartbeat after the EA has already timed out. Keep requestId in the path
   // so each heartbeat owns only its own request/response pair.
   string relayTag=chartTag+"-"+requestId;
   string requestFile="scenova-hb-"+relayTag+".request.txt";
   string responseFile="scenova-hb-"+relayTag+".response.txt";

   FileDelete(responseFile);
   ResetLastError();
   int out=FileOpen(requestFile,FILE_WRITE|FILE_TXT|FILE_ANSI,0,CP_UTF8);
   if(out==INVALID_HANDLE)
   {
      g_cloudHeartbeatLastLatencyMs=0;
      g_lastHttpTransportError=GetLastError();
      return -1;
   }

   FileWriteString(out,requestId+"\r\n"+payload);
   FileFlush(out);
   FileClose(out);

   g_cloudHeartbeatPending=true;
   g_cloudHeartbeatRequestId=requestId;
   g_cloudHeartbeatRequestFile=requestFile;
   g_cloudHeartbeatResponseFile=responseFile;
   g_cloudHeartbeatStartedMs=GetTickCount64();
   g_cloudHeartbeatTimeoutMs=MathMax(300,timeoutMs);
   g_lastHttpTransportError=0;
   return CLOUD_RELAY_PENDING_CODE;
}

bool CloudRelayHeartbeatResultReady()
{
   if(!g_cloudHeartbeatPending)
      return false;
   if(FileIsExist(g_cloudHeartbeatResponseFile))
      return true;

   int waitMs=MathMax(300,g_cloudHeartbeatTimeoutMs);
   return GetTickCount64()-g_cloudHeartbeatStartedMs>=(ulong)waitMs;
}

int HttpPostJsonTimeout(
   string url,
   string payload,
   string &response,
   int timeoutMs,
   bool forceConnectionClose=false
)
{
   char data[];
   char result[];
   string resultHeaders = "";
   string headers = "Content-Type: application/json\r\nAccept: application/json\r\n";
   if(forceConnectionClose)
      headers += "Connection: close\r\n";

   ResetLastError();
   int copied = StringToCharArray(payload, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(copied <= 0)
   {
      g_lastHttpTransportError = GetLastError();
      response = "";
      return -1;
   }

   // StringToCharArray includes the terminal zero when WHOLE_ARRAY is used.
   // Do not send that byte in a JSON body.
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

   // Capture the WebRequest error BEFORE touching result[]. Converting an
   // empty response array can itself set ERR_INVALID_ARRAY (4006) and mask the
   // real network error (5200-5203).
   g_lastHttpTransportError = GetLastError();

   if(ArraySize(result) > 0)
      response = CharArrayToString(result, 0, -1, CP_UTF8);
   else
      response = "";

   return code;
}

int HttpPostJson(string url, string payload, string &response)
{
   return HttpPostJsonTimeout(url, payload, response, 1200);
}

bool PostTradeJournalDeal(ulong dealTicket)
{
   if(MQLInfoInteger(MQL_TESTER) || dealTicket == 0 || !HistoryDealSelect(dealTicket))
      return true;

   long dealEntry = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
   if(dealEntry != DEAL_ENTRY_IN &&
      dealEntry != DEAL_ENTRY_OUT &&
      dealEntry != DEAL_ENTRY_OUT_BY &&
      dealEntry != DEAL_ENTRY_INOUT)
      return true;

   long dealType = HistoryDealGetInteger(dealTicket, DEAL_TYPE);
   if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL)
      return true;

   bool isExit = dealEntry == DEAL_ENTRY_OUT ||
                 dealEntry == DEAL_ENTRY_OUT_BY ||
                 dealEntry == DEAL_ENTRY_INOUT;
   int dealDirection = dealType == DEAL_TYPE_BUY ? 1 : -1;
   int positionDirection = isExit ? -dealDirection : dealDirection;

   // Journal ownership must come from the actual MT5 deal/position history,
   // never from the mode currently selected on the website. A queued journal
   // can be flushed after the user has already changed modes.
   string journalControlMode = TradeModeForDeal(dealTicket);
   if(journalControlMode == "")
      journalControlMode = DailyRiskMode();
   HistoryDealSelect(dealTicket);

   // A customer can manually close a SCENOVA-opened position. The ownership
   // fallback above is still needed to identify the mode, but performance must
   // distinguish who actually executed this deal.
   bool executedByBot = IsScenovaMagic(
      HistoryDealGetInteger(dealTicket, DEAL_MAGIC)
   );
   string executedByBotText = executedByBot ? "true" : "false";

   double net =
      HistoryDealGetDouble(dealTicket, DEAL_PROFIT) +
      HistoryDealGetDouble(dealTicket, DEAL_SWAP) +
      HistoryDealGetDouble(dealTicket, DEAL_COMMISSION) +
      HistoryDealGetDouble(dealTicket, DEAL_FEE);

   double obQuality = positionDirection > 0
      ? g_bullishOrderBlockQuality
      : g_bearishOrderBlockQuality;
   int basketIndex = isExit
      ? BasketPositionCount() + 1
      : MathMax(1, BasketPositionCount());

   string payload = StringFormat(
      "{\"instanceId\":\"%s\",\"installToken\":\"%s\",\"dealTicket\":\"%I64d\",\"positionId\":\"%I64d\",\"eventType\":\"%s\",\"controlMode\":\"%s\",\"executedByBot\":%s,\"direction\":\"%s\",\"volume\":%.8f,\"price\":%s,\"netProfit\":%.2f,\"entryTrigger\":\"%s\",\"entryModel\":\"%s\",\"entryQuality\":\"%s\",\"entryQualityScore\":%.2f,\"marketRegime\":\"%s\",\"marketRegimeDetail\":\"%s\",\"fibSetupScore\":%.2f,\"orderBlockQuality\":%.2f,\"confidence\":%.2f,\"basketIndex\":%d}",
      InpInstanceId,
      InpInstallToken,
      (long)dealTicket,
      (long)HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID),
      isExit ? "EXIT" : "ENTRY",
      journalControlMode,
      executedByBotText,
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

   // Immutable MT5 deal timing for Performance reconstruction. Keep the raw
   // broker timestamp plus its UTC offset so replayed deals retain the exact
   // execution time instead of the later HTTP/Worker arrival time.
   long journalDealTime=(long)HistoryDealGetInteger(dealTicket,DEAL_TIME);
   long journalDealTimeMsc=(long)HistoryDealGetInteger(dealTicket,DEAL_TIME_MSC);
   long journalBrokerUtcOffsetSeconds=BrokerUtcOffsetSeconds();
   if(StringLen(payload)>=1)
   {
      string journalTimeDiagnostics=StringFormat(
         ",\"dealTime\":%I64d,\"dealTimeMsc\":%I64d,\"brokerUtcOffsetSeconds\":%I64d}",
         journalDealTime,
         journalDealTimeMsc,
         journalBrokerUtcOffsetSeconds
      );
      payload=StringSubstr(payload,0,StringLen(payload)-1)+journalTimeDiagnostics;
   }

   if(!isExit && AutoEnabled() && StringLen(payload)>=1)
   {
      AUTO_SIDE auditSide;
      AutoResetSide(auditSide,positionDirection);
      if(positionDirection>0) auditSide=g_autoBuy;
      else auditSide=g_autoSell;
      string audit=StringFormat(
         ",\"autoDecisionId\":%I64d,\"autoDecisionKind\":\"%s\",\"autoDecisionReason\":\"%s\",\"autoDirectionChangeReason\":\"%s\",\"autoAddReason\":\"%s\",\"autoBuyScore\":%.2f,\"autoSellScore\":%.2f,\"autoMomentumWithPoints\":%.2f,\"autoMomentumAgainstPoints\":%.2f,\"autoNearestSupport\":%s,\"autoNearestResistance\":%s,\"autoSupportDistanceAtr\":%.4f,\"autoResistanceDistanceAtr\":%.4f,\"autoSwingStart\":%s,\"autoSwingExtreme\":%s,\"autoPullbackRetracement\":%.4f,\"autoPullbackState\":\"%s\",\"autoTpPrice\":%s,\"autoSlPrice\":%s,\"autoRR\":%.3f,\"autoKnownCostMoney\":%.2f,\"autoExpectedProfitMoney\":%.2f,\"autoExpectedLossMoney\":%.2f,\"autoAggregateRiskMoney\":%.2f,\"modelConfidence\":%.2f,\"winProbability\":%.2f,\"winSamples\":%d,\"averageNet\":%.2f}",
         g_autoDecisionId,g_autoDecisionKind,g_autoDecisionReason,
         g_autoDirectionChangeReason,g_autoAddReason,
         g_autoBuy.rankScore,g_autoSell.rankScore,
         auditSide.momentumWithPoints,auditSide.momentumAgainstPoints,
         DoubleToString(g_autoLevels.nearestSupport,SymbolDigitsNow()),
         DoubleToString(g_autoLevels.nearestResistance,SymbolDigitsNow()),
         g_autoLevels.nearestSupportDistanceAtr,
         g_autoLevels.nearestResistanceDistanceAtr,
         DoubleToString(auditSide.pullbackSwingStart,SymbolDigitsNow()),
         DoubleToString(auditSide.pullbackSwingExtreme,SymbolDigitsNow()),
         auditSide.pullbackRetracement,auditSide.pullbackState,
         DoubleToString(auditSide.tpPrice,SymbolDigitsNow()),
         DoubleToString(auditSide.slPrice,SymbolDigitsNow()),
         auditSide.rr,auditSide.knownCostMoney,auditSide.expectedProfitMoney,
         auditSide.expectedLossMoney,g_autoAggregateRiskMoney,
         auditSide.confidence,auditSide.winProbability,auditSide.winSamples,auditSide.averageNet
      );
      payload=StringSubstr(payload,0,StringLen(payload)-1)+audit;
   }

   // Phase 5: persist RACE decision/loss/exposure context with the actual deal.
   // This is telemetry only and never participates in order execution.
   if(journalControlMode=="RACE" && StringLen(payload)>=1)
      payload=StringSubstr(payload,0,StringLen(payload)-1)+
         RaceTelemetryCurrentJsonFragment()+"}";

   if(InpCloudRelay)
   {
      if(PersistCloudJournalPayload(
         payload,
         dealTicket,
         isExit ? "EXIT" : "ENTRY"
      ))
      {
         g_journalSent++;
         return true;
      }

      g_journalFailed++;
      return false;
   }

   string response = "";
   int journalTimeoutMs=journalControlMode=="ZERO_GRID"
      ? MathMax(ZERO_GRID_JOURNAL_HTTP_TIMEOUT_MS,ExecutionAwareHttpTimeoutMs(650))
      : ExecutionAwareHttpTimeoutMs(650);
   int code=HttpPostJsonTimeout(
      InpApiBase + "/api/ea/journal",
      payload,
      response,
      journalTimeoutMs
   );
   if(code >= 200 && code < 300)
   {
      g_journalSent++;
      return true;
   }

   g_journalFailed++;
   return false;
}

bool ReplayTodayTradeJournal()
{
   if(MQLInfoInteger(MQL_TESTER))
      return true;

   datetime from=BrokerDayStart();
   datetime to=TimeCurrent();
   if(!HistorySelect(from,to))
   {
      Print("JOURNAL_REPLAY_TODAY HistorySelect failed err=",GetLastError());
      return false;
   }

   int totalDeals=HistoryDealsTotal();
   ulong dealTickets[];
   ArrayResize(dealTickets,totalDeals);
   for(int i=0;i<totalDeals;i++)
      dealTickets[i]=HistoryDealGetTicket(i);

   bool allPersisted=true;
   int eligible=0;
   int persisted=0;

   for(int i=0;i<totalDeals;i++)
   {
      ulong deal=dealTickets[i];
      if(deal==0 || !HistoryDealSelect(deal))
         continue;
      if(HistoryDealGetString(deal,DEAL_SYMBOL)!=_Symbol)
         continue;

      long entry=HistoryDealGetInteger(deal,DEAL_ENTRY);
      if(entry!=DEAL_ENTRY_IN &&
         entry!=DEAL_ENTRY_OUT &&
         entry!=DEAL_ENTRY_OUT_BY &&
         entry!=DEAL_ENTRY_INOUT)
         continue;

      long dealType=HistoryDealGetInteger(deal,DEAL_TYPE);
      if(dealType!=DEAL_TYPE_BUY && dealType!=DEAL_TYPE_SELL)
         continue;

      long magic=HistoryDealGetInteger(deal,DEAL_MAGIC);
      bool scenovaDeal=IsScenovaMagic(magic);
      if(!scenovaDeal &&
         (entry==DEAL_ENTRY_OUT ||
          entry==DEAL_ENTRY_OUT_BY ||
          entry==DEAL_ENTRY_INOUT))
      {
         scenovaDeal=IsScenovaMagic(ScenovaOwnerMagicForDeal(deal));
      }
      if(!scenovaDeal)
         continue;

      eligible++;
      if(PostTradeJournalDeal(deal))
         persisted++;
      else
         allPersisted=false;
   }

   Print(
      "JOURNAL_REPLAY_TODAY from=",TimeToString(from,TIME_DATE|TIME_SECONDS),
      " eligible=",eligible,
      " persisted=",persisted,
      " success=",allPersisted
   );
   return allPersisted;
}

bool PostRescueJournalDeal(ulong dealTicket)
{
   if(MQLInfoInteger(MQL_TESTER) || dealTicket==0 || !HistoryDealSelect(dealTicket))
      return true;

   long dealEntry=HistoryDealGetInteger(dealTicket,DEAL_ENTRY);
   if(dealEntry!=DEAL_ENTRY_IN &&
      dealEntry!=DEAL_ENTRY_OUT &&
      dealEntry!=DEAL_ENTRY_OUT_BY &&
      dealEntry!=DEAL_ENTRY_INOUT)
      return true;

   long dealType=HistoryDealGetInteger(dealTicket,DEAL_TYPE);
   if(dealType!=DEAL_TYPE_BUY && dealType!=DEAL_TYPE_SELL)
      return true;

   bool isExit=
      dealEntry==DEAL_ENTRY_OUT ||
      dealEntry==DEAL_ENTRY_OUT_BY ||
      dealEntry==DEAL_ENTRY_INOUT;
   int dealDirection=dealType==DEAL_TYPE_BUY ? 1 : -1;
   int positionDirection=isExit ? -dealDirection : dealDirection;
   double net=
      HistoryDealGetDouble(dealTicket,DEAL_PROFIT)+
      HistoryDealGetDouble(dealTicket,DEAL_SWAP)+
      HistoryDealGetDouble(dealTicket,DEAL_COMMISSION)+
      HistoryDealGetDouble(dealTicket,DEAL_FEE);
   string journalControlMode=DailyRiskMode();

   string payload=StringFormat(
      "{\"instanceId\":\"%s\",\"installToken\":\"%s\",\"dealTicket\":\"%I64d\",\"positionId\":\"%I64d\",\"eventType\":\"%s\",\"controlMode\":\"%s\",\"executedByBot\":true,\"direction\":\"%s\",\"volume\":%.8f,\"price\":%s,\"netProfit\":%.2f,\"entryTrigger\":\"RESCUE_HEDGE\",\"entryModel\":\"WEIGHT_BALANCE\",\"entryQuality\":\"R\",\"entryQualityScore\":%.2f,\"marketRegime\":\"%s\",\"marketRegimeDetail\":\"%s\",\"fibSetupScore\":%.2f,\"orderBlockQuality\":%.2f,\"confidence\":%.2f,\"basketIndex\":0}",
      InpInstanceId,
      InpInstallToken,
      (long)dealTicket,
      (long)HistoryDealGetInteger(dealTicket,DEAL_POSITION_ID),
      isExit ? "EXIT" : "ENTRY",
      journalControlMode,
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

   long rescueDealTime=(long)HistoryDealGetInteger(dealTicket,DEAL_TIME);
   long rescueDealTimeMsc=(long)HistoryDealGetInteger(dealTicket,DEAL_TIME_MSC);
   long rescueBrokerUtcOffsetSeconds=BrokerUtcOffsetSeconds();
   if(StringLen(payload)>=1)
   {
      string rescueTimeDiagnostics=StringFormat(
         ",\"dealTime\":%I64d,\"dealTimeMsc\":%I64d,\"brokerUtcOffsetSeconds\":%I64d}",
         rescueDealTime,
         rescueDealTimeMsc,
         rescueBrokerUtcOffsetSeconds
      );
      payload=StringSubstr(payload,0,StringLen(payload)-1)+rescueTimeDiagnostics;
   }

   if(InpCloudRelay)
   {
      if(PersistCloudJournalPayload(
         payload,
         dealTicket,
         isExit ? "EXIT" : "ENTRY"
      ))
      {
         g_journalSent++;
         return true;
      }

      g_journalFailed++;
      return false;
   }

   string response="";
   int code=HttpPostJsonTimeout(
      InpApiBase+"/api/ea/journal",
      payload,
      response,
      ExecutionAwareHttpTimeoutMs(650)
   );
   if(code>=200 && code<300)
   {
      g_journalSent++;
      return true;
   }

   g_journalFailed++;
   return false;
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
   g_basketJournalMarketCycle = "INITIALIZING";
   g_basketJournalPrecisionState = "LEGACY";
   g_basketJournalLiquidityState = "NONE";
   g_basketJournalMicroStructureState = "NEUTRAL";
   g_basketJournalFvgState = "NONE";
   g_basketJournalPrecisionScore = 50.0;
   g_basketJournalEntryDistanceAtr = 0.0;
   g_basketJournalSetupEvScore = 50.0;
   g_basketJournalIndicatorLocation = 50.0;
   g_basketJournalIndicatorMomentum = 50.0;
   g_basketJournalIndicatorStructure = 50.0;
   g_basketJournalIndicatorVolatility = 50.0;
   g_basketJournalIndicatorExecution = 50.0;
   g_basketJournalIndicatorCostSpace = 50.0;
   g_basketJournalIndicatorComposite = 50.0;
   g_basketJournalVolumeProfileState = "DATA_NOT_READY";
   g_basketJournalSqueezeState = "NORMAL";
   g_basketJournalMacdState = "NEUTRAL";
   g_basketJournalLevelFlipState = "NONE";
   g_basketJournalPremiumDiscountState = "EQUILIBRIUM";
   g_basketJournalAutoDecisionId = 0;
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
      g_basketJournalMarketCycle = g_marketCycleState;
      g_basketJournalPrecisionState = g_entryPrecisionState;
      g_basketJournalLiquidityState = g_liquidityState;
      g_basketJournalMicroStructureState = g_microStructureState;
      g_basketJournalFvgState = g_fvgState;
      g_basketJournalPrecisionScore = g_entryPrecisionScore;
      g_basketJournalEntryDistanceAtr = g_entryDistanceAtr;
      g_basketJournalSetupEvScore = g_setupEvScore;
      g_basketJournalIndicatorLocation = g_indicatorLocationScore;
      g_basketJournalIndicatorMomentum = g_indicatorMomentumScore;
      g_basketJournalIndicatorStructure = g_indicatorStructureScore;
      g_basketJournalIndicatorVolatility = g_indicatorVolatilityScore;
      g_basketJournalIndicatorExecution = g_indicatorExecutionScore;
      g_basketJournalIndicatorCostSpace = g_indicatorCostSpaceScore;
      g_basketJournalIndicatorComposite = g_indicatorCompositeScore;
      g_basketJournalVolumeProfileState = g_volumeProfileState;
      g_basketJournalSqueezeState = g_squeezeState;
      g_basketJournalMacdState = g_macdState;
      g_basketJournalLevelFlipState = g_levelFlipState;
      g_basketJournalPremiumDiscountState = g_premiumDiscountState;
      g_basketJournalAutoDecisionId = AutoEnabled() ? g_autoDecisionId : 0;
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
   g_basketJournalMarketCycle = g_marketCycleState;
   g_basketJournalPrecisionState = g_entryPrecisionState;
   g_basketJournalLiquidityState = g_liquidityState;
   g_basketJournalMicroStructureState = g_microStructureState;
   g_basketJournalFvgState = g_fvgState;
   g_basketJournalPrecisionScore = g_entryPrecisionScore;
   g_basketJournalEntryDistanceAtr = g_entryDistanceAtr;
   g_basketJournalSetupEvScore = g_setupEvScore;
   g_basketJournalIndicatorLocation = g_indicatorLocationScore;
   g_basketJournalIndicatorMomentum = g_indicatorMomentumScore;
   g_basketJournalIndicatorStructure = g_indicatorStructureScore;
   g_basketJournalIndicatorVolatility = g_indicatorVolatilityScore;
   g_basketJournalIndicatorExecution = g_indicatorExecutionScore;
   g_basketJournalIndicatorCostSpace = g_indicatorCostSpaceScore;
   g_basketJournalIndicatorComposite = g_indicatorCompositeScore;
   g_basketJournalVolumeProfileState = g_volumeProfileState;
   g_basketJournalSqueezeState = g_squeezeState;
   g_basketJournalMacdState = g_macdState;
   g_basketJournalLevelFlipState = g_levelFlipState;
   g_basketJournalPremiumDiscountState = g_premiumDiscountState;
   g_basketJournalAutoDecisionId = 0;
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
   g_pendingBasketMarketCycle = g_basketJournalMarketCycle;
   g_pendingBasketPrecisionState = g_basketJournalPrecisionState;
   g_pendingBasketLiquidityState = g_basketJournalLiquidityState;
   g_pendingBasketMicroStructureState = g_basketJournalMicroStructureState;
   g_pendingBasketFvgState = g_basketJournalFvgState;
   g_pendingBasketPrecisionScore = g_basketJournalPrecisionScore;
   g_pendingBasketEntryDistanceAtr = g_basketJournalEntryDistanceAtr;
   g_pendingBasketSetupEvScore = g_basketJournalSetupEvScore;
   g_pendingBasketIndicatorLocation = g_basketJournalIndicatorLocation;
   g_pendingBasketIndicatorMomentum = g_basketJournalIndicatorMomentum;
   g_pendingBasketIndicatorStructure = g_basketJournalIndicatorStructure;
   g_pendingBasketIndicatorVolatility = g_basketJournalIndicatorVolatility;
   g_pendingBasketIndicatorExecution = g_basketJournalIndicatorExecution;
   g_pendingBasketIndicatorCostSpace = g_basketJournalIndicatorCostSpace;
   g_pendingBasketIndicatorComposite = g_basketJournalIndicatorComposite;
   g_pendingBasketVolumeProfileState = g_basketJournalVolumeProfileState;
   g_pendingBasketSqueezeState = g_basketJournalSqueezeState;
   g_pendingBasketMacdState = g_basketJournalMacdState;
   g_pendingBasketLevelFlipState = g_basketJournalLevelFlipState;
   g_pendingBasketPremiumDiscountState = g_basketJournalPremiumDiscountState;
   g_pendingBasketAutoDecisionId = g_basketJournalAutoDecisionId;
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

   string pendingControlMode=TradeModeForDeal((ulong)g_pendingBasketId);
   if(pendingControlMode=="")
      pendingControlMode=DailyRiskMode();

   string payload = StringFormat(
      "{\"instanceId\":\"%s\",\"installToken\":\"%s\",\"dealTicket\":\"%I64d\",\"eventType\":\"BASKET\",\"controlMode\":\"%s\",\"direction\":\"%s\",\"volume\":%.8f,\"price\":0,\"netProfit\":%.2f,\"entryTrigger\":\"%s\",\"entryModel\":\"%s\",\"entryQuality\":\"%s\",\"entryQualityScore\":%.2f,\"marketRegime\":\"%s\",\"marketRegimeDetail\":\"%s\",\"fibSetupScore\":%.2f,\"orderBlockQuality\":%.2f,\"confidence\":%.2f,\"basketIndex\":%d,\"symbol\":\"%s\",\"brokerServer\":\"%s\",\"startedAt\":%I64d,\"endedAt\":%I64d,\"peakPositions\":%d,\"sessionProfile\":\"%s\",\"journalSchema\":5,\"marketCycleState\":\"%s\",\"entryPrecisionState\":\"%s\",\"liquidityState\":\"%s\",\"microStructureState\":\"%s\",\"fvgState\":\"%s\",\"entryPrecisionScore\":%.2f,\"entryDistanceAtr\":%.4f,\"setupEvScore\":%.2f,\"indicatorLocationScore\":%.2f,\"indicatorMomentumScore\":%.2f,\"indicatorStructureScore\":%.2f,\"indicatorVolatilityScore\":%.2f,\"indicatorExecutionScore\":%.2f,\"indicatorCostSpaceScore\":%.2f,\"indicatorCompositeScore\":%.2f,\"volumeProfileState\":\"%s\",\"squeezeState\":\"%s\",\"macdState\":\"%s\",\"levelFlipState\":\"%s\",\"premiumDiscountState\":\"%s\"}",
      InpInstanceId,
      InpInstallToken,
      g_pendingBasketId,
      pendingControlMode,
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
      g_pendingBasketSession,
      g_pendingBasketMarketCycle,
      g_pendingBasketPrecisionState,
      g_pendingBasketLiquidityState,
      g_pendingBasketMicroStructureState,
      g_pendingBasketFvgState,
      g_pendingBasketPrecisionScore,
      g_pendingBasketEntryDistanceAtr,
      g_pendingBasketSetupEvScore,
      g_pendingBasketIndicatorLocation,
      g_pendingBasketIndicatorMomentum,
      g_pendingBasketIndicatorStructure,
      g_pendingBasketIndicatorVolatility,
      g_pendingBasketIndicatorExecution,
      g_pendingBasketIndicatorCostSpace,
      g_pendingBasketIndicatorComposite,
      g_pendingBasketVolumeProfileState,
      g_pendingBasketSqueezeState,
      g_pendingBasketMacdState,
      g_pendingBasketLevelFlipState,
      g_pendingBasketPremiumDiscountState
   );

   if(g_pendingBasketAutoDecisionId>0 && StringLen(payload)>=1)
   {
      string audit=StringFormat(",\"autoDecisionId\":%I64d}",g_pendingBasketAutoDecisionId);
      payload=StringSubstr(payload,0,StringLen(payload)-1)+audit;
   }

   string response = "";
   if(pendingControlMode=="ZERO_GRID")
      g_lastZeroGridJournalAttemptMs=GetTickCount64();
   int journalTimeoutMs=pendingControlMode=="ZERO_GRID"
      ? MathMax(ZERO_GRID_JOURNAL_HTTP_TIMEOUT_MS,ExecutionAwareHttpTimeoutMs(650))
      : ExecutionAwareHttpTimeoutMs(650);
   int code=HttpPostJsonTimeout(
      InpApiBase + "/api/ea/journal",
      payload,
      response,
      journalTimeoutMs
   );
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

bool LegacyBasketEngineEnabled()
{
   // MANUAL/ASSISTED own the legacy basket queue. AUTO is a different
   // execution owner and must never share the queue with them.
   return EffectiveExecutionMode() == "MANUAL";
}

void ResetLegacyBurstStateForIsolatedMode()
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

void ApplyUnifiedTradingEngine()
{
   // One transparent engine for every account. Users control Lot, direction,
   // position count and exits; these internal values no longer change behind a
   // hidden trading profile.
   g_adaptiveEngine = true;
   g_maxAtrPoints = 0.0;
   g_minOrderIntervalMs = 300;
   g_maxOrdersPerMinute = 120;
   // Brain V8: Confidence + Structure are mandatory hard gates for every new Basket.
   g_confidenceThreshold = 55;
   g_confidenceGateEnabled = true;
   g_confidenceThreshold = (int)MathMax(56.0, (double)g_confidenceThreshold);
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
   string previousDailyRiskMode=DailyRiskMode();
   double previousDailyProfitTarget=EffectiveDailyProfitTarget();
   double previousDailyLossLimit=EffectiveDailyLossLimit();
   bool previousDailyContinueAfterTarget = g_dailyProfitContinueAfterTarget;

   g_lot = MathMax(0.01, JsonNumber(json, "lot", g_lot));
   g_maxPositions = (int)MathMax(1.0, JsonNumber(json, "maxPositions", g_maxPositions));
   g_triggerMoney = MathMax(0.0, JsonNumber(json, "basketTriggerMoney", g_triggerMoney));
   g_trailMoney = MathMax(0.0, JsonNumber(json, "basketTrailMoney", g_trailMoney));
   g_maxBasketLoss = MathMax(0.0, JsonNumber(json, "maxBasketLossMoney", g_maxBasketLoss));
   g_dailyLoss = MathMax(0.0, JsonNumber(json, "dailyLossMoney", g_dailyLoss));
   g_dailyProfitTarget = MathMax(0.0, JsonNumber(json, "dailyProfitTargetMoney", g_dailyProfitTarget));

   g_autoMaxBasketLoss = MathMax(0.0, JsonNumber(json, "autoMaxBasketLossMoney", g_autoMaxBasketLoss));
   g_autoDailyLoss = MathMax(0.0, JsonNumber(json, "autoDailyLossMoney", g_autoDailyLoss));
   g_autoDailyProfitTarget = MathMax(0.0, JsonNumber(json, "autoDailyProfitTargetMoney", g_autoDailyProfitTarget));
   g_raceMaxBasketLoss = MathMax(0.0, JsonNumber(json, "raceMaxBasketLossMoney", g_raceMaxBasketLoss));
   g_raceDailyLoss = MathMax(0.0, JsonNumber(json, "raceDailyLossMoney", g_raceDailyLoss));
   g_raceDailyProfitTarget = MathMax(0.0, JsonNumber(json, "raceDailyProfitTargetMoney", g_raceDailyProfitTarget));
   g_flipLockMaxBasketLoss = MathMax(0.0, JsonNumber(json, "flipLockMaxBasketLossMoney", g_flipLockMaxBasketLoss));
   g_flipLockDailyLoss = MathMax(0.0, JsonNumber(json, "flipLockDailyLossMoney", g_flipLockDailyLoss));
   g_flipLockDailyProfitTarget = MathMax(0.0, JsonNumber(json, "flipLockDailyProfitTargetMoney", g_flipLockDailyProfitTarget));
   g_manualMaxBasketLoss = MathMax(0.0, JsonNumber(json, "manualMaxBasketLossMoney", g_manualMaxBasketLoss));
   g_manualDailyLoss = MathMax(0.0, JsonNumber(json, "manualDailyLossMoney", g_manualDailyLoss));
   g_manualDailyProfitTarget = MathMax(0.0, JsonNumber(json, "manualDailyProfitTargetMoney", g_manualDailyProfitTarget));

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

   if(g_profitTargetMode == "OFF")
   {
      g_basketProfitTarget = 0.0;
      g_perPositionProfit = 0.0;
      g_profitRunTrailPercent = 0.0;
      g_triggerMoney = 0.0;
      g_trailMoney = 0.0;
      g_burstTargetMoney = 0.0;
   }
   else if(g_profitTargetMode == "AUTO")
   {
      // Preserve the explicit Basket money target in AUTO. It is checked as a
      // hard close condition before any Vector Edge/smart-profit management.
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
      // Reaching a MANUAL Basket target closes immediately. No percentage
      // giveback/run-on is allowed to delay the close.
      g_profitRunTrailPercent = 0.0;
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
   string indicatorMode = JsonString(json, "indicatorV6Mode", "");
   StringToUpper(indicatorMode);
   if(indicatorMode=="SHADOW") g_indicatorV6Mode=INDICATOR_V6_SHADOW;
   else if(indicatorMode=="TIMING") g_indicatorV6Mode=INDICATOR_V6_TIMING;
   else if(indicatorMode=="ADAPTIVE") g_indicatorV6Mode=INDICATOR_V6_ADAPTIVE;
   else if(indicatorMode=="SOFT_WEIGHT") g_indicatorV6Mode=INDICATOR_V6_SOFT_WEIGHT;
   g_indicatorActivationStage=IndicatorV6ModeName();
   g_lastAdaptiveEvaluation = 0;
   g_lastIndicatorV6RefreshAt = 0;

   g_raceCloseAllProfitEnabled = JsonBool(json, "raceCloseAllProfitEnabled", g_raceCloseAllProfitEnabled);
   g_raceCloseAllProfitMoney = MathMax(0.01, JsonNumber(json, "raceCloseAllProfitMoney", g_raceCloseAllProfitMoney));
   g_racePerPositionProfitMoney = MathMax(0.01, JsonNumber(json, "racePerPositionProfitMoney", g_racePerPositionProfitMoney));
   g_counterPerPositionProfitMoney = MathMax(0.01, JsonNumber(json, "counterPerPositionProfitMoney", g_counterPerPositionProfitMoney));
   string requestedRaceProfitMode = JsonString(json, "raceProfitTargetMode", "");
   StringToUpper(requestedRaceProfitMode);
   if(requestedRaceProfitMode == "BASKET" ||
      requestedRaceProfitMode == "POSITION" ||
      requestedRaceProfitMode == "OFF")
      g_raceProfitTargetMode = requestedRaceProfitMode;
   else
      g_raceProfitTargetMode = g_raceCloseAllProfitEnabled ? "BASKET" : "OFF";
   g_raceCloseAllProfitEnabled = g_raceProfitTargetMode == "BASKET";

   g_zeroGridFirstGapPrice = ZeroGridAllowedFirstGap(JsonNumber(json, "zeroGridFirstGapPrice", g_zeroGridFirstGapPrice));
   g_zeroGridStepPrice = ZeroGridAllowedStep(JsonNumber(json, "zeroGridStepPrice", g_zeroGridStepPrice));
   g_zeroGridLevelsPerSide = (int)MathMax(1.0,MathMin((double)ZERO_GRID_MAX_LEVELS,MathRound(JsonNumber(json, "zeroGridLevelsPerSide", g_zeroGridLevelsPerSide))));
   g_zeroGridBaseLot = ZeroGridAllowedBaseLot(JsonNumber(json, "zeroGridBaseLot", g_zeroGridBaseLot));
   g_zeroGridMinNetProfitMoney = MathMax(0.01, JsonNumber(json, "zeroGridMinNetProfitMoney", g_zeroGridMinNetProfitMoney));
   g_zeroGridCloseReserveMoney = MathMax(0.0, JsonNumber(json, "zeroGridCloseReserveMoney", g_zeroGridCloseReserveMoney));

   string requestedEngineMode = JsonString(json, "engineMode", "");
   StringToUpper(requestedEngineMode);
   bool hasEngineMode = requestedEngineMode == "AUTO" || requestedEngineMode == "RACE" || requestedEngineMode == "COUNTER" || requestedEngineMode == "ZERO_GRID";

   string requestedControlMode = JsonString(json, "controlMode", "");
   StringToUpper(requestedControlMode);
   bool hasControlMode =
      requestedControlMode == "AUTO" || requestedControlMode == "RACE" ||
      requestedControlMode == "COUNTER" || requestedControlMode == "ZERO_GRID" || requestedControlMode == "FLIP_LOCK" ||
      requestedControlMode == "ASSISTED" ||
      requestedControlMode == "MANUAL" || requestedControlMode == "LEGACY";

   // Hard isolation: one execution owner at a time. controlMode is authoritative
   // when both are present; partial/legacy payloads are normalized immediately.
   if(hasControlMode)
   {
      g_controlMode = requestedControlMode;
      if(g_controlMode == "ZERO_GRID") g_engineMode = "ZERO_GRID";
      else if(g_controlMode == "RACE") g_engineMode = "RACE";
      else if(g_controlMode == "COUNTER") g_engineMode = "COUNTER";
      else g_engineMode = "AUTO";
   }
   else if(hasEngineMode)
   {
      g_engineMode = requestedEngineMode;
      if(g_engineMode == "ZERO_GRID") g_controlMode = "ZERO_GRID";
      else if(g_engineMode == "RACE") g_controlMode = "RACE";
      else if(g_engineMode == "COUNTER") g_controlMode = "COUNTER";
      else if(g_controlMode == "ZERO_GRID" || g_controlMode == "RACE" || g_controlMode == "COUNTER" || g_controlMode == "LEGACY") g_controlMode = "AUTO";
   }

   // A valid Server-delivered mode is the startup ownership latch.
   if(hasControlMode || hasEngineMode)
      g_settingsSynchronized = true;

   // Adaptive Rescue / Recovery is disabled for every control mode.
   // AUTO/RACE/MANUAL must never open an opposite-side SCNRescue position.
   g_rescueEnabled = false;

   // FLIP LOCK remains its own intentional reversal engine.
   if(g_controlMode == "FLIP_LOCK")
   {
      g_maxPositions = 1;
      g_profitTargetMode = "OFF";
      g_dailyProfitContinueAfterTarget = false;
      g_dailyProfitDrawdownPercent = 0.0;
   }

   // AUTO and each isolated engine are distinct owners. The MANUAL legacy
   // queue must never survive a transition into AUTO/RACE/COUNTER/ZERO/FLIP.
   if(EffectiveExecutionMode() != "MANUAL")
      ResetLegacyBurstStateForIsolatedMode();

   string mode = JsonString(json, "entryMode", "");
   if(mode == "BUY_ONLY") g_entryMode = ENTRY_BUY_ONLY;
   else if(mode == "SELL_ONLY") g_entryMode = ENTRY_SELL_ONLY;
   else if(mode == "AUTO_MOMENTUM") g_entryMode = ENTRY_AUTO_MOMENTUM;

   ApplyUnifiedTradingEngine();

   RecalculateDailyClosedProfit();
   LoadDailyProfitRunOnState();
   LoadDailyProfitLock();
   LoadDailyLossLock();

   double activeDailyProfitTarget=EffectiveDailyProfitTarget();
   double activeDailyLossLimit=EffectiveDailyLossLimit();
   bool dailyProfitSettingsChanged =
      previousDailyRiskMode!=DailyRiskMode() ||
      MathAbs(previousDailyProfitTarget-activeDailyProfitTarget)>0.0000001 ||
      previousDailyContinueAfterTarget!=g_dailyProfitContinueAfterTarget;

   if(g_dailyProfitLocked &&
      dailyProfitSettingsChanged &&
      (activeDailyProfitTarget<=0.0 || DailyBotProfit()<activeDailyProfitTarget))
      UnlockDailyProfitLock("DAILY_TARGET_UPDATED");

   if(g_dailyProfitTargetArmed &&
      (activeDailyProfitTarget<=0.0 || DailyBotProfit()<activeDailyProfitTarget))
      DisarmDailyProfitRunOn();

   bool dailyLossSettingsChanged =
      previousDailyRiskMode!=DailyRiskMode() ||
      MathAbs(previousDailyLossLimit-activeDailyLossLimit)>0.0000001;
   if(g_dailyLossLocked &&
      dailyLossSettingsChanged &&
      (activeDailyLossLimit<=0.0 || DailyBotProfit()>-activeDailyLossLimit))
      UnlockDailyLossLock("DAILY_LOSS_LIMIT_UPDATED");
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

int DisplayTimeframeTrend(
   ENUM_TIMEFRAMES timeframe,
   int emaDirection,
   int legacyDirection
)
{
   // UI-only trend view. This deliberately does NOT feed AUTO/RACE decisions.
   // It reacts faster than the legacy 12/26 closed-bar average by combining
   // live price action, recent market structure and the existing EMA stack.
   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   if(CopyRates(_Symbol,timeframe,0,7,rates)<7)
      return emaDirection!=0 ? emaDirection : legacyDirection;

   double atrPrice=MathMax(
      _Point*4.0,
      AverageTrueRangePoints(timeframe,g_atrPeriod)*_Point
   );
   int score=0;

   // EMA stack is useful context, but it cannot overrule fresh structure alone.
   if(emaDirection>0) score+=2;
   else if(emaDirection<0) score-=2;

   // Compare the two most recent completed candles with the two before them.
   double recentHigh=MathMax(rates[1].high,rates[2].high);
   double recentLow=MathMin(rates[1].low,rates[2].low);
   double priorHigh=MathMax(rates[3].high,rates[4].high);
   double priorLow=MathMin(rates[3].low,rates[4].low);

   bool higherHigh=recentHigh>priorHigh+atrPrice*0.03;
   bool higherLow=recentLow>priorLow+atrPrice*0.03;
   bool lowerHigh=recentHigh<priorHigh-atrPrice*0.03;
   bool lowerLow=recentLow<priorLow-atrPrice*0.03;

   if(higherHigh && higherLow) score+=3;
   else
   {
      if(higherHigh) score++;
      if(higherLow) score++;
   }

   if(lowerHigh && lowerLow) score-=3;
   else
   {
      if(lowerHigh) score--;
      if(lowerLow) score--;
   }

   // Recent closes include the forming candle, so the display can reflect a
   // real-time turn instead of waiting for the whole timeframe to close.
   double recentCloseAvg=(rates[0].close+rates[1].close+rates[2].close)/3.0;
   double priorCloseAvg=(rates[3].close+rates[4].close+rates[5].close)/3.0;
   if(recentCloseAvg>priorCloseAvg+atrPrice*0.05) score+=2;
   else if(recentCloseAvg<priorCloseAvg-atrPrice*0.05) score-=2;

   double liveBody=rates[0].close-rates[0].open;
   if(liveBody>atrPrice*0.08) score++;
   else if(liveBody<-atrPrice*0.08) score--;

   // Legacy trend is only a light tie-breaker for the UI.
   if(legacyDirection>0) score++;
   else if(legacyDirection<0) score--;

   if(score>=2) return 1;
   if(score<=-2) return -1;
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

bool AdxSnapshotAt(
   ENUM_TIMEFRAMES timeframe,
   int shift,
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
      CopyBuffer(handle,0,MathMax(1,shift),1,adx) == 1 &&
      CopyBuffer(handle,1,MathMax(1,shift),1,plusDi) == 1 &&
      CopyBuffer(handle,2,MathMax(1,shift),1,minusDi) == 1;
   if(ok)
   {
      adxOut = adx[0];
      plusDiOut = plusDi[0];
      minusDiOut = minusDi[0];
   }
   IndicatorRelease(handle);
   return ok;
}

bool AdxSnapshot(
   ENUM_TIMEFRAMES timeframe,
   double &adxOut,
   double &plusDiOut,
   double &minusDiOut
)
{
   return AdxSnapshotAt(timeframe,1,adxOut,plusDiOut,minusDiOut);
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

string ZoneQualityLabel(double score)
{
   if(score >= 90.0) return "STRONG";
   if(score >= 75.0) return "GOOD";
   if(score >= 55.0) return "MODERATE";
   return score > 0.0 ? "SUPPORTING" : "WEAK";
}

double ZoneTouchVolumeScore(int direction,double zoneLow,double zoneHigh)
{
   if(zoneLow <= 0.0 || zoneHigh < zoneLow)
      return 0.0;

   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   int copied = CopyRates(_Symbol,PERIOD_M5,1,30,rates);
   if(copied < 10)
      return 0.0;

   double averageVolume = 0.0;
   for(int i=0;i<copied;i++)
      averageVolume += (double)MathMax((long)1,rates[i].tick_volume);
   averageVolume /= copied;

   double bestRatio = 0.0;
   for(int i=0;i<MathMin(copied,10);i++)
   {
      bool touched = rates[i].low <= zoneHigh && rates[i].high >= zoneLow;
      if(!touched)
         continue;
      double ratio = (double)MathMax((long)1,rates[i].tick_volume) /
         MathMax(1.0,averageVolume);
      bestRatio = MathMax(bestRatio,ratio);
   }

   if(bestRatio >= 1.80) return 10.0;
   if(bestRatio >= 1.35) return 8.0;
   if(bestRatio >= 1.05) return 6.0;
   if(bestRatio > 0.0) return 3.0;
   return 0.0;
}

double ZoneEngineScore(int direction)
{
   MqlTick tick;
   if(direction == 0 || !SymbolInfoTick(_Symbol,tick))
      return 0.0;

   double price = (tick.bid + tick.ask) * 0.5;
   double atrPrice = MathMax(
      _Point * 12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod) * _Point
   );

   bool demand = direction > 0;
   double obLow = demand ? g_bullishOrderBlockLow : g_bearishOrderBlockLow;
   double obHigh = demand ? g_bullishOrderBlockHigh : g_bearishOrderBlockHigh;
   double obStrength = demand ? g_bullishOrderBlockStrength : g_bearishOrderBlockStrength;
   int mitigations = demand ? g_bullishOrderBlockMitigations : g_bearishOrderBlockMitigations;
   int ageBars = demand ? g_bullishOrderBlockAgeBars : g_bearishOrderBlockAgeBars;
   double level = demand ? g_nearestSupport : g_nearestResistance;
   double majorLevel = demand ? g_majorSupport : g_majorResistance;
   double levelStrength = demand ? g_supportStrength : g_resistanceStrength;

   double zoneLow = obLow;
   double zoneHigh = obHigh;
   bool hasOrderBlock = zoneLow > 0.0 && zoneHigh >= zoneLow;
   if(!hasOrderBlock && level > 0.0)
   {
      zoneLow = level - atrPrice * (demand ? 0.10 : 0.07);
      zoneHigh = level + atrPrice * (demand ? 0.07 : 0.10);
   }

   if(demand)
   {
      g_demandZoneLow = zoneLow;
      g_demandZoneHigh = zoneHigh;
   }
   else
   {
      g_supplyZoneLow = zoneLow;
      g_supplyZoneHigh = zoneHigh;
   }

   if(zoneLow <= 0.0 || zoneHigh < zoneLow)
      return 0.0;

   double widthAtr = (zoneHigh-zoneLow) / MathMax(_Point,atrPrice);
   double baseScore = hasOrderBlock
      ? (widthAtr <= 0.45 ? 18.0 : widthAtr <= 0.75 ? 14.0 : 10.0)
      : 8.0;

   double departureScore = hasOrderBlock
      ? MathMin(22.0,MathMax(0.0,obStrength)*0.22)
      : MathMin(12.0,MathMax(0.0,levelStrength)*0.12);

   double freshnessScore = hasOrderBlock
      ? (ageBars <= 8 ? 15.0 : ageBars <= 20 ? 12.0 : ageBars <= 45 ? 8.0 : 4.0)
      : 5.0;
   double mitigationScore = hasOrderBlock
      ? (mitigations <= 0 ? 13.0 : mitigations == 1 ? 10.0 : mitigations <= 3 ? 6.0 : 2.0)
      : 4.0;

   double rejectionBuffer = atrPrice * 0.12;
   bool wickRejected = RecentDirectionalRejection(
      direction,zoneLow,zoneHigh,rejectionBuffer
   );
   double wickScore = wickRejected ? 10.0 : 0.0;

   double volumeScore = ZoneTouchVolumeScore(direction,zoneLow,zoneHigh);

   double overlapScore = 0.0;
   if(level > 0.0 && MathAbs(level-(zoneLow+zoneHigh)*0.5) <= atrPrice*0.35)
      overlapScore += 6.0;
   if(majorLevel > 0.0 && MathAbs(majorLevel-(zoneLow+zoneHigh)*0.5) <= atrPrice*0.50)
      overlapScore += 4.0;

   bool fibOverlap = demand
      ? ((g_fibM5Direction < 0 && g_fibM5Retracement <= 0.236) ||
         (g_fibM15Direction < 0 && g_fibM15Retracement <= 0.236) ||
         (g_fibM5Direction > 0 && g_fibM5Retracement >= 0.50 && g_fibM5Retracement <= 0.786) ||
         (g_fibM15Direction > 0 && g_fibM15Retracement >= 0.50 && g_fibM15Retracement <= 0.786))
      : ((g_fibM5Direction > 0 && g_fibM5Retracement <= 0.236) ||
         (g_fibM15Direction > 0 && g_fibM15Retracement <= 0.236) ||
         (g_fibM5Direction < 0 && g_fibM5Retracement >= 0.50 && g_fibM5Retracement <= 0.786) ||
         (g_fibM15Direction < 0 && g_fibM15Retracement >= 0.50 && g_fibM15Retracement <= 0.786));
   if(fibOverlap)
      overlapScore += 5.0;

   double paScore = demand ? g_priceActionBuyScore : g_priceActionSellScore;
   if(paScore >= 28.0)
      overlapScore += 3.0;

   if(demand)
   {
      g_demandBaseScore = baseScore;
      g_demandDepartureScore = departureScore;
      g_demandFreshnessScore = freshnessScore;
      g_demandMitigationScore = mitigationScore;
      g_demandWickScore = wickScore;
      g_demandVolumeScore = volumeScore;
      g_demandOverlapScore = overlapScore;
   }
   else
   {
      g_supplyBaseScore = baseScore;
      g_supplyDepartureScore = departureScore;
      g_supplyFreshnessScore = freshnessScore;
      g_supplyMitigationScore = mitigationScore;
      g_supplyWickScore = wickScore;
      g_supplyVolumeScore = volumeScore;
      g_supplyOverlapScore = overlapScore;
   }

   double proximity = PriceInsideOrNearZone(price,zoneLow,zoneHigh,atrPrice*0.18)
      ? 8.0
      : (MathAbs(price-(zoneLow+zoneHigh)*0.5) <= atrPrice*0.55 ? 4.0 : 0.0);

   return MathMax(0.0,MathMin(100.0,
      baseScore + departureScore + freshnessScore + mitigationScore +
      wickScore + volumeScore + overlapScore + proximity
   ));
}

double DemandSupplyZoneScore(int direction)
{
   double score = ZoneEngineScore(direction);
   if(score <= 0.0)
      return 0.0;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return score;

   double price = (tick.bid + tick.ask) * 0.5;
   double atrPrice = MathMax(
      _Point * 12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod) * _Point
   );

   // Indicators are weighted confluence only. None of RSI/ADX/VWAP is a gate.
   double divergence = RsiDivergenceScore(direction);
   score += MathMin(8.0,divergence*0.45);

   if(direction > 0)
   {
      if(g_rsiM5 <= 38.0) score += 4.0;
      if(g_vwapM5 > 0.0 && price < g_vwapM5-atrPrice*0.45) score += 4.0;
      if(g_emaReclaimState == "RECLAIM_EMA21_UP") score += 5.0;
      if(g_plusDiM5 > 0.0 && g_minusDiM5 <= g_plusDiM5*1.25) score += 3.0;
   }
   else
   {
      if(g_rsiM5 >= 62.0) score += 4.0;
      if(g_vwapM5 > 0.0 && price > g_vwapM5+atrPrice*0.45) score += 4.0;
      if(g_emaReclaimState == "LOSE_EMA21_DOWN") score += 5.0;
      if(g_minusDiM5 > 0.0 && g_plusDiM5 <= g_minusDiM5*1.25) score += 3.0;
   }

   if(g_adxM5 > 0.0 && g_adxM5 < 24.0)
      score += 2.0;

   return MathMax(0.0,MathMin(100.0,score));
}



string IndicatorV6ModeName()
{
   if(g_indicatorV6Mode==INDICATOR_V6_SHADOW) return "SHADOW";
   if(g_indicatorV6Mode==INDICATOR_V6_TIMING) return "TIMING";
   if(g_indicatorV6Mode==INDICATOR_V6_ADAPTIVE) return "ADAPTIVE";
   return "SOFT_WEIGHT";
}

double ClampScore(double value)
{
   return MathMax(0.0,MathMin(100.0,value));
}

double ScoreContribution(double score,double maxAbs)
{
   return MathMax(-maxAbs,MathMin(maxAbs,(score-50.0)/50.0*maxAbs));
}

bool VolumeProfileSnapshot(
   int bars,
   double &pocOut,
   double &vahOut,
   double &valOut,
   double &hvnOut,
   double &lvnOut
)
{
   pocOut=0.0; vahOut=0.0; valOut=0.0; hvnOut=0.0; lvnOut=0.0;
   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   int requested=MathMax(48,MathMin(480,bars));
   int copied=CopyRates(_Symbol,PERIOD_M5,1,requested,rates);
   if(copied<32)
      return false;

   double low=rates[0].low, high=rates[0].high;
   for(int i=1;i<copied;i++)
   {
      low=MathMin(low,rates[i].low);
      high=MathMax(high,rates[i].high);
   }
   double span=high-low;
   if(span<=_Point*8.0)
      return false;

   #define VP_BINS 32
   double bins[VP_BINS];
   ArrayInitialize(bins,0.0);
   double total=0.0;
   for(int i=0;i<copied;i++)
   {
      double typical=(rates[i].high+rates[i].low+rates[i].close)/3.0;
      int index=(int)MathFloor((typical-low)/span*VP_BINS);
      index=MathMax(0,MathMin(VP_BINS-1,index));
      double volume=(double)MathMax((long)1,rates[i].tick_volume);
      bins[index]+=volume;
      total+=volume;
   }
   if(total<=0.0)
      return false;

   int poc=0;
   for(int i=1;i<VP_BINS;i++)
      if(bins[i]>bins[poc]) poc=i;

   double target=total*0.70;
   double accumulated=bins[poc];
   int left=poc,right=poc;
   while(accumulated<target && (left>0 || right<VP_BINS-1))
   {
      double leftVol=left>0 ? bins[left-1] : -1.0;
      double rightVol=right<VP_BINS-1 ? bins[right+1] : -1.0;
      if(rightVol>leftVol)
      {
         right++;
         accumulated+=bins[right];
      }
      else
      {
         left--;
         accumulated+=bins[left];
      }
   }

   int hvn=poc;
   int lvn=-1;
   double lvnVol=1.0e100;
   for(int i=0;i<VP_BINS;i++)
   {
      if(i!=poc && bins[i]>bins[hvn]*0.72)
         hvn=i;
      if(bins[i]>0.0 && bins[i]<lvnVol)
      {
         lvnVol=bins[i];
         lvn=i;
      }
   }

   double step=span/VP_BINS;
   pocOut=low+(poc+0.5)*step;
   valOut=low+left*step;
   vahOut=low+(right+1)*step;
   hvnOut=low+(hvn+0.5)*step;
   lvnOut=lvn>=0 ? low+(lvn+0.5)*step : 0.0;
   return true;
}

double AnchoredVwapFromSwing(int direction)
{
   if(direction==0) direction=g_macroTrendDirection;
   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   int copied=CopyRates(_Symbol,PERIOD_M5,1,120,rates);
   if(copied<24)
      return 0.0;

   int anchor=0;
   if(direction>=0)
   {
      for(int i=1;i<copied;i++)
         if(rates[i].low<rates[anchor].low) anchor=i;
   }
   else
   {
      for(int i=1;i<copied;i++)
         if(rates[i].high>rates[anchor].high) anchor=i;
   }

   double weighted=0.0,volumeSum=0.0;
   for(int i=anchor;i>=0;i--)
   {
      double volume=(double)MathMax((long)1,rates[i].tick_volume);
      double typical=(rates[i].high+rates[i].low+rates[i].close)/3.0;
      weighted+=typical*volume;
      volumeSum+=volume;
   }
   return volumeSum>0.0 ? weighted/volumeSum : 0.0;
}

double ImpulseAnchoredVwap(int direction)
{
   if(direction==0) direction=g_macroTrendDirection;
   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   int copied=CopyRates(_Symbol,PERIOD_M5,1,72,rates);
   if(copied<16)
      return 0.0;

   double atrPrice=MathMax(
      _Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );
   int anchor=-1;
   for(int i=1;i<MathMin(copied,50);i++)
   {
      double body=MathAbs(rates[i].close-rates[i].open);
      bool directional=direction>=0
         ? rates[i].close>rates[i].open
         : rates[i].close<rates[i].open;
      if(directional && body>=atrPrice*0.85)
      {
         anchor=i;
         break;
      }
   }
   if(anchor<0) anchor=MathMin(copied-1,24);

   double weighted=0.0,volumeSum=0.0;
   for(int i=anchor;i>=0;i--)
   {
      double volume=(double)MathMax((long)1,rates[i].tick_volume);
      double typical=(rates[i].high+rates[i].low+rates[i].close)/3.0;
      weighted+=typical*volume;
      volumeSum+=volume;
   }
   return volumeSum>0.0 ? weighted/volumeSum : 0.0;
}

bool DonchianSnapshot(int period,double &highOut,double &lowOut)
{
   highOut=0.0; lowOut=0.0;
   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   int requested=MathMax(10,MathMin(120,period));
   int copied=CopyRates(_Symbol,PERIOD_M5,1,requested,rates);
   if(copied<requested)
      return false;
   highOut=rates[0].high;
   lowOut=rates[0].low;
   for(int i=1;i<copied;i++)
   {
      highOut=MathMax(highOut,rates[i].high);
      lowOut=MathMin(lowOut,rates[i].low);
   }
   return highOut>lowOut;
}

bool BollingerKeltnerSnapshot()
{
   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   if(CopyRates(_Symbol,PERIOD_M5,1,24,rates)<24)
      return false;

   double mean=0.0;
   for(int i=0;i<20;i++) mean+=rates[i].close;
   mean/=20.0;
   double variance=0.0;
   for(int i=0;i<20;i++)
   {
      double d=rates[i].close-mean;
      variance+=d*d;
   }
   variance/=20.0;
   double sd=MathSqrt(MathMax(0.0,variance));
   double atrPrice=MathMax(
      _Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,20)*_Point
   );

   g_bbMiddle=mean;
   g_bbUpper=mean+sd*2.0;
   g_bbLower=mean-sd*2.0;
   g_keltnerUpper=mean+atrPrice*1.50;
   g_keltnerLower=mean-atrPrice*1.50;
   g_bbWidthAtr=(g_bbUpper-g_bbLower)/MathMax(_Point,atrPrice);

   bool squeezed=g_bbUpper<=g_keltnerUpper && g_bbLower>=g_keltnerLower;
   if(squeezed)
      g_squeezeState="SQUEEZE";
   else
   {
      double range=MathMax(_Point,rates[0].high-rates[0].low);
      double body=MathAbs(rates[0].close-rates[0].open);
      bool efficient=body/range>=0.55;
      if(efficient && rates[0].close>g_bbUpper)
         g_squeezeState="SQUEEZE_RELEASE_UP";
      else if(efficient && rates[0].close<g_bbLower)
         g_squeezeState="SQUEEZE_RELEASE_DOWN";
      else
         g_squeezeState=g_bbWidthAtr>=2.8 ? "VOLATILITY_EXPANSION" : "NORMAL";
   }
   g_volatilityExpansionScore=ClampScore(
      45.0+
      MathMin(30.0,MathMax(0.0,g_bbWidthAtr-1.2)*14.0)+
      (StringFind(g_squeezeState,"RELEASE")>=0 ? 18.0 : 0.0)-
      (g_squeezeState=="SQUEEZE" ? 12.0 : 0.0)
   );
   return true;
}

bool MacdHistogramSnapshot()
{
   int handle=iMACD(_Symbol,PERIOD_M5,12,26,9,PRICE_CLOSE);
   if(handle==INVALID_HANDLE)
      return false;
   double mainNow[1],signalNow[1],mainOld[1],signalOld[1];
   bool ok=
      CopyBuffer(handle,0,1,1,mainNow)==1 &&
      CopyBuffer(handle,1,1,1,signalNow)==1 &&
      CopyBuffer(handle,0,3,1,mainOld)==1 &&
      CopyBuffer(handle,1,3,1,signalOld)==1;
   if(ok)
   {
      g_macdHistogram=mainNow[0]-signalNow[0];
      g_macdHistogramPrevious=mainOld[0]-signalOld[0];
      g_macdHistogramSlope=g_macdHistogram-g_macdHistogramPrevious;
      if(g_macdHistogram>0.0 && g_macdHistogramSlope>0.0)
         g_macdState="BULL_ACCELERATION";
      else if(g_macdHistogram<0.0 && g_macdHistogramSlope<0.0)
         g_macdState="BEAR_ACCELERATION";
      else if(g_macdHistogram>0.0)
         g_macdState="BULL_FADING";
      else if(g_macdHistogram<0.0)
         g_macdState="BEAR_FADING";
      else
         g_macdState="NEUTRAL";
   }
   IndicatorRelease(handle);
   return ok;
}

bool StochasticSnapshot()
{
   int handle=iStochastic(
      _Symbol,PERIOD_M5,14,3,3,MODE_SMA,STO_LOWHIGH
   );
   if(handle==INVALID_HANDLE)
      return false;
   double kNow[1],dNow[1],kOld[1],dOld[1];
   bool ok=
      CopyBuffer(handle,0,1,1,kNow)==1 &&
      CopyBuffer(handle,1,1,1,dNow)==1 &&
      CopyBuffer(handle,0,2,1,kOld)==1 &&
      CopyBuffer(handle,1,2,1,dOld)==1;
   if(ok)
   {
      g_stochK=kNow[0];
      g_stochD=dNow[0];
      bool crossUp=kOld[0]<=dOld[0] && kNow[0]>dNow[0];
      bool crossDown=kOld[0]>=dOld[0] && kNow[0]<dNow[0];
      if(crossUp && kNow[0]<=35.0)
         g_stochState="OVERSOLD_TURN_UP";
      else if(crossDown && kNow[0]>=65.0)
         g_stochState="OVERBOUGHT_TURN_DOWN";
      else if(kNow[0]>=80.0)
         g_stochState="OVERBOUGHT";
      else if(kNow[0]<=20.0)
         g_stochState="OVERSOLD";
      else
         g_stochState="NEUTRAL";
   }
   IndicatorRelease(handle);
   return ok;
}

void TickVolumeAndFlowSnapshot()
{
   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   int copied=CopyRates(_Symbol,PERIOD_M5,1,24,rates);
   if(copied<18)
   {
      g_tickVolumeMomentum=1.0;
      g_obvFlowScore=50.0;
      g_candleEfficiency=0.0;
      return;
   }

   double recent=0.0,baseline=0.0;
   for(int i=0;i<3;i++) recent+=(double)MathMax((long)1,rates[i].tick_volume);
   for(int i=3;i<15;i++) baseline+=(double)MathMax((long)1,rates[i].tick_volume);
   recent/=3.0;
   baseline/=12.0;
   g_tickVolumeMomentum=baseline>0.0 ? recent/baseline : 1.0;

   double signedVolume=0.0,totalVolume=0.0;
   for(int i=11;i>=0;i--)
   {
      double v=(double)MathMax((long)1,rates[i].tick_volume);
      totalVolume+=v;
      if(rates[i].close>rates[i].open) signedVolume+=v;
      else if(rates[i].close<rates[i].open) signedVolume-=v;
   }
   g_obvFlowScore=ClampScore(
      50.0+(totalVolume>0.0 ? signedVolume/totalVolume*50.0 : 0.0)
   );

   double range=MathMax(_Point,rates[0].high-rates[0].low);
   g_candleEfficiency=MathAbs(rates[0].close-rates[0].open)/range;
}

void DailySessionLevelsSnapshot()
{
   MqlRates d1[];
   ArraySetAsSeries(d1,true);
   if(CopyRates(_Symbol,PERIOD_D1,0,3,d1)>=3)
   {
      g_previousDayHigh=d1[1].high;
      g_previousDayLow=d1[1].low;
      g_previousDayClose=d1[1].close;
   }

   MqlRates w1[];
   ArraySetAsSeries(w1,true);
   if(CopyRates(_Symbol,PERIOD_W1,0,2,w1)>=1)
   {
      g_weekHigh=w1[0].high;
      g_weekLow=w1[0].low;
   }

   MqlRates m5[];
   ArraySetAsSeries(m5,true);
   int copied=CopyRates(_Symbol,PERIOD_M5,0,300,m5);
   if(copied>0)
   {
      MqlDateTime nowParts;
      TimeToStruct(TimeCurrent(),nowParts);
      g_sessionHigh=0.0;
      g_sessionLow=0.0;
      for(int i=0;i<copied;i++)
      {
         MqlDateTime p;
         TimeToStruct(m5[i].time,p);
         if(p.year!=nowParts.year || p.mon!=nowParts.mon || p.day!=nowParts.day)
            break;
         if(g_sessionHigh<=0.0)
         {
            g_sessionHigh=m5[i].high;
            g_sessionLow=m5[i].low;
         }
         else
         {
            g_sessionHigh=MathMax(g_sessionHigh,m5[i].high);
            g_sessionLow=MathMin(g_sessionLow,m5[i].low);
         }
      }
   }
}

void RsiDivergenceV2()
{
   g_rsiRegularDivBuy=0.0;
   g_rsiRegularDivSell=0.0;
   g_rsiHiddenDivBuy=0.0;
   g_rsiHiddenDivSell=0.0;

   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   if(CopyRates(_Symbol,PERIOD_M5,1,7,rates)<7)
      return;

   double rsiNow=RsiValue(PERIOD_M5,1);
   double rsiOld=RsiValue(PERIOD_M5,5);

   if(rates[0].low<rates[4].low && rsiNow>=rsiOld+3.0)
      g_rsiRegularDivBuy=ClampScore(62.0+(rsiNow-rsiOld)*2.0);
   if(rates[0].high>rates[4].high && rsiNow<=rsiOld-3.0)
      g_rsiRegularDivSell=ClampScore(62.0+(rsiOld-rsiNow)*2.0);

   if(rates[0].low>rates[4].low && rsiNow<=rsiOld-3.0)
      g_rsiHiddenDivBuy=ClampScore(58.0+(rsiOld-rsiNow)*1.8);
   if(rates[0].high<rates[4].high && rsiNow>=rsiOld+3.0)
      g_rsiHiddenDivSell=ClampScore(58.0+(rsiNow-rsiOld)*1.8);
}

void UpdateLevelMemory()
{
   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   if(CopyRates(_Symbol,PERIOD_M5,1,3,rates)<3)
      return;

   double atrPrice=MathMax(
      _Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );

   if(g_flipLevel<=0.0)
   {
      if(g_nearestResistance>0.0 &&
         rates[0].close>g_nearestResistance &&
         rates[1].close<=g_nearestResistance)
      {
         g_flipLevel=g_nearestResistance;
         g_flipDirection=1;
         g_levelFlipState="RESISTANCE_BROKEN";
         g_levelFlipScore=62.0;
      }
      else if(g_nearestSupport>0.0 &&
              rates[0].close<g_nearestSupport &&
              rates[1].close>=g_nearestSupport)
      {
         g_flipLevel=g_nearestSupport;
         g_flipDirection=-1;
         g_levelFlipState="SUPPORT_BROKEN";
         g_levelFlipScore=62.0;
      }
   }
   else
   {
      bool near=MathAbs(rates[0].close-g_flipLevel)<=atrPrice*0.18 ||
                (rates[0].low<=g_flipLevel && rates[0].high>=g_flipLevel);
      if(near)
      {
         if(g_flipDirection>0 && rates[0].close>=g_flipLevel)
         {
            g_levelFlipState="FLIPPED_TO_SUPPORT";
            g_levelFlipScore=82.0;
         }
         else if(g_flipDirection<0 && rates[0].close<=g_flipLevel)
         {
            g_levelFlipState="FLIPPED_TO_RESISTANCE";
            g_levelFlipScore=82.0;
         }
         else
         {
            g_levelFlipState="FLIP_FAILED";
            g_levelFlipScore=35.0;
         }
      }
      if(MathAbs(rates[0].close-g_flipLevel)>atrPrice*3.0)
      {
         g_flipLevel=0.0;
         g_flipDirection=0;
         g_levelFlipState="NONE";
         g_levelFlipScore=0.0;
      }
   }
}

void RefreshIndicatorV6Context()
{
   datetime now=TimeCurrent();
   if(g_lastIndicatorV6RefreshAt==now)
      return;
   g_lastIndicatorV6RefreshAt=now;

   g_indicatorActivationStage=IndicatorV6ModeName();

   VolumeProfileSnapshot(
      MathMax(48,InpVolumeProfileBars),
      g_volumePoc,g_volumeVah,g_volumeVal,g_volumeHvn,g_volumeLvn
   );
   DonchianSnapshot(MathMax(10,InpDonchianPeriod),g_donchianHigh,g_donchianLow);
   BollingerKeltnerSnapshot();
   MacdHistogramSnapshot();
   StochasticSnapshot();
   TickVolumeAndFlowSnapshot();
   DailySessionLevelsSnapshot();
   RsiDivergenceV2();

   g_adxSlope=g_adxM5-g_adxPreviousM5;
   g_dmiAcceleration=(g_plusDiM5-g_minusDiM5)-
      (g_plusDiPreviousM5-g_minusDiPreviousM5);

   double atrPrice=MathMax(
      _Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );
   g_emaCompressionScore=ClampScore(
      100.0-MathAbs(g_ema9-g_ema21)/MathMax(_Point,atrPrice)*120.0-
      MathAbs(g_ema21-g_ema50)/MathMax(_Point,atrPrice)*80.0
   );

   UpdateLevelMemory();
}

double DistanceScoreToLevel(
   int direction,
   double price,
   double level,
   double atrPrice,
   double idealAtr
)
{
   if(level<=0.0)
      return 50.0;
   double signedDistance=direction>0
      ? (price-level)/MathMax(_Point,atrPrice)
      : (level-price)/MathMax(_Point,atrPrice);
   double difference=MathAbs(signedDistance-idealAtr);
   return ClampScore(100.0-difference*90.0);
}

double IndicatorTargetCandidate(int direction,double entryPrice)
{
   if(direction==0 || entryPrice<=0.0)
      return 0.0;

   double candidates[10];
   int count=0;
   if(direction>0)
   {
      if(g_volumeVah>entryPrice) candidates[count++]=g_volumeVah;
      if(g_volumeHvn>entryPrice) candidates[count++]=g_volumeHvn;
      if(g_sessionHigh>entryPrice) candidates[count++]=g_sessionHigh;
      if(g_previousDayHigh>entryPrice) candidates[count++]=g_previousDayHigh;
      if(g_weekHigh>entryPrice) candidates[count++]=g_weekHigh;
      if(g_nearestResistance>entryPrice) candidates[count++]=g_nearestResistance;
      if(g_supplyZoneLow>entryPrice) candidates[count++]=g_supplyZoneLow;
   }
   else
   {
      if(g_volumeVal>0.0 && g_volumeVal<entryPrice) candidates[count++]=g_volumeVal;
      if(g_volumeHvn>0.0 && g_volumeHvn<entryPrice) candidates[count++]=g_volumeHvn;
      if(g_sessionLow>0.0 && g_sessionLow<entryPrice) candidates[count++]=g_sessionLow;
      if(g_previousDayLow>0.0 && g_previousDayLow<entryPrice) candidates[count++]=g_previousDayLow;
      if(g_weekLow>0.0 && g_weekLow<entryPrice) candidates[count++]=g_weekLow;
      if(g_nearestSupport>0.0 && g_nearestSupport<entryPrice) candidates[count++]=g_nearestSupport;
      if(g_demandZoneHigh>0.0 && g_demandZoneHigh<entryPrice) candidates[count++]=g_demandZoneHigh;
   }
   if(count<=0)
      return 0.0;

   double best=candidates[0];
   for(int i=1;i<count;i++)
   {
      if(direction>0 && candidates[i]<best) best=candidates[i];
      if(direction<0 && candidates[i]>best) best=candidates[i];
   }
   return best;
}

void RefreshIndicatorV6Scores(int direction,double momentum)
{
   RefreshIndicatorV6Context();
   g_indicatorV6Direction=direction;
   if(direction==0)
   {
      g_indicatorLocationScore=50.0;
      g_indicatorMomentumScore=50.0;
      g_indicatorStructureScore=50.0;
      g_indicatorVolatilityScore=50.0;
      g_indicatorExecutionScore=50.0;
      g_indicatorCostSpaceScore=50.0;
      g_indicatorCompositeScore=50.0;
      g_indicatorDecision="OBSERVE";
      g_indicatorWhy="NO_DIRECTION";
      return;
   }

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return;
   double price=(tick.bid+tick.ask)*0.5;
   double atrPrice=MathMax(
      _Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );

   g_swingAnchoredVwap=AnchoredVwapFromSwing(direction);
   g_impulseAnchoredVwap=ImpulseAnchoredVwap(direction);

   if(g_volumePoc>0.0)
   {
      if(price>=g_volumeVal && price<=g_volumeVah)
         g_volumeProfileState="VALUE_AREA";
      else if(price>g_volumeVah)
         g_volumeProfileState="ABOVE_VAH";
      else
         g_volumeProfileState="BELOW_VAL";
   }
   else
      g_volumeProfileState="DATA_NOT_READY";

   double profile=50.0;
   if(direction>0)
   {
      if(price>=g_volumeVal && price<=g_volumePoc) profile=82.0;
      else if(price>g_volumeVah) profile=38.0;
      else if(price<g_volumeVal) profile=72.0;
      else profile=60.0;
   }
   else
   {
      if(price<=g_volumeVah && price>=g_volumePoc) profile=82.0;
      else if(price<g_volumeVal) profile=38.0;
      else if(price>g_volumeVah) profile=72.0;
      else profile=60.0;
   }
   g_volumeProfileScore=profile;

   double vwapDirectional=50.0;
   int vwapCount=0;
   double vwaps[3]={g_vwapM5,g_swingAnchoredVwap,g_impulseAnchoredVwap};
   for(int i=0;i<3;i++)
   {
      if(vwaps[i]<=0.0) continue;
      double distance=(price-vwaps[i])/MathMax(_Point,atrPrice);
      double score=direction>0
         ? ClampScore(72.0-distance*32.0)
         : ClampScore(72.0+distance*32.0);
      vwapDirectional+=score-50.0;
      vwapCount++;
   }
   if(vwapCount>0)
      vwapDirectional=ClampScore(50.0+(vwapDirectional-50.0)/vwapCount);
   g_multiVwapScore=vwapDirectional;
   g_multiVwapState=vwapDirectional>=68.0
      ? "VALUE_ALIGNED"
      : vwapDirectional<=38.0 ? "EXTENDED_FROM_VALUE" : "NEUTRAL";

   if(g_donchianHigh>g_donchianLow)
   {
      double edgeBuffer=atrPrice*0.10;
      if(price>=g_donchianHigh-edgeBuffer)
         g_donchianState="AT_CHANNEL_HIGH";
      else if(price<=g_donchianLow+edgeBuffer)
         g_donchianState="AT_CHANNEL_LOW";
      else
         g_donchianState="MID_CHANNEL";
   }

   double swingLow=g_fibSwingLow>0.0 ? g_fibSwingLow : g_donchianLow;
   double swingHigh=g_fibSwingHigh>swingLow ? g_fibSwingHigh : g_donchianHigh;
   if(swingHigh>swingLow)
   {
      double midpoint=(swingLow+swingHigh)*0.5;
      double quarter=(swingHigh-swingLow)*0.10;
      if(price>midpoint+quarter)
         g_premiumDiscountState="PREMIUM";
      else if(price<midpoint-quarter)
         g_premiumDiscountState="DISCOUNT";
      else
         g_premiumDiscountState="EQUILIBRIUM";
   }

   double levelScore=g_levelFlipScore>0.0
      ? (g_flipDirection==direction ? g_levelFlipScore : 100.0-g_levelFlipScore)
      : 50.0;
   double zoneScore=direction>0 ? g_demandZoneScore : g_supplyZoneScore;
   double premiumScore=50.0;
   if(direction>0)
      premiumScore=g_premiumDiscountState=="DISCOUNT" ? 82.0 :
                   g_premiumDiscountState=="PREMIUM" ? 36.0 : 62.0;
   else
      premiumScore=g_premiumDiscountState=="PREMIUM" ? 82.0 :
                   g_premiumDiscountState=="DISCOUNT" ? 36.0 : 62.0;

   double dayLevel=50.0;
   if(direction>0 && g_previousDayLow>0.0)
      dayLevel=MathMax(dayLevel,DistanceScoreToLevel(direction,price,g_previousDayLow,atrPrice,0.35));
   if(direction<0 && g_previousDayHigh>0.0)
      dayLevel=MathMax(dayLevel,DistanceScoreToLevel(direction,price,g_previousDayHigh,atrPrice,0.35));

   g_indicatorLocationScore=ClampScore(
      50.0+
      ScoreContribution(profile,13.0)+
      ScoreContribution(vwapDirectional,13.0)+
      ScoreContribution(zoneScore,12.0)+
      ScoreContribution(premiumScore,8.0)+
      ScoreContribution(levelScore,7.0)+
      ScoreContribution(dayLevel,5.0)
   );

   double macdDirectional=50.0;
   if(direction>0)
      macdDirectional=g_macdHistogram>0.0
         ? (g_macdHistogramSlope>0.0 ? 82.0 : 62.0)
         : (g_macdHistogramSlope>0.0 ? 46.0 : 28.0);
   else
      macdDirectional=g_macdHistogram<0.0
         ? (g_macdHistogramSlope<0.0 ? 82.0 : 62.0)
         : (g_macdHistogramSlope<0.0 ? 46.0 : 28.0);

   double adxDirectional=ClampScore(
      50.0+
      (g_adxSlope>0.0 ? 10.0 : -6.0)+
      (direction>0 ? g_dmiAcceleration : -g_dmiAcceleration)*0.55
   );
   double volumeDirectional=direction>0
      ? g_obvFlowScore
      : 100.0-g_obvFlowScore;
   double divergenceDirectional=50.0;
   if(direction>0)
      divergenceDirectional=ClampScore(
         50.0+g_rsiRegularDivBuy*0.28+g_rsiHiddenDivBuy*0.20-
         g_rsiRegularDivSell*0.20
      );
   else
      divergenceDirectional=ClampScore(
         50.0+g_rsiRegularDivSell*0.28+g_rsiHiddenDivSell*0.20-
         g_rsiRegularDivBuy*0.20
      );

   g_indicatorMomentumScore=ClampScore(
      50.0+
      ScoreContribution(macdDirectional,17.0)+
      ScoreContribution(adxDirectional,10.0)+
      ScoreContribution(volumeDirectional,9.0)+
      ScoreContribution(divergenceDirectional,8.0)+
      MathMax(-6.0,MathMin(6.0,(g_tickVolumeMomentum-1.0)*14.0))
   );

   string microState="NEUTRAL";
   double micro=MicroStructureScore(direction,microState);
   string liquidityState="NONE";
   double liquidity=LiquiditySweepScore(direction,liquidityState);
   double ob=direction>0 ? g_bullishOrderBlockQuality : g_bearishOrderBlockQuality;
   double existingStructure=ClampScore(g_structureScore);
   double donchianStructure=50.0;
   if(direction>0)
      donchianStructure=g_donchianState=="AT_CHANNEL_HIGH" ? 62.0 :
                        g_donchianState=="AT_CHANNEL_LOW" ? 70.0 : 55.0;
   else
      donchianStructure=g_donchianState=="AT_CHANNEL_LOW" ? 62.0 :
                        g_donchianState=="AT_CHANNEL_HIGH" ? 70.0 : 55.0;

   g_indicatorStructureScore=ClampScore(
      50.0+
      ScoreContribution(existingStructure,13.0)+
      ScoreContribution(micro,12.0)+
      ScoreContribution(liquidity,8.0)+
      ScoreContribution(ob,10.0)+
      ScoreContribution(levelScore,7.0)+
      ScoreContribution(donchianStructure,5.0)
   );

   double vol=50.0;
   if(g_squeezeState=="SQUEEZE") vol=45.0;
   else if(g_squeezeState=="SQUEEZE_RELEASE_UP")
      vol=direction>0 ? 84.0 : 30.0;
   else if(g_squeezeState=="SQUEEZE_RELEASE_DOWN")
      vol=direction<0 ? 84.0 : 30.0;
   else if(g_squeezeState=="VOLATILITY_EXPANSION")
      vol=68.0;
   if(g_marketRegime=="HIGH_VOLATILITY" && StringFind(g_squeezeState,"RELEASE")<0)
      vol=MathMin(vol,58.0);
   g_indicatorVolatilityScore=ClampScore(vol);

   double stoch=50.0;
   if(direction>0)
      stoch=g_stochState=="OVERSOLD_TURN_UP" ? 84.0 :
            g_stochState=="OVERBOUGHT_TURN_DOWN" ? 28.0 :
            g_stochState=="OVERBOUGHT" ? 38.0 : 55.0;
   else
      stoch=g_stochState=="OVERBOUGHT_TURN_DOWN" ? 84.0 :
            g_stochState=="OVERSOLD_TURN_UP" ? 28.0 :
            g_stochState=="OVERSOLD" ? 38.0 : 55.0;

   double fvg=FairValueGapScore(direction,g_fvgLifecycleState);
   double pa=direction>0 ? g_priceActionBuyScore : g_priceActionSellScore;
   double executionTurn=ExecutionTurningEvent(direction,momentum) ? 82.0 : 50.0;
   double efficiency=ClampScore(38.0+g_candleEfficiency*62.0);

   g_indicatorExecutionScore=ClampScore(
      50.0+
      ScoreContribution(stoch,10.0)+
      ScoreContribution(micro,13.0)+
      ScoreContribution(liquidity,10.0)+
      ScoreContribution(fvg,8.0)+
      ScoreContribution(ClampScore(pa*2.0),8.0)+
      ScoreContribution(executionTurn,9.0)+
      ScoreContribution(efficiency,5.0)
   );

   g_spaceToTargetAtr=SpaceToTargetAtr(direction);
   double spaceScore=g_spaceToTargetAtr>=1.20 ? 90.0 :
                     g_spaceToTargetAtr>=0.70 ? 78.0 :
                     g_spaceToTargetAtr>=0.40 ? 64.0 :
                     g_spaceToTargetAtr>=0.20 ? 48.0 : 25.0;
   double costScore=g_executionCostAtr<=0.04 ? 90.0 :
                    g_executionCostAtr<=0.08 ? 76.0 :
                    g_executionCostAtr<=0.14 ? 58.0 :
                    g_executionCostAtr<=0.22 ? 42.0 : 24.0;
   g_indicatorCostSpaceScore=ClampScore(
      spaceScore*0.65+costScore*0.35
   );

   // Regime-specific family weights. They sum to one and never permit
   // correlated sub-indicators to be counted outside their family cap.
   double wLocation=0.25,wMomentum=0.18,wStructure=0.22,wVol=0.10,wExecution=0.17,wCost=0.08;
   if(g_marketRegime=="RANGE")
   {
      wLocation=0.30; wMomentum=0.12; wStructure=0.17;
      wVol=0.13; wExecution=0.20; wCost=0.08;
   }
   else if(g_marketRegime=="HIGH_VOLATILITY" || g_newsMode!="NORMAL")
   {
      wLocation=0.20; wMomentum=0.18; wStructure=0.22;
      wVol=0.14; wExecution=0.18; wCost=0.08;
   }
   else if(StringFind(g_marketRegime,"TREND")>=0)
   {
      wLocation=0.22; wMomentum=0.22; wStructure=0.22;
      wVol=0.09; wExecution=0.17; wCost=0.08;
   }

   g_indicatorCompositeScore=ClampScore(
      g_indicatorLocationScore*wLocation+
      g_indicatorMomentumScore*wMomentum+
      g_indicatorStructureScore*wStructure+
      g_indicatorVolatilityScore*wVol+
      g_indicatorExecutionScore*wExecution+
      g_indicatorCostSpaceScore*wCost
   );

   if(g_indicatorHistorySamples>=20)
      g_indicatorCompositeScore=ClampScore(
         g_indicatorCompositeScore*0.88+
         g_indicatorHistoryEvScore*0.12
      );

   g_indicatorTargetPrice=IndicatorTargetCandidate(direction,price);

   if(g_indicatorCompositeScore>=78.0)
      g_indicatorDecision="IDEAL";
   else if(g_indicatorCompositeScore>=60.0)
      g_indicatorDecision="ACCEPTABLE";
   else if(g_indicatorCompositeScore>=43.0)
      g_indicatorDecision="WAIT_BETTER_CONTEXT";
   else
      g_indicatorDecision="WEAK_CONTEXT";

   if(g_indicatorLocationScore<=38.0)
      g_indicatorWhy="LOCATION_WEAK";
   else if(g_indicatorExecutionScore<=38.0)
      g_indicatorWhy="EXECUTION_WEAK";
   else if(g_indicatorCostSpaceScore<=38.0)
      g_indicatorWhy="COST_OR_SPACE_WEAK";
   else if(g_indicatorMomentumScore<=38.0)
      g_indicatorWhy="MOMENTUM_WEAK";
   else if(g_indicatorStructureScore<=38.0)
      g_indicatorWhy="STRUCTURE_WEAK";
   else if(g_squeezeState=="SQUEEZE")
      g_indicatorWhy="VOLATILITY_COMPRESSED";
   else
      g_indicatorWhy="MULTI_FACTOR_CONTEXT";

   g_orderBlockLifecycleState=direction>0
      ? g_bullishOrderBlockState
      : g_bearishOrderBlockState;
}

bool IndicatorV6TimingReady(int direction)
{
   if(g_indicatorV6Mode<INDICATOR_V6_TIMING || direction==0)
      return true;

   bool multiWeak=
      g_indicatorCompositeScore<40.0 &&
      g_indicatorLocationScore<40.0 &&
      g_indicatorExecutionScore<42.0;
   if(!multiWeak)
   {
      if(MQLInfoInteger(MQL_TESTER) && g_indicatorWaitStartedAt>0)
         g_testIndicatorWaitSecondsSum +=
            MathMax(0.0,(double)(TimeCurrent()-g_indicatorWaitStartedAt));
      g_indicatorWaitStartedAt=0;
      g_indicatorWaitDirection=0;
      g_indicatorWaitReason="NONE";
      return true;
   }

   // Reversal/retest/sweep models already carry location evidence and should
   // never be starved by the optional indicator timing layer.
   bool protectedModel=
      StringFind(g_entryTrigger,"REVERSAL")>=0 ||
      StringFind(g_entryTrigger,"RETEST")>=0 ||
      g_liquidityScore>=65.0 ||
      g_microStructureScore>=75.0;
   if(protectedModel)
   {
      if(MQLInfoInteger(MQL_TESTER) && g_indicatorWaitStartedAt>0)
         g_testIndicatorWaitSecondsSum +=
            MathMax(0.0,(double)(TimeCurrent()-g_indicatorWaitStartedAt));
      g_indicatorWaitStartedAt=0;
      g_indicatorWaitDirection=0;
      g_indicatorWaitReason="PROTECTED_MODEL";
      return true;
   }

   datetime now=TimeCurrent();
   if(g_indicatorWaitStartedAt<=0 || g_indicatorWaitDirection!=direction)
   {
      g_indicatorWaitStartedAt=now;
      g_indicatorWaitDirection=direction;
      g_indicatorWaitReason=g_indicatorWhy;
      if(MQLInfoInteger(MQL_TESTER))
         g_testIndicatorWaitEvents++;
      return false;
   }

   int maxWait=MathMax(5,MathMin(60,InpIndicatorMaxWaitSeconds));
   if(now-g_indicatorWaitStartedAt>=maxWait)
   {
      if(MQLInfoInteger(MQL_TESTER))
         g_testIndicatorWaitSecondsSum +=
            MathMax(0.0,(double)(now-g_indicatorWaitStartedAt));
      g_indicatorWaitStartedAt=0;
      g_indicatorWaitDirection=0;
      g_indicatorWaitReason="BOUNDED_FALLBACK";
      return true;
   }
   return false;
}

void RefreshCycleIndicators()
{
   g_rsiM1 = RsiValue(PERIOD_M1,1);
   g_rsiM5 = RsiValue(PERIOD_M5,1);
   AdxSnapshotAt(PERIOD_M5,1,g_adxM5,g_plusDiM5,g_minusDiM5);
   AdxSnapshotAt(PERIOD_M5,3,g_adxPreviousM5,g_plusDiPreviousM5,g_minusDiPreviousM5);
   g_vwapM5 = SessionVwap(PERIOD_M5,48);
   RefreshIndicatorV6Context();

   MqlTick tick;
   double atrPrice = MathMax(
      _Point * 12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod) * _Point
   );
   if(SymbolInfoTick(_Symbol,tick) && g_vwapM5 > 0.0)
   {
      double price = (tick.bid+tick.ask)*0.5;
      g_vwapDistanceAtr = (price-g_vwapM5)/MathMax(_Point,atrPrice);
   }
   else
      g_vwapDistanceAtr = 0.0;

   g_rsiDivergenceBuyScore = RsiDivergenceScore(1);
   g_rsiDivergenceSellScore = RsiDivergenceScore(-1);
   g_demandZoneScore = DemandSupplyZoneScore(1);
   g_supplyZoneScore = DemandSupplyZoneScore(-1);
   g_demandZoneQuality = ZoneQualityLabel(g_demandZoneScore);
   g_supplyZoneQuality = ZoneQualityLabel(g_supplyZoneScore);
   // Context-only fields that depend on current Demand/Supply are refreshed
   // after those zones are available.
   UpdateLevelMemory();
}


bool ReversalOpportunityReady(int direction,double momentum,double &scoreOut)
{
   scoreOut = direction > 0 ? g_demandZoneScore : g_supplyZoneScore;
   if(direction == 0 || scoreOut < 52.0)
      return false;

   double paScore = direction > 0 ? g_priceActionBuyScore : g_priceActionSellScore;
   string lowerState = LowerTimeframeStateForDirection(direction);
   bool m1Turn = RecentDirectionalBody(direction,PERIOD_M1);
   bool m5Support =
      g_trendM5 == direction ||
      RecentDirectionalBody(direction,PERIOD_M5);
   bool emaTurn =
      (direction > 0 && g_emaReclaimState == "RECLAIM_EMA21_UP") ||
      (direction < 0 && g_emaReclaimState == "LOSE_EMA21_DOWN");
   bool momentumTurn = MomentumSupportsDirection(direction,momentum,0.30);
   bool divergence = direction > 0
      ? g_rsiDivergenceBuyScore > 0.0
      : g_rsiDivergenceSellScore > 0.0;

   bool executionConfirmed =
      lowerState != "REVERSAL" &&
      (
         (m1Turn && (m5Support || emaTurn || paScore >= 22.0 || momentumTurn)) ||
         (emaTurn && paScore >= 18.0) ||
         (m5Support && paScore >= 28.0) ||
         (divergence && ExecutionTurningEvent(direction,momentum))
      );

   if(!executionConfirmed)
      return false;

   if(m1Turn) scoreOut += 6.0;
   if(m5Support) scoreOut += 8.0;
   if(emaTurn) scoreOut += 8.0;
   if(momentumTurn) scoreOut += 4.0;
   if(divergence) scoreOut += 6.0;
   if(paScore >= 28.0) scoreOut += 6.0;
   scoreOut = MathMin(100.0,scoreOut);

   // Counter-macro reversal is allowed before H1 flips, but it needs stronger
   // evidence than a same-direction pullback continuation.
   double threshold = g_macroTrendDirection == -direction ? 70.0 : 60.0;
   return scoreOut >= threshold;
}


string MarketCycleStateForDirection(int direction,double momentum)
{
   if(direction == 0)
      return "PULLBACK";

   double reversalScore = 0.0;
   if(ReversalOpportunityReady(direction,momentum,reversalScore))
   {
      g_reversalStatus = direction > 0 ? "REVERSAL_BUY_CONFIRMED" : "REVERSAL_SELL_CONFIRMED";
      return "REVERSAL_CONFIRMED";
   }

   if(g_entryModel == "BREAKOUT" || g_entryTrigger == "NEWS_CONTINUATION")
      return "BREAKOUT";

   if(g_entryModel == "BREAKOUT_RETEST" ||
      g_entryModel == "PULLBACK_RETEST" ||
      g_priceLocationState == "BREAKOUT_RETEST_READY" ||
      g_priceLocationState == "PULLBACK_RETEST_READY")
      return "RETEST";

   string lowerState = LowerTimeframeStateForDirection(direction);
   double adverseZone = direction > 0 ? g_supplyZoneScore : g_demandZoneScore;
   double reversalEvidence = direction > 0
      ? g_rsiDivergenceSellScore
      : g_rsiDivergenceBuyScore;
   double oppositePa = direction > 0 ? g_priceActionSellScore : g_priceActionBuyScore;

   if(adverseZone >= 55.0 &&
      (lowerState == "REVERSAL" || reversalEvidence > 0.0 || oppositePa >= 24.0))
   {
      g_reversalStatus = direction > 0 ? "REVERSAL_SELL_SETUP" : "REVERSAL_BUY_SETUP";
      return "REVERSAL_SETUP";
   }

   double exhaustion=0.0, extensionAtr=0.0, wick=0.0;
   string reason="NONE";
   if(DirectionalExhaustion(direction,exhaustion,extensionAtr,wick,reason))
      return "EXHAUSTION";

   if(lowerState == "PULLBACK" || lowerState == "REVERSAL")
      return "PULLBACK";

   return "TREND_CONTINUATION";
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

string LowerTimeframeStateForDirection(int direction)
{
   if(direction == 0)
      return "NEUTRAL";

   bool m1Body = RecentDirectionalBody(direction,PERIOD_M1);
   bool m5Body = RecentDirectionalBody(direction,PERIOD_M5);
   bool oppositeM1Body = RecentDirectionalBody(-direction,PERIOD_M1);
   bool oppositeM5Body = RecentDirectionalBody(-direction,PERIOD_M5);

   if(g_trendM5 == direction)
   {
      if(g_trendM1 == direction || g_trendM1 == 0 || m1Body)
         return "CONFIRMED";
      if(g_trendM1 == -direction && oppositeM1Body)
         return "PULLBACK";
      return "PULLBACK";
   }

   if(g_trendM5 == -direction)
   {
      if(g_trendM1 == -direction || oppositeM5Body)
         return "REVERSAL";
      if(g_trendM1 == direction && m1Body)
         return "PULLBACK";
      return "REVERSAL";
   }

   if(g_trendM1 == direction || m1Body)
      return m5Body ? "CONFIRMED" : "PULLBACK";
   if(g_trendM1 == -direction || oppositeM1Body)
      return "PULLBACK";

   return "NEUTRAL";
}

bool ExecutionTurningEvent(int direction,double momentum)
{
   if(direction == 0)
      return false;

   double paScore = direction > 0 ? g_priceActionBuyScore : g_priceActionSellScore;
   bool m1Body = RecentDirectionalBody(direction,PERIOD_M1);
   bool m5Body = RecentDirectionalBody(direction,PERIOD_M5);
   bool emaTurn =
      (direction > 0 && g_emaReclaimState == "RECLAIM_EMA21_UP") ||
      (direction < 0 && g_emaReclaimState == "LOSE_EMA21_DOWN");
   bool momentumTurn = MomentumSupportsDirection(direction,momentum,0.25);

   return (m1Body && (emaTurn || momentumTurn || paScore >= 18.0)) ||
      m5Body || (emaTurn && paScore >= 18.0);
}

bool LowerTimeframeSupportsDirection(int direction)
{
   string state = LowerTimeframeStateForDirection(direction);
   return state == "CONFIRMED";
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
   if(direction == 0 || !SymbolInfoTick(_Symbol,tick))
      return false;

   double price = (tick.bid + tick.ask) * 0.5;
   double atrPrice = MathMax(
      _Point * 12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod) * _Point
   );

   double terminalRetracement = 2.0;
   if(g_fibM15Direction == direction)
      terminalRetracement = MathMin(terminalRetracement,g_fibM15Retracement);
   if(g_fibM5Direction == direction)
      terminalRetracement = MathMin(terminalRetracement,g_fibM5Retracement);

   double impulseRange = 0.0;
   if(g_fibDirection == direction && g_fibSwingHigh > g_fibSwingLow)
      impulseRange = g_fibSwingHigh-g_fibSwingLow;
   extensionAtrOut = impulseRange > 0.0
      ? impulseRange/atrPrice*MathMax(0.0,1.0-MathMin(1.0,terminalRetracement))
      : 0.0;

   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   if(CopyRates(_Symbol,PERIOD_M5,1,4,rates) >= 4)
   {
      double range = MathMax(_Point,rates[0].high-rates[0].low);
      double lowerWick = MathMin(rates[0].open,rates[0].close)-rates[0].low;
      double upperWick = rates[0].high-MathMax(rates[0].open,rates[0].close);
      wickRatioOut = direction < 0 ? lowerWick/range : upperWick/range;
      if(wickRatioOut >= 0.35) scoreOut += 15.0;
      if(wickRatioOut >= 0.55) scoreOut += 10.0;
   }

   if(terminalRetracement <= 0.236)
   {
      scoreOut += 20.0;
      reasonOut = "FIB_TERMINAL_ZONE";
   }
   if(terminalRetracement <= 0.10)
      scoreOut += 8.0;

   if(extensionAtrOut >= 1.25)
   {
      scoreOut += 14.0;
      if(reasonOut == "NONE") reasonOut = "EXTENDED_IMPULSE";
   }
   if(extensionAtrOut >= 1.80)
      scoreOut += 8.0;

   int run = RecentDirectionalRun(direction,PERIOD_M5,4);
   if(run >= 3) scoreOut += 8.0;

   double adverseZone = direction > 0 ? g_supplyZoneScore : g_demandZoneScore;
   if(adverseZone >= 75.0)
   {
      scoreOut += 18.0;
      reasonOut = direction > 0 ? "STRONG_SUPPLY" : "STRONG_DEMAND";
   }
   if(adverseZone >= 90.0)
      scoreOut += 8.0;

   bool nearTerminalLevel = direction < 0
      ? (g_nearestSupport > 0.0 && price-g_nearestSupport <= atrPrice*0.28)
      : (g_nearestResistance > 0.0 && g_nearestResistance-price <= atrPrice*0.28);
   if(nearTerminalLevel)
   {
      scoreOut += 12.0;
      if(reasonOut == "NONE")
         reasonOut = direction < 0 ? "NEAR_SUPPORT" : "NEAR_RESISTANCE";
   }

   double reversalDivergence = direction < 0
      ? g_rsiDivergenceBuyScore
      : g_rsiDivergenceSellScore;
   if(reversalDivergence > 0.0)
   {
      scoreOut += 10.0;
      if(reasonOut == "NONE") reasonOut = "RSI_DIVERGENCE";
   }

   bool rsiExtended = direction < 0 ? g_rsiM5 <= 32.0 : g_rsiM5 >= 68.0;
   if(rsiExtended) scoreOut += 6.0;

   if(MathAbs(g_vwapDistanceAtr) >= 0.90)
      scoreOut += 6.0;
   if(MathAbs(g_vwapDistanceAtr) >= 1.35)
      scoreOut += 5.0;

   bool adxFading = g_adxPreviousM5 > 0.0 &&
      g_adxM5 > 0.0 &&
      g_adxPreviousM5-g_adxM5 >= 2.5;
   bool directionalDiFading = direction > 0
      ? (g_plusDiPreviousM5 > 0.0 && g_plusDiM5 < g_plusDiPreviousM5*0.88)
      : (g_minusDiPreviousM5 > 0.0 && g_minusDiM5 < g_minusDiPreviousM5*0.88);
   if(adxFading) scoreOut += 7.0;
   if(adxFading && directionalDiFading)
   {
      scoreOut += 7.0;
      if(reasonOut == "NONE") reasonOut = "ADX_DI_EXHAUSTION";
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
   string lowerState = LowerTimeframeStateForDirection(direction);
   bool microConfirmed = lowerState == "CONFIRMED";
   bool turningEvent = ExecutionTurningEvent(direction,momentum);
   bool emaExecution =
      g_emaTrendM5 == direction ||
      (g_emaTrendM1 == direction && g_emaTrendM15 == direction);
   bool emaMacro =
      g_emaTrendM15 == direction ||
      g_emaTrendM30 == direction ||
      g_emaTrendH1 == direction;

   double paScore = direction > 0 ? g_priceActionBuyScore : g_priceActionSellScore;
   bool priceAction = paScore >= 18.0;
   bool emaReclaim =
      (direction > 0 && g_emaReclaimState == "RECLAIM_EMA21_UP") ||
      (direction < 0 && g_emaReclaimState == "LOSE_EMA21_DOWN");
   bool momentumReady = MomentumSupportsDirection(direction,momentum,0.40);

   if(requireHigherTimeframe && !higher)
      return false;

   // A temporary M1 pullback does not flip Macro, but it prevents a fresh
   // entry until a real turning event appears. A lower-TF reversal blocks the
   // continuation path completely.
   if(lowerState == "REVERSAL")
      return false;
   if(lowerState == "PULLBACK" && !turningEvent)
      return false;

   return (microConfirmed || turningEvent) &&
      emaExecution &&
      (emaMacro || higher) &&
      (priceAction || emaReclaim || momentumReady);
}


bool IsTrackedEconomicEventName(string name)
{
   string upper = name;
   StringToUpper(upper);
   return StringFind(upper,"NONFARM") >= 0 ||
      StringFind(upper,"NON-FARM") >= 0 ||
      StringFind(upper,"NFP") >= 0 ||
      StringFind(upper,"CONSUMER PRICE") >= 0 ||
      StringFind(upper,"CPI") >= 0 ||
      StringFind(upper,"FOMC") >= 0 ||
      StringFind(upper,"FEDERAL FUNDS") >= 0 ||
      StringFind(upper,"INTEREST RATE") >= 0 ||
      StringFind(upper,"RATE DECISION") >= 0;
}

void RefreshEconomicCalendarContext()
{
   datetime now = TimeTradeServer();
   if(now <= 0) now = TimeCurrent();
   if(g_lastCalendarRefreshAt > 0 && now-g_lastCalendarRefreshAt < 60)
      return;
   g_lastCalendarRefreshAt = now;
   g_newsCalendarActive = false;
   g_newsEventName = "NONE";
   g_newsEventMinutes = 9999;

   if(MQLInfoInteger(MQL_TESTER))
      return;

   string currency = SymbolInfoString(_Symbol,SYMBOL_CURRENCY_PROFIT);
   if(currency == "")
      currency = "USD";

   MqlCalendarValue values[];
   int count = CalendarValueHistory(values,now-900,now+3600,"",currency);
   if(count <= 0)
      return;

   int nearestAbsMinutes = 1000000;
   for(int i=0;i<count;i++)
   {
      MqlCalendarEvent event;
      if(!CalendarEventById(values[i].event_id,event))
         continue;
      if(event.importance != CALENDAR_IMPORTANCE_HIGH)
         continue;
      if(!IsTrackedEconomicEventName(event.name))
         continue;

      int minutes = (int)MathRound((double)(values[i].time-now)/60.0);
      int absMinutes = MathAbs(minutes);
      if(absMinutes < nearestAbsMinutes)
      {
         nearestAbsMinutes = absMinutes;
         g_newsEventMinutes = minutes;
         g_newsEventName = event.name;
      }
   }

   // Calendar is context only. Price action still decides direction and entry.
   g_newsCalendarActive = nearestAbsMinutes <= 60;
}

void RefreshNewsMode(double momentum)
{
   RefreshEconomicCalendarContext();

   bool newsContext = g_newsCalendarActive || g_marketRegime == "HIGH_VOLATILITY";
   if(!newsContext)
   {
      g_newsMode = "NORMAL";
      return;
   }

   int impulseDirection = momentum > 0.0 ? 1 : momentum < 0.0 ? -1 : 0;
   if(impulseDirection == 0)
   {
      g_newsMode = "NEWS_WAIT_IMPULSE";
      return;
   }

   double ex=0.0, ext=0.0, wick=0.0;
   string exReason="NONE";
   if(DirectionalExhaustion(impulseDirection,ex,ext,wick,exReason))
   {
      g_newsMode = "NEWS_EXHAUSTION";
      return;
   }

   if(g_priceLocationState == "BREAKOUT_RETEST_READY" ||
      g_priceLocationState == "PULLBACK_RETEST_READY" ||
      PullbackRetestReady(impulseDirection,momentum))
   {
      g_newsMode = "NEWS_RETEST";
      return;
   }

   // Do not chase the first live spike. Continuation requires a completed M5
   // directional body or established M5 trend plus execution evidence.
   bool completedImpulse =
      RecentDirectionalBody(impulseDirection,PERIOD_M5) &&
      (g_trendM5 == impulseDirection ||
       g_emaTrendM5 == impulseDirection);
   if(completedImpulse &&
      MomentumSupportsDirection(impulseDirection,momentum,0.55))
   {
      g_newsMode = "NEWS_CONTINUATION";
      return;
   }

   g_newsMode = "NEWS_WAIT_IMPULSE";
}

bool NewsImpulseExecutionReady(int direction,double momentum)
{
   if(g_newsMode == "NORMAL" ||
      g_newsMode == "NEWS_WAIT_IMPULSE" ||
      g_newsMode == "NEWS_EXHAUSTION")
      return false;

   double paScore = direction > 0 ? g_priceActionBuyScore : g_priceActionSellScore;
   bool emaAligned = g_emaTrendM5 == direction;
   bool m5Aligned = g_trendM5 == direction;
   string lowerState = LowerTimeframeStateForDirection(direction);
   bool turning = ExecutionTurningEvent(direction,momentum);

   if(g_newsMode == "NEWS_RETEST")
      return turning &&
         lowerState != "REVERSAL" &&
         (emaAligned || m5Aligned || paScore >= 22.0);

   int evidence = 0;
   if(m5Aligned) evidence++;
   if(emaAligned) evidence++;
   if(paScore >= 18.0) evidence++;
   if(lowerState == "CONFIRMED") evidence++;

   return g_newsMode == "NEWS_CONTINUATION" &&
      MomentumSupportsDirection(direction,momentum,0.60) &&
      RecentDirectionalBody(direction,PERIOD_M5) &&
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
   g_reversalStatus = "NONE";
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
      string lowerState = LowerTimeframeStateForDirection(fixedDirection);
      g_lowerTimeframeState = lowerState;
      string fixedModel = "NONE";
      double fixedScore = 0.0;

      if(lowerState != "REVERSAL" &&
         DirectSetupReady(fixedDirection,momentum,fixedModel,fixedScore))
      {
         EvaluateMarketLocationScore(fixedDirection);
         g_entryTrigger = fixedModel != "NONE" ? fixedModel : g_entryModel;
         return fixedDirection;
      }

      if(lowerState != "REVERSAL" &&
         ExecutionConfirmationReady(fixedDirection,momentum,false))
      {
         string locationTrigger = "NONE";
         if(AntiChaseLocationReady(
            fixedDirection,momentum,false,0.0,0.0,locationTrigger))
         {
            EvaluateMarketLocationScore(fixedDirection);
            g_entryTrigger = locationTrigger != "NONE"
               ? locationTrigger : "STRUCTURE_EXECUTION";
            return fixedDirection;
         }
      }
      return 0;
   }

   string buyModel="NONE", sellModel="NONE";
   double buyScore=0.0, sellScore=0.0;
   bool buyReady = DirectSetupReady(1,momentum,buyModel,buyScore);
   bool sellReady = DirectSetupReady(-1,momentum,sellModel,sellScore);

   int chosen=0;
   string chosenModel="NONE";
   if(buyReady && !sellReady)
   {
      chosen=1; chosenModel=buyModel;
   }
   else if(sellReady && !buyReady)
   {
      chosen=-1; chosenModel=sellModel;
   }
   else if(buyReady && sellReady)
   {
      if(MathAbs(buyScore-sellScore) >= 4.0)
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

   // Reversal Engine: H1 does not have to flip first. A quality Demand/Supply
   // zone plus M1/M5/EMA/PA turning evidence can override late continuation.
   if(g_macroTrendDirection != 0)
   {
      int reversalDirection = -g_macroTrendDirection;
      double reversalScore=0.0;
      if(ReversalOpportunityReady(reversalDirection,momentum,reversalScore) &&
         (chosen == 0 || chosen == g_macroTrendDirection))
      {
         chosen = reversalDirection;
         chosenModel = reversalDirection > 0 ? "REVERSAL_BUY" : "REVERSAL_SELL";
         g_reversalOpportunityDirection = reversalDirection;
         g_reversalOpportunityScore = reversalScore;
         g_reversalStatus = reversalDirection > 0
            ? "REVERSAL_BUY_CONFIRMED"
            : "REVERSAL_SELL_CONFIRMED";
      }
   }

   // Macro is context only. It can continue only after execution timing agrees;
   // a strong lower-TF reversal can never be overridden by H1/M30/M15.
   if(chosen == 0 && g_macroTrendDirection != 0)
   {
      string macroLower = LowerTimeframeStateForDirection(g_macroTrendDirection);
      if(macroLower != "REVERSAL" &&
         ExecutionConfirmationReady(g_macroTrendDirection,momentum,true))
      {
         string locationTrigger="NONE";
         if(AntiChaseLocationReady(
            g_macroTrendDirection,momentum,false,0.0,0.0,locationTrigger))
         {
            chosen = g_macroTrendDirection;
            chosenModel = locationTrigger != "NONE"
               ? locationTrigger : "STRUCTURE_EXECUTION";
         }
      }
   }

   if(chosen == 0 &&
      (g_newsCalendarActive || g_marketRegime == "HIGH_VOLATILITY"))
   {
      int momentumDirection = momentum > 0.0 ? 1 : momentum < 0.0 ? -1 : 0;
      if(momentumDirection != 0 &&
         NewsImpulseExecutionReady(momentumDirection,momentum))
      {
         string locationTrigger="NONE";
         if(AntiChaseLocationReady(
            momentumDirection,momentum,false,0.0,0.0,locationTrigger))
         {
            chosen=momentumDirection;
            chosenModel = locationTrigger != "NONE"
               ? locationTrigger
               : (g_newsMode == "NEWS_RETEST" ? "NEWS_RETEST" : "NEWS_CONTINUATION");
         }
      }
   }

   if(chosen != 0)
   {
      g_lowerTimeframeState = LowerTimeframeStateForDirection(chosen);

      if(g_antiChaseActive && g_antiChaseDirection != chosen)
      {
         g_antiChaseActive=false;
         g_antiChaseDirection=0;
         g_exhaustionScore=0.0;
         g_extensionAtr=0.0;
         g_adverseWickRatio=0.0;
         g_antiChaseReason="NONE";
         g_breakoutRetestRequired=false;
         g_breakoutRetestReady=false;
         g_breakoutReferenceLevel=0.0;
         g_priceLocationState =
            (chosenModel=="PULLBACK_RETEST" || chosenModel=="BREAKOUT_RETEST")
            ? "RETEST_READY" : "NORMAL";
      }

      if(!g_antiChaseActive)
      {
         if(chosenModel=="BREAKOUT_RETEST" || chosenModel=="NEWS_RETEST")
            g_priceLocationState="BREAKOUT_RETEST_READY";
         else if(chosenModel=="PULLBACK_RETEST")
            g_priceLocationState="PULLBACK_RETEST_READY";
         else
         {
            g_priceLocationState="NORMAL";
            g_exhaustionScore=0.0;
            g_extensionAtr=0.0;
            g_adverseWickRatio=0.0;
            g_antiChaseReason="NONE";
            g_breakoutRetestRequired=false;
            g_breakoutRetestReady=false;
            g_breakoutReferenceLevel=0.0;
         }
      }

      EvaluateMarketLocationScore(chosen);
      g_entryTrigger = chosenModel != "NONE" ? chosenModel : g_entryModel;
      g_marketCycleState = MarketCycleStateForDirection(chosen,momentum);
   }
   else
   {
      int contextDirection = g_macroTrendDirection != 0
         ? g_macroTrendDirection
         : (momentum > 0.0 ? 1 : momentum < 0.0 ? -1 : 0);
      g_lowerTimeframeState = LowerTimeframeStateForDirection(contextDirection);
      g_marketCycleState = MarketCycleStateForDirection(contextDirection,momentum);
   }

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

double SpaceToTargetAtr(int direction)
{
   MqlTick tick;
   if(direction == 0 || !SymbolInfoTick(_Symbol,tick))
      return 0.0;

   double price = (tick.bid+tick.ask)*0.5;
   double atrPrice = MathMax(
      _Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );
   double target = 0.0;

   if(direction > 0)
   {
      if(g_nearestResistance > price)
         target = g_nearestResistance;
      if(g_supplyZoneLow > price && (target <= 0.0 || g_supplyZoneLow < target))
         target = g_supplyZoneLow;
   }
   else
   {
      if(g_nearestSupport > 0.0 && g_nearestSupport < price)
         target = g_nearestSupport;
      if(g_demandZoneHigh > 0.0 && g_demandZoneHigh < price &&
         (target <= 0.0 || g_demandZoneHigh > target))
         target = g_demandZoneHigh;
   }

   if(target <= 0.0)
      return 99.0;
   return MathAbs(target-price)/MathMax(_Point,atrPrice);
}


double LiquiditySweepScore(int direction,string &stateOut)
{
   stateOut="NONE";
   if(direction==0)
      return 0.0;

   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   if(CopyRates(_Symbol,PERIOD_M1,1,8,rates)<8)
      return 0.0;

   double atrPrice=MathMax(
      _Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );
   double reference=direction>0 ? rates[1].low : rates[1].high;
   int equalTouches=0;
   for(int i=2;i<=6;i++)
   {
      if(direction>0)
         reference=MathMin(reference,rates[i].low);
      else
         reference=MathMax(reference,rates[i].high);
   }
   for(int i=1;i<=6;i++)
   {
      double p=direction>0 ? rates[i].low : rates[i].high;
      if(MathAbs(p-reference)<=atrPrice*0.08)
         equalTouches++;
   }

   double range=MathMax(_Point,rates[0].high-rates[0].low);
   double lowerWick=MathMin(rates[0].open,rates[0].close)-rates[0].low;
   double upperWick=rates[0].high-MathMax(rates[0].open,rates[0].close);
   double rejection=direction>0 ? lowerWick/range : upperWick/range;
   bool swept=direction>0
      ? rates[0].low<reference-atrPrice*0.02 && rates[0].close>reference
      : rates[0].high>reference+atrPrice*0.02 && rates[0].close<reference;

   double score=0.0;
   if(swept)
   {
      score=62.0;
      if(rejection>=0.35) score+=12.0;
      if(rejection>=0.50) score+=8.0;
      if(equalTouches>=2) score+=10.0;
      stateOut=direction>0 ? "SELL_SIDE_LIQUIDITY_SWEEP" : "BUY_SIDE_LIQUIDITY_SWEEP";
   }
   else
   {
      MqlTick tick;
      if(SymbolInfoTick(_Symbol,tick))
      {
         double price=(tick.bid+tick.ask)*0.5;
         double distance=MathAbs(price-reference)/MathMax(_Point,atrPrice);
         if(distance<=0.18)
         {
            score=22.0;
            stateOut=direction>0 ? "NEAR_SELL_SIDE_LIQUIDITY" : "NEAR_BUY_SIDE_LIQUIDITY";
         }
      }
   }

   // A matching M5 rejection increases quality, but M5 confirmation is never
   // mandatory for a liquidity signal.
   MqlRates m5[];
   ArraySetAsSeries(m5,true);
   if(CopyRates(_Symbol,PERIOD_M5,1,2,m5)>=2)
   {
      double r=MathMax(_Point,m5[0].high-m5[0].low);
      double wick=direction>0
         ? (MathMin(m5[0].open,m5[0].close)-m5[0].low)/r
         : (m5[0].high-MathMax(m5[0].open,m5[0].close))/r;
      if(wick>=0.35)
         score+=8.0;
   }
   return MathMax(0.0,MathMin(100.0,score));
}

double MicroStructureScore(int direction,string &stateOut)
{
   stateOut="NEUTRAL";
   if(direction==0)
      return 0.0;

   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   if(CopyRates(_Symbol,PERIOD_M1,1,7,rates)<7)
      return 0.0;

   double priorHigh=rates[1].high;
   double priorLow=rates[1].low;
   for(int i=2;i<=5;i++)
   {
      priorHigh=MathMax(priorHigh,rates[i].high);
      priorLow=MathMin(priorLow,rates[i].low);
   }

   double range=MathMax(_Point,rates[0].high-rates[0].low);
   double body=MathAbs(rates[0].close-rates[0].open);
   bool directionalBody=body>=range*0.28 &&
      (direction>0 ? rates[0].close>rates[0].open : rates[0].close<rates[0].open);
   bool bos=direction>0
      ? directionalBody && rates[0].close>priorHigh
      : directionalBody && rates[0].close<priorLow;

   double score=0.0;
   if(bos)
   {
      bool counterBefore=g_trendM1==-direction || g_trendM5==-direction;
      score=counterBefore ? 86.0 : 76.0;
      stateOut=counterBefore
         ? (direction>0 ? "CHOCH_UP" : "CHOCH_DOWN")
         : (direction>0 ? "MICRO_BOS_UP" : "MICRO_BOS_DOWN");
   }
   else
   {
      bool reclaim=direction>0
         ? directionalBody && rates[0].close>rates[1].high
         : directionalBody && rates[0].close<rates[1].low;
      if(reclaim)
      {
         score=56.0;
         stateOut=direction>0 ? "MICRO_RECLAIM_UP" : "MICRO_RECLAIM_DOWN";
      }
      else if(RecentDirectionalBody(direction,PERIOD_M1))
      {
         score=28.0;
         stateOut=direction>0 ? "MICRO_BODY_UP" : "MICRO_BODY_DOWN";
      }
   }

   if(RecentDirectionalBody(direction,PERIOD_M5))
      score+=8.0;
   return MathMax(0.0,MathMin(100.0,score));
}

double FairValueGapScore(int direction,string &stateOut)
{
   stateOut="NONE";
   if(direction==0)
      return 0.0;

   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   if(CopyRates(_Symbol,PERIOD_M1,1,10,rates)<10)
      return 0.0;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return 0.0;
   double price=(tick.bid+tick.ask)*0.5;
   double atrPrice=MathMax(
      _Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );

   double best=0.0;
   for(int i=0;i<=6;i++)
   {
      double gapLow=0.0,gapHigh=0.0;
      bool gap=false;
      if(direction>0 && rates[i].low>rates[i+2].high)
      {
         gapLow=rates[i+2].high;
         gapHigh=rates[i].low;
         gap=true;
      }
      else if(direction<0 && rates[i].high<rates[i+2].low)
      {
         gapLow=rates[i].high;
         gapHigh=rates[i+2].low;
         gap=true;
      }
      if(!gap)
         continue;

      double gapAtr=(gapHigh-gapLow)/MathMax(_Point,atrPrice);
      if(gapAtr<0.03)
         continue;

      bool retest=price>=gapLow-atrPrice*0.05 &&
                  price<=gapHigh+atrPrice*0.05;
      double center=(gapLow+gapHigh)*0.5;
      double distance=MathAbs(price-center)/MathMax(_Point,atrPrice);
      double score=retest
         ? MathMin(82.0,52.0+gapAtr*80.0)
         : (distance<=0.35 ? MathMin(45.0,20.0+gapAtr*55.0) : 0.0);
      if(score>best)
      {
         best=score;
         stateOut=retest
            ? (direction>0 ? "FVG_RETEST_BUY" : "FVG_RETEST_SELL")
            : (direction>0 ? "FVG_NEAR_BUY" : "FVG_NEAR_SELL");
      }
   }
   return MathMax(0.0,MathMin(100.0,best));
}

double EntryDistanceFromValueAtr(int direction)
{
   MqlTick tick;
   if(direction==0 || !SymbolInfoTick(_Symbol,tick))
      return 0.0;

   double price=direction>0 ? tick.ask : tick.bid;
   double atrPrice=MathMax(
      _Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );
   double reference=0.0;
   if(direction>0)
   {
      reference=ClosestBelow(price,g_demandZoneHigh,g_nearestSupport,g_ema21);
      reference=ClosestBelow(price,reference,g_vwapM5,0.0);
      if(reference<=0.0)
         return 0.0;
      return MathMax(0.0,(price-reference)/MathMax(_Point,atrPrice));
   }

   reference=ClosestAbove(price,g_supplyZoneLow,g_nearestResistance,g_ema21);
   reference=ClosestAbove(price,reference,g_vwapM5,0.0);
   if(reference<=0.0)
      return 0.0;
   return MathMax(0.0,(reference-price)/MathMax(_Point,atrPrice));
}

void RefreshEntryPrecisionIntelligence(int direction,double momentum)
{
   if(direction==0)
   {
      g_entryPrecisionState="LEGACY";
      g_entryPrecisionReason="NO_DIRECTION";
      g_entryPrecisionScore=50.0;
      return;
   }

   g_liquidityScore=LiquiditySweepScore(direction,g_liquidityState);
   g_microStructureScore=MicroStructureScore(direction,g_microStructureState);
   g_fvgScore=FairValueGapScore(direction,g_fvgState);
   g_entryDistanceAtr=EntryDistanceFromValueAtr(direction);
   g_spaceToTargetAtr=SpaceToTargetAtr(direction);
   g_expectedMoveAtr=MathMin(4.0,MathMax(0.0,g_spaceToTargetAtr));

   double atrPoints=MathMax(
      10.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)
   );
   g_executionCostAtr=CurrentSpreadPoints()/MathMax(1.0,atrPoints);
   RefreshIndicatorV6Scores(direction,momentum);

   double zoneScore=direction>0 ? g_demandZoneScore : g_supplyZoneScore;
   double score=50.0;
   score+=g_liquidityScore*0.12;
   score+=g_microStructureScore*0.14;
   score+=g_fvgScore*0.08;
   score+=MathMax(0.0,zoneScore-50.0)*0.16;
   if(ExecutionTurningEvent(direction,momentum))
      score+=7.0;
   if(g_macroTrendDirection==direction)
      score+=4.0;
   if(g_spaceToTargetAtr>=0.55)
      score+=6.0;
   else if(g_spaceToTargetAtr<=0.18)
      score-=8.0;

   if(g_entryDistanceAtr>=0.45)
      score-=10.0;
   if(g_entryDistanceAtr>=0.80)
      score-=8.0;
   if(g_executionCostAtr>=0.12)
      score-=4.0;

   double exhaustion=0.0,extensionAtr=0.0,wick=0.0;
   string exhaustionReason="NONE";
   if(DirectionalExhaustion(direction,exhaustion,extensionAtr,wick,exhaustionReason))
      score-=MathMin(14.0,6.0+exhaustion*0.08);

   // Setup history is intentionally a small advisory weight. A poor recent
   // sample can never veto a valid trade or reduce Max Positions.
   bool setupHistoryMatches=
      g_setupWinSamples>=12 &&
      g_setupHistoryDirection==direction &&
      g_setupHistoryModel==g_entryModel;
   if(setupHistoryMatches)
      score+=(g_setupEvScore-50.0)*0.16;

   // V6 contributes a bounded family-level soft weight only. SHADOW contributes
   // zero. No individual indicator can block or dominate Entry Precision.
   if(g_indicatorV6Mode>=INDICATOR_V6_SOFT_WEIGHT)
      score+=MathMax(-8.0,MathMin(8.0,(g_indicatorCompositeScore-50.0)*0.16));

   g_entryPrecisionScore=MathMax(0.0,MathMin(100.0,score));
   if(g_entryPrecisionScore>=78.0)
      g_entryPrecisionState="IDEAL_ENTRY";
   else if(g_entryPrecisionScore>=54.0)
      g_entryPrecisionState="ACCEPTABLE_ENTRY";
   else
      g_entryPrecisionState="CHASE_ENTRY";

   if(g_liquidityScore>=65.0)
      g_entryPrecisionReason=g_liquidityState;
   else if(g_microStructureScore>=65.0)
      g_entryPrecisionReason=g_microStructureState;
   else if(g_fvgScore>=52.0)
      g_entryPrecisionReason=g_fvgState;
   else if(g_entryDistanceAtr>=0.45)
      g_entryPrecisionReason="PRICE_EXTENDED_FROM_VALUE";
   else if(g_spaceToTargetAtr<=0.18)
      g_entryPrecisionReason="LIMITED_SPACE_TO_TARGET";
   else
      g_entryPrecisionReason="MULTI_FACTOR_ENTRY";

   // Expected-value score is normalized for comparison/telemetry, not used as
   // a profitability guarantee and never used as a hard entry gate.
   g_setupEvScore=MathMax(0.0,MathMin(100.0,g_setupEvScore));
}


double LocalExtremeRiskScore(int direction,string &stateOut,double &levelOut)
{
   stateOut="NONE";
   levelOut=0.0;
   if(direction==0)
      return 0.0;

   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   if(CopyRates(_Symbol,PERIOD_M5,1,7,rates)<7)
      return 0.0;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return 0.0;

   double atrPrice=MathMax(
      _Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );
   double price=(tick.bid+tick.ask)*0.5;
   double priorHigh=rates[1].high;
   double priorLow=rates[1].low;
   for(int i=2;i<=5;i++)
   {
      priorHigh=MathMax(priorHigh,rates[i].high);
      priorLow=MathMin(priorLow,rates[i].low);
   }

   double range=MathMax(_Point,rates[0].high-rates[0].low);
   double upperWick=rates[0].high-MathMax(rates[0].open,rates[0].close);
   double lowerWick=MathMin(rates[0].open,rates[0].close)-rates[0].low;
   double wickRatio=direction>0 ? upperWick/range : lowerWick/range;
   bool oppositeBody=direction>0
      ? rates[0].close<rates[0].open
      : rates[0].close>rates[0].open;

   bool failedBreakout=direction>0
      ? (rates[0].high>priorHigh+atrPrice*0.02 &&
         rates[0].close<priorHigh+atrPrice*0.015)
      : (rates[0].low<priorLow-atrPrice*0.02 &&
         rates[0].close>priorLow-atrPrice*0.015);

   bool nearExtreme=direction>0
      ? price>=priorHigh-atrPrice*0.22
      : price<=priorLow+atrPrice*0.22;

   double adverseZone=direction>0 ? g_supplyZoneScore : g_demandZoneScore;
   bool nearAdverseZone=direction>0
      ? (g_supplyZoneLow>0.0 &&
         g_supplyZoneLow-price<=atrPrice*0.30 &&
         g_supplyZoneHigh>=price-atrPrice*0.10)
      : (g_demandZoneHigh>0.0 &&
         price-g_demandZoneHigh<=atrPrice*0.30 &&
         g_demandZoneLow<=price+atrPrice*0.10);

   string lowerState=LowerTimeframeStateForDirection(direction);
   double score=0.0;
   if(nearExtreme) score+=24.0;
   if(failedBreakout) score+=36.0;
   if(wickRatio>=0.32) score+=12.0;
   if(wickRatio>=0.50) score+=8.0;
   if(oppositeBody) score+=10.0;
   if(lowerState=="PULLBACK") score+=7.0;
   if(lowerState=="REVERSAL") score+=18.0;
   if(adverseZone>=70.0 && nearAdverseZone) score+=12.0;

   double exhaustion=0.0,extensionAtr=0.0,adverseWick=0.0;
   string exhaustionReason="NONE";
   if(DirectionalExhaustion(
      direction,exhaustion,extensionAtr,adverseWick,exhaustionReason))
      score+=MathMin(14.0,6.0+exhaustion*0.08);

   levelOut=direction>0 ? priorHigh : priorLow;
   if(failedBreakout)
      stateOut=direction>0 ? "FAILED_BREAKOUT_TOP" : "FAILED_BREAKOUT_BOTTOM";
   else if(nearExtreme && wickRatio>=0.32 && oppositeBody)
      stateOut=direction>0 ? "TOP_REJECTION" : "BOTTOM_REJECTION";
   else if(nearExtreme)
      stateOut=direction>0 ? "LOCAL_TOP_RISK" : "LOCAL_BOTTOM_RISK";

   return MathMax(0.0,MathMin(100.0,score));
}

bool BreakoutHoldConfirmed(int direction,double referenceLevel)
{
   if(direction==0 || referenceLevel<=0.0)
      return false;

   MqlRates m5[];
   ArraySetAsSeries(m5,true);
   if(CopyRates(_Symbol,PERIOD_M5,1,2,m5)<2)
      return false;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return false;

   double atrPrice=MathMax(
      _Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );
   double price=(tick.bid+tick.ask)*0.5;
   double range=MathMax(_Point,m5[0].high-m5[0].low);
   double body=MathAbs(m5[0].close-m5[0].open);
   bool directionalBody=body>=range*0.30 &&
      (direction>0 ? m5[0].close>m5[0].open : m5[0].close<m5[0].open);
   bool closedThrough=direction>0
      ? m5[0].close>referenceLevel+atrPrice*0.04
      : m5[0].close<referenceLevel-atrPrice*0.04;
   bool holding=direction>0
      ? price>=referenceLevel-atrPrice*0.03
      : price<=referenceLevel+atrPrice*0.03;

   string microState="NEUTRAL";
   double micro=MicroStructureScore(direction,microState);
   bool executionSupport=
      micro>=45.0 ||
      RecentDirectionalBody(direction,PERIOD_M1) ||
      ExecutionTurningEvent(direction,MomentumPoints());

   return directionalBody && closedThrough && holding && executionSupport;
}

bool TacticalCountertrendSignal(
   int mainDirection,
   double momentum,
   int &directionOut,
   double &scoreOut,
   string &reasonOut
)
{
   directionOut=0;
   scoreOut=0.0;
   reasonOut="NONE";

   // Respect explicit BUY_ONLY / SELL_ONLY. Tactical opposite entries exist
   // only in AUTO mode, so customer direction settings are never overridden.
   if(g_entryMode!=ENTRY_AUTO_MOMENTUM ||
      mainDirection==0 ||
      g_macroTrendDirection==0 ||
      mainDirection!=g_macroTrendDirection)
      return false;

   string extremeState="NONE";
   double extremeLevel=0.0;
   double extremeScore=LocalExtremeRiskScore(
      mainDirection,extremeState,extremeLevel
   );
   if(extremeScore<68.0 || BreakoutHoldConfirmed(mainDirection,extremeLevel))
      return false;

   int opposite=-mainDirection;
   string microState="NEUTRAL";
   double microScore=MicroStructureScore(opposite,microState);
   string liquidityState="NONE";
   double liquidityScore=LiquiditySweepScore(opposite,liquidityState);
   double paScore=opposite>0 ? g_priceActionBuyScore : g_priceActionSellScore;

   bool oppositeM1=RecentDirectionalBody(opposite,PERIOD_M1);
   bool oppositeM5=RecentDirectionalBody(opposite,PERIOD_M5) ||
                   g_trendM5==opposite;
   bool momentumTurn=MomentumSupportsDirection(opposite,momentum,0.30);
   bool emaTurn=(opposite>0 && g_emaReclaimState=="RECLAIM_EMA21_UP") ||
                (opposite<0 && g_emaReclaimState=="LOSE_EMA21_DOWN");

   int confirmations=0;
   if(oppositeM1) confirmations++;
   if(oppositeM5) confirmations++;
   if(microScore>=55.0) confirmations++;
   if(momentumTurn) confirmations++;
   if(emaTurn) confirmations++;
   if(paScore>=24.0) confirmations++;

   bool structuralFailure=StringFind(extremeState,"FAILED_BREAKOUT")>=0 ||
                          extremeScore>=80.0;
   scoreOut=
      extremeScore*0.50 +
      microScore*0.22 +
      MathMin(100.0,paScore*2.0)*0.12 +
      liquidityScore*0.08 +
      (oppositeM5 ? 6.0 : 0.0) +
      (momentumTurn ? 4.0 : 0.0);
   scoreOut=MathMax(0.0,MathMin(100.0,scoreOut));

   if(!structuralFailure || confirmations<2 || scoreOut<68.0)
      return false;

   directionOut=opposite;
   reasonOut=opposite>0
      ? "TACTICAL_COUNTERTREND_BUY"
      : "TACTICAL_COUNTERTREND_SELL";
   return true;
}

int ApplyLocalExtremeDecision(int rawDirection,double momentum)
{
   g_tacticalCountertrendActive=false;
   g_tacticalCountertrendDirection=0;
   g_tacticalCountertrendScore=0.0;
   g_tacticalCountertrendReason="NONE";
   g_breakoutHoldConfirmed=false;

   int contextDirection=rawDirection!=0
      ? rawDirection
      : g_macroTrendDirection;
   if(contextDirection==0)
   {
      g_localExtremeState="NONE";
      g_localExtremeScore=0.0;
      g_localExtremeLevel=0.0;
      g_failedBreakoutState="NONE";
      return rawDirection;
   }

   // In AUTO, a confirmed counter-macro REVERSAL from V2 is already a proper
   // location trade. Do not let the local-extreme continuation guard cancel it.
   if(g_entryMode==ENTRY_AUTO_MOMENTUM &&
      rawDirection!=0 &&
      g_macroTrendDirection!=0 &&
      rawDirection!=g_macroTrendDirection)
      return rawDirection;

   string state="NONE";
   double level=0.0;
   double risk=LocalExtremeRiskScore(contextDirection,state,level);
   g_localExtremeState=state;
   g_localExtremeScore=risk;
   g_localExtremeLevel=level;
   g_failedBreakoutState=StringFind(state,"FAILED_BREAKOUT")>=0
      ? state : "NONE";

   if(risk<65.0)
   {
      g_localExtremeWaitStartedAt=0;
      return rawDirection;
   }

   if(BreakoutHoldConfirmed(contextDirection,level))
   {
      g_breakoutHoldConfirmed=true;
      g_localExtremeState="BREAKOUT_HOLD_CONFIRMED";
      g_localExtremeWaitStartedAt=0;
      return rawDirection;
   }

   int tacticalDirection=0;
   double tacticalScore=0.0;
   string tacticalReason="NONE";
   if(TacticalCountertrendSignal(
      contextDirection,momentum,tacticalDirection,tacticalScore,tacticalReason))
   {
      g_tacticalCountertrendActive=true;
      g_tacticalCountertrendDirection=tacticalDirection;
      g_tacticalCountertrendScore=tacticalScore;
      g_tacticalCountertrendReason=tacticalReason;
      g_entryTrigger=tacticalReason;
      g_entryModel="TACTICAL_COUNTERTREND";
      g_entryPrecisionState="TACTICAL_ENTRY";
      g_entryPrecisionReason=state;
      g_lowerTimeframeState=LowerTimeframeStateForDirection(tacticalDirection);
      g_marketCycleState="PULLBACK";
      g_localExtremeWaitStartedAt=0;
      return tacticalDirection;
   }

   if(g_localExtremeWaitStartedAt<=0)
      g_localExtremeWaitStartedAt=TimeCurrent();
   g_adaptiveBlockReason=contextDirection>0
      ? "BUY_WAIT_PULLBACK"
      : "SELL_WAIT_PULLBACK";
   g_entryPrecisionState="WAIT_LOCAL_EXTREME";
   g_entryPrecisionReason=state;
   return 0;
}

bool BasketHasTacticalPosition()
{
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic)
         continue;
      if(StringFind(PositionGetString(POSITION_COMMENT),"SaaSTactical")>=0)
         return true;
   }
   return false;
}

double TacticalTakeProfitPrice(int direction,double entryPrice)
{
   if(direction==0 || entryPrice<=0.0)
      return 0.0;

   double atrPrice=MathMax(
      _Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );
   double minDistance=(
      MathMax(
         (double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL),
         0.0
      )+2.0
   )*_Point;
   double targetDistance=MathMax(minDistance,atrPrice*0.45);
   double target=direction>0
      ? entryPrice+targetDistance
      : entryPrice-targetDistance;

   double structure=direction>0
      ? ClosestAbove(entryPrice,g_ema21,g_vwapM5,g_nearestResistance)
      : ClosestBelow(entryPrice,g_ema21,g_vwapM5,g_nearestSupport);
   if(structure>0.0)
   {
      double distance=MathAbs(structure-entryPrice);
      if(distance>=minDistance && distance<=atrPrice*0.80)
         target=structure;
   }

   int digits=(int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS);
   if(direction>0)
      target=MathMax(target,entryPrice+minDistance);
   else
      target=MathMin(target,entryPrice-minDistance);
   return NormalizeDouble(target,digits);
}

bool TacticalCountertrendExitReady(
   int direction,
   double momentum,
   double cycleProfit,
   string &reasonOut
)
{
   reasonOut="NONE";
   if(direction==0 || !BasketHasTacticalPosition())
      return false;

   int macroDirection=g_macroTrendDirection;
   if(macroDirection==0 || macroDirection!= -direction)
      return false;

   string microState="NEUTRAL";
   double microScore=MicroStructureScore(macroDirection,microState);
   bool m5Resume=g_trendM5==macroDirection ||
                 RecentDirectionalBody(macroDirection,PERIOD_M5);
   bool m1Resume=g_trendM1==macroDirection ||
                 RecentDirectionalBody(macroDirection,PERIOD_M1);
   bool executionResume=ExecutionTurningEvent(macroDirection,momentum) ||
                        microScore>=55.0;
   bool momentumResume=MomentumSupportsDirection(
      macroDirection,momentum,0.38
   );

   if(!m5Resume || !executionResume)
      return false;

   // Bank any tactical profit as soon as Macro resumes. If M1 + momentum also
   // resume strongly, cut the scalp even slightly red rather than Rescue/Hedge.
   if(cycleProfit>0.0 || (m1Resume && momentumResume))
   {
      reasonOut="TACTICAL_MACRO_RESUME";
      return true;
   }
   return false;
}

void ResetPrecisionWait()
{
   g_precisionWaitStartedAt=0;
   g_precisionWaitDirection=0;
   g_precisionWaitReason="NONE";
   g_precisionWaitMaxSeconds=0;
}

bool EntryPrecisionReady(int direction,double momentum,bool firstPosition)
{
   if(!firstPosition)
   {
      ResetPrecisionWait();
      return true;
   }

   RefreshEntryPrecisionIntelligence(direction,momentum);

   if(g_tacticalCountertrendActive)
   {
      g_entryPrecisionState="TACTICAL_ENTRY";
      g_entryPrecisionReason=g_tacticalCountertrendReason;
      ResetPrecisionWait();
      return true;
   }

   if(!IndicatorV6TimingReady(direction))
   {
      g_entryPrecisionState="INDICATOR_CONTEXT_WAIT";
      g_entryPrecisionReason=g_indicatorWaitReason;
      g_adaptiveBlockReason="WAIT_INDICATOR_CONTEXT";
      return false;
   }

   // Reversal/retest/sweep entries already contain a better-price thesis and
   // should never be delayed by this optional optimizer.
   bool locationEntry=
      StringFind(g_entryTrigger,"REVERSAL")>=0 ||
      StringFind(g_entryTrigger,"RETEST")>=0 ||
      g_liquidityScore>=65.0 ||
      g_microStructureScore>=78.0 ||
      g_fvgScore>=60.0;

   if(g_entryPrecisionState!="CHASE_ENTRY" || locationEntry)
   {
      ResetPrecisionWait();
      return true;
   }

   // Only clearly extended entries get a short better-price wait. Ordinary
   // lower scores are immediately downgraded to ACCEPTABLE rather than blocked.
   bool severeChase=g_entryDistanceAtr>=0.45 || g_exhaustionScore>=55.0;
   if(!severeChase)
   {
      g_entryPrecisionState="ACCEPTABLE_ENTRY";
      g_entryPrecisionReason="SOFT_SCORE_FALLBACK";
      ResetPrecisionWait();
      return true;
   }

   int maxWait=(g_newsMode!="NORMAL" || g_marketRegime=="HIGH_VOLATILITY")
      ? 8
      : (g_marketRegime=="RANGE" ? 12 : 18);
   datetime now=TimeCurrent();
   if(g_precisionWaitStartedAt<=0 || g_precisionWaitDirection!=direction)
   {
      g_precisionWaitStartedAt=now;
      g_precisionWaitDirection=direction;
      g_precisionWaitReason="WAIT_BETTER_PRICE";
      g_precisionWaitMaxSeconds=maxWait;
      g_entryPrecisionReason="WAIT_BETTER_PRICE";
      return false;
   }

   g_precisionWaitMaxSeconds=maxWait;
   if(now-g_precisionWaitStartedAt>=maxWait)
   {
      // Timeout may relax an ordinary chase, but it may NEVER force a BUY at a
      // confirmed local top or a SELL at a confirmed local bottom. Those waits
      // end only when price pulls back or a real breakout holds.
      string extremeState="NONE";
      double extremeLevel=0.0;
      double extremeRisk=LocalExtremeRiskScore(
         direction,extremeState,extremeLevel
      );
      if(extremeRisk>=65.0 &&
         !BreakoutHoldConfirmed(direction,extremeLevel))
      {
         g_entryPrecisionState="WAIT_LOCAL_EXTREME";
         g_entryPrecisionReason=extremeState;
         g_adaptiveBlockReason=direction>0
            ? "BUY_WAIT_PULLBACK"
            : "SELL_WAIT_PULLBACK";
         g_precisionWaitStartedAt=now;
         return false;
      }

      g_entryPrecisionState="ACCEPTABLE_FALLBACK";
      g_entryPrecisionReason="MAX_WAIT_FALLBACK";
      ResetPrecisionWait();
      return true;
   }

   g_entryPrecisionReason="WAIT_BETTER_PRICE";
   return false;
}

// Brain V8 -----------------------------------------------------------------
// Terminal-location protection + contrarian exhaustion engine.
// A strong down impulse is NEVER chased with a new Sell. The engine waits for
// exhaustion + bullish evidence and then permits Buy only after confirmation.
bool BrainV8ConfirmationCandleReady(int direction)
{
   return RecentDirectionalBody(direction, PERIOD_M1) ||
          RecentDirectionalBody(direction, PERIOD_M5);
}

bool BrainV8RecentPullbackSequence(int direction)
{
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, PERIOD_M1, 1, 7, rates);
   if(copied < 5)
      return false;

   double atrPrice = MathMax(
      _Point * 10.0,
      AverageTrueRangePoints(PERIOD_M5, g_atrPeriod) * _Point
   );
   double peak = rates[1].high;
   double trough = rates[1].low;
   for(int i = 1; i < copied; i++)
   {
      peak = MathMax(peak, rates[i].high);
      trough = MathMin(trough, rates[i].low);
   }

   bool confirmed = direction > 0
      ? (rates[0].close > rates[0].open && rates[0].close > rates[1].close)
      : (rates[0].close < rates[0].open && rates[0].close < rates[1].close);
   if(!confirmed)
      return false;

   double range = peak - trough;
   if(range < atrPrice * 0.12)
      return false;

   if(direction > 0)
      return rates[0].close > trough + range * 0.38;
   return rates[0].close < peak - range * 0.38;
}

bool BrainV8PullbackConfirmationReady(int direction, double momentum)
{
   if(!BrainV8ConfirmationCandleReady(direction))
   {
      g_adaptiveBlockReason = "WAIT_CONFIRMATION_CANDLE";
      g_priceLocationState = "WAIT_CONFIRMATION_CANDLE";
      return false;
   }

   bool pullbackReady = PullbackRetestReady(direction, momentum) ||
                        BrainV8RecentPullbackSequence(direction);
   if(!pullbackReady)
   {
      g_adaptiveBlockReason = "WAITING_PULLBACK_RETEST";
      g_priceLocationState = "WAIT_PULLBACK";
      return false;
   }

   bool breakoutModel = StringFind(g_entryModel, "BREAKOUT") >= 0 ||
                        StringFind(g_entryTrigger, "BREAKOUT") >= 0;
   if(breakoutModel)
   {
      double level = direction > 0 ? g_majorResistance : g_majorSupport;
      if(level <= 0.0)
         level = direction > 0 ? g_nearestResistance : g_nearestSupport;
      double atrPrice = MathMax(
         _Point * 10.0,
         AverageTrueRangePoints(PERIOD_M5, g_atrPeriod) * _Point
      );
      double buffer = MathMax(_Point * 3.0, atrPrice * 0.04);
      if(level > 0.0 && !BreakoutRetestConfirmed(direction, level, buffer))
      {
         g_adaptiveBlockReason = "WAITING_BREAKOUT_RETEST";
         g_priceLocationState = "WAIT_BREAKOUT_RETEST";
         g_breakoutRetestRequired = true;
         return false;
      }
   }
   return true;
}

double BrainV8LatestSwingExtensionAtr(int direction)
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
      return 0.0;

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, PERIOD_M5, 1, 16, rates);
   if(copied < 8)
      return 0.0;

   double reference = 0.0;
   for(int i = 2; i < copied - 2; i++)
   {
      bool pivot = direction > 0
         ? (rates[i].high >= rates[i-1].high && rates[i].high >= rates[i-2].high &&
            rates[i].high > rates[i+1].high && rates[i].high > rates[i+2].high)
         : (rates[i].low <= rates[i-1].low && rates[i].low <= rates[i-2].low &&
            rates[i].low < rates[i+1].low && rates[i].low < rates[i+2].low);
      if(pivot)
      {
         reference = direction > 0 ? rates[i].high : rates[i].low;
         break;
      }
   }

   if(reference <= 0.0)
   {
      reference = direction > 0 ? rates[1].high : rates[1].low;
      int upto = copied < 9 ? copied : 9;
      for(int i = 2; i < upto; i++)
         reference = direction > 0
            ? MathMax(reference, rates[i].high)
            : MathMin(reference, rates[i].low);
   }

   double price = (tick.bid + tick.ask) * 0.5;
   double atrPrice = MathMax(
      _Point * 10.0,
      AverageTrueRangePoints(PERIOD_M5, g_atrPeriod) * _Point
   );
   if(atrPrice <= 0.0)
      return 0.0;

   double extension = direction > 0
      ? MathMax(0.0, price - reference)
      : MathMax(0.0, reference - price);
   return extension / atrPrice;
}

bool BrainV8LocalZoneBlocked(int direction, bool fastRevalidation)
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
      return true;

   double price = (tick.bid + tick.ask) * 0.5;
   double atrPrice = MathMax(
      _Point * 10.0,
      AverageTrueRangePoints(PERIOD_M5, g_atrPeriod) * _Point
   );

   double m1Support = 0.0, m1Resistance = 0.0;
   double m1SupportStrength = 0.0, m1ResistanceStrength = 0.0;
   double m5Support = 0.0, m5Resistance = 0.0;
   double m5SupportStrength = 0.0, m5ResistanceStrength = 0.0;
   FindClusteredPivotLevels(
      PERIOD_M1, 120, price, atrPrice,
      m1Support, m1Resistance,
      m1SupportStrength, m1ResistanceStrength
   );
   FindClusteredPivotLevels(
      PERIOD_M5, 120, price, atrPrice,
      m5Support, m5Resistance,
      m5SupportStrength, m5ResistanceStrength
   );

   double thresholdAtr = fastRevalidation ? 0.36 : 0.30;
   double zoneThresholdAtr = thresholdAtr + 0.06;

   if(direction < 0)
   {
      bool nearM1 = m1Support > 0.0 && m1Support <= price &&
         (price - m1Support) / atrPrice <= thresholdAtr &&
         m1SupportStrength >= 30.0;
      bool nearM5 = m5Support > 0.0 && m5Support <= price &&
         (price - m5Support) / atrPrice <= thresholdAtr &&
         m5SupportStrength >= 30.0;
      bool inDemand = PriceInsideOrNearZone(
         price, g_demandZoneLow, g_demandZoneHigh, atrPrice * 0.12
      );
      bool nearDemand = g_demandZoneHigh > 0.0 && g_demandZoneHigh <= price &&
         (price - g_demandZoneHigh) / atrPrice <= zoneThresholdAtr &&
         g_demandZoneScore >= 50.0;
      if(nearM1 || nearM5 || inDemand || nearDemand)
      {
         g_adaptiveBlockReason = "WAIT_TERMINAL_DEMAND";
         g_priceLocationState = "NEAR_M1_M5_DEMAND";
         return true;
      }
   }
   else if(direction > 0)
   {
      bool nearM1 = m1Resistance > price &&
         (m1Resistance - price) / atrPrice <= thresholdAtr &&
         m1ResistanceStrength >= 30.0;
      bool nearM5 = m5Resistance > price &&
         (m5Resistance - price) / atrPrice <= thresholdAtr &&
         m5ResistanceStrength >= 30.0;
      bool inSupply = PriceInsideOrNearZone(
         price, g_supplyZoneLow, g_supplyZoneHigh, atrPrice * 0.12
      );
      bool nearSupply = g_supplyZoneLow > price &&
         (g_supplyZoneLow - price) / atrPrice <= zoneThresholdAtr &&
         g_supplyZoneScore >= 50.0;
      if(nearM1 || nearM5 || inSupply || nearSupply)
      {
         g_adaptiveBlockReason = "WAIT_TERMINAL_SUPPLY";
         g_priceLocationState = "NEAR_M1_M5_SUPPLY";
         return true;
      }
   }
   return false;
}

bool BrainV8StrongDownImpulse(double momentum)
{
   double threshold = MathMax(2.0, g_adaptiveMomentumThreshold);
   int bearishVotes = 0;
   if(g_trendM1 < 0) bearishVotes++;
   if(g_trendM5 < 0) bearishVotes++;
   if(g_emaTrendM5 < 0) bearishVotes++;
   if(g_emaTrendM15 < 0) bearishVotes++;

   bool momentumStrong = momentum <= -threshold * 0.72;
   bool trendStrong = bearishVotes >= 3;
   bool directionalPressure = g_minusDiM5 > g_plusDiM5 && g_adxM5 >= 20.0;
   return momentumStrong && trendStrong && directionalPressure;
}

bool BrainV8DownsideExhaustion(double momentum)
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
      return false;

   double price = (tick.bid + tick.ask) * 0.5;
   double atrPrice = MathMax(
      _Point * 10.0,
      AverageTrueRangePoints(PERIOD_M5, g_atrPeriod) * _Point
   );
   double extension = BrainV8LatestSwingExtensionAtr(-1);
   bool oversold = g_rsiM1 <= 34.0 || g_rsiM5 <= 37.0;
   bool demandTouch = PriceInsideOrNearZone(
      price, g_demandZoneLow, g_demandZoneHigh, atrPrice * 0.16
   );
   bool demandNear = g_demandZoneHigh > 0.0 && g_demandZoneHigh <= price &&
      (price - g_demandZoneHigh) / atrPrice <= 0.34 &&
      g_demandZoneScore >= 48.0;
   bool extended = extension >= 0.72;
   bool decelerating = !MomentumSupportsDirection(-1, momentum, 0.95) ||
      BrainV8ConfirmationCandleReady(1);

   int evidence = 0;
   if(oversold) evidence++;
   if(demandTouch || demandNear) evidence++;
   if(extended) evidence++;
   if(decelerating) evidence++;
   return evidence >= 2 && (extended || demandTouch || demandNear);
}

bool BrainV8ContrarianBuyReady(double momentum)
{
   if(!BrainV8StrongDownImpulse(momentum))
      return false;
   if(!BrainV8DownsideExhaustion(momentum))
      return false;
   if(!BrainV8ConfirmationCandleReady(1))
      return false;

   string microState = "NEUTRAL";
   double micro = MicroStructureScore(1, microState);
   bool reclaim = g_emaReclaimState == "RECLAIM_EMA21_UP";
   bool structureTurn = micro >= 56.0 || g_trendM1 > 0 || reclaim;
   bool pullback = PullbackRetestReady(1, momentum) ||
                   BrainV8RecentPullbackSequence(1);
   return structureTurn && pullback;
}

int BrainV8ApplyContrarianPolicy(int rawDirection, double momentum)
{
   if(!BrainV8StrongDownImpulse(momentum))
      return rawDirection;

   // Explicit product policy: never chase a strong bearish impulse with Sell.
   // Either wait, or buy the confirmed exhaustion reversal.
   if(BrainV8ContrarianBuyReady(momentum))
   {
      g_entryModel = "DOWNSIDE_EXHAUSTION_REVERSAL";
      g_entryTrigger = "BULLISH_REVERSAL_CONFIRMATION";
      g_entryBias = "BUY";
      g_reversalStatus = "STRONG_DOWN_BUY_CONFIRMED";
      g_priceLocationState = "CONTRARIAN_BUY_READY";
      g_adaptiveBlockReason = "";
      return 1;
   }

   g_entryBias = "BUY";
   g_reversalStatus = "STRONG_DOWN_WAIT_BUY";
   g_priceLocationState = "WAIT_BUY_REVERSAL";
   g_adaptiveBlockReason = "STRONG_DOWN_NO_SELL_WAIT_BUY";
   return 0;
}

bool BrainV8QualityGate(int direction, double momentum)
{
   RefreshIndicatorV6Scores(direction, momentum);

   double confidenceFloor = MathMax(
      56.0,
      MathMax((double)g_confidenceThreshold, DynamicConfidenceThreshold(direction))
   );
   if(direction > 0 && g_reversalStatus == "STRONG_DOWN_BUY_CONFIRMED")
      confidenceFloor = MathMax(confidenceFloor, 60.0);

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

   string microState = "NONE";
   double microScore = MicroStructureScore(direction, microState);
   bool counterMacro = g_macroTrendDirection != 0 && direction != g_macroTrendDirection;
   double locationStructureFloor = counterMacro ? 32.0 : 27.0;
   double indicatorStructureFloor = counterMacro ? 62.0 : 55.0;
   bool directionalStructure =
      g_trendM5 == direction ||
      g_trendM15 == direction ||
      microScore >= 65.0 ||
      StringFind(g_reversalStatus, "CONFIRMED") >= 0;

   if(g_structureScore < locationStructureFloor ||
      g_indicatorStructureScore < indicatorStructureFloor ||
      !directionalStructure)
   {
      g_adaptiveBlockReason = "WAITING_STRUCTURE_CONFIRMATION";
      return false;
   }
   return true;
}

bool BrainV8BasketAdverseMove(int direction, string &reasonOut)
{
   reasonOut = "NONE";
   double atrPoints = MathMax(
      10.0,
      AverageTrueRangePoints(PERIOD_M5, g_atrPeriod)
   );
   double progress = BasketFavorableProgressPoints(direction);
   double momentum = MomentumPoints();
   bool adversePrice = progress <= -atrPoints * 0.06;
   bool oppositeCandle = BrainV8ConfirmationCandleReady(-direction);
   bool oppositeMomentum = MomentumSupportsDirection(-direction, momentum, 0.22);
   string lowerState = LowerTimeframeStateForDirection(direction);

   if(lowerState == "REVERSAL")
   {
      reasonOut = "LOWER_TF_REVERSAL";
      return true;
   }
   if(adversePrice && (oppositeCandle || oppositeMomentum))
   {
      reasonOut = "ADVERSE_MOVE_ADD_BLOCK";
      return true;
   }
   if(oppositeCandle && oppositeMomentum)
   {
      reasonOut = "OPPOSITE_FLOW_ADD_BLOCK";
      return true;
   }
   return false;
}

bool BrainV8ConfirmedBasketReversal(int primaryDirection, double momentum, string &reasonOut)
{
   reasonOut = "NONE";
   int opposite = -primaryDirection;
   if(opposite == 0)
      return false;

   RefreshMarketContext(false);
   double reversalScore = 0.0;
   bool reversalSetup = ReversalOpportunityReady(opposite, momentum, reversalScore);
   string microState = "NONE";
   double microScore = MicroStructureScore(opposite, microState);
   bool candle = BrainV8ConfirmationCandleReady(opposite);
   bool m5Flip = g_trendM5 == opposite || RecentDirectionalBody(opposite, PERIOD_M5);
   bool emaFlip = g_emaTrendM5 == opposite || g_emaTrendM15 == opposite;
   bool momentumFlip = MomentumSupportsDirection(opposite, momentum, 0.35);
   bool structureFlip = microScore >= 68.0 ||
      (g_trendM5 == opposite && g_trendM15 == opposite);

   int evidence = 0;
   if(m5Flip) evidence++;
   if(emaFlip) evidence++;
   if(momentumFlip) evidence++;
   if(structureFlip) evidence++;

   bool zoneConfirmed = reversalSetup && reversalScore >= 72.0 &&
      candle && structureFlip && evidence >= 3;
   bool structuralBreak = candle && microScore >= 78.0 &&
      m5Flip && emaFlip && momentumFlip;

   if(zoneConfirmed || structuralBreak)
   {
      reasonOut = zoneConfirmed
         ? "ZONE_STRUCTURE_REVERSAL"
         : "STRUCTURE_MOMENTUM_REVERSAL";
      return true;
   }
   return false;
}

bool BrainV8HandleBasketReversal(double momentum)
{
   if(BasketPositionCount() <= 0)
      return false;

   int direction = BasketDirection();
   if(direction == 0)
      return false;

   string reason = "NONE";
   if(!BrainV8ConfirmedBasketReversal(direction, momentum, reason))
      return false;

   g_burstActive = false;
   g_burstNeedsRearm = false;
   g_fillBlockReason = "BASKET_REVERSAL_EXIT";
   g_reversalStatus = "BASKET_REVERSAL_CONFIRMED";
   g_executionStatus = "BASKET_REVERSAL_EXIT";
   g_lastCloseReason = reason;
   bool closed = CloseAllBasket("BRAIN_V8_REVERSAL_" + reason);
   if(closed)
      ResetTrail();
   return true;
}

// Brain V9 -----------------------------------------------------------------
// Scoped hardening layer. It does not replace the established setup engines;
// it only enforces customer direction, model-aware confirmation and symmetric
// terminal-exhaustion protection before execution.
bool UserDirectionAllows(int direction)
{
   if(direction == 0)
      return true;
   if(g_entryMode == ENTRY_BUY_ONLY)
      return direction > 0;
   if(g_entryMode == ENTRY_SELL_ONLY)
      return direction < 0;
   return true;
}

int EnforceUserDirectionLock(int direction)
{
   if(UserDirectionAllows(direction))
      return direction;

   g_adaptiveBlockReason = direction > 0
      ? "USER_DIRECTION_LOCK_SELL_ONLY"
      : "USER_DIRECTION_LOCK_BUY_ONLY";
   return 0;
}

bool BrainV9StrongUpImpulse(double momentum)
{
   double threshold = MathMax(2.0, g_adaptiveMomentumThreshold);
   int bullishVotes = 0;
   if(g_trendM1 > 0) bullishVotes++;
   if(g_trendM5 > 0) bullishVotes++;
   if(g_emaTrendM5 > 0) bullishVotes++;
   if(g_emaTrendM15 > 0) bullishVotes++;

   bool momentumStrong = momentum >= threshold * 0.72;
   bool trendStrong = bullishVotes >= 3;
   bool directionalPressure = g_plusDiM5 > g_minusDiM5 && g_adxM5 >= 20.0;
   return momentumStrong && trendStrong && directionalPressure;
}

bool BrainV9UpsideExhaustion(double momentum)
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
      return false;

   double price = (tick.bid + tick.ask) * 0.5;
   double atrPrice = MathMax(
      _Point * 10.0,
      AverageTrueRangePoints(PERIOD_M5, g_atrPeriod) * _Point
   );
   double extension = BrainV8LatestSwingExtensionAtr(1);
   bool overbought = g_rsiM1 >= 66.0 || g_rsiM5 >= 63.0;
   bool supplyTouch = PriceInsideOrNearZone(
      price, g_supplyZoneLow, g_supplyZoneHigh, atrPrice * 0.16
   );
   bool supplyNear = g_supplyZoneLow > price &&
      (g_supplyZoneLow - price) / atrPrice <= 0.34 &&
      g_supplyZoneScore >= 48.0;
   bool extended = extension >= 0.72;
   bool decelerating = !MomentumSupportsDirection(1, momentum, 0.95) ||
      BrainV8ConfirmationCandleReady(-1);

   int evidence = 0;
   if(overbought) evidence++;
   if(supplyTouch || supplyNear) evidence++;
   if(extended) evidence++;
   if(decelerating) evidence++;
   return evidence >= 2 && (extended || supplyTouch || supplyNear);
}

bool BrainV9ContrarianSellReady(double momentum)
{
   if(!BrainV9StrongUpImpulse(momentum))
      return false;
   if(!BrainV9UpsideExhaustion(momentum))
      return false;
   if(!BrainV8ConfirmationCandleReady(-1))
      return false;

   string microState = "NEUTRAL";
   double micro = MicroStructureScore(-1, microState);
   bool reclaim = g_emaReclaimState == "LOSE_EMA21_DOWN";
   bool structureTurn = micro >= 56.0 || g_trendM1 < 0 || reclaim;
   bool pullback = PullbackRetestReady(-1, momentum) ||
                   BrainV8RecentPullbackSequence(-1);
   return structureTurn && pullback;
}

// Brain V10 ----------------------------------------------------------------
// Trend-phase entry policy:
// - Never chase a strong impulse into the bottom/top.
// - Permit trend continuation only AFTER a real counter-trend pullback and a
//   fresh direction candle, while meaningful room remains to the next
//   Demand/Support or Supply/Resistance area.
// - Keep the existing exhaustion reversal logic for late-trend conditions.
bool BrainV10PullbackSequenceOnTf(int direction, ENUM_TIMEFRAMES timeframe)
{
   if(direction == 0)
      return false;

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, timeframe, 1, 6, rates);
   if(copied < 5)
      return false;

   double atrPrice = MathMax(
      _Point * 10.0,
      AverageTrueRangePoints(PERIOD_M5, g_atrPeriod) * _Point
   );

   bool counterSeen = false;
   double pullbackHigh = rates[1].high;
   double pullbackLow = rates[1].low;
   int upto = copied < 4 ? copied : 4;
   for(int i = 1; i < upto; i++)
   {
      bool counterCandle = direction < 0
         ? rates[i].close > rates[i].open
         : rates[i].close < rates[i].open;
      if(counterCandle)
         counterSeen = true;
      pullbackHigh = MathMax(pullbackHigh, rates[i].high);
      pullbackLow = MathMin(pullbackLow, rates[i].low);
   }

   bool directionConfirm = direction < 0
      ? (rates[0].close < rates[0].open && rates[0].close < rates[1].close)
      : (rates[0].close > rates[0].open && rates[0].close > rates[1].close);
   bool meaningfulPullback = (pullbackHigh - pullbackLow) >= atrPrice * 0.10;

   return counterSeen && meaningfulPullback && directionConfirm;
}

bool BrainV10RecentPullbackContinuation(int direction)
{
   return BrainV10PullbackSequenceOnTf(direction, PERIOD_M1) ||
          BrainV10PullbackSequenceOnTf(direction, PERIOD_M5);
}

bool BrainV10ContinuationReady(int direction, double momentum, string &reasonOut)
{
   reasonOut = "NONE";
   if(direction == 0 || !UserDirectionAllows(direction))
   {
      reasonOut = "USER_DIRECTION_LOCK";
      return false;
   }

   bool strongImpulse = direction < 0
      ? BrainV8StrongDownImpulse(momentum)
      : BrainV9StrongUpImpulse(momentum);
   if(!strongImpulse)
   {
      reasonOut = "NO_STRONG_IMPULSE";
      return false;
   }

   // Once the impulse is already exhausted, continuation is disabled. The
   // existing reversal engine owns that phase instead.
   bool exhausted = direction < 0
      ? BrainV8DownsideExhaustion(momentum)
      : BrainV9UpsideExhaustion(momentum);
   if(exhausted)
   {
      reasonOut = "EXHAUSTION_PHASE";
      return false;
   }

   double extensionAtr = BrainV8LatestSwingExtensionAtr(direction);
   if(extensionAtr >= 0.82)
   {
      reasonOut = "SWING_TOO_EXTENDED";
      return false;
   }

   // Require enough reward space before allowing a continuation entry. This is
   // the hard protection against SELL-at-the-bottom / BUY-at-the-top.
   double targetRoomAtr = SpaceToTargetAtr(direction);
   if(targetRoomAtr < 0.60)
   {
      reasonOut = "INSUFFICIENT_TARGET_ROOM";
      return false;
   }

   // Preserve the established M1/M5 terminal-zone guard.
   if(BrainV8LocalZoneBlocked(direction, false))
   {
      reasonOut = direction < 0 ? "NEAR_DEMAND_SUPPORT" : "NEAR_SUPPLY_RESISTANCE";
      return false;
   }

   // Do not continue selling an already oversold leg or buying an already
   // overbought leg even if a short-lived confirmation candle appears.
   if(direction < 0 && (g_rsiM1 <= 34.0 || g_rsiM5 <= 37.0))
   {
      reasonOut = "OVERSOLD_BOTTOM_PROTECTION";
      return false;
   }
   if(direction > 0 && (g_rsiM1 >= 66.0 || g_rsiM5 >= 63.0))
   {
      reasonOut = "OVERBOUGHT_TOP_PROTECTION";
      return false;
   }

   int trendVotes = 0;
   if(g_trendM5 == direction) trendVotes++;
   if(g_trendM15 == direction) trendVotes++;
   if(g_emaTrendM5 == direction) trendVotes++;
   if(g_emaTrendM15 == direction) trendVotes++;
   if(trendVotes < 3)
   {
      reasonOut = "TREND_NOT_CONFIRMED";
      return false;
   }

   if(!BrainV10RecentPullbackContinuation(direction))
   {
      reasonOut = "WAIT_REAL_PULLBACK";
      return false;
   }

   if(!BrainV8ConfirmationCandleReady(direction))
   {
      reasonOut = "WAIT_CONFIRMATION_CANDLE";
      return false;
   }

   return true;
}

int BrainV10ApplyTrendPhasePolicy(int rawDirection, double momentum)
{
   if(BrainV8StrongDownImpulse(momentum))
   {
      // Late downtrend: keep the existing confirmed exhaustion BUY path.
      if(BrainV8ContrarianBuyReady(momentum) && UserDirectionAllows(1))
      {
         g_entryModel = "DOWNSIDE_EXHAUSTION_REVERSAL";
         g_entryTrigger = "BULLISH_REVERSAL_CONFIRMATION";
         g_entryBias = "BUY";
         g_reversalStatus = "STRONG_DOWN_BUY_CONFIRMED";
         g_priceLocationState = "CONTRARIAN_BUY_READY";
         g_adaptiveBlockReason = "";
         return EnforceUserDirectionLock(1);
      }

      string continuationReason = "NONE";
      if(BrainV10ContinuationReady(-1, momentum, continuationReason))
      {
         g_entryModel = "DOWNTREND_PULLBACK_CONTINUATION";
         g_entryTrigger = "BEARISH_PULLBACK_CONFIRMATION";
         g_entryBias = "SELL";
         g_reversalStatus = "STRONG_DOWN_PULLBACK_SELL_CONFIRMED";
         g_priceLocationState = "PULLBACK_CONTINUATION_SELL_READY";
         g_adaptiveBlockReason = "";
         return EnforceUserDirectionLock(-1);
      }

      double extensionAtr = BrainV8LatestSwingExtensionAtr(-1);
      double roomAtr = SpaceToTargetAtr(-1);
      bool bottomPhase = BrainV8DownsideExhaustion(momentum) ||
                         extensionAtr >= 0.82 || roomAtr < 0.60 ||
                         g_rsiM1 <= 34.0 || g_rsiM5 <= 37.0;
      if(bottomPhase)
      {
         g_entryBias = UserDirectionAllows(1) ? "BUY" : "SELL";
         g_reversalStatus = "STRONG_DOWN_BOTTOM_PROTECTION";
         g_priceLocationState = "WAIT_BUY_REVERSAL";
         g_adaptiveBlockReason = "STRONG_DOWN_NO_SELL_WAIT_BUY";
      }
      else
      {
         g_entryBias = "SELL";
         g_reversalStatus = "STRONG_DOWN_WAIT_PULLBACK_SELL";
         g_priceLocationState = "WAIT_PULLBACK_CONTINUATION";
         g_adaptiveBlockReason = "STRONG_DOWN_WAIT_PULLBACK_SELL";
      }
      return 0;
   }

   if(BrainV9StrongUpImpulse(momentum))
   {
      // Symmetric top protection: do not BUY the final spike. A confirmed
      // exhaustion reversal may SELL; otherwise only a pullback continuation
      // with room to the next supply/resistance may BUY.
      if(BrainV9ContrarianSellReady(momentum) && UserDirectionAllows(-1))
      {
         g_entryModel = "UPSIDE_EXHAUSTION_REVERSAL";
         g_entryTrigger = "BEARISH_REVERSAL_CONFIRMATION";
         g_entryBias = "SELL";
         g_reversalStatus = "STRONG_UP_SELL_CONFIRMED";
         g_priceLocationState = "CONTRARIAN_SELL_READY";
         g_adaptiveBlockReason = "";
         return EnforceUserDirectionLock(-1);
      }

      string continuationReason = "NONE";
      if(BrainV10ContinuationReady(1, momentum, continuationReason))
      {
         g_entryModel = "UPTREND_PULLBACK_CONTINUATION";
         g_entryTrigger = "BULLISH_PULLBACK_CONFIRMATION";
         g_entryBias = "BUY";
         g_reversalStatus = "STRONG_UP_PULLBACK_BUY_CONFIRMED";
         g_priceLocationState = "PULLBACK_CONTINUATION_BUY_READY";
         g_adaptiveBlockReason = "";
         return EnforceUserDirectionLock(1);
      }

      double extensionAtr = BrainV8LatestSwingExtensionAtr(1);
      double roomAtr = SpaceToTargetAtr(1);
      bool topPhase = BrainV9UpsideExhaustion(momentum) ||
                      extensionAtr >= 0.82 || roomAtr < 0.60 ||
                      g_rsiM1 >= 66.0 || g_rsiM5 >= 63.0;
      if(topPhase)
      {
         g_entryBias = UserDirectionAllows(-1) ? "SELL" : "BUY";
         g_reversalStatus = "STRONG_UP_TOP_PROTECTION";
         g_priceLocationState = "WAIT_SELL_REVERSAL";
         g_adaptiveBlockReason = "STRONG_UP_NO_BUY_WAIT_SELL";
      }
      else
      {
         g_entryBias = "BUY";
         g_reversalStatus = "STRONG_UP_WAIT_PULLBACK_BUY";
         g_priceLocationState = "WAIT_PULLBACK_CONTINUATION";
         g_adaptiveBlockReason = "STRONG_UP_WAIT_PULLBACK_BUY";
      }
      return 0;
   }

   return EnforceUserDirectionLock(rawDirection);
}

int BrainV9ApplyExhaustionPolicy(int rawDirection, double momentum)
{
   if(BrainV8StrongDownImpulse(momentum))
   {
      int candidate = BrainV8ApplyContrarianPolicy(rawDirection, momentum);
      return EnforceUserDirectionLock(candidate);
   }

   if(BrainV9StrongUpImpulse(momentum))
   {
      if(BrainV9ContrarianSellReady(momentum) && UserDirectionAllows(-1))
      {
         g_entryModel = "UPSIDE_EXHAUSTION_REVERSAL";
         g_entryTrigger = "BEARISH_REVERSAL_CONFIRMATION";
         g_entryBias = "SELL";
         g_reversalStatus = "STRONG_UP_SELL_CONFIRMED";
         g_priceLocationState = "CONTRARIAN_SELL_READY";
         g_adaptiveBlockReason = "";
         return -1;
      }

      g_entryBias = UserDirectionAllows(-1) ? "SELL" : "BUY";
      g_reversalStatus = "STRONG_UP_WAIT_SELL";
      g_priceLocationState = "WAIT_SELL_REVERSAL";
      g_adaptiveBlockReason = UserDirectionAllows(-1)
         ? "STRONG_UP_NO_BUY_WAIT_SELL"
         : "BUY_ONLY_STRONG_UP_WAIT_PULLBACK";
      return 0;
   }

   return EnforceUserDirectionLock(rawDirection);
}

bool BrainV9ModelConfirmationReady(int direction, double momentum)
{
   // Brain V10 continuation setups already proved a real counter-trend
   // pullback, target room and terminal-zone safety inside the phase policy.
   // Re-check only the fresh direction candle here so a second generic
   // pullback gate cannot starve an otherwise valid continuation entry.
   if(g_entryModel == "DOWNTREND_PULLBACK_CONTINUATION" ||
      g_entryModel == "UPTREND_PULLBACK_CONTINUATION")
   {
      if(!BrainV8ConfirmationCandleReady(direction))
      {
         g_adaptiveBlockReason = "WAIT_CONFIRMATION_CANDLE";
         g_priceLocationState = "WAIT_CONFIRMATION_CANDLE";
         return false;
      }
      return true;
   }

   bool breakoutModel = StringFind(g_entryModel, "BREAKOUT") >= 0 ||
                        StringFind(g_entryTrigger, "BREAKOUT") >= 0;
   if(breakoutModel)
   {
      if(!BrainV8ConfirmationCandleReady(direction))
      {
         g_adaptiveBlockReason = "WAIT_CONFIRMATION_CANDLE";
         g_priceLocationState = "WAIT_CONFIRMATION_CANDLE";
         return false;
      }

      // DirectSetupReady already classifies a compact clean breakout as safe.
      // Only an extended/wicky breakout that explicitly armed the retest flag
      // must wait for a retest here.
      if(g_breakoutRetestRequired)
      {
         double level = direction > 0 ? g_majorResistance : g_majorSupport;
         if(level <= 0.0)
            level = direction > 0 ? g_nearestResistance : g_nearestSupport;
         double atrPrice = MathMax(
            _Point * 10.0,
            AverageTrueRangePoints(PERIOD_M5, g_atrPeriod) * _Point
         );
         double buffer = MathMax(_Point * 3.0, atrPrice * 0.04);
         if(level > 0.0 && !BreakoutRetestConfirmed(direction, level, buffer))
         {
            g_adaptiveBlockReason = "WAITING_BREAKOUT_RETEST";
            g_priceLocationState = "WAIT_BREAKOUT_RETEST";
            return false;
         }
      }
      return true;
   }

   bool locationModel =
      StringFind(g_entryModel, "PULLBACK") >= 0 ||
      StringFind(g_entryModel, "EXHAUSTION_REVERSAL") >= 0 ||
      StringFind(g_entryTrigger, "REVERSAL") >= 0 ||
      StringFind(g_entryTrigger, "RETEST") >= 0 ||
      g_entryModel == "LEVEL_REACTION";
   if(locationModel)
      return BrainV8PullbackConfirmationReady(direction, momentum);

   // Continuation/news/caution models were already validated by their own
   // setup functions. Require a completed direction candle, but do not invent
   // a pullback requirement that contradicts those models.
   if(!BrainV8ConfirmationCandleReady(direction))
   {
      g_adaptiveBlockReason = "WAIT_CONFIRMATION_CANDLE";
      g_priceLocationState = "WAIT_CONFIRMATION_CANDLE";
      return false;
   }
   return true;
}

bool MarketLocationEntryAllowed(int direction, bool fastRevalidation)
{
   RefreshMarketContext(false);
   if(BrainV8LocalZoneBlocked(direction, fastRevalidation))
      return false;

   double brainV8SwingExtension = BrainV8LatestSwingExtensionAtr(direction);
   double brainV8MaxExtension = fastRevalidation ? 0.80 : 0.95;
   g_extensionAtr = MathMax(g_extensionAtr, brainV8SwingExtension);
   if(brainV8SwingExtension >= brainV8MaxExtension)
   {
      g_adaptiveBlockReason = "WAITING_PULLBACK_RETEST";
      g_priceLocationState = "SWING_EXTENDED_WAIT_PULLBACK";
      g_antiChaseActive = true;
      g_antiChaseDirection = direction;
      g_antiChaseReason = "SWING_EXTENSION";
      g_breakoutRetestRequired = false;
      return false;
   }
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
   {
      g_adaptiveBlockReason = "NO_TICK";
      return false;
   }

   EvaluateMarketLocationScore(direction);

   double exhaustion=0.0, extensionAtr=0.0, adverseWick=0.0;
   string exhaustionReason="NONE";
   bool exhausted = DirectionalExhaustion(
      direction,exhaustion,extensionAtr,adverseWick,exhaustionReason
   );

   double adverseZone = direction > 0 ? g_supplyZoneScore : g_demandZoneScore;
   double terminalThreshold = fastRevalidation ? 84.0 : 78.0;
   g_spaceToTargetAtr = SpaceToTargetAtr(direction);

   double atrPrice=MathMax(
      _Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );
   double price=(tick.bid+tick.ask)*0.5;
   double adverseDistanceAtr=99.0;
   if(direction>0 && g_supplyZoneLow>price)
      adverseDistanceAtr=(g_supplyZoneLow-price)/MathMax(_Point,atrPrice);
   else if(direction<0 && g_demandZoneHigh>0.0 && g_demandZoneHigh<price)
      adverseDistanceAtr=(price-g_demandZoneHigh)/MathMax(_Point,atrPrice);
   bool nearAdverseZone=adverseDistanceAtr<=(fastRevalidation ? 0.24 : 0.30);

   // Hard gate only for a clearly dangerous terminal location that is ACTUALLY
   // close to price. A strong but distant Demand/Supply zone must never starve
   // the entry engine. RSI/ADX/VWAP remain advisory.
   bool terminalZone =
      adverseZone >= terminalThreshold &&
      nearAdverseZone &&
      (g_spaceToTargetAtr <= 0.22 || exhausted);
   bool noRoomAndExhausted =
      g_spaceToTargetAtr <= 0.12 &&
      adverseZone >= 70.0 &&
      nearAdverseZone &&
      exhausted;

   if(terminalZone || noRoomAndExhausted)
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

   // RACE respects the configured ATR multiplier. Its stop distance is based on
   // M5 volatility below, so the user setting remains authoritative without
   // silently falling back to the old fixed M15 x1.50 stop.
   if(RaceModeEnabled() || BasketHasRacePosition())
      return MathMax(0.5, MathMin(10.0, multiplier));

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

   if(EffectiveExecutionMode()=="COUNTER")
      return 0.0;

   if(EffectiveExecutionMode()=="MANUAL")
   {
      if(g_manualStopLossPoints <= 0.0)
         return 0.0;
      return MathMax(g_manualStopLossPoints, brokerMinimumPoints + 1.0);
   }

   // Other modes never consume the saved MANUAL stop profile.
   return EffectiveHardStopDistancePoints();
}

string StopLossModeName()
{
   if(EffectiveExecutionMode()=="COUNTER")
      return "OFF";
   if(EffectiveExecutionMode()=="MANUAL")
      return g_manualStopLossPoints > 0.0 ? "MANUAL_POINTS" : "OFF";
   return "SYSTEM_ATR";
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

// Brain V13 ----------------------------------------------------------------
// Smart entry without entry starvation:
// - All market intelligence contributes WEIGHT, never a first-entry veto.
// - Setup, momentum, trend, EMA, DI/ADX, macro, RSI and supply/demand vote.
// - If evidence is mixed, momentum/macro/M5 provides a deterministic fallback.
// - A genuinely wrong entry is corrected early from adverse excursion plus
//   opposite market evidence; ordinary noise is left to Adaptive Rescue.
int BrainV13SmartDirection(double momentum)
{
   double buyScore = 0.0;
   double sellScore = 0.0;

   int setupDirection = SetupFirstDirection(momentum);
   if(setupDirection > 0) buyScore += 30.0;
   else if(setupDirection < 0) sellScore += 30.0;

   double momentumBase = MathMax(2.0, g_adaptiveMomentumThreshold);
   double momentumWeight = MathMin(28.0, MathAbs(momentum) / momentumBase * 22.0);
   if(momentum > 0.0) buyScore += momentumWeight;
   else if(momentum < 0.0) sellScore += momentumWeight;

   if(g_trendM1 > 0) buyScore += 8.0; else if(g_trendM1 < 0) sellScore += 8.0;
   if(g_trendM5 > 0) buyScore += 14.0; else if(g_trendM5 < 0) sellScore += 14.0;
   if(g_trendM15 > 0) buyScore += 12.0; else if(g_trendM15 < 0) sellScore += 12.0;
   if(g_emaTrendM5 > 0) buyScore += 10.0; else if(g_emaTrendM5 < 0) sellScore += 10.0;
   if(g_emaTrendM15 > 0) buyScore += 8.0; else if(g_emaTrendM15 < 0) sellScore += 8.0;

   if(g_macroTrendDirection > 0) buyScore += 16.0;
   else if(g_macroTrendDirection < 0) sellScore += 16.0;

   if(g_plusDiM5 > g_minusDiM5 && g_adxM5 >= 18.0) buyScore += 8.0;
   else if(g_minusDiM5 > g_plusDiM5 && g_adxM5 >= 18.0) sellScore += 8.0;

   // Location/oscillator intelligence is advisory only. It can improve which
   // side wins the vote, but it can never turn both sides into NO TRADE.
   if(g_rsiM1 >= 74.0 || g_rsiM5 >= 76.0)
   {
      buyScore -= 6.0;
      sellScore += 3.0;
   }
   else if(g_rsiM1 <= 26.0 || g_rsiM5 <= 24.0)
   {
      sellScore -= 6.0;
      buyScore += 3.0;
   }

   if(g_supplyZoneScore >= 70.0) buyScore -= 5.0;
   if(g_demandZoneScore >= 70.0) sellScore -= 5.0;

   int direction = 0;
   double edge = buyScore - sellScore;
   if(edge > 1.0) direction = 1;
   else if(edge < -1.0) direction = -1;
   else if(momentum > 0.0) direction = 1;
   else if(momentum < 0.0) direction = -1;
   else if(g_macroTrendDirection != 0) direction = g_macroTrendDirection;
   else if(g_trendM5 != 0) direction = g_trendM5;
   else if(g_trendM1 != 0) direction = g_trendM1;

   if(direction == 0)
   {
      g_entryModel = "NONE";
      g_entryTrigger = "NONE";
      g_entryBias = "BOTH";
      g_adaptiveBlockReason = "WAITING_DIRECTION";
      return 0;
   }

   g_entryModel = setupDirection == direction
      ? "SMART_SETUP_WEIGHTED"
      : "SMART_WEIGHTED_DIRECTION";
   g_entryTrigger = direction > 0 ? "SMART_BUY" : "SMART_SELL";
   g_entryBias = direction > 0 ? "BUY" : "SELL";
   g_adaptiveBlockReason = "";
   return EnforceUserDirectionLock(direction);
}

// Shared AUTO / MANUAL Zone-First entry brain -----------------------------
// Both modes read the same Demand/Supply + price-reaction intelligence.
// AUTO owns automatic SL/TP after entry; MANUAL keeps user-defined exits.
bool SharedZoneReactionCandidate(
   int direction,
   double momentum,
   double &scoreOut,
   string &reasonOut
)
{
   scoreOut=0.0;
   reasonOut="NONE";
   if(direction==0)
      return false;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return false;

   double zoneScore=direction>0 ? g_demandZoneScore : g_supplyZoneScore;
   double zoneLow=direction>0 ? g_demandZoneLow : g_supplyZoneLow;
   double zoneHigh=direction>0 ? g_demandZoneHigh : g_supplyZoneHigh;
   if(zoneScore<50.0 || zoneLow<=0.0 || zoneHigh<zoneLow)
      return false;

   double atrPrice=MathMax(
      _Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );
   double price=(tick.bid+tick.ask)*0.5;
   if(!PriceInsideOrNearZone(price,zoneLow,zoneHigh,atrPrice*0.24))
      return false;

   double paScore=direction>0 ? g_priceActionBuyScore : g_priceActionSellScore;
   bool rejection=RecentDirectionalRejection(
      direction,zoneLow,zoneHigh,atrPrice*0.12
   );
   bool executionTurn=ExecutionTurningEvent(direction,momentum);
   bool m1Body=RecentDirectionalBody(direction,PERIOD_M1);
   bool m5Body=RecentDirectionalBody(direction,PERIOD_M5);
   bool emaTurn=
      (direction>0 && g_emaReclaimState=="RECLAIM_EMA21_UP") ||
      (direction<0 && g_emaReclaimState=="LOSE_EMA21_DOWN");
   bool liveMomentum=MomentumSupportsDirection(direction,momentum,0.18);

   // The zone itself is context; at least one live reaction is required.
   bool reaction=
      rejection ||
      executionTurn ||
      m5Body ||
      (m1Body && (paScore>=18.0 || liveMomentum || emaTurn)) ||
      (zoneScore>=75.0 &&
       (paScore>=27.0 || (liveMomentum && g_trendM1==direction)));
   if(!reaction)
      return false;

   scoreOut=zoneScore;
   if(rejection) scoreOut+=8.0;
   if(executionTurn) scoreOut+=7.0;
   if(m5Body) scoreOut+=5.0;
   else if(m1Body) scoreOut+=3.0;
   if(emaTurn) scoreOut+=4.0;
   if(liveMomentum) scoreOut+=3.0;
   scoreOut=MathMin(100.0,scoreOut);

   reasonOut=direction>0
      ? "DEMAND_ZONE_REACTION"
      : "SUPPLY_ZONE_REACTION";
   return true;
}

bool AutoZoneStructureIntact(int direction)
{
   if(direction==0)
      return false;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return false;

   double atrPrice=MathMax(
      _Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );
   double price=(tick.bid+tick.ask)*0.5;
   double breakTolerance=atrPrice*0.18;

   // For the first four AUTO positions, Demand/Supply is the structural guard,
   // not a stack of confidence/progress filters. If no active zone is available,
   // preserve the shared-brain opportunity instead of inventing a new veto.
   if(direction>0 &&
      g_demandZoneScore>=50.0 &&
      g_demandZoneLow>0.0 &&
      g_demandZoneHigh>=g_demandZoneLow)
      return price>=g_demandZoneLow-breakTolerance;

   if(direction<0 &&
      g_supplyZoneScore>=50.0 &&
      g_supplyZoneLow>0.0 &&
      g_supplyZoneHigh>=g_supplyZoneLow)
      return price<=g_supplyZoneHigh+breakTolerance;

   return true;
}

void PublishSharedZoneEntry(int direction,double score)
{
   g_entryModel=direction>0 ? "ZONE_FIRST_DEMAND" : "ZONE_FIRST_SUPPLY";
   g_entryTrigger=direction>0 ? "DEMAND_REACTION_BUY" : "SUPPLY_REACTION_SELL";
   g_entryBias=direction>0 ? "BUY" : "SELL";
   g_entryQualityScore=MathMax(0.0,MathMin(100.0,score));
   g_entryQuality=score>=78.0 ? "A" : score>=65.0 ? "B" : "C";
   g_adaptiveBlockReason="";
}

int SharedAutoManualBrainDirection(double momentum)
{
   double buyScore=0.0;
   double sellScore=0.0;
   string buyReason="NONE";
   string sellReason="NONE";
   bool buyReady=SharedZoneReactionCandidate(1,momentum,buyScore,buyReason);
   bool sellReady=SharedZoneReactionCandidate(-1,momentum,sellScore,sellReason);

   int direction=0;
   double selectedScore=0.0;

   if(g_entryMode==ENTRY_BUY_ONLY)
   {
      if(buyReady)
      {
         direction=1;
         selectedScore=buyScore;
      }
   }
   else if(g_entryMode==ENTRY_SELL_ONLY)
   {
      if(sellReady)
      {
         direction=-1;
         selectedScore=sellScore;
      }
   }
   else if(buyReady || sellReady)
   {
      if(buyReady && !sellReady)
         direction=1;
      else if(sellReady && !buyReady)
         direction=-1;
      else if(MathAbs(buyScore-sellScore)>=2.0)
         direction=buyScore>sellScore ? 1 : -1;
      else if(momentum>0.0)
         direction=1;
      else if(momentum<0.0)
         direction=-1;
      else if(g_macroTrendDirection!=0)
         direction=g_macroTrendDirection;
      else
         direction=buyScore>=sellScore ? 1 : -1;

      selectedScore=direction>0 ? buyScore : sellScore;
   }

   if(direction!=0)
   {
      PublishSharedZoneEntry(direction,selectedScore);
      return EnforceUserDirectionLock(direction);
   }

   // Away from a live zone reaction, keep normal shared market intelligence.
   return BrainV13SmartDirection(momentum);
}


bool BrainV13FastWrongEntryCorrection(double momentum)
{
   int count = BasketPositionCount();
   if(count <= 0)
      return false;

   int direction = BasketDirection();
   if(direction == 0)
      return false;

   double atrPoints = MathMax(
      10.0,
      AverageTrueRangePoints(PERIOD_M5, g_atrPeriod)
   );
   double progress = BasketFavorableProgressPoints(direction);

   // Ignore normal noise. Recovery only arms after a meaningful adverse move.
   if(progress > -atrPoints * 0.12)
      return false;

   int opposite = -direction;
   int oppositeVotes = 0;
   if(MomentumSupportsDirection(opposite, momentum, 0.18)) oppositeVotes++;
   if(g_trendM1 == opposite) oppositeVotes++;
   if(g_trendM5 == opposite) oppositeVotes++;
   if(g_emaTrendM5 == opposite) oppositeVotes++;
   if(g_macroTrendDirection == opposite) oppositeVotes++;
   if(BrainV8ConfirmationCandleReady(opposite)) oppositeVotes++;

   bool severeAdverse = progress <= -atrPoints * 0.35;
   bool confirmedWrong = oppositeVotes >= 4 || (severeAdverse && oppositeVotes >= 3);

   if(!confirmedWrong)
   {
      if(progress <= -atrPoints * 0.18)
      {
         g_executionStatus = "RECOVERY_WATCH";
         g_fillBlockReason = "WRONG_ENTRY_WATCH";
      }
      return false;
   }

   // Do not martingale into a thesis that has already failed. Close the wrong
   // Basket; on the next tick Brain V13 re-scores the market and may enter the
   // opposite side immediately if that direction is still real.
   g_burstActive = false;
   g_burstNeedsRearm = false;
   g_fillBlockReason = "FAST_CORRECTION_EXIT";
   g_reversalStatus = "FAST_CORRECTION_CONFIRMED";
   g_executionStatus = "FAST_CORRECTION_EXIT";
   g_lastCloseReason = "BRAIN_V13_WRONG_ENTRY";

   bool closed = CloseAllBasket("BRAIN_V13_WRONG_ENTRY");
   if(closed)
   {
      ResetTrail();
      ClearMarketRearm();
   }
   return closed;
}

// AUTO Core --------------------------------------------------
// Scope contract: AUTO runs ONLY when the website controlMode is AUTO and the
// isolated RACE engine is not active. Other modes continue through the exact
// legacy non-AUTO paths below this block.
#define AUTO_LIVE_COMMENT "SaaSAuto"
#define MANUAL_LIVE_COMMENT "SaaSManual"
#define LEGACY_BASKET_COMMENT "SaaSBasket"

bool AutoEnabled()
{
   // Entry selection only: Vector Edge/AUTO belongs to AUTO and AUTO alone.
   // Open-position ownership is determined from the broker comment so a later
   // settings change cannot hand an AUTO position to MANUAL/RACE/FLIP.
   if(g_engineMode != "AUTO") return false;
   return EffectiveExecutionMode() == "AUTO" && g_controlMode == "AUTO";
}

bool BasketHasAutoPosition()
{
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(StringFind(PositionGetString(POSITION_COMMENT),AUTO_LIVE_COMMENT)>=0)
         return true;
   }
   return false;
}

bool BasketHasManualPosition()
{
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;

      string comment=PositionGetString(POSITION_COMMENT);
      if(StringFind(comment,MANUAL_LIVE_COMMENT)>=0 ||
         StringFind(comment,LEGACY_BASKET_COMMENT)>=0)
         return true;
   }
   return false;
}

bool BasketHasAutoFamilyPosition()
{
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;

      string comment=PositionGetString(POSITION_COMMENT);
      if(StringFind(comment,AUTO_LIVE_COMMENT)>=0 ||
         StringFind(comment,"SaaSTactical")>=0)
         return true;
   }
   return false;
}

bool AutoOwnsOpenBasket()
{
   return BasketPositionCount()>0 && BasketHasAutoPosition();
}

#include "include\\AutoVectorEdgeLive.mqh"
#include "include\\AutoSwingFilter.mqh"
#include "include\\FlipLockV1.mqh"

// Per-mode risk/P&L ownership ------------------------------------------------
// A live Broker-tagged Basket always owns its own risk profile even if the
// website switches to another mode before that Basket is flat.
string TradeModeFromComment(string comment)
{
   if(StringFind(comment,AUTO_LIVE_COMMENT)>=0 ||
      StringFind(comment,"SaaSTactical")>=0)
      return "AUTO";
   if(StringFind(comment,"SaaSCounter")>=0)
      return "COUNTER";
   if(StringFind(comment,"SaaSRace")>=0)
      return "RACE";
   if(StringFind(comment,FLIP_LOCK_LIVE_COMMENT)>=0 ||
      StringFind(comment,FLIP_LOCK_PENDING_COMMENT)>=0)
      return "FLIP_LOCK";
   if(StringFind(comment,MANUAL_LIVE_COMMENT)>=0 ||
      StringFind(comment,LEGACY_BASKET_COMMENT)>=0)
      return "MANUAL";
   if(IsZeroGridComment(comment))
      return "ZERO_GRID";
   return "";
}

string TradeModeForPositionHistory(ulong positionId)
{
   if(positionId==0 || !HistorySelectByPosition(positionId))
      return "";

   int total=HistoryDealsTotal();
   for(int i=0;i<total;i++)
   {
      ulong ticket=HistoryDealGetTicket(i);
      if(ticket==0) continue;
      long entry=HistoryDealGetInteger(ticket,DEAL_ENTRY);
      if(entry!=DEAL_ENTRY_IN && entry!=DEAL_ENTRY_INOUT) continue;
      if(HistoryDealGetString(ticket,DEAL_SYMBOL)!=_Symbol) continue;

      string mode=TradeModeFromComment(
         HistoryDealGetString(ticket,DEAL_COMMENT)
      );
      if(mode!="")
         return mode;
   }
   return "";
}

string TradeModeForDeal(ulong dealTicket)
{
   if(dealTicket==0 || !HistoryDealSelect(dealTicket))
      return "";
   if(HistoryDealGetString(dealTicket,DEAL_SYMBOL)!=_Symbol)
      return "";

   string directMode=TradeModeFromComment(
      HistoryDealGetString(dealTicket,DEAL_COMMENT)
   );
   if(directMode!="")
      return directMode;

   ulong positionId=(ulong)HistoryDealGetInteger(
      dealTicket,DEAL_POSITION_ID
   );
   return TradeModeForPositionHistory(positionId);
}

string DailyRiskMode()
{
   if(BasketHasFlipLockPosition()) return "FLIP_LOCK";
   if(BasketHasCounterPosition()) return "COUNTER";
   if(BasketHasRacePosition()) return "RACE";
   if(BasketHasAutoFamilyPosition()) return "AUTO";
   if(BasketHasManualPosition()) return "MANUAL";
   if(ZeroGridPositionCount()>0) return "ZERO_GRID";

   string mode=EffectiveExecutionMode();
   if(mode=="RACE" || mode=="COUNTER" || mode=="FLIP_LOCK" ||
      mode=="MANUAL" || mode=="ZERO_GRID")
      return mode;
   return "AUTO";
}

double ModeBasketLossLimit(string mode)
{
   if(mode=="AUTO") return g_autoMaxBasketLoss;
   if(mode=="RACE") return g_raceMaxBasketLoss;
   if(mode=="FLIP_LOCK") return g_flipLockMaxBasketLoss;
   if(mode=="MANUAL") return g_manualMaxBasketLoss;
   return 0.0;
}

double EffectiveDailyLossLimit()
{
   string mode=DailyRiskMode();
   if(mode=="AUTO") return MathMax(0.0,g_autoDailyLoss);
   if(mode=="RACE") return MathMax(0.0,g_raceDailyLoss);
   if(mode=="FLIP_LOCK") return MathMax(0.0,g_flipLockDailyLoss);
   if(mode=="MANUAL") return MathMax(0.0,g_manualDailyLoss);
   return 0.0;
}

double EffectiveDailyProfitTarget()
{
   string mode=DailyRiskMode();
   if(mode=="AUTO") return MathMax(0.0,g_autoDailyProfitTarget);
   if(mode=="RACE") return MathMax(0.0,g_raceDailyProfitTarget);
   if(mode=="FLIP_LOCK") return MathMax(0.0,g_flipLockDailyProfitTarget);
   if(mode=="MANUAL") return MathMax(0.0,g_manualDailyProfitTarget);
   return 0.0;
}

double DailyClosedProfitForMode(string mode)
{
   if(mode=="AUTO") return g_dailyClosedProfitAuto;
   if(mode=="RACE") return g_dailyClosedProfitRace;
   if(mode=="COUNTER") return g_dailyClosedProfitCounter;
   if(mode=="FLIP_LOCK") return g_dailyClosedProfitFlipLock;
   if(mode=="MANUAL") return g_dailyClosedProfitManual;
   return 0.0;
}

double DailyFloatingProfitForMode(string mode)
{
   double total=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic)
         continue;

      string positionMode=TradeModeFromComment(
         PositionGetString(POSITION_COMMENT)
      );
      if(positionMode!=mode)
         continue;

      total+=PositionGetDouble(POSITION_PROFIT);
      total+=PositionGetDouble(POSITION_SWAP);
   }
   return total;
}

double AutoClamp(double value,double minimum,double maximum)
{
   return MathMax(minimum,MathMin(maximum,value));
}

void AutoResetSide(AUTO_SIDE &side,int direction)
{
   side.direction=direction;
   side.confidence=0.0;
   side.rankScore=0.0;
   side.macroScore=0.0;
   side.executionScore=0.0;
   side.momentumScore=0.0;
   side.momentumWithPoints=0.0;
   side.momentumAgainstPoints=0.0;
   side.locationScore=0.0;
   side.pullbackScore=0.0;
   side.pullbackSwingStart=0.0;
   side.pullbackSwingExtreme=0.0;
   side.pullbackRetracement=0.0;
   side.pullbackState="NONE";
   side.entryPrice=0.0;
   side.tpPrice=0.0;
   side.slPrice=0.0;
   side.rr=0.0;
   side.expectedProfitMoney=0.0;
   side.expectedLossMoney=0.0;
   side.knownCostMoney=0.0;
   side.plannedLot=0.0;
   side.aggregateRiskMoney=0.0;
   side.winProbability=0.0;
   side.winSamples=0;
   side.averageNet=0.0;
   side.model="NONE";
   side.reason="NONE";
   side.rejectReason="NONE";
   side.reversal=false;
}

void AutoResetExitCandidate()
{
   g_autoExitCandidateSince=0;
   g_autoExitCandidatePeakAdverse=0.0;
}

void AutoResetCycle()
{
   g_autoBasketStopPrice=0.0;
   g_autoBasketTargetPrice=0.0;
   g_autoBasketStartedAt=0;
   g_autoLastFillAt=0;
   g_autoLotCeiling=0.0;
   g_autoPeakProfit=0.0;
   g_autoAggregateRiskMoney=0.0;
   g_autoAddReason="NONE";
   AutoResetRiskState();
   AutoResetExitCandidate();
}

void AutoScanM5Levels(AUTO_LEVELS &levels)
{
   levels.nearestSupport=0.0;
   levels.nearestResistance=0.0;
   levels.majorSupport=0.0;
   levels.majorResistance=0.0;
   levels.nearestSupportDistanceAtr=99.0;
   levels.nearestResistanceDistanceAtr=99.0;
   levels.majorSupportDistanceAtr=99.0;
   levels.majorResistanceDistanceAtr=99.0;
   levels.nearestSupportStrength=0.0;
   levels.nearestResistanceStrength=0.0;
   levels.majorSupportStrength=0.0;
   levels.majorResistanceStrength=0.0;
   levels.formingBase=0.0;
   levels.formingCeiling=0.0;
   levels.roleFlipState="NONE";

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return;
   double price=(tick.bid+tick.ask)*0.5;
   double atrPrice=MathMax(_Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point);

   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   int copied=CopyRates(_Symbol,PERIOD_M5,1,120,rates);
   if(copied<12)
      return;

   levels.formingBase=MathMin(rates[0].low,MathMin(rates[1].low,rates[2].low));
   levels.formingCeiling=MathMax(rates[0].high,MathMax(rates[1].high,rates[2].high));

   double nearestSupportDistance=DBL_MAX;
   double nearestResistanceDistance=DBL_MAX;
   double majorSupportScore=-DBL_MAX;
   double majorResistanceScore=-DBL_MAX;

   for(int i=2;i<copied-2;i++)
   {
      bool pivotLow=
         rates[i].low<=rates[i-1].low && rates[i].low<rates[i-2].low &&
         rates[i].low<=rates[i+1].low && rates[i].low<rates[i+2].low;
      bool pivotHigh=
         rates[i].high>=rates[i-1].high && rates[i].high>rates[i-2].high &&
         rates[i].high>=rates[i+1].high && rates[i].high>rates[i+2].high;
      if(!pivotLow && !pivotHigh)
         continue;

      double level=pivotLow ? rates[i].low : rates[i].high;
      int touches=0;
      double tolerance=atrPrice*0.08;
      for(int j=0;j<copied;j++)
      {
         if(rates[j].low<=level+tolerance && rates[j].high>=level-tolerance)
            touches++;
      }
      double recency=MathMax(0.0,20.0-(double)i*0.18);
      double strength=AutoClamp(18.0+touches*5.0+recency,0.0,100.0);

      if(pivotLow && level<=price)
      {
         double distance=price-level;
         if(distance<nearestSupportDistance)
         {
            nearestSupportDistance=distance;
            levels.nearestSupport=level;
            levels.nearestSupportStrength=strength;
         }
         double majorScore=strength-(distance/atrPrice)*4.0;
         if(majorScore>majorSupportScore)
         {
            majorSupportScore=majorScore;
            levels.majorSupport=level;
            levels.majorSupportStrength=strength;
         }
      }
      if(pivotHigh && level>=price)
      {
         double distance=level-price;
         if(distance<nearestResistanceDistance)
         {
            nearestResistanceDistance=distance;
            levels.nearestResistance=level;
            levels.nearestResistanceStrength=strength;
         }
         double majorScore=strength-(distance/atrPrice)*4.0;
         if(majorScore>majorResistanceScore)
         {
            majorResistanceScore=majorScore;
            levels.majorResistance=level;
            levels.majorResistanceStrength=strength;
         }
      }

      // A confirmed pivot that price crossed on the latest completed M5 bar is
      // tracked separately from active support/resistance so role changes are
      // never mistaken for an untouched level.
      if(pivotHigh && level<price &&
         rates[0].close>level && rates[1].close<=level)
         levels.roleFlipState="RESISTANCE_TO_SUPPORT";
      if(pivotLow && level>price &&
         rates[0].close<level && rates[1].close>=level)
         levels.roleFlipState="SUPPORT_TO_RESISTANCE";
   }

   if(levels.nearestSupport>0.0)
      levels.nearestSupportDistanceAtr=(price-levels.nearestSupport)/atrPrice;
   if(levels.nearestResistance>0.0)
      levels.nearestResistanceDistanceAtr=(levels.nearestResistance-price)/atrPrice;
   if(levels.majorSupport>0.0)
      levels.majorSupportDistanceAtr=(price-levels.majorSupport)/atrPrice;
   if(levels.majorResistance>0.0)
      levels.majorResistanceDistanceAtr=(levels.majorResistance-price)/atrPrice;
}

void AutoEvaluatePullback(int direction,double momentum,AUTO_PULLBACK &pb)
{
   pb.direction=direction;
   pb.swingStart=0.0;
   pb.swingExtreme=0.0;
   pb.swingRangeAtr=0.0;
   pb.retracement=0.0;
   pb.sequenceValid=false;
   pb.started=false;
   pb.resumed=false;
   pb.tooDeep=false;
   pb.score=35.0;
   pb.state="NO_SWING";

   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   int copied=CopyRates(_Symbol,PERIOD_M5,1,18,rates);
   if(copied<10)
      return;

   int highIndex=0,lowIndex=0;
   double high=rates[0].high,low=rates[0].low;
   for(int i=1;i<copied;i++)
   {
      if(rates[i].high>high) { high=rates[i].high; highIndex=i; }
      if(rates[i].low<low) { low=rates[i].low; lowIndex=i; }
   }
   double atrPrice=MathMax(_Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point);
   double range=MathMax(_Point,high-low);
   pb.swingRangeAtr=range/atrPrice;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return;
   double current=(tick.bid+tick.ask)*0.5;

   if(direction>0)
   {
      pb.swingStart=low;
      pb.swingExtreme=high;
      pb.sequenceValid=lowIndex>highIndex;
      pb.retracement=AutoClamp((high-current)/range,0.0,1.5);
   }
   else
   {
      pb.swingStart=high;
      pb.swingExtreme=low;
      pb.sequenceValid=highIndex>lowIndex;
      pb.retracement=AutoClamp((current-low)/range,0.0,1.5);
   }

   pb.started=pb.sequenceValid && pb.retracement>=0.12;
   pb.tooDeep=pb.retracement>0.78;
   bool directionalBody=
      RecentDirectionalBody(direction,PERIOD_M1) ||
      RecentDirectionalBody(direction,PERIOD_M5);
   double directionalMomentum=(double)direction*momentum;
   pb.resumed=pb.started && !pb.tooDeep && directionalBody &&
      directionalMomentum>=-MathMax(1.0,g_adaptiveMomentumThreshold*0.15);

   if(!pb.sequenceValid)
   {
      pb.score=28.0;
      pb.state="SWING_SEQUENCE_MISMATCH";
   }
   else if(pb.tooDeep)
   {
      pb.score=20.0;
      pb.state="PULLBACK_TOO_DEEP";
   }
   else if(pb.retracement>=0.24 && pb.retracement<=0.58 && pb.resumed)
   {
      pb.score=90.0;
      pb.state="PULLBACK_RESUMED";
   }
   else if(pb.retracement>=0.18 && pb.retracement<=0.70)
   {
      pb.score=pb.resumed ? 78.0 : 58.0;
      pb.state=pb.resumed ? "PULLBACK_RESUMED" : "PULLBACK_IN_PROGRESS";
   }
   else if(pb.retracement<0.12)
   {
      pb.score=52.0;
      pb.state="IMPULSE_NOT_RETRACED";
   }
   else
   {
      pb.score=42.0;
      pb.state="PULLBACK_UNCONFIRMED";
   }
}

void AutoUpdateTrendPhase(double momentum)
{
   int macroScore=g_trendH1*3+g_trendM30*2+g_trendM15*2;
   int macro=macroScore>=3 ? 1 : macroScore<=-3 ? -1 : 0;
   double threshold=MathMax(2.0,g_adaptiveMomentumThreshold);
   string candidate="BALANCED";

   if(macro!=0)
   {
      AUTO_PULLBACK pb;
      AutoEvaluatePullback(macro,momentum,pb);
      double directionalMomentum=(double)macro*momentum;
      bool accelerating=
         directionalMomentum>=threshold*0.75 &&
         g_trendM5==macro &&
         ((macro>0 && g_plusDiM5>=g_minusDiM5) ||
          (macro<0 && g_minusDiM5>=g_plusDiM5));
      bool weakening=
         pb.retracement>=0.58 ||
         (directionalMomentum<=-threshold*0.18 && g_trendM5==-macro) ||
         (g_adxPreviousM5>0.0 && g_adxM5<g_adxPreviousM5-3.0);

      if(weakening)
         candidate=macro>0 ? "UP_WEAKENING" : "DOWN_WEAKENING";
      else if(pb.started && !pb.resumed)
         candidate=macro>0 ? "UP_PULLBACK" : "DOWN_PULLBACK";
      else if(pb.resumed)
         candidate=macro>0 ? "UP_CONTINUATION" : "DOWN_CONTINUATION";
      else if(accelerating)
         candidate=macro>0 ? "UP_ACCELERATION" : "DOWN_ACCELERATION";
      else
         candidate=macro>0 ? "UP_TREND" : "DOWN_TREND";
   }
   else if(g_trendM5!=0 && g_trendM1==g_trendM5)
      candidate=g_trendM5>0 ? "LOCAL_UP" : "LOCAL_DOWN";
   else
      candidate="RANGE_TRANSITION";

   // Two consecutive evaluations are required for an ordinary phase change.
   // This hysteresis stops a single momentum tick from flipping market phase.
   if(candidate==g_autoPhaseCandidate)
      g_autoPhaseCandidateTicks++;
   else
   {
      g_autoPhaseCandidate=candidate;
      g_autoPhaseCandidateTicks=1;
   }

   if(g_autoPhase=="INITIALIZING" ||
      g_autoPhaseCandidateTicks>=2)
   {
      if(g_autoPhase!=candidate)
      {
         g_autoPhase=candidate;
         g_autoPhaseSince=TimeCurrent();
      }
   }
}

double AutoProfitForMove(int direction,double volume,double openPrice,double closePrice)
{
   double result=0.0;
   ENUM_ORDER_TYPE type=direction>0 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   if(!OrderCalcProfit(type,_Symbol,volume,openPrice,closePrice,result))
      return 0.0;
   return result;
}

double AutoReferenceStopMoneyAccountUnits()
{
   string currency=AccountInfoString(ACCOUNT_CURRENCY);
   StringToUpper(currency);

   // Broker-native Cent accounts report money in cents. USD 10 therefore means
   // 1,000 account-currency units there. Standard USD accounts use 10 directly.
   if(currency=="USD")
      return AUTO_REFERENCE_SL_USD;
   if(currency=="USC" || StringFind(currency,"CENT")>=0)
      return AUTO_REFERENCE_SL_USD*100.0;
   return 0.0;
}

double AutoReferenceMoneyStopDistance(int direction,double entryPrice)
{
   if(direction==0 || entryPrice<=0.0)
      return 0.0;

   string symbolUpper=_Symbol;
   StringToUpper(symbolUpper);
   bool xauFamily=
      StringFind(symbolUpper,"XAUUSD")==0 ||
      symbolUpper=="XAUUSC";
   if(!xauFamily)
      return 0.0;

   double targetMoney=AutoReferenceStopMoneyAccountUnits();
   if(targetMoney<=0.0)
      return 0.0;

   double tickSize=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
   if(tickSize<=0.0)
      tickSize=_Point;
   if(tickSize<=0.0)
      return 0.0;

   double probePrice=direction>0
      ? entryPrice-tickSize
      : entryPrice+tickSize;
   double oneTickLoss=MathAbs(AutoProfitForMove(
      direction,
      AUTO_REFERENCE_SL_LOT,
      entryPrice,
      probePrice
   ));
   if(oneTickLoss<=0.0)
      return 0.0;

   double ticks=MathCeil(targetMoney/oneTickLoss);
   return MathMax(tickSize,ticks*tickSize);
}

// Net RR remains execution telemetry and a ranking input. It is deliberately
// not an entry gate: AUTO must evaluate and execute valid market opportunities
// rather than wait indefinitely for a fixed reward/risk number.
double AutoNetRewardRisk(double grossReward,double grossRisk,double cost)
{
   if(grossReward<=0.0 || grossRisk<=0.0 || grossReward<=cost)
      return 0.0;
   return (grossReward-cost)/(grossRisk+cost);
}

void AutoPlanPrices(AUTO_SIDE &side,AUTO_LEVELS &levels)
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return;
   double atrPrice=MathMax(_Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point);
   side.entryPrice=side.direction>0 ? tick.ask : tick.bid;

   // XAUUSD standard: USD 10 at 0.01 lot is the CENTER reference, not a
   // fixed stop and not a minimum. ATR + live structure choose the actual stop
   // inside an approximately USD 8-12 reference band. Balance/equity and the
   // customer's actual Lot never change the SL price distance.
   double referenceMoneyStop=AutoReferenceMoneyStopDistance(
      side.direction,side.entryPrice
   );
   double atrFallback=atrPrice*AUTO_STOP_ATR_FLOOR;
   double spreadPoints=CurrentSpreadPoints();
   double spreadFloorPrice=
      (spreadPoints>0.0 && spreadPoints<999999.0)
      ? spreadPoints*_Point*AUTO_STOP_SPREAD_MULTIPLIER
      : 0.0;
   double brokerFloorPoints=MathMax(
      (double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL),
      (double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_FREEZE_LEVEL)
   )+2.0;
   double brokerFloorPrice=brokerFloorPoints*_Point;

   double standardStopFloor=0.0;
   double structureStopCap=0.0;
   double stopDistance=0.0;

   if(referenceMoneyStop>0.0)
   {
      // Dynamic XAU stop centered near USD 10 @ 0.01 lot.
      // Example on a standard XAU contract: roughly USD 8-12 loss equivalent.
      double referenceMin=
         referenceMoneyStop*AUTO_REFERENCE_SL_MIN_RATIO;
      double referenceMax=
         referenceMoneyStop*AUTO_REFERENCE_SL_MAX_RATIO;

      // Spread and broker rules are hard mechanical floors. If either exceeds
      // the normal band, obey the broker rather than submit an invalid stop.
      standardStopFloor=MathMax(
         referenceMin,
         MathMax(spreadFloorPrice,brokerFloorPrice)
      );
      structureStopCap=MathMax(standardStopFloor,referenceMax);

      // ATR decides where we start INSIDE the band; it no longer forces every
      // XAU trade to exactly the USD 10 reference distance.
      stopDistance=AutoClamp(
         atrFallback,
         standardStopFloor,
         structureStopCap
      );
   }
   else
   {
      // Non-XAU / unsupported account currency keeps the volatility fallback.
      standardStopFloor=MathMax(
         atrFallback,
         MathMax(spreadFloorPrice,brokerFloorPrice)
      );
      structureStopCap=MathMax(
         standardStopFloor,
         atrPrice*AUTO_STOP_ATR_CAP
      );
      stopDistance=standardStopFloor;
   }

   bool zoneStopApplied=false;

   // Zone-First AUTO may widen the dynamic stop toward Demand/Supply, but only
   // inside the reference band (unless broker mechanics force a wider floor).
   if(side.direction>0 &&
      g_demandZoneLow>0.0 && g_demandZoneHigh>=g_demandZoneLow &&
      side.entryPrice<=g_demandZoneHigh+atrPrice*0.30)
   {
      double zoneDistance=side.entryPrice-(g_demandZoneLow-atrPrice*0.10);
      if(zoneDistance>0.0 && zoneDistance<=structureStopCap)
      {
         stopDistance=MathMax(stopDistance,zoneDistance);
         zoneStopApplied=true;
      }
   }
   else if(side.direction<0 &&
           g_supplyZoneLow>0.0 && g_supplyZoneHigh>=g_supplyZoneLow &&
           side.entryPrice>=g_supplyZoneLow-atrPrice*0.30)
   {
      double zoneDistance=(g_supplyZoneHigh+atrPrice*0.10)-side.entryPrice;
      if(zoneDistance>0.0 && zoneDistance<=structureStopCap)
      {
         stopDistance=MathMax(stopDistance,zoneDistance);
         zoneStopApplied=true;
      }
   }

   // Without an active entry zone, use nearest confirmed structure when it
   // needs more breathing room than the standard floor.
   if(!zoneStopApplied &&
      side.direction>0 && levels.nearestSupport>0.0 &&
      levels.nearestSupport<side.entryPrice)
   {
      double structureDistance=side.entryPrice-(levels.nearestSupport-atrPrice*0.08);
      if(structureDistance>0.0 &&
         structureDistance<=structureStopCap)
         stopDistance=MathMax(stopDistance,structureDistance);
   }
   else if(!zoneStopApplied &&
           side.direction<0 && levels.nearestResistance>side.entryPrice)
   {
      double structureDistance=(levels.nearestResistance+atrPrice*0.08)-side.entryPrice;
      if(structureDistance>0.0 &&
         structureDistance<=structureStopCap)
         stopDistance=MathMax(stopDistance,structureDistance);
   }

   // Keep AUTO bounded near the dynamic reference band. The configured
   // system hard stop may tighten only the outer envelope; it can never shrink
   // the initial SL below the mechanical/reference floor.
   double maximumStop=structureStopCap;
   double configuredStop=EffectiveStopLossDistancePoints()*_Point;
   if(configuredStop>standardStopFloor)
      maximumStop=MathMin(maximumStop,configuredStop);
   maximumStop=MathMax(maximumStop,standardStopFloor);
   stopDistance=AutoClamp(
      stopDistance,
      standardStopFloor,
      maximumStop
   );

   // Default target must be meaningfully larger than the protected stop. A
   // nearby opposing M5 level may shorten it; the net-RR policy then rejects
   // that setup instead of accepting a trade that can lose more than it earns.
   double targetDistance=MathMax(atrPrice*0.76,stopDistance*1.55);

   // Zone-First AUTO targets the nearest opposing reaction area and banks
   // slightly before the exact level: BUY -> Supply/Resistance,
   // SELL -> Demand/Support.
   double opposingLevel=side.direction>0
      ? ClosestAbove(
         side.entryPrice,
         g_supplyZoneLow,
         levels.nearestResistance,
         levels.majorResistance
      )
      : ClosestBelow(
         side.entryPrice,
         g_demandZoneHigh,
         levels.nearestSupport,
         levels.majorSupport
      );
   if(opposingLevel>0.0)
   {
      double room=MathAbs(opposingLevel-side.entryPrice)-atrPrice*0.06;
      if(room>=atrPrice*0.30 && room<=atrPrice*1.60)
         targetDistance=MathMin(targetDistance,room);
   }
   // Do not let the old 1.35 ATR cap silently destroy the planned RR after
   // widening the standard SL. Nearby opposing structure may still shorten TP.
   double targetDistanceCap=MathMax(atrPrice*1.35,stopDistance*1.80);
   targetDistance=AutoClamp(targetDistance,atrPrice*0.30,targetDistanceCap);

   side.slPrice=side.direction>0
      ? side.entryPrice-stopDistance
      : side.entryPrice+stopDistance;
   side.tpPrice=side.direction>0
      ? side.entryPrice+targetDistance
      : side.entryPrice-targetDistance;

   double grossProfitPerLot=MathAbs(AutoProfitForMove(
      side.direction,1.0,side.entryPrice,side.tpPrice));
   double grossLossPerLot=MathAbs(AutoProfitForMove(
      side.direction,1.0,side.entryPrice,side.slPrice));
   double costPerLot=CurrentSpreadCost(1.0);
   side.rr=AutoNetRewardRisk(grossProfitPerLot,grossLossPerLot,costPerLot);

   // AUTO Lot is customer-owned and fixed. Intelligence decides whether/when
   // to enter, but never scales 50%/75% behind the value shown on the website.
   side.plannedLot=NormalizeTradeVolume(g_lot);
   side.knownCostMoney=costPerLot*side.plannedLot;
   side.expectedProfitMoney=MathMax(0.0,grossProfitPerLot*side.plannedLot-side.knownCostMoney);
   side.expectedLossMoney=grossLossPerLot*side.plannedLot+side.knownCostMoney;
}

double AutoAggregateRiskAtStop(int direction,double stopPrice,double newLot)
{
   if(stopPrice<=0.0)
      return 0.0;
   double risk=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(StringFind(PositionGetString(POSITION_COMMENT),"SaaSRace")>=0) continue;
      long type=PositionGetInteger(POSITION_TYPE);
      int posDirection=type==POSITION_TYPE_BUY ? 1 : -1;
      if(posDirection!=direction) continue;
      double p=AutoProfitForMove(
         direction,
         PositionGetDouble(POSITION_VOLUME),
         PositionGetDouble(POSITION_PRICE_OPEN),
         stopPrice
      );
      if(p<0.0) risk+=-p;
   }

   if(newLot>0.0)
   {
      MqlTick tick;
      if(SymbolInfoTick(_Symbol,tick))
      {
         double entry=direction>0 ? tick.ask : tick.bid;
         double p=AutoProfitForMove(direction,newLot,entry,stopPrice);
         if(p<0.0) risk+=-p;
      }
   }
   return risk;
}

void AutoAttachHistory(AUTO_SIDE &side)
{
   bool setupMatch=
      g_setupWinSamples>0 &&
      g_setupHistoryDirection==side.direction &&
      g_setupHistoryModel==side.model;
   if(setupMatch)
   {
      side.winProbability=g_setupWinProbability;
      side.winSamples=g_setupWinSamples;
      side.averageNet=g_setupAverageNet;
   }
   else if(side.direction>0)
   {
      side.winProbability=g_buyWinProbability;
      side.winSamples=g_buyWinSamples;
      side.averageNet=g_buyAverageNet;
   }
   else
   {
      side.winProbability=g_sellWinProbability;
      side.winSamples=g_sellWinSamples;
      side.averageNet=g_sellAverageNet;
   }

   // Real statistics stay separate from model Confidence. History contributes
   // only a small reliability-weighted rank adjustment, never overwrites the
   // model score or masquerades as Confidence.
   if(side.winSamples>=20)
   {
      double reliability=MathMin(1.0,(double)side.winSamples/60.0);
      side.rankScore+=AutoClamp(
         (side.winProbability-50.0)*0.10*reliability,-4.0,4.0);
   }
}

void AutoEvaluateSide(
   int direction,
   double momentum,
   AUTO_LEVELS &levels,
   AUTO_SIDE &side
)
{
   AutoResetSide(side,direction);
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
   {
      side.rejectReason="NO_TICK";
      return;
   }

   double threshold=MathMax(2.0,g_adaptiveMomentumThreshold);
   double directionalNow=(double)direction*momentum;
   double directionalPrevious=(double)direction*g_autoPreviousMomentum;
   side.momentumWithPoints=MathMax(0.0,directionalNow);
   side.momentumAgainstPoints=MathMax(0.0,-directionalNow);

   // Macro direction: H1/M30/M15 only. EMA may corroborate once, but cannot be
   // counted repeatedly as a second copy of the same old trend.
   double macro=0.0;
   if(g_trendH1==direction) macro+=12.0; else if(g_trendH1==-direction) macro-=12.0;
   if(g_trendM30==direction) macro+=9.0; else if(g_trendM30==-direction) macro-=9.0;
   if(g_trendM15==direction) macro+=7.0; else if(g_trendM15==-direction) macro-=7.0;
   int emaMacroVotes=0;
   if(g_emaTrendH1==direction) emaMacroVotes++;
   if(g_emaTrendM30==direction) emaMacroVotes++;
   if(g_emaTrendM15==direction) emaMacroVotes++;
   int emaMacroAgainst=0;
   if(g_emaTrendH1==-direction) emaMacroAgainst++;
   if(g_emaTrendM30==-direction) emaMacroAgainst++;
   if(g_emaTrendM15==-direction) emaMacroAgainst++;
   if(emaMacroVotes>=2) macro+=4.0;
   else if(emaMacroAgainst>=2) macro-=4.0;
   side.macroScore=AutoClamp(macro,-24.0,24.0);

   // Execution timing is M5/M1. EMA M5 is one corroborating vote, not another
   // complete trend stack.
   double execution=0.0;
   if(g_trendM5==direction) execution+=14.0; else if(g_trendM5==-direction) execution-=13.0;
   if(g_trendM1==direction) execution+=7.0; else if(g_trendM1==-direction) execution-=7.0;
   if(g_emaTrendM5==direction) execution+=4.0;
   else if(g_emaTrendM5==-direction) execution-=4.0;
   double pa=direction>0 ? g_priceActionBuyScore : g_priceActionSellScore;
   execution+=AutoClamp(pa/5.0,0.0,7.0);
   side.executionScore=AutoClamp(execution,-24.0,24.0);

   // Momentum is strictly directional. Opposing momentum is a penalty, never
   // converted to positive Confidence through MathAbs(). Reversal setups use
   // deceleration/turn evidence separately.
   double momentumScore=0.0;
   if(directionalNow>0.0)
      momentumScore+=MathMin(14.0,directionalNow/threshold*11.0);
   else if(directionalNow<0.0)
      momentumScore-=MathMin(18.0,(-directionalNow)/threshold*14.0);

   int macroDirection=g_macroTrendDirection;
   side.reversal=macroDirection!=0 && macroDirection==-direction;
   if(side.reversal)
   {
      bool turned=directionalNow>0.0 && directionalPrevious<=0.0;
      bool deceleratingAgainst=
         directionalNow>directionalPrevious+threshold*0.15;
      if(turned) momentumScore+=12.0;
      else if(deceleratingAgainst) momentumScore+=7.0;
      else momentumScore-=8.0;
   }
   side.momentumScore=AutoClamp(momentumScore,-20.0,20.0);

   AUTO_PULLBACK pb;
   AutoEvaluatePullback(direction,momentum,pb);
   side.pullbackScore=pb.score;
   side.pullbackSwingStart=pb.swingStart;
   side.pullbackSwingExtreme=pb.swingExtreme;
   side.pullbackRetracement=pb.retracement;
   side.pullbackState=pb.state;

   double location=0.0;
   if(direction>0)
   {
      if(levels.nearestSupportDistanceAtr<=0.45)
         location+=MathMin(10.0,levels.nearestSupportStrength*0.10);
      if(levels.nearestResistanceDistanceAtr<=0.24)
         location-=12.0;
      location+=AutoClamp((g_demandZoneScore-50.0)*0.10,-4.0,6.0);
      location-=MathMax(0.0,(g_supplyZoneScore-65.0)*0.08);
      if(levels.roleFlipState=="RESISTANCE_TO_SUPPORT") location+=5.0;
   }
   else
   {
      if(levels.nearestResistanceDistanceAtr<=0.45)
         location+=MathMin(10.0,levels.nearestResistanceStrength*0.10);
      if(levels.nearestSupportDistanceAtr<=0.24)
         location-=12.0;
      location+=AutoClamp((g_supplyZoneScore-50.0)*0.10,-4.0,6.0);
      location-=MathMax(0.0,(g_demandZoneScore-65.0)*0.08);
      if(levels.roleFlipState=="SUPPORT_TO_RESISTANCE") location+=5.0;
   }
   side.locationScore=AutoClamp(location,-18.0,18.0);

   double confidence=50.0+
      side.macroScore*0.55+
      side.executionScore*0.80+
      side.momentumScore*0.70+
      side.locationScore*0.60+
      (side.pullbackScore-50.0)*0.18;

   bool phaseSupports=
      (direction>0 && (StringFind(g_autoPhase,"UP_")==0 || g_autoPhase=="LOCAL_UP")) ||
      (direction<0 && (StringFind(g_autoPhase,"DOWN_")==0 || g_autoPhase=="LOCAL_DOWN"));
   bool phaseWeakening=StringFind(g_autoPhase,"WEAKENING")>=0;
   if(phaseSupports && !phaseWeakening) confidence+=4.0;
   if(side.reversal && phaseWeakening) confidence+=5.0;
   if(side.reversal && !phaseWeakening && g_trendM5==-direction) confidence-=7.0;

   side.confidence=AutoClamp(confidence,0.0,100.0);

   if(side.reversal)
   {
      side.model="AUTO_REVERSAL";
      side.reason=pb.resumed ? "REVERSAL_DECEL_PULLBACK_RESUME" : "REVERSAL_DECEL_EXECUTION";
   }
   else if(pb.started && pb.resumed)
   {
      side.model="AUTO_PULLBACK_CONTINUATION";
      side.reason="UNIFIED_PULLBACK_RESUME";
   }
   else if((direction>0 && levels.roleFlipState=="RESISTANCE_TO_SUPPORT") ||
           (direction<0 && levels.roleFlipState=="SUPPORT_TO_RESISTANCE"))
   {
      side.model="AUTO_BREAKOUT_RETEST";
      side.reason="CONFIRMED_LEVEL_ROLE_FLIP";
   }
   else if(macroDirection==direction)
   {
      side.model="AUTO_TREND_CONTINUATION";
      side.reason="MACRO_WITH_EXECUTION";
   }
   else
   {
      side.model="AUTO_RANGE_REACTION";
      side.reason="LOCAL_EXECUTION_LOCATION";
   }

   AutoPlanPrices(side,levels);
   side.rankScore=side.confidence;
   if(side.rr>=1.55) side.rankScore+=5.0;
   else if(side.rr>=1.20) side.rankScore+=2.0;
   else if(side.rr<1.00) side.rankScore-=10.0;
   else if(side.rr<1.10) side.rankScore-=5.0;
   AutoAttachHistory(side);
   side.rankScore=AutoClamp(side.rankScore,0.0,100.0);
}

void AutoPublishSelected(AUTO_SIDE &side)
{
   g_entryModel=side.model;
   g_entryTrigger=side.direction>0 ? "AUTO_BUY" : "AUTO_SELL";
   g_entryBias=side.direction>0 ? "BUY" : "SELL";
   g_entryQualityScore=side.rankScore;
   g_entryQuality=side.rankScore>=78.0 ? "A" : side.rankScore>=68.0 ? "B" : "C";
   g_modelConfidence=side.confidence;
   g_signalConfidence=side.confidence;
   g_historicalWinProbability=side.winProbability;
   g_historicalWinSamples=side.winSamples;
   g_confidenceSource="MODEL_SEPARATE_FROM_HISTORY";
   g_autoConfidence=side.confidence;
   g_autoWinProbability=side.winProbability;
   g_autoWinSamples=side.winSamples;
   g_autoAverageNet=side.averageNet;
   g_adaptiveLot=side.plannedLot;
   g_adaptiveMaxPositions=g_maxPositions;
   g_adaptiveEntrySpacingMs=g_minOrderIntervalMs;
   g_effectiveConfidenceThreshold=0.0;
}

int AutoPrecisionDirection(double momentum)
{
   g_autoDecisionId++;
   g_autoDecisionKind=BasketPositionCount()>0 ? "ADD" : "FIRST";
   g_autoDecisionReason="NONE";
   g_autoRejectReason="NONE";
   g_autoDirectionChangeReason="NONE";
   g_autoAddReason="NONE";

   g_autoPreviousMomentum=g_autoLastMomentum;
   AutoUpdateTrendPhase(momentum);
   AutoScanM5Levels(g_autoLevels);
   AutoEvaluateSide(1,momentum,g_autoLevels,g_autoBuy);
   AutoEvaluateSide(-1,momentum,g_autoLevels,g_autoSell);
   g_autoLastMomentum=momentum;

   int count=BasketPositionCount();
   bool relaxedFirstFour=count<4;
   int basketDirection=count>0 ? BasketDirection() : 0;
   int preliminary=
      g_autoBuy.confidence>g_autoSell.confidence ? 1 :
      g_autoSell.confidence>g_autoBuy.confidence ? -1 : 0;

   AUTO_SIDE selected;
   AutoResetSide(selected,0);
   int direction=0;
   bool sharedZoneFirst=false;

   if(count>0)
   {
      if(basketDirection==0)
      {
         g_autoRejectReason="MIXED_AUTO_BASKET";
         g_adaptiveBlockReason="AUTO_MIXED_BASKET";
         return 0;
      }
      direction=basketDirection;
      selected=direction>0 ? g_autoBuy : g_autoSell;
   }
   else
   {
      direction=SharedAutoManualBrainDirection(momentum);
      sharedZoneFirst=StringFind(g_entryModel,"ZONE_FIRST_")==0;
      if(direction==0)
      {
         g_autoRejectReason="SHARED_BRAIN_WAIT";
         if(g_adaptiveBlockReason=="")
            g_adaptiveBlockReason="WAITING_ZONE_REACTION";
         return 0;
      }
      selected=direction>0 ? g_autoBuy : g_autoSell;
   }

   // Positions 2-4 rely mainly on winner-only progress + swing
   // confirmation. Position 5+ keeps the stricter legacy score floor.
   if(!relaxedFirstFour)
   {
      double minimumConfidence=62.0;
      double minimumRank=66.0;
      if(g_marketRegime=="HIGH_VOLATILITY")
      {
         minimumConfidence+=3.0;
         minimumRank+=3.0;
      }
      else if(g_marketRegime=="RANGE")
         minimumRank+=2.0;

      if(selected.confidence<minimumConfidence || selected.rankScore<minimumRank)
      {
         g_autoRejectReason="CENTRAL_SCORE_NOT_READY";
         g_adaptiveBlockReason="AUTO_WAIT_QUALITY";
         return 0;
      }
   }

   if(sharedZoneFirst)
   {
      selected.model=direction>0
         ? "AUTO_DEMAND_REACTION"
         : "AUTO_SUPPLY_REACTION";
      selected.reason=direction>0
         ? "DEMAND_ZONE_REACTION"
         : "SUPPLY_ZONE_REACTION";
      double zoneQuality=direction>0 ? g_demandZoneScore : g_supplyZoneScore;
      selected.rankScore=MathMax(selected.rankScore,MathMin(100.0,zoneQuality));
   }

   // The first AUTO order is deliberately the most selective. Run this after
   // Zone-First can contribute its real location quality.
   if(count<=0)
   {
      // Keep the first AUTO entry selective without starving execution.
      // HTF/location/confirmation filters still protect the trade later.
      double firstMinimumConfidence=54.0;
      double firstMinimumRank=56.0;
      if(g_marketRegime=="HIGH_VOLATILITY")
      {
         firstMinimumConfidence+=2.0;
         firstMinimumRank+=2.0;
      }
      else if(g_marketRegime=="RANGE")
         firstMinimumRank+=1.0;

      if(selected.confidence<firstMinimumConfidence ||
         selected.rankScore<firstMinimumRank)
      {
         g_autoRejectReason="AUTO_FIRST_QUALITY_NOT_READY";
         g_adaptiveBlockReason=g_autoRejectReason;
         return 0;
      }
   }

   // AUTO first-entry contract:
   // H4 anchors direction, H1 must not oppose it, price must be at a real
   // pullback/value/retest location, and M5/M1 must confirm execution.
   // Major USD news pauses new AUTO entries only; open positions keep their
   // normal local risk/profit management.
   if(count<=0)
   {
      AUTO_PULLBACK firstPb;
      AutoEvaluatePullback(direction,momentum,firstPb);
      string swingReason="NONE";
      if(!AutoSwingEntryAllowed(
            direction,false,sharedZoneFirst,firstPb,
            g_autoLevels,momentum,swingReason))
      {
         g_autoRejectReason=swingReason;
         g_adaptiveBlockReason=swingReason;
         return 0;
      }

      // Genuine NO-TRADE state: when both AUTO sides are nearly tied and no
      // high-quality zone reaction breaks the tie, wait instead of forcing a
      // fallback BUY/SELL from old chart context.
      double confidenceEdge=MathAbs(g_autoBuy.confidence-g_autoSell.confidence);
      double rankEdge=MathAbs(g_autoBuy.rankScore-g_autoSell.rankScore);
      if(!sharedZoneFirst && g_macroTrendDirection==0 &&
         confidenceEdge<2.5 && rankEdge<3.0)
      {
         g_autoRejectReason="AUTO_FIRST_DIRECTION_AMBIGUOUS";
         g_adaptiveBlockReason=g_autoRejectReason;
         return 0;
      }

      // RR is now a real first-entry gate, not just a ranking adjustment.
      if(selected.rr<AUTO_FIRST_ENTRY_MIN_NET_RR)
      {
         g_autoRejectReason="AUTO_FIRST_RR_TOO_LOW";
         g_adaptiveBlockReason=g_autoRejectReason;
         return 0;
      }

      datetime firstNow=TimeCurrent();
      if(g_autoFirstEntryRunStartedAt<=0)
      {
         g_autoFirstEntryRunStartedAt=firstNow;
         g_autoFirstEntryCandidateSince=0;
         g_autoFirstEntryCandidateLastSeenAt=0;
         g_autoFirstEntryCandidateDirection=0;
      }

      if(firstNow-g_autoFirstEntryRunStartedAt<AUTO_FIRST_ENTRY_START_WARMUP_SECONDS)
      {
         g_autoRejectReason="AUTO_FIRST_FRESH_WARMUP";
         g_adaptiveBlockReason=g_autoRejectReason;
         return 0;
      }

      bool candidateBroken=
         g_autoFirstEntryCandidateDirection!=direction ||
         g_autoFirstEntryCandidateSince<=0 ||
         g_autoFirstEntryCandidateLastSeenAt<=0 ||
         firstNow-g_autoFirstEntryCandidateLastSeenAt>AUTO_FIRST_ENTRY_SIGNAL_GAP_SECONDS;
      if(candidateBroken)
      {
         g_autoFirstEntryCandidateDirection=direction;
         g_autoFirstEntryCandidateSince=firstNow;
         g_autoFirstEntryCandidateLastSeenAt=firstNow;
         g_autoRejectReason="AUTO_FIRST_FRESH_CONFIRM_ARMED";
         g_adaptiveBlockReason=g_autoRejectReason;
         return 0;
      }

      g_autoFirstEntryCandidateLastSeenAt=firstNow;
      if(firstNow-g_autoFirstEntryCandidateSince<AUTO_FIRST_ENTRY_STABLE_CONFIRM_SECONDS)
      {
         g_autoRejectReason="AUTO_FIRST_FRESH_CONFIRM_WAIT";
         g_adaptiveBlockReason=g_autoRejectReason;
         return 0;
      }
   }

   if(count>0)
   {
      // Never increase AUTO exposure while a wrong-direction exit candidate is
      // armed. The existing basket must recover or exit before another add.
      if(g_autoExitCandidateSince>0)
      {
         g_autoRejectReason="EXIT_CANDIDATE_NO_ADD";
         g_autoAddReason="WAIT_WRONG_DIRECTION_RESOLUTION";
         g_adaptiveBlockReason="AUTO_EXIT_CANDIDATE";
         return 0;
      }

      AutoApplyNoIncreaseLotCap(selected);
      if(direction>0) g_autoBuy=selected; else g_autoSell=selected;

      double atrPoints=MathMax(10.0,
         AverageTrueRangePoints(PERIOD_M5,g_atrPeriod));
      double progress=BasketFavorableProgressPoints(direction);
      AUTO_PULLBACK pb;
      AutoEvaluatePullback(direction,momentum,pb);
      double addProgressFactor=relaxedFirstFour ? 0.05 : 0.08;
      double required=MathMax(2.0,atrPoints*addProgressFactor);
      required=MathMax(required,AutoAddRequiredProgressPoints(atrPoints));

      string addSwingReason="NONE";
      if(!AutoSwingEntryAllowed(
            direction,true,false,pb,g_autoLevels,momentum,addSwingReason))
      {
         g_autoRejectReason=addSwingReason;
         g_autoAddReason="WAIT_SWING_QUALITY";
         g_adaptiveBlockReason=addSwingReason;
         return 0;
      }

      if(relaxedFirstFour && !AutoZoneStructureIntact(direction))
      {
         g_autoRejectReason="ACTIVE_ZONE_STRUCTURE_BROKEN";
         g_autoAddReason="WAIT_ZONE_STRUCTURE";
         g_adaptiveBlockReason="AUTO_WAIT_ZONE_STRUCTURE";
         return 0;
      }

      // Every AUTO add (position 2+) is winner-only. Positions 2-4 use a light
      // 0.05 ATR hurdle to preserve trade activity. Position 5+ keeps 0.08 ATR.
      if(progress<0.0 || (progress<required && !pb.resumed))
      {
         g_autoRejectReason="ADD_NEEDS_FAVORABLE_PROGRESS";
         g_autoAddReason="WAIT_PROGRESS_OR_PULLBACK_RESUME";
         g_adaptiveBlockReason="AUTO_WAIT_ADD";
         return 0;
      }
      g_autoAddReason=relaxedFirstFour
         ? (progress>=required ? "EARLY_WINNER_PROGRESS" : "EARLY_PULLBACK_RESUME")
         : (progress>=required ? "FAVORABLE_PROGRESS" : "UNIFIED_PULLBACK_RESUME");

      selected.aggregateRiskMoney=AutoAggregateRiskAtStop(
         direction,
         g_autoBasketStopPrice>0.0 ? g_autoBasketStopPrice : selected.slPrice,
         selected.plannedLot
      )+selected.knownCostMoney;
      g_autoAggregateRiskMoney=selected.aggregateRiskMoney;
   }
   else
   {
      AutoApplyNoIncreaseLotCap(selected);
      if(direction>0) g_autoBuy=selected; else g_autoSell=selected;
      g_autoAggregateRiskMoney=selected.expectedLossMoney;
   }

   string riskReason="NONE";
   if(!AutoRiskBudgetAllows(selected,count,riskReason))
   {
      g_autoRejectReason=riskReason;
      g_adaptiveBlockReason="AUTO_RISK_BUDGET";
      return 0;
   }

   if(preliminary!=0 && preliminary!=direction)
      g_autoDirectionChangeReason="FINAL_RR_LOCATION_HISTORY_CHANGED_SIDE";

   string vectorLiveReason="NONE";
   bool vectorLiveAllowed=AutoVectorEdgeLiveAllow(direction,vectorLiveReason);
   if(!vectorLiveAllowed && count<=0 &&
      vectorLiveReason!="VECTOR_EDGE_TOO_WEAK")
   {
      // First entry still hard-blocks negative expectancy or opposite Vector
      // direction. Weak but positive same-direction edge is advisory only.
      g_autoRejectReason=vectorLiveReason;
      g_adaptiveBlockReason="AUTO_VECTOR_EDGE_FIRST_WAIT";
      g_cachedAdaptiveDirection=0;
      g_cachedAdaptiveBlockReason=g_adaptiveBlockReason;
      return 0;
   }
   if(!vectorLiveAllowed && !relaxedFirstFour)
   {
      // Position 5+ keeps the existing strict Vector Edge guard.
      g_autoRejectReason=vectorLiveReason;
      g_adaptiveBlockReason="AUTO_VECTOR_EDGE_WAIT";
      g_cachedAdaptiveDirection=0;
      g_cachedAdaptiveBlockReason=g_adaptiveBlockReason;
      return 0;
   }
   if(!vectorLiveAllowed && count>0 && relaxedFirstFour &&
      (vectorLiveReason=="VECTOR_SELECTED_NEGATIVE_EV" ||
       vectorLiveReason=="VECTOR_DIRECTION_DISAGREE"))
   {
      // Positions 2-4 remain less strict than late adds, but confirmed negative
      // expectancy or an opposite Vector direction is still a hard AUTO veto.
      g_autoRejectReason=vectorLiveReason;
      g_adaptiveBlockReason="AUTO_VECTOR_EDGE_SAFETY_WAIT";
      g_cachedAdaptiveDirection=0;
      g_cachedAdaptiveBlockReason=g_adaptiveBlockReason;
      return 0;
   }

   g_autoDecisionReason=selected.reason;
   g_autoRejectReason="NONE";
   g_adaptiveBlockReason="";
   AutoPublishSelected(selected);
   g_cachedAdaptiveDirection=direction;
   g_cachedAdaptiveBlockReason="";

   Print("AUTO decision id=",g_autoDecisionId,
         " kind=",g_autoDecisionKind,
         " side=",direction>0 ? "BUY" : "SELL",
         " buy=",DoubleToString(g_autoBuy.rankScore,1),
         " sell=",DoubleToString(g_autoSell.rankScore,1),
         " confidence=",DoubleToString(selected.confidence,1),
         " winProb=",DoubleToString(selected.winProbability,1),
         " samples=",selected.winSamples,
         " rr=",DoubleToString(selected.rr,2),
         " reason=",selected.reason,
         " addReason=",g_autoAddReason,
         " change=",g_autoDirectionChangeReason);
   return direction;
}

double AutoExistingLotCeiling()
{
   double ceiling=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(StringFind(PositionGetString(POSITION_COMMENT),AUTO_LIVE_COMMENT)<0) continue;
      double volume=PositionGetDouble(POSITION_VOLUME);
      if(volume>0.0 && (ceiling<=0.0 || volume<ceiling)) ceiling=volume;
   }
   return ceiling;
}

double AutoWeightedEntryPrice(int direction)
{
   double weighted=0.0,total=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(StringFind(PositionGetString(POSITION_COMMENT),AUTO_LIVE_COMMENT)<0) continue;
      long type=PositionGetInteger(POSITION_TYPE);
      int posDirection=type==POSITION_TYPE_BUY ? 1 : -1;
      if(posDirection!=direction) continue;
      double volume=PositionGetDouble(POSITION_VOLUME);
      if(volume<=0.0) continue;
      weighted+=PositionGetDouble(POSITION_PRICE_OPEN)*volume;
      total+=volume;
   }
   return total>0.0 ? weighted/total : 0.0;
}

void AutoRecoverCanonicalProtection(int direction)
{
   if(direction==0) return;
   double stop=0.0,target=0.0,lotCeiling=0.0;
   long targetOpenedAt=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(StringFind(PositionGetString(POSITION_COMMENT),AUTO_LIVE_COMMENT)<0) continue;
      long type=PositionGetInteger(POSITION_TYPE);
      int posDirection=type==POSITION_TYPE_BUY ? 1 : -1;
      if(posDirection!=direction) continue;
      double sl=PositionGetDouble(POSITION_SL);
      double tp=PositionGetDouble(POSITION_TP);
      double volume=PositionGetDouble(POSITION_VOLUME);
      long openedAt=(long)PositionGetInteger(POSITION_TIME_MSC);
      if(sl>0.0) stop=stop<=0.0 ? sl : (direction>0 ? MathMax(stop,sl) : MathMin(stop,sl));
      // Upgrade/restart migration: the oldest AUTO position owns the original
      // AUTO Basket TP. Never recover a later add's historical rewritten TP.
      if(tp>0.0 && (targetOpenedAt==0 || openedAt<targetOpenedAt))
      {
         target=tp;
         targetOpenedAt=openedAt;
      }
      if(volume>0.0 && (lotCeiling<=0.0 || volume<lotCeiling)) lotCeiling=volume;
   }
   if(g_autoBasketStopPrice<=0.0) g_autoBasketStopPrice=stop;
   if(g_autoBasketTargetPrice<=0.0) g_autoBasketTargetPrice=target;
   if(g_autoLotCeiling<=0.0) g_autoLotCeiling=lotCeiling;
}

void AutoApplyNoIncreaseLotCap(AUTO_SIDE &side)
{
   // Fixed-Lot contract: every new AUTO order uses the configured AUTO Lot.
   // Existing/legacy positions are never allowed to silently cap a new order.
   side.plannedLot=NormalizeTradeVolume(g_lot);
}

double AutoPerOrderRiskBudgetMoney()
{
   double equity=MathMax(1.0,AccountInfoDouble(ACCOUNT_EQUITY));
   return equity*MathMax(0.01,MathMin(5.0,g_riskPerOrderPercent))/100.0;
}

bool AutoRiskBudgetAllows(AUTO_SIDE &side,int existingCount,string &reasonOut)
{
   reasonOut="NONE";

   if(existingCount<4)
   {
      double visibleBasketLimit=EffectiveBasketLossLimit();
      double projectedRisk=existingCount>0
         ? side.aggregateRiskMoney
         : side.expectedLossMoney;
      if(visibleBasketLimit>0.0 &&
         projectedRisk>visibleBasketLimit+0.0000001)
      {
         reasonOut="AUTO_VISIBLE_BASKET_RISK_LIMIT";
         return false;
      }
      return true;
   }

   double perOrderBudget=AutoPerOrderRiskBudgetMoney();
   if(side.expectedLossMoney>perOrderBudget+0.0000001)
   {
      reasonOut="AUTO_ORDER_RISK_BUDGET";
      return false;
   }
   if(existingCount>0)
   {
      double aggregateBudget=perOrderBudget*(existingCount+1);
      if(side.aggregateRiskMoney>aggregateBudget+0.0000001)
      {
         reasonOut="AUTO_AGGREGATE_RISK_BUDGET";
         return false;
      }
   }
   return true;
}

bool AutoWrongDirectionConfirmed(int direction,double momentum,string &reasonOut)
{
   reasonOut="NONE";
   if(direction==0) return false;
   datetime now=TimeCurrent();
   bool candidateActive=g_autoExitCandidateSince>0;

   if(g_autoBasketStartedAt<=0 ||
      now-g_autoBasketStartedAt<AUTO_EXIT_CYCLE_GRACE_SECONDS ||
      g_autoLastFillAt<=0 ||
      now-g_autoLastFillAt<AUTO_EXIT_LAST_FILL_GRACE_SECONDS)
   {
      AutoResetExitCandidate();
      return false;
   }

   double entry=AutoWeightedEntryPrice(direction);
   MqlTick tick;
   if(entry<=0.0 || !SymbolInfoTick(_Symbol,tick))
   {
      AutoResetExitCandidate();
      return false;
   }
   double marketPrice=direction>0 ? tick.bid : tick.ask;
   double progressPoints=direction>0 ? (marketPrice-entry)/_Point : (entry-marketPrice)/_Point;
   double adversePoints=-progressPoints;
   if(adversePoints<=0.0)
   {
      AutoResetExitCandidate();
      return false;
   }

   double atrM1=AverageTrueRangePoints(PERIOD_M1,g_atrPeriod);
   double atrM5=AverageTrueRangePoints(PERIOD_M5,g_atrPeriod);
   double spread=CurrentSpreadPoints();
   if(atrM1<=0.0 || atrM5<=0.0 || spread<=0.0 || spread>=999999.0)
   {
      AutoResetExitCandidate();
      return false;
   }

   double normalFloor=MathMax(spread*3.50,MathMax(atrM1*0.65,atrM5*0.32));
   double severeFloor=MathMax(spread*6.00,MathMax(atrM1*1.10,atrM5*0.60));
   double initialRiskPoints=AutoInitialRisk();
   if(initialRiskPoints>0.0)
   {
      normalFloor=MathMax(normalFloor,initialRiskPoints*AUTO_WRONG_DIRECTION_MIN_R);
      severeFloor=MathMax(severeFloor,initialRiskPoints*0.45);
   }
   if(!candidateActive && adversePoints<normalFloor) return false;

   int opposite=-direction;
   bool m5Opposite=g_trendM5==opposite;
   bool m15Opposite=g_trendM15==opposite;
   bool emaM5Opposite=g_emaTrendM5==opposite;
   bool m1Opposite=g_trendM1==opposite;
   bool momentumOpposite=MomentumSupportsDirection(opposite,momentum,0.40);
   bool vectorExitLost=AutoVectorEdgeLiveExitLost(direction);
   int confirmations=0;
   if(m5Opposite) confirmations++;
   if(m15Opposite) confirmations++;
   if(emaM5Opposite) confirmations++;
   if(m1Opposite) confirmations++;
   if(momentumOpposite) confirmations++;
   if(vectorExitLost) confirmations++;

   bool structureConfirmed=
      confirmations>=4 &&
      m5Opposite &&
      (emaM5Opposite || m15Opposite) &&
      (m1Opposite || momentumOpposite || vectorExitLost);
   bool severe=
      adversePoints>=severeFloor &&
      m5Opposite &&
      (emaM5Opposite || m15Opposite) &&
      confirmations>=3;
   if(!structureConfirmed && !severe)
   {
      AutoResetExitCandidate();
      return false;
   }

   if(!candidateActive)
   {
      g_autoExitCandidateSince=now;
      g_autoExitCandidatePeakAdverse=adversePoints;
      return false;
   }

   if(adversePoints>g_autoExitCandidatePeakAdverse)
      g_autoExitCandidatePeakAdverse=adversePoints;
   bool rebound=
      adversePoints<=g_autoExitCandidatePeakAdverse*0.70 ||
      adversePoints<normalFloor*0.75;
   if(rebound)
   {
      AutoResetExitCandidate();
      return false;
   }

   int requiredSeconds=severe ? AUTO_EXIT_SEVERE_CONFIRM_SECONDS : AUTO_EXIT_CONFIRM_SECONDS;
   if((int)(now-g_autoExitCandidateSince)<requiredSeconds) return false;
   reasonOut=severe ? "AUTO_BALANCED_WRONG_SEVERE" : "AUTO_BALANCED_WRONG_CONFIRMED";
   return true;
}

void AutoOnOrderSent(int direction)
{
   AUTO_SIDE selected=direction>0 ? g_autoBuy : g_autoSell;
   datetime now=TimeCurrent();
   g_autoFirstEntryCandidateSince=0;
   g_autoFirstEntryCandidateLastSeenAt=0;
   g_autoFirstEntryCandidateDirection=0;
   if(g_autoBasketStartedAt<=0)
   {
      g_autoBasketStartedAt=now;
      g_autoBasketStopPrice=selected.slPrice;
      g_autoBasketTargetPrice=selected.tpPrice;
      g_autoLotCeiling=selected.plannedLot;
      g_autoPeakProfit=0.0;
      // AUTO freezes the first protected risk distance as 1R for the
      // entire AUTO cycle. Later SL tightening must never redefine 1R.
      AutoSetInitialRisk(selected.entryPrice,selected.slPrice);
   }
   else
   {
      if(direction>0 && selected.slPrice>0.0)
         g_autoBasketStopPrice=MathMax(g_autoBasketStopPrice,selected.slPrice);
      else if(direction<0 && selected.slPrice>0.0)
         g_autoBasketStopPrice=g_autoBasketStopPrice<=0.0 ? selected.slPrice : MathMin(g_autoBasketStopPrice,selected.slPrice);
      g_autoLotCeiling=g_autoLotCeiling<=0.0 ? selected.plannedLot : MathMin(g_autoLotCeiling,selected.plannedLot);
   }
   g_autoLastFillAt=now;
   AutoResetExitCandidate();
}

bool AutoManageOpenBasket(double momentum)
{
   if(!AutoOwnsOpenBasket() || BasketHasRacePosition() || BasketHasFlipLockPosition()) return false;
   int direction=BasketDirection();
   if(direction==0) return false;

   if(g_autoBasketStartedAt<=0)
   {
      g_autoBasketStartedAt=TimeCurrent();
      g_autoLastFillAt=g_autoBasketStartedAt;
   }
   AutoRecoverCanonicalProtection(direction);
   AutoRecoverInitialRisk(direction);
   if(g_autoLastFillAt<=0) g_autoLastFillAt=TimeCurrent();

   double cycleProfit=BasketCycleProfit();
   double floatingProfit=BasketProfit();
   double hardLoss=EffectiveBasketLossLimit();
   if(hardLoss>0.0 && cycleProfit<=-hardLoss)
   {
      bool closed=CloseAllBasket("MAX_BASKET_LOSS");
      if(closed) AutoResetCycle();
      g_executionStatus="MAX_BASKET_LOSS";
      return true;
   }

   string wrongReason="NONE";
   if(cycleProfit<0.0 && floatingProfit<0.0)
   {
      if(AutoWrongDirectionConfirmed(direction,momentum,wrongReason))
      {
         bool closed=CloseAllBasket(wrongReason);
         if(closed) AutoResetCycle();
         g_executionStatus=wrongReason;
         return true;
      }
      if(g_autoExitCandidateSince>0)
      {
         g_executionStatus="AUTO_EXIT_CANDIDATE";
         return true;
      }
   }
   else AutoResetExitCandidate();

   if(cycleProfit>g_autoPeakProfit) g_autoPeakProfit=cycleProfit;

   // AUTO realizes profit via its genuine broker TP, never via reversal,
   // giveback, or a time-based early market close. Loss safeguards remain.
   long ageSeconds=(long)MathMax(0,TimeCurrent()-g_autoBasketStartedAt);
   if(ageSeconds>=25*60 && cycleProfit<=0.0)
   {
      bool closed=CloseAllBasket("AUTO_TIME_STOP");
      if(closed) AutoResetCycle();
      g_executionStatus="AUTO_TIME_STOP";
      return true;
   }
   return false;
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

   // Session is market context, not a hard entry gate. Broker/symbol trading
   // permission remains authoritative and is checked before order execution.

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

   // Macro Trend is H1/M30/M15 only. M5/M1 never define the macro bias;
   // they are reserved for execution timing and reversal confirmation.
   int macroScore = trendH1*3 + trendM30*2 + trendM15*2;
   int regimeDirection = macroScore >= 3 ? 1 : macroScore <= -3 ? -1 : 0;
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
   RefreshNewsMode(momentum);

   // Setup-first: S/R, Order Block, Fibonacci, Breakout and Structure can all
   // trigger an entry directly. Momentum accelerates timing but is not the only
   // path into the market.
   // Brain V12: take the real market direction directly. Setup intelligence is
   // preferred, but no price-location or pullback policy is allowed to turn a
   // valid BUY/SELL direction back into zero.
   if(AutoEnabled())
   {
      int autoDirection=AutoPrecisionDirection(momentum);
      g_marketRegimeDetail=DetailedMarketRegime(momentum,autoDirection);
      if(autoDirection==0)
      {
         g_cachedAdaptiveDirection=0;
         g_cachedAdaptiveBlockReason=g_adaptiveBlockReason;
      }
      return autoDirection;
   }

   int rawDirection = SharedAutoManualBrainDirection(momentum);
   g_marketRegimeDetail = DetailedMarketRegime(momentum, rawDirection);

   if(rawDirection == 0)
   {
      if(g_macroTrendDirection != 0 && g_adaptiveBlockReason == "")
      {
         string lowerWait = LowerTimeframeStateForDirection(g_macroTrendDirection);
         g_lowerTimeframeState = lowerWait;
         if(lowerWait == "PULLBACK" && !g_antiChaseActive)
            g_adaptiveBlockReason = "WAITING_EXECUTION_TURN";
         else if(lowerWait == "REVERSAL" && !g_antiChaseActive)
            g_adaptiveBlockReason = "WAITING_REVERSAL_CONFIRMATION";
      }
      g_signalConfidence = 0.0;
      g_modelConfidence = 0.0;
      g_historicalWinProbability = 0.0;
      g_historicalWinSamples = 0;
      g_confidenceSource = "MODEL";
      g_effectiveConfidenceThreshold = 0.0;
      if(g_antiChaseActive && g_adaptiveBlockReason == "")
         g_adaptiveBlockReason = g_breakoutRetestRequired
            ? "WAITING_BREAKOUT_RETEST"
            : "WAITING_PULLBACK_RETEST";
      else if(g_adaptiveBlockReason == "")
         g_adaptiveBlockReason = "WAITING_SETUP";
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

   // Brain V11: loss history is advisory and bounded. It may make the engine
   // more selective, but it must never create a self-locking no-trade state.
   score -= MathMin(6.0, g_consecutiveLosses * 1.5);
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

   // Brain V12: market-location, pullback/confirmation and confidence/structure
   // engines are telemetry only for FIRST ENTRY. They must not veto a valid
   // BUY/SELL direction. Existing exit and basket-management protections stay.
   g_adaptiveBlockReason = "";

   // Brain V12: confidence, structure, market location, RSI, support/resistance,
   // pullback and Entry Precision remain visible for telemetry but are not
   // allowed to block the first BUY/SELL order. Operational safety owns gating.

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
   string brainV8AddReason = "NONE";
   if(count > 0 && BrainV16BasketAdverseMove(direction, brainV8AddReason))
   {
      g_adaptiveBlockReason = brainV8AddReason;
      return false;
   }
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
   if(g_profitTargetMode == "AUTO" && BasketHasTacticalPosition())
      return 0.0;

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
   // 0 means OFF exactly. The Broker-tagged live owner keeps its own profile
   // even if the website switches modes before the Basket is flat.
   return MathMax(0.0,ModeBasketLossLimit(DailyRiskMode()));
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
   double effectiveBasketLoss=EffectiveBasketLossLimit();
   if(effectiveBasketLoss > 0.0)
   {
      expectancyFloor = effectiveBasketLoss * 0.30;
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


double BasketAddDistanceFromLocalExtremeAtr(
   int direction,
   double extremeLevel
)
{
   if(direction==0 || extremeLevel<=0.0)
      return 99.0;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return 99.0;

   double atrPrice=MathMax(
      _Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );
   double current=direction>0 ? tick.bid : tick.ask;
   return direction>0
      ? (extremeLevel-current)/MathMax(_Point,atrPrice)
      : (current-extremeLevel)/MathMax(_Point,atrPrice);
}

bool BasketAddLocationAllowed(
   int direction,
   int count,
   string &reasonOut
)
{
   reasonOut="NONE";
   if(direction==0 || count<=0)
      return true;

   RefreshIndicatorV6Scores(direction,MomentumPoints());
   if(g_indicatorV6Mode==INDICATOR_V6_ADAPTIVE &&
      g_indicatorCompositeScore<34.0 &&
      g_indicatorLocationScore<36.0 &&
      g_indicatorStructureScore<40.0 &&
      g_indicatorExecutionScore<40.0)
   {
      reasonOut="INDICATOR_CONTEXT_ADD_WAIT";
      return false;
   }

   string extremeState="NONE";
   double extremeLevel=0.0;
   double extremeRisk=LocalExtremeRiskScore(
      direction,extremeState,extremeLevel
   );
   bool breakoutHold=BreakoutHoldConfirmed(direction,extremeLevel);
   double distanceFromExtremeAtr=
      BasketAddDistanceFromLocalExtremeAtr(direction,extremeLevel);

   // Positive distance means price has pulled away from the directional edge.
   // Slightly negative values mean a live probe above/below the old extreme.
   bool nearDirectionalEdge=
      distanceFromExtremeAtr<=0.18 &&
      distanceFromExtremeAtr>=-0.12;

   double atrPoints=MathMax(
      10.0,
      g_atrPoints>0.0
         ? g_atrPoints
         : AverageTrueRangePoints(PERIOD_M15,g_atrPeriod)
   );
   double anchorProgressAtr=
      MathMax(0.0,BasketProgressFromAnchorPoints(direction)) /
      MathMax(1.0,atrPoints);

   g_spaceToTargetAtr=SpaceToTargetAtr(direction);
   double exhaustion=0.0,extensionAtr=0.0,adverseWick=0.0;
   string exhaustionReason="NONE";
   bool exhausted=DirectionalExhaustion(
      direction,exhaustion,extensionAtr,adverseWick,exhaustionReason
   );

   bool retestReady=PullbackRetestReady(direction,MomentumPoints());
   bool executionTurn=ExecutionTurningEvent(direction,MomentumPoints());
   bool safePullback=
      distanceFromExtremeAtr>=0.18 &&
      (retestReady || executionTurn);

   // Basket completion must never outrank location safety. This specifically
   // prevents rungs 2..N from being stacked at a local top/bottom simply
   // because the 10-minute fill schedule is behind.
   bool localEdgeChase=
      nearDirectionalEdge &&
      !breakoutHold &&
      (
         extremeRisk>=52.0 ||
         anchorProgressAtr>=0.35 ||
         count>=3
      );

   bool exhaustedAtEdge=
      exhausted &&
      nearDirectionalEdge &&
      !breakoutHold &&
      !safePullback;

   bool noTargetRoom=
      g_spaceToTargetAtr<=0.16 &&
      !breakoutHold &&
      !safePullback;

   if(localEdgeChase || exhaustedAtEdge || noTargetRoom)
   {
      reasonOut=direction>0
         ? "LOCAL_TOP_ADD_BLOCK"
         : "LOCAL_BOTTOM_ADD_BLOCK";
      g_localExtremeState=extremeState;
      g_localExtremeScore=extremeRisk;
      g_localExtremeLevel=extremeLevel;
      g_breakoutHoldConfirmed=false;
      return false;
   }

   if(breakoutHold)
   {
      g_breakoutHoldConfirmed=true;
      g_localExtremeState="BREAKOUT_HOLD_CONFIRMED";
   }

   return true;
}

// Brain V15 -----------------------------------------------------------------
// Basket continuation is deliberately much lighter than first-entry logic.
// Max Positions is the user's exact ceiling. Once the first position exists,
// the add engine only needs: same Basket direction, no severe adverse move,
// and real price separation/progress from the latest filled position.
// S/R, RSI, pullback, terminal-zone, Entry Precision and continuation-score
// logic remain telemetry/quality inputs but cannot veto a valid continuation.
// Brain V16 -----------------------------------------------------------------
// V15 could still stall at one or two positions for two independent reasons:
// 1) add/adverse progress used the opposite quote side, so spread looked like
//    an adverse market move; and 2) a transient lease/permission interruption
//    could AbortBurst(), after which an existing Basket was never re-armed.
// V16 uses same-side executable prices, a cumulative adverse guard from the
// first entry, paced target-aware filling, and self-heals an interrupted burst.
double BrainV16FillProgressPoints(int direction)
{
   MqlTick tick;
   double lastPrice = LastBasketEntryPrice(direction);
   if(lastPrice <= 0.0 || !SymbolInfoTick(_Symbol,tick))
      return 0.0;

   // Compare BUY ask->ask and SELL bid->bid. The broker spread is therefore
   // not misclassified as favorable/adverse market movement.
   return direction > 0
      ? (tick.ask - lastPrice) / _Point
      : (lastPrice - tick.bid) / _Point;
}

double BrainV16AnchorProgressPoints(int direction)
{
   MqlTick tick;
   double anchor = BasketAnchorEntryPrice(direction);
   if(anchor <= 0.0 || !SymbolInfoTick(_Symbol,tick))
      return 0.0;

   return direction > 0
      ? (tick.ask - anchor) / _Point
      : (anchor - tick.bid) / _Point;
}

bool BrainV16BasketAdverseMove(int direction, string &reasonOut)
{
   reasonOut = "NONE";
   if(direction == 0)
      return false;

   double atr = MathMax(
      10.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)
   );
   double lastProgress = BrainV16FillProgressPoints(direction);
   double anchorProgress = BrainV16AnchorProgressPoints(direction);
   double momentum = MomentumPoints();
   bool oppositeCandle = BrainV8ConfirmationCandleReady(-direction);
   bool oppositeMomentum = MomentumSupportsDirection(-direction,momentum,0.22);
   string lowerState = LowerTimeframeStateForDirection(direction);

   // A micro reversal alone is not enough to freeze a 20/50/100-position
   // Basket. It must coincide with real same-side adverse displacement.
   bool meaningfulAdverse =
      anchorProgress <= -atr * 0.08 ||
      lastProgress <= -atr * 0.05;
   bool severeAdverse = anchorProgress <= -atr * 0.22;
   bool confirmedLowerReversal =
      lowerState == "REVERSAL" &&
      anchorProgress <= -atr * 0.05 &&
      (oppositeCandle || oppositeMomentum);
   bool confirmedOppositeFlow =
      oppositeCandle && oppositeMomentum && meaningfulAdverse;

   if(severeAdverse && (oppositeCandle || oppositeMomentum))
   {
      reasonOut = "V16_SEVERE_ADVERSE_STOP";
      return true;
   }
   if(confirmedLowerReversal)
   {
      reasonOut = "V16_CONFIRMED_LOWER_REVERSAL";
      return true;
   }
   if(confirmedOppositeFlow)
   {
      reasonOut = "V16_CONFIRMED_OPPOSITE_FLOW";
      return true;
   }
   return false;
}

bool BrainV16BalancedAddReady(
   int direction,
   int count,
   int targetPositions,
   double atr
)
{
   if(direction == 0 || count <= 0 || count >= targetPositions)
      return false;

   MqlTick tick;
   double lastEntry = LastBasketEntryPrice(direction);
   if(lastEntry <= 0.0 || !SymbolInfoTick(_Symbol,tick))
   {
      g_ladderMode = "V16_NO_TICK";
      g_fillBlockReason = "V16_NO_TICK";
      return false;
   }

   double progress = BrainV16FillProgressPoints(direction);
   double currentSameSide = direction > 0 ? tick.ask : tick.bid;
   double betterPricePoints = direction > 0
      ? (lastEntry - currentSameSide) / _Point
      : (currentSameSide - lastEntry) / _Point;

   // Large user targets need denser rungs. This is still price-separated when
   // the market is moving, but no longer requires 100 independent large moves.
   double targetScale = targetPositions >= 80 ? 0.010 :
                        targetPositions >= 50 ? 0.014 :
                        targetPositions >= 20 ? 0.020 : 0.035;
   double requiredProgress = MathMax(
      targetPositions >= 20 ? 2.0 : 3.0,
      atr * targetScale
   );

   bool favorableStep = progress >= requiredProgress;
   bool modestPullback =
      betterPricePoints >= MathMax(2.0,atr * 0.018) &&
      betterPricePoints <= MathMax(4.0,atr * 0.20);

   // Target-aware schedule. For a 100-position test the Basket can progress to
   // the configured ceiling over roughly eight minutes when the market remains
   // stable, instead of waiting for a fresh 2-3 point move for every position.
   double fillWindowSeconds = targetPositions >= 80 ? 480.0 :
                              targetPositions >= 50 ? 360.0 :
                              targetPositions >= 20 ? 240.0 : 0.0;
   bool scheduleBehind = false;
   bool stableForScheduledFill = false;
   if(fillWindowSeconds > 0.0 && g_burstStartedAt > 0)
   {
      double elapsed = MathMax(
         0.0,
         (double)(TimeCurrent() - g_burstStartedAt)
      );
      double cadence = fillWindowSeconds /
         (double)MathMax(1,targetPositions - 1);
      int expected = MathMin(
         targetPositions,
         1 + (int)MathFloor(elapsed / MathMax(1.0,cadence))
      );
      g_fillExpectedPositions = expected;
      g_fillUrgency = MathMax(
         0.0,
         MathMin(1.0,elapsed / fillWindowSeconds)
      );
      scheduleBehind = count < expected;

      // Scheduled fill is allowed only while the latest fill has not moved
      // meaningfully against us. Cumulative adverse movement is independently
      // guarded by BrainV16BasketAdverseMove() from the first Basket entry.
      double scheduledAdverseBand = MathMax(2.0,atr * 0.025);
      stableForScheduledFill = progress >= -scheduledAdverseBand;
   }

   if(favorableStep)
   {
      g_ladderMode = "V16_PRICE_STEP_READY";
      g_fillBlockReason = "NONE";
      g_ladderRequiredPoints = requiredProgress;
      return true;
   }

   if(modestPullback)
   {
      g_ladderMode = "V16_PULLBACK_FILL_READY";
      g_fillBlockReason = "NONE";
      g_ladderRequiredPoints = requiredProgress;
      return true;
   }

   if(targetPositions >= 20 && scheduleBehind && stableForScheduledFill)
   {
      g_ladderMode = "V16_SCHEDULED_FILL_READY";
      g_fillBlockReason = "NONE";
      g_ladderRequiredPoints = requiredProgress;
      return true;
   }

   g_ladderRequiredPoints = requiredProgress;
   if(scheduleBehind && !stableForScheduledFill)
   {
      g_ladderMode = "V16_WAIT_ADVERSE_DRIFT";
      g_fillBlockReason = "V16_WAIT_ADVERSE_DRIFT";
   }
   else
   {
      g_ladderMode = "V16_WAIT_PACING";
      g_fillBlockReason = "V16_WAIT_PACING";
   }
   return false;
}

bool BrainV16RearmExistingBasket()
{
   if(!LegacyBasketEngineEnabled() || !BasketFillEnabled() || g_burstActive)
      return false;

   int count = BasketPositionCount();
   if(count <= 0 || count >= g_maxPositions)
      return false;
   if(g_state != STATE_RUNNING || !g_access)
      return false;
   if(!MQLInfoInteger(MQL_TESTER) && !EntryLeaseValid())
      return false;
   if(TradePermissionStatus() != "OK")
      return false;

   int direction = BasketDirection();
   if(direction == 0)
      return false;

   datetime originalStartedAt = g_burstStartedAt;
   ArmBurst(direction);
   if(originalStartedAt > 0)
      g_burstStartedAt = originalStartedAt;
   g_burstRequestsSent = count;

   if(g_burstActive)
   {
      g_executionStatus = "V16_BASKET_FILL_REARMED";
      g_fillBlockReason = "NONE";
      Print(
         "V16 basket fill rearmed count=",count,
         " max=",g_maxPositions,
         " target=",g_burstTargetPositions
      );
      return true;
   }
   return false;
}

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

bool BasketLadderReady(int direction, int count, int targetPositions)
{
   int nextRung = count+1;
   g_ladderRung = MathMax(1,nextRung);
   g_ladderProgressPoints = MathMax(0.0,BasketProgressFromAnchorPoints(direction));
   g_fillBlockReason = "NONE";
   string brainV8LadderReason = "NONE";
   if(BrainV16BasketAdverseMove(direction, brainV8LadderReason))
   {
      g_fillBlockReason = brainV8LadderReason;
      g_ladderMode = "ADVERSE_STOP";
      return false;
   }

   if(nextRung <= 1)
   {
      g_ladderRequiredPoints=0.0;
      g_ladderPullbackPoints=0.0;
      g_ladderPullbackRequiredPoints=0.0;
      g_ladderMode="INITIAL";
      g_fillPhase="STRICT";
      return true;
   }

   double atr = g_atrPoints > 0.0
      ? g_atrPoints
      : AverageTrueRangePoints(PERIOD_M15,g_atrPeriod);
   atr = MathMax(10.0,atr);

   double fillElapsedSeconds = g_burstStartedAt > 0
      ? MathMax(0.0,(double)(TimeCurrent()-g_burstStartedAt))
      : 0.0;
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
   bool fillBehindSchedule = count < g_fillExpectedPositions;
   g_fillUrgency = MathMax(0.0,MathMin(1.0,fillElapsedSeconds/fillWindowSeconds));

   double phaseFactor = g_fillPhase=="STRICT" ? 1.00 :
                        g_fillPhase=="BALANCED" ? 0.72 : 0.52;
   double qualityFactor = g_entryQuality=="A" ? 0.90 :
                          g_entryQuality=="B" ? 1.00 : 1.12;
   double regimeFactor =
      g_newsMode=="NEWS_CONTINUATION" ? 1.25 :
      g_marketRegime=="HIGH_VOLATILITY" ? 1.15 :
      g_marketRegimeDetail=="TREND_ACCELERATION" ? 0.92 : 1.0;
   double spreadToAtr = CurrentSpreadPoints()/MathMax(1.0,atr);
   double spreadSpacingFactor =
      (g_newsMode!="NORMAL" || g_spreadStatus=="NEWS_WIDE")
      ? 1.0+MathMin(0.55,spreadToAtr*3.0)
      : 1.0;

   g_ladderRequiredPoints = MathMax(
      3.0,
      atr*BalancedLadderFractionForRung(nextRung,targetPositions)*qualityFactor*regimeFactor*
      spreadSpacingFactor*phaseFactor
   );

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
   {
      g_ladderMode="NO_TICK";
      g_fillBlockReason="NO_TICK";
      return false;
   }

   double current = direction > 0 ? tick.bid : tick.ask;
   if(g_ladderExtremePrice <= 0.0)
      g_ladderExtremePrice=current;
   if(direction > 0)
      g_ladderExtremePrice=MathMax(g_ladderExtremePrice,current);
   else
      g_ladderExtremePrice=MathMin(g_ladderExtremePrice,current);

   g_ladderPullbackPoints = direction > 0
      ? MathMax(0.0,(g_ladderExtremePrice-current)/_Point)
      : MathMax(0.0,(current-g_ladderExtremePrice)/_Point);

   double pullbackFactor =
      g_newsMode=="NEWS_CONTINUATION" ? 0.14 :
      g_marketRegime=="HIGH_VOLATILITY" ? 0.12 : 0.10;
   if(g_fillPhase=="BALANCED") pullbackFactor *= 0.82;
   if(g_fillPhase=="COMPLETION") pullbackFactor *= 0.65;
   g_ladderPullbackRequiredPoints = MathMax(
      2.0,
      MathMin(atr*pullbackFactor,MathMax(2.0,g_ladderRequiredPoints*0.35))
   );

   // V16: continuation is target-aware, spread-neutral and paced. First-entry
   // intelligence remains unchanged; the Basket no longer stalls at 1-2 fills.
   if(BrainV16BalancedAddReady(direction,count,targetPositions,atr))
      return true;
   return false;

   string lowerState = LowerTimeframeStateForDirection(direction);
   if(lowerState=="REVERSAL")
   {
      g_ladderMode="WAIT_DIRECTION";
      g_fillBlockReason="LOWER_TF_REVERSAL";
      return false;
   }

   string addLocationReason="NONE";
   // V15: local-zone analysis remains observable only; it cannot veto a
   // balanced continuation add.
   BasketAddLocationAllowed(direction,count,addLocationReason);

   // Better-price add: not Martingale. It is allowed only after a modest
   // pullback, a fresh turn back with the Basket thesis, and all terminal-zone
   // safety checks still run in ProcessBurstQueue.
   double lastEntry = LastBasketEntryPrice(direction);
   double betterPricePoints = lastEntry > 0.0
      ? (direction > 0 ? (lastEntry-current)/_Point : (current-lastEntry)/_Point)
      : 0.0;
   bool betterPriceWindow =
      betterPricePoints >= atr*0.08 &&
      betterPricePoints <= atr*0.65;
   if(betterPriceWindow && ExecutionTurningEvent(direction,MomentumPoints()))
   {
      g_ladderMode="BETTER_PRICE_RECLAIM_READY";
      return true;
   }

   // Fill Progress Engine. Time relaxes execution timing only; it never
   // relaxes Basket direction, terminal-zone safety, Broker permission or
   // EXTREME spread protection.
   if(fillBehindSchedule)
   {
      double pa = direction > 0 ? g_priceActionBuyScore : g_priceActionSellScore;
      bool freshTurn = RecentDirectionalBody(direction,PERIOD_M1);
      bool confirmation =
         lowerState=="CONFIRMED" ||
         ExecutionTurningEvent(direction,MomentumPoints()) ||
         pa >= (g_fillPhase=="STRICT" ? 28.0 : g_fillPhase=="BALANCED" ? 22.0 : 18.0);

      bool phaseAccept =
         g_fillPhase=="STRICT"
            ? (g_entryQuality!="C" && freshTurn && confirmation)
            : g_fillPhase=="BALANCED"
              ? (freshTurn && confirmation)
              : confirmation;

      // Schedule urgency may relax signal quality, but may not stack multiple
      // positions at nearly the same price. Every continuation add must make
      // fresh favorable progress from the LAST filled position. A proper
      // better-price pullback is handled by the path above.
      double lastEntryProgress=BasketFavorableProgressPoints(direction);
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
      bool priceSeparated=lastEntryProgress>=scheduledSpacing;

      if(phaseAccept && priceSeparated)
      {
         g_ladderMode = g_fillPhase=="COMPLETION"
            ? "COMPLETION_TIMING_READY"
            : "SCHEDULED_RETEST_READY";
         return true;
      }

      if(phaseAccept && !priceSeparated)
      {
         g_ladderMode="WAIT_ADD_PRICE_SEPARATION";
         g_fillBlockReason="WAIT_ADD_PRICE_SEPARATION";
         return false;
      }
   }

   if(!g_ladderPullbackArmed &&
      g_ladderProgressPoints < g_ladderRequiredPoints)
   {
      g_ladderMode = fillBehindSchedule ? "WAIT_SCHEDULED_TURN" : "WAIT_PROGRESS";
      g_fillBlockReason = fillBehindSchedule ? "WAITING_TIMING_TURN" : "WAITING_CONTINUATION_SPACE";
      return false;
   }

   if(!g_ladderPullbackArmed)
   {
      if(g_ladderPullbackPoints < g_ladderPullbackRequiredPoints)
      {
         g_ladderMode="WAIT_PULLBACK";
         g_fillBlockReason="WAITING_RETEST";
         return false;
      }
      g_ladderPullbackArmed=true;
      g_ladderPullbackArmedAt=TimeCurrent();
      g_ladderMode="WAIT_CONTINUATION";
      g_fillBlockReason="WAITING_CONTINUATION";
      return false;
   }

   bool m1Turn = RecentDirectionalBodyAfter(
      direction,PERIOD_M1,g_ladderPullbackArmedAt
   );
   bool emaContinuation =
      g_emaTrendM1==direction && g_emaTrendM5==direction;
   double paScore = direction > 0 ? g_priceActionBuyScore : g_priceActionSellScore;
   bool continuation =
      m1Turn &&
      (
         MomentumSupportsDirection(direction,MomentumPoints(),0.25) ||
         emaContinuation ||
         paScore >= 18.0 ||
         ExecutionTurningEvent(direction,MomentumPoints())
      );

   if(!continuation)
   {
      g_ladderMode="WAIT_CONTINUATION";
      g_fillBlockReason="WAITING_CONTINUATION";
      return false;
   }

   double exhaustion=0.0, extensionAtr=0.0, adverseWick=0.0;
   string exhaustionReason="NONE";
   bool exhausted = DirectionalExhaustion(
      direction,exhaustion,extensionAtr,adverseWick,exhaustionReason
   );
   if(exhausted && !PullbackRetestReady(direction,MomentumPoints()))
   {
      g_ladderMode="EXHAUSTION_PULLBACK";
      g_fillBlockReason="EXHAUSTION_WAIT_RETEST";
      return false;
   }

   g_ladderMode="PULLBACK_CONTINUATION_READY";
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
      " positions=", BasketPositionCount(),
      " max=", g_maxPositions,
      " targetPositions=", g_burstTargetPositions,
      " targetMoney=", DoubleToString(g_burstTargetMoney, 2),
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
   if(!LegacyBasketEngineEnabled() || !BasketFillEnabled() || !g_burstActive)
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

   int count=BasketPositionCount();
   if(count >= g_burstTargetPositions)
   {
      g_burstActive=false;
      g_burstNeedsRearm=false;
      g_executionStatus="BASKET_FILL_COMPLETE";
      g_ladderMode="COMPLETE";
      g_fillBlockReason="COMPLETE";
      return;
   }

   if(!BasketLadderReady(g_burstDirection,count,g_burstTargetPositions))
   {
      g_executionStatus =
         g_ladderMode=="WAIT_LOCAL_EXTREME"
         ? g_fillBlockReason
         : g_ladderMode=="WAIT_ADD_PRICE_SEPARATION"
           ? "WAIT_ADD_PRICE_SEPARATION"
           : g_ladderMode=="WAIT_PULLBACK" ||
             g_ladderMode=="EXHAUSTION_PULLBACK"
             ? "BASKET_LADDER_PULLBACK_WAIT"
             : g_ladderMode=="WAIT_CONTINUATION"
               ? "BASKET_LADDER_CONTINUATION_WAIT"
               : "BASKET_LADDER_WAIT";
      return;
   }

   if(!CanSendOrder())
   {
      g_fillBlockReason="ORDER_RATE_LIMIT";
      return;
   }

   if(!AdaptiveSpreadAllowed())
   {
      g_fillBlockReason = g_spreadStatus=="EXTREME"
         ? "EXTREME_SPREAD" : "SPREAD_TOO_HIGH";
      g_executionStatus = g_fillBlockReason;
      return;
   }

   // V15: MarketLocation is telemetry for continuation adds, not a hard veto.
   MarketLocationEntryAllowed(g_burstDirection,true);

   string finalAddLocationReason="NONE";
   // V15: keep the local-extreme calculation visible, but do not let it veto
   // an otherwise valid balanced continuation add.
   BasketAddLocationAllowed(
      g_burstDirection,
      count,
      finalAddLocationReason
   );

   bool accepted=SendMarketOrder(g_burstDirection);
   RegisterOrderRequest();
   int filled=BasketPositionCount();
   if(accepted)
   {
      g_burstRequestsSent=MathMax(g_burstRequestsSent+1,filled);
      g_fillBlockReason="NONE";
   }
   else
      g_fillBlockReason=g_executionStatus;

   bool completed=filled >= g_burstTargetPositions;
   if(completed)
   {
      g_executionStatus="BASKET_FILL_COMPLETE";
      g_ladderMode="COMPLETE";
      g_fillBlockReason="COMPLETE";
      g_burstActive=false;
      g_burstNeedsRearm=false;
   }
   else if(accepted)
   {
      g_executionStatus="BASKET_LADDER_ADVANCE";
      g_ladderRung=filled+1;
      g_ladderExtremePrice=0.0;
      g_ladderPullbackPoints=0.0;
      g_ladderPullbackRequiredPoints=0.0;
      g_ladderPullbackArmed=false;
      g_ladderPullbackArmedAt=0;
   }
}


bool IsBitcoinSymbol()
{
   string symbol=_Symbol;
   StringToUpper(symbol);
   return StringFind(symbol,"BTC")>=0 || StringFind(symbol,"XBT")>=0;
}

double SymbolTickSizeNow()
{
   double tick=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
   if(tick<=0.0) tick=_Point;
   return MathMax(_Point,tick);
}

double NormalizePriceToTick(double price)
{
   if(price<=0.0) return 0.0;
   double tick=SymbolTickSizeNow();
   double units=MathRound(price/tick);
   return NormalizeDouble(units*tick,(int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS));
}

double NormalizeStopPriceToTick(double price,int direction)
{
   if(price<=0.0 || direction==0) return 0.0;
   double tick=SymbolTickSizeNow();
   double units=price/tick;
   // BUY stop-loss sits below market -> round down. SELL stop-loss sits above
   // market -> round up. This preserves broker minimum distance.
   units=direction>0 ? MathFloor(units+1e-10) : MathCeil(units-1e-10);
   return NormalizeDouble(units*tick,(int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS));
}

double NormalizeTargetPriceToTick(double price,int direction)
{
   if(price<=0.0 || direction==0) return 0.0;
   double tick=SymbolTickSizeNow();
   double units=price/tick;
   // BUY target/pending trigger sits above market -> round up. SELL target sits
   // below market -> round down.
   units=direction>0 ? MathCeil(units-1e-10) : MathFloor(units+1e-10);
   return NormalizeDouble(units*tick,(int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS));
}

int SymbolDigitsNow()
{
   return (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
}

bool CanSendOrder()
{
   if(g_serverEntrySuppressed) return false;
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
   if(g_serverEntrySuppressed) return false;
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

string LegacyDailyProfitArmedGlobalKey()
{
   return StringFormat(
      "SCN_DPA_%I64d_%I64d_%s",
      (long)AccountInfoInteger(ACCOUNT_LOGIN),
      InpMagic,
      _Symbol
   );
}

string DailyProfitArmedGlobalKey()
{
   return StringFormat(
      "SCN_DPA_%I64d_%I64d_%s_%s",
      (long)AccountInfoInteger(ACCOUNT_LOGIN),
      InpMagic,
      _Symbol,
      DailyRiskMode()
   );
}

string LegacyDailyProfitLockGlobalKey()
{
   return StringFormat(
      "SCN_DPL_%I64d_%I64d_%s",
      (long)AccountInfoInteger(ACCOUNT_LOGIN),
      InpMagic,
      _Symbol
   );
}

string DailyProfitLockGlobalKey()
{
   return StringFormat(
      "SCN_DPL_%I64d_%I64d_%s_%s",
      (long)AccountInfoInteger(ACCOUNT_LOGIN),
      InpMagic,
      _Symbol,
      DailyRiskMode()
   );
}

string DailyLossLockGlobalKey()
{
   return StringFormat(
      "SCN_DLL_%I64d_%I64d_%s_%s",
      (long)AccountInfoInteger(ACCOUNT_LOGIN),
      InpMagic,
      _Symbol,
      DailyRiskMode()
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
   ScenovaOwnerMagicForDeal(deal) != InpMagic)
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
   reasonOut="NONE";
   g_smartProfitDefenseActive=false;
   g_smartProfitDefenseReason="NONE";
   g_smartProfitDefenseLastProfit=cycleProfit;

   if(direction==0 || cycleProfit<=0.0)
      return false;

   double floor=SmartProfitProtectionFloor(direction);
   g_smartProfitDefenseFloor=floor;
   if(cycleProfit<floor)
      return false;

   int opposite=-direction;
   bool m1Flip=g_trendM1==opposite;
   bool m5Flip=g_trendM5==opposite;
   bool m15Flip=g_trendM15==opposite;
   bool emaFlip =
      g_emaTrendM5==opposite ||
      (direction>0 && g_emaReclaimState=="LOSE_EMA21_DOWN") ||
      (direction<0 && g_emaReclaimState=="RECLAIM_EMA21_UP");
   bool emaMacroFlip =
      g_emaTrendM15==opposite || g_emaTrendM30==opposite;
   double oppositePa = direction>0 ? g_priceActionSellScore : g_priceActionBuyScore;
   bool momentumFlip=MomentumSupportsDirection(opposite,MomentumPoints(),0.35);
   string lowerState=LowerTimeframeStateForDirection(direction);

   // A lower-TF PULLBACK is not a Basket-close signal. A true reversal needs
   // M5 plus structure/EMA/PA evidence; M1 alone can never close the Basket.
   if(lowerState=="PULLBACK" && !m5Flip)
      return false;

   bool structuralFlip=m5Flip && (m15Flip || emaMacroFlip);
   bool executionFlip=
      lowerState=="REVERSAL" &&
      m5Flip &&
      emaFlip &&
      (oppositePa>=24.0 || momentumFlip);
   bool strongPriceActionFlip=
      oppositePa>=40.0 &&
      m5Flip &&
      (emaFlip || momentumFlip);
   bool confirmed =
      (structuralFlip && (oppositePa>=22.0 || momentumFlip)) ||
      executionFlip ||
      strongPriceActionFlip ||
      (m15Flip && emaMacroFlip && momentumFlip);

   if(m1Flip && !m5Flip && !m15Flip)
      confirmed=false;
   if(!confirmed)
      return false;

   if(m15Flip && emaMacroFlip)
      reasonOut="M15_STRUCTURE_EMA_REVERSAL";
   else if(oppositePa>=34.0)
      reasonOut="M5_BEAR_BULL_PA_REVERSAL";
   else if(lowerState=="REVERSAL")
      reasonOut="LOWER_TF_TRUE_REVERSAL";
   else
      reasonOut="EMA_MOMENTUM_REVERSAL";

   g_smartProfitDefenseActive=true;
   g_smartProfitDefenseReason=reasonOut;
   return true;
}


bool AutoProfitGivebackDetected(int direction,double cycleProfit)
{
   if(direction==0 || cycleProfit<=0.0)
      return false;

   double floor=SmartProfitProtectionFloor(direction);
   g_smartProfitDefenseFloor=floor;
   g_smartProfitDefenseLastProfit=cycleProfit;

   if(cycleProfit>g_profitRunPeak)
   {
      double previousPeak=g_profitRunPeak;
      g_profitRunPeak=cycleProfit;
      if(MathFloor(g_profitRunPeak*20.0)>MathFloor(previousPeak*20.0))
         SaveBasketCycleState();
      return false;
   }

   double minimumPeak=MathMax(0.35,floor*2.20);
   if(g_profitRunPeak<minimumPeak || cycleProfit<=floor)
      return false;

   string lowerState=LowerTimeframeStateForDirection(direction);
   bool strongTrend =
      g_trendM5==direction &&
      g_trendM15==direction &&
      (g_entryQuality=="A" || g_adxM5>=24.0);
   double oppositePa=direction>0 ? g_priceActionSellScore : g_priceActionBuyScore;
   bool trueReversal =
      lowerState=="REVERSAL" &&
      g_trendM5==-direction &&
      (oppositePa>=22.0 ||
       g_emaTrendM5==-direction ||
       MomentumSupportsDirection(-direction,MomentumPoints(),0.35));

   bool fragileMarket =
      g_marketRegime=="RANGE" &&
      trueReversal;

   // Pullback and news continuation get substantially more room. Giveback
   // tightens only when a true reversal is supported beyond M1 noise.
   double givebackPercent =
      g_newsMode=="NEWS_CONTINUATION" ? 0.60 :
      lowerState=="PULLBACK" && !trueReversal ? 0.55 :
      strongTrend && !trueReversal ? 0.50 :
      fragileMarket ? 0.26 :
      trueReversal ? 0.30 : 0.42;

   RefreshIndicatorV6Scores(direction,MomentumPoints());
   bool indicatorContinuation=
      g_indicatorCompositeScore>=72.0 &&
      g_indicatorMomentumScore>=64.0 &&
      g_indicatorStructureScore>=60.0 &&
      g_macdState==(direction>0 ? "BULL_ACCELERATION" : "BEAR_ACCELERATION");
   bool indicatorFade=
      g_indicatorMomentumScore<=38.0 &&
      g_indicatorExecutionScore<=42.0 &&
      g_macdState==(direction>0 ? "BULL_FADING" : "BEAR_FADING");
   if(indicatorContinuation && !trueReversal)
      givebackPercent=MathMin(0.68,givebackPercent+0.06);
   else if(indicatorFade)
      givebackPercent=MathMax(0.24,givebackPercent-0.05);

   double volume=MathMax(
      SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN),
      VolumeForMagic(InpMagic,direction)
   );
   double minimumGiveback=MathMax(0.10,CurrentSpreadCost(volume)*0.25);
   double closeLevel=MathMax(
      floor,
      g_profitRunPeak-MathMax(minimumGiveback,g_profitRunPeak*givebackPercent)
   );
   if(cycleProfit>closeLevel)
      return false;

   // Do not let ordinary pullback noise turn Giveback into an early exit.
   if(lowerState=="PULLBACK" && !trueReversal && cycleProfit>floor*1.25)
      return false;

   g_smartProfitDefenseActive=true;
   g_smartProfitDefenseReason=trueReversal
      ? "PROFIT_GIVEBACK_TRUE_REVERSAL"
      : "PROFIT_GIVEBACK";
   return true;
}


bool ManagePerPositionTargets()
{
   double profitTarget = CurrentPerPositionProfitTarget();
   bool closedAny = false;
   bool hedging = ((ENUM_ACCOUNT_MARGIN_MODE)AccountInfoInteger(ACCOUNT_MARGIN_MODE) ==
                   ACCOUNT_MARGIN_MODE_RETAIL_HEDGING);
   double baseVolume = NormalizeTradeVolume(g_lot);

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;

      if(PositionGetString(POSITION_SYMBOL) != _Symbol ||
         PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;

      string comment = PositionGetString(POSITION_COMMENT);
      if(StringFind(comment,MANUAL_LIVE_COMMENT)<0 &&
         StringFind(comment,LEGACY_BASKET_COMMENT)<0)
         continue;

      double positionProfit =
         PositionGetDouble(POSITION_PROFIT) +
         PositionGetDouble(POSITION_SWAP);
      double positionVolume = PositionGetDouble(POSITION_VOLUME);

      // Hedging exposes each order as its own Position. Netting exposes one
      // aggregate Position, so compare the proportional P/L of one configured
      // MANUAL lot-unit and close exactly one unit per pass.
      double targetComparableProfit = positionProfit;
      if(!hedging && positionVolume > 0.0 && baseVolume > 0.0)
         targetComparableProfit =
            positionProfit * MathMin(1.0, baseVolume / positionVolume);

      bool closeForProfit =
         profitTarget > 0.0 &&
         targetComparableProfit >= profitTarget;

      if(!closeForProfit)
         continue;

      double closeVolume = hedging
         ? positionVolume
         : MathMin(positionVolume,baseVolume);

      Print(
         "POSITION_PROFIT_TARGET",
         " ticket=", ticket,
         " pnl=", DoubleToString(positionProfit, 2),
         " unitPnl=", DoubleToString(targetComparableProfit, 2),
         " target=", DoubleToString(profitTarget, 2),
         " closeVolume=", DoubleToString(closeVolume, 2)
      );

      bool closed = hedging
         ? ClosePositionByTicket(ticket)
         : ClosePositionVolumeByTicket(ticket,closeVolume,"SCNManualProfit");
      if(closed)
      {
         closedAny = true;
         g_executionStatus = "POSITION_PROFIT_CLOSED";
         if(!hedging)
            break;
      }
   }

   return closedAny;
}

long BrokerUtcOffsetSeconds()
{
   datetime serverNow=TimeTradeServer();
   if(serverNow<=0)
      serverNow=TimeCurrent();
   datetime utcNow=TimeGMT();
   if(serverNow<=0 || utcNow<=0)
      return 0;

   long rawOffset=(long)(serverNow-utcNow);
   if(MathAbs((double)rawOffset)>14.0*3600.0)
      return 0;

   long roundedMinutes=(long)MathRound((double)rawOffset/60.0);
   return roundedMinutes*60;
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
   g_dailyClosedProfitAuto=0.0;
   g_dailyClosedProfitRace=0.0;
   g_dailyClosedProfitCounter=0.0;
   g_dailyClosedProfitFlipLock=0.0;
   g_dailyClosedProfitManual=0.0;
   g_dailyClosedProfit=0.0;

   datetime from=BrokerDayStart();
   datetime to=TimeCurrent();
   if(!HistorySelect(from,to))
      return;

   // Keep immutable tickets because HistorySelectByPosition() inside mode
   // resolution changes the active history selection.
   int totalDeals=HistoryDealsTotal();
   ulong dealTickets[];
   ArrayResize(dealTickets,totalDeals);
   for(int i=0;i<totalDeals;i++)
      dealTickets[i]=HistoryDealGetTicket(i);

   for(int i=0;i<totalDeals;i++)
   {
      ulong deal=dealTickets[i];
      if(deal==0 || !HistoryDealSelect(deal))
         continue;
      if(HistoryDealGetString(deal,DEAL_SYMBOL)!=_Symbol)
         continue;

      long magic=HistoryDealGetInteger(deal,DEAL_MAGIC);
      bool scenovaDeal=IsScenovaMagic(magic);
      long entry=HistoryDealGetInteger(deal,DEAL_ENTRY);
      if(!scenovaDeal &&
         (entry==DEAL_ENTRY_OUT ||
          entry==DEAL_ENTRY_OUT_BY ||
          entry==DEAL_ENTRY_INOUT))
         scenovaDeal=IsScenovaMagic(ScenovaOwnerMagicForDeal(deal));
      if(!scenovaDeal)
         continue;

      // Re-select after ownership lookup because it may select position history.
      if(!HistoryDealSelect(deal))
         continue;
      double net=
         HistoryDealGetDouble(deal,DEAL_PROFIT)+
         HistoryDealGetDouble(deal,DEAL_SWAP)+
         HistoryDealGetDouble(deal,DEAL_COMMISSION);

      string mode=TradeModeForDeal(deal);
      if(mode=="AUTO") g_dailyClosedProfitAuto+=net;
      else if(mode=="RACE") g_dailyClosedProfitRace+=net;
      else if(mode=="COUNTER") g_dailyClosedProfitCounter+=net;
      else if(mode=="FLIP_LOCK") g_dailyClosedProfitFlipLock+=net;
      else if(mode=="MANUAL") g_dailyClosedProfitManual+=net;
   }

   g_dailyClosedProfit=DailyClosedProfitForMode(DailyRiskMode());
}

double DailyBotProfit()
{
   string mode=DailyRiskMode();
   double total=
      DailyClosedProfitForMode(mode)+
      DailyFloatingProfitForMode(mode);

   // Rescue is disabled in current production. If a legacy rescue remains open,
   // attribute its floating P/L to the live owning mode rather than another mode.
   if(mode!="ZERO_GRID" && RescuePositionCount()>0)
      total+=RescueProfit();

   g_dailyClosedProfit=DailyClosedProfitForMode(mode);
   return total;
}

// Dashboard P/L is intentionally separate from DailyBotProfit(). Risk controls
// remain mode-scoped, while the dashboard must show all SCENOVA modes together.
// Only deals actually executed by a SCENOVA magic are counted; a customer-side
// MT5 close normally has magic=0 and is therefore excluded.
double BotTodayClosedProfitAllModes()
{
   datetime from=BrokerDayStart();
   datetime to=TimeCurrent();
   if(!HistorySelect(from,to))
      return 0.0;

   double total=0.0;
   int totalDeals=HistoryDealsTotal();
   for(int i=0;i<totalDeals;i++)
   {
      ulong deal=HistoryDealGetTicket(i);
      if(deal==0)
         continue;
      if(HistoryDealGetString(deal,DEAL_SYMBOL)!=_Symbol)
         continue;
      if(!IsScenovaMagic(HistoryDealGetInteger(deal,DEAL_MAGIC)))
         continue;

      total+=HistoryDealGetDouble(deal,DEAL_PROFIT);
      total+=HistoryDealGetDouble(deal,DEAL_SWAP);
      total+=HistoryDealGetDouble(deal,DEAL_COMMISSION);
      total+=HistoryDealGetDouble(deal,DEAL_FEE);
   }
   return total;
}

double BotFloatingProfitAllModes()
{
   double total=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol)
         continue;
      if(!IsScenovaMagic(PositionGetInteger(POSITION_MAGIC)))
         continue;

      total+=PositionGetDouble(POSITION_PROFIT);
      total+=PositionGetDouble(POSITION_SWAP);
   }
   return total;
}

double DailyProfitGivebackFloor()
{
   double target=EffectiveDailyProfitTarget();
   if(target <= 0.0)
      return 0.0;

   double percent = MathMax(0.0, MathMin(95.0, g_dailyProfitDrawdownPercent));
   return target * (1.0 - percent / 100.0);
}

void LoadDailyLossLock()
{
   string key=DailyLossLockGlobalKey();
   g_dailyLossLocked=false;

   if(!GlobalVariableCheck(key))
      return;

   int lockedDay=(int)GlobalVariableGet(key);
   if(lockedDay==g_dayKey)
      g_dailyLossLocked=true;
   else
      GlobalVariableDel(key);
}

void LockDailyLoss()
{
   if(g_dailyLossLocked)
      return;

   g_dailyLossLocked=true;
   GlobalVariableSet(DailyLossLockGlobalKey(),(double)g_dayKey);
   Print(
      "DAILY_LOSS reached. Mode=",DailyRiskMode(),
      " Daily bot P/L=",DoubleToString(DailyBotProfit(),2),
      " limit=",DoubleToString(EffectiveDailyLossLimit(),2)
   );
}

void UnlockDailyLossLock(string reason)
{
   if(!g_dailyLossLocked)
      return;

   g_dailyLossLocked=false;
   string key=DailyLossLockGlobalKey();
   if(GlobalVariableCheck(key))
      GlobalVariableDel(key);

   if(g_pendingCloseReason==CLOSE_REASON_DAILY_LOSS &&
      BasketPositionCount()==0 &&
      RescuePositionCount()==0)
   {
      g_pendingCloseReason=CLOSE_REASON_NONE;
      PersistPendingClose();
   }

   Print(
      "DAILY_LOSS_LOCK cleared reason=",reason,
      " mode=",DailyRiskMode(),
      " current=",DoubleToString(DailyBotProfit(),2),
      " newLimit=",DoubleToString(EffectiveDailyLossLimit(),2)
   );
}

void LoadDailyProfitRunOnState()
{
   string key=DailyProfitArmedGlobalKey();
   g_dailyProfitTargetArmed=false;

   if(GlobalVariableCheck(key))
   {
      int armedDay=(int)GlobalVariableGet(key);
      if(armedDay==g_dayKey)
         g_dailyProfitTargetArmed=true;
      else
         GlobalVariableDel(key);
      return;
   }

   // Migrate the pre-1.0.49 shared key only after the execution owner is known.
   string mode=DailyRiskMode();
   if((g_settingsSynchronized || BasketPositionCount()>0) &&
      mode!="ZERO_GRID")
   {
      string legacyKey=LegacyDailyProfitArmedGlobalKey();
      if(GlobalVariableCheck(legacyKey))
      {
         int legacyDay=(int)GlobalVariableGet(legacyKey);
         if(legacyDay==g_dayKey)
         {
            g_dailyProfitTargetArmed=true;
            GlobalVariableSet(key,(double)g_dayKey);
         }
         GlobalVariableDel(legacyKey);
      }
   }
}

void ArmDailyProfitRunOn()
{
   if(g_dailyProfitTargetArmed)
      return;

   g_dailyProfitTargetArmed = true;
   GlobalVariableSet(DailyProfitArmedGlobalKey(), (double)g_dayKey);
   Print(
      "DAILY_PROFIT_RUN_ON armed. Target=",
      DoubleToString(EffectiveDailyProfitTarget(), 2),
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
   // Lock/armed state is isolated by the current live Basket owner.
   LoadDailyProfitRunOnState();
   LoadDailyProfitLock();

   double dailyProfit = DailyBotProfit();
   double dailyProfitTarget = EffectiveDailyProfitTarget();
   bool autoBrokerTpOwned=count>0 &&
      BasketHasAutoPosition() &&
      !BasketHasTacticalPosition() &&
      !BasketHasManualPosition() &&
      !BasketHasRacePosition() &&
      !BasketHasCounterPosition() &&
      !BasketHasFlipLockPosition() &&
      ZeroGridPositionCount()==0;

   if(g_dailyProfitLocked)
   {
      if(autoBrokerTpOwned)
      {
         g_state=STATE_SAFE_STOP;
         g_runAuthorized=false;
         g_executionStatus="AUTO_DAILY_PROFIT_WAIT_BROKER_TP";
         return false;
      }
      if(FlipLockModeEnabled()) FlipLockRemoveAllPending();
      if(count > 0)
         CloseAllBasket("DAILY_PROFIT_LOCK");

      g_state = STATE_SAFE_STOP;
      g_runAuthorized = false;
      g_executionStatus = "DAILY_PROFIT_LOCK";
      ResetTrail();
      return true;
   }

   if(dailyProfitTarget <= 0.0)
   {
      if(g_dailyProfitTargetArmed)
         DisarmDailyProfitRunOn();
      return false;
   }

   bool continueAfterTarget =
      !FlipLockModeEnabled() &&
      g_dailyProfitContinueAfterTarget &&
      g_dailyProfitDrawdownPercent > 0.0;

   if(continueAfterTarget)
   {
      if(!g_dailyProfitTargetArmed && dailyProfit >= dailyProfitTarget)
         ArmDailyProfitRunOn();

      if(g_dailyProfitTargetArmed)
      {
         double floor = DailyProfitGivebackFloor();
         if(dailyProfit <= floor)
         {
            LockDailyProfitGiveback();
            if(autoBrokerTpOwned)
            {
               g_state=STATE_SAFE_STOP;
               g_runAuthorized=false;
               g_executionStatus="AUTO_DAILY_PROFIT_WAIT_BROKER_TP";
               return false;
            }
            if(FlipLockModeEnabled()) FlipLockRemoveAllPending();
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

   if(dailyProfit >= dailyProfitTarget)
   {
      LockDailyProfitTarget();
      if(autoBrokerTpOwned)
      {
         g_state=STATE_SAFE_STOP;
         g_runAuthorized=false;
         g_executionStatus="AUTO_DAILY_PROFIT_WAIT_BROKER_TP";
         return false;
      }
      if(FlipLockModeEnabled()) FlipLockRemoveAllPending();
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
      " newTarget=",DoubleToString(EffectiveDailyProfitTarget(),2)
   );
}

void LoadDailyProfitLock()
{
   string key=DailyProfitLockGlobalKey();
   g_dailyProfitLocked=false;

   if(GlobalVariableCheck(key))
   {
      int lockedDay=(int)GlobalVariableGet(key);
      if(lockedDay==g_dayKey)
         g_dailyProfitLocked=true;
      else
         GlobalVariableDel(key);
      return;
   }

   // Migrate the pre-1.0.49 shared lock to the resolved owner exactly once.
   string mode=DailyRiskMode();
   if((g_settingsSynchronized || BasketPositionCount()>0) &&
      mode!="ZERO_GRID")
   {
      string legacyKey=LegacyDailyProfitLockGlobalKey();
      if(GlobalVariableCheck(legacyKey))
      {
         int legacyDay=(int)GlobalVariableGet(legacyKey);
         if(legacyDay==g_dayKey)
         {
            g_dailyProfitLocked=true;
            GlobalVariableSet(key,(double)g_dayKey);
         }
         GlobalVariableDel(legacyKey);
      }
   }
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
      DoubleToString(EffectiveDailyProfitTarget(), 2)
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

ENUM_ORDER_TYPE_FILLING AllowedFillingModeForSymbol(string symbol)
{
   long filling = SymbolInfoInteger(symbol, SYMBOL_FILLING_MODE);
   if((filling & SYMBOL_FILLING_FOK) == SYMBOL_FILLING_FOK)
      return ORDER_FILLING_FOK;
   if((filling & SYMBOL_FILLING_IOC) == SYMBOL_FILLING_IOC)
      return ORDER_FILLING_IOC;
   return ORDER_FILLING_RETURN;
}

ENUM_ORDER_TYPE_FILLING AllowedFillingMode()
{
   return AllowedFillingModeForSymbol(_Symbol);
}

double NormalizeTradeVolumeForSymbol(string symbol,double volume)
{
   double minVolume = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
   double maxVolume = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
   double step = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);

   volume = MathMax(minVolume, MathMin(maxVolume, volume));
   if(step > 0.0)
   {
      volume = MathFloor((volume + 1e-12) / step) * step;
      volume = MathMax(minVolume, MathMin(maxVolume, volume));
   }

   return NormalizeDouble(volume, 8);
}

double NormalizeTradeVolume(double volume)
{
   return NormalizeTradeVolumeForSymbol(_Symbol,volume);
}

bool TradeResultAccepted(const MqlTradeResult &result)
{
   return (
      result.retcode == TRADE_RETCODE_DONE ||
      result.retcode == TRADE_RETCODE_PLACED ||
      result.retcode == TRADE_RETCODE_DONE_PARTIAL
   );
}

int DynamicDeviationPoints()
{
   double spread = CurrentSpreadPoints();
   double atr = AverageTrueRangePoints(PERIOD_M5, g_atrPeriod);
   if(spread <= 0.0 || spread >= 999999.0)
      spread = 5.0;
   if(atr <= 0.0)
      atr = spread * 4.0;

   double deviation = MathMax(5.0, MathMax(spread * 1.50, atr * 0.12));
   // BTC CFD symbols can quote with very small point sizes, making an 80-point
   // cap far tighter than one live spread. Keep XAU/FX behavior unchanged while
   // sizing crypto deviation from the broker's own spread/ATR.
   double cap = IsBitcoinSymbol()
      ? MathMin(100000.0,MathMax(500.0,MathMax(spread*3.0,atr*0.50)))
      : 80.0;
   return (int)MathRound(MathMin(cap, deviation));
}

int DynamicDeviationPointsForSymbol(string symbol)
{
   if(symbol=="" || symbol==_Symbol)
      return DynamicDeviationPoints();

   MqlTick tick;
   double point=SymbolInfoDouble(symbol,SYMBOL_POINT);
   if(point<=0.0 || !SymbolInfoTick(symbol,tick))
      return 80;

   double spread=(tick.ask-tick.bid)/point;
   if(spread<=0.0 || spread>=999999.0)
      spread=5.0;
   return (int)MathRound(MathMin(100000.0,MathMax(10.0,spread*3.0)));
}

bool OrderSendWithPriceRetry(MqlTradeRequest &request, MqlTradeResult &result)
{
   request.deviation = DynamicDeviationPointsForSymbol(request.symbol);
   ResetLastError();
   bool sent = OrderSend(request, result);
   if(sent && TradeResultAccepted(result))
      return true;

   long retcode = (long)result.retcode;
   bool retryable =
      retcode == TRADE_RETCODE_PRICE_CHANGED ||
      retcode == TRADE_RETCODE_REQUOTE ||
      retcode == TRADE_RETCODE_PRICE_OFF;
   if(!retryable)
      return sent;

   MqlTick tick;
   if(!SymbolInfoTick(request.symbol, tick))
      return sent;
   if(request.type == ORDER_TYPE_BUY)
      request.price = tick.ask;
   else if(request.type == ORDER_TYPE_SELL)
      request.price = tick.bid;
   else
      return sent;

   // RACE risk is anchored to the actual retry entry price. A requote must not
   // reuse an SL calculated from the stale first price because that can widen
   // the real loss distance beyond the automatic safety envelope.
   bool raceEntryRetry=
      request.position==0 &&
      StringCompare(request.comment,"SaaSRace")==0;
   if(raceEntryRetry)
   {
      int raceDirection=request.type==ORDER_TYPE_BUY ? 1 : -1;
      double refreshedStop=RaceInitialStopPrice(
         raceDirection,
         request.price
      );
      if(refreshedStop<=0.0)
      {
         result.retcode=TRADE_RETCODE_INVALID_STOPS;
         return false;
      }
      request.sl=NormalizeStopPriceToTick(
         refreshedStop,
         raceDirection
      );
      g_dynamicStopPrice=request.sl;
   }

   request.deviation = DynamicDeviationPointsForSymbol(request.symbol);
   ResetLastError();
   return OrderSend(request, result);
}

long RescueMagic()
{
   return InpMagic + 910001;
}

bool IsScenovaMagic(long magic)
{
   return magic == InpMagic || magic == RescueMagic();
}

// A manual/mobile close can create an EXIT deal with magic=0 even though
// the position was opened by SCENOVA. Resolve ownership from the original
// position history, but only use this fallback for closing deals.
long ScenovaOwnerMagicForPosition(ulong positionId)
{
   if(positionId == 0 || !HistorySelectByPosition(positionId))
      return 0;

   int totalDeals = HistoryDealsTotal();
   for(int i = 0; i < totalDeals; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0)
         continue;

      long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_IN && entry != DEAL_ENTRY_INOUT)
         continue;
      if(HistoryDealGetString(ticket, DEAL_SYMBOL) != _Symbol)
         continue;

      long magic = HistoryDealGetInteger(ticket, DEAL_MAGIC);
      if(IsScenovaMagic(magic))
         return magic;
   }
   return 0;
}

long ScenovaOwnerMagicForDeal(ulong dealTicket)
{
   if(dealTicket == 0 || !HistoryDealSelect(dealTicket))
      return 0;
   if(HistoryDealGetString(dealTicket, DEAL_SYMBOL) != _Symbol)
      return 0;

   long magic = HistoryDealGetInteger(dealTicket, DEAL_MAGIC);
   if(IsScenovaMagic(magic))
      return magic;

   long entry = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
   if(entry != DEAL_ENTRY_OUT &&
      entry != DEAL_ENTRY_OUT_BY &&
      entry != DEAL_ENTRY_INOUT)
      return 0;

   ulong positionId = (ulong)HistoryDealGetInteger(
      dealTicket,
      DEAL_POSITION_ID
   );
   return ScenovaOwnerMagicForPosition(positionId);
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
   double effectiveBasketLoss=EffectiveBasketLossLimit();
   if(effectiveBasketLoss>0.0)
      threshold=MathMin(threshold,MathMax(1.0,effectiveBasketLoss*0.45));
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

bool SendRescueOrder(int direction,double requestedVolume) /* V9_RETRY */
{
   // Recovery hedge orders are intentionally disabled. Keep this hard gate in
   // the execution function so stale settings or future callers cannot open an
   // opposite-side SCNRescue position.
   g_executionStatus="RESCUE_DISABLED";
   return false;
}

bool ClosePositionVolumeByTicket(ulong ticket,double requestedVolume,string comment) /* V9_RETRY */
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
   request.deviation=DynamicDeviationPoints();
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
   if(!OrderSendWithPriceRetry(request,result))
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
   // No hedge rebalancing or opposite-side recovery positions are allowed.
   g_executionStatus="RESCUE_DISABLED";
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
   // Recovery/hedge mode is fully disabled. If an older EA left SCNRescue
   // positions open, unwind only those legacy rescue positions and reset the
   // rescue state. Primary AUTO/RACE/MANUAL positions remain under their normal
   // owner and exit rules.
   g_rescueEnabled=false;

   int rescueCount=RescuePositionCount();
   if(rescueCount>0)
   {
      g_executionStatus="RESCUE_DISABLED_CLEANUP";
      CloseRescuePositions();
      if(RescuePositionCount()>0)
         return true;
   }

   if(g_rescueState!=RESCUE_NORMAL ||
      g_rescueRealizedProfit!=0.0 ||
      g_rescuePrimaryDirection!=0 ||
      g_rescueHedgeDirection!=0)
      ResetRescueState();

   g_executionStatus="RESCUE_DISABLED";
   return false;
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

string MarketSessionStateNow()
{
   if(!TerminalConnectedNow())
      return "TERMINAL_OFFLINE";

   // TimeTradeServer() advances between ticks and is therefore suitable for
   // checking the broker's published trading sessions while the market is idle.
   datetime serverNow = TimeTradeServer();
   if(serverNow <= 0)
      serverNow = TimeCurrent();

   MqlDateTime nowParts;
   if(serverNow <= 0 || !TimeToStruct(serverNow, nowParts))
      return "UNKNOWN";

   ENUM_DAY_OF_WEEK day = (ENUM_DAY_OF_WEEK)nowParts.day_of_week;
   int nowSeconds = nowParts.hour * 3600 + nowParts.min * 60 + nowParts.sec;
   bool foundSession = false;

   for(uint session = 0; session < 32; session++)
   {
      datetime from = 0;
      datetime to = 0;
      if(!SymbolInfoSessionTrade(_Symbol, day, session, from, to))
         break;

      foundSession = true;
      MqlDateTime fromParts;
      MqlDateTime toParts;
      if(!TimeToStruct(from, fromParts) || !TimeToStruct(to, toParts))
         continue;

      int fromSeconds = fromParts.hour * 3600 + fromParts.min * 60 + fromParts.sec;
      int toSeconds = toParts.hour * 3600 + toParts.min * 60 + toParts.sec;

      if(fromSeconds == toSeconds)
         return "OPEN";

      bool active = fromSeconds < toSeconds
         ? (nowSeconds >= fromSeconds && nowSeconds < toSeconds)
         : (nowSeconds >= fromSeconds || nowSeconds < toSeconds);
      if(active)
         return "OPEN";
   }

   if(foundSession)
      return "CLOSED";

   // Crypto brokers may trade BTC/XBT through weekends without publishing
   // SymbolInfoSessionTrade rows. A fresh broker tick is authoritative enough
   // to allow trading; a stale/missing tick remains UNKNOWN and therefore
   // cannot be mistaken for a confirmed open session.
   if(IsBitcoinSymbol())
   {
      MqlTick cryptoTick;
      if(SymbolInfoTick(_Symbol,cryptoTick) &&
         cryptoTick.time>0 &&
         MathAbs((double)(serverNow-(datetime)cryptoTick.time))<=120.0)
         return "OPEN";
      return "CLOSED";
   }

   // Non-crypto symbols with no weekend session metadata are treated closed.
   if(day == SATURDAY || day == SUNDAY)
      return "CLOSED";

   return "UNKNOWN";
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

   if(MarketSessionStateNow() == "CLOSED")
      return "MARKET_CLOSED";

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
   int digits=(int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS);
   double minStopPoints=MathMax(
      (double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL),
      0.0
   )+2.0;

   // COUNTER never owns a Broker SL. Keep this explicit even though COUNTER
   // uses its dedicated market-order path, so future callers cannot add one.
   if(EffectiveExecutionMode()=="COUNTER")
      return 0.0;

   // MANUAL Stop Loss is an explicit switch. Zero means no Broker SL at all;
   // never substitute a hidden ATR stop behind a disabled website control.
   if(EffectiveExecutionMode()=="MANUAL" && g_manualStopLossPoints<=0.0)
      return 0.0;

   // When enabled, preserve the customer's requested distance except for the
   // Broker's mandatory Stops Level.
   if(EffectiveExecutionMode()=="MANUAL" && g_manualStopLossPoints>0.0)
   {
      double points=MathMax(g_manualStopLossPoints,minStopPoints);
      double manualStop=direction>0
         ? entryPrice-points*_Point
         : entryPrice+points*_Point;
      return NormalizeStopPriceToTick(manualStop,direction);
   }

   double atrPoints=g_atrPoints>0.0
      ? g_atrPoints
      : AverageTrueRangePoints(PERIOD_M15,g_atrPeriod);
   double atrPrice=MathMax(_Point*10.0,atrPoints*_Point);
   double baseDistance=MathMax(1.0,EffectiveHardStopDistancePoints())*_Point;
   double stop=direction>0
      ? entryPrice-baseDistance
      : entryPrice+baseDistance;

   // Auto SL sits beyond useful structure/zone when that can be done without
   // expanding risk beyond a bounded ATR envelope. This prevents noise-tight
   // stops while also preventing an excessively wide first-position stop.
   double structure=0.0;
   if(direction>0)
   {
      structure=ClosestBelow(
         entryPrice,g_nearestSupport,g_demandZoneLow,g_majorSupport
      );
      if(structure>0.0)
      {
         double structuralStop=structure-atrPrice*0.12;
         double maxWideStop=entryPrice-MathMax(baseDistance,atrPrice*2.75);
         structuralStop=MathMax(structuralStop,maxWideStop);
         if(structuralStop<stop)
            stop=structuralStop;
      }
      stop=MathMin(stop,entryPrice-minStopPoints*_Point);
   }
   else
   {
      structure=ClosestAbove(
         entryPrice,g_nearestResistance,g_supplyZoneHigh,g_majorResistance
      );
      if(structure>0.0)
      {
         double structuralStop=structure+atrPrice*0.12;
         double maxWideStop=entryPrice+MathMax(baseDistance,atrPrice*2.75);
         structuralStop=MathMin(structuralStop,maxWideStop);
         if(structuralStop>stop)
            stop=structuralStop;
      }
      stop=MathMax(stop,entryPrice+minStopPoints*_Point);
   }

   return NormalizeStopPriceToTick(stop,direction);
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

   // Indicator V6 target engine uses the nearest Profile/Session/Day/Week/
   // Structure reaction level. It never invents a target behind entry.
   RefreshIndicatorV6Scores(direction,MomentumPoints());
   double indicatorTarget=IndicatorTargetCandidate(direction,entryPrice);
   g_indicatorTargetPrice=indicatorTarget;
   if(indicatorTarget>0.0)
   {
      double indicatorDistance=MathAbs(indicatorTarget-entryPrice);
      double baseTargetDistance=MathAbs(target-entryPrice);
      bool validDirection=direction>0
         ? indicatorTarget>entryPrice
         : indicatorTarget<entryPrice;
      if(validDirection && indicatorDistance>=riskDistance*0.75)
      {
         if(g_indicatorCompositeScore<78.0 &&
            indicatorDistance<baseTargetDistance)
            target=indicatorTarget;
         else if(g_indicatorCompositeScore>=82.0 &&
                 indicatorDistance>baseTargetDistance &&
                 indicatorDistance<=riskDistance*2.60)
            target=indicatorTarget;
      }
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

   return NormalizeTargetPriceToTick(target,direction);
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
   long positionType=PositionGetInteger(POSITION_TYPE);
   int direction=positionType==POSITION_TYPE_BUY ? 1 : -1;
   request.sl = sl>0.0 ? NormalizeStopPriceToTick(sl,direction) : 0.0;
   request.tp = tp>0.0 ? NormalizeTargetPriceToTick(tp,direction) : 0.0;

   ResetLastError();
   if(!OrderSend(request, result))
      return false;
   return TradeResultAccepted(result);
}

void ManageDynamicProtection()
{
   ulong nowMs=GetTickCount64();
   if(g_lastDynamicProtectionTickMs>0 &&
      nowMs-g_lastDynamicProtectionTickMs<LOCAL_DYNAMIC_PROTECTION_INTERVAL_MS)
      return;
   g_lastDynamicProtectionTickMs=nowMs;

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
      string positionComment=PositionGetString(POSITION_COMMENT);
      bool tacticalPosition=StringFind(positionComment,"SaaSTactical")>=0;
      bool autoPosition=StringFind(positionComment,AUTO_LIVE_COMMENT)>=0;
      bool manualPosition=
         StringFind(positionComment,MANUAL_LIVE_COMMENT)>=0 ||
         StringFind(positionComment,LEGACY_BASKET_COMMENT)>=0;
      bool counterPosition=StringFind(positionComment,"SaaSCounter")>=0;
      bool autoFamilyPosition=autoPosition || tacticalPosition;

      // MANUAL means MANUAL: preserve its existing isolation contract exactly.
      if(manualPosition)
         continue;

      // COUNTER is stricter: never add Broker SL/TP after the order is open.
      if(counterPosition)
         continue;

      double marketPrice = direction > 0 ? tick.bid : tick.ask;
      double profitPoints = direction > 0
         ? (marketPrice - openPrice) / _Point
         : (openPrice - marketPrice) / _Point;

      bool strictAutoHardTarget =
         autoFamilyPosition &&
         g_profitTargetMode=="AUTO" &&
         g_basketProfitTarget>0.0;

      double desiredSL = currentSL;
      if(autoPosition)
      {
         // Recover missing initial Broker SL, but never trail before 80%.
         if(currentSL<=0.0 && g_autoBasketStopPrice>0.0)
            desiredSL=g_autoBasketStopPrice;

         // At 80% of the ENTRY->BROKER TP journey, move the Broker SL
         // to 50% of that same original journey. BUY uses Bid, SELL Ask.
         double targetPrice=currentTP>0.0 ? currentTP : g_autoBasketTargetPrice;
         double distanceToTp=direction*(targetPrice-openPrice);
         double progressToTp=direction*(marketPrice-openPrice);
         if(targetPrice>0.0 && distanceToTp>_Point &&
            progressToTp>=distanceToTp*0.80)
         {
            double halfwayStop=openPrice+direction*distanceToTp*0.50;
            double brokerGap=minStopPoints*_Point;
            bool brokerAllowsHalfway=direction>0
               ? halfwayStop<tick.bid-brokerGap
               : halfwayStop>tick.ask+brokerGap;
            if(brokerAllowsHalfway)
               desiredSL=desiredSL<=0.0
                  ? halfwayStop
                  : (direction>0
                     ? MathMax(desiredSL,halfwayStop)
                     : MathMin(desiredSL,halfwayStop));
         }
      }
      else
      {
         // Non-AUTO behavior remains exactly as before.
         if(!strictAutoHardTarget && profitPoints >= atr * 0.55)
         {
            double breakEven = direction > 0
               ? openPrice + atr * 0.04 * _Point
               : openPrice - atr * 0.04 * _Point;
            if(direction > 0)
               desiredSL = currentSL <= 0.0 ? breakEven : MathMax(currentSL, breakEven);
            else
               desiredSL = currentSL <= 0.0 ? breakEven : MathMin(currentSL, breakEven);
         }

         if(!strictAutoHardTarget && profitPoints >= atr * 1.10)
         {
            double trail = direction > 0
               ? marketPrice - atr * 0.55 * _Point
               : marketPrice + atr * 0.55 * _Point;
            if(direction > 0)
               desiredSL = desiredSL <= 0.0 ? trail : MathMax(desiredSL, trail);
            else
               desiredSL = desiredSL <= 0.0 ? trail : MathMin(desiredSL, trail);
         }

         // EMA Dynamic Trailing: once profit is established, EMA21/50 becomes
         // a structural trailing reference. It only tightens SL.
         if(!strictAutoHardTarget && profitPoints >= atr * 0.70)
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
      }

      int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
      if(direction > 0 && desiredSL > 0.0)
         desiredSL = MathMin(desiredSL, tick.bid - minStopPoints * _Point);
      else if(direction < 0 && desiredSL > 0.0)
         desiredSL = MathMax(desiredSL, tick.ask + minStopPoints * _Point);
      // Broker freeze-distance clamping must never move an existing AUTO SL
      // backward. If 50% lock is not allowed yet, retry on a later tick.
      if(autoPosition && currentSL>0.0)
         desiredSL=direction>0
            ? MathMax(desiredSL,currentSL)
            : MathMin(desiredSL,currentSL);
      desiredSL = desiredSL > 0.0 ? NormalizeStopPriceToTick(desiredSL,direction) : 0.0;

      // Only Auto owns a system-generated Broker TP. Manual follows the money
      // target selected by the user and Off leaves profit exits disabled.
      double desiredTP = currentTP;
      bool positionUsesAutoProtection=autoFamilyPosition;
      if(autoPosition && g_autoBasketTargetPrice>0.0)
      {
         desiredTP=NormalizeTargetPriceToTick(g_autoBasketTargetPrice,direction);
      }
      else if(tacticalPosition &&
              count == 1 &&
              g_perPositionProfit <= 0.0 &&
              g_basketProfitTarget <= 0.0)
      {
         desiredTP=TacticalTakeProfitPrice(direction,openPrice);
         if(direction > 0) desiredTP=MathMax(desiredTP,tick.ask+minStopPoints*_Point);
         else desiredTP=MathMin(desiredTP,tick.bid-minStopPoints*_Point);
         desiredTP=NormalizeTargetPriceToTick(desiredTP,direction);
      }

      bool slChanged = desiredSL > 0.0 &&
         (currentSL <= 0.0 || MathAbs(desiredSL - currentSL) >= _Point * 2.0);
      // AUTO must never erase its Broker TP because of a money profile.
      bool clearSystemTP =
         !autoFamilyPosition && g_profitTargetMode != "AUTO" && currentTP > 0.0;
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

bool SendMarketOrder(int direction) /* V9_RETRY */
{
   int positionsBefore = BasketPositionCount();
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
   bool auto=AutoEnabled() && !g_tacticalCountertrendActive;
   bool raceOrder = RaceModeEnabled() || BasketHasRacePosition();
   bool flipLockOrder = FlipLockModeEnabled();
   bool manualOrder = EffectiveExecutionMode()=="MANUAL";
   AUTO_SIDE autoPlan;
   if(auto)
      autoPlan=direction>0 ? g_autoBuy : g_autoSell;

   request.action = TRADE_ACTION_DEAL;
   request.magic = InpMagic;
   request.symbol = _Symbol;
   request.volume = flipLockOrder
      ? NormalizeTradeVolume(g_lot)
      : (auto
         ? autoPlan.plannedLot
         : (g_adaptiveEngine ? g_adaptiveLot : NormalizeTradeVolume(g_lot)));
   if(request.volume<=0.0)
   {
      g_executionStatus="AUTO_RISK_VOLUME_ZERO";
      return false;
   }
   request.deviation = DynamicDeviationPoints();
   request.type_filling = AllowedFillingMode();
   request.comment = auto
      ? AUTO_LIVE_COMMENT
      : (raceOrder
      ? "SaaSRace"
      : (flipLockOrder
         ? FLIP_LOCK_LIVE_COMMENT
         : (g_tacticalCountertrendActive
            ? "SaaSTactical"
            : (manualOrder ? MANUAL_LIVE_COMMENT : LEGACY_BASKET_COMMENT))));

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
   if(auto)
   {
      double atrPrice=MathMax(_Point*12.0,
         AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point);
      double executionMoveTolerance=MathMax(
         _Point*2.0,
         MathMax((tick.ask-tick.bid)*1.50,atrPrice*0.18)
      );
      if(MathAbs(entryPrice-autoPlan.entryPrice)>executionMoveTolerance)
      {
         // Do one bounded AUTO-only re-plan at the live quote. This keeps the
         // Broker SL/TP tied to the current price instead of discarding a valid
         // Demand/Supply opportunity just because the quote moved quickly.
         g_executionStatus="AUTO_PRICE_MOVED_REEVALUATE";
         AutoPlanPrices(autoPlan,g_autoLevels);
         AutoApplyNoIncreaseLotCap(autoPlan);
         if(positionsBefore>0)
         {
            autoPlan.aggregateRiskMoney=AutoAggregateRiskAtStop(
               direction,
               g_autoBasketStopPrice>0.0
                  ? g_autoBasketStopPrice
                  : autoPlan.slPrice,
               autoPlan.plannedLot
            )+autoPlan.knownCostMoney;
         }

         string replanRiskReason="NONE";
         if(!AutoRiskBudgetAllows(autoPlan,positionsBefore,replanRiskReason))
         {
            g_autoRejectReason=replanRiskReason;
            g_adaptiveBlockReason="AUTO_RISK_BUDGET";
            return false;
         }

         if(direction>0) g_autoBuy=autoPlan;
         else g_autoSell=autoPlan;
         request.volume=autoPlan.plannedLot;
      }

      request.sl=autoPlan.slPrice;
      request.tp=autoPlan.tpPrice;
      if(positionsBefore>0)
      {
         if(g_autoBasketStopPrice>0.0)
            request.sl=direction>0 ? MathMax(g_autoBasketStopPrice,request.sl) : MathMin(g_autoBasketStopPrice,request.sl);
         if(g_autoBasketTargetPrice>0.0)
            request.tp=g_autoBasketTargetPrice;
      }
      double minimumStopDistance=(double)SymbolInfoInteger(
         _Symbol,SYMBOL_TRADE_STOPS_LEVEL
      )*_Point+2.0*_Point;
      bool protectedOrder=direction>0
         ? request.sl<tick.bid-minimumStopDistance &&
           request.tp>tick.bid+minimumStopDistance
         : request.sl>tick.ask+minimumStopDistance &&
           request.tp<tick.ask-minimumStopDistance;
      if(!protectedOrder)
      {
         g_executionStatus="AUTO_BROKER_PROTECTION_INVALID";
         return false;
      }
   }
   else
   {
      request.sl = raceOrder
         ? RaceInitialStopPrice(direction, entryPrice)
         : (flipLockOrder
            ? FlipLockInitialSafetyStopPrice(direction,entryPrice,tick)
            : DynamicInitialStopPrice(direction, entryPrice));
      if(raceOrder && request.sl <= 0.0)
         return false;
      if(flipLockOrder && request.sl <= 0.0)
      {
         g_executionStatus = "FLIP_LOCK_WAIT_ATR";
         return false;
      }
      if(!raceOrder && !flipLockOrder && g_profitTargetMode == "AUTO" &&
         request.sl > 0.0 &&
         (g_tacticalCountertrendActive || !BasketFillEnabled()) &&
         g_perPositionProfit <= 0.0 &&
         g_basketProfitTarget <= 0.0)
      {
         request.tp = g_tacticalCountertrendActive
            ? TacticalTakeProfitPrice(direction,entryPrice)
            : DynamicTakeProfitPrice(direction, entryPrice, request.sl);
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
   }

   if(request.sl>0.0)
      request.sl=NormalizeStopPriceToTick(request.sl,direction);
   if(request.tp>0.0)
      request.tp=NormalizeTargetPriceToTick(request.tp,direction);

   g_dynamicStopPrice = request.sl;
   g_dynamicTakeProfitPrice = (raceOrder || flipLockOrder)
      ? 0.0
      : (request.tp > 0.0
         ? request.tp
         : DynamicTakeProfitPrice(direction, entryPrice, request.sl));

   g_adaptiveLot = request.volume;

   ResetLastError();
   // An AUTO plan binds price, SL and TP together. Retrying only the price would
   // detach those protections from the approved risk calculation, so AUTO
   // declines and re-evaluates on the next tick instead.
   bool sent=auto
      ? OrderSend(request,result)
      : OrderSendWithPriceRetry(request,result);
   if(!sent)
   {
      RecordExecutionQuality(false, 0.0);
      g_lastOrderError = GetLastError();
      g_lastOrderRetcode = (long)result.retcode;
      g_lastOrderAt = TimeCurrent();
      bool preserveRaceRiskStatus=
         raceOrder &&
         (g_executionStatus=="RACE_STOP_RISK_TOO_WIDE" ||
          g_executionStatus=="RACE_ATR_NOT_READY");
      if(!preserveRaceRiskStatus)
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
   string entryReason = direction > 0 ? "BUY" : "SELL";
   if(g_entryTrigger == "REVERSAL_BUY" ||
      g_entryTrigger == "REVERSAL_SELL" ||
      g_entryTrigger == "TACTICAL_COUNTERTREND_BUY" ||
      g_entryTrigger == "TACTICAL_COUNTERTREND_SELL")
      entryReason = g_entryTrigger;
   double zoneScore = direction > 0 ? g_demandZoneScore : g_supplyZoneScore;
   entryReason += " · Zone " + DoubleToString(zoneScore,0);
   if((direction > 0 && g_emaReclaimState == "RECLAIM_EMA21_UP") ||
      (direction < 0 && g_emaReclaimState == "LOSE_EMA21_DOWN"))
      entryReason += " + EMA Turn";
   if((direction > 0 && g_rsiDivergenceBuyScore > 0.0) ||
      (direction < 0 && g_rsiDivergenceSellScore > 0.0))
      entryReason += " + RSI Divergence";
   if(g_entryTrigger != "NONE")
      entryReason += " + " + g_entryTrigger;
   if(g_entryPrecisionState!="LEGACY")
      entryReason += " + " + g_entryPrecisionState;
   if(g_liquidityScore>=65.0)
      entryReason += " + Liquidity Sweep";
   if(g_microStructureScore>=65.0)
      entryReason += " + Micro Structure";
   if(g_fvgScore>=52.0)
      entryReason += " + FVG";
   g_lastEntryReason = entryReason;
   TesterStartCycleIfNeeded(direction,positionsBefore);
   TesterUpdateCycleMetrics(BasketPositionCount(),BasketCycleProfit());
   RecordExecutionQuality(true, slippagePoints);
   g_lastEntryAt = TimeCurrent();
   g_executionStatus = "ORDER_ACCEPTED";
   return true;
}

bool ClosePositionByTicket(ulong ticket) /* V9_RETRY */
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
   request.volume = NormalizeTradeVolumeForSymbol(symbol,volume);
   request.deviation = DynamicDeviationPointsForSymbol(symbol);
   request.type_filling = AllowedFillingModeForSymbol(symbol);
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

   if(!OrderSendWithPriceRetry(request, result))
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
   if(StringFind(reason, "BRAIN_V8_REVERSAL") == 0 ||
      StringFind(reason, "BRAIN_V9_REVERSAL") == 0)
      return CLOSE_REASON_BRAIN_REVERSAL;
   if(StringFind(reason, "TACTICAL_COUNTERTREND") == 0)
      return CLOSE_REASON_TACTICAL;
   if(StringFind(reason, "RESCUE_") == 0)
      return CLOSE_REASON_RESCUE;
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
   if(reasonCode == CLOSE_REASON_BRAIN_REVERSAL) return "BRAIN_REVERSAL_EXIT";
   if(reasonCode == CLOSE_REASON_TACTICAL) return "TACTICAL_COUNTERTREND_EXIT";
   if(reasonCode == CLOSE_REASON_RESCUE) return "RESCUE_RECOVERY_EXIT";
   return "CLOSE_ALL";
}

string CloseCompletionStatus(int reasonCode)
{
   if(reasonCode == CLOSE_REASON_DAILY_PROFIT) return "DAILY_PROFIT_LOCK";
   if(reasonCode == CLOSE_REASON_DAILY_LOSS) return "DAILY_LOSS_LOCK";
   if(reasonCode == CLOSE_REASON_BASKET_LOSS) return "MAX_BASKET_LOSS";
   if(reasonCode == CLOSE_REASON_TRAIL) return "PROFIT_TRAIL";
   if(reasonCode == CLOSE_REASON_SAFE_STOP) return "SAFE_STOP";
   if(reasonCode == CLOSE_REASON_BRAIN_REVERSAL) return "BASKET_REVERSAL_EXIT";
   if(reasonCode == CLOSE_REASON_TACTICAL) return "TACTICAL_COUNTERTREND_EXIT";
   if(reasonCode == CLOSE_REASON_RESCUE) return "RESCUE_EXIT";
   return "STOPPED";
}

void PersistPendingClose()
{
   GlobalVariableSet(DailyRiskStateKey("close"), (double)g_pendingCloseReason);
}

int ScenovaAccountPositionCount()
{
   int count=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;
      if(IsScenovaMagic(PositionGetInteger(POSITION_MAGIC)))
         count++;
   }
   return count;
}

int ScenovaAccountPendingCount()
{
   int count=0;
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket))
         continue;
      if(IsScenovaMagic(OrderGetInteger(ORDER_MAGIC)))
         count++;
   }
   return count;
}

bool RemoveScenovaPendingOrderByTicket(ulong ticket)
{
   if(ticket==0 || !OrderSelect(ticket))
      return false;
   long magic=OrderGetInteger(ORDER_MAGIC);
   if(!IsScenovaMagic(magic))
      return false;

   MqlTradeRequest request={};
   MqlTradeResult result={};
   request.action=TRADE_ACTION_REMOVE;
   request.order=ticket;
   request.magic=magic;
   request.symbol=OrderGetString(ORDER_SYMBOL);
   ResetLastError();
   bool sent=OrderSend(request,result);
   g_lastOrderError=GetLastError();
   g_lastOrderRetcode=(long)result.retcode;
   RegisterOrderRequest();
   if(!sent || !TradeResultAccepted(result))
   {
      Print("Force Flat pending remove failed. order=",ticket,
            " error=",g_lastOrderError," retcode=",result.retcode);
      return false;
   }
   return true;
}

void RemoveAllScenovaPendingOrders()
{
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket))
         continue;
      if(!IsScenovaMagic(OrderGetInteger(ORDER_MAGIC)))
         continue;
      RemoveScenovaPendingOrderByTicket(ticket);
   }
}

void ResetForceFlatRuntime()
{
   ResetZeroGridCycleState();
   ResetRaceRuntime();
   ResetRescueState();
   FlipLockResetTracking(true);
   ResetLegacyBurstStateForIsolatedMode();
   AutoResetCycle();
   ResetPrecisionWait();
   ResetTrail();
   ResetBasketCycleState();
   g_safeStopDrainRequested=false;
}

bool ForceFlatResetAccount(string reason)
{
   g_lastCloseReason=reason;
   g_state=STATE_SAFE_STOP;
   g_runAuthorized=false;
   g_safeStopDrainRequested=false;
   g_executionStatus="FORCE_FLATTENING";
   g_pendingCloseReason=CLOSE_REASON_REMOTE;
   PersistPendingClose();

   RemoveAllScenovaPendingOrders();

   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;
      if(!IsScenovaMagic(PositionGetInteger(POSITION_MAGIC)))
         continue;
      ClosePositionByTicket(ticket);
   }

   RemoveAllScenovaPendingOrders();

   bool flat=
      ScenovaAccountPositionCount()==0 &&
      ScenovaAccountPendingCount()==0;
   if(!flat)
   {
      g_executionStatus="FORCE_FLAT_RETRY";
      return false;
   }

   ResetForceFlatRuntime();
   g_pendingCloseReason=CLOSE_REASON_NONE;
   PersistPendingClose();
   g_state=STATE_STOPPED;
   g_runAuthorized=false;
   g_executionStatus="FORCE_FLAT_CONFIRMED";
   return true;
}

bool CloseAllBasket(string reason)
{
   g_lastCloseReason = reason;
   int testerDirection = MQLInfoInteger(MQL_TESTER) ? BasketDirection() : 0;
   double testerCloseProfit = MQLInfoInteger(MQL_TESTER) ? BasketCycleProfit() : 0.0;
   Print("CloseAllBasket reason=", reason);
   // Any global/safety close must also remove pending orders owned by isolated
   // execution modes. This prevents a FLIP LOCK baton from firing after a user
   // Close All / daily lock / hard loss has already flattened the live position.
   if(ZeroGridPendingCount()>0)
      ZeroGridCancelPending();
   FlipLockRemoveAllPending();
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
   if(closed && testerDirection != 0)
      TesterFinalizeCycle(testerDirection,testerCloseProfit);
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
   LoadDailyLossLock();
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
      LoadDailyLossLock();
   }
   else
   {
      ResetDailyBaseline();
   }

   string closeKey = DailyRiskStateKey("close");
   if((ScenovaAccountPositionCount()>0 || ScenovaAccountPendingCount()>0) &&
      GlobalVariableCheck(closeKey))
   {
      int restoredReason = (int)GlobalVariableGet(closeKey);
      g_pendingCloseReason =
         (restoredReason >= CLOSE_REASON_DAILY_LOSS && restoredReason <= CLOSE_REASON_RESCUE)
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

// Hotfix rebuild marker: RACE Close-All Profit exclusivity, EA remains v1.0.23.
