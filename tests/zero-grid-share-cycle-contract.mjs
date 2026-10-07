import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source=fs.readFileSync('apps/api/src/performance-zero-grid-cycle.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const mod={exports:{}};
new Function('exports','module','require',js)(mod.exports,mod,()=>{throw new Error('unexpected require')});
const {buildZeroGridCyclePresentation}=mod.exports;

const cycles=Array.from({length:40},(_,i)=>({
  direction:i%2===0?'BUY':'SELL',
  net_profit:i===39?-2:(i===20?-3: i<38?1.2:0),
  opened_at:new Date(Date.UTC(2026,9,1,0,i*10)).toISOString(),
  created_at:new Date(Date.UTC(2026,9,1,0,i*10+5)).toISOString()
}));
const net=cycles.reduce((sum,row)=>sum+Number(row.net_profit),0);
const view=buildZeroGridCyclePresentation(cycles,200);
assert.equal(view.summary.cycleCount,40);
assert.equal(view.curve.length,41,'curve must have start point + one point per closed cycle');
assert.equal(view.curve[0].tradeNumber,0);
assert.equal(view.curve.at(-1).tradeNumber,40);
assert.equal(view.summary.buyTrades,20);
assert.equal(view.summary.sellTrades,20);
assert.equal(Number(view.curve.at(-1).balance.toFixed(2)),Number((200+net).toFixed(2)));

const api=fs.readFileSync('apps/api/src/performance-actions.controller.ts','utf8');
const web=fs.readFileSync('apps/web/app/shared-performance/[slug]/page.tsx','utf8');
assert.equal((api.match(/buildZeroGridCyclePresentation\(baskets,/g)||[]).length,2,'frozen and dynamic share must both use cycle view');
assert.equal((api.match(/zeroGridOnly\?"BOT_CYCLES":"CLOSED_POSITIONS"/g)||[]).length,1);
assert.equal((api.match(/zeroGridOnly \? "BOT_CYCLES" : "CLOSED_POSITIONS"/g)||[]).length,1);
for(const label of ['Closed Cycles','Total Cycles','Cycle Win Rate','Long Cycles (won %)','X = Closed Cycles','จำนวนรอบ']){
  assert.ok(web.includes(label),`shared ZERO GRID report missing cycle label: ${label}`);
}
assert.ok(web.includes('ZERO_GRID:"ZERO GRID"'));
assert.ok(web.includes('zeroGridOnly=selectedStrategyModes.length===1&&selectedStrategyModes[0]==="ZERO_GRID"'));
assert.ok(api.includes('selectedNet/filteredExitRows.length'),'Expected Payoff must remain position-scoped to match owner Performance');
assert.ok(web.includes('label="Expected Payoff"'));
assert.ok(web.includes('label="Average Trade Time"'));
console.log('ZERO GRID shared report cycle contract PASS: cycle counts/direction/streaks/curve; position execution analytics remain separate');
