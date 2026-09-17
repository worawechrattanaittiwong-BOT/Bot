
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

   // Keep the ticket list before ownership lookups. HistorySelectByPosition()
   // changes the active history selection, so iterating the original index
   // directly would otherwise skip or duplicate deals.
   int totalDeals = HistoryDealsTotal();
   ulong dealTickets[];
   ArrayResize(dealTickets, totalDeals);
   for(int i = 0; i < totalDeals; i++)
      dealTickets[i] = HistoryDealGetTicket(i);

   for(int i = 0; i < totalDeals; i++)
   {
      ulong deal = dealTickets[i];
      if(deal == 0 || !HistoryDealSelect(deal))
         continue;
      if(HistoryDealGetString(deal, DEAL_SYMBOL) != _Symbol)
         continue;

      long magic = HistoryDealGetInteger(deal, DEAL_MAGIC);
      bool scenovaDeal = IsScenovaMagic(magic);
      if(!scenovaDeal)
      {
         long entry = HistoryDealGetInteger(deal, DEAL_ENTRY);
         if(entry == DEAL_ENTRY_OUT ||
            entry == DEAL_ENTRY_OUT_BY ||
            entry == DEAL_ENTRY_INOUT)
            scenovaDeal = IsScenovaMagic(
               ScenovaOwnerMagicForDeal(deal)
            );
      }
      if(!scenovaDeal)
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
      !FlipLockModeEnabled() &&
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

int DynamicDeviationPoints()
{
   double spread = CurrentSpreadPoints();
   double atr = AverageTrueRangePoints(PERIOD_M5, g_atrPeriod);
   if(spread <= 0.0 || spread >= 999999.0)
      spread = 5.0;
   if(atr <= 0.0)
      atr = spread * 4.0;

   double deviation = MathMax(5.0, MathMax(spread * 1.50, atr * 0.12));
   return (int)MathRound(MathMin(80.0, deviation));
}

bool OrderSendWithPriceRetry(MqlTradeRequest &request, MqlTradeResult &result)
{
   request.deviation = DynamicDeviationPoints();
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

   request.deviation = DynamicDeviationPoints();
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

bool SendRescueOrder(int direction,double requestedVolume) /* V9_RETRY */
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
   if(!OrderSendWithPriceRetry(request,result) || !TradeResultAccepted(result))
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
