// Development-only entry, separate from Expo AppEntry. No API or authentication imports.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider, type ThemeMode } from "../src/theme";
import { type Approval, type MainTab, type Summary } from "../src/finance";
import { Frame } from "../src/ui";
import { ApprovalDetail, ApprovalList, Dashboard, FirstSetup, OwnerMoney, OwnerWithdraw, PinLogin, Settings } from "../src/screens";

const fixture: Summary = {
  paymentMode: "LIVE", omise: { configured: true, reachable: true, totalSatang: 128456000, transferableSatang: 84230000, minTransferSatang: 3000, maxTransferSatang: 5000000000 },
  commission: { pendingSatang: 12645000, availableSatang: 8240000, lockedSatang: 24890000, paidSatang: 31050000 },
  approvals: { requestedCount: 12, holdCount: 3, approvedCount: 2, waitingSatang: 24890000 },
  owner: { commissionLiabilitySatang: 45775000, reserveSatang: 1000000, safeWithdrawableSatang: 37455000 },
  recentOwnerTransfers: [{ id: "preview-1", amount_satang: 5000000, status: "PAID", created_at: "2026-09-23T03:40:00Z" }, { id: "preview-2", amount_satang: 12000000, status: "SUBMITTED", created_at: "2026-09-22T07:20:00Z" }],
};
const items: Approval[] = [
  { id: "demo-01", user_code: "SCN-00241", email: "member241@example.com", account_name: "บัญชีตัวอย่าง 01", amount_satang: 2450000, currency: "THB", status: "REQUESTED", created_at: "2026-09-24T02:24:00Z", risk_score: 12, risk_level: "LOW", approval_count: 0, approval_required: 1, bank_code: "KBANK", bank_name: "กสิกรไทย", masked_account: "•••-•-•2481-•", destination_status: "VERIFIED", shared_account_users: 1 },
  { id: "demo-02", user_code: "SCN-00832", email: "member832@example.com", account_name: "บัญชีตัวอย่าง 02", amount_satang: 8200000, currency: "THB", status: "HOLD", created_at: "2026-09-24T01:10:00Z", risk_score: 76, risk_level: "HIGH", approval_count: 0, approval_required: 2, bank_code: "SCB", bank_name: "ไทยพาณิชย์", masked_account: "•••-•-•9124-•", destination_status: "VERIFIED", shared_account_users: 2 },
  { id: "demo-03", user_code: "SCN-00713", email: "member713@example.com", account_name: "บัญชีตัวอย่าง 03", amount_satang: 1500000, currency: "THB", status: "APPROVED", created_at: "2026-09-23T07:00:00Z", risk_score: 8, risk_level: "LOW", approval_count: 1, approval_required: 1, bank_code: "BBL", bank_name: "กรุงเทพ", masked_account: "•••-•-•3782-•", destination_status: "VERIFIED", shared_account_users: 1 },
];
const query = new URLSearchParams(location.search);
function Preview() {
  const [mode, setMode] = useState<ThemeMode>(query.get("theme") === "light" ? "light" : "dark");
  const [screen, setScreen] = useState(query.get("screen") || "dashboard");
  const [selected, setSelected] = useState(items[0]);
  const state = query.get("state");
  const summary = state === "loading" ? null : state === "offline" ? { ...fixture, omise: { ...fixture.omise, reachable: false } } : state === "test" ? { ...fixture, paymentMode: "TEST" } : fixture;
  const error = state === "error" ? "โหลดข้อมูลล่าสุดไม่สำเร็จ กรุณาลองอีกครั้ง" : undefined;
  const common = { summary, error, refreshing: false, onRefresh: () => {} };
  const auth = screen === "pin" || screen === "setup";
  const tab = (screen === "detail" ? "approvals" : screen === "withdraw" ? "owner" : screen) as MainTab;
  const reject = async () => { throw new Error("ตัวอย่างหน้าจอ · ไม่ส่งรายการเงินจริง"); };
  let body;
  if (screen === "pin") body = <PinLogin onSetup={() => setScreen("setup")} onLogin={reject} />;
  else if (screen === "setup") body = <FirstSetup onBack={() => setScreen("pin")} onSubmit={reject} />;
  else if (screen === "approvals") body = <ApprovalList items={state === "loading" ? null : state === "empty" ? [] : items} loading={state === "loading"} error={error} onRefresh={() => {}} onOpen={item => { setSelected(item); setScreen("detail"); }} />;
  else if (screen === "detail") body = <ApprovalDetail item={selected} onBack={() => setScreen("approvals")} onAction={reject} />;
  else if (screen === "owner") body = <OwnerMoney {...common} onWithdraw={() => setScreen("withdraw")} />;
  else if (screen === "withdraw") body = <OwnerWithdraw summary={summary} stale={!!error} onBack={() => setScreen("owner")} onSubmit={reject} />;
  else if (screen === "settings") body = <Settings summary={summary} error={error} version="v1.0.0" update={null} updateBusy={false} onInstall={() => {}} onLock={() => setScreen("pin")} />;
  else body = <Dashboard {...common} updatedAt="2026-09-24T02:41:00Z" onApprovals={() => setScreen("approvals")} onWithdraw={() => setScreen("withdraw")} />;
  return <SafeAreaProvider><ThemeProvider mode={mode} setMode={setMode}><Frame auth={auth} tab={tab} onNavigate={["withdraw", "detail"].includes(screen) ? undefined : setScreen} count={12} onLock={auth ? undefined : () => setScreen("pin")}>{body}</Frame></ThemeProvider></SafeAreaProvider>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
