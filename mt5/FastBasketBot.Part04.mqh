
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
