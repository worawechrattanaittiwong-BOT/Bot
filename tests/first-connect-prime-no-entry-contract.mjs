import fs from "node:fs";

function assertContains(path, needle, message) {
  const text = fs.readFileSync(path, "utf8");
  if (!text.includes(needle)) {
    throw new Error(message + " (missing: " + needle + ")");
  }
}

const bot = "apps/api/src/bot.controller.ts";
const eaApi = "apps/api/src/ea.controller.ts";
const ea = "mt5/FastBasketBot.mq5";
const dashboard = "apps/web/app/dashboard/page.tsx";

assertContains(bot, "FIRST_CONNECT_PRIME_ARMED", "Cloud connect must arm the first-connect lifecycle");
assertContains(bot, "firstConnectPrimePending", "Cloud connect must persist the first-connect lifecycle");
assertContains(bot, "FIRST_CONNECT_PRIME_COMPLETED_BY_CUSTOMER_START", "Compatible Cloud Start must be able to complete a stuck prime safely");
assertContains(bot, "primeCanYieldToCustomerStart", "Customer Start may bypass only a compatible, flat, Worker-confirmed prime");

assertContains(eaApi, "FIRST_CONNECT_PRIME_DISPATCHED", "Current EA heartbeat must dispatch the one-time Start");
assertContains(eaApi, "FIRST_CONNECT_PRIME_MIN_EA_VERSION", "Prime Start must use a minimum compatible protected EA version");
assertContains(eaApi, "isVersionAtLeast(metrics.eaVersion, FIRST_CONNECT_PRIME_MIN_EA_VERSION)", "Compatible older EA patches must remain usable until Admin applies an update");
assertContains(eaApi, "desired_state='RUNNING'", "Prime must exercise the real RUNNING lifecycle");
assertContains(eaApi, "entrySuppressed:", "Heartbeat must explicitly tell the EA to suppress entries");
assertContains(eaApi, "FIRST_CONNECT_PRIME_COMPLETED", "Server must audit completion of the prime cycle");
assertContains(eaApi, "SET desired_state='STOPPED',lock_owner=NULL", "Server must stop immediately after RUNNING is confirmed");
assertContains(eaApi, "firstConnectPrimeCompletedAt", "Prime completion must be durable");

assertContains(ea, "g_serverEntrySuppressed", "EA must carry an independent entry lock");
assertContains(ea, 'JsonBool(response, "entrySuppressed", false)', "EA must read the server-side entry lock");
assertContains(ea, 'g_executionStatus = "FIRST_CONNECT_PRIME";', "EA must expose the prime lifecycle status");
assertContains(ea, "if(g_serverEntrySuppressed) return false;", "Every shared order/lease gate must reject entries during the prime cycle");
assertContains(ea, "ScenovaAccountPositionCount()<=0", "Prime guard must execute before normal entry engines");
assertContains(ea, "initial Cloud heartbeat was not queued; refusing false-ready marker", "Cloud runtime must not publish readiness before heartbeat relay initializes");
const eaText = fs.readFileSync(ea, "utf8");
const onInitStart = eaText.indexOf("int OnInit()");
const onInitEnd = eaText.indexOf("void OnDeinit", onInitStart);
const onInit = eaText.slice(onInitStart, onInitEnd);
const initialHeartbeatAt = onInit.indexOf("SendHeartbeat();");
const timerAt = onInit.indexOf("ArmRuntimeTimer()");
const readyMarkerAt = onInit.indexOf("PublishEaAttachMarker()");
if (!(initialHeartbeatAt >= 0 && timerAt > initialHeartbeatAt && readyMarkerAt > timerAt)) {
  throw new Error("Worker-ready marker must be published only after initial heartbeat queueing and runtime timer arming");
}

assertContains(dashboard, "firstConnectPrimeBlocksStart", "Dashboard must allow compatible Cloud Start to resolve a stuck prime");
assertContains(dashboard, "isCloudControlReady", "Cloud Start readiness must come from fresh Worker terminal/EA control state");
assertContains(dashboard, "แบบห้ามออกออเดอร์", "Customer-facing connect status must say no orders are allowed");

console.log("First-connect prime no-entry contract PASS");

