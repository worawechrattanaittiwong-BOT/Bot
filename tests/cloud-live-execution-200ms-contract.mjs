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
assert.match(
  ea,
  /\"eventType\":\"LIVE_EXECUTION\"[\s\S]*?\"openPositions\":%s/,
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
assert.match(
  dashboard,
  /LIVE EXECUTION · CLOUD 200ms/,
  "Dashboard must visibly identify the active Cloud 200ms stream"
);

const eaVersion = ea.match(/#define SCENOVA_EA_VERSION "([^"]+)"/)?.[1];
const promotedEa = release.match(/DEFAULT_EA_VERSION = "([^"]+)"/)?.[1];
assert.equal(eaVersion, "1.1.21", "Cloud 200ms requires EA 1.1.21");
assert.equal(eaVersion, promotedEa, "EA source and promoted API version must match");

const workerVersion = workerLoop.match(/Version = "([^"]+)"/)?.[1];
const projectVersion = workerProject.match(/<Version>([^<]+)<\/Version>/)?.[1];
const promotedWorker = cloudRelease.match(/workerVersion: "([^"]+)"/)?.[1];
assert.equal(workerVersion, "2.2.32", "Cloud 200ms requires Worker 2.2.32");
assert.equal(workerVersion, projectVersion, "Worker source/project versions must match");
assert.equal(workerVersion, promotedWorker, "Worker source/promoted versions must match");

console.log("Cloud Live Execution 200ms isolation contract PASS");
