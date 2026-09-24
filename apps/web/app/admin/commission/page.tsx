"use client";

import { useEffect, useState } from "react";
import { OwnerMobileNav, OwnerSidebar } from "../../../components/OwnerSidebar";
import { ScenovaBrand } from "../../../components/ScenovaBrand";
import { useSystemPopup } from "../../../components/SystemPopupProvider";
import { adminApi } from "../../../lib/api";
import s from "./page.module.css";

type Withdrawal = {
  id: string;
  user_id: string;
  user_code: string;
  email: string;
  amount_satang: number;
  currency: string;
  status: string;
  review_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  paid_at: string | null;
  payout_reference: string | null;
  created_at: string;
  destination_id: string;
  bank_code: string;
  bank_name: string;
  account_name: string;
  account_last4: string;
  masked_account: string;
  destination_status: string;
  usable_at: string;
  shared_account_users: number;
};

type Dashboard = {
  settings: {
    requestsEnabled: boolean;
    minAmountSatang: number;
    maxAmountSatang: number;
    destinationCooldownHours: number;
    updatedBy: string | null;
    updatedAt: string | null;
  };
  summary: {
    requestedCount: number;
    holdCount: number;
    approvedCount: number;
    paidCount: number;
    lockedSatang: number;
    paidSatang: number;
  };
  items: Withdrawal[];
  audit: Array<{
    id: number;
    user_code: string | null;
    actor_type: string;
    actor_label: string | null;
    event_type: string;
    metadata: any;
    created_at: string;
  }>;
};

function money(satang: number) {
  return (Number(satang || 0) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + " THB";
}

function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("th-TH") : "—";
}

