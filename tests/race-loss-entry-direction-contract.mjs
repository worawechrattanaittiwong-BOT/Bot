import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ea=fs.readFileSync(path.resolve("mt5/FastBasketBot.mq5"),"utf8");
const before=ea.indexOf("bool StartRaceCycle(double momentum)");
const after=ea.indexOf("bool ManageRaceBasket(double momentum)",before+10);
assert.ok(before>=0 && after>before,"RACE start function exists");
const start=ea.slice(before,after);

assert.match(start,/if\(!RaceModeEnabled\(\)\)\s*return false;/);
assert.match(start,/BasketPositionCount\(\) > 0 \|\| RescuePositionCount\(\) > 0/);
assert.match(start,/ResetRaceRuntime\(\);\s*\/\/[^]*?\s*int direction=RaceAnalysisDirection\(momentum\);/);
assert.match(start,/if\(direction==0\)\s*\{[^]*?return false;/);
assert.match(start,/ProcessRaceFill\(direction\)/);
assert.ok(start.indexOf("RaceAnalysisDirection(momentum)")<start.indexOf("ProcessRaceFill(direction)"));

for(const legacy of [
  "g_raceLastLossSide","RaceRestoreLossFlip","RaceTrackLossFlipDeal",
  "RaceLossFlipGlobalKey","LOSS_FLIP_BUY","LOSS_FLIP_SELL","SCN_RFLIP"
]){
  assert.doesNotMatch(ea,new RegExp(legacy),"old losing-side mandate must be unused: "+legacy);
}
const transaction=ea.slice(ea.indexOf("void OnTradeTransaction("),ea.indexOf("void OnTradeTransaction(")+6000);
assert.match(transaction,/RecordBasketDeal\(trans.deal\);/);
assert.match(transaction,/RecalculateDailyClosedProfit\(\);/);
assert.match(transaction,/TrackBasketJournalDeal\(trans.deal\);/);

const selectSide=(signal)=>signal;
for(const priorLoss of [1,-1]){
  assert.equal(selectSide(1),1,"BUY may follow a previous losing "+priorLoss+" side");
  assert.equal(selectSide(-1),-1,"SELL may follow a previous losing "+priorLoss+" side");
  assert.equal(selectSide(0),0,"no signal still waits; not forced into opposite side");
}
console.log("PASS: RACE entry direction follows market analysis, independent of previous loss.");
