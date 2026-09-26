import fs from "node:fs";

const page = fs.readFileSync("apps/web/app/referrals/page.tsx","utf8");
const css = fs.readFileSync("apps/web/app/referrals/referrals.module.css","utf8");
const globals = fs.readFileSync("apps/web/app/globals.css","utf8");
const icons = fs.readFileSync("apps/web/components/ScenovaIcon.tsx","utf8");
const walletCss = css.slice(css.indexOf(".walletCard{"));

function expect(ok, message) {
  if (!ok) {
    console.error("Wallet UI contract failed:", message);
    process.exit(1);
  }
}

expect(globals.includes("--ui-type-caption:11px"), "central caption typography token missing");
expect(globals.includes("--ui-type-body:14px"), "central body typography token missing");
expect(globals.includes("--ui-type-control:14px"), "central control typography token missing");
expect(globals.includes("--ui-control-height:44px"), "central control height token missing");

expect(!walletCss.includes("font-size:7px"), "wallet must not regress to unreadable 7px text");
expect(!walletCss.includes("font-size:8px"), "wallet must not regress to unreadable 8px text");
expect(walletCss.includes("font-size:var(--ui-type-meta)"), "wallet helper text must use central readable token");
expect(walletCss.includes("grid-template-columns:minmax(220px,360px)"), "withdraw amount field must stay compact");
expect(walletCss.includes(".compactField{max-width:220px}"), "2FA field must stay compact");
expect(page.includes("จำนวนเงิน (บาท)"), "withdraw amount label must keep currency context");
expect(page.includes("<span>บาท</span>"), "withdraw amount input must keep currency suffix");
expect(page.includes('placeholder="1,000"'), "withdraw amount input must use example placeholder without a preset value");
expect(page.includes('cleaned === "."'), "withdraw amount input must reject lone decimal point");

expect(page.includes('name="scenova-payout-account-number"'), "bank account input must use dedicated autofill identity");
expect(page.includes('name="scenova-withdrawal-amount-thb"'), "withdraw amount input must use dedicated autofill identity");
expect(page.includes('data-lpignore="true"'), "numeric money inputs must opt out of password-manager autofill");
expect(page.includes('data-1p-ignore="true"'), "numeric money inputs must opt out of 1Password autofill");
expect(page.includes('event.target.value.replace(/\\D/g,"")'), "bank account input must sanitize non-numeric data");
expect(page.includes('event.target.value.replace(/[^0-9.]/g,"")'), "withdraw amount must sanitize non-numeric data");
expect(page.includes('autoComplete="one-time-code"'), "2FA inputs must use one-time-code autocomplete");

for (const icon of ["bank","lock","download","check","pause","coins"]) {
  expect(icons.includes(`case "${icon}"`), `semantic icon missing: ${icon}`);
}
expect(page.includes('<ScenovaIcon name="bank"'), "payout destination must use real bank icon");
expect(page.includes('<ScenovaIcon name="coins"'), "available balance must use real coins icon");
expect(page.includes('<ScenovaIcon name="download"'), "withdraw actions must use real download icon");

console.log("Wallet UI typography/autofill contract: PASS");
