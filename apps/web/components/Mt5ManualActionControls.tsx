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
type BusyAction = ManualAction | "START_RECOVERY" | "";

const UI_PENDING_TIMEOUT_MS = 3 * 60_000;

export function Mt5ManualActionControls() {
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [updateMount, setUpdateMount] = useState<Element | null>(null);
  const [connectMount, setConnectMount] = useState<Element | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>("");
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
  const installerVersion = String(update?.latestVersion || update?.latestInstallerVersion || update?.installerVersionRequired || "3.1.3");
  const installerDownloadPath = String(update?.downloadPath || "/downloads/SCENOVA-Setup.exe");
  const actionName = String(metrics?.manualMt5ActionName || "");
  const actionStatus = String(metrics?.manualMt5ActionStatus || "");
  const actionMessage = String(metrics?.manualMt5ActionMessage || "");
  const actionRequestedAt = Date.parse(String(metrics?.manualMt5ActionRequestedAt || ""));
  const actionAgeMs = Number.isFinite(actionRequestedAt) ? Date.now() - actionRequestedAt : Number.POSITIVE_INFINITY;
  const actionFresh = actionAgeMs >= 0 && actionAgeMs <= UI_PENDING_TIMEOUT_MS;
  const updatePending = actionName === "UPDATE_EA_RESTART" && actionStatus === "PENDING" && actionFresh;
  const connectPending = actionName === "CONNECT_MT5" && actionStatus === "PENDING" && actionFresh;
  const staleUpdatePending = actionName === "UPDATE_EA_RESTART" && actionStatus === "PENDING" && !actionFresh;
  const staleConnectPending = actionName === "CONNECT_MT5" && actionStatus === "PENDING" && !actionFresh;
  const startRecoveryRequested = metrics?.startAfterRepairRequested === true;
  const startRecoveryStatus = String(metrics?.startAfterRepairStatus || "");
  const startRecoveryMessage = String(metrics?.startAfterRepairMessage || "");
  const recoveryNeeded = isLocal && (needsEaUpdate || !eaOnline || startRecoveryRequested);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const locate = () => {
      // Use a stable mount rendered inside the alert action column. The old
      // text-query/append approach created a fourth grid item in a three-column
      // row, so the button overlapped the copy and appeared to be missing.
      const updateNode = document.getElementById("scenova-ea-update-action-mount");
      setUpdateMount(current => current === updateNode ? current : updateNode);

      const hero = document.querySelector(".cc-v6-hero-actions");
      let connectNode = hero?.querySelector(".scenova-manual-mt5-connect-mount") || null;
      if (hero && recoveryNeeded && !connectNode) {
        connectNode = document.createElement("div");
        connectNode.className = "scenova-manual-mt5-connect-mount";
        hero.insertBefore(connectNode, hero.firstChild);
      }
      if (hero) {
        if (recoveryNeeded) hero.classList.add("scenova-mt5-connect-mode");
        else hero.classList.remove("scenova-mt5-connect-mode");
      }
      if (!recoveryNeeded && connectNode) {
        connectNode.remove();
        connectNode = null;
      }
      setConnectMount(current => current === connectNode ? current : connectNode);
    };

    locate();
    const id = window.setInterval(locate, 500);
    return () => window.clearInterval(id);
  }, [recoveryNeeded, needsEaUpdate]);

  useEffect(() => {
    if (startRecoveryRequested) {
      setError("");
      setNotice(startRecoveryMessage || "กำลังซ่อม EA / เชื่อม MT5 และจะเริ่มบอทให้อัตโนมัติ");
      return;
    }
    if (startRecoveryStatus === "STARTED") {
      setError("");
      setNotice(startRecoveryMessage || "ซ่อม EA สำเร็จและเริ่มบอทแล้ว");
      return;
    }
    if (startRecoveryStatus === "FAILED") {
      setNotice("");
      setError(startRecoveryMessage || "Auto Recovery ไม่สำเร็จ");
      return;
    }

    if (!actionStatus) return;
    if (staleUpdatePending || staleConnectPending) {
      setNotice("");
      setError("คำสั่งครั้งก่อนหมดเวลารอแล้ว กรุณากดปุ่มอีกครั้ง ระบบจะสร้างคำสั่งใหม่ให้ทันที");
      return;
    }
    if (actionStatus === "ACKED") {
      setError("");
      setNotice(actionMessage || "ดำเนินการสำเร็จและตรวจการเชื่อมต่อแล้ว");
    } else if (actionStatus === "FAILED") {
      setNotice("");
      setError(actionMessage || "ดำเนินการกับ MT5 ไม่สำเร็จ กรุณาลองอีกครั้ง");
    }
  }, [
    actionStatus,
    actionMessage,
    staleUpdatePending,
    staleConnectPending,
    startRecoveryRequested,
    startRecoveryStatus,
    startRecoveryMessage
  ]);

  function downloadInstaller() {
    if (typeof document === "undefined") return;
    const separator = installerDownloadPath.includes("?") ? "&" : "?";
    const link = document.createElement("a");
    link.href = installerDownloadPath + separator + "v=" + encodeURIComponent(installerVersion) + "&t=" + Date.now();
    link.download = "";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function requestRecoveryStart() {
    if (!slotId || busyAction || startRecoveryRequested) return;
    if (positions > 0) {
      setError("มี Position ค้างอยู่ ระบบจะไม่รีสตาร์ท MT5 ระหว่างมีออเดอร์");
      return;
    }
    if (installerRequired) {
      downloadInstaller();
      setError("");
      setNotice(`ดาวน์โหลด SCENOVA ${installerVersion} แล้ว กรุณาเปิดไฟล์ติดตั้ง 1 ครั้ง จากนั้นระบบจะซ่อม EA และเริ่มบอทต่อได้`);
      return;
    }
    if (!agentOnline) {
      setError("Windows Agent ยังไม่ออนไลน์ กรุณาเปิด SCENOVA Agent ก่อน");
      return;
    }

    setBusyAction("START_RECOVERY");
    setError("");
    setNotice("กำลังส่งคำสั่ง Auto Recovery...");
    try {
      const result = await api(
        "/bot/mt5/recover-start?slotId=" + encodeURIComponent(slotId),
        { method: "POST" }
      );
      setNotice(String(result?.message || "กำลังซ่อม EA และจะเริ่มบอทให้อัตโนมัติ"));
      await refresh();
    } catch (e: any) {
      setNotice("");
      setError(String(e?.message || "เริ่ม Auto Recovery ไม่สำเร็จ"));
    } finally {
      setBusyAction("");
    }
  }

  async function requestAction(action: ManualAction) {
    if (!slotId || busyAction) return;
    if (positions > 0) {
      setError("มีออเดอร์ค้างอยู่ กรุณาปิดออเดอร์ให้หมดก่อน");
      return;
    }

    const isUpdate = action === "UPDATE_EA_RESTART";
    const confirmed = window.confirm(
      isUpdate
        ? installerRequired
          ? `อัปเดต SCENOVA ${installerVersion} + EA ตอนนี้? ระบบจะดาวน์โหลด Agent รุ่นใหม่ก่อน และหลังติดตั้งจะรีสตาร์ท MT5 1 ครั้งเพื่อโหลด EA ล่าสุด`
          : "อัปเดต EA ตอนนี้? ระบบจะหยุดบอทอย่างปลอดภัย แล้วรีสตาร์ท MT5 1 ครั้งเพื่อโหลด EA เวอร์ชันใหม่"
        : "เชื่อมต่อ MT5 ตอนนี้? ระบบอาจเปิดหรือรีสตาร์ท MT5 1 ครั้งเพื่อเชื่อมต่อ EA ใหม่"
    );
    if (!confirmed) return;

    setBusyAction(action);
    setError("");
    setNotice("");

    if (isUpdate && installerRequired) {
      downloadInstaller();
      if (!agentOnline) {
        setNotice(`ดาวน์โหลด SCENOVA ${installerVersion} แล้ว กรุณาเปิดไฟล์ติดตั้ง 1 ครั้ง จากนั้นกลับมากดอัปเดต EA อีกครั้ง`);
        setBusyAction("");
        return;
      }
    } else if (!agentOnline) {
      setError("Windows Agent ยังไม่ออนไลน์ กรุณาติดตั้ง/เปิด SCENOVA Agent ก่อน");
      setBusyAction("");
      return;
    }

    try {
      const result = await api(
        "/bot/mt5/manual-action?slotId=" + encodeURIComponent(slotId),
        {
          method: "POST",
          body: JSON.stringify({ action })
        }
      );
      setNotice(
        isUpdate && installerRequired
          ? `ดาวน์โหลด SCENOVA ${installerVersion} แล้ว กรุณาเปิดไฟล์ติดตั้ง ระบบจะรับคำสั่ง EA ต่อให้อัตโนมัติ`
          : String(result?.message || "ส่งคำสั่งแล้ว กำลังดำเนินการ")
      );
      await refresh();
    } catch (e: any) {
      if (isUpdate && installerRequired) {
        setNotice(`ดาวน์โหลด SCENOVA ${installerVersion} แล้ว กรุณาเปิดไฟล์ติดตั้ง แล้วกดอัปเดต EA อีกครั้ง`);
      } else {
        setError(String(e?.message || "ส่งคำสั่งไม่สำเร็จ"));
      }
    } finally {
      setBusyAction("");
    }
  }

  const updateDisabled = useMemo(
    () => Boolean(busyAction || updatePending || positions > 0 || (!agentOnline && !installerRequired)),
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
              ? `อัปเดต SCENOVA ${installerVersion} + EA`
              : updatePending || busyAction === "UPDATE_EA_RESTART"
                ? "กำลังอัปเดต..."
                : `อัปเดต EA v${String(update?.latestEaVersion || "ล่าสุด")}`}
          </button>
          {positions > 0 && <small>ปิดออเดอร์ให้หมดก่อน</small>}
          {installerRequired && <small>ติดตั้ง Agent รุ่นล่าสุด 1 ครั้ง แล้ว Auto Recovery จะทำต่อเอง</small>}
          {!agentOnline && !installerRequired && <small>Agent ยังไม่ออนไลน์</small>}
        </div>,
        updateMount
      )
    : null;

  const recoveryButton = connectMount && recoveryNeeded
    ? createPortal(
        <button
          type="button"
          className="cc-v6-command scenova-connect-command"
          disabled={Boolean(
            busyAction ||
            startRecoveryRequested ||
            !agentOnline ||
            positions > 0 ||
            installerRequired
          )}
          onClick={requestRecoveryStart}
        >
          <span className="scenova-connect-icon">↻</span>
          <b>
            {startRecoveryRequested || busyAction === "START_RECOVERY"
              ? "กำลังซ่อมและเริ่มบอท"
              : needsEaUpdate
                ? "ซ่อม EA + เริ่มบอท"
                : "เชื่อม MT5 + เริ่มบอท"}
          </b>
          <small>
            {installerRequired
              ? `ต้องติดตั้ง SCENOVA ${installerVersion} ก่อน`
              : startRecoveryRequested
                ? "Auto Recovery · ไม่ต้องกดซ้ำ"
                : needsEaUpdate
                  ? `EA ${String(update?.currentEaVersion || "—")} → ${String(update?.latestEaVersion || "ล่าสุด")}`
                  : agentOnline
                    ? "Auto Connect / Start"
                    : "Windows Agent Offline"}
          </small>
        </button>,
        connectMount
      )
    : null;

  if (!isLocal) return null;

  return (
    <>
      <style>{`
        #scenova-ea-update-action-mount{display:flex;justify-content:flex-end;width:100%;margin-top:4px}
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
        .scenova-manual-toast{position:fixed;right:22px;bottom:22px;z-index:9999;max-width:430px;border-radius:14px;padding:12px 15px;font-size:12px;font-weight:750;box-shadow:0 16px 50px rgba(0,0,0,.32)}
        .scenova-manual-toast.ok{background:#102a23;border:1px solid rgba(70,207,158,.35);color:#9aebcc}
        .scenova-manual-toast.err{background:#31161d;border:1px solid rgba(255,98,120,.38);color:#ffb3c0}
        @media(max-width:980px){#scenova-ea-update-action-mount{justify-content:flex-start}.scenova-manual-action-wrap{align-items:flex-start}}
        @media(max-width:720px){.scenova-manual-action{width:100%}.scenova-manual-toast{left:14px;right:14px;bottom:14px}}
      `}</style>
      {updateButton}
      {recoveryButton}
      {notice && <div className="scenova-manual-toast ok">{notice}</div>}
      {error && <div className="scenova-manual-toast err">{error}</div>}
    </>
  );
}
