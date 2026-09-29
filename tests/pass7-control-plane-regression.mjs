import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const web = read("apps/web/app/dashboard/page.tsx");
const nginx = read("scripts/configure-domain.sh");
const ea = read("mt5/FastBasketBot.mq5");
const relay = read("tools/windows-cloud-worker/Worker/CloudEaRelay.cs");
const worker = read("tools/windows-cloud-worker/Worker/WorkerLoop.cs");
const bot = read("apps/api/src/bot.controller.ts");

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error("Pass 7 regression missing: " + label);
}
function requireMatch(text, pattern, label) {
  if (!pattern.test(text)) throw new Error("Pass 7 regression missing: " + label);
}
function rejectMatch(text, pattern, label) {
  if (pattern.test(text)) throw new Error("Pass 7 regression violated: " + label);
}

// Pass 2: UI may soften the display state, but backend safety freshness remains strict.
requireText(web, "const isHeartbeatDelayed =", "dashboard reconnecting state");
requireText(web, '"Reconnecting"', "dashboard reconnecting label");
requireText(web, "const showLastKnownTelemetry = isMt5Online || isHeartbeatDelayed;", "last-known telemetry during reconnect");
requireText(web, "const isConnectionOnline = isCloudRuntime ? isCloudWorkerOnline : isMt5Online;", "Cloud connection follows VPS Server state");
requireText(web, 'isCloudWorkerOnline ? "VPS Server Online" : "VPS Server Offline"', "customer connection label mirrors VPS Server");
requireText(web, "cloudSlots.filter((slot:any)=>Boolean(slot?.runner_online)).length", "Cloud slot summary mirrors VPS Server");
requireMatch(bot, /interval '20 seconds'/, "backend MT5 freshness remains 20 seconds");
requireText(bot, "AS runner_online", "dashboard exposes VPS Server online state");
requireText(bot, "interval '30 seconds') runner_online", "slot list uses canonical Cloud Server health window");

// Pass 3: SSE receives its own long-lived, unbuffered proxy while EA heartbeat keeps short timeouts.
requireMatch(
  nginx,
  /location = \/backend\/api\/realtime\/events \{[\s\S]*proxy_buffering off;[\s\S]*proxy_cache off;[\s\S]*proxy_send_timeout 10m;[\s\S]*proxy_read_timeout 10m;/,
  "dedicated SSE proxy"
);
requireMatch(
  nginx,
  /location = \/backend\/api\/ea\/heartbeat \{[\s\S]*proxy_connect_timeout 3s;[\s\S]*proxy_send_timeout 8s;[\s\S]*proxy_read_timeout 8s;/,
  "EA heartbeat short proxy timeouts remain unchanged"
);

// Pass 4: every relay heartbeat owns a unique file pair and stale completion cannot delete a newer request.
requireText(ea, 'string relayTag=chartTag+"-"+requestId;', "EA unique heartbeat relay tag");
requireText(ea, 'string requestFile="scenova-hb-"+relayTag+".request.txt";', "EA unique heartbeat request path");
requireText(relay, "HeartbeatRequestMaxAge = TimeSpan.FromSeconds(15)", "relay stale request cleanup");
requireText(relay, "DeleteRequestIfUnchanged(requestPath, requestId);", "relay compare-before-delete guard");
requireText(relay, "RunHeartbeatRelayLoopAsync", "heartbeat relay has an isolated loop");
requireText(relay, "RunRuntimeEventRelayLoopAsync", "runtime events have a separate loop");
requireText(relay, "HeartbeatRelayTimeout = TimeSpan.FromSeconds(3)", "heartbeat relay request is bounded");
requireMatch(
  relay,
  /Task\.WhenAll\([\s\S]*ProcessHeartbeatAsync\(instancePath, cancellationToken\)/,
  "instances relay heartbeats concurrently"
);
requireMatch(
  relay,
  /scenova-hb-\*\.request\.txt[\s\S]*OrderByDescending\(File\.GetLastWriteTimeUtc\)[\s\S]*FirstOrDefault\(\)/,
  "heartbeat relay prioritizes only the newest request"
);

// Pass 5: Worker liveness is independent from the sequential command/provisioning loop.
requireText(worker, "private async Task RunHeartbeatLoopAsync", "dedicated Worker heartbeat loop");
requireText(worker, "var heartbeatTask = RunHeartbeatLoopAsync(backgroundCts.Token);", "heartbeat background task");
requireText(worker, "HeartbeatInterval = TimeSpan.FromSeconds(10)", "10 second heartbeat cadence");
requireText(worker, "HeartbeatRequestTimeout = TimeSpan.FromSeconds(8)", "bounded heartbeat request");
const mainLoop = worker.split("private async Task RunHeartbeatLoopAsync")[0];
rejectMatch(mainLoop, /PostAsync\("heartbeat"/, "main work loop must not own heartbeat anymore");

// Pass 6: only known database races become 409; unknown failures still propagate.
requireMatch(
  bot,
  /code === "55000"[\s\S]*runtime migration is active for this bot instance[\s\S]*new ConflictException/,
  "runtime migration START race maps to 409"
);
requireMatch(
  bot,
  /code === "P0001"[\s\S]*SCENOVA_MAINTENANCE_BLOCKS_START[\s\S]*SCENOVA_MAINTENANCE_BLOCKS_START_COMMAND[\s\S]*new ConflictException/,
  "maintenance START race maps to 409"
);
requireMatch(
  bot,
  /const mappedConflict = this\.mapStartDatabaseConflict\(error\);[\s\S]*if \(mappedConflict\) throw mappedConflict;[\s\S]*throw error;/,
  "unexpected START errors remain true errors"
);

console.log("PASS 7 control-plane regression contract PASS");
