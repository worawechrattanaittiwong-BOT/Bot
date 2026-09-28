import fs from "node:fs";

const ea = fs.readFileSync("mt5/FastBasketBot.mq5", "utf8");
const release = fs.readFileSync("apps/api/src/release-version.ts", "utf8");

function requireText(needle, label) {
  if (!ea.includes(needle)) throw new Error("Pass 7.1 missing: " + label);
}
function requireMatch(pattern, label) {
  if (!pattern.test(ea)) throw new Error("Pass 7.1 missing: " + label);
}
function rejectMatch(pattern, label) {
  if (pattern.test(ea)) throw new Error("Pass 7.1 violated: " + label);
}

const propertyVersion = ea.match(/#property\s+version\s+"([^"]+)"/)?.[1];
const runtimeVersion = ea.match(/#define\s+SCENOVA_EA_VERSION\s+"([^"]+)"/)?.[1];
const promotedVersion = release.match(/DEFAULT_EA_VERSION\s*=\s*"([^"]+)"/)?.[1];
if (!propertyVersion || !runtimeVersion || !promotedVersion)
  throw new Error("Pass 7.1 missing: EA release version metadata");
if (propertyVersion !== runtimeVersion || runtimeVersion !== promotedVersion)
  throw new Error("Pass 7.1 violated: EA source/runtime/promoted versions must match");
requireText("#define CLOUD_RELAY_PENDING_CODE -5902", "explicit pending transport state");
requireText("bool   g_cloudHeartbeatPending = false;", "persistent relay pending state");
requireText("g_cloudHeartbeatStartedMs=GetTickCount64();", "request start timestamp");
requireText("return CLOUD_RELAY_PENDING_CODE;", "non-blocking pending return");
requireText("if(InpCloudRelay && code==CLOUD_RELAY_PENDING_CODE)", "pending bypasses heartbeat failure logic");
requireText("if(InpCloudRelay && g_cloudHeartbeatPending)", "timer recognizes pending relay response");
requireText("CloudRelayHeartbeatResultReady()", "pending response has a lightweight readiness check");
requireText("if(CloudRelayHeartbeatResultReady())", "pending response is polled without spin-wait");
requireMatch(
  /if\(InpCloudRelay && g_cloudHeartbeatPending\)[\s\S]*CloudRelayHeartbeatResultReady\(\)[\s\S]*RefreshChartStatus\(\);[\s\S]*return;/,
  "pending Cloud heartbeat stops the rest of the timer pass"
);
requireMatch(
  /SendHeartbeat\(\);[\s\S]*networkUsed=true;[\s\S]*if\(InpCloudRelay && g_cloudHeartbeatPending\)[\s\S]*return;/,
  "new asynchronous heartbeat request returns before heavy timer work"
);
requireText("g_lastHeartbeatLatencyMs = InpCloudRelay", "relay latency remains measured from request start");

const start = ea.indexOf("int CloudRelayHeartbeat(string payload,string &response,int timeoutMs)");
const end = ea.indexOf("\nint HttpPostJsonTimeout(", start);
if (start < 0 || end < 0) throw new Error("Pass 7.1: CloudRelayHeartbeat bounds missing");
const relay = ea.slice(start, end);

if (/\bwhile\s*\(/.test(relay))
  throw new Error("Pass 7.1 violated: CloudRelayHeartbeat must not spin-wait");
if (/Sleep\s*\(\s*25\s*\)/.test(relay))
  throw new Error("Pass 7.1 violated: CloudRelayHeartbeat must not sleep waiting for Worker");
requireMatch(/FileWriteString\(out,requestId\+"\\r\\n"\+payload\)[\s\S]*g_cloudHeartbeatPending=true[\s\S]*return CLOUD_RELAY_PENDING_CODE;/, "request is written then returns immediately");
requireMatch(/FileIsExist\(g_cloudHeartbeatResponseFile\)[\s\S]*responseId==g_cloudHeartbeatRequestId/, "response keeps requestId validation");
requireMatch(/pendingAgeMs<\(ulong\)pendingWaitMs[\s\S]*CLOUD_RELAY_PENDING_CODE[\s\S]*g_lastHttpTransportError=5901/, "original bounded timeout/failure path remains");

console.log("PASS 7.1 non-blocking Cloud heartbeat contract PASS");
