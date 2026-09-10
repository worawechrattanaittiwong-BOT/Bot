"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";

type DashboardSnapshot = {
  selectedSlot?: any;
  instance?: any;
  softwareUpdate?: any;
};

type ManualAction = "UPDATE_EA_RESTART" | "CONNECT_MT5";

export function Mt5ManualActionControls() {
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [updateMount, setUpdateMount] = useState<Element | null>(null);
  const [connectMount, setConnectMount] = useState<Element | null>(null);
  const [busyAction, setBusyAction] = useState<ManualAction | "">("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const result = await api("/bot/dashboard");
      setData(result);
    } catch {
      // The dashboard owns its own auth/error UI. Do not create a second one.
    }
  }

  useEffect(() => {
    if (typeof window === "undefined" || !window.location.pathname.includes("/dashboard")) return;
    refresh();
    const id = window.setInterval(refresh, 2000);
    return () => window.clearInterval(id);
  }, []);

  const slotId = String(data?.selectedSlot?.id || "");
  const isLocal = String(data?.selectedSlot?.mode || "").toUpperCase() === "LOCAL";
  const instance = data?.instance || {};
  const metrics = instance?.metrics || {};
  const update = data?.softwareUpdate || {};
  const eaOnline = Boolean(instance?.mt5_online);
  const agentOnline = Boolean(instance?.agent_online || instance?.device_online);
  const positions = Math.max(0, Number(metrics?.positions || 0));
  const needsEaUpdate = Boolean(update?.eaUpdateRequired || update?.eaVersionMatch === false);
  const installerRequired = Boolean(update?.installerRequired);
  const actionName = String(metrics?.manualMt5ActionName || "");
  const actionStatus = String(metrics?.manualMt5ActionStatus || "");
  const actionMessage = String(metrics?.manualMt5ActionMessage || "");
  const updatePending = actionName === "UPDATE_EA_RESTART" && actionStatus === "PENDING";
  const connectPending = actionName === "CONNECT_MT5" && actionStatus === "PENDING";
  const connectNeeded = isLocal && !eaOnline;

  useEffect(() => {
    if (typeof document === "undefined") return;

    const locate = () => {
      const updateRow = Array.from(document.querySelectorAll(".cc-update-alert-row"))
        .find((node) => (node.textContent || "").includes("EA Runtime ไม่ตรงเวอร์ชัน"));

      let updateNode = updateRow?.querySelector(".scenova-manual-ea-update-mount") || null;
      if (updateRow && !updateNode) {
        updateNode = document.createElement("div");
        updateNode.className = "scenova-manual-ea-update-mount";
        updateRow.appendChild(updateNode);
      }
      setUpdateMount(current => current === updateNode ? current : updateNode);

      const hero = document.querySelector(".cc-v6-hero-actions");
      let connectNode = hero?.querySelector(".scenova-manual-mt5-connect-mount") || null;
      if (hero && connectNeeded && !connectNode) {
        connectNode = document.createElement("div");
        connectNode.className = "scenova-manual-mt5-connect-mount";
        hero.insertBefore(connectNode, hero.firstChild);
      }
      if (hero) {
        if (connectNeeded) hero.classList.add("scenova-mt5-connect-mode");
        else hero.classList.remove("scenova-mt5-connect-mode");
      }
      if (!connectNeeded && connectNode) {
        connectNode.remove();
        connectNode = null;
      }
      setConnectMount(current => current === connectNode ? current : connectNode);
    };

    locate();
    const id = window.setInterval(locate, 500);
    return () => window.clearInterval(id);
  }, [connectNeeded, needsEaUpdate]);

  useEffect(() => {
    if (!actionStatus) return;
    if (actionStatus === "ACKED") {
      setError("");
      setNotice(actionMessage || "MT5 รับคำสั่งแล้ว กำลังรอการเชื่อมต่อกลับมา");
    } else if (actionStatus === "FAILED") {
      setNotice("");
      setError(actionMessage || "ดำเนินการกับ MT5 ไม่สำเร็จ กรุณาลองอีกครั้ง");
    }
  }, [actionStatus, actionMessage]);

  async function requestAction(action: ManualAction) {
    if (!slotId || busyAction) return;
    if (positions > 0) {
      setError("มีออเดอร์ค้างอยู่ กรุณาปิดออเดอร์ให้หมดก่อน");
      return;
    }
    if (!agentOnline) {
      setError("Windows Agent ยังไม่ออนไลน์ กรุณาอัปเดต/เปิด SCENOVA Agent ก่อน");
      return;
    }

    const confirmed = window.confirm(
      action === "UPDATE_EA_RESTART"
        ? "อัปเดต EA ตอนนี้? ระบบจะหยุดบอทอย่างปลอดภัย แล้วรีสตาร์ท MT5 1 ครั้งเพื่อโหลด EA เวอร์ชันใหม่"
        : "เชื่อมต่อ MT5 ตอนนี้? ระบบอาจเปิดหรือรีสตาร์ท MT5 1 ครั้งเพื่อเชื่อมต่อ EA ใหม่"
    );
    if (!confirmed) return;

    setBusyAction(action);
    setError("");
    setNotice("");
    try {
      const result = await api(
        "/bot/mt5/manual-action?slotId=" + encodeURIComponent(slotId),
        {
          method: "POST",
          body: JSON.stringify({ action })
        }
      );
      setNotice(String(result?.message || "ส่งคำสั่งแล้ว กำลังดำเนินการ"));
      await refresh();
    } catch (e: any) {
      setError(String(e?.message || "ส่งคำสั่งไม่สำเร็จ"));
    } finally {
      setBusyAction("");
    }
  }

  const updateDisabled = useMemo(
    () => Boolean(busyAction || updatePending || positions > 0 || !agentOnline || installerRequired),
    [busyAction, updatePending, positions, agentOnline, installerRequired]
  );

  const updateButton = updateMount && needsEaUpdate
    ? createPortal(
        <div className="scenova-manual-action-wrap">
          <button
            type="button"
            className="scenova-manual-action update"
            disabled={updateDisabled}
            onClick={() => requestAction("UPDATE_EA_RESTART")}
          >
            {installerRequired
              ? "อัปเดต SCENOVA Agent ก่อน"
              : updatePending || busyAction === "UPDATE_EA_RESTART"
                ? "กำลังอัปเดต..."
                : "อัปเดต EA ตอนนี้"}
          </button>
          {positions > 0 && <small>ปิดออเดอร์ให้หมดก่อน</small>}
          {!agentOnline && <small>Agent ยังไม่ออนไลน์</small>}
        </div>,
        updateMount
      )
    : null;

  const connectButton = connectMount && connectNeeded
    ? createPortal(
        <button
          type="button"
          className="cc-v6-command scenova-connect-command"
          disabled={Boolean(busyAction || connectPending || !agentOnline || positions > 0)}
          onClick={() => requestAction("CONNECT_MT5")}
        >
          <span className="scenova-connect-icon">↻</span>
          <b>{connectPending || busyAction === "CONNECT_MT5" ? "กำลังเชื่อมต่อ" : "เชื่อมต่อ MT5"}</b>
          <small>{agentOnline ? "Connect / Restart MT5" : "Windows Agent Offline"}</small>
        </button>,
        connectMount
      )
    : null;

  if (!isLocal) return null;

  return (
    <>
      <style>{`
        .scenova-manual-ea-update-mount{grid-column:3;align-self:center;justify-self:end}
        .scenova-manual-action-wrap{display:flex;flex-direction:column;align-items:flex-end;gap:4px}
        .scenova-manual-action{border:1px solid rgba(255,118,138,.36);background:linear-gradient(135deg,rgba(174,42,70,.34),rgba(100,32,64,.28));color:#ffd5dc;border-radius:11px;padding:9px 14px;font-size:11px;font-weight:900;cursor:pointer;white-space:nowrap;box-shadow:0 8px 24px rgba(85,20,39,.16)}
        .scenova-manual-action:hover:not(:disabled){border-color:rgba(255,140,158,.64);transform:translateY(-1px)}
        .scenova-manual-action:disabled{opacity:.48;cursor:not-allowed;transform:none}
        .scenova-manual-action-wrap small{font-size:8px;color:#c98c98}
        .scenova-manual-mt5-connect-mount{display:contents}
        .scenova-mt5-connect-mode>.cc-v6-command.start{display:none!important}
        .scenova-connect-command{border-color:rgba(68,165,255,.38)!important;background:linear-gradient(145deg,rgba(18,82,139,.82),rgba(24,112,172,.56))!important;color:#dff4ff!important}
        .scenova-connect-command b{color:#f1fbff!important}.scenova-connect-command small{color:#9bd3f4!important}
        .scenova-connect-icon{font-size:22px;font-weight:900;color:#8cdbff}
        .scenova-manual-toast{position:fixed;right:22px;bottom:22px;z-index:9999;max-width:390px;border-radius:14px;padding:12px 15px;font-size:12px;font-weight:750;box-shadow:0 16px 50px rgba(0,0,0,.32)}
        .scenova-manual-toast.ok{background:#102a23;border:1px solid rgba(70,207,158,.35);color:#9aebcc}
        .scenova-manual-toast.err{background:#31161d;border:1px solid rgba(255,98,120,.38);color:#ffb3c0}
        @media(max-width:980px){.scenova-manual-ea-update-mount{grid-column:2;justify-self:start}.scenova-manual-action-wrap{align-items:flex-start}}
        @media(max-width:720px){.scenova-manual-action{width:100%}.scenova-manual-toast{left:14px;right:14px;bottom:14px}}
      `}</style>
      {updateButton}
      {connectButton}
      {notice && <div className="scenova-manual-toast ok">{notice}</div>}
      {error && <div className="scenova-manual-toast err">{error}</div>}
    </>
  );
}
