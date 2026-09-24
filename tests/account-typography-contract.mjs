import fs from "node:fs";

const css = fs.readFileSync("apps/web/app/account/account.module.css","utf8");
const globals = fs.readFileSync("apps/web/app/globals.css","utf8");

function expect(ok, message) {
  if (!ok) {
    console.error("Account typography contract failed:", message);
    process.exit(1);
  }
}

expect(globals.includes("--ui-type-caption:11px"), "central caption token missing");
expect(globals.includes("--ui-type-meta:12px"), "central meta token missing");
expect(globals.includes("--ui-type-label:13px"), "central label token missing");
expect(globals.includes("--ui-type-body:14px"), "central body token missing");
expect(globals.includes("--ui-type-control:14px"), "central control token missing");
expect(css.includes("font-size:var(--ui-type-subtitle)"), "account section titles must use central subtitle token");
expect(css.includes("font-size:var(--ui-type-label)"), "account labels/values must use central label token");
expect(css.includes("font-size:var(--ui-type-meta)"), "account helper text must use central meta token");
expect(css.includes("font-size:var(--ui-type-control)"), "account inputs must use central control token");
expect(css.includes("height:var(--ui-control-height)"), "account controls must use central height token");

for (const tiny of ["font-size:7px","font-size:7.5px","font-size:8px","font-size:8.5px","font-size:9px","font-size:10px"]) {
  expect(!css.includes(tiny), "account must not regress to tiny text: " + tiny);
}

console.log("Account typography contract: PASS");
