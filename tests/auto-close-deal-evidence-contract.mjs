import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ea=readFileSync("mt5/FastBasketBot.mq5","utf8");
const api=readFileSync("apps/api/src/ea.controller.ts","utf8");
const release=readFileSync("apps/api/src/release-version.ts","utf8");
const start=ea.indexOf("bool PostTradeJournalDeal(ulong dealTicket)");
const end=ea.indexOf("bool ReplayTodayTradeJournal()",start);
assert.ok(start>=0&&end>start);
const journal=ea.slice(start,end);
assert.match(journal,/if\(isExit && journalControlMode=="AUTO" && StringLen\(payload\)>=1\)/);
for(const field of [
 "DEAL_REASON","DEAL_SL","DEAL_TP","DEAL_ORDER",
 "autoExitDealReason","autoExitDealReasonCode","autoExitBrokerSlPrice",
 "autoExitBrokerTpPrice","autoExitOrderTicket"
])assert.ok(journal.includes(field),"Missing broker evidence: "+field);
assert.match(journal,/HistoryDealGetInteger\(dealTicket,DEAL_REASON\)/);
assert.match(journal,/EnumToString\(\(ENUM_DEAL_REASON\)closeReasonCode\)/);
assert.match(journal,/HistoryDealGetDouble\(dealTicket,DEAL_SL\)/);
assert.match(journal,/HistoryDealGetDouble\(dealTicket,DEAL_TP\)/);
for(const field of ["autoExitDealReason","autoExitDealReasonCode","autoExitBrokerSlPrice","autoExitBrokerTpPrice","autoExitOrderTicket"])
 assert.ok(api.includes(field),"API must persist "+field);
assert.match(api,/journalControlMode === "AUTO" && eventType === "EXIT"/);
assert.match(api,/jsonb_strip_nulls\([\s\S]*'autoExitDealReason',EXCLUDED.metadata->'autoExitDealReason'/);
assert.match(api,/autoExitOrderTicket: \/\^\\d\+\$\//);
const version=ea.match(/#property version\s+"([^"]+)"/)?.[1];
assert.ok(/^\d+\.\d+\.\d+$/.test(version || ""), "EA must have a semantic release version");
assert.equal(ea.match(/#define SCENOVA_EA_VERSION "([^"]+)"/)?.[1],version);
assert.equal(release.match(/DEFAULT_EA_VERSION = "([^"]+)"/)?.[1],version);
const autoManage=ea.slice(ea.indexOf("bool AutoManageOpenBasket(double momentum)"),ea.indexOf("int AdaptiveEntryDirection(double momentum)"));
assert.match(autoManage,/AUTO realizes profit via its genuine broker TP/);
assert.doesNotMatch(autoManage,/CloseAllBasket\("AUTO_PROFIT/);
console.log("PASS: MT5 immutable AUTO close evidence, API persistence/replay, no trade-decision changes, release aligned");
