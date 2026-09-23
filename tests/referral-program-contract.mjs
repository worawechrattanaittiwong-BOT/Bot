import assert from "node:assert/strict";
import fs from "node:fs";

const service = fs.readFileSync("apps/api/src/referral.service.ts","utf8");
const auth = fs.readFileSync("apps/api/src/auth.controller.ts","utf8");
const cloud = fs.readFileSync("apps/api/src/cloud.controller.ts","utf8");
const sidebar = fs.readFileSync("apps/web/components/OwnerSidebar.tsx","utf8");
const migration = fs.readFileSync("database/024_referral_program.sql","utf8");

for (const [level,bps] of [[1,700],[2,500],[3,300],[4,100]]) {
  assert.match(service, new RegExp(`level:\\s*${level},\\s*rateBps:\\s*${bps}`));
}
assert.match(auth,/referralCode/);
assert.match(auth,/referred_by_user_id/);
assert.match(cloud,/creditPurchase/);
assert.match(cloud,/CLOUD_ORDER/);
assert.match(sidebar,/Invite & Earn/);
assert.match(migration,/UNIQUE\(source_type,source_id,beneficiary_user_id,level\)/);
console.log("referral-program-contract: ok");
