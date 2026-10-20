const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");

const path = "apps/web/lib/cloud-update-popup.ts";
const source = fs.readFileSync(path, "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const module_ = { exports: {} };
vm.runInNewContext(js, { module: module_, exports: module_.exports });
const { shouldSuppressOldCloudUpdateFailure: suppress } = module_.exports;

const job = {
  state: "FAILED",
  action: "UPDATE",
  target_version: "1.1.31",
  completed_at: "2026-10-20T07:00:00Z"
};
const ea = {
  connected: true,
  version: "v1.1.31",
  heartbeatAt: "2026-10-20T07:00:20Z"
};
const check = (j = {}, r = {}) => suppress({ ...job, ...j }, { ...ea, ...r });
assert.equal(check(), true, "A newer live EA heartbeat matching the release must dismiss the old modal");
assert.equal(check({ target_build_id: "different-build", target_runtime_contract: "different-contract" }), true,
  "A Build/Runtime mismatch is a separate safety warning, not a recurring historical FAILED popup");
assert.equal(check({ target_version: "1.1.32" }), false, "A different EA version must preserve FAILED visibility");
assert.equal(check({ state: "VERIFYING" }), false, "Active verification must remain visible");
assert.equal(check({ state: "WAITING_SAFE" }), false, "Pending update must remain visible");
assert.equal(check({ action: "ROLLBACK" }), false, "Never dismiss a failed ROLLBACK job automatically");
assert.equal(check({}, { connected: false }), false, "An offline runtime is not proof");
assert.equal(check({}, { version: "" }), false, "Missing heartbeat version is not proof");
assert.equal(check({}, { heartbeatAt: "2026-10-20T06:59:59Z" }), false, "Old heartbeat is not proof");
assert.equal(check({}, { heartbeatAt: "2026-10-20T07:00:00Z" }), false, "Equal-time heartbeat is not proof");
assert.equal(check({ completed_at: null }), false, "Missing failure completion timestamp is not proof");
assert.equal(check({ completed_at: "invalid" }), false, "Invalid timestamps fail closed");
assert.equal(suppress(null, ea), false);
assert.equal(suppress(job, null), false);
assert.equal(job.state, "FAILED", "Historical FAILED audit must remain intact");

const dashboard = fs.readFileSync("apps/web/app/dashboard/page.tsx", "utf8");
assert.match(dashboard, /shouldSuppressOldCloudUpdateFailure\(cloudUpdate,/);
assert.match(dashboard, /connected: isMt5Online/);
assert.match(dashboard, /version: data\?\.instance\?\.metrics\?\.eaVersion/);
assert.match(dashboard, /!staleCloudUpdateFailure/);
assert.match(dashboard, /softwareUpdate\.runtimeBuildMatch === false \? " · Build ไม่ตรง"/);
console.log("cloud-update-popup-visibility: PASS (historic failure popup / live version / risk isolation)");
