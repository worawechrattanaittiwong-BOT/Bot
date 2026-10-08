import fs from "node:fs";
import assert from "node:assert/strict";

const read = (path) => fs.readFileSync(path, "utf8");

const ea = read("mt5/FastBasketBot.mq5");
const relay = read("tools/windows-cloud-worker/Worker/CloudEaRelay.cs");
const workerLoop = read("tools/windows-cloud-worker/Worker/WorkerLoop.cs");
const workerProject = read("tools/windows-cloud-worker/Worker/ScenovaCloudWorker.csproj");
const cloudRelease = read("apps/api/src/cloud-server-release.ts");
const runtimeController = read("apps/api/src/runtime-event.controller.ts");
const runtimeService = read("apps/api/src/runtime-event.service.ts");
const dashboard = read("apps/web/app/dashboard/page.tsx");
const botApi = read("apps/api/src/bot.controller.ts");
const release = read("apps/api/src/release-version.ts");

assert.match(
  ea,
  /#define CLOUD_LIVE_EXECUTION_INTERVAL_MS 200/,
  "Cloud live execution source cadence must remain 200ms"
);
assert.match(
  ea,
  /void PublishCloudLiveExecutionSnapshot\(\)[\s\S]*?!InpCloudRelay[\s\S]*?ScenovaAccountPositionCount\(\)[\s\S]*?scenova-live-/,
  "EA live execution snapshots must be Cloud-only, position-only local files"
);
assert.match(
  ea,
  /PublishCloudLiveExecutionSnapshot\(\);[\s\S]*?FastProfitClosePriority\(\)/,
  "Cloud live snapshot must run early on live ticks before strategy early returns"
);
assert.doesNotMatch(
  ea.match(/void PublishCloudLiveExecutionSnapshot\(\)[\s\S]*?\n\}/)?.[0] || "",
  /WebRequest\s*\(/,
  "200ms observability must never perform network I/O inside the EA"
);
const liveSnapshotFunction =
  ea.match(/void PublishCloudLiveExecutionSnapshot\(\)[\s\S]*?\n\}/)?.[0] || "";
assert.match(
  liveSnapshotFunction,
  /LIVE_EXECUTION/,
  "Cloud live snapshot must identify the LIVE_EXECUTION event"
);
assert.match(
  liveSnapshotFunction,
  /OpenPositionsTelemetryJson\(\)/,
  "Cloud live snapshot must carry open positions and current P/L"
);

assert.match(
  relay,
  /RunLiveExecutionRelayLoopAsync/,
  "Cloud Worker must run a dedicated live execution relay loop"
);
assert.match(
  relay,
  /Task\.Delay\(100, cancellationToken\)/,
  "Cloud Worker live relay polling must remain no slower than 100ms"
);
assert.match(
  relay,
  /scenova-live-\*\.request\.txt/,
  "Cloud Worker must scan the dedicated live snapshot files"
);
assert.match(
  relay,
  /OrderByDescending\(File\.GetLastWriteTimeUtc\)/,
  "Cloud Worker must prioritize the newest live snapshot"
);
assert.match(
  relay,
  /foreach \(var stalePath in snapshots\.Skip\(1\)\)[\s\S]*?File\.Delete\(stalePath\)/,
  "Superseded live snapshots must be coalesced instead of backlogged"
);

assert.match(
  runtimeController,
  /"LIVE_EXECUTION"/,
  "Runtime API must accept Cloud live execution events"
);
assert.match(
  runtimeController,
  /if \(!isLiveExecution\) \{[\s\S]*?UPDATE bot_instances/,
  "200ms live snapshots must bypass PostgreSQL writes"
);
assert.match(
  runtimeController,
  /liveExecutionTransport = "CLOUD_SSE"/,
  "Runtime API must label the direct Cloud SSE transport"
);
assert.match(
  runtimeService,
  /occurredAtMs\?: number/,
  "Runtime SSE event type must carry millisecond source timing"
);

assert.match(
  dashboard,
  /String\(event\.eventType \|\| ""\)\.toUpperCase\(\) !== "LIVE_EXECUTION"/,
  "Dashboard must not full-reload on each 200ms live snapshot"
);
const idleHelperStart = ea.indexOf("bool CloudStoppedFlatIdle()");
const onTickStart = ea.indexOf("void OnTick()");
const onTimerStart = ea.indexOf("void OnTimer()", onTickStart);
const idleHelper = idleHelperStart >= 0 && onTickStart > idleHelperStart
  ? ea.slice(idleHelperStart, onTickStart)
  : "";
const onTick = onTickStart >= 0 && onTimerStart > onTickStart
  ? ea.slice(onTickStart, onTimerStart)
  : "";
const stoppedFlatGuard = onTick.indexOf("if(CloudStoppedFlatIdle())");
const heavyTickWork = onTick.indexOf("UpdateMomentum()");
assert.ok(stoppedFlatGuard >= 0, "STOPPED + flat EA must have an early idle guard");
assert.ok(
  heavyTickWork < 0 || stoppedFlatGuard < heavyTickWork,
  "STOPPED + flat guard must run before indicator-heavy tick work so Timer heartbeat cannot be starved"
);
assert.match(
  idleHelper,
  /g_state==STATE_STOPPED[\s\S]*?g_pendingCloseReason==CLOSE_REASON_NONE[\s\S]*?!LocalExecutionExposureActive\(\)[\s\S]*?ScenovaAccountPositionCount\(\)<=0[\s\S]*?ScenovaAccountPendingCount\(\)<=0/,
  "STOPPED idle fast path must preserve exposure and pending-order safety"
);
assert.match(
  ea,
  /input int\s+InpHeartbeatSeconds\s+= 5;/,
  "Cloud heartbeat cadence must remain the existing 5 seconds"
);
assert.match(
  botApi,
  /cloud_control_ready/,
  "Dashboard API must expose fresh Cloud Worker terminal/EA attach readiness separately from EA heartbeat freshness"
);
assert.match(
  dashboard,
  /const startConnectionReady = isCloudRuntime[\s\S]*?isCloudControlReady[\s\S]*?: \(isMt5Online \|\| isAgentOnline\)/,
  "Cloud Start button must use Worker-confirmed control readiness instead of transient 20s EA heartbeat freshness"
);

const eaVersion = ea.match(/#define SCENOVA_EA_VERSION "([^"]+)"/)?.[1];
const promotedEa = release.match(/DEFAULT_EA_VERSION = "([^"]+)"/)?.[1];
assert.equal(eaVersion, "1.1.30", "Cloud heartbeat/control readiness requires EA 1.1.30");
assert.equal(eaVersion, promotedEa, "EA source and promoted API version must match");

const workerVersion = workerLoop.match(/Version = "([^"]+)"/)?.[1];
const projectVersion = workerProject.match(/<Version>([^<]+)<\/Version>/)?.[1];
const promotedWorker = cloudRelease.match(/workerVersion: "([^"]+)"/)?.[1];
assert.equal(workerVersion, "2.2.36", "Cloud 200ms requires Worker 2.2.36");
assert.equal(workerVersion, projectVersion, "Worker source/project versions must match");
assert.equal(workerVersion, promotedWorker, "Worker source/promoted versions must match");

console.log("Cloud Live Execution 200ms isolation contract PASS");
