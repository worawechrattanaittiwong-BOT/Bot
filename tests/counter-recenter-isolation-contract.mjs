import fs from "node:fs";

const eaPath = "mt5/FastBasketBot.mq5";
const ea = fs.readFileSync(eaPath, "utf8");

function need(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message + " (missing: " + needle + ")");
}

function forbid(text, needle, message) {
  if (text.includes(needle)) throw new Error(message + " (forbidden: " + needle + ")");
}

function block(signature) {
  const start = ea.indexOf(signature);
  if (start < 0) throw new Error("Missing function: " + signature);
  const open = ea.indexOf("{", start);
  if (open < 0) throw new Error("Missing opening brace: " + signature);
  let depth = 0;
  for (let i = open; i < ea.length; i++) {
    if (ea[i] === "{") depth++;
    else if (ea[i] === "}") {
      depth--;
      if (depth === 0) return ea.slice(start, i + 1);
    }
  }
  throw new Error("Unclosed function: " + signature);
}

need(ea, "#define COUNTER_RECENTER_RELEASE_RATIO 0.65", "COUNTER Recenter hysteresis is required");
need(ea, "COUNTER_RECENTER_ATR_M1_MULTIPLIER", "COUNTER Recenter must adapt to M1 volatility");
need(ea, "COUNTER_RECENTER_ATR_M5_MULTIPLIER", "COUNTER Recenter must adapt to M5 volatility");

const signal = block("int CounterSignalDirection()");
need(signal, "int graphDirection=RaceLivePriceDirection();", "COUNTER signal must remain visible Bid-flow only");
forbid(signal, "Recenter", "Recenter must not change COUNTER BUY/SELL signal");
forbid(signal, "AverageTrueRangePoints", "ATR must not become a COUNTER direction signal");

const sideStats = block("bool CounterSideStats(");
need(sideStats, "POSITION_PRICE_OPEN", "Recenter must use actual open prices");
need(sideStats, "POSITION_VOLUME", "Recenter must use volume-weighted averages");
need(sideStats, '"SaaSCounter"', "Recenter must inspect COUNTER-owned positions only");

const refresh = block("bool CounterRefreshRecenterState()");
need(refresh, "MathAbs(buyAverage-sellAverage)/_Point", "Recenter must measure BUY/SELL average gap");
need(refresh, "COUNTER_RECENTER_RELEASE_RATIO", "Recenter must use release hysteresis");
forbid(refresh, "ACCOUNT_EQUITY", "Recenter must never depend on account equity");
forbid(refresh, "ACCOUNT_BALANCE", "Recenter must never depend on account balance");

const fillGate = block("bool CounterRecenterAllowsFill(int direction)");
need(fillGate, "projectedGapPoints+improvementTolerance<currentGapPoints", "Recenter fills must reduce the open-price gap");
need(fillGate, "COUNTER_RECENTER_BLOCK_BUY", "Blocked BUY telemetry missing");
need(fillGate, "COUNTER_RECENTER_BLOCK_SELL", "Blocked SELL telemetry missing");
forbid(fillGate, "OrderSend", "Recenter gate must not send orders itself");

const closeGate = block("bool CounterRecenterAllowsProfitClose(ulong ticket,double closeVolume)");
need(closeGate, "COUNTER_RECENTER_HOLD_PROFIT", "Recenter must hold a profit anchor when closing it worsens the gap");
forbid(closeGate, "ClosePosition", "Recenter profit gate must not create a new loss-close path");
forbid(closeGate, "OrderSend", "Recenter profit gate must not send trade requests itself");

const fill = block("bool ProcessCounterFill(int direction)");
need(fill, "CounterRecenterAllowsFill(direction)", "COUNTER entry path must enforce Recenter");

const harvest = block("int CounterHarvestProfitablePositions()");
need(harvest, "if(!CounterRecenterAllowsProfitClose(ticket,closeVolume))", "COUNTER profit harvest must protect Recenter anchors");
need(harvest, 'ClosePositionVolumeByTicket(ticket,closeVolume,"SCNCounterProfit")', "Existing per-position profit close must remain");

const stopMode = block("string StopLossModeName()");
need(stopMode, 'if(EffectiveExecutionMode()=="COUNTER")', "COUNTER stop-loss isolation missing");
need(stopMode, 'return "OFF";', "COUNTER stop-loss mode must remain OFF");

console.log("COUNTER recenter isolation contract PASS");
