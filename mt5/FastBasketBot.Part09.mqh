
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

   // Brokers commonly publish no weekend session rows at all. On weekdays,
   // missing metadata remains UNKNOWN rather than falsely blocking a symbol.
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

   // Manual means manual: preserve the customer's requested distance except
   // for the Broker's mandatory Stops Level.
   if(g_manualStopLossPoints>0.0)
   {
      double points=MathMax(g_manualStopLossPoints,minStopPoints);
      double manualStop=direction>0
         ? entryPrice-points*_Point
         : entryPrice+points*_Point;
      return NormalizeDouble(manualStop,digits);
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

   return NormalizeDouble(stop,digits);
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
      bool tacticalPosition=
         StringFind(PositionGetString(POSITION_COMMENT),"SaaSTactical")>=0;
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
         desiredTP = tacticalPosition
            ? TacticalTakeProfitPrice(direction,openPrice)
            : DynamicTakeProfitPrice(direction, openPrice, baseStop);
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
   bool autoV20=AutoV20Enabled() && !g_tacticalCountertrendActive;
   AUTO_V20_SIDE autoPlan;
   if(autoV20)
      autoPlan=direction>0 ? g_autoV20Buy : g_autoV20Sell;

   request.action = TRADE_ACTION_DEAL;
   request.magic = InpMagic;
   request.symbol = _Symbol;
   request.volume = autoV20
      ? autoPlan.plannedLot
      : (g_adaptiveEngine ? g_adaptiveLot : NormalizeTradeVolume(g_lot));
   if(request.volume<=0.0)
   {
      g_executionStatus="AUTO_V20_RISK_VOLUME_ZERO";
      return false;
   }
   request.deviation = 30;
   request.type_filling = AllowedFillingMode();
   request.comment = autoV20
      ? "SaaSAutoV20"
      : (g_engineMode == "RACE"
      ? "SaaSRace"
      : (g_tacticalCountertrendActive ? "SaaSTactical" : "SaaSBasket"));

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
   if(autoV20)
   {
      double atrPrice=MathMax(_Point*12.0,
         AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point);
      if(MathAbs(entryPrice-autoPlan.entryPrice)>MathMax(_Point*2.0,atrPrice*0.08))
      {
         g_executionStatus="AUTO_V20_PRICE_MOVED_REEVALUATE";
         return false;
      }

      request.sl=autoPlan.slPrice;
      request.tp=autoPlan.tpPrice;
      double minimumStopDistance=(double)SymbolInfoInteger(
         _Symbol,SYMBOL_TRADE_STOPS_LEVEL
      )*_Point+2.0*_Point;
      bool protectedOrder=direction>0
         ? request.sl<tick.bid-minimumStopDistance && request.tp>tick.bid+minimumStopDistance
         : request.sl>tick.ask+minimumStopDistance && request.tp<tick.ask-minimumStopDistance;
      if(!protectedOrder)
      {
         g_executionStatus="AUTO_V20_BROKER_PROTECTION_INVALID";
         return false;
      }
   }
   else
   {
      request.sl = DynamicInitialStopPrice(direction, entryPrice);
      if(g_profitTargetMode == "AUTO" &&
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

   g_dynamicStopPrice = request.sl;
   g_dynamicTakeProfitPrice = request.tp > 0.0
      ? request.tp
      : DynamicTakeProfitPrice(direction, entryPrice, request.sl);

   g_adaptiveLot = request.volume;

   ResetLastError();
   // A V20 plan binds price, SL and TP together. Retrying only the price would
   // detach those protections from the approved risk calculation, so V20
   // declines and re-evaluates on the next tick instead.
   bool sent=autoV20
      ? OrderSend(request,result)
      : OrderSendWithPriceRetry(request,result);
   if(!sent)
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

bool CloseAllBasket(string reason)
{
   g_lastCloseReason = reason;
   int testerDirection = MQLInfoInteger(MQL_TESTER) ? BasketDirection() : 0;
   double testerCloseProfit = MQLInfoInteger(MQL_TESTER) ? BasketCycleProfit() : 0.0;
   Print("CloseAllBasket reason=", reason);
   // Any global/safety close must also remove ZERO GRID pending orders.
   if(ZeroGridPendingCount()>0)
      ZeroGridCancelPending();
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
