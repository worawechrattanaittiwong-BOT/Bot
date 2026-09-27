import fs from "node:fs";
import assert from "node:assert/strict";

const read = path => fs.readFileSync(path, "utf8");

const sms = read("apps/api/src/sms.service.ts");
const trialApi = read("apps/api/src/trial-coupon.controller.ts");
const packages = read("apps/web/app/packages/page.tsx");
const onboarding = read("apps/web/app/onboarding/page.tsx");
const dashboard = read("apps/web/app/dashboard/page.tsx");

assert.match(sms, /purpose:\s*"ACCOUNT" \| "LOCAL_TRIAL"/);
assert.match(sms, /SCENOVA OTP \$\{code\} ยืนยัน Local Trial/);
assert.match(trialApi, /defaultDelivery:\s*\n\s*phone\?\.e164 && this\.sms\.configured\(\) \? "SMS" : "EMAIL"/);
assert.match(trialApi, /@Body\(\) body: \{ delivery\?: "SMS" \| "EMAIL" \}/);
assert.match(trialApi, /requestOtp\(msisdn, otpCode, "LOCAL_TRIAL"\)/);

assert.match(packages, /<h2>ทดลอง Local MT5<\/h2>/);
assert.match(packages, /LOCAL ONLY · ไม่รวม VPS/);
assert.match(packages, /JSON\.stringify\(\{ delivery: trialDelivery \}\)/);
assert.match(packages, /SMS · \{trial\?\.phone\?\.masked \|\| "ยังไม่ผูกเบอร์"\}/);

assert.match(onboarding, /CHOOSE YOUR SYSTEM/);
assert.match(onboarding, /\/packages\?system=cloud&from=onboarding/);
assert.match(onboarding, /\/dashboard\?view=account&welcome=1&setup=local/);
assert.match(onboarding, /params\.get\("new"\) === "1" \|\| params\.get\("verified"\) === "1"/);

assert.match(dashboard, /customerHasCloudMigrationAccess/);
assert.match(dashboard, /บัญชีนี้ยังไม่มีสิทธิ์ VPS/);
assert.match(dashboard, /\/packages\?system=cloud&from=mt5-ea/);
assert.match(dashboard, /\/runtime-migration\/request/);
assert.match(dashboard, /setVpsMoveCardDismissed\(true\)/);
assert.match(dashboard, /กำลังย้ายระบบ · กำลังติดตั้งระบบ VPS/);
assert.match(dashboard, /ย้ายระบบไป VPS สำเร็จ/);

console.log("Customer onboarding, Local Trial SMS, and VPS migration contract PASS");
