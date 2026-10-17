import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";

const page=fs.readFileSync("apps/web/app/login/page.tsx","utf8");
const original=execFileSync("git",["show","HEAD:apps/web/app/login/page.tsx"],{encoding:"utf8"});
const stylesheet=fs.readFileSync("apps/web/app/login/login.module.css","utf8");
const originalStyles=execFileSync("git",["show","HEAD:apps/web/app/login/login.module.css"],{encoding:"utf8"});
// Appearance is locked: all existing image, color, backdrop and control
// rules must remain byte-identical. Responsive layout overrides are allowed.
function firstRule(css, selector) {
  const start=css.indexOf(selector+"{");
  assert.ok(start>=0,"Missing CSS selector: "+selector);
  const end=css.indexOf("}",start);
  assert.ok(end>start);
  return css.slice(start,end+1);
}
for(const selector of [
  ".background",".backgroundImage",".vignette",".brand",".formCard",
  ".formLogo",".inputWrap",".input",".passwordToggle",".submit",
  ".partnerCard",".partnerMark",".partnerButton",".terms",".security"
]) {
  assert.equal(firstRule(stylesheet,selector),firstRule(originalStyles,selector),
    "Login image, theme, card or controls changed: "+selector);
}
assert.match(stylesheet,/\.page\{overflow-x:hidden;overflow-y:auto\}/,
  "Short viewports must scroll instead of cropping registration");
assert.match(stylesheet,/justify-content:safe center/,
  "Short mobile screens must not vertically clip long signup forms");
assert.match(stylesheet,/@media \(min-width:901px\)\{[\s\S]*?\.layout\{grid-template-columns:/);
assert.match(stylesheet,/@media \(max-width:900px\)\{[\s\S]*?\.formPane\{order:1;[\s\S]*?\.leftPane\{order:2;/,
  "Mobile form must come before Exness");
assert.match(stylesheet,/\.leftPane\{order:2;[^}]*min-height:0;/,
  "Mobile must not reserve 590-660px for deleted promotion");
assert.match(stylesheet,/\.leftPane:empty\{display:none\}/,
  "No empty promotional pane when Exness is disabled");
assert.match(stylesheet,/\.partnerCard\{position:relative;left:auto;bottom:auto;/,
  "Mobile Exness banner should follow the form in normal flow");
assert.match(stylesheet,/@media \(max-width:420px\)\{[\s\S]*?\.partnerButton\{grid-column:1 \/ -1;width:100%\}/,
  "Small phones must not crop Exness button");
for(const x of ["LOGIN_BACKGROUND_DESKTOP_URL","LOGIN_BACKGROUND_MOBILE_URL","<LoginBackground />",
  "styles.leftPane","styles.formPane","styles.formCard","styles.header","styles.partnerCard","styles.partnerMark",
  'className={styles.inputWrap}',"styles.passwordToggle","styles.submit","styles.switch",
  '"/api/auth/" + (register ? "register" : "login")','acceptedTerms','confirmPassword',
  'passwordStrength','rememberEmail','showPasswordRecovery','openExnessSignup',
  'styles.registrationSafety','styles.terms','"/verify-email?email="','"/verify-2fa"',
  '"/onboarding?new=1"','styles.formBrand','styles.brand','styles.backgroundImage']) {
  assert.ok(page.includes(x), "Required function, field, style or image changed/missing: "+x);
  assert.ok(original.includes(x), "Missing baseline proof: "+x);
}
for(const x of ["PRECISION IN MOTION.","SCENOVA SECURE ACCESS","One Account for Your",
  "Automate Trading","Smart EA Systems","Monitor in Real-Time","Anytime, Anywhere",
  "Guided Setup","DESIGNED FOR YOUR TRADING JOURNEY",
  "Protected by SCENOVA secure authentication","PARTNER SCENOVA · EXNESS",
  'className={styles.features}','className={styles.cardEyebrow}',
  'className={styles.steps}','className={styles.security}','className={styles.divider}']) {
  assert.ok(!page.includes(x), "Marketing copy still rendered: "+x);
}
const beforeLogic=original.slice(original.indexOf("  async function submit("),original.indexOf("  if (checkingSession) {"));
const afterLogic=page.slice(page.indexOf("  async function submit("),page.indexOf("  if (checkingSession) {"));
assert.equal(afterLogic,beforeLogic,"Authentication, signup and Exness link handlers must be identical");
assert.ok(page.includes('type="email"'));
assert.ok(page.includes('type={showPassword ? "text" : "password"}'));
assert.ok(page.includes('type="checkbox"'));
assert.ok(page.includes('aria-label={showPassword ? "Hide password" : "Show password"}'));
assert.ok(page.includes('value={inviteCode}'));
assert.ok(page.includes('onClick={openExnessSignup}'));
console.log("Login/register responsive layout PASS: original imagery/theme/controls and auth handlers preserved; compact mobile flow");
