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
requireMatch(bot, /interval '20 seconds'/, "backend MT5 freshness remains 20 seconds");

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
