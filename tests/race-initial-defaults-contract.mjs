import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const web=readFileSync('apps/web/app/dashboard/page.tsx','utf8');
const sql=readFileSync('database/072_race_initial_defaults.sql','utf8');
const deploy=readFileSync('scripts/deploy-hostinger.sh','utf8');
const defaults=web.slice(web.indexOf('const defaultSettings = {'), web.indexOf('\n};', web.indexOf('const defaultSettings = {')));
const keys={raceLot:'0.01',raceMaxPositions:'1',raceCloseAllProfitEnabled:'true',raceProfitTargetMode:'"BASKET"',raceCloseAllProfitMoney:'2',raceMaxBasketLossMoney:'0',raceDailyLossMoney:'0',raceDailyProfitTargetMoney:'0',entryMode:'"AUTO_MOMENTUM"'};
for (const [key,value] of Object.entries(keys)){
  assert.match(defaults,new RegExp(`\\b${key}:\\s*${value.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\s*(?:[,}]|$)`));
  if(key.startsWith('race'))assert(sql.includes(`"${key}":${value === '2' ? '2.0' : value}`));
}
assert(web.includes('String(storedSettings.raceProfitTargetMode ?? "").toUpperCase()'), 'previous RACE saved choice must take precedence');
assert(web.includes('storedSettings.raceCloseAllProfitEnabled === false'), 'preserve existing legacy OFF');
assert(sql.includes('ALTER COLUMN settings SET DEFAULT'));
assert(!/\bUPDATE\s+bot_settings\b/i.test(sql.replace(/^--[^\n]*$/gm,'')), 'never overwrite customer settings');
assert(deploy.indexOf('database/072_race_initial_defaults.sql')>deploy.indexOf('database/069_profit_target_defaults.sql'));
console.log('RACE initial defaults contract: PASS (new profiles only, no existing settings writes)');
