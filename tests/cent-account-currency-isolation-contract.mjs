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
const performance = read("apps/web/app/performance/page.tsx");
const publicPerformance = read("apps/web/app/performance/[slug]/page.tsx");
const sharedPerformance = read("apps/web/app/shared-performance/[slug]/page.tsx");

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

must(
  eaApi.includes("accountCurrencyReviewRequired") &&
  botApi.includes("accountCurrencyReviewRequired"),
  "Currency changes must force settings review before Start"
);
must(
  botApi.includes("clean.accountCurrency = settingsCurrency") &&
  botApi.includes("clean.accountCurrencyReviewRequired = false"),
  "Saving settings must stamp the current account currency and clear the review gate"
);

must(
  eaApi.includes("AND mt5_account_id=$2") &&
  botApi.includes("AND mt5_account_id=$2"),
  "EA intelligence and dashboard journal stats must be isolated by MT5 account"
);
must(
  perfApi.includes("AND mt5_account_id=$4") &&
  perfApi.includes("currencySummaries") &&
  perfApi.includes("curvesByCurrency"),
  "Performance analytics must isolate account history and split system money by currency"
);
must(
  shareApi.includes("AND mt5_account_id=$4") &&
  shareApi.includes('currency: String(metrics.currency || "USD")'),
  "Shared live snapshots must be scoped to the MT5 account and capture currency"
);

for (const [name, source] of [
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
