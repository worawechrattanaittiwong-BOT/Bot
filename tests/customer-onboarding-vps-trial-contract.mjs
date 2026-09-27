import fs from "node:fs";
import assert from "node:assert/strict";

const read = path => fs.readFileSync(path, "utf8");

const sms = read("apps/api/src/sms.service.ts");
const accountSecurity = read("apps/api/src/account-security.controller.ts");
const phoneUtils = read("apps/api/src/phone-utils.ts");
const accountPage = read("apps/web/app/account/page.tsx");
const trialApi = read("apps/api/src/trial-coupon.controller.ts");
const packages = read("apps/web/app/packages/page.tsx");
const onboarding = read("apps/web/app/onboarding/page.tsx");
const dashboard = read("apps/web/app/dashboard/page.tsx");
const mt5Connect = read("apps/web/components/Mt5ConnectionExperience.tsx");
const botApi = read("apps/api/src/bot.controller.ts");

assert.match(sms, /purpose:\s*"ACCOUNT" \| "LOCAL_TRIAL"/);
assert.match(sms, /THAIBULKSMS_LIVE_MODE/);
assert.match(sms, /liveEnabled\(\)/);
assert.match(sms, /request blocked because LIVE_MODE is not enabled/);
assert.match(sms, /SCENOVA: รหัสยืนยัน Local MT5 Trial \$\{code\}/);
assert.match(sms, /SCENOVA: รหัสยืนยันเบอร์มือถือ \$\{code\}/);
assert.match(sms, /AbortSignal\.timeout\(SMS_REQUEST_TIMEOUT_MS\)/);
assert.match(sms, /https:\/\/api-v2\.thaibulksms\.com\/sms/);
assert.match(accountSecurity, /@Post\("account\/phone"\)/);
assert.match(accountSecurity, /@Post\("account\/phone\/request-otp"\)/);
assert.match(accountSecurity, /@Post\("account\/phone\/verify-otp"\)/);
assert.match(accountSecurity, /purpose='ACCOUNT'/);
assert.match(accountSecurity, /PHONE_OTP_SENT/);
assert.match(accountSecurity, /PHONE_VERIFIED/);
assert.match(accountSecurity, /phoneVerification:\s*\{/);
assert.match(accountSecurity, /smsAvailable:\s*this\.sms\.configured\(\)/);
assert.match(phoneUtils, /raw\.startsWith\("00"\)/);
assert.match(phoneUtils, /national\.startsWith\(ccDigits\)/);
assert.match(accountPage, /phoneOtpCooldown/);
assert.match(accountPage, /resendAfterSeconds/);
assert.match(accountPage, /ส่งรหัสยืนยัน/);
assert.match(accountPage, /ยืนยันเบอร์มือถือ/);
assert.match(accountPage, /data\?\.phoneVerification\?\.smsAvailable/);
assert.doesNotMatch(accountPage, /trialAccess/);
assert.doesNotMatch(accountPage, /placeholder="000000"/);
assert.match(trialApi, /defaultDelivery:\s*\n\s*phone\?\.e164 && this\.sms\.configured\(\) \? "SMS" : "EMAIL"/);
assert.match(trialApi, /@Body\(\) body: \{ delivery\?: "SMS" \| "EMAIL" \}/);
assert.match(trialApi, /requestOtp\(msisdn, otpCode, "LOCAL_TRIAL"\)/);
assert.match(botApi, /reason: "TRIAL_LOCAL_ONLY"/);

assert.match(packages, /<h2>ทดลองใช้งาน Local MT5<\/h2>/);
assert.match(packages, /LOCAL MT5 TRIAL/);
assert.match(packages, /JSON\.stringify\(\{ delivery: trialDelivery \}\)/);
assert.match(packages, /SMS · \{trial\?\.phone\?\.masked \|\| "ยังไม่ผูกเบอร์"\}/);

assert.match(onboarding, /runtimeMode/);
assert.match(onboarding, /SCENOVA CLOUD/);
assert.match(onboarding, /YOUR PC \/ VPS/);
assert.match(onboarding, /เปิดโลกการเทรดจากมือถือ/);
assert.match(onboarding, /ใช้ MT5 บนเครื่องของคุณ/);
assert.match(onboarding, /\/packages\?system=cloud&from=onboarding/);
assert.match(onboarding, /\/dashboard\?view=account&welcome=1&setup=local/);
assert.match(onboarding, /params\.get\("new"\) === "1" \|\| params\.get\("verified"\) === "1"/);

assert.match(dashboard, /customerHasCloudMigrationAccess/);
assert.match(dashboard, /บัญชีนี้ยังไม่มีสิทธิ์ VPS/);
assert.match(dashboard, /\/packages\?system=cloud&from=mt5-ea/);
assert.match(dashboard, /\/runtime-migration\/request/);
assert.match(dashboard, /กำลังย้ายระบบ/);
assert.match(dashboard, /กำลังติดตั้งระบบ VPS/);
assert.doesNotMatch(dashboard, /owner-vps-move-panel/);
assert.match(dashboard, /vpsMove=\{data\.account \?/);
assert.match(mt5Connect, /ย้ายไป VPS/);
assert.match(mt5Connect, /ซื้อแพ็กเกจ VPS/);
assert.match(mt5Connect, /props\.vpsMove\.progress/);
assert.match(dashboard, /ย้ายระบบไป VPS สำเร็จ/);

console.log("Customer onboarding, Local Trial SMS, and VPS migration contract PASS");
