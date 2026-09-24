"use client";

import { useEffect, useMemo, useState } from "react";
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
  risk_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  risk_reasons: string[];
  approval_required: number;
  approval_count: number;
  auto_payout_eligible: boolean;
  reconciliation_status: string;
};

type Phase3 = {
  advanced: {
    killSwitchEnabled: boolean;
    killSwitchReason: string | null;
    globalDailyLimitSatang: number;
    dualApprovalThresholdSatang: number;
    highRiskScoreThreshold: number;
    criticalRiskScoreThreshold: number;
    riskEngineEnabled: boolean;
    autoPayoutEnabled: boolean;
    payoutWorkerConfigured: boolean;
    updatedBy: string | null;
    updatedAt: string | null;
  };
  alerts: Array<{
    id: string;
    withdrawal_id: string | null;
    user_id: string | null;
    user_code: string | null;
    severity: "INFO" | "MEDIUM" | "HIGH" | "CRITICAL";
    alert_type: string;
    status: string;
    title: string;
    details: any;
    resolved_by: string | null;
    resolved_at: string | null;
    created_at: string;
  }>;
  payoutJobs: Array<{
    id: string;
    withdrawal_id: string;
    status: string;
    worker_id: string | null;
    provider_reference: string | null;
    provider_amount_satang: number | null;
    provider_currency: string | null;
    provider_status: string | null;
    error_code: string | null;
    error_message: string | null;
    attempt_count: number;
    amount_satang: number;
    currency: string;
    risk_score: number;
    risk_level: string;
    user_code: string;
    created_at: string;
    updated_at: string;
  }>;
  userControls: Array<{
    user_id: string;
    user_code: string;
    email: string;
    withdrawal_paused: boolean;
    pause_reason: string | null;
    daily_limit_satang: number | null;
    updated_by: string | null;
    updated_at: string;
  }>;
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
  phase3: Phase3;
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
  const [killReason, setKillReason] = useState("");
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
  const [advancedForm, setAdvancedForm] = useState({
    globalDailyThb: "100000",
    dualApprovalThb: "20000",
    highRisk: "60",
    criticalRisk: "85",
    riskEngineEnabled: true,
    autoPayoutEnabled: false
  });

  useEffect(() => {
    if (!localStorage.getItem("bot_token")) {
      window.location.href = "/login";
      return;
    }
    void load();
  }, []);

  const openAlerts = useMemo(
    () => data?.phase3?.alerts.filter(item=>item.status==="OPEN") || [],
    [data]
  );
  const activeJobs = useMemo(
    () => data?.phase3?.payoutJobs.filter(item=>["READY","CLAIMED","SUBMITTED","RECONCILE_REQUIRED"].includes(item.status)) || [],
    [data]
  );

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
      setAdvancedForm({
        globalDailyThb: String(next.phase3.advanced.globalDailyLimitSatang / 100),
        dualApprovalThb: String(next.phase3.advanced.dualApprovalThresholdSatang / 100),
        highRisk: String(next.phase3.advanced.highRiskScoreThreshold),
        criticalRisk: String(next.phase3.advanced.criticalRiskScoreThreshold),
        riskEngineEnabled: next.phase3.advanced.riskEngineEnabled,
        autoPayoutEnabled: next.phase3.advanced.autoPayoutEnabled
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

  async function saveAdvanced() {
    setBusy("advanced");
    setMessage("");
    try {
      await adminApi("/admin/commission-withdrawals/advanced-settings", {
        method: "PATCH",
        body: JSON.stringify({
          globalDailyLimitSatang: Math.round(Number(advancedForm.globalDailyThb || 0) * 100),
          dualApprovalThresholdSatang: Math.round(Number(advancedForm.dualApprovalThb || 0) * 100),
          highRiskScoreThreshold: Math.trunc(Number(advancedForm.highRisk || 0)),
          criticalRiskScoreThreshold: Math.trunc(Number(advancedForm.criticalRisk || 0)),
          riskEngineEnabled: advancedForm.riskEngineEnabled,
          autoPayoutEnabled: advancedForm.autoPayoutEnabled
        })
      });
      setMessage("บันทึก Phase 3 Security Policy แล้ว");
      await load();
    } catch (error: any) {
      setMessage(String(error?.message || "บันทึก Phase 3 Settings ไม่สำเร็จ"));
    } finally {
      setBusy("");
    }
  }

  async function toggleKillSwitch(enabled: boolean) {
    if (busy) return;
    if (enabled) {
      const confirmed = await confirmPopup({
        title: "Activate Withdrawal Kill Switch",
        message: "หยุดรับคำขอถอนใหม่และหยุด Auto Payout queue ทันที?",
        confirmLabel: "Activate Kill Switch",
        cancelLabel: "Cancel",
        tone: "warning"
      });
      if (!confirmed) return;
    }
    setBusy("kill");
    setMessage("");
    try {
      await adminApi("/admin/commission-withdrawals/kill-switch", {
        method: "POST",
        body: JSON.stringify({ enabled, reason: enabled ? killReason : "" })
      });
      setKillReason("");
      setMessage(enabled
        ? "Kill Switch ทำงานแล้ว · Requests และ Auto Payout ถูกปิด"
        : "ปิด Kill Switch แล้ว · ระบบยังไม่เปิด Requests/Auto Payout เอง");
      await load();
    } catch (error: any) {
      setMessage(String(error?.message || "เปลี่ยน Kill Switch ไม่สำเร็จ"));
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
      const result = await adminApi(`/admin/commission-withdrawals/${item.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ reason: notes[item.id] || "" })
      });
      setMessage(
        action === "approve" && result?.approved === false
          ? `บันทึก Approval แล้ว ${result.approvalCount}/${result.approvalRequired} · ต้องใช้ Admin อีกคน`
          : `${action.toUpperCase()} ${item.user_code} สำเร็จ`
      );
      await load();
    } catch (error: any) {
      setMessage(String(error?.message || "ดำเนินการไม่สำเร็จ"));
    } finally {
      setBusy("");
    }
  }

  async function setUserPause(item: Withdrawal, paused: boolean) {
    if (busy) return;
    setBusy(item.id + "user-control");
    setMessage("");
    try {
      await adminApi(`/admin/commission-withdrawals/users/${item.user_id}/control`, {
        method: "PATCH",
        body: JSON.stringify({
          withdrawalPaused: paused,
          pauseReason: paused ? (notes[item.id] || "Manual fraud review") : "",
          dailyLimitSatang: null
        })
      });
      setMessage(paused ? `Pause การถอนของ ${item.user_code} แล้ว` : `Resume การถอนของ ${item.user_code} แล้ว`);
      await load();
    } catch (error: any) {
      setMessage(String(error?.message || "ปรับ User Control ไม่สำเร็จ"));
    } finally {
      setBusy("");
    }
  }

  async function resolveAlert(id: string) {
    if (busy) return;
    setBusy(id + "alert");
    try {
      await adminApi(`/admin/commission-withdrawals/alerts/${id}/resolve`, { method: "POST" });
      setMessage("Resolve alert แล้ว");
      await load();
    } catch (error: any) {
      setMessage(String(error?.message || "Resolve alert ไม่สำเร็จ"));
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

  async function reconcilePaid(item: Withdrawal) {
    if (busy) return;
    const reference = String(references[item.id] || "").trim();
    const confirmed = await confirmPopup({
      title: "Manual Reconciliation",
      message: `ยืนยันว่าตรวจหลักฐานแล้ว Provider จ่ายเต็ม ${money(item.amount_satang)} จริง?`,
      confirmLabel: "Reconcile as Paid",
      cancelLabel: "Cancel",
      tone: "warning"
    });
    if (!confirmed) return;

    setBusy(item.id + "reconcile");
    setMessage("");
    try {
      await adminApi("/admin/commission-withdrawals/" + item.id + "/reconcile-paid", {
        method: "POST",
        body: JSON.stringify({
          payoutReference: reference,
          confirmedAmountSatang: item.amount_satang,
          currentPassword: verification.currentPassword,
          twoFactorCode: verification.twoFactorCode
        })
      });
      setVerification({ currentPassword: "", twoFactorCode: "" });
      setMessage("Manual Reconciliation สำเร็จ · ยืนยัน PAID และปิด mismatch alert แล้ว");
      await load();
    } catch (error: any) {
      setMessage(String(error?.message || "Manual Reconciliation ไม่สำเร็จ"));
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

  function userPaused(userId: string) {
    return Boolean(data?.phase3.userControls.find(item=>item.user_id===userId)?.withdrawal_paused);
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
              <span className={s.kicker}>SCENOVA / FINANCIAL CONTROL · PHASE 3</span>
              <h1>Commission & Withdrawal Center</h1>
              <p>Fraud Risk · Dual Approval · Kill Switch · Payout Worker · Reconciliation</p>
            </div>
            <span className={data?.phase3?.advanced.killSwitchEnabled ? s.killBadge : data?.settings.requestsEnabled ? s.openBadge : s.pauseBadge}>
              <i/> {data?.phase3?.advanced.killSwitchEnabled ? "KILL SWITCH ACTIVE" : data?.settings.requestsEnabled ? "REQUESTS OPEN" : "WITHDRAWALS PAUSED"}
            </span>
          </header>

          {message && <div className={s.notice}>{message}</div>}

          <section className={s.summaryGrid}>
            <article><span>Requested</span><b>{data?.summary.requestedCount || 0}</b><small>รอตรวจสอบ</small></article>
            <article><span>On Hold</span><b>{data?.summary.holdCount || 0}</b><small>Risk / second approval</small></article>
            <article><span>Approved</span><b>{data?.summary.approvedCount || 0}</b><small>พร้อมจ่าย</small></article>
            <article><span>Open Alerts</span><b>{openAlerts.length}</b><small>Fraud / reconciliation</small></article>
            <article><span>Payout Queue</span><b>{activeJobs.length}</b><small>Worker jobs</small></article>
            <article><span>Locked</span><b>{money(data?.summary.lockedSatang || 0)}</b><small>เงินที่กันไว้</small></article>
            <article><span>Total Paid</span><b>{money(data?.summary.paidSatang || 0)}</b><small>ยอดจ่ายออก</small></article>
          </section>

          <section className={s.controlGrid}>
            <div className={s.controlCard}>
              <div className={s.cardHead}>
                <div><span className={s.kicker}>GLOBAL SETTINGS</span><h2>Withdrawal Rules</h2></div>
                <label className={s.switchLine}>
                  <input
                    type="checkbox"
                    checked={settingsForm.requestsEnabled}
                    disabled={Boolean(data?.phase3?.advanced.killSwitchEnabled)}
                    onChange={event=>setSettingsForm(v=>({...v,requestsEnabled:event.target.checked}))}
                  />
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
                <div><span className={s.kicker}>ADMIN STEP-UP</span><h2>Reveal / Manual Paid</h2></div>
                <span className={s.securityTag}>PASSWORD + 2FA</span>
              </div>
              <div className={s.verifyFields}>
                <label><span>Current Password</span><input type="password" value={verification.currentPassword} onChange={event=>setVerification(v=>({...v,currentPassword:event.target.value}))} autoComplete="current-password"/></label>
                <label><span>2FA Code</span><input value={verification.twoFactorCode} onChange={event=>setVerification(v=>({...v,twoFactorCode:event.target.value}))} maxLength={6} inputMode="numeric" placeholder="6 digits"/></label>
              </div>
              <p>เลขบัญชีเต็มแสดงชั่วคราว 60 วินาที และทุกการ Reveal ถูกบันทึก Audit</p>
            </div>
          </section>

          <section className={s.phase3Grid}>
            <div className={s.controlCard}>
              <div className={s.cardHead}>
                <div><span className={s.kicker}>ADVANCED SECURITY</span><h2>Risk & Approval Policy</h2></div>
                <span className={s.securityTag}>RISK ENGINE</span>
              </div>
              <div className={s.advancedFields}>
                <label><span>Global Daily Limit THB</span><input value={advancedForm.globalDailyThb} onChange={event=>setAdvancedForm(v=>({...v,globalDailyThb:event.target.value}))}/></label>
                <label><span>2-Person Approval ≥ THB</span><input value={advancedForm.dualApprovalThb} onChange={event=>setAdvancedForm(v=>({...v,dualApprovalThb:event.target.value}))}/></label>
                <label><span>High Risk Score</span><input value={advancedForm.highRisk} onChange={event=>setAdvancedForm(v=>({...v,highRisk:event.target.value}))}/></label>
                <label><span>Critical Score</span><input value={advancedForm.criticalRisk} onChange={event=>setAdvancedForm(v=>({...v,criticalRisk:event.target.value}))}/></label>
              </div>
              <div className={s.policySwitches}>
                <label className={s.switchLine}>
                  <input type="checkbox" checked={advancedForm.riskEngineEnabled} onChange={event=>setAdvancedForm(v=>({...v,riskEngineEnabled:event.target.checked}))}/>
                  Fraud Risk Engine
                </label>
                <label className={s.switchLine}>
                  <input
                    type="checkbox"
                    checked={advancedForm.autoPayoutEnabled}
                    disabled={!data?.phase3.advanced.payoutWorkerConfigured || Boolean(data?.phase3.advanced.killSwitchEnabled)}
                    onChange={event=>setAdvancedForm(v=>({...v,autoPayoutEnabled:event.target.checked}))}
                  />
                  Auto Payout
                </label>
                <span className={data?.phase3.advanced.payoutWorkerConfigured ? s.workerReady : s.workerOff}>
                  {data?.phase3.advanced.payoutWorkerConfigured ? "WORKER KEY READY" : "WORKER NOT CONFIGURED"}
                </span>
                <button type="button" className={s.primary} disabled={busy==="advanced"} onClick={()=>void saveAdvanced()}>
                  {busy==="advanced" ? "Saving..." : "Save Security Policy"}
                </button>
              </div>
            </div>

            <div className={`${s.controlCard} ${data?.phase3.advanced.killSwitchEnabled ? s.killCard : ""}`}>
              <div className={s.cardHead}>
                <div><span className={s.kicker}>EMERGENCY CONTROL</span><h2>Withdrawal Kill Switch</h2></div>
                <span className={data?.phase3.advanced.killSwitchEnabled ? s.killBadge : s.openBadge}>
                  <i/> {data?.phase3.advanced.killSwitchEnabled ? "ACTIVE" : "STANDBY"}
                </span>
              </div>
              <input
                className={s.noteInput}
                value={killReason}
                onChange={event=>setKillReason(event.target.value)}
                placeholder="เหตุผล เช่น พบ payout anomaly / suspected fraud"
              />
              <p>เมื่อเปิด: ปิด Requests + Auto Payout และยกเลิก READY jobs ทันที แต่ไม่ Unlock เงินที่กำลังตรวจสอบ</p>
              <button
                type="button"
                className={data?.phase3.advanced.killSwitchEnabled ? s.resumeButton : s.killButton}
                disabled={busy==="kill"}
                onClick={()=>void toggleKillSwitch(!data?.phase3.advanced.killSwitchEnabled)}
              >
                {data?.phase3.advanced.killSwitchEnabled ? "Deactivate Kill Switch" : "ACTIVATE KILL SWITCH"}
              </button>
            </div>
          </section>

          <div className={s.sectionHead}>
            <div><span className={s.kicker}>RISK REVIEW QUEUE</span><h2>Withdrawal Requests</h2></div>
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
                  <div className={s.badgeStack}>
                    <span className={s.statusBadge}>{item.status}</span>
                    <span className={
                      item.risk_level==="CRITICAL" ? s.riskCritical :
                      item.risk_level==="HIGH" ? s.riskHigh :
                      item.risk_level==="MEDIUM" ? s.riskMedium : s.riskLow
                    }>
                      RISK {item.risk_score} · {item.risk_level}
                    </span>
                  </div>
                </div>

                <div className={s.riskStrip}>
                  <span>Approval <b>{item.approval_count}/{item.approval_required}</b></span>
                  <span>Reconcile <b>{item.reconciliation_status}</b></span>
                  <span>Auto Payout <b>{item.auto_payout_eligible ? "ELIGIBLE" : "NO"}</b></span>
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

                {Array.isArray(item.risk_reasons) && item.risk_reasons.length>0 && (
                  <div className={s.reasonChips}>
                    {item.risk_reasons.slice(0,5).map(reason=><span key={reason}>{reason.replace(/_/g," ")}</span>)}
                  </div>
                )}

                <input
                  className={s.noteInput}
                  value={notes[item.id] || ""}
                  onChange={event=>setNotes(v=>({...v,[item.id]:event.target.value}))}
                  placeholder="Review note / Reject reason / User pause reason"
                />

                {item.status === "APPROVED" && (
                  <input
                    className={s.noteInput}
                    value={references[item.id] || ""}
                    onChange={event=>setReferences(v=>({...v,[item.id]:event.target.value}))}
                    placeholder="Manual Transfer / Payment Reference"
                  />
                )}

                <div className={s.actions}>
                  <button type="button" onClick={()=>void revealAccount(item)} disabled={Boolean(busy)}>Reveal</button>
                  {["REQUESTED","HOLD"].includes(item.status) && (
                    <>
                      <button type="button" onClick={()=>void review(item,"hold")} disabled={Boolean(busy)}>Hold</button>
                      <button type="button" className={s.approveButton} onClick={()=>void review(item,"approve")} disabled={Boolean(busy)}>
                        Approve {item.approval_required===2 ? `${item.approval_count+1}/2` : ""}
                      </button>
                    </>
                  )}
                  {["REQUESTED","HOLD","APPROVED"].includes(item.status) && (
                    <button type="button" className={s.rejectButton} onClick={()=>void review(item,"reject")} disabled={Boolean(busy)}>Reject</button>
                  )}
                  {item.status === "APPROVED" && (
                    <button type="button" className={s.paidButton} onClick={()=>void markPaid(item)} disabled={Boolean(busy)}>Manual Mark Paid</button>
                  )}
                  {item.status === "HOLD" && ["MISMATCH","MANUAL_REVIEW"].includes(item.reconciliation_status) && (
                    <button type="button" className={s.reconcileButton} onClick={()=>void reconcilePaid(item)} disabled={Boolean(busy)}>Reconcile as Paid</button>
                  )}
                  <button
                    type="button"
                    className={userPaused(item.user_id) ? s.resumeButton : s.userPauseButton}
                    disabled={Boolean(busy)}
                    onClick={()=>void setUserPause(item,!userPaused(item.user_id))}
                  >
                    {userPaused(item.user_id) ? "Resume User" : "Pause User"}
                  </button>
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
            <div><span className={s.kicker}>ANOMALY ALERTS</span><h2>Fraud & Reconciliation Alerts</h2></div>
            <span>{openAlerts.length} OPEN</span>
          </div>

          <section className={s.alertGrid}>
            {data?.phase3.alerts.slice(0,30).map(item=>(
              <article className={`${s.alertCard} ${item.status==="OPEN" ? s.alertOpen : ""}`} key={item.id}>
                <div>
                  <span className={
                    item.severity==="CRITICAL" ? s.riskCritical :
                    item.severity==="HIGH" ? s.riskHigh : s.riskMedium
                  }>{item.severity}</span>
                  <small>{dateTime(item.created_at)}</small>
                </div>
                <b>{item.title}</b>
                <span>{item.user_code || "SYSTEM"} · {item.alert_type}</span>
                {item.status==="OPEN" && (
                  <button type="button" disabled={Boolean(busy)} onClick={()=>void resolveAlert(item.id)}>Resolve</button>
                )}
              </article>
            ))}
            {!data?.phase3.alerts.length && <div className={s.empty}>ไม่มี Fraud / Reconciliation alert</div>}
          </section>

          <div className={s.sectionHead}>
            <div><span className={s.kicker}>SEPARATE PAYOUT PLANE</span><h2>Payout Jobs & Reconciliation</h2></div>
            <span>{data?.phase3.payoutJobs.length || 0} JOBS</span>
          </div>

          <section className={s.jobList}>
            {data?.phase3.payoutJobs.slice(0,30).map(job=>(
              <div className={s.jobRow} key={job.id}>
                <span className={s.statusBadge}>{job.status}</span>
                <b>{job.user_code}</b>
                <span>{money(job.amount_satang)}</span>
                <small>Risk {job.risk_score} · {job.risk_level}</small>
                <small>{job.provider_reference ? "Ref " + job.provider_reference : job.error_code || "No provider result yet"}</small>
                <time>{dateTime(job.updated_at)}</time>
              </div>
            ))}
            {!data?.phase3.payoutJobs.length && <div className={s.empty}>ยังไม่มี Auto Payout job</div>}
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
