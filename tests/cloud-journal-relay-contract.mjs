import fs from "node:fs";
import assert from "node:assert/strict";

const read = (path) => fs.readFileSync(path, "utf8");

const ea = read("mt5/FastBasketBot.mq5");
const relay = read("tools/windows-cloud-worker/Worker/CloudEaRelay.cs");
const client = read("tools/windows-cloud-worker/Worker/WorkerClient.cs");
const api = read("apps/api/src/ea.controller.ts");
const release = read("apps/api/src/release-version.ts");
const eaManifest = JSON.parse(read("mt5/release/manifest.json").replace(/^\uFEFF/, ""));
const workerLoop = read("tools/windows-cloud-worker/Worker/WorkerLoop.cs");
const workerProject = read("tools/windows-cloud-worker/Worker/ScenovaCloudWorker.csproj");
const cloudRelease = read("apps/api/src/cloud-server-release.ts");
const performanceApi = read("apps/api/src/performance-analytics.controller.ts");
const performancePage = read("apps/web/app/performance/page.tsx");

assert.match(ea, /bool PersistCloudJournalPayload\(/, "Cloud EA must persist journal payloads locally");
assert.match(ea, /scenova-journal-/, "Cloud EA must use a dedicated durable journal file queue");
assert.match(
  ea,
  /if\(InpCloudRelay\)[\s\S]*?PostTradeJournalDeal\(dealTicket\)/,
  "Cloud trade callback path must persist journal through local relay queue"
);
assert.match(
  ea,
  /if\(InpCloudRelay\)[\s\S]*?PersistCloudJournalPayload\([\s\S]*?isExit \? "EXIT" : "ENTRY"/,
  "Cloud journal post must switch from WebRequest to durable local file delivery"
);

assert.match(relay, /RunJournalRelayLoopAsync/, "Cloud Worker must run journal relay independently");
assert.match(relay, /ProcessJournalEventsAsync/, "Cloud Worker must process journal queue files");
assert.match(relay, /scenova-journal-\*\.request\.txt/, "Cloud Worker must scan durable journal files");
assert.match(relay, /statusCode >= 200 && statusCode < 300[\s\S]*?File\.Delete\(journalPath\)/,
  "Worker must delete journal files only after API success");
assert.match(relay, /\.failed\.txt/, "Permanent journal failures must be quarantined, not discarded");
assert.match(client, /RelayEaJournalAsync/, "Worker client must expose EA journal relay");
assert.match(client, /\/api\/ea\/journal/, "Journal relay must use the existing idempotent EA journal endpoint");

assert.match(
  api,
  /ON CONFLICT\(bot_instance_id,mt5_account_id,deal_ticket,event_type\) DO UPDATE[\s\S]*?dealTimeMsc[\s\S]*?brokerUtcOffsetSeconds/,
  "EA journal replay must stay idempotent while enriching immutable MT5 deal timing"
);

assert.match(ea, /JOURNAL_REPLAY_TODAY/, "EA must support a targeted current-day journal replay command");
assert.match(ea, /\\\"brokerDayStart\\\":%I64d,\\\"brokerUtcOffsetSeconds\\\":%I64d/,
  "EA heartbeat must publish the exact broker-day clock used by Performance reconciliation");
assert.match(ea, /\\\"dealTimeMsc\\\":%I64d,\\\"brokerUtcOffsetSeconds\\\":%I64d/,
  "EA journal must persist immutable MT5 deal time and broker UTC offset");
assert.match(ea, /bool ReplayTodayTradeJournal\(\)/, "EA must implement current-day journal replay");
assert.match(ea, /datetime from=BrokerDayStart\(\);[\s\S]*?HistorySelect\(from,to\)/,
  "Current-day replay must be limited to the broker day only");
assert.match(ea, /if\(closeConfirmed && commandCanAck\)[\s\S]*?AckCommand\(commandId\)/,
  "Replay command must only ACK after durable journal persistence succeeds");

const eaVersion = ea.match(/#define SCENOVA_EA_VERSION "([^"]+)"/)?.[1];
const apiEaVersion = release.match(/DEFAULT_EA_VERSION = "([^"]+)"/)?.[1];
assert.equal(eaVersion, apiEaVersion, "EA source and API promoted EA version must match");
assert.equal(eaManifest.eaVersion, eaVersion, "Published EA artifact manifest must match EA source version");

const workerVersion = workerLoop.match(/Version = "([^"]+)"/)?.[1];
const workerProjectVersion = workerProject.match(/<Version>([^<]+)<\/Version>/)?.[1];
const promotedWorkerVersion = cloudRelease.match(/workerVersion: "([^"]+)"/)?.[1];
assert.equal(workerVersion, workerProjectVersion, "Worker source and project version must match");
assert.equal(workerVersion, promotedWorkerVersion, "Worker source and promoted Cloud release must match");

assert.match(
  performanceApi,
  /detailedStatsReliable/,
  "Performance API must flag incomplete journal-derived detail"
);
assert.match(
  performanceApi,
  /JOURNAL_INCOMPLETE/,
  "Performance API must expose journal quality state"
);
assert.match(
  performanceApi,
  /String\(account\.mode \|\| ""\)\.toUpperCase\(\) === "CLOUD"[\s\S]*?JOURNAL_REPLAY_TODAY/,
  "Incomplete VPS performance must reuse the existing MT5 journal replay command"
);
assert.match(
  performanceApi,
  /command='JOURNAL_REPLAY_TODAY'[\s\S]*?90_000/,
  "VPS journal recovery must deduplicate replay commands with a worker-drain cooldown"
);
assert.match(
  performancePage,
  /JOURNAL_RECOVERING/,
  "Performance UI must poll while VPS journal replay is recovering detail"
);
assert.match(
  performancePage,
  /กำลังซิงก์ประวัติ Deal จาก MT5/,
  "Performance recovery must explain temporary detail suppression while replay is running"
);
assert.match(
  performanceApi,
  /metadata\?\.executedByBot !== false/,
  "MT5 reconciliation must compare bot-executed journal deals and keep manual closes in actual performance"
);
assert.match(
  performanceApi,
  /PERFORMANCE_RECONCILED/,
  "Completed performance reconciliation must retire stale VPS replay commands"
);
assert.match(
  performanceApi,
  /MT5_BROKER_DAY/,
  "Performance reconciliation must use the MT5 broker-day clock when available"
);
assert.match(
  performanceApi,
  /event_at/,
  "Performance analytics must reconstruct replayed deals from immutable MT5 event time"
);
assert.match(
  performancePage,
  /const detailValue=.*detailedStatsReliable/,
  "Performance UI must suppress unreliable detailed metrics"
);

console.log("Cloud durable journal relay contract PASS");
