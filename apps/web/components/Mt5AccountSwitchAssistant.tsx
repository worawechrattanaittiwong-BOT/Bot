"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";

type DashboardSnapshot = {
  slots?: any[];
  selectedSlot?: any;
  account?: any;
  instance?: any;
  softwareUpdate?: any;
};

export function Mt5AccountSwitchAssistant() {
  const [mountTarget, setMountTarget] = useState<Element | null>(null);
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [slotId, setSlotId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const locate = () => {
      const target = document.querySelector(".account-workspace");
      setMountTarget(current => current === target ? current : target);
    };
    locate();
    const id = window.setInterval(locate, 500);
    return () => window.clearInterval(id);
  }, []);

  async function refresh(targetSlotId?: string) {
    try {
      const requested = targetSlotId ?? slotId;
      const result = await api(
        "/bot/dashboard" + (requested ? "?slotId=" + encodeURIComponent(requested) : "")
      );
      setData(result);
      const resolved = String(result?.selectedSlot?.id || "");
      if (!slotId && resolved) setSlotId(resolved);
      setError("");
      return result;
    } catch (e: any) {
      setError(String(e?.message || "โหลดสถานะบัญชีไม่สำเร็จ"));
      return null;
    }
  }

  useEffect(() => {
    if (!mountTarget) return;
    refresh();
    const id = window.setInterval(() => refresh(), 2000);
    return () => window.clearInterval(id);
  }, [mountTarget, slotId]);

  const localSlots = useMemo(
    () => (data?.slots || []).filter((slot: any) => String(slot?.mode || "").toUpperCase() === "LOCAL"),
    [data?.slots]
  );

  const selectedSlot = data?.selectedSlot;
  const isLocal = String(selectedSlot?.mode || "").toUpperCase() === "LOCAL";
  const account = data?.account;
  const instance = data?.instance || {};
  const metrics = instance?.metrics || {};
  const currentAccount = String(account?.account_number || "");
  const currentBroker = String(account?.broker || "");
  const currentServer = String(account?.broker_server || "");
  const pendingAccount = String(instance?.pending_account_number || "");
  const pendingServer = String(instance?.pending_broker_server || "");
  const state = String(instance?.actual_state || "OFFLINE");
  const desired = String(instance?.desired_state || "STOPPED");
  const positions = Math.max(
    0,
    Number(metrics?.positions || 0),
    Number(metrics?.previousBoundPositions || 0)
  );
  const eaOnline = Boolean(instance?.mt5_online);
  const agentOnline = Boolean(instance?.agent_online || instance?.device_online);
  const rebindReady = Boolean(instance?.rebind_ready || instance?.first_bind_ready);
  const softwareUpdateRequired = Boolean(data?.softwareUpdate?.required);
  const changeRequestedAt = instance?.account_change_requested_at
    ? new Date(instance.account_change_requested_at)
    : null;
  const requestAgeSeconds = changeRequestedAt
    ? Math.max(0, (Date.now() - changeRequestedAt.getTime()) / 1000)
    : 0;
  const changeRequestActive = Boolean(changeRequestedAt && requestAgeSeconds < 30 * 60);
  const cannotChange = desired === "RUNNING" || state === "RUNNING" || positions > 0;
  const showRepair = Boolean(
    softwareUpdateRequired || !agentOnline || (changeRequestActive && !eaOnline && requestAgeSeconds >= 35)
  );

  async function startChange() {
    if (!slotId) return;
    if (cannotChange) {
      setError("กรุณาหยุดบอทและปิดออเดอร์ให้หมดก่อนเปลี่ยนบัญชี");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api(
        "/bot/mt5/change-request?slotId=" + encodeURIComponent(slotId),
        { method: "POST" }
      );
      setNotice(result?.message || "พร้อมแล้ว กรุณา Login บัญชีใหม่ใน MT5");
      await refresh(slotId);
    } catch (e: any) {
      setError(String(e?.message || "เริ่มเปลี่ยนบัญชีไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmAccount() {
    if (!slotId || !pendingAccount) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api(
        "/bot/mt5/rebind?slotId=" + encodeURIComponent(slotId),
        { method: "POST" }
      );
      setNotice(result?.firstBind ? "เชื่อมบัญชี MT5 เรียบร้อยแล้ว" : "เปลี่ยนบัญชี MT5 เรียบร้อยแล้ว");
      await refresh(slotId);
    } catch (e: any) {
      setError(String(e?.message || "ยืนยันบัญชีใหม่ไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function downloadRepairInstaller() {
    if (!slotId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api("/bot/installers/windows", {
        method: "POST",
        body: JSON.stringify({ slotId })
      });
      if (!result?.downloadPath) throw new Error("ไฟล์ติดตั้งยังไม่พร้อมดาวน์โหลด");
      const response = await fetch(result.downloadPath, { cache: "no-store" });
      if (!response.ok) throw new Error("ดาวน์โหลด SCENOVA Setup ไม่สำเร็จ");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.fileName || "SCENOVA-Setup.exe";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("ดาวน์โหลดแล้ว กรุณาเปิด SCENOVA Setup เพื่อซ่อมการเชื่อมต่อ");
    } catch (e: any) {
      setError(String(e?.message || "ดาวน์โหลดไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  if (!mountTarget || !isLocal) return null;

  const statusLabel = cannotChange
    ? "ยังเปลี่ยนไม่ได้"
    : pendingAccount
      ? "พบบัญชีใหม่แล้ว"
      : changeRequestActive
        ? "กำลังรอบัญชีใหม่"
        : "พร้อมเปลี่ยนบัญชี";

  const statusClass = cannotChange ? "bad" : pendingAccount ? "good" : changeRequestActive ? "working" : "ready";

  return createPortal(
    <>
      <style>{`
        .account-workspace{display:flex!important;flex-direction:column!important;gap:16px!important}
        .account-workspace>.account-card{order:1}
        .scenova-mt5-switch-inline{order:2}
        .account-workspace>.website-install-panel{order:3}
        .account-workspace>.detected-mt5-card,.account-workspace>.first-install-guide{display:none!important}
        .account-workspace>.account-card .muted,.account-workspace>.account-card .help{display:none!important}
        .account-workspace>.website-install-panel .panel-head .muted,.account-workspace>.website-install-panel>.help{display:none!important}
        .account-workspace>.website-install-panel{padding:22px!important}
        .account-workspace>.website-install-panel .panel-head h2{margin-bottom:2px!important}
        .scenova-mt5-switch-inline{position:relative;overflow:hidden;border:1px solid rgba(120,96,255,.24);border-radius:22px;background:linear-gradient(145deg,rgba(13,20,34,.98),rgba(10,17,29,.98));box-shadow:0 18px 60px rgba(0,0,0,.16);padding:22px}
        .scenova-mt5-switch-inline:before{content:"";position:absolute;width:300px;height:300px;border-radius:50%;right:-130px;top:-170px;background:radial-gradient(circle,rgba(112,77,255,.19),transparent 67%);pointer-events:none}
        .mt5-switch-top{display:flex;align-items:center;justify-content:space-between;gap:18px;position:relative;z-index:1}
        .mt5-switch-title{display:flex;align-items:center;gap:13px}.mt5-switch-title-icon{width:43px;height:43px;border-radius:13px;display:grid;place-items:center;background:linear-gradient(145deg,#5537d9,#7860ff);color:white;font-size:21px;font-weight:900;box-shadow:0 9px 24px rgba(93,69,230,.28)}
        .mt5-switch-title small{display:block;color:#7d8ba1;font-size:11px;letter-spacing:.12em;font-weight:800}.mt5-switch-title h3{margin:3px 0 0;color:#f6f8fc;font-size:20px}
        .mt5-switch-status{border-radius:999px;padding:7px 11px;font-size:12px;font-weight:800;white-space:nowrap}.mt5-switch-status.ready{color:#9ed8ff;background:rgba(61,150,255,.10);border:1px solid rgba(78,161,255,.20)}.mt5-switch-status.good{color:#7de5bd;background:rgba(24,181,124,.10);border:1px solid rgba(55,204,149,.22)}.mt5-switch-status.working{color:#ffd77c;background:rgba(255,180,45,.09);border:1px solid rgba(255,190,58,.20)}.mt5-switch-status.bad{color:#ff9b9b;background:rgba(224,70,70,.10);border:1px solid rgba(235,91,91,.22)}
        .mt5-switch-grid{display:grid;grid-template-columns:minmax(0,1fr) 54px minmax(0,1fr);gap:12px;align-items:stretch;margin-top:20px;position:relative;z-index:1}.mt5-account-box{border:1px solid rgba(122,141,170,.15);border-radius:16px;background:rgba(255,255,255,.025);padding:15px 17px}.mt5-account-box small{display:block;color:#7d8ba1;font-size:11px;margin-bottom:6px}.mt5-account-box b{display:block;color:#f4f7fb;font-size:20px;letter-spacing:.02em}.mt5-account-box span{display:block;color:#8996a9;font-size:12px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mt5-account-box.pending{border-color:rgba(61,210,155,.28);background:rgba(29,170,119,.05)}.mt5-account-box.pending b{color:#75e4ba}.mt5-switch-arrow{display:grid;place-items:center;color:#826bff;font-size:24px;font-weight:900}
        .mt5-switch-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:17px;position:relative;z-index:1}.mt5-switch-primary,.mt5-switch-secondary{border:0;border-radius:12px;padding:11px 16px;font-weight:800;cursor:pointer;transition:.18s ease}.mt5-switch-primary{color:white;background:linear-gradient(135deg,#6545e8,#825eff);box-shadow:0 8px 24px rgba(102,72,227,.22)}.mt5-switch-primary.confirm{background:linear-gradient(135deg,#087d5f,#0ea779)}.mt5-switch-primary:disabled{opacity:.42;cursor:not-allowed;box-shadow:none}.mt5-switch-secondary{color:#cbd4e2;background:rgba(255,255,255,.055);border:1px solid rgba(143,159,183,.16)}
        .mt5-switch-hint{color:#8895a8;font-size:12px;line-height:1.65;margin-top:12px;position:relative;z-index:1}.mt5-switch-hint strong{color:#cbd4df}.mt5-switch-msg{margin-top:12px;border-radius:12px;padding:10px 12px;font-size:12px;font-weight:700}.mt5-switch-msg.ok{background:rgba(24,174,121,.08);color:#79ddb7;border:1px solid rgba(40,195,140,.16)}.mt5-switch-msg.err{background:rgba(222,70,70,.08);color:#ff9898;border:1px solid rgba(234,85,85,.16)}
        .mt5-slot-select{margin-top:14px;display:flex;align-items:center;gap:10px;color:#8c99ab;font-size:12px}.mt5-slot-select select{background:#111a29;color:#e8edf5;border:1px solid rgba(130,148,176,.18);border-radius:10px;padding:8px 11px}
        @media(max-width:720px){.scenova-mt5-switch-inline{padding:18px}.mt5-switch-top{align-items:flex-start}.mt5-switch-grid{grid-template-columns:1fr}.mt5-switch-arrow{transform:rotate(90deg);height:26px}.mt5-account-box b{font-size:18px}.mt5-switch-actions{display:grid;grid-template-columns:1fr}.mt5-switch-primary,.mt5-switch-secondary{width:100%}}
      `}</style>

      <section className="scenova-mt5-switch-inline" aria-label="เปลี่ยนบัญชี MT5">
        <div className="mt5-switch-top">
          <div className="mt5-switch-title">
            <div className="mt5-switch-title-icon">↔</div>
            <div>
              <small>MT5 ACCOUNT</small>
              <h3>เปลี่ยนบัญชี MT5</h3>
            </div>
          </div>
          <span className={"mt5-switch-status " + statusClass}>{statusLabel}</span>
        </div>

        {localSlots.length > 1 && (
          <label className="mt5-slot-select">
            <span>เลือกบัญชี MT5</span>
            <select value={slotId} onChange={e => { setSlotId(e.target.value); setNotice(""); setError(""); }}>
              {localSlots.map((slot: any, index: number) => (
                <option key={slot.id} value={slot.id}>{slot.account_number ? "MT5 " + slot.account_number : "บัญชี " + (index + 1)}</option>
              ))}
            </select>
          </label>
        )}

        <div className="mt5-switch-grid">
          <div className="mt5-account-box">
            <small>บัญชีที่ใช้อยู่</small>
            <b>{currentAccount || "ยังไม่มีบัญชี"}</b>
            <span>{[currentBroker, currentServer].filter(Boolean).join(" · ") || "—"}</span>
          </div>
          <div className="mt5-switch-arrow">→</div>
          <div className={"mt5-account-box " + (pendingAccount ? "pending" : "")}>
            <small>บัญชีใหม่</small>
            <b>{pendingAccount || (changeRequestActive ? "กำลังค้นหา..." : "—")}</b>
            <span>{pendingServer || (changeRequestActive ? "Login บัญชีใหม่ใน MT5 ได้เลย" : "กดเริ่มเปลี่ยนบัญชี")}</span>
          </div>
        </div>

        {cannotChange ? (
          <div className="mt5-switch-hint"><strong>ก่อนเปลี่ยนบัญชี:</strong> หยุดบอทและปิดออเดอร์ให้หมดก่อน {positions > 0 ? `(ยังมี ${positions} Position)` : ""}</div>
        ) : pendingAccount ? (
          <div className="mt5-switch-hint"><strong>ตรวจพบบัญชีใหม่แล้ว</strong> ตรวจเลขบัญชีให้ถูกต้อง แล้วกดยืนยันเพื่อใช้งานบัญชีนี้</div>
        ) : changeRequestActive ? (
          <div className="mt5-switch-hint"><strong>ขั้นตอนสุดท้าย:</strong> เปิด MT5 → Login บัญชีใหม่ → รอสักครู่ ระบบจะขึ้นเลขบัญชีใหม่ตรงช่องด้านขวาให้อัตโนมัติ</div>
        ) : (
          <div className="mt5-switch-hint"><strong>เปลี่ยนง่าย 2 ขั้นตอน:</strong> กด “เริ่มเปลี่ยนบัญชี” แล้ว Login บัญชีใหม่ใน MT5 จากนั้นกลับมายืนยันเลขบัญชีที่ตรวจพบ</div>
        )}

        <div className="mt5-switch-actions">
          {pendingAccount ? (
            <button className="mt5-switch-primary confirm" type="button" disabled={busy || cannotChange || !rebindReady} onClick={confirmAccount}>
              {busy ? "กำลังยืนยัน..." : `ยืนยันใช้บัญชี ${pendingAccount}`}
            </button>
          ) : (
            <button className="mt5-switch-primary" type="button" disabled={busy || cannotChange || changeRequestActive} onClick={startChange}>
              {busy ? "กำลังเตรียม..." : changeRequestActive ? "กำลังรอบัญชีใหม่" : "เริ่มเปลี่ยนบัญชี"}
            </button>
          )}
          {changeRequestActive && !pendingAccount && (
            <button className="mt5-switch-secondary" type="button" disabled={busy} onClick={() => refresh(slotId)}>ตรวจอีกครั้ง</button>
          )}
          {showRepair && (
            <button className="mt5-switch-secondary" type="button" disabled={busy} onClick={downloadRepairInstaller}>ซ่อมการเชื่อมต่อ</button>
          )}
        </div>

        {notice && <div className="mt5-switch-msg ok">{notice}</div>}
        {error && <div className="mt5-switch-msg err">{error}</div>}
      </section>
    </>,
    mountTarget
  );
}
