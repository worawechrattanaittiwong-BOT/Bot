import assert from "node:assert/strict";
import fs from "node:fs";

const adminApi = fs.readFileSync("apps/api/src/admin.controller.ts","utf8");
const authApi = fs.readFileSync("apps/api/src/auth.controller.ts","utf8");
const db = fs.readFileSync("apps/api/src/db.service.ts","utf8");
const adminPage = fs.readFileSync("apps/web/app/admin/page.tsx","utf8");
const resetPage = fs.readFileSync("apps/web/app/reset-password/page.tsx","utf8");
const trialService = fs.readFileSync("apps/api/src/trial-authorization.service.ts","utf8");
const ea = fs.readFileSync("apps/api/src/ea.controller.ts","utf8");
const bot = fs.readFileSync("apps/api/src/bot.controller.ts","utf8");

assert.match(adminApi, /@Post\("trials\/set-duration"\)/);
assert.match(adminApi, /@Post\("trials\/authorize"\)/);
assert.match(adminApi, /trial_authorization_status/);
assert.match(adminApi, /@Post\("users\/send-password-reset"\)/);
assert.match(adminApi, /days > 3650/);
assert.match(authApi, /@Post\("reset-password"\)/);
assert.match(authApi, /PASSWORD_RESET/);
assert.match(db, /CREATE TABLE IF NOT EXISTS password_reset_tokens/);
assert.match(db, /CREATE TABLE IF NOT EXISTS trial_authorizations/);
assert.match(trialService, /PENDING_BIND/);
assert.match(trialService, /claimPendingAuthorization/);
assert.match(ea, /claimPendingAuthorization\(instance\.user_id/);
assert.match(bot, /claimPendingAuthorization\(req\.user\.sub/);

assert.match(adminPage, /CUSTOMER CONTROL CENTER/);
assert.match(adminPage, /Local MT5/);
assert.match(adminPage, /Cloud VPS/);
assert.match(adminPage, /Trial Days/);
assert.match(adminPage, /อนุมัติ Trial " \+ trialDays \+ " วันล่วงหน้า/);
assert.match(adminPage, /\/admin\/trials\/authorize/);
assert.doesNotMatch(adminPage, /!selectedCustomer\.mt5_account_id \|\| selectedCustomer\.trial_request_status!=="PENDING"/);
assert.match(adminPage, /ส่งลิงก์ตั้งรหัสผ่านใหม่/);
assert.match(adminPage, /extendDays/);
assert.doesNotMatch(adminPage, /อนุมัติ Trial 3h/);

assert.match(resetPage, /Set New Password/);
assert.match(resetPage, /\/auth\/reset-password/);

console.log("customer-account-control-contract: ok");
