import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function must(condition, message) {
  if (!condition) {
    console.error("CENT CURRENCY CONTRACT FAILED:", message);
    process.exit(1);
  }
}

const ea = read("mt5/FastBasketBot.mq5");
const eaApi = read("apps/api/src/ea.controller.ts");
const botApi = read("apps/api/src/bot.controller.ts");
const perfApi = read("apps/api/src/performance-analytics.controller.ts");
const shareApi = read("apps/api/src/performance-actions.controller.ts");
const dashboard = read("apps/web/app/dashboard/page.tsx");
const dashboardEnhancements = read("apps/web/components/DashboardLiveEnhancements.tsx");
const performance = read("apps/web/app/performance/page.tsx");
const publicPerformance = read("apps/web/app/performance/[slug]/page.tsx");
const sharedPerformance = read("apps/web/app/shared-performance/[slug]/page.tsx");
const journalSchema = read("database/010_trade_journal.sql");
const currencyMigration = read("database/021_cent_account_currency_isolation.sql");
const deployHostinger = read("scripts/deploy-hostinger.sh");

must(
  ea.includes("AccountInfoString(ACCOUNT_CURRENCY)"),
  "EA heartbeat must report the broker-native account currency"
);

must(
  dashboard.includes("formatAccountMoney(metrics.balance,accountCurrency)") &&
  dashboard.includes("normalizeAccountCurrency(metrics.currency)"),
  "Dashboard must render money from MT5 currency"
);

must(
  !dashboard.includes('money-prefix">$') &&
  !dashboard.includes('"+$') &&
  !dashboard.includes('"$"+'),
  "Dashboard must not hardcode dollar money labels"
);

const integerKeysStart = dashboard.indexOf("const integerKeys = new Set([");
const integerKeysEnd = dashboard.indexOf("]);", integerKeysStart);
const integerKeysBlock = integerKeysStart >= 0 && integerKeysEnd > integerKeysStart
  ? dashboard.slice(integerKeysStart, integerKeysEnd)
  : "";
must(
  !integerKeysBlock.includes("racePerPositionProfitMoney"),
  "RACE per-position money target must preserve decimal account-currency values"
);

must(
  eaApi.includes("accountCurrencyReviewRequired") &&
  botApi.includes("accountCurrencyReviewRequired") &&
  eaApi.includes("firstNonUsdCurrency"),
  "Currency changes and first non-USD accounts must force settings review before Start"
);

must(
  botApi.includes("clean.accountCurrency = settingsCurrency") &&
  botApi.includes("clean.accountCurrencyReviewRequired = false") &&
  botApi.includes("moneyReviewKeys.every"),
  "Saving settings must stamp currency only after the full money review"
);

must(
  eaApi.includes("AND mt5_account_id=$2") &&
  botApi.includes("AND mt5_account_id=$2"),
  "EA intelligence and dashboard journal stats must be isolated by MT5 account"
);

must(
  eaApi.includes("ON CONFLICT(bot_instance_id,mt5_account_id,deal_ticket,event_type) DO NOTHING") &&
  journalSchema.includes("UNIQUE(bot_instance_id, mt5_account_id, deal_ticket, event_type)") &&
  currencyMigration.includes("trade_journal_instance_account_deal_event_key"),
  "Trade Journal deal identity must include MT5 account to avoid ticket collisions after rebind"
);

must(
  currencyMigration.includes("IF NOT EXISTS") &&
  currencyMigration.includes("pg_constraint"),
  "Cent account database migration must be safe to replay"
);

must(
  deployHostinger.includes("database/021_cent_account_currency_isolation.sql"),
  "Production deployment must apply the Cent account currency isolation migration"
);

must(
  perfApi.includes("WHERE mt5_account_id=$1") &&
  perfApi.includes("currencySummaries") &&
  perfApi.includes("curvesByCurrency") &&
  perfApi.includes("ORDER BY currency,u.user_code,a.account_number") &&
  !perfApi.includes("selected account has no bot instance"),
  "Performance analytics must remain account-scoped and preserve history after rebind"
);

must(
  shareApi.includes("WHERE mt5_account_id=$1") &&
  shareApi.includes("accountCurrency") &&
  !shareApi.includes("selected account has no bot instance"),
  "Shared live snapshots must remain account-scoped and work for historical MT5 accounts"
);

for (const [name, source] of [
  ["dashboard enhancements", dashboardEnhancements],
  ["performance", performance],
  ["public performance", publicPerformance],
  ["shared performance", sharedPerformance]
]) {
  must(
    !source.includes('"+$') &&
    !source.includes('"$"+') &&
    !source.includes("Max DD ($)"),
    name + " must not hardcode USD formatting"
  );
}

must(
  performance.includes("currencySummaries") &&
  performance.includes("หลายสกุลเงินจะแยกยอด"),
  "System Performance UI must not combine unlike currencies into one monetary total"
);

console.log("Cent/Standard account currency isolation contract: OK");
