import assert from "node:assert/strict";
import fs from "node:fs";

const service = fs.readFileSync("apps/api/src/referral.service.ts","utf8");
const auth = fs.readFileSync("apps/api/src/auth.controller.ts","utf8");
const cloud = fs.readFileSync("apps/api/src/cloud.controller.ts","utf8");
const sidebar = fs.readFileSync("apps/web/components/OwnerSidebar.tsx","utf8");
const migration = fs.readFileSync("database/024_referral_program.sql","utf8");
const referralsPage = fs.readFileSync("apps/web/app/referrals/page.tsx","utf8");
const details = fs.readFileSync("apps/web/app/referrals/details/page.tsx","utf8");

for (const [level,bps] of [[1,700],[2,500],[3,300],[4,100]]) {
  assert.match(service, new RegExp(`level:\\s*${level},\\s*rateBps:\\s*${bps}`));
}
assert.match(auth,/referralCode/);
assert.match(auth,/referred_by_user_id/);
assert.match(cloud,/creditPurchase/);
assert.match(cloud,/CLOUD_ORDER/);
assert.match(sidebar,/Invite & Earn/);
assert.match(referralsPage,/ดูรายละเอียด/);
assert.doesNotMatch(referralsPage,/Recent Members/);
assert.doesNotMatch(referralsPage,/Commission Activity/);
assert.match(details,/ระบบแนะนำเพื่อนทำงานอย่างไร/);
assert.match(details,/โครงสร้างเครือข่าย 4 ระดับ/);
assert.match(details,/160 บาท/);
assert.match(details,/ระดับของสมาชิกเป็นแบบสัมพันธ์/);
assert.match(migration,/UNIQUE\(source_type,source_id,beneficiary_user_id,level\)/);
console.log("referral-program-contract: ok");
