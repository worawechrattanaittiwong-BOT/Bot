import assert from "node:assert/strict";
import fs from "node:fs";

const adminApi = fs.readFileSync("apps/api/src/admin.controller.ts","utf8");
const authApi = fs.readFileSync("apps/api/src/auth.controller.ts","utf8");
const db = fs.readFileSync("apps/api/src/db.service.ts","utf8");
const adminPage = fs.readFileSync("apps/web/app/admin/page.tsx","utf8");
const resetPage = fs.readFileSync("apps/web/app/reset-password/page.tsx","utf8");

assert.match(adminApi, /@Post\("trials\/set-duration"\)/);
assert.match(adminApi, /@Post\("users\/send-password-reset"\)/);
assert.match(adminApi, /days > 3650/);
assert.match(authApi, /@Post\("reset-password"\)/);
assert.match(authApi, /PASSWORD_RESET/);
assert.match(db, /CREATE TABLE IF NOT EXISTS password_reset_tokens/);

assert.match(adminPage, /CUSTOMER CONTROL CENTER/);
assert.match(adminPage, /Local MT5/);
assert.match(adminPage, /Cloud VPS/);
assert.match(adminPage, /Trial Days/);
assert.match(adminPage, /ส่งลิงก์ตั้งรหัสผ่านใหม่/);
assert.match(adminPage, /extendDays/);
assert.doesNotMatch(adminPage, /อนุมัติ Trial 3h/);

assert.match(resetPage, /Set New Password/);
assert.match(resetPage, /\/auth\/reset-password/);

console.log("customer-account-control-contract: ok");
