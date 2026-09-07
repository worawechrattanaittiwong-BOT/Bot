#property strict
#property version   "1.002"
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
input int             InpMaxSpreadPoints      = 50;
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

ENUM_BOT_STATE g_state = STATE_STOPPED;
bool   g_access = false;
bool   g_trailArmed = false;
double g_peakProfit = 0.0;
double g_dayStartEquity = 0.0;
int    g_dayKey = -1;
ulong  g_lastOrderMs = 0;
datetime g_orderWindowStart = 0;
int    g_ordersInWindow = 0;
datetime g_lastHeartbeat = 0;
datetime g_lastSuccessfulHeartbeat = 0;
string g_executionStatus = "INITIALIZING";
long   g_lastOrderRetcode = 0;
int    g_lastOrderError = 0;
datetime g_lastOrderAt = 0;

double g_lot;
int    g_maxPositions;
double g_triggerMoney;
double g_trailMoney;
double g_maxBasketLoss;
double g_dailyLoss;
int    g_maxSpread;
int    g_minOrderIntervalMs;
int    g_maxOrdersPerMinute;
ENUM_ENTRY_MODE g_entryMode;

double g_ticks[128];
int    g_tickCount = 0;

int OnInit()
{
   g_lot = InpLot;
   g_maxPositions = InpMaxPositions;
   g_triggerMoney = InpBasketTriggerMoney;
   g_trailMoney = InpBasketTrailMoney;
   g_maxBasketLoss = InpMaxBasketLossMoney;
   g_dailyLoss = InpDailyLossMoney;
   g_maxSpread = InpMaxSpreadPoints;
   g_minOrderIntervalMs = InpMinOrderIntervalMs;
   g_maxOrdersPerMinute = InpMaxOrdersPerMinute;
   g_entryMode = InpEntryMode;

   ResetDailyBaseline();

   if(!MQLInfoInteger(MQL_TESTER))
   {
      bool apiOk = (StringFind(InpApiBase, "https://") == 0 || StringFind(InpApiBase, "http://") == 0);
      if(!apiOk || StringLen(InpInstanceId) < 8 || StringLen(InpInstallToken) < 8)
      {
         Print("SCENOVA CONFIG ERROR: connection settings are missing. Load SCENOVA-FastBasketBot.set in Inputs.");
         Comment(
            "SCENOVA: CONFIG NOT LOADED\n",
            "Open EA Inputs > Load > SCENOVA-FastBasketBot.set"
         );
         return(INIT_PARAMETERS_INCORRECT);
      }
   }

   EventSetTimer(1);

   // Strategy Tester cannot use WebRequest. In tester mode only,
   // run the trading engine locally so historical tests work even when markets are closed.
   if(MQLInfoInteger(MQL_TESTER))
   {
      g_access = true;
      g_state = STATE_RUNNING;
      g_lastSuccessfulHeartbeat = TimeCurrent();
      Print("Strategy Tester mode: SaaS heartbeat bypassed for historical testing only.");
   }

   long marginMode = AccountInfoInteger(ACCOUNT_MARGIN_MODE);
   if(marginMode != ACCOUNT_MARGIN_MODE_RETAIL_HEDGING)
      Print("WARNING: This basket strategy is designed for a hedging account.");

   Print("Bot SaaS EA initialized. Instance=", InpInstanceId);
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   Comment("");
}

