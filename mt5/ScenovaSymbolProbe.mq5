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

int CollectMarketWatchXau(string &symbols[])
{
   ArrayResize(symbols,0);

   // true = symbols currently selected in MT5 Market Watch.
   // Return those exact broker-native names only. No suffix guessing,
   // no chart validation and no trade-mode substitution.
   int total = SymbolsTotal(true);
   for(int i=0;i<total;i++)
   {
      string symbol = SymbolName(i,true);
      if(!StartsWithXau(symbol))
         continue;

      int size = ArraySize(symbols);
      ArrayResize(symbols,size+1);
      symbols[size] = symbol;
   }

   return ArraySize(symbols);
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
   if(age < 2)
      return;

   string marketWatchXau[];
   CollectMarketWatchXau(marketWatchXau);
   WriteResult(marketWatchXau);
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
