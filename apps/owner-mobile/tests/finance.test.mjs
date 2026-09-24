import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { fileURLToPath } from "node:url";
const output = buildSync({ entryPoints: [fileURLToPath(new URL("../src/finance.ts", import.meta.url))], bundle: true, write: false, format: "esm", platform: "node" }).outputFiles[0].text;
const { amountLabel, parseBaht, canWithdraw, withdrawLimit, systemStatus } = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
const summary = { paymentMode: "LIVE", omise: { configured: true, reachable: true, minTransferSatang: 3000, maxTransferSatang: 500000 }, owner: { safeWithdrawableSatang: 1000000 } };
test("THB input uses exact satang and rejects ambiguous or invalid values", () => {
  assert.equal(parseBaht("1234.56"), 123456); assert.equal(parseBaht("0.29"), 29);
  for (const value of ["", "0", "-1", "1.234", "1.2.3", "1e4", "Infinity", "NaN", "9007199254740991"]) assert.equal(parseBaht(value), null, value);
});
test("unknown amounts are unavailable, actual zero balances remain visible", () => {
  assert.equal(amountLabel(undefined), "—"); assert.equal(amountLabel(NaN), "—"); assert.equal(amountLabel(0), "0.00");
});
test("withdraw requires PIN, connectivity, minimum and both maximums", () => {
  assert.equal(withdrawLimit(summary), 500000);
  assert.equal(canWithdraw(summary, 3000, "123456"), true);
  for (const amount of [null, NaN, 2999, 500001]) assert.equal(canWithdraw(summary, amount, "123456"), false);
  assert.equal(canWithdraw(summary, 3000, "abcdef"), false);
  assert.equal(canWithdraw({ ...summary, omise: { ...summary.omise, reachable: false } }, 3000, "123456"), false);
  assert.equal(canWithdraw({ ...summary, omise: { ...summary.omise, configured: false } }, 3000, "123456"), false);
  assert.equal(canWithdraw({ ...summary, owner: { safeWithdrawableSatang: 2000 } }, 3000, "123456"), false);
});
test("System never reports success for loading, stale, test or disconnected data", () => {
  assert.equal(systemStatus(summary).tone, "success");
  for (const value of [null, { ...summary, paymentMode: "TEST" }, { ...summary, omise: { configured: false } }, { ...summary, omise: { configured: true, reachable: false } }]) assert.notEqual(systemStatus(value).tone, "success");
  assert.notEqual(systemStatus(summary, true).tone, "success");
});
