const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cloud=fs.readFileSync('apps/api/src/cloud.controller.ts','utf8');
const payment=fs.readFileSync('apps/api/src/easyslip-payment.service.ts','utf8');
const dashboard=fs.readFileSync('apps/web/app/dashboard/page.tsx','utf8');
const packages=fs.readFileSync('apps/web/app/packages/page.tsx','utf8');
const api=fs.readFileSync('apps/web/lib/api.ts','utf8');

function portion(source,start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 assert(a>=0&&b>a,"missing code boundary "+start);
 return source.slice(a,b);
}
test('Cloud checkout never silently marks a pending paid QR as FAILED when new checkout opens',()=>{
 const body=portion(cloud,'@Post("checkout") async checkout','if (Number(order.amount) === 0)');
 assert(body.includes('มีรายการรอชำระอยู่แล้ว'));
 assert(!body.includes("UPDATE cloud_orders SET status='FAILED'"));
 assert(!body.includes('promotions.release(tx, "CLOUD", pending.id)'));
});
test('Cloud activation keeps claim, slot, subscription and PAID within one transaction',()=>{
 const body=portion(payment,'private async activateCloud(','\n}\n');
 assert(body.includes('this.db.transaction'));
 assert(body.includes('await this.claim(tx, verification'));
 assert(body.includes('INSERT INTO license_slots'));
 assert(body.includes("SET status='PAID'"));
 assert(body.includes('subscription.id'));
 assert(body.includes('SELECT pg_advisory_xact_lock(740091)'));
});
test('Slip verification HTTP uses longer timeout and never transmits without authentication',()=>{
 assert(api.includes('API_SLIP_VERIFICATION_TIMEOUT_MS = 60_000'));
 assert(api.includes('path.endsWith("/verify-slip")'));
 assert(api.includes('Authorization'));
});
test('Slot payment shows errors inside modal and preserves order on modal dismiss',()=>{
 assert(dashboard.includes('vpsPaymentError && <div className="vps-slot-slip-error" role="alert">'));
 const close=portion(dashboard,'function closeVpsSlotDialog()','async function cancelVpsSlotOrder()');
 assert(close.includes('vpsSlotDialogRef.current?.close()'));
 assert(!close.includes('cancel-slip-payment'));
 assert(dashboard.includes('setVpsPaymentOrderId(pending?.id || "")'));
 assert(dashboard.includes('setVpsPaymentError(message+'));
 assert(dashboard.includes('checkingId'));
 assert(dashboard.includes('await loadVpsCommerce()'));
});
test('Payment cancellation requires confirmed untransferred order',()=>{
 const slotCancel=portion(dashboard,'async function cancelVpsSlotOrder()','async function downloadVpsSlotQr()');
 assert(slotCancel.includes('await confirmPopup'));
 assert(slotCancel.includes('if(!agreed)return'));
 assert(slotCancel.includes('cancel-slip-payment'));
 const packageCancel=portion(packages,'async function cancelSlipPayment(','async function closeCheckoutDialog()');
 assert(packageCancel.includes('await confirmPopup'));
 assert(packageCancel.includes('if(!agreed)return false'));
});
test('Package checkout displays rejection within checkout dialog and does not auto cancel on close',()=>{
 const close=portion(packages,'async function closeCheckoutDialog()','async function verifySlip(');
 assert(!close.includes('cancelSlipPayment('));
 assert(packages.includes('messageKind==="bad" && message'));
 assert(packages.includes('role="alert"'));
 assert(packages.includes('if (order?.status==="PAID" && order.slot_id)'));
});
