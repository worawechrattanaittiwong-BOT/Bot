#property strict
#property version   "1.00"
#property description "SCENOVA non-trading MT5 symbol capability probe"

#define PROBE_FILE "scenova-xau-usable.txt"

datetime g_started = 0;
bool g_completed = false;

bool StartsWithXau(const string value)
{
   if(StringLen(value) < 6)
      return false;
   string prefix = StringSubstr(value,0,3);
   StringToUpper(prefix);
   return prefix == "XAU";
}

bool CandidateTradeEnabled(const string symbol)
{
   if(!SymbolSelect(symbol,true))
      return false;

   long tradeMode = SymbolInfoInteger(symbol,SYMBOL_TRADE_MODE);
   if(tradeMode == SYMBOL_TRADE_MODE_DISABLED ||
      tradeMode == SYMBOL_TRADE_MODE_CLOSEONLY)
      return false;

   double point = SymbolInfoDouble(symbol,SYMBOL_POINT);
   double tickSize = SymbolInfoDouble(symbol,SYMBOL_TRADE_TICK_SIZE);
   double volumeMin = SymbolInfoDouble(symbol,SYMBOL_VOLUME_MIN);
   return point > 0.0 && tickSize > 0.0 && volumeMin > 0.0;
}

bool HasUsableM5Series(const string symbol)
{
   if(!SymbolIsSynchronized(symbol))
      return false;

   long synchronized = 0;
   if(!SeriesInfoInteger(symbol,PERIOD_M5,SERIES_SYNCHRONIZED,synchronized) ||
      synchronized == 0)
      return false;

   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   ResetLastError();
   int copied = CopyRates(symbol,PERIOD_M5,0,3,rates);
   if(copied <= 0)
      return false;

   if(!(bool)SeriesInfoInteger(symbol,PERIOD_M5,SERIES_SYNCHRONIZED))
      return false;

   for(int i=0;i<copied;i++)
   {
      if(rates[i].time > 0 &&
         rates[i].high > 0.0 &&
         rates[i].low > 0.0 &&
         rates[i].high >= rates[i].low)
         return true;
   }
   return false;
}

int CollectUsable(string &usable[], bool &pendingSeries)
{
   ArrayResize(usable,0);
   pendingSeries = false;

   int total = SymbolsTotal(false);
   for(int i=0;i<total;i++)
   {
      string symbol = SymbolName(i,false);
      if(!StartsWithXau(symbol))
         continue;
      if(!CandidateTradeEnabled(symbol))
         continue;

      if(!HasUsableM5Series(symbol))
      {
         pendingSeries = true;
         continue;
      }

      int size = ArraySize(usable);
      ArrayResize(usable,size+1);
      usable[size] = symbol;
   }

   return ArraySize(usable);
}

void WriteResult(string &usable[])
{
   int handle = FileOpen(PROBE_FILE,FILE_WRITE|FILE_TXT|FILE_ANSI);
   if(handle == INVALID_HANDLE)
      return;

   FileWrite(handle,"READY");
   for(int i=0;i<ArraySize(usable);i++)
      FileWrite(handle,usable[i]);

   FileClose(handle);
   g_completed = true;
   Print("SCENOVA SYMBOL PROBE: completed usable=",ArraySize(usable));
}

int OnInit()
{
   g_started = TimeLocal();
   EventSetTimer(1);
   return INIT_SUCCEEDED;
}

void OnTimer()
{
   if(g_completed)
      return;
   if(TerminalInfoInteger(TERMINAL_CONNECTED) == 0)
      return;

   int age = (int)(TimeLocal() - g_started);
   if(age < 8)
      return;

   string usable[];
   bool pendingSeries = false;
   CollectUsable(usable,pendingSeries);

   // Wait for MT5 to finish synchronizing M5 data so the customer never sees
   // a name that exists in the catalog but cannot actually open a usable chart.
   if(pendingSeries && age < 25)
      return;

   WriteResult(usable);
   if(g_completed)
      ExpertRemove();
}

void OnDeinit(const int reason)
{
   EventKillTimer();
}

void OnTick()
{
   // Probe is intentionally non-trading.
}
