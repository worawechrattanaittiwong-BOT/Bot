const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { isRecoveredCloudUpdate } = require("../apps/api/dist/cloud-update-dashboard-status.js");

const job = Object.freeze({
  state: "FAILED",
  action: "UPDATE",
  target_version: "1.1.31",
  target_build_id: "build-3131",
  target_runtime_contract: "RACE_CONFIGURED_LOSS_ONLY_V1",
  completed_at: "2026-10-20T06:00:00Z"
});
const runtime = Object.freeze({
  mt5_online: true,
  last_seen_at: "2026-10-20T06:00:20Z",
  metrics: Object.freeze({
    eaVersion: "v1.1.31",
    buildId: "build-3131",
    runtimeContract: "RACE_CONFIGURED_LOSS_ONLY_V1"
  })
});
const check = (jobChange = {}, runtimeChange = {}) =>
  isRecoveredCloudUpdate({ ...job, ...jobChange }, { ...runtime, ...runtimeChange });
assert.equal(check(), true, "A fresh connected exact runtime should resolve a stale popup");
assert.equal(check({ state: "VERIFYING" }), false, "Never hide in-progress updates");
assert.equal(check({ state: "COMPLETED" }), false, "Only resolve old FAILED updates");
assert.equal(check({ action: "ROLLBACK" }), false, "A failed rollback is a separate incident");
assert.equal(check({ target_version: "1.1.32" }), false, "Version mismatch must stay visible");
assert.equal(check({ target_build_id: "build-3132" }), false, "Same version with wrong build must stay visible");
assert.equal(check({ target_build_id: null }), false, "Missing target build is not proof");
assert.equal(check({ target_runtime_contract: "OLD" }), false, "Runtime Contract mismatch must stay visible");
assert.equal(check({ target_runtime_contract: null }), false, "Missing contract is not proof");
assert.equal(check({ completed_at: "2026-10-20T06:00:20Z" }), false, "Old/equal heartbeat is not proof");
assert.equal(check({ completed_at: "2026-10-20T06:01:00Z" }), false, "Old heartbeat is not proof");
assert.equal(check({ completed_at: "invalid" }), false, "Invalid dates must fail closed");
assert.equal(check({}, { mt5_online: false }), false, "Offline runtime must never clear the popup");
assert.equal(check({}, { last_seen_at: null }), false, "Missing heartbeat must fail closed");
assert.equal(check({}, { metrics: { ...runtime.metrics, eaVersion: null } }), false, "Unknown version must fail closed");
assert.equal(check({}, { metrics: { ...runtime.metrics, buildId: null } }), false, "Unknown running build must fail closed");
assert.equal(check({}, { metrics: { ...runtime.metrics, runtimeContract: null } }), false, "Unknown runtime contract must fail closed");
assert.equal(isRecoveredCloudUpdate(null, runtime), false);
assert.equal(isRecoveredCloudUpdate(job, null), false);
assert.equal(job.state, "FAILED", "The original FAILED audit must not be changed");

const api = fs.readFileSync(path.resolve(__dirname, "../apps/api/src/bot.controller.ts"), "utf8");
const ui = fs.readFileSync(path.resolve(__dirname, "../apps/web/app/dashboard/page.tsx"), "utf8");
assert.match(api, /cloudUpdate: activeCloudUpdate/);
assert.match(api, /isRecoveredCloudUpdate\(cloudUpdate, instance\)/);
assert.match(api, /currentEaVersion = String\(instance\.metrics\?\.eaVersion/);
assert.match(ui, /softwareUpdate\.runtimeBuildMatch !== false/);
console.log("cloud-update-dashboard-status: PASS (fresh verified recovery and fail-closed cases)");
