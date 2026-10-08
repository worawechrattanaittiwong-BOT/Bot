import fs from "node:fs";

function text(path) {
  return fs.readFileSync(path, "utf8");
}
function assertContains(path, needle, message) {
  if (!text(path).includes(needle)) {
    throw new Error(message + " (missing: " + needle + ")");
  }
}
function assertNotContains(path, needle, message) {
  if (text(path).includes(needle)) {
    throw new Error(message + " (forbidden: " + needle + ")");
  }
}

const bot = "apps/api/src/bot.controller.ts";
const eaApi = "apps/api/src/ea.controller.ts";
const ea = "mt5/FastBasketBot.mq5";
const dashboard = "apps/web/app/dashboard/page.tsx";
const symbols = "apps/api/src/trading-symbol.controller.ts";
const worker = "tools/windows-cloud-worker/Worker/Mt5Runtime.cs";

// New Cloud accounts are credential-first and must not start a trading EA
// until MT5 discovery has returned a real XAU symbol and the customer confirms it.
assertContains(bot, "firstConnectPrimeArmed: false", "Cloud connect must not auto-prime before Symbol confirmation");
assertContains(bot, 'symbolDiscoveryPending: mode === "CLOUD"', "Cloud connect must enter Symbol discovery");
assertContains(bot, 'symbolResolutionMode !== "EXACT"', "Cloud Start must be blocked until Symbol confirmation");
assertContains(bot, "กรุณารอ VPS ตรวจ Symbol XAU", "Customer Start error must explain the pending Symbol step");

assertContains(worker, '"Enabled=0"', "Discovery MT5 must keep Experts disabled");
assertContains(worker, '"AllowLiveTrading=0"', "Discovery MT5 must keep live trading disabled");
assertContains(worker, '"WebRequest=0"', "Discovery MT5 must not start EA network control");
assertContains(worker, 'string.IsNullOrWhiteSpace(prepared.Symbol)', "Worker must distinguish discovery from confirmed Symbol");
assertContains(symbols, "'symbolResolutionMode','EXACT'", "Customer confirmation must create exact Symbol authority");
assertContains(symbols, "SET desired_state=CASE WHEN $7::boolean THEN 'STOPPED' ELSE 'SAFE_STOP' END", "Cloud Symbol confirmation must reload while bot remains stopped");
assertContains(dashboard, "symbolDiscoveryReady === true", "Dashboard must wait for real MT5 Symbol discovery");
// The picker is intentionally concise; enforce the exact-choices behavior, not technical copy.
assertContains(dashboard, "tradingSymbolOptions.map(item=><option key={item} value={item}", "Dashboard must present only discovered Symbol choices");
assertContains(dashboard, "onClick={applyTradingSymbol}", "Dashboard must require explicit customer confirmation");

// Keep the independent EA entry-suppression protections for legacy/repair
// first-connect flows. They remain a defense in depth even though new Cloud
// provisioning no longer auto-primes before Symbol confirmation.
assertContains(eaApi, "entrySuppressed:", "Heartbeat must still support server-side entry suppression");
assertContains(ea, "g_serverEntrySuppressed", "EA must retain the independent entry lock");
assertContains(ea, 'JsonBool(response, "entrySuppressed", false)', "EA must read the server-side entry lock");
assertContains(ea, "if(g_serverEntrySuppressed) return false;", "Shared order gate must reject entries when suppressed");
assertNotContains(dashboard, "แบบห้ามออกออเดอร์", "New connection UI must not describe the retired pre-Symbol prime flow");

console.log("First-connect Symbol-discovery no-entry contract PASS.");
