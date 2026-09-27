import fs from "node:fs";

const ea = fs.readFileSync("mt5/FastBasketBot.mq5", "utf8");

function requireText(needle, label) {
  if (!ea.includes(needle)) throw new Error("Pass 7.1 missing: " + label);
}
function requireMatch(pattern, label) {
  if (!pattern.test(ea)) throw new Error("Pass 7.1 missing: " + label);
}
function rejectMatch(pattern, label) {
  if (pattern.test(ea)) throw new Error("Pass 7.1 violated: " + label);
}

requireText('#property version   "1.0.88"', "EA version bump");
requireText('#define SCENOVA_EA_VERSION "1.0.88"', "runtime version bump");
requireText("#define CLOUD_RELAY_PENDING_CODE -5902", "explicit pending transport state");
requireText("bool   g_cloudHeartbeatPending = false;", "persistent relay pending state");
requireText("g_cloudHeartbeatStartedMs=GetTickCount64();", "request start timestamp");
requireText("return CLOUD_RELAY_PENDING_CODE;", "non-blocking pending return");
requireText("if(InpCloudRelay && code==CLOUD_RELAY_PENDING_CODE)", "pending bypasses heartbeat failure logic");
requireText("if(InpCloudRelay && g_cloudHeartbeatPending)", "flat timer pumps pending response");
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
