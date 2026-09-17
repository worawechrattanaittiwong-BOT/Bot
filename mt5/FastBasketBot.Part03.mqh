
void OnTimer()
{
   SampleSpread();
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

   // TimeCurrent() can freeze when a broker is not producing ticks (weekend /
   // closed session). Drive the transport heartbeat from a monotonic terminal
   // clock instead. This keeps SaaS connectivity truthful without generating
   // any trading activity while the market is closed.
   ulong heartbeatNowMs = GetTickCount64();
   ulong heartbeatIntervalMs = (ulong)MathMax(1, InpHeartbeatSeconds) * 1000;
   if(g_lastHeartbeatTickMs == 0 ||
      heartbeatNowMs - g_lastHeartbeatTickMs >= heartbeatIntervalMs)
   {
      g_lastHeartbeatTickMs = heartbeatNowMs;
      g_lastHeartbeat = TimeCurrent();
      SendHeartbeat();
   }
   FlushPendingBasketJournal();

   // FLIP LOCK V2 also owns cleanup.  Always call it so a mode switch
   // cannot leave an orphan BUY STOP / SELL STOP at the broker.
   FlipLockManage();

   // ZERO_GRID_TIMER_MAINTENANCE_V116: ZERO is isolated from AUTO/RACE and may
   // finalize an async close or finish/retry its exact paired ladder from the
   // 200ms timer instead of waiting for another market tick.
   bool zeroTimerOwnsRuntime =
      g_zeroGridClosing ||
      ZeroGridPositionCount()>0 ||
      ZeroGridPendingCount()>0 ||
      (ZeroGridModeEnabled() && BasketPositionCount()<=0 && RescuePositionCount()<=0);
   if(g_settingsSynchronized && zeroTimerOwnsRuntime)
   {
      if(g_zeroGridClosing ||
         (ZeroGridModeEnabled() && g_state==STATE_RUNNING && g_access && TradePermissionStatus()=="OK"))
         ManageZeroGrid();
   }

   if(LegacyBasketEngineEnabled())
   {
      BrainV16RearmExistingBasket();
      ProcessBurstQueue();
   }
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

   if(symbol == _Symbol && ownerMagic == InpMagic)
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
      "{\"instanceId\":\"%s\",\"installToken\":\"%s\",\"state\":\"%s\",\"metrics\":{\"accountNumber\":\"%s\",\"eaVersion\":\"%s\",\"productVersion\":\"%s\",\"symbol\":\"%s\",\"server\":\"%s\",\"currency\":\"%s\",\"balance\":%.2f,\"equity\":%.2f,\"basketProfit\":%.2f,\"basketCycleProfit\":%.2f,\"basketProfitTarget\":%.2f,\"basketPeakPositions\":%d,\"perPositionProfitTarget\":%.2f,\"profitRunTrailPercent\":%.2f,\"profitRunPeak\":%.2f,\"perPositionLoss\":%.2f,\"dailyProfit\":%.2f,\"dailyProfitTarget\":%.2f,\"dailyProfitContinueAfterTarget\":%s,\"dailyProfitDrawdownPercent\":%.2f,\"dailyProfitTargetArmed\":%s,\"dailyProfitGivebackFloor\":%.2f,\"dailyProfitLocked\":%s,\"peakProfit\":%.2f,\"positions\":%d,\"spreadPoints\":%.1f,\"spreadPrice\":%s,\"pointSize\":%s,\"symbolDigits\":%d,\"maxSpreadPrice\":%s,\"momentumPoints\":%.1f,\"momentumEntryPoints\":%.1f,\"maxSpreadPoints\":%d,\"terminalConnected\":%s,\"terminalTradeAllowed\":%s,\"mqlTradeAllowed\":%s,\"accountTradeAllowed\":%s,\"accountTradeExpert\":%s,\"tradeReady\":%s,\"symbolTradeMode\":%d,\"adaptiveEngine\":%s,\"marketRegime\":\"%s\",\"signalConfidence\":%.1f,\"adaptiveLot\":%.4f,\"atrPoints\":%.1f,\"adaptiveBlockReason\":\"%s\",\"consecutiveLosses\":%d,\"cooldownUntil\":%I64d,\"executionStatus\":\"%s\",\"lastOrderRetcode\":%I64d,\"lastOrderError\":%d,\"lastOrderAt\":%I64d}}",
      InpInstanceId,
      InpInstallToken,
      stateText,
      IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN)),
      SCENOVA_EA_VERSION,
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
         marketContextDiagnostics + intelligenceV3Diagnostics + probabilityDiagnostics +
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
   // Publish market-session telemetry independently of bot RUNNING/SAFE_STOP.
   // The dashboard can show market closed without pretending MT5 disconnected
   // and without waiting for an OrderSend rejection.
   if(StringLen(payload) >= 2)
   {
      string marketSessionState = MarketSessionStateNow();
      MqlTick marketTick;
      bool marketTickReady = SymbolInfoTick(_Symbol, marketTick);
      int marketDigits = SymbolDigitsNow();
      string marketBidText = marketTickReady ? DoubleToString(marketTick.bid, marketDigits) : "0";
      string marketAskText = marketTickReady ? DoubleToString(marketTick.ask, marketDigits) : "0";
      string marketMidText = marketTickReady ? DoubleToString((marketTick.bid + marketTick.ask) * 0.5, marketDigits) : "0";
      string marketSessionDiagnostics = StringFormat(
         ",\"marketSessionState\":\"%s\",\"marketSessionOpen\":%s,\"marketBid\":%s,\"marketAsk\":%s,\"marketMid\":%s,\"runtimeContract\":\"%s\",\"zeroGridConfiguredLevelsPerSide\":%d,\"zeroGridEffectiveLevelsPerSide\":%d,\"zeroGridMaxLevelsPerSide\":%d,\"zeroGridCycleActive\":%s}}",
         marketSessionState,
         marketSessionState == "OPEN" ? "true" : "false",
         marketBidText,
         marketAskText,
         marketMidText,
         SCENOVA_RUNTIME_CONTRACT,
         g_zeroGridLevelsPerSide,
         ZeroGridEffectiveLevelsPerSide(),
         ZERO_GRID_MAX_LEVELS,
         g_zeroGridCycleStartedAt > 0 ? "true" : "false"
      );
      payload = StringSubstr(payload, 0, StringLen(payload) - 2) + marketSessionDiagnostics;
   }

   // UI-only snapshot of the symbols selected in MT5 Market Watch.
   if(StringLen(payload) >= 2)
   {
      string marketWatchDiagnostics =
         ",\"marketWatchSymbols\":" + MarketWatchSymbolsJson() +
         ",\"marketWatchCapturedAt\":" +
         StringFormat("%I64d", (long)TimeCurrent()) + "}}";
      payload = StringSubstr(payload, 0, StringLen(payload) - 2) + marketWatchDiagnostics;
   }

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
      // A single Wi-Fi/ISP/API packet loss must not flap RUNNING -> STOPPED ->
      // RUNNING. Keep the last verified RUNNING authorization only for a short
      // bounded grace window. Authentication/authorization failures still fail
      // closed immediately, and the longer offline lease remains the absolute
      // access limit for all new entries.
      bool transientFailure =
         code == -1 || code == 408 || code == 425 || code == 429 || code >= 500;
      int transientGraceSeconds = MathMax(9, MathMin(20, InpHeartbeatSeconds * 5));
      bool verifiedControlStillFresh =
         g_lastSuccessfulHeartbeat > 0 &&
         TimeCurrent() - g_lastSuccessfulHeartbeat <= transientGraceSeconds;

      Print("SCENOVA heartbeat failed. HTTP=", code, " error=", webError, " URL=", heartbeatUrl,
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
      else if(code == -1)
      {
         RenderChartStatus("NETWORK ERROR", clrTomato, "WebRequest error " + IntegerToString(webError));
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

   // desiredState is authoritative. A stale START/SAFE_STOP command must never
   // override the latest state selected on the website.
   // Only an explicit website SAFE_STOP is allowed to preserve the active ZERO
   // ladder. Internal safety stops keep their original immediate-stop behavior.
   g_safeStopDrainRequested = (g_access && desired == "SAFE_STOP");
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
   return HttpPostJsonTimeout(url, payload, response, 1200);
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
      g_basketJournalAutoDecisionId = AutoV20Enabled() ? g_autoV20DecisionId : 0;
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

   string payload = StringFormat(
      "{\"instanceId\":\"%s\",\"installToken\":\"%s\",\"dealTicket\":\"%I64d\",\"eventType\":\"BASKET\",\"direction\":\"%s\",\"volume\":%.8f,\"price\":0,\"netProfit\":%.2f,\"entryTrigger\":\"%s\",\"entryModel\":\"%s\",\"entryQuality\":\"%s\",\"entryQualityScore\":%.2f,\"marketRegime\":\"%s\",\"marketRegimeDetail\":\"%s\",\"fibSetupScore\":%.2f,\"orderBlockQuality\":%.2f,\"confidence\":%.2f,\"basketIndex\":%d,\"symbol\":\"%s\",\"brokerServer\":\"%s\",\"startedAt\":%I64d,\"endedAt\":%I64d,\"peakPositions\":%d,\"sessionProfile\":\"%s\",\"journalSchema\":5,\"marketCycleState\":\"%s\",\"entryPrecisionState\":\"%s\",\"liquidityState\":\"%s\",\"microStructureState\":\"%s\",\"fvgState\":\"%s\",\"entryPrecisionScore\":%.2f,\"entryDistanceAtr\":%.4f,\"setupEvScore\":%.2f,\"indicatorLocationScore\":%.2f,\"indicatorMomentumScore\":%.2f,\"indicatorStructureScore\":%.2f,\"indicatorVolatilityScore\":%.2f,\"indicatorExecutionScore\":%.2f,\"indicatorCostSpaceScore\":%.2f,\"indicatorCompositeScore\":%.2f,\"volumeProfileState\":\"%s\",\"squeezeState\":\"%s\",\"macdState\":\"%s\",\"levelFlipState\":\"%s\",\"premiumDiscountState\":\"%s\"}",
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

bool LegacyBasketEngineEnabled()
{
   // ASSISTED/MANUAL use the legacy basket queue. ZERO and RACE never do.
   return EffectiveExecutionMode() == "AUTO" && !AutoV20Enabled();
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

   g_zeroGridStepPrice = ZeroGridAllowedStep(JsonNumber(json, "zeroGridStepPrice", g_zeroGridStepPrice));
   g_zeroGridLowVolatilityEnabled = JsonBool(json, "zeroGridLowVolatilityEnabled", g_zeroGridLowVolatilityEnabled);
   g_zeroGridLevelsPerSide = (int)MathMax(1.0,MathMin((double)ZERO_GRID_MAX_LEVELS,MathRound(JsonNumber(json, "zeroGridLevelsPerSide", g_zeroGridLevelsPerSide))));
   g_zeroGridBaseLot = MathMax(0.01, JsonNumber(json, "zeroGridBaseLot", g_zeroGridBaseLot));
   g_zeroGridMinNetProfitMoney = MathMax(0.01, JsonNumber(json, "zeroGridMinNetProfitMoney", g_zeroGridMinNetProfitMoney));
   g_zeroGridCloseReserveMoney = MathMax(0.0, JsonNumber(json, "zeroGridCloseReserveMoney", g_zeroGridCloseReserveMoney));

   string requestedEngineMode = JsonString(json, "engineMode", "");
   StringToUpper(requestedEngineMode);
   bool hasEngineMode = requestedEngineMode == "AUTO" || requestedEngineMode == "RACE" || requestedEngineMode == "ZERO_GRID";

   string requestedControlMode = JsonString(json, "controlMode", "");
   StringToUpper(requestedControlMode);
   bool hasControlMode =
      requestedControlMode == "AUTO" || requestedControlMode == "RACE" ||
      requestedControlMode == "ZERO_GRID" || requestedControlMode == "FLIP_LOCK" ||
      requestedControlMode == "PARALLEL_UNIVERSE" || requestedControlMode == "ASSISTED" ||
      requestedControlMode == "MANUAL" || requestedControlMode == "LEGACY";

   // Hard isolation: one execution owner at a time. controlMode is authoritative
   // when both are present; partial/legacy payloads are normalized immediately.
   if(hasControlMode)
   {
      g_controlMode = requestedControlMode;
      if(g_controlMode == "ZERO_GRID") g_engineMode = "ZERO_GRID";
      else if(g_controlMode == "RACE") g_engineMode = "RACE";
      else g_engineMode = "AUTO";
   }
   else if(hasEngineMode)
   {
      g_engineMode = requestedEngineMode;
      if(g_engineMode == "ZERO_GRID") g_controlMode = "ZERO_GRID";
      else if(g_engineMode == "RACE") g_controlMode = "RACE";
      else if(g_controlMode == "ZERO_GRID" || g_controlMode == "RACE" || g_controlMode == "LEGACY") g_controlMode = "AUTO";
   }

   // A valid Server-delivered mode is the startup ownership latch.
   if(hasControlMode || hasEngineMode)
      g_settingsSynchronized = true;

   // FLIP LOCK V2 is intentionally single-position.  Its paired STOP
   // order is the only reversal mechanism; AUTO rescue/profit exits stay out.
   if(g_controlMode == "FLIP_LOCK")
   {
      g_maxPositions = 1;
      g_rescueEnabled = false;
      g_profitTargetMode = "OFF";
      g_dailyProfitContinueAfterTarget = false;
      g_dailyProfitDrawdownPercent = 0.0;
   }
   else
      g_rescueEnabled = InpAdaptiveRescueEngine;

   // A legacy AUTO burst must never survive a transition into an isolated mode.
   // Existing non-ZERO/non-RACE positions may still drain under generic safety
   // management, but no legacy queue can add orders after the mode switch.
   if(EffectiveExecutionMode() == "ZERO_GRID" || EffectiveExecutionMode() == "RACE")
      ResetLegacyBurstStateForIsolatedMode();

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
