import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ea=fs.readFileSync(path.resolve('/opt/Bot/mt5/FastBasketBot.mq5'),'utf8');
const section=(start,end)=>{
  const from=ea.indexOf(start);
  const to=ea.indexOf(end,from+start.length);
  assert.ok(from>=0 && to>from,'missing EA section: '+start);
  return ea.slice(from,to);
};
const tracker=section('void RaceTrackLossFlipDeal(ulong dealTicket)','// Brain V17 RACE');
const fill=section('bool ProcessRaceFill(int direction)','bool StartRaceCycle(double momentum)');
const start=section('bool StartRaceCycle(double momentum)','bool ManageRaceBasket(double momentum)');
const init=section('int OnInit()','void OnDeinit(');

assert.match(ea,/int\s+g_raceLastLossSide\s*=\s*0\s*;/);
assert.match(tracker,/TradeModeForDeal\(dealTicket\)!="RACE"/);
assert.match(tracker,/DEAL_ENTRY_OUT_BY/);
assert.match(tracker,/DEAL_FEE/);
assert.match(tracker,/g_raceLastLossSide=type==DEAL_TYPE_SELL\s*\?\s*1\s*:\s*-1/);
assert.match(tracker,/openedSide==-g_raceLastLossSide/);
assert.match(tracker,/GlobalVariableSet\(RaceLossFlipGlobalKey\(\)/);
assert.match(tracker,/GlobalVariableDel\(RaceLossFlipGlobalKey\(\)/);
assert.match(tracker,/GlobalVariablesFlush\(\)/);
assert.match(init,/RaceRestoreLossFlip\(\)/);
assert.match(ea,/RaceTrackLossFlipDeal\(trans\.deal\);/);
assert.match(ea,/HistoryDealSelect\(trans\.deal\);\s*RecordBasketDeal\(trans\.deal\)/);
assert.match(ea,/StringFormat\("SCN_RFLIP_%I64d_%I64d_%s"/);
assert.match(start,/BasketPositionCount\(\) > 0 \|\| RescuePositionCount\(\) > 0/);
assert.match(start,/if\(g_raceLastLossSide!=0\)\s*\{\s*direction=-g_raceLastLossSide;/);
assert.ok(start.indexOf('direction=-g_raceLastLossSide') < start.indexOf('ProcessRaceFill(direction)'));
assert.match(start,/else\s*\{\s*direction=RaceAnalysisDirection\(momentum\);/);
assert.doesNotMatch(start,/RaceReentryObserveReady|RaceAntiChaseBlocked|RaceNewsPauseActive|RaceVolumeWindowReady/);
assert.doesNotMatch(fill,/g_raceLastLossSide|LOSS_SIDE_WAIT_OPPOSITE|RACE_WAIT_SELL_AFTER_BUY_LOSS/);
assert.match(fill,/SendMarketOrder\(direction\)/);
assert.match(fill,/RACE_CONTROL_NOT_FRESH|RACE_TRADE_PERMISSION/);
const reset=section('void ResetRaceRuntime()','int RaceFilledUnits()');
assert.doesNotMatch(reset,/g_raceLastLossSide\s*=/, 'cycle reset must retain pending loss flip');

// Behavior specification: the prior signal is ignored after a losing exit;
// the pending reversal persists through failed order attempts, clearing only
// on the actual opposite opening deal.
let priorLossSide=0;
const onLosingExit=(side)=>{priorLossSide=side;};
const chooseNextEntry=(m5Signal)=>priorLossSide!==0?-priorLossSide:m5Signal;
const onConfirmedEntry=(side)=>{if(side===-priorLossSide)priorLossSide=0;};
assert.equal(chooseNextEntry(1),1,'normally follow M5 signal');
onLosingExit(1);
assert.equal(chooseNextEntry(1),-1,'losing BUY forces SELL even when M5 says BUY');
assert.equal(chooseNextEntry(0),-1,'losing BUY forces SELL even when M5 has no signal');
assert.equal(priorLossSide,1,'rejected/unfinished SELL must not clear flip');
onConfirmedEntry(-1);
assert.equal(priorLossSide,0,'confirmed SELL clears flip');
assert.equal(chooseNextEntry(1),1,'after confirmed SELL return to normal brain');
onLosingExit(-1);
assert.equal(chooseNextEntry(-1),1,'losing SELL forces BUY');
onConfirmedEntry(1);
assert.equal(priorLossSide,0,'confirmed BUY clears flip');
console.log('PASS: RACE immediate after-loss flip (no direction wait), persist-to-fill and isolation contracts');
