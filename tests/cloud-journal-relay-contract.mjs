import fs from "node:fs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

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
assert.match(
  ea,
  /performanceClockDiagnostics=StringFormat\([\s\S]*?brokerDayStart[\s\S]*?brokerUtcOffsetSeconds/,
  "EA heartbeat must publish the exact broker-day clock used by Performance reconciliation"
);
assert.match(
  ea,
  /journalTimeDiagnostics=StringFormat\([\s\S]*?dealTimeMsc[\s\S]*?brokerUtcOffsetSeconds/,
  "EA journal must persist immutable MT5 deal time and broker UTC offset"
);
assert.match(ea, /bool ReplayTodayTradeJournal\(\)/, "EA must implement current-day journal replay");
assert.match(ea, /datetime from=BrokerDayStart\(\);[\s\S]*?HistorySelect\(from,to\)/,
  "Current-day replay must be limited to the broker day only");
assert.match(ea, /if\(closeConfirmed && commandCanAck\)[\s\S]*?AckCommand\(commandId\)/,
  "Replay command must only ACK after durable journal persistence succeeds");

const eaVersion = ea.match(/#define SCENOVA_EA_VERSION "([^"]+)"/)?.[1];
const apiEaVersion = release.match(/DEFAULT_EA_VERSION = "([^"]+)"/)?.[1];
assert.equal(eaVersion, apiEaVersion, "EA source and API promoted EA version must match");

// Build MT5 EA publishes EX5 + manifest only after the source commit reaches
// main. During an EA source PR, the checked-in artifact legitimately remains
// the previous internally-consistent release. Mirror release-version-consistency
// instead of forcing a fake manifest version onto the old EX5.
let eaSourceChanged = false;
try {
  const changed = execFileSync(
    "git",
    ["diff", "--name-only", "HEAD^", "HEAD", "--", "mt5/FastBasketBot.mq5", "mt5/include"],
    { encoding: "utf8" }
  );
  eaSourceChanged = changed
    .split(/\r?\n/)
    .some((path) => /^mt5\/(FastBasketBot\.mq5|include\/)/.test(path));
} catch {
  eaSourceChanged = false;
}
if (eaManifest.eaVersion !== eaVersion) {
  assert.equal(
    eaSourceChanged,
    true,
    "Published EA artifact manifest may lag only on an EA source change awaiting the dedicated builder"
  );
  console.log(
    `EA artifact publication pending: source=${eaVersion} manifest=${eaManifest.eaVersion}`
  );
}

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
assert.doesNotMatch(
  performancePage,
  /กำลังซิงก์ประวัติ Deal จาก MT5/,
  "Performance recovery must stay background-only and must not block the live analytics UI"
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
  /legacyTimingCompatible[\s\S]*?journalReconciliationGap[\s\S]*?legacyUntimedRowsInsideBrokerDay/,
  "Reconciled legacy Cloud journals may use same-broker-day receive time until immutable MT5 timestamps are backfilled"
);
assert.match(
  performanceApi,
  /event_at/,
  "Performance analytics must reconstruct replayed deals from immutable MT5 event time"
);
assert.match(
  performancePage,
  /const detailedStatsReliable = true;/,
  "Performance UI must render the latest available live analytics without a journal reliability gate"
);
assert.match(
  performancePage,
  /const detailValue=\(value:string\)=>value;/,
  "Performance UI must pass through available detail values while recovery continues in the background"
);

console.log("Cloud durable journal relay contract PASS");
