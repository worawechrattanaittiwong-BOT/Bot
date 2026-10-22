import assert from 'node:assert/strict';
import fs from 'node:fs';

const flip=fs.readFileSync('mt5/include/FlipLockV1.mqh','utf8');
const dashboard=fs.readFileSync('apps/web/app/dashboard/page.tsx','utf8');
const ea=fs.readFileSync('mt5/FastBasketBot.mq5','utf8');
const release=fs.readFileSync('apps/api/src/release-version.ts','utf8');

const define=(name)=>{
  const m=flip.match(new RegExp('^#define '+name+' (\\d+(?:\\.\\d+)?)$','m'));
  assert.ok(m,'missing '+name);
  return Number(m[1]);
};
const arm=define('FLIP_LOCK_GOLD_ARM_PRICE_MOVE');
const gap=define('FLIP_LOCK_GOLD_TRAIL_PRICE');
assert.equal(arm,2);
assert.equal(gap,1);
assert.equal(define('FLIP_LOCK_STOP_SYNC_MIN_MS'),250);
assert.equal(define('FLIP_LOCK_LEGACY_BTC_TRAIL_POINTS'),100);
assert.equal(define('FLIP_LOCK_MIN_NET_PROFIT_USD'),1); // BTC legacy only

// Independent XAU quote-price state-machine regression. Trigger is Bid for
// BUY and Ask for SELL. Never use gross/net profit, lot, commissions or swap.
function nextSL({side,entry,bid,ask,sl,point=.001,tickSize=point,
  brokerMinDistance=2*point,lot=.01,commission=0,swap=0,accountCurrency='USD'}) {
  const quote=side===1?bid:ask;
  const favorable=side*(quote-entry);
  if(favorable+1e-9<arm) return {sl,moved:false,why:'WAIT_PRICE_MOVE'};
  const raw=quote-side*gap;
  const normalized=side===1
    ? Math.floor(raw/tickSize+1e-10)*tickSize
    : Math.ceil(raw/tickSize-1e-10)*tickSize;
  const stop=Number(normalized.toFixed(3));
  const legal=side===1
    ? stop>entry && stop<=bid-brokerMinDistance+1e-9
    : stop<entry && stop>=ask+brokerMinDistance-1e-9;
  if(!legal) return {sl,moved:false,why:'BROKER_MIN_DISTANCE'};
  const improved=side===1 ? stop>=sl+tickSize-1e-9 : stop<=sl-tickSize+1e-9;
  return improved?{sl:stop,moved:true}:{sl,moved:false,why:'NEVER_WIDEN'};
}
for(const point of [.001,.01]){
  let sl=3997;
  assert.equal(nextSL({side:1,entry:4000,bid:4001.999,ask:4002.239,sl,point}).sl,sl,'BUY should not arm before +2');
  sl=nextSL({side:1,entry:4000,bid:4002,ask:4002.24,sl,point}).sl;
  assert.equal(sl,4001,'BUY at 4000, Bid 4002 -> SL 4001');
  sl=nextSL({side:1,entry:4000,bid:4004,ask:4004.24,sl,point}).sl;
  assert.equal(sl,4003,'BUY at 4000, Bid 4004 -> SL 4003');
  assert.equal(nextSL({side:1,entry:4000,bid:4003.25,ask:4003.49,sl,point}).sl,4003,'BUY must never loosen after pullback');
  assert.equal(nextSL({side:1,entry:4201.5,bid:4203.5,ask:4203.74,sl:4199.5,point}).sl,4202.5,'user BUY example');
  assert.equal(nextSL({side:1,entry:4000,bid:4002,ask:4002.24,sl:3997,point,lot:.01,commission:400,swap:-100,accountCurrency:'USC'}).sl,4001,'money and cent currency must not gate XAU');
  assert.equal(nextSL({side:1,entry:4000,bid:4004,ask:4004.24,sl:3997,point,brokerMinDistance:1.2}).sl,3997,'broker cannot accept stop at exact 1.000 gap; keep existing SL');
  let shortSL=4003;
  assert.equal(nextSL({side:-1,entry:4000,bid:3998.239,ask:3998.001,sl:shortSL,point}).sl,shortSL,'SELL should not arm before -2');
  shortSL=nextSL({side:-1,entry:4000,bid:3997.76,ask:3998,sl:shortSL,point}).sl;
  assert.equal(shortSL,3999,'SELL at 4000, Ask 3998 -> SL 3999');
  shortSL=nextSL({side:-1,entry:4000,bid:3995.76,ask:3996,sl:shortSL,point}).sl;
  assert.equal(shortSL,3997,'SELL at 4000, Ask 3996 -> SL 3997');
  assert.equal(nextSL({side:-1,entry:4000,bid:3996.76,ask:3997,sl:shortSL,point}).sl,3997,'SELL must never loosen');
}
const block=(start,end)=>{
  const from=flip.indexOf(start),to=flip.indexOf(end,from+start.length);
  assert.ok(from>=0&&to>from,'missing section '+start);
  return flip.slice(from,to);
};
const price=block('double FlipLockProfitLockPrice(','bool FlipLockProfitStopIsLegal(');
const sync=block('bool FlipLockSyncProfitLock(','bool FlipLockClosePositionTicket(');
assert.match(price,/FLIP_LOCK_GOLD_TRAIL_PRICE/);
assert.match(price,/double distance=FlipLockIsGoldQuote\(\)\s*\? quoteTrail\s*:/,'XAU must not silently widen the 1.000 gap');
assert.match(price,/double executablePrice=direction>0 \? tick\.bid : tick\.ask/);
assert.match(price,/NormalizeStopPriceToTick\(target,direction\)/);
assert.match(sync,/if\(isGold\)[\s\S]*favorablePriceMove\+1e-9<FLIP_LOCK_GOLD_ARM_PRICE_MOVE/);
assert.match(sync,/if\(!isGold\)\s*\{\s*double projectedNet=0\.0/,'monetary gate belongs to BTC, not gold');
assert.match(sync,/FlipLockProfitStopIsLegal\(direction,target,openPrice,tick\)/);
assert.match(sync,/FlipLockSetPositionStop\(positionTicket,target\)/);
assert.match(sync,/target>=currentSl\+tickSize/);
assert.match(sync,/target<=currentSl-tickSize/);
assert.match(sync,/nowMs-g_flipLockLastStopSyncMs>=FLIP_LOCK_STOP_SYNC_MIN_MS/);
assert.match(sync,/LOCAL_GOLD_2_00_ARM_1_00_TRAIL/);
assert.ok(!sync.includes('LOCAL_NET_1USD_GOLD_1_50_TRAIL'),'old XAU profit gate is obsolete');
assert.match(flip,/FlipLockInitialSafetyStopPrice/);
assert.match(flip,/SL_HANDOFF_TO_BUY/);
assert.match(flip,/SL_HANDOFF_TO_SELL/);
assert.ok(dashboard.includes('ราคาเดินกำไร 2.000')||dashboard.includes('เดินกำไร 2.000'));
assert.ok(dashboard.includes('ห่างราคา 1.000'));
assert.ok(!dashboard.includes('XAU ล็อกกำไรสุทธิประมาณ $1'));
const flipEaVersion=ea.match(/#property version\s+"(\d+\.\d+\.\d+)"/)?.[1];
const flipApiVersion=release.match(/DEFAULT_EA_VERSION = "(\d+\.\d+\.\d+)"/)?.[1];
assert.ok(flipEaVersion, "EA version marker required");
assert.equal(flipEaVersion, flipApiVersion, "EA/API version must match, independently of FLIP trailing rules");
console.log('FLIP XAU +2.000 price arming / 1.000 Bid/Ask trailing: PASS (BUY, SELL, .001/.01, money-agnostic, non-retreat, broker limits, BTC isolated)');
