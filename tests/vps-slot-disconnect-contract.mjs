import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("apps/web/app/dashboard/page.tsx", "utf8");
const css = readFileSync("apps/web/app/globals.css", "utf8");
const bot = readFileSync("apps/api/src/bot.controller.ts", "utf8");
const handler = page.slice(page.indexOf("async function disconnectVpsSlotMt5("), page.indexOf("async function deleteVpsSlot("));
const manager = page.slice(page.indexOf("function VpsSlotManager("), page.indexOf("function MembershipCountdownCard("));
const reset = bot.slice(bot.indexOf('@Post("mt5/reset")'), bot.indexOf('@Post("mt5/cloud-credential")'));

assert(handler.length > 0, "Slot disconnect handler must exist");
assert(handler.includes("confirmPopup("), "Disconnect must require confirmation");
assert(handler.includes('"/bot/mt5/reset?slotId=" + encodeURIComponent(slotId)'), "Disconnect must target explicit Slot ID");
assert(handler.includes("result?.pendingCloudStop") && handler.includes("attempts < 45"), "Disconnect must wait for Cloud Worker stop confirmation");
assert(!handler.includes('"/bot/stop') && !handler.includes('"/bot/close-all'), "Disconnect must not trade or force-close positions");
assert(handler.includes("await load(slotId)"), "Refresh only target Slot after success");
assert(manager.includes("onDisconnect:(slotId:string)=>void"), "Every Slot must have an isolated callback");
assert(manager.includes('props.onDisconnect(String(slot.id))'), "Button must target its own Slot");
assert(manager.includes("Boolean(slot.can_control)"), "Button must require Slot control rights");
assert(manager.includes("props.disconnectingSlotId"), "Per-Slot pending state must be present");
assert(css.includes(".vps-slot-disconnect-btn"), "Compact disconnect button style is required");
assert(reset.includes('instance.actual_state === "RUNNING"') && reset.includes('instance.desired_state === "RUNNING"'), "RUNNING guard must remain");
assert(reset.includes("Number(instance.positions || 0) > 0"), "Open positions must block disconnect");
assert(reset.includes("Number(instance.pending_orders || 0) > 0"), "Pending orders must block disconnect");
assert(reset.includes("STOP_CONFIRMED") && reset.includes("pendingCloudStop"), "Cloud stop must be confirmed");
assert(reset.includes("DELETE FROM mt5_credentials"), "Old Cloud MT5 credentials must be revoked");
assert(reset.includes("mt5_account_id=NULL"), "Old MT5 must be unbound");
console.log("VPS Slot MT5 disconnect UI isolation + existing API safety contract: PASS");
