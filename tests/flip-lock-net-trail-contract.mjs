import assert from 'node:assert/strict';
import fs from 'node:fs';

const flip = fs.readFileSync('mt5/include/FlipLockV1.mqh', 'utf8');
const dashboard = fs.readFileSync('apps/web/app/dashboard/page.tsx', 'utf8');
const ea = fs.readFileSync('mt5/FastBasketBot.mq5', 'utf8');
const release = fs.readFileSync('apps/api/src/release-version.ts', 'utf8');

const define = (name) => {
  const value = flip.match(new RegExp(`^#define ${name} (\\d+(?:\\.\\d+)?)$`, 'm'));
  assert.ok(value, `missing #define ${name}`);
  return Number(value[1]);
};
const quoteTrail = define('FLIP_LOCK_GOLD_TRAIL_PRICE');
const floorUsd = define('FLIP_LOCK_MIN_NET_PROFIT_USD');
const exitPerLotUsd = define('FLIP_LOCK_EXIT_FEE_RESERVE_USD_PER_LOT');
assert.equal(quoteTrail, 1.5);
assert.equal(floorUsd, 1);
assert.equal(exitPerLotUsd, 10);

// Geometry/economics regression for the MQL5 SL formula. _Point is explicitly
// NOT part of the XAU quote-price trailing distance.
function project({direction, entry, bid, ask, point, brokerDistancePoints=2,
  lot=.01, contractSize=100, currencyScale=1, entryFeesUsd=.07, swapUsd=0}) {
  const tickSize = point;
  const distance = Math.max(quoteTrail, brokerDistancePoints*point);
  const executable = direction===1 ? bid : ask;
  const raw = direction===1 ? executable-distance : executable+distance;
  const stops = direction===1
    ? Math.floor(raw/tickSize + 1e-10)*tickSize
    : Math.ceil(raw/tickSize - 1e-10)*tickSize;
  const stop = Number(stops.toFixed(point.toString().split('.')[1]?.length || 0));
  const legal = direction===1
    ? stop>entry && stop<=bid-brokerDistancePoints*point+1e-8
    : stop<entry && stop>=ask+brokerDistancePoints*point-1e-8;
  const grossAccountUnits = (stop-entry)*direction*contractSize*lot*currencyScale;
  const entryCost = entryFeesUsd*currencyScale;
  const estimatedExit = Math.max(entryFeesUsd/lot*lot, exitPerLotUsd*lot)*currencyScale;
  const netAccountUnits = grossAccountUnits+swapUsd*currencyScale-entryCost-estimatedExit;
  return {stop,netUsd:netAccountUnits/currencyScale,armed:legal && netAccountUnits+1e-8>=floorUsd*currencyScale,distance};
}

for (const point of [.001,.01]) {
  const buy = project({direction:1,entry:4000,bid:4002.7,ask:4002.94,point});
  assert.ok(Math.abs(buy.stop-4001.2)<=point+1e-8, 'BUY XAU must trail Bid by 1.5 price, not by 100 points');
  assert.ok(buy.armed && buy.netUsd>=1, 'BUY arms after floor including estimated entry/exit costs');
  const prematureBuy=project({direction:1,entry:4000,bid:4002.60,ask:4002.84,point});
  assert.equal(prematureBuy.armed,false,'BUY must retain safety stop before net profit floor');
  const sell = project({direction:-1,entry:4000,bid:3997.06,ask:3997.30,point});
  assert.ok(Math.abs(sell.stop-3998.8)<=point+1e-8 && sell.armed,'SELL must trail Ask by 1.5 and arm only when safe');
  const prematureSell=project({direction:-1,entry:4000,bid:3997.16,ask:3997.4,point});
  assert.equal(prematureSell.armed,false,'SELL must retain safety stop before net profit floor');
  const negativeSwap=project({direction:1,entry:4000,bid:4002.7,ask:4002.94,point,swapUsd:-.20});
  assert.equal(negativeSwap.armed,false,'negative accrued swap must delay lock');
  const higherCosts=project({direction:1,entry:4000,bid:4002.7,ask:4002.94,point,entryFeesUsd:.4});
  assert.equal(higherCosts.armed,false,'higher real broker fees must delay lock');
  const centAccount=project({direction:1,entry:4000,bid:4002.7,ask:4002.94,point,currencyScale:100});
  assert.equal(centAccount.armed,true,'USD-cent conversion must preserve 1 real USD floor');
  // $1 is the net MONEY floor, not a fixed quote-price movement. With 10x
  // the lot, larger entry/exit costs must still be covered at the broker SL.
  const tenXLot=project({direction:1,entry:4000,bid:4001.8,ask:4002.04,point,lot:.10,entryFeesUsd:.70});
  assert.ok(tenXLot.armed && tenXLot.netUsd>=1,'larger lot must arm from projected money net, not the quote-price delta');
  const costlyTenXLot=project({direction:1,entry:4000,bid:4001.7,ask:4001.94,point,lot:.10,entryFeesUsd:.70});
  assert.equal(costlyTenXLot.armed,false,'larger lot cannot lock before broker fees and $1 net are covered');
  const brokerOverride=project({direction:1,entry:4000,bid:4003.4,ask:4003.64,point,brokerDistancePoints:2000});
  if(point===.001) assert.ok(Math.abs(brokerOverride.distance-2)<1e-8,'broker stop/freeze minimum overrides 1.5');
}

const expectedClauses = [
  'HistorySelectByPosition(positionId)',
  'DEAL_COMMISSION','DEAL_FEE','POSITION_SWAP',
  'g_flipLockFeeScanMs<10000',
  'OrderCalcProfit(orderType,_Symbol,positionVolume,openPrice,stopPrice,gross)',
  'FlipLockDollarToAccountMoney(FLIP_LOCK_MIN_NET_PROFIT_USD)',
  'FlipLockProjectedNetAtStop(',
  'FLIP_LOCK_LEGACY_BTC_TRAIL_POINTS*_Point',
  'FlipLockBrokerMinDistancePoints()*_Point',
  'FlipLockSetPositionStop(positionTicket,target)',
  'target>=currentSl+tickSize', 'target<=currentSl-tickSize',
  'FLIP_LOCK_WAIT_FEE_HISTORY',
  'SL_HANDOFF_TO_BUY', 'SL_HANDOFF_TO_SELL',
];
for(const clause of expectedClauses) assert.ok(flip.includes(clause), `missing FLIP broker/net safety clause: ${clause}`);
assert.ok(dashboard.includes('XAU ล็อกกำไรสุทธิประมาณ $1'));
assert.ok(dashboard.includes('Trail ห่างราคา $1.50'));
assert.ok(dashboard.includes('Gap/Slippage ไม่รับประกันกำไรจริง'));
assert.match(ea, /#property version\s+"1\.1\.30"/);
assert.match(release, /DEFAULT_EA_VERSION = "1\.1\.30"/);
assert.ok(!flip.includes('FLIP_LOCK_TRAIL_DISTANCE_POINTS 100.0'),'gold must not use the legacy points constant');
console.log('FLIP LOCK XAU 1.50 quote trailing and projected USD 1 net floor: PASS (BUY/SELL, cents, broker min, spread, costs, swap)');