void OnTick()
{
   UpdateMomentum();
   RefreshDailyBaselineIfNeeded();

   if(g_access && g_lastSuccessfulHeartbeat > 0 &&
      TimeCurrent() - g_lastSuccessfulHeartbeat > InpMaxOfflineLeaseSeconds)
   {
      Print("SaaS lease expired while API is unreachable. Entering SAFE_STOP.");
      g_access = false;
      g_state = STATE_SAFE_STOP;
   }

   int count = BasketPositionCount();
   double profit = BasketProfit();
   double momentum = MomentumPoints();
   g_executionStatus = "EVALUATING";

   if(g_dailyLoss > 0.0 && AccountInfoDouble(ACCOUNT_EQUITY) <= g_dayStartEquity - g_dailyLoss)
   {
      if(count > 0) CloseAllBasket("DAILY_LOSS");
      g_state = STATE_SAFE_STOP;
      g_executionStatus = "DAILY_LOSS_LOCK";
      return;
   }

   if(count > 0)
   {
      if(g_maxBasketLoss > 0.0 && profit <= -g_maxBasketLoss)
      {
         CloseAllBasket("MAX_BASKET_LOSS");
         ResetTrail();
         return;
      }

      if(!g_trailArmed && profit >= g_triggerMoney)
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
   }
   else
   {
      ResetTrail();
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

   string permissionStatus = TradePermissionStatus();
   if(permissionStatus != "OK")
   {
      g_executionStatus = permissionStatus;
      return;
   }

   if(count >= g_maxPositions)
   {
      g_executionStatus = "MAX_POSITIONS";
      return;
   }

   if(!SpreadAllowed())
   {
      g_executionStatus = "SPREAD_TOO_HIGH";
      return;
   }

   if(!CanSendOrder())
   {
      g_executionStatus = "ORDER_RATE_LIMIT";
      return;
   }

   int direction = EntryDirection(momentum);
   if(direction == 0)
   {
      g_executionStatus = "WAITING_MOMENTUM";
      return;
   }

   if(!OpenTradingAllowedForDirection(direction))
   {
      g_executionStatus = "SYMBOL_DIRECTION_BLOCKED";
      return;
   }

   g_executionStatus = direction > 0 ? "READY_BUY" : "READY_SELL";
   bool sent = SendMarketOrder(direction);
   if(sent)
      RegisterOrderRequest();
}

void OnTimer()
{
   if(MQLInfoInteger(MQL_TESTER))
      return;

   datetime now = TimeCurrent();
   if(now - g_lastHeartbeat < MathMax(1, InpHeartbeatSeconds))
      return;
   g_lastHeartbeat = now;
   SendHeartbeat();
}

void OnTradeTransaction(
   const MqlTradeTransaction &trans,
   const MqlTradeRequest &request,
   const MqlTradeResult &result
)
{
   if(!InpPauseOnManualTrade || trans.type != TRADE_TRANSACTION_DEAL_ADD || trans.deal == 0)
      return;

   if(!HistoryDealSelect(trans.deal))
      return;

   string symbol = HistoryDealGetString(trans.deal, DEAL_SYMBOL);
   long magic = HistoryDealGetInteger(trans.deal, DEAL_MAGIC);

   if(symbol == _Symbol && magic != InpMagic && g_state == STATE_RUNNING)
   {
      Print("Manual/external trade detected on ", _Symbol, ". Entering SAFE_STOP.");
      g_state = STATE_SAFE_STOP;
   }
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

   string payload = StringFormat(
      "{\"instanceId\":\"%s\",\"installToken\":\"%s\",\"state\":\"%s\",\"metrics\":{\"accountNumber\":\"%s\",\"symbol\":\"%s\",\"server\":\"%s\",\"currency\":\"%s\",\"balance\":%.2f,\"equity\":%.2f,\"basketProfit\":%.2f,\"peakProfit\":%.2f,\"positions\":%d,\"spreadPoints\":%.1f,\"momentumPoints\":%.1f,\"momentumEntryPoints\":%.1f,\"maxSpreadPoints\":%d,\"terminalConnected\":%s,\"terminalTradeAllowed\":%s,\"mqlTradeAllowed\":%s,\"accountTradeAllowed\":%s,\"accountTradeExpert\":%s,\"tradeReady\":%s,\"symbolTradeMode\":%d,\"executionStatus\":\"%s\",\"lastOrderRetcode\":%I64d,\"lastOrderError\":%d,\"lastOrderAt\":%I64d}}",
      InpInstanceId,
      InpInstallToken,
      stateText,
      IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN)),
      _Symbol,
      AccountInfoString(ACCOUNT_SERVER),
      AccountInfoString(ACCOUNT_CURRENCY),
      AccountInfoDouble(ACCOUNT_BALANCE),
      AccountInfoDouble(ACCOUNT_EQUITY),
      BasketProfit(),
      g_peakProfit,
      BasketPositionCount(),
      CurrentSpreadPoints(),
      MomentumPoints(),
      InpMomentumEntryPoints,
      g_maxSpread,
      terminalConnected,
      terminalTradeAllowed,
      mqlTradeAllowed,
      accountTradeAllowed,
      accountTradeExpert,
      tradeReady,
      SymbolTradeModeNow(),
      g_executionStatus,
      g_lastOrderRetcode,
      g_lastOrderError,
      (long)g_lastOrderAt
   );

   string response = "";
   string heartbeatUrl = InpApiBase + "/api/ea/heartbeat";
   int code = HttpPostJson(heartbeatUrl, payload, response);
   int webError = GetLastError();

   if(code < 200 || code >= 300)
   {
      Print("SCENOVA heartbeat failed. HTTP=", code, " error=", webError, " URL=", heartbeatUrl);

      if(code == -1)
      {
         Comment(
            "SCENOVA: WEBREQUEST BLOCKED / NETWORK ERROR\n",
            "Allow this URL in MT5: ", InpApiBase, "\n",
            "MT5 error: ", IntegerToString(webError)
         );
      }
      else if(code == 401)
      {
         Comment(
            "SCENOVA: AUTHENTICATION FAILED\n",
            "Reinstall SCENOVA and reload the newest .set file."
         );
      }
      else
      {
         Comment(
            "SCENOVA: NOT CONNECTED\n",
            "HTTP ", IntegerToString(code), " | ", heartbeatUrl
         );
      }
      return;
   }

   g_lastSuccessfulHeartbeat = TimeCurrent();
   g_access = JsonBool(response, "access", false);

   string desired = JsonString(response, "desiredState", "STOPPED");
   string command = JsonString(response, "commandName", "");

   ApplySettings(response);

   if(!g_access)
      g_state = STATE_SAFE_STOP;
   else if(command == "START" || desired == "RUNNING")
      g_state = STATE_RUNNING;
   else if(command == "SAFE_STOP" || desired == "SAFE_STOP")
      g_state = STATE_SAFE_STOP;

   if(command == "CLOSE_ALL")
   {
      g_state = STATE_SAFE_STOP;
      CloseAllBasket("REMOTE_CLOSE_ALL");
   }

   Comment(
      "SCENOVA: CONNECTED\n",
      "Account: ", IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN)), "\n",
      "State: ", StateText(), "\n",
      "Execution: ", g_executionStatus
   );

   long commandId = (long)JsonNumber(response, "commandId", 0.0);
   if(commandId > 0)
      AckCommand(commandId);
}

