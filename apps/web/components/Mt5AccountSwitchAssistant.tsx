"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

type DashboardSnapshot = {
  slots?: any[];
  selectedSlot?: any;
  account?: any;
  instance?: any;
  softwareUpdate?: any;
};

export function Mt5AccountSwitchAssistant() {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [slotId, setSlotId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setVisible(window.location.pathname.startsWith("/dashboard"));
  }, []);

  async function refresh(targetSlotId?: string) {
    try {
      const requested = targetSlotId ?? slotId;
      const result = await api(
        "/bot/dashboard" + (requested ? "?slotId=" + encodeURIComponent(requested) : "")
      );
      setData(result);

      const resolved = String(result?.selectedSlot?.id || "");
      const selectedMode = String(result?.selectedSlot?.mode || "").toUpperCase();
      const localCandidates = (result?.slots || []).filter(
        (slot: any) => String(slot?.mode || "").toUpperCase() === "LOCAL"
      );

      if (!requested && selectedMode !== "LOCAL" && localCandidates.length > 0) {
        setSlotId(String(localCandidates[0].id || ""));
      } else if (!slotId && resolved) {
        setSlotId(resolved);
      }

      setError("");
      return result;
    } catch (e: any) {
      setError(String(e?.message || "โหลดสถานะ MT5 ไม่สำเร็จ"));
      return null;
    }
  }

  useEffect(() => {
    if (!visible || !open) return;
    refresh();
    const id = window.setInterval(() => refresh(), 2000);
    return () => window.clearInterval(id);
  }, [visible, open, slotId]);

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
  const rebindReady = Boolean(instance?.rebind_ready);
  const softwareUpdateRequired = Boolean(data?.softwareUpdate?.required);
  const changeRequestedAt = instance?.account_change_requested_at
    ? new Date(instance.account_change_requested_at)
    : null;
  const requestAgeSeconds = changeRequestedAt
    ? Math.max(0, (Date.now() - changeRequestedAt.getTime()) / 1000)
    : 0;
  const changeRequestActive = Boolean(changeRequestedAt && requestAgeSeconds < 30 * 60);
  const cannotChange = desired === "RUNNING" || state === "RUNNING" || positions > 0;
  const agentAutoRepairing = Boolean(
    changeRequestActive && agentOnline && !eaOnline && !pendingAccount && requestAgeSeconds < 45
  );
  const showManualRepair = Boolean(
    softwareUpdateRequired ||
    !agentOnline ||
    (changeRequestActive && !eaOnline && requestAgeSeconds >= 45)
  );

  async function startChange() {
    if (!slotId) return;
    if (cannotChange) {
      setError("กรุณาหยุดบอทและปิด Position ให้หมดก่อนเปลี่ยนบัญชี MT5");
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
      setNotice(result?.message || "เปิดโหมดเปลี่ยนบัญชีแล้ว ระบบกำลังตรวจ MT5 ใหม่");
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
      setNotice(
        result?.firstBind
          ? "ผูกบัญชี MT5 เรียบร้อยแล้ว"
          : "เปลี่ยนบัญชี MT5 เรียบร้อยแล้ว ไม่ต้องเปลี่ยน .set หรือ Install Token"
      );
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
      if (!result?.downloadPath) {
        throw new Error("ยังไม่มีไฟล์ SCENOVA Windows Setup สำหรับดาวน์โหลด");
      }
      const response = await fetch(result.downloadPath, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("ดาวน์โหลด SCENOVA Windows Setup ไม่สำเร็จ");
      }
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
      setNotice("ดาวน์โหลดตัวซ่อม/อัปเดตแล้ว เปิดไฟล์ SCENOVA-Setup.exe แล้วรอระบบตรวจบัญชีใหม่อัตโนมัติ");
    } catch (e: any) {
      setError(String(e?.message || "ดาวน์โหลดตัวซ่อมไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setNotice("");
          setError("");
        }}
        style={{
          position: "fixed",
          right: 22,
          bottom: 22,
          zIndex: 1200,
          border: "1px solid #7c5cff",
          borderRadius: 14,
          padding: "12px 18px",
          fontWeight: 800,
          color: "#fff",
          background: pendingAccount
            ? "linear-gradient(135deg,#058c68,#16ad83)"
            : "linear-gradient(135deg,#5f3cf4,#8a5cff)",
          boxShadow: "0 14px 36px rgba(69,48,160,.34)",
          cursor: "pointer"
        }}
      >
        {pendingAccount ? "✓ ยืนยันบัญชี MT5 ใหม่" : "↔ เปลี่ยนบัญชี MT5"}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="เปลี่ยนบัญชี MT5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1300,
            display: "grid",
            placeItems: "center",
            padding: 18,
            background: "rgba(4,8,20,.68)",
            backdropFilter: "blur(7px)"
          }}
        >
          <div style={{
            width: "min(620px,100%)",
            maxHeight: "88vh",
            overflowY: "auto",
            borderRadius: 22,
            border: "1px solid #dce5f2",
            background: "#fff",
            color: "#172033",
            boxShadow: "0 26px 80px rgba(0,0,0,.28)",
            padding: 24
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start" }}>
              <div>
                <div style={{ color: "#6e55e9", fontSize: 12, fontWeight: 900, letterSpacing: 1.4 }}>SCENOVA LOCAL MT5</div>
                <h2 style={{ margin: "6px 0 6px", fontSize: 25 }}>เปลี่ยนบัญชี MT5 แบบง่าย</h2>
                <p style={{ margin: 0, color: "#657085", lineHeight: 1.55 }}>
                  เปลี่ยน Login ใน MT5 ได้ตามปกติ แล้วให้ SCENOVA ตรวจและยืนยันบัญชีใหม่โดยไม่ต้องกรอกเลขบัญชีเอง
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{ border: 0, background: "#f2f5f9", borderRadius: 10, width: 36, height: 36, cursor: "pointer", fontSize: 20 }}
              >×</button>
            </div>

            {(localSlots.length > 1 || !isLocal) && localSlots.length > 0 && (
              <label style={{ display: "grid", gap: 6, marginTop: 18, fontWeight: 700 }}>
                Local Slot
                <select
                  value={slotId}
                  onChange={(e) => {
                    setSlotId(e.target.value);
                    setNotice("");
                    setError("");
                  }}
                  style={{ padding: "11px 12px", borderRadius: 10, border: "1px solid #ccd8e7", background: "#fff" }}
                >
                  {localSlots.map((slot: any) => (
                    <option key={slot.id} value={slot.id}>Slot {slot.slot_number || "—"} · {slot.label || "LOCAL"}</option>
                  ))}
                </select>
              </label>
            )}

            {!isLocal ? (
              <div style={{ marginTop: 20, padding: 16, borderRadius: 14, background: "#fff7e8", color: "#875b00" }}>
                {localSlots.length > 0
                  ? "กำลังเลือก Local Slot ให้ผู้ช่วยเปลี่ยนบัญชี..."
                  : "บัญชี SCENOVA นี้ยังไม่มี Local Slot สำหรับเปลี่ยน MT5"}
              </div>
            ) : !account ? (
              <div style={{ marginTop: 20, padding: 16, borderRadius: 14, background: "#eef6ff", color: "#245989" }}>
                Slot นี้ยังไม่มีบัญชีเดิม ระบบจะผูกบัญชีแรกจาก EA อัตโนมัติ ให้เปิด MT5 แล้วใช้เมนูติดตั้ง/อัปเดต SCENOVA
              </div>
            ) : (
              <>
                <div style={{
                  marginTop: 20,
                  display: "grid",
                  gridTemplateColumns: "1fr auto 1fr",
                  alignItems: "center",
                  gap: 12,
                  padding: 16,
                  borderRadius: 16,
                  background: "#f7f9fc",
                  border: "1px solid #e2e8f1"
                }}>
                  <div>
                    <small style={{ color: "#7b8798" }}>บัญชีในระบบตอนนี้</small>
                    <div style={{ fontSize: 19, fontWeight: 900 }}>{currentAccount || "—"}</div>
                    <div style={{ color: "#687489", fontSize: 13 }}>{currentServer || "—"}</div>
                  </div>
                  <div style={{ fontSize: 24, color: "#6e55e9", fontWeight: 900 }}>→</div>
                  <div>
                    <small style={{ color: "#7b8798" }}>บัญชีใหม่ที่ตรวจพบ</small>
                    <div style={{ fontSize: 19, fontWeight: 900, color: pendingAccount ? "#0c8d68" : "#9aa4b2" }}>
                      {pendingAccount || "กำลังรอ..."}
                    </div>
                    <div style={{ color: "#687489", fontSize: 13 }}>{pendingServer || "เปิด/Login บัญชีใหม่ใน MT5"}</div>
                  </div>
                </div>

                {cannotChange && (
                  <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: "#fff0ed", color: "#a33c2c", fontWeight: 700 }}>
                    ยังเปลี่ยนไม่ได้: บอทยัง RUNNING หรือมี Position ค้าง {positions > 0 ? `(${positions} Position)` : ""}
                  </div>
                )}

                {!cannotChange && pendingAccount && (
                  <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: rebindReady ? "#eafaf4" : "#fff7e8", color: rebindReady ? "#087858" : "#875b00" }}>
                    {rebindReady
                      ? `พบบัญชีใหม่ ${pendingAccount} แล้ว พร้อมยืนยันใช้งาน`
                      : `พบบัญชี ${pendingAccount} แล้ว กำลังรอ Heartbeat ล่าสุดก่อนยืนยัน`}
                  </div>
                )}

                {!cannotChange && changeRequestActive && !pendingAccount && (
                  <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: "#eef6ff", color: "#245989", lineHeight: 1.55 }}>
                    <b>โหมดเปลี่ยนบัญชีทำงานอยู่</b><br/>
                    {eaOnline
                      ? "EA เชื่อมแล้ว · ระบบกำลังอ่าน Login/Server ใหม่ทุก 2 วินาที"
                      : agentAutoRepairing
                        ? "Agent ออนไลน์ · กำลัง Reload/Repair EA อัตโนมัติแบบ Safe เพื่ออ่านบัญชีใหม่ (อาจใช้เวลาประมาณ 15–45 วินาที)"
                        : agentOnline
                          ? "Agent ออนไลน์ แต่ EA ยังไม่กลับมา Heartbeat · สามารถใช้ปุ่มซ่อม/อัปเดตด้านล่างได้"
                          : "Agent/EA ยังไม่เชื่อม · ใช้ปุ่มซ่อม/อัปเดต SCENOVA ด้านล่าง"}
                  </div>
                )}

                {!cannotChange && !changeRequestActive && !pendingAccount && (
                  <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: "#f5f2ff", color: "#5743ad", lineHeight: 1.55 }}>
                    <b>วิธีใช้:</b> หยุดบอท/ปิด Position → Login บัญชีใหม่ใน MT5 → กด “เริ่มตรวจบัญชีใหม่” ด้านล่าง
                  </div>
                )}

                {showManualRepair && !cannotChange && (
                  <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: "#fff7e8", color: "#875b00", lineHeight: 1.55 }}>
                    <b>{softwareUpdateRequired ? "พบว่า SCENOVA/EA ควรอัปเดต" : "การเชื่อมต่อ EA ยังไม่พร้อม"}</b><br/>
                    กด “ซ่อม/อัปเดต SCENOVA” แล้วเปิดไฟล์ Setup ที่ดาวน์โหลด ระบบจะกลับมาตรวจบัญชีใหม่ต่ออัตโนมัติ
                  </div>
                )}

                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
                  {pendingAccount ? (
                    <button
                      type="button"
                      disabled={busy || !rebindReady || cannotChange}
                      onClick={confirmAccount}
                      style={primaryButton(Boolean(busy || !rebindReady || cannotChange))}
                    >
                      {busy ? "กำลังยืนยัน..." : `✓ ยืนยันใช้บัญชี ${pendingAccount}`}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy || cannotChange}
                      onClick={startChange}
                      style={primaryButton(Boolean(busy || cannotChange))}
                    >
                      {busy ? "กำลังตรวจ..." : changeRequestActive ? "↻ ตรวจบัญชีใหม่อีกครั้ง" : "↔ เริ่มตรวจบัญชีใหม่"}
                    </button>
                  )}

                  {showManualRepair && (
                    <button
                      type="button"
                      disabled={busy || cannotChange}
                      onClick={downloadRepairInstaller}
                      style={secondaryButton(Boolean(busy || cannotChange))}
                    >
                      🛠 ซ่อม / อัปเดต SCENOVA
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => refresh(slotId)}
                    style={secondaryButton(busy)}
                  >
                    ↻ ตรวจสถานะตอนนี้
                  </button>
                </div>

                <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                  <StatusBox label="Agent" value={agentOnline ? "ONLINE" : "OFFLINE"} good={agentOnline}/>
                  <StatusBox label="EA / Heartbeat" value={eaOnline ? "ONLINE" : agentAutoRepairing ? "AUTO REPAIR" : "WAITING"} good={eaOnline}/>
                  <StatusBox label="Safe" value={cannotChange ? "NOT READY" : "READY"} good={!cannotChange}/>
                </div>
              </>
            )}

            {notice && <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: "#eafaf4", color: "#087858" }}>{notice}</div>}
            {error && <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: "#fff0ed", color: "#a33c2c" }}>{error}</div>}
          </div>
        </div>
      )}
    </>
  );
}

function StatusBox({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div style={{ border: "1px solid #e2e8f1", borderRadius: 11, padding: 10, background: "#fafbfd" }}>
      <div style={{ color: "#7b8798", fontSize: 11 }}>{label}</div>
      <div style={{ marginTop: 3, fontWeight: 900, color: good ? "#0c8d68" : "#a96a00", fontSize: 12 }}>{value}</div>
    </div>
  );
}

function primaryButton(disabled: boolean) {
  return {
    border: 0,
    borderRadius: 11,
    padding: "12px 16px",
    fontWeight: 900,
    color: "#fff",
    background: disabled ? "#aeb6c2" : "linear-gradient(135deg,#5f3cf4,#8a5cff)",
    cursor: disabled ? "not-allowed" : "pointer",
    flex: "1 1 230px"
  } as const;
}

function secondaryButton(disabled: boolean) {
  return {
    border: "1px solid #cdd8e6",
    borderRadius: 11,
    padding: "12px 16px",
    fontWeight: 800,
    color: disabled ? "#9aa4b2" : "#30435c",
    background: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    flex: "1 1 180px"
  } as const;
}
