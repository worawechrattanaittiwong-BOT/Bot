import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source=fs.readFileSync('apps/api/src/performance-journal.ts','utf8');
const compiled=ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
}).outputText;
const module={exports:{}};
new Function('exports','module','require',compiled)(module.exports,module,()=>{throw new Error('unexpected require')});
const {reconstructCompletedJournal,buildJournalPositionOwnerModes,resolveJournalControlModeWithOwner}=module.exports;

const prior=[];
const exits=[];
const losses=[-7.2,-7,-7.1,-8,-7.8,-7.7,-7.5,-7.5,-7.4,-7.6,-7.3,-7.6,-7.4,-7.5,-7.4,-7.5,-7.6,-7.4,-7.6,-7.5,-7.3,-7.5,-7.4,-7.5,-7.3];
// Normalize final aggregate exactly to the production case under review.
const adjustment=-187.3-losses.reduce((a,b)=>a+b,0);
losses[losses.length-1]+=adjustment;
for(let i=0;i<25;i++){
  const position=String(4217800000+i);
  prior.push({
    deal_ticket:`E${i}`,position_id:position,event_type:'ENTRY',direction:'BUY',volume:.01,price:4140+i*.01,
    net_profit:0,entry_model:'COUNTER_V1',entry_trigger:'COUNTER_ENTRY',
    metadata:{controlMode:'COUNTER',symbol:'XAUUSDm',executedByBot:true},
    created_at:`2026-10-06T07:${String(10+i).padStart(2,'0')}:00.000Z`
  });
  exits.push({
    deal_ticket:`X${i}`,position_id:position,event_type:'EXIT',direction:'BUY',volume:.01,price:4130,
    net_profit:losses[i],entry_model:'NONE',entry_trigger:'NONE',
    metadata:{controlMode:'MANUAL',symbol:'XAUUSDm',executedByBot:true},
    created_at:`2026-10-07T02:17:${String(i).padStart(2,'0')}.000Z`
  });
}
const todayEntries=Array.from({length:142},(_,i)=>({
  deal_ticket:`T${i}`,position_id:String(5000000000+i),event_type:'ENTRY',direction:i%2?'SELL':'BUY',volume:.01,price:4140,
  net_profit:0,entry_model:'COUNTER_V1',entry_trigger:'COUNTER_ENTRY',
  metadata:{controlMode:'COUNTER',symbol:'XAUUSDm',executedByBot:true},
  created_at:`2026-10-07T03:${String(Math.floor(i/60)).padStart(2,'0')}:${String(i%60).padStart(2,'0')}.000Z`
}));
// Position 0 had a partial close before the selected day. Context replay must
// consume that historical volume without carrying its old P/L into today's result.
prior[0].volume=.02;
const priorPartialExit={
  deal_ticket:'PX0',position_id:prior[0].position_id,event_type:'EXIT',direction:'BUY',volume:.01,price:4138,
  net_profit:0,entry_model:'NONE',entry_trigger:'NONE',
  metadata:{controlMode:'MANUAL',symbol:'XAUUSDm',executedByBot:true},
  created_at:'2026-10-06T12:00:00.000Z'
};
const rows=[...prior,priorPartialExit,...exits,...todayEntries];
const owners=buildJournalPositionOwnerModes(rows);
for(const exit of exits){
  assert.equal(resolveJournalControlModeWithOwner(exit,owners),'COUNTER','EXIT metadata must not override original ENTRY owner');
}
const reconstructed=reconstructCompletedJournal(rows);
assert.equal(reconstructed.baskets.length,1,'25 pre-range positions from one COUNTER cycle must close as one Basket');
assert.equal(reconstructed.baskets[0].controlMode,'COUNTER');
assert.equal(reconstructed.baskets[0].positions.length,25);
assert.equal(reconstructed.baskets[0].entryCount,25);
assert.equal(Number(reconstructed.baskets[0].net_profit.toFixed(2)),-187.30);
assert.equal(reconstructed.baskets.filter(x=>x.controlMode==='MANUAL').length,0,'no false MANUAL basket may be synthesized');
const bangkokDayStart=Date.parse('2026-10-06T17:00:00.000Z');
const activityEntries=rows.filter(row=>row.event_type==='ENTRY' && Date.parse(row.created_at)>=bangkokDayStart && resolveJournalControlModeWithOwner(row,owners)==='COUNTER').length;
assert.equal(activityEntries,142,'Activity/Entries must count only ENTRY events inside today, not owner-context entries');

const bot=fs.readFileSync('apps/api/src/bot.controller.ts','utf8');
const analytics=fs.readFileSync('apps/api/src/performance-analytics.controller.ts','utf8');
const actions=fs.readFileSync('apps/api/src/performance-actions.controller.ts','utf8');
const web=fs.readFileSync('apps/web/app/dashboard/page.tsx','utf8');
assert.ok(bot.includes('const priorContextRows = await this.db.query('));
assert.ok(bot.includes('0::float8 AS net_profit'));
assert.ok(analytics.includes('owner_context AS ('));
assert.ok(analytics.includes('resolveJournalControlModeWithOwner(row,ownerModes)'));
assert.ok(actions.includes('async function actualRangeWithOwners('));
assert.ok(actions.includes('resolveJournalControlModeWithOwner(row,actualRange.ownerModes)'));
assert.ok(web.includes('<span>Entries</span>'));
assert.ok(web.includes('mode.replaceAll("_"," ")'));
assert.ok(web.includes('const runtimeNodeLabel = isCloudRuntime ? "VPS" : "Agent"'));
assert.ok(web.includes('const systemPulseAllOnline = runtimeNodeOnline && isMt5ConnectionOnline && isMt5Online'));
console.log('Cross-range owner reconstruction PASS: 25 legacy MANUAL exits -> 1 COUNTER basket; 142 today Entries preserved');
