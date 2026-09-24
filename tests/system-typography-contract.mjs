import fs from "node:fs";
import path from "node:path";

const roots = ["apps/web/app","apps/web/components"];
const cssFontSize = /font-size\s*:\s*(\d+(?:\.\d+)?)px/gi;
const cssFontShort = /font\s*:[^;{}]*?(\d+(?:\.\d+)?)px/gi;
const inlineFont = /fontSize\s*:\s*["']?(\d+(?:\.\d+)?)(?:px)?["']?/g;
const tailwindFont = /text-\[(\d+(?:\.\d+)?)px\]/g;
const violations = [];

function walk(dir, cb) {
  for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, cb);
    else cb(full);
  }
}

for (const root of roots) {
  walk(root, file => {
    if (file.endsWith(".css")) {
      const text = fs.readFileSync(file,"utf8");
      for (const regex of [cssFontSize,cssFontShort]) {
        regex.lastIndex=0;
        let match;
        while ((match=regex.exec(text))) {
          if (Number(match[1]) < 11) violations.push(`${file}: CSS ${match[1]}px`);
        }
      }
    }
    if (file.endsWith(".tsx") || file.endsWith(".ts")) {
      const text = fs.readFileSync(file,"utf8");
      for (const regex of [inlineFont,tailwindFont]) {
        regex.lastIndex=0;
        let match;
        while ((match=regex.exec(text))) {
          if (Number(match[1]) < 11) violations.push(`${file}: inline ${match[1]}px`);
        }
      }
    }
  });
}

const globals = fs.readFileSync("apps/web/app/globals.css","utf8");
for (const token of [
  "--ui-type-caption:11px",
  "--ui-type-meta:12px",
  "--ui-type-label:13px",
  "--ui-type-body:14px",
  "--ui-type-control:14px",
  "--ui-type-subtitle:16px",
  "--ui-type-title:20px",
  "--ui-type-page:28px"
]) {
  if (!globals.includes(token)) violations.push("missing central typography token: "+token);
}

if (violations.length) {
  console.error("System typography contract failed:");
  console.error(violations.slice(0,100).join("\n"));
  process.exit(1);
}

console.log("System typography contract: PASS");