export default function AdminCommissionPage() {
  const { confirmPopup } = useSystemPopup();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState<Record<string,string>>({});
  const [references, setReferences] = useState<Record<string,string>>({});
  const [revealed, setRevealed] = useState<Record<string,string>>({});
  const [verification, setVerification] = useState({
    currentPassword: "",
    twoFactorCode: ""
  });
  const [settingsForm, setSettingsForm] = useState({
    requestsEnabled: true,
    minThb: "100",
    maxThb: "50000",
    cooldownHours: "24"
  });

  useEffect(() => {
    if (!localStorage.getItem("bot_token")) {
      window.location.href = "/login";
      return;
    }
    void load();
  }, []);

  function logout() {
    localStorage.removeItem("bot_token");
    window.location.href = "/login";
  }

  async function load() {
    setLoading(true);
    try {
      const next: Dashboard = await adminApi("/admin/commission-withdrawals");
      setData(next);
      setSettingsForm({
        requestsEnabled: next.settings.requestsEnabled,
        minThb: String(next.settings.minAmountSatang / 100),
        maxThb: String(next.settings.maxAmountSatang / 100),
        cooldownHours: String(next.settings.destinationCooldownHours)
      });
      setMessage("");
    } catch (error: any) {
      setMessage(String(error?.message || "โหลด Withdrawal Center ไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setBusy("settings");
    setMessage("");
    try {
      await adminApi("/admin/commission-withdrawals/settings", {
        method: "PATCH",
        body: JSON.stringify({
          requestsEnabled: settingsForm.requestsEnabled,
          minAmountSatang: Math.round(Number(settingsForm.minThb || 0) * 100),
          maxAmountSatang: Math.round(Number(settingsForm.maxThb || 0) * 100),
          destinationCooldownHours: Math.trunc(Number(settingsForm.cooldownHours || 0))
        })
      });
      setMessage("บันทึก Withdrawal Settings แล้ว");
      await load();
    } catch (error: any) {
      setMessage(String(error?.message || "บันทึก Settings ไม่สำเร็จ"));
    } finally {
      setBusy("");
    }
  }

  async function review(item: Withdrawal, action: "hold" | "approve" | "reject") {
    if (busy) return;
    if (action === "reject") {
      const confirmed = await confirmPopup({
        title: "Reject withdrawal",
        message: `Reject ${item.user_code} · ${money(item.amount_satang)} และคืนยอดเข้า Available?`,
        confirmLabel: "Reject & Unlock",
        cancelLabel: "Cancel",
        tone: "warning"
      });
      if (!confirmed) return;
    }
    setBusy(item.id + action);
    setMessage("");
    try {
      await adminApi(`/admin/commission-withdrawals/${item.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ reason: notes[item.id] || "" })
      });
      setMessage(`${action.toUpperCase()} ${item.user_code} สำเร็จ`);
      await load();
    } catch (error: any) {
      setMessage(String(error?.message || "ดำเนินการไม่สำเร็จ"));
    } finally {
      setBusy("");
    }
  }

  async function revealAccount(item: Withdrawal) {
    if (busy) return;
    setBusy(item.id + "reveal");
    setMessage("");
    try {
      const result = await adminApi(
        "/admin/commission-withdrawals/destinations/" + item.destination_id + "/reveal",
        {
          method: "POST",
          body: JSON.stringify(verification)
        }
      );
      setRevealed(current => ({ ...current, [item.id]: result.accountNumber }));
      window.setTimeout(() => {
        setRevealed(current => {
          const next = { ...current };
          delete next[item.id];
          return next;
        });
      }, 60_000);
      setMessage("เปิดเลขบัญชีชั่วคราว 60 วินาที และบันทึก Audit แล้ว");
    } catch (error: any) {
      setMessage(String(error?.message || "Reveal ไม่สำเร็จ"));
    } finally {
      setBusy("");
    }
  }

  async function markPaid(item: Withdrawal) {
    if (busy) return;
    const reference = String(references[item.id] || "").trim();
    const confirmed = await confirmPopup({
      title: "Mark withdrawal as paid",
      message: `ยืนยันว่าได้โอน ${money(item.amount_satang)} ให้ ${item.user_code} แล้ว?`,
      confirmLabel: "Mark Paid",
      cancelLabel: "Cancel",
      tone: "warning"
    });
    if (!confirmed) return;

    setBusy(item.id + "paid");
    setMessage("");
    try {
      await adminApi("/admin/commission-withdrawals/" + item.id + "/paid", {
        method: "POST",
        body: JSON.stringify({
          payoutReference: reference,
          currentPassword: verification.currentPassword,
          twoFactorCode: verification.twoFactorCode
        })
      });
      setVerification({ currentPassword: "", twoFactorCode: "" });
      setMessage("Mark Paid สำเร็จ · Locked balance ถูกย้ายเป็น Withdrawn");
      await load();
    } catch (error: any) {
      setMessage(String(error?.message || "Mark Paid ไม่สำเร็จ"));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="app-wrap owner-app">
      <OwnerSidebar activeKey="commission-withdrawals" onLogout={logout}/>
      <main className={`main app-main owner-main ${s.shellMain}`}>
        <div className={s.root}>
          <div className="mobile-only mobile-app-head">
            <div className="brand-lockup scenova-brand-lockup">
              <ScenovaBrand className="scenova-brand-logo-mobile"/>
            </div>
            <button className="btn ghost" onClick={logout}>ออก</button>
          </div>
          <OwnerMobileNav activeKey="commission-withdrawals"/>

          <header className={s.header}>
            <div>
              <span className={s.kicker}>SCENOVA / FINANCIAL CONTROL</span>
              <h1>Commission & Withdrawal Center</h1>
              <p>ตรวจคำขอถอน, Lock balance, Approve / Hold / Reject และ Mark Paid จากหน้าเดียว</p>
            </div>
            <span className={data?.settings.requestsEnabled ? s.openBadge : s.pauseBadge}>
              <i/> {data?.settings.requestsEnabled ? "REQUESTS OPEN" : "WITHDRAWALS PAUSED"}
            </span>
          </header>

          {message && <div className={s.notice}>{message}</div>}

          <section className={s.summaryGrid}>
            <article><span>Requested</span><b>{data?.summary.requestedCount || 0}</b><small>รอตรวจสอบ</small></article>
            <article><span>On Hold</span><b>{data?.summary.holdCount || 0}</b><small>ต้องตรวจเพิ่มเติม</small></article>
            <article><span>Approved</span><b>{data?.summary.approvedCount || 0}</b><small>รอ Mark Paid</small></article>
            <article><span>Locked</span><b>{money(data?.summary.lockedSatang || 0)}</b><small>เงินที่ถูกกันไว้</small></article>
            <article><span>Total Paid</span><b>{money(data?.summary.paidSatang || 0)}</b><small>Phase 2 payouts</small></article>
          </section>

          <section className={s.controlGrid}>
            <div className={s.controlCard}>
              <div className={s.cardHead}>
                <div><span className={s.kicker}>GLOBAL SETTINGS</span><h2>Withdrawal Rules</h2></div>
                <label className={s.switchLine}>
                  <input type="checkbox" checked={settingsForm.requestsEnabled} onChange={event=>setSettingsForm(v=>({...v,requestsEnabled:event.target.checked}))}/>
                  รับคำขอถอน
                </label>
              </div>
              <div className={s.settingsFields}>
                <label><span>Minimum THB</span><input value={settingsForm.minThb} onChange={event=>setSettingsForm(v=>({...v,minThb:event.target.value}))}/></label>
                <label><span>Maximum THB</span><input value={settingsForm.maxThb} onChange={event=>setSettingsForm(v=>({...v,maxThb:event.target.value}))}/></label>
                <label><span>Cooling Hours</span><input value={settingsForm.cooldownHours} onChange={event=>setSettingsForm(v=>({...v,cooldownHours:event.target.value}))}/></label>
                <button type="button" className={s.primary} disabled={busy==="settings"} onClick={()=>void saveSettings()}>
                  {busy==="settings" ? "Saving..." : "Save Rules"}
                </button>
              </div>
            </div>

            <div className={s.controlCard}>
              <div className={s.cardHead}>
                <div><span className={s.kicker}>ADMIN STEP-UP</span><h2>Reveal / Mark Paid</h2></div>
                <span className={s.securityTag}>PASSWORD + 2FA</span>
              </div>
              <div className={s.verifyFields}>
                <label><span>Current Password</span><input type="password" value={verification.currentPassword} onChange={event=>setVerification(v=>({...v,currentPassword:event.target.value}))} autoComplete="current-password"/></label>
                <label><span>2FA Code</span><input value={verification.twoFactorCode} onChange={event=>setVerification(v=>({...v,twoFactorCode:event.target.value}))} maxLength={6} inputMode="numeric" placeholder="6 digits"/></label>
              </div>
              <p>เลขบัญชีเต็มจะแสดงชั่วคราว 60 วินาที ทุกการ Reveal ถูกบันทึก Audit</p>
            </div>
          </section>

          <div className={s.sectionHead}>
            <div><span className={s.kicker}>MANUAL REVIEW QUEUE</span><h2>Withdrawal Requests</h2></div>
            <span>{loading ? "LOADING" : `${data?.items.length || 0} ITEMS`}</span>
          </div>

          <section className={s.queue}>
            {data?.items.map(item=>(
              <article className={s.withdrawalCard} key={item.id}>
                <div className={s.rowTop}>
                  <div>
                    <span className={s.userCode}>{item.user_code}</span>
                    <b>{money(item.amount_satang)}</b>
                    <small>{item.email}</small>
                  </div>
                  <span className={s.statusBadge}>{item.status}</span>
                </div>

                <div className={s.bankBox}>
                  <div>
                    <span>{item.bank_name}</span>
                    <b>{item.account_name}</b>
                    <code>{revealed[item.id] || item.masked_account}</code>
                  </div>
                  <div>
                    <small>Requested</small><span>{dateTime(item.created_at)}</span>
                    <small>Shared account users</small>
                    <span className={item.shared_account_users>1 ? s.riskText : ""}>{item.shared_account_users}</span>
                  </div>
                </div>

                <input
                  className={s.noteInput}
                  value={notes[item.id] || ""}
                  onChange={event=>setNotes(v=>({...v,[item.id]:event.target.value}))}
                  placeholder="Review note / Reject reason"
                />

                {item.status === "APPROVED" && (
                  <input
                    className={s.noteInput}
                    value={references[item.id] || ""}
                    onChange={event=>setReferences(v=>({...v,[item.id]:event.target.value}))}
                    placeholder="Transfer / Payment Reference"
                  />
                )}

                <div className={s.actions}>
                  <button type="button" onClick={()=>void revealAccount(item)} disabled={Boolean(busy)}>Reveal</button>
                  {["REQUESTED","HOLD"].includes(item.status) && (
                    <>
                      <button type="button" onClick={()=>void review(item,"hold")} disabled={Boolean(busy)}>Hold</button>
                      <button type="button" className={s.approveButton} onClick={()=>void review(item,"approve")} disabled={Boolean(busy)}>Approve</button>
                    </>
                  )}
                  {["REQUESTED","HOLD","APPROVED"].includes(item.status) && (
                    <button type="button" className={s.rejectButton} onClick={()=>void review(item,"reject")} disabled={Boolean(busy)}>Reject</button>
                  )}
                  {item.status === "APPROVED" && (
                    <button type="button" className={s.paidButton} onClick={()=>void markPaid(item)} disabled={Boolean(busy)}>Mark Paid</button>
                  )}
                </div>

                {(item.review_reason || item.payout_reference) && (
                  <div className={s.metaLine}>
                    {item.review_reason && <span>Note: {item.review_reason}</span>}
                    {item.payout_reference && <span>Ref: {item.payout_reference}</span>}
                  </div>
                )}
              </article>
            ))}
            {!loading && !data?.items.length && <div className={s.empty}>ยังไม่มีคำขอถอน</div>}
          </section>

          <div className={s.sectionHead}>
            <div><span className={s.kicker}>APPEND-ONLY AUDIT</span><h2>Recent Security Events</h2></div>
            <span>{data?.audit.length || 0} EVENTS</span>
          </div>

          <section className={s.auditList}>
            {data?.audit.slice(0,40).map(item=>(
              <div className={s.auditRow} key={item.id}>
                <span>{item.event_type}</span>
                <b>{item.user_code || "SYSTEM"}</b>
                <small>{item.actor_type} · {item.actor_label || "—"}</small>
                <time>{dateTime(item.created_at)}</time>
              </div>
            ))}
          </section>
        </div>
      </main>
    </div>
  );
}
