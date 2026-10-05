import fs from "node:fs";

function assertContains(path, needle, message) {
  const text = fs.readFileSync(path, "utf8");
  if (!text.includes(needle)) {
    throw new Error(message + " (missing: " + needle + ")");
  }
}

const ea = "mt5/FastBasketBot.mq5";
const swing = "mt5/include/AutoSwingFilterV22.mqh";

assertContains(ea, "#define AUTO_FIRST_ENTRY_START_WARMUP_SECONDS 12", "AUTO first entry must not fire immediately after Start");
assertContains(ea, "#define AUTO_FIRST_ENTRY_STABLE_CONFIRM_SECONDS 5", "AUTO first entry must remain valid before execution");
assertContains(ea, "#define AUTO_FIRST_ENTRY_MIN_NET_RR 1.20", "AUTO first entry must enforce minimum net RR");
assertContains(ea, "AUTO_FIRST_DIRECTION_AMBIGUOUS", "AUTO must support a genuine no-trade state when direction is ambiguous");
assertContains(ea, "AUTO_FIRST_FRESH_CONFIRM_ARMED", "AUTO must arm fresh confirmation after Start");
assertContains(ea, "AUTO_FIRST_FRESH_CONFIRM_WAIT", "AUTO must wait for continuous fresh confirmation");
assertContains(ea, "selected.rr<AUTO_FIRST_ENTRY_MIN_NET_RR", "RR must be a hard first-entry gate");
assertContains(ea, "initialRiskPoints*AUTO_WRONG_DIRECTION_MIN_R", "Wrong-direction exit must ignore tiny adverse noise relative to initial SL");
assertContains(ea, "confirmations>=4", "Normal wrong-direction exit must require stronger multi-signal confirmation");

assertContains(swing, "AutoV22ExecutionConfirmationCount", "AUTO must count independent execution confirmations");
assertContains(swing, "int requiredExecutionConfirmations=isAdd ? 1 : 2;", "First entry must require two execution confirmations while adds keep existing behavior");
assertContains(swing, "AUTO_V22_WAIT_MULTI_EXEC_CONFIRM", "AUTO must expose multi-confirmation wait state");

console.log("AUTO first-entry quality + balanced-loss contract PASS");
