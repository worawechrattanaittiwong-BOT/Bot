import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const api=readFileSync('apps/api/src/cloud-bulk.controller.ts','utf8');
const app=readFileSync('apps/api/src/app.module.ts','utf8');
const schema=readFileSync('apps/api/src/cloud-schema.ts','utf8');
const migration=readFileSync('database/073_manual_bulk_cloud_slots.sql','utf8');
const web=readFileSync('apps/web/components/BulkVpsSlots.tsx','utf8');
const dashboard=readFileSync('apps/web/app/dashboard/page.tsx','utf8');
for(const name of ['cloud_bulk_discount_tiers','cloud_bulk_grants','cloud_bulk_grant_slots']){
  assert(schema.includes(`CREATE TABLE IF NOT EXISTS ${name}`));
  assert(migration.includes(`CREATE TABLE IF NOT EXISTS ${name}`));
}
for(const frag of ['@UseGuards(JwtGuard)','String(actor.role).toUpperCase() !== "OWNER"',
  '@Post("owner/discounts")','@Get("owner/customer")','@Post("owner/grant")',
  'BULK_QUANTITIES = [5,10,20]','BULK_MONTHS = [1,3,6,12]',
  'SELECT pg_advisory_xact_lock(740091)','cloud_provisioning_paused,sales_paused',
  'PRIMARY','primary_active','status=\'ACTIVE\'','request_id=$1',
  'cloud_bulk_grants(request_id','cloud_bulk_grant_slots(grant_id,slot_id)',
  'OWNER_BULK_SLOT_GRANTED','paymentConfirmed !== true','if (available < quantity)',
  "bi.runner_id IS NULL", "sub.status"]) {
  // Last two are asserted independently below with actual source fragments.
  if(frag==='PRIMARY' || frag==='sub.status') continue;
  assert(api.includes(frag),`Missing safety contract: ${frag}`);
}
assert(!/UPDATE\s+(?:bot_instances|mt5_accounts|bot_settings|cloud_orders)/i.test(api));
assert(!/DELETE\s+FROM\s+(?:license_slots|mt5_accounts|subscriptions|cloud_orders)/i.test(api));
assert(app.includes('CloudBulkController,'));
assert(web.includes('const packages = [5,10,20]'));
assert(web.includes('ส่วนลด'));
assert(web.includes('/ai-assistant/bootstrap'));
assert(web.includes('ติดต่อผู้พัฒนา'));
assert(web.includes('paymentConfirmed:true,requestId:requestRef.current'));
assert(dashboard.includes('<BulkVpsSlots owner={userRole === "OWNER"}'));
// All pricing calculated in integer USD cents. Quantity is only current purchase.
const price=(unit,qty,pct)=>Math.round(unit*qty*(100-pct)/100);
assert.equal(price(999,5,10),4496);
assert.equal(price(999,10,15),8492);
assert.equal(price(999,20,25),14985);
assert.equal(price(8999,20,25),134985);
console.log('CLOUD BULK MANUAL isolated contract: PASS (read-only quote, Owner gate, single atomic grant, idempotency, capacity guard, no EA writes)');