void AckCommand(long commandId)
{
   string payload = StringFormat(
      "{\"instanceId\":\"%s\",\"installToken\":\"%s\",\"commandId\":%I64d}",
      InpInstanceId,
      InpInstallToken,
      commandId
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

void ApplySettings(string json)
{
   g_lot = MathMax(0.01, JsonNumber(json, "lot", g_lot));
   g_maxPositions = (int)MathMax(1.0, JsonNumber(json, "maxPositions", g_maxPositions));
   g_triggerMoney = MathMax(0.01, JsonNumber(json, "basketTriggerMoney", g_triggerMoney));
   g_trailMoney = MathMax(0.01, JsonNumber(json, "basketTrailMoney", g_trailMoney));
   g_maxBasketLoss = MathMax(0.0, JsonNumber(json, "maxBasketLossMoney", g_maxBasketLoss));
   g_dailyLoss = MathMax(0.0, JsonNumber(json, "dailyLossMoney", g_dailyLoss));
   g_maxSpread = (int)MathMax(1.0, JsonNumber(json, "maxSpreadPoints", g_maxSpread));
   g_minOrderIntervalMs = (int)MathMax(0.0, JsonNumber(json, "minOrderIntervalMs", g_minOrderIntervalMs));
   g_maxOrdersPerMinute = (int)MathMax(1.0, JsonNumber(json, "maxOrdersPerMinute", g_maxOrdersPerMinute));

   string mode = JsonString(json, "entryMode", "");
   if(mode == "BUY_ONLY") g_entryMode = ENTRY_BUY_ONLY;
   else if(mode == "SELL_ONLY") g_entryMode = ENTRY_SELL_ONLY;
   else if(mode == "AUTO_MOMENTUM") g_entryMode = ENTRY_AUTO_MOMENTUM;
}

int EntryDirection(double momentum)
{
   if(g_entryMode == ENTRY_BUY_ONLY) return 1;
   if(g_entryMode == ENTRY_SELL_ONLY) return -1;
   if(momentum >= InpMomentumEntryPoints) return 1;
   if(momentum <= -InpMomentumEntryPoints) return -1;
   return 0;
}

bool SpreadAllowed()
{
   return CurrentSpreadPoints() <= g_maxSpread;
}

double CurrentSpreadPoints()
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick)) return 999999.0;
   return (tick.ask - tick.bid) / _Point;
}

bool CanSendOrder()
{
   ulong nowMs = GetTickCount64();
   if(nowMs - g_lastOrderMs < (ulong)g_minOrderIntervalMs)
      return false;

   datetime now = TimeCurrent();
   if(g_orderWindowStart == 0 || now - g_orderWindowStart >= 60)
   {
      g_orderWindowStart = now;
      g_ordersInWindow = 0;
   }

   return g_ordersInWindow < g_maxOrdersPerMinute;
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
      volume = MathFloor((volume + 1e-12) / step) * step;

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
   request.volume = NormalizeTradeVolume(g_lot);
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

   ResetLastError();
   if(!OrderSend(request, result))
   {
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
      g_executionStatus = RetcodeExecutionStatus((long)result.retcode);
      Print("Order rejected. retcode=", result.retcode, " comment=", result.comment);
      return false;
   }

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

void CloseAllBasket(string reason)
{
   Print("CloseAllBasket reason=", reason);
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
}

void ResetTrail()
{
   g_trailArmed = false;
   g_peakProfit = 0.0;
}

void UpdateMomentum()
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
      return;

   double mid = (tick.bid + tick.ask) * 0.5;
   int maxTicks = MathMin(128, MathMax(2, InpMomentumTicks));

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
   if(g_tickCount < 2)
      return 0.0;
   return (g_ticks[g_tickCount - 1] - g_ticks[0]) / _Point;
}

void ResetDailyBaseline()
{
   MqlDateTime t;
   TimeToStruct(TimeCurrent(), t);
   g_dayKey = t.year * 1000 + t.day_of_year;
   g_dayStartEquity = AccountInfoDouble(ACCOUNT_EQUITY);
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
