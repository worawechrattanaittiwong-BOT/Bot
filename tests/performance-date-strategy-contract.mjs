import assert from 'node:assert/strict';
import fs from 'node:fs';

const web=fs.readFileSync('apps/web/app/performance/page.tsx','utf8');
const analytics=fs.readFileSync('apps/api/src/performance-analytics.controller.ts','utf8');
const actions=fs.readFileSync('apps/api/src/performance-actions.controller.ts','utf8');
const shared=fs.readFileSync('apps/web/app/shared-performance/[slug]/page.tsx','utf8');

for(const mode of ['AUTO','RACE','COUNTER','FLIP_LOCK','MANUAL','ZERO_GRID']){
  assert.ok(web.includes(mode),`performance UI missing ${mode}`);
  assert.ok(analytics.includes(`"${mode}"`),`performance analytics missing ${mode}`);
  assert.ok(actions.includes(`"${mode}"`),`performance share missing ${mode}`);
}
assert.match(web,/STRATEGY_OPTIONS:StrategyMode\[\]=\["AUTO","RACE","COUNTER","FLIP_LOCK","MANUAL","ZERO_GRID"\]/);
assert.ok(web.includes('All Strategies · ${STRATEGY_OPTIONS.length} Selected'));
assert.ok(web.includes('ZERO GRID Only'));
assert.match(shared,/STRATEGY_OPTIONS:StrategyMode\[\]=\[\"AUTO\",\"RACE\",\"COUNTER\",\"FLIP_LOCK\",\"MANUAL\",\"ZERO_GRID\"\]/);
assert.ok(shared.includes('All Strategies · ${STRATEGY_OPTIONS.length} Selected'));
assert.ok(shared.includes('useState<DateSelectionMode>(\"SINGLE\")'));
assert.ok(shared.includes('>วันเดียว</button>'));
assert.ok(shared.includes('>กำหนดเอง</button>'));
assert.ok(shared.includes('<span>วันที่</span><input type=\"date\"'));
assert.match(analytics,/allStrategiesSelected = selectedStrategyModes\.length === 6/);
assert.match(analytics,/scope: selectedStrategyModes\.length === 6 \? "ALL_STRATEGIES"/);
assert.match(actions,/SHARE_STRATEGY_MODES = \["AUTO","RACE","COUNTER","FLIP_LOCK","MANUAL","ZERO_GRID"\]/);

assert.ok(web.includes('type DateSelectionMode = "SINGLE" | "CUSTOM"'));
assert.ok(web.includes('useState<DateSelectionMode>("SINGLE")'));
assert.ok(web.includes('>วันเดียว</button>'));
assert.ok(web.includes('>กำหนดเอง</button>'));
assert.ok(web.includes('<span>วันที่</span><input type="date"'));
assert.ok(web.includes('<span>วันที่เริ่มต้น</span><input type="date"'));
assert.ok(web.includes('<span>วันที่สิ้นสุด</span><input type="date"'));
assert.ok(web.includes('setDateSelectionMode("SINGLE")'));
assert.ok(web.includes('setDateSelectionMode("CUSTOM")'));
assert.ok(web.includes('if(accountId&&from&&to&&from<=to)'));
assert.ok(web.includes('disabled={loading||!accountId||!from||!to||from>to}'));
assert.ok(web.includes('rangeClippedByReset'));
assert.ok(web.includes('ข้อมูลจริงเริ่ม'));
assert.ok(web.includes('function confirmPerformancePreferences()'));
assert.ok(web.includes('if(!userId||!accountId||!from||!to||from>to) return;'));
assert.ok(web.includes('onClick={confirmPerformancePreferences}'));
assert.ok(web.includes('disabled={!accountId||!from||!to||from>to}'));
assert.ok(web.includes('<ScenovaIcon name="check" size={15}/>ยืนยัน'));
assert.ok(web.includes('title:"ยืนยันการตั้งค่ารายงานแล้ว"'));
assert.ok(web.includes('if(!accountId||mode!=="LIVE"||!from||!to||from>to) return;'));
assert.ok(web.includes('disabled={sharing||!Number(summary.trades||0)||!from||!to||from>to}'));
const clearResetSequence='await loadOptions();\n      setDateSelectionMode("SINGLE");\n      setFrom(today);\n      setTo(today);';
assert.equal(web.split(clearResetSequence).length-1,2,'both clear flows must visibly reset to single-day today after reloading options');

// Saved v1 "All Strategies" meant every strategy available at that time. It
// must migrate to all six modes after COUNTER becomes reportable.
assert.ok(web.includes('LEGACY_PERFORMANCE_PREFS_KEY="scenova.performance.preferences.v1"'));
assert.ok(web.includes('LEGACY_STRATEGY_OPTIONS.every'));
assert.ok(web.includes('if(legacyAllSelected) savedStrategies=[...STRATEGY_OPTIONS]'));

// Verify the server's existing Bangkok date contract exactly covers one local
// calendar day. Date() stores it in UTC but preserves the +07:00 boundaries.
const from=new Date('2026-10-07T00:00:00.000+07:00');
const to=new Date('2026-10-07T23:59:59.999+07:00');
assert.equal(from.toISOString(),'2026-10-06T17:00:00.000Z');
assert.equal(to.toISOString(),'2026-10-07T16:59:59.999Z');
assert.equal(to.getTime()-from.getTime()+1,86_400_000);
assert.ok(analytics.includes('T00:00:00.000+07:00'));
assert.ok(analytics.includes('T23:59:59.999+07:00'));
assert.ok(actions.includes('T00:00:00.000+07:00'));
assert.ok(actions.includes('T23:59:59.999+07:00'));

console.log('Performance 6-strategy + single/custom Bangkok date contract PASS');
