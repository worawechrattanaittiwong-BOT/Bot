import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

const webFiles = filesUnder("apps/web").filter((file) => /\.(?:ts|tsx)$/.test(file));
const nativeDialogPattern = /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/g;
const offenders = [];

for (const file of webFiles) {
  const source = fs.readFileSync(file, "utf8");
  const matches = source.match(nativeDialogPattern);
  if (matches?.length) offenders.push(file + ": " + matches.join(", "));
}

assert.deepEqual(
  offenders,
  [],
  "Native browser dialogs are not allowed. Use SystemPopupProvider instead:\n" + offenders.join("\n")
);

const provider = fs.readFileSync("apps/web/components/SystemPopupProvider.tsx", "utf8");
const css = fs.readFileSync("apps/web/app/globals.css", "utf8");
const performance = fs.readFileSync("apps/web/app/performance/page.tsx", "utf8");

for (const required of [
  "promptPopup",
  "requiredText",
  "copyRequiredText",
  "sc-system-popup-required",
  "sc-system-popup-input"
]) {
  assert.match(provider, new RegExp(required), "System popup prompt contract missing: " + required);
}

assert.match(css, /\.sc-system-popup-layer\.is-prompt/);
assert.match(css, /\.sc-system-popup-required/);
assert.match(performance, /requiredText:"RESET"/);
assert.match(performance, /copyLabel:"คัดลอก RESET"/);

console.log("system-popup-contract: ok");
