const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const page = fs.readFileSync("apps/web/app/admin/trading-modes/page.tsx", "utf8");
const css = fs.readFileSync("apps/web/app/admin/trading-modes/page.module.css", "utf8");

test("Owner has one compact toggle row for every returned mode", () => {
  assert.match(page, /visible\.map\(mode =>/);
  assert.match(page, /className=\{css\.modeRow\}/);
  assert.match(page, /role="switch" aria-checked=\{mode\.enabled\}/);
  assert.match(page, /className=\{css\.switch\} data-on=\{mode\.enabled\}/);
  assert.match(css, /\.modeRow\{display:grid/);
  assert.match(css, /\.switch\{position:relative/);
  assert.doesNotMatch(page, /className=\{css\.grid\}/);
  assert.doesNotMatch(page, /className=\{css\.card\}/);
});

test("Details and safety guidance start collapsed", () => {
  assert.match(page, /<details className=\{css\.details\}>/);
  assert.match(page, /<details className=\{css\.help\}>/);
  assert.match(page, /setOnlyDisabled\(e\.target\.checked\)/);
});

test("Enable uses existing admin API and never auto starts bots", () => {
  assert.match(page, /void updateMode\(mode, true, "OWNER_REOPEN"\)/);
  assert.match(page, /adminApi\("\/admin\/trading-modes"/);
  assert.doesNotMatch(page, /adminApi\("\/bot\/start"/);
});

test("Disabling requires a second explicit confirmation with reason", () => {
  assert.match(page, /setPendingDisable\(mode\.mode\)/);
  assert.match(page, /pendingDisable === mode\.mode/);
  assert.match(page, /maxLength=\{240\}/);
  assert.match(page, /disabled=\{busy \|\| !reason\.trim\(\)\}/);
  assert.match(page, /updateMode\(mode, false, reason\.trim\(\)\)/);
  assert.match(page, /ยืนยัน Safe Stop/);
  assert.doesNotMatch(page, /window\.confirm/);
});

test("Backend and MT5 trade engines remain outside the compact-page change", () => {
  assert.match(page, /ไม่บังคับ Close All/);
  assert.match(page, /ZERO GRID ที่ใช้ EA รุ่นเก่า/);
  assert.match(css, /@media\(max-width:440px\)/);
});
