import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), "utf8");

const helper = read("apps/api/src/connected-symbol-choices.ts");
const compiled = ts.transpileModule(helper, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports }, { filename: "connected-symbol-choices.js" });
const { connectedAccountSymbolChoices, exactConnectedAccountSymbol } = exports;

test("connected MT5 may select exact broker BTCUSDm in Market Watch", () => {
  const metrics = {
    symbol: "XAUUSDm",
    marketWatchSymbols: ["XAUUSDm", "BTCUSDm", "EURUSDm", "XAUUSDm"]
  };
  assert.deepEqual(
    Array.from(connectedAccountSymbolChoices(metrics)),
    ["XAUUSDm", "BTCUSDm"]
  );
  assert.equal(exactConnectedAccountSymbol("btcusdm", metrics), "BTCUSDm");
  assert.equal(exactConnectedAccountSymbol("BTCUSD", metrics), "");
  assert.equal(exactConnectedAccountSymbol("ETHUSDm", metrics), "");
  assert.equal(exactConnectedAccountSymbol("EURUSDm", metrics), "");
});

test("connected MT5 refuses suffix guessing, invalid symbols and forged values", () => {
  const metrics = {
    symbol: "XAUUSDm",
    marketWatchSymbols: ["BTCUSDm", "BTC USDm", "ETH/USDm", "BTCUSDm", "USDJPYm"]
  };
  assert.deepEqual(
    Array.from(connectedAccountSymbolChoices(metrics)),
    ["BTCUSDm", "XAUUSDm"]
  );
  assert.equal(exactConnectedAccountSymbol("BTCUSDc", metrics), "");
  assert.equal(exactConnectedAccountSymbol("", metrics), "");
});

test("initial Cloud MT5 setup continues using Worker XAU discovery only", () => {
  const controller = read("apps/api/src/trading-symbol.controller.ts");
  const web = read("apps/web/app/dashboard/page.tsx");
  const admin = read("apps/api/src/admin.controller.ts");
  const owner = read("apps/api/src/owner-management.controller.ts");
  const worker = read("tools/windows-cloud-worker/Worker/Mt5Runtime.cs");
  const bot = read("apps/api/src/bot.controller.ts");

  assert.match(controller, /!alreadyConnected && !requestedSymbol\.toUpperCase\(\)\.startsWith\("XAU"\)/);
  assert.match(controller, /xauSymbols\(instance\.discovered_xau_symbols\)/);
  assert.match(controller, /\? connectedAccountSymbolChoices\(instance\.metrics\)/);
  assert.match(admin, /if \(!postConnect\) \{[\s\S]*?workerInstance\?\.discoveredXauSymbols/);
  assert.match(owner, /if \(!postConnect\) \{[\s\S]*?workerInstance\?\.discoveredXauSymbols/);
  assert.match(web, /const choices = connected \? result\?\.marketWatchSymbols : result\?\.discoveredXauSymbols/);
  assert.match(web, /\(!confirmedCloudSymbol && !next\.toUpperCase\(\)\.startsWith\("XAU"\)\)/);
  assert.match(worker, /DiscoverMarketWatchXauSymbols\(instancePath\)/);
  assert.match(worker, /value\.StartsWith\("XAU"/);
  assert.match(bot, /'symbolResolutionMode','DISCOVERY'/);
});

test("symbol switch blocks active trading or pending orders, separate from connection", () => {
  const controller = read("apps/api/src/trading-symbol.controller.ts");
  const admin = read("apps/api/src/admin.controller.ts");
  const owner = read("apps/api/src/owner-management.controller.ts");
  assert.match(controller, /pendingOrders > 0/);
  assert.match(controller, /String\(instance\.desired_state \|\| ""\)\.toUpperCase\(\) === "RUNNING"/);
  assert.match(admin, /positions > 0 \|\| pendingOrders > 0/);
  assert.match(admin, /postConnect && String\(slot\.desired_state \|\| ""\)\.toUpperCase\(\) === "RUNNING"/);
  assert.match(owner, /Number\(slot\.pending_orders \|\| 0\) > 0/);
  assert.match(admin, /const recentEa = Boolean\(slot\.last_seen_at/);
  assert.match(owner, /const recentEa = Boolean\(slot\.last_seen_at/);
});

console.log("Post-connect Symbol isolation: tests loaded");
