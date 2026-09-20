"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";
import { useSystemPopup } from "./SystemPopupProvider";

type DashboardSnapshot = {
  selectedSlot?: any;
  instance?: any;
  softwareUpdate?: any;
  liveStatus?: any;
  startTransition?: any;
};

type ManualAction = "UPDATE_EA_RESTART" | "CONNECT_MT5";
type BusyAction = ManualAction | "START_RECOVERY" | "";

const UI_PENDING_TIMEOUT_MS = 3 * 60_000;
const DASHBOARD_REFRESH_MS = 3_000;
const MOUNT_RECHECK_MS = 750;

export function Mt5ManualActionControls() {
  const { showPopup, confirmPopup } = useSystemPopup();
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [updateMount, setUpdateMount] = useState<Element | null>(null);
  const [connectMount, setConnectMount] = useState<Element | null>(null);
  const [runtimeStatusMount, setRuntimeStatusMount] = useState<Element | null>(null);
  const [persistentUpdateMount, setPersistentUpdateMount] = useState<Element | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [startIntentAt, setStartIntentAt] = useState<number | null>(null);
  const [updateIntentAt, setUpdateIntentAt] = useState<number | null>(null);
  const refreshInFlightRef = useRef(false);

  useEffect(() => {
    if (!notice && !error) return;
    const pending = !error && /^กำลัง/.test(notice);
    showPopup({
      tone: error ? "error" : pending ? "info" : "success",
      title: error ? "ดำเนินการไม่สำเร็จ" : pending ? "กำลังดำเนินการ" : "ดำเนินการสำเร็จ",
      message: error || notice,
      duration: pending ? 5000 : 3000
    });
  }, [notice, error, showPopup]);

  async function refresh(light = false) {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const result = await api("/bot/dashboard" + (light ? "?light=1" : ""));
      setData(previous => light && previous ? { ...previous, ...result } : result);

    } catch {
      // The dashboard owns its own auth/error UI. Do not create a second one.
    } finally {
      refreshInFlightRef.current = false;
    }
  }

  useEffect(() => {
    if (typeof window === "undefined" || !window.location.pathname.includes("/dashboard")) return;
    void refresh(false);
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refresh(true);
    }, DASHBOARD_REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  const slotId = String(data?.selectedSlot?.id || "");
  const isLocal = String(data?.selectedSlot?.mode || "").toUpperCase() === "LOCAL";
  const instance = data?.instance || {};
  const metrics = instance?.metrics || {};
  const update = data?.softwareUpdate || {};
  const liveStatus = data?.liveStatus || {};
  const desiredState = String(instance?.desired_state || "STOPPED").toUpperCase();
  const actualState = String(instance?.actual_state || "STOPPED").toUpperCase();
  const eaOnline = Boolean(instance?.mt5_online);
  const agentOnline = Boolean(instance?.agent_online || instance?.device_online);
  const positions = Math.max(0, Number(metrics?.positions || 0));
  const needsEaUpdate = Boolean(update?.eaUpdateRequired || update?.eaVersionMatch === false || update?.eaHashMatch === false || update?.runtimeContractMatch === false);
  const installerRequired = Boolean(update?.installerRequired);
  const softwareUpdateRequired = isLocal && Boolean(update?.required || installerRequired || needsEaUpdate);
  const installerVersion = String(update?.latestVersion || update?.latestInstallerVersion || update?.installerVersionRequired || "1.0.8");
  const actionName = String(metrics?.manualMt5ActionName || "");
  const actionStatus = String(metrics?.manualMt5ActionStatus || "");
  const actionMessage = String(metrics?.manualMt5ActionMessage || "");
  const actionRequestedAt = Date.parse(String(metrics?.manualMt5ActionRequestedAt || ""));
  const actionAgeMs = Number.isFinite(actionRequestedAt) ? Date.now() - actionRequestedAt : Number.POSITIVE_INFINITY;
  const actionFresh = actionAgeMs >= 0 && actionAgeMs <= UI_PENDING_TIMEOUT_MS;
  const updatePending = actionName === "UPDATE_EA_RESTART" && actionStatus === "PENDING" && actionFresh;
  const actionAckAt = Date.parse(String(metrics?.manualMt5ActionAckAt || ""));
  const actionAckAgeMs = Number.isFinite(actionAckAt) ? Date.now() - actionAckAt : Number.POSITIVE_INFINITY;
  const updateSettling = actionName === "UPDATE_EA_RESTART" && actionStatus === "ACKED" && needsEaUpdate && actionAckAgeMs >= 0 && actionAckAgeMs <= 30_000;
  const connectPending = actionName === "CONNECT_MT5" && actionStatus === "PENDING" && actionFresh;
  const staleUpdatePending = actionName === "UPDATE_EA_RESTART" && actionStatus === "PENDING" && !actionFresh;
  const staleConnectPending = actionName === "CONNECT_MT5" && actionStatus === "PENDING" && !actionFresh;
  const startRecoveryRequested = metrics?.startAfterRepairRequested === true;
  const startRecoveryStatus = String(metrics?.startAfterRepairStatus || "");
  const startRecoveryMessage = String(metrics?.startAfterRepairMessage || "");
  const botStarting = desiredState === "RUNNING" && actualState !== "RUNNING";
  const botRunning = actualState === "RUNNING";
  const startTransition = data?.startTransition || {};
  const startPhase = String(startTransition?.phase || "").toUpperCase();
  const startCommandStatus = String(startTransition?.commandStatus || "").toUpperCase();
  const settingsLocked = Boolean(startIntentAt || desiredState === "RUNNING" || actualState === "RUNNING");

  // When an EA update is required there must be exactly one path that may
  // restart MT5: the dedicated Update EA button. Recovery remains reconnect-only.
  const recoveryNeeded = isLocal && !needsEaUpdate && (!eaOnline || startRecoveryRequested);

  useEffect(() => {
    if (!startIntentAt) return;
    if (desiredState === "RUNNING" || actualState === "RUNNING") {
      setStartIntentAt(null);
      return;
    }
    const elapsed = Date.now() - startIntentAt;
    const timer = window.setTimeout(
      () => setStartIntentAt(null),
      Math.max(0, 4_000 - elapsed)
    );
    return () => window.clearTimeout(timer);
  }, [startIntentAt, desiredState, actualState]);

  useEffect(() => {
    if (!updateIntentAt) return;
    if (!needsEaUpdate || actionStatus === "FAILED") {
      setUpdateIntentAt(null);
      return;
    }
    if (updatePending || updateSettling) return;

    const elapsed = Date.now() - updateIntentAt;
    const timer = window.setTimeout(
      () => setUpdateIntentAt(null),
      Math.max(0, 20_000 - elapsed)
    );
    return () => window.clearTimeout(timer);
  }, [updateIntentAt, needsEaUpdate, actionStatus, updatePending, updateSettling]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const syncSettingsLock = () => {
      const buttons = document.querySelectorAll<HTMLButtonElement>(".cc-v6-command.settings");
      buttons.forEach(button => {
        button.disabled = settingsLocked;
        button.classList.toggle("scenova-settings-locked", settingsLocked);
        button.setAttribute("aria-disabled", settingsLocked ? "true" : "false");
        if (settingsLocked) {
          button.title = botStarting
            ? "ล็อกการตั้งค่าระหว่างกำลังเริ่มบอท"
            : "หยุดบอทก่อนจึงจะเปลี่ยนการตั้งค่าได้";
        } else if (button.title.includes("ล็อกการตั้งค่า") || button.title.includes("หยุดบอทก่อน")) {
          button.removeAttribute("title");
        }
      });
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const startButton = target.closest(".cc-v6-command.start, .cc-mobile-command.start") as HTMLButtonElement | null;
      if (startButton && !startButton.disabled) {
        setStartIntentAt(Date.now());
        window.setTimeout(() => void refresh(true), 250);
        window.setTimeout(() => void refresh(true), 1_250);
        return;
      }

      if (settingsLocked && target.closest(".cc-v6-command.settings")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    syncSettingsLock();
    document.addEventListener("click", handleClick, true);
    const id = window.setInterval(syncSettingsLock, MOUNT_RECHECK_MS);
    return () => {
      document.removeEventListener("click", handleClick, true);
      window.clearInterval(id);
    };
  }, [settingsLocked, botStarting]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const locate = () => {
      // Keep supporting the existing alert mount for compatibility, but the
      // persistent update panel below is now the canonical manual-update UI.
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

      const runState = document.querySelector(".cc-v6-run-state");
      const runStateParent = runState?.parentElement || null;
      let runtimeNode = runStateParent?.querySelector(".scenova-runtime-status-mount") || null;
      if (runState && runStateParent && !runtimeNode) {
        runtimeNode = document.createElement("div");
        runtimeNode.className = "scenova-runtime-status-mount";
        runState.insertAdjacentElement("afterend", runtimeNode);
      }
      setRuntimeStatusMount(current => current === runtimeNode ? current : runtimeNode);

      // The dashboard owns this slot so update notices stay out of the symbol header.
      const statusUpdateNode = document.getElementById("scenova-status-update-mount");
      if (statusUpdateNode) {
        setPersistentUpdateMount(current => current === statusUpdateNode ? current : statusUpdateNode);
        return;
      }

      const versionRow = document.querySelector(".cc-v6-version-row");
      const versionParent = versionRow?.parentElement || null;
      let persistentNode = versionParent?.querySelector(".scenova-persistent-update-mount") || null;
      if (softwareUpdateRequired && versionRow && versionParent && !persistentNode) {
        persistentNode = document.createElement("div");
        persistentNode.className = "scenova-persistent-update-mount";
        versionRow.insertAdjacentElement("afterend", persistentNode);
      }
      if (!softwareUpdateRequired && persistentNode) {
        persistentNode.remove();
        persistentNode = null;
      }
      setPersistentUpdateMount(current => current === persistentNode ? current : persistentNode);
    };

    locate();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") locate();
    }, MOUNT_RECHECK_MS);
    return () => window.clearInterval(id);
  }, [recoveryNeeded, needsEaUpdate, softwareUpdateRequired]);

  useEffect(() => {
    if (startRecoveryRequested && !needsEaUpdate) {
      setError("");
      setNotice(startRecoveryMessage || "กำลังเชื่อม MT5 และจะเริ่มบอทให้อัตโนมัติ");
      return;
    }
    if (startRecoveryStatus === "STARTED") {
      setError("");
      setNotice(startRecoveryMessage || "เชื่อม MT5 สำเร็จและเริ่มบอทแล้ว");
      return;
    }
    if (startRecoveryStatus === "FAILED" && !needsEaUpdate) {
      setNotice("");
      setError(startRecoveryMessage || "Auto Recovery ไม่สำเร็จ");
      return;
    }

    if (!actionStatus) return;
    if (staleUpdatePending || staleConnectPending) {
      setNotice("");
      setError("คำสั่งครั้งก่อนหมดเวลารอแล้ว ระบบหยุดไว้แล้ว กรุณากดปุ่มอีกครั้งเมื่อต้องการลองใหม่");
      return;
    }
    if (actionStatus === "ACKED") {
      setError("");
      setNotice(actionMessage || "ดำเนินการสำเร็จและตรวจการเชื่อมต่อแล้ว");
    } else if (actionStatus === "FAILED") {
      setNotice("");
      setError(actionMessage || "อัปเดตไม่สำเร็จ ระบบหยุดไว้แล้วและจะไม่รีโหลดซ้ำอัตโนมัติ กรุณากดใหม่เมื่อต้องการลองอีกครั้ง");
    }
  }, [
    actionStatus,
    actionMessage,
    staleUpdatePending,
    staleConnectPending,
    startRecoveryRequested,
    startRecoveryStatus,
    startRecoveryMessage,
    needsEaUpdate
  ]);

  async function downloadInstaller() {
    if (typeof document === "undefined" || !slotId) return false;
    const result = await api("/bot/installers/windows", {
      method: "POST",
      body: JSON.stringify({ slotId })
    });
    const code = String(result?.code || "").trim();
    const version = String(result?.installerVersion || installerVersion || "").trim();
    if (!code || !version) {
      throw new Error("ยังไม่มี SCENOVA Windows Installer สำหรับบัญชีนี้");
    }

    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/installer-download";
    form.style.display = "none";
    for (const [name, value] of [["code", code], ["version", version]]) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
    window.setTimeout(() => form.remove(), 1000);
    return true;
  }

  async function requestRecoveryStart() {
    if (!slotId || busyAction || startRecoveryRequested || needsEaUpdate) return;
    if (positions > 0) {
      setError("มี Position ค้างอยู่ ระบบจะไม่รีสตาร์ท MT5 ระหว่างมีออเดอร์");
      return;
    }
    if (installerRequired) {
      await downloadInstaller();
      setError("");
      setNotice(`ดาวน์โหลด SCENOVA ${installerVersion} แล้ว กรุณาเปิดไฟล์ติดตั้ง 1 ครั้ง จากนั้นจึงเชื่อม MT5 ใหม่`);
      return;
    }
    if (!agentOnline) {
      setError("Windows Agent ยังไม่ออนไลน์ กรุณาเปิด SCENOVA Agent ก่อน");
      return;
    }

    setBusyAction("START_RECOVERY");
    setError("");
    setNotice("กำลังส่งคำสั่งเชื่อม MT5...");
    try {
      const result = await api(
        "/bot/mt5/recover-start?slotId=" + encodeURIComponent(slotId),
        { method: "POST" }
      );
      setNotice(String(result?.message || "กำลังเชื่อม MT5 และจะเริ่มบอทให้อัตโนมัติ"));
      await refresh();
    } catch (e: any) {
      setNotice("");
      setError(String(e?.message || "เชื่อม MT5 อัตโนมัติไม่สำเร็จ"));
    } finally {
      setBusyAction("");
    }
  }

  async function requestAction(action: ManualAction) {
    if (!slotId || busyAction) return;
    if (action === "UPDATE_EA_RESTART" && (updatePending || updateSettling || updateIntentAt)) return;
    if (positions > 0) {
      setError("มีออเดอร์ค้างอยู่ กรุณาปิดออเดอร์ให้หมดก่อน");
      return;
    }

    const isUpdate = action === "UPDATE_EA_RESTART";
    const confirmed = await confirmPopup({
      tone:"warning",
      title:isUpdate ? "ยืนยันการอัปเดต" : "ยืนยันการเชื่อมต่อ MT5",
      message:isUpdate
        ? installerRequired
          ? `อัปเดต SCENOVA ${installerVersion} + EA ตอนนี้? ระบบจะดาวน์โหลด Agent รุ่นใหม่ก่อน และรีสตาร์ท MT5 ไม่เกิน 1 ครั้ง`
          : "ระบบจะหยุดบอทอย่างปลอดภัยและรีสตาร์ท MT5 ไม่เกิน 1 ครั้งเพื่อโหลด EA เวอร์ชันใหม่"
        : "ระบบอาจเปิดหรือรีสตาร์ท MT5 1 ครั้งเพื่อเชื่อมต่อ EA ใหม่",
      confirmLabel:isUpdate ? "อัปเดตตอนนี้" : "เชื่อมต่อ",
      cancelLabel:"ยกเลิก"
    });
    if (!confirmed) return;

    setBusyAction(action);
    if (isUpdate) setUpdateIntentAt(Date.now());
    setError("");
    setNotice("");

    if (isUpdate && installerRequired) {
      await downloadInstaller();
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
          ? `ดาวน์โหลด SCENOVA ${installerVersion} แล้ว กรุณาเปิดไฟล์ติดตั้ง จากนั้นกลับมากดอัปเดต EA 1 ครั้ง`
          : String(result?.message || "ส่งคำสั่งแล้ว กำลังดำเนินการ")
      );
      await refresh();
    } catch (e: any) {
      if (isUpdate && installerRequired) {
        setNotice(`ดาวน์โหลด SCENOVA ${installerVersion} แล้ว กรุณาเปิดไฟล์ติดตั้ง แล้วกดอัปเดต EA อีกครั้ง`);
      } else {
        setError(String(e?.message || "ส่งคำสั่งไม่สำเร็จ"));
      }
      if (isUpdate) setUpdateIntentAt(null);
    } finally {
      setBusyAction("");
    }
  }

  async function requestPersistentUpdate() {
    if (busyAction || positions > 0) return;
    if (installerRequired && !needsEaUpdate) {
      try {
        setBusyAction("UPDATE_EA_RESTART");
        setError("");
        await downloadInstaller();
        setNotice(`ดาวน์โหลด SCENOVA ${installerVersion} แล้ว กรุณาเปิดไฟล์ติดตั้ง 1 ครั้ง ระบบจะไม่ติดตั้งหรือรีสตาร์ทเอง`);
      } catch (e: any) {
        setError(String(e?.message || "ดาวน์โหลดตัวติดตั้งไม่สำเร็จ"));
      } finally {
        setBusyAction("");
      }
      return;
    }
    await requestAction("UPDATE_EA_RESTART");
  }

  const updateDisabled = useMemo(
    () => Boolean(busyAction || updatePending || updateSettling || updateIntentAt || positions > 0 || (!agentOnline && !installerRequired)),
    [busyAction, updatePending, updateSettling, updateIntentAt, positions, agentOnline, installerRequired]
  );

  const startStage = useMemo(() => {
    if (botRunning) {
      const execution = String(metrics?.executionStatus || liveStatus?.code || "RUNNING");
      return {
        tone: "good",
        label: "บอททำงานอยู่",
        detail: `${String(liveStatus?.label || "EA Runtime = RUNNING")} · ${execution}`
      };
    }
    if (botStarting) {
      if (startCommandStatus === "ACKED" || startPhase === "WAITING_HEARTBEAT") {
        return {
          tone: "warn",
          label: "EA รับและยืนยันคำสั่งแล้ว",
          detail: "START = ACKED · กำลังรอ Runtime เปลี่ยนเป็น RUNNING"
        };
      }
      if (startCommandStatus === "DELIVERED" || startPhase === "DELIVERED_TO_EA") {
        return {
          tone: "warn",
          label: "ส่งคำสั่งถึง EA แล้ว",
          detail: "START = DELIVERED · กำลังรอ EA ยืนยันและเริ่ม Runtime"
        };
      }
      return {
        tone: "warn",
        label: "คำสั่ง Start อยู่ในคิว",
        detail: "START = PENDING · Server จะคง RUNNING ไว้จนกว่า EA จะรับหรือผู้ใช้กดหยุดเอง"
      };
    }
    if (desiredState === "SAFE_STOP" || actualState === "SAFE_STOP") {
      return {
        tone: "safe",
        label: "Safe Stop",
        detail: positions > 0
          ? `หยุดเปิดรอบใหม่แล้ว · กำลังดูแล ${positions} Position ที่ค้างอยู่`
          : "บอทหยุดเปิดรอบใหม่แล้ว · พร้อมเริ่มใหม่เมื่อสถานะนิ่ง"
      };
    }
    return {
      tone: "neutral",
      label: "บอทหยุดอยู่",
      detail: eaOnline || agentOnline
        ? "ระบบเชื่อมต่ออยู่ · พร้อมรับคำสั่ง Start"
        : "รอ Windows Agent / EA เชื่อมต่อ"
    };
  }, [
    botRunning,
    botStarting,
    startCommandStatus,
    startPhase,
    metrics?.executionStatus,
    liveStatus?.code,
    liveStatus?.label,
    desiredState,
    actualState,
    positions,
    eaOnline,
    agentOnline
  ]);

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
              : updatePending || updateSettling || updateIntentAt || busyAction === "UPDATE_EA_RESTART"
                ? (updateSettling ? "กำลังยืนยันเวอร์ชัน..." : "กำลังอัปเดต...")
                : `อัปเดต EA v${String(update?.latestEaVersion || "ล่าสุด")}`}
          </button>
          {positions > 0 && <small>ปิดออเดอร์ให้หมดก่อน</small>}
          {installerRequired && <small>ติดตั้ง Agent รุ่นล่าสุด 1 ครั้ง แล้วกลับมากดอัปเดต EA</small>}
          {!agentOnline && !installerRequired && <small>Agent ยังไม่ออนไลน์</small>}
          {!installerRequired && agentOnline && <small>กด 1 ครั้ง = รีโหลด MT5 ไม่เกิน 1 รอบ · ล้มเหลวแล้วจะหยุดรอ</small>}
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
              ? "กำลังเชื่อมและเริ่มบอท"
              : "เชื่อม MT5 + เริ่มบอท"}
          </b>
          <small>
            {installerRequired
              ? `ต้องติดตั้ง SCENOVA ${installerVersion} ก่อน`
              : startRecoveryRequested
                ? "Auto Connect · ไม่ต้องกดซ้ำ"
                : agentOnline
                  ? "Auto Connect / Start"
                  : "Windows Agent Offline"}
          </small>
        </button>,
        connectMount
      )
    : null;

  const runtimeStatus = runtimeStatusMount
    ? createPortal(
        <div className={`scenova-runtime-status ${startStage.tone}`} aria-live="polite">
          <span className="scenova-runtime-dot" />
          <div>
            <b>{startStage.label}</b>
            <small>{startStage.detail}</small>
          </div>
          {settingsLocked && <em>Settings Locked</em>}
        </div>,
        runtimeStatusMount
      )
    : null;

  const persistentUpdatePanel = persistentUpdateMount && softwareUpdateRequired
    ? createPortal(
        <div className="scenova-persistent-update" role="status">
          <div className="scenova-persistent-update-copy">
            <b>มีเวอร์ชันที่ต้องอัปเดต</b>
            <small>
              {installerRequired
                ? `Agent ${String(update?.currentVersion || "—")} → ${String(update?.latestVersion || "—")}`
                : "Agent ตรงเวอร์ชัน"}
              {needsEaUpdate
                ? ` · EA ${String(update?.currentEaVersion || "—")} → ${String(update?.latestEaVersion || "—")}`
                : " · EA ตรงเวอร์ชัน"}
            </small>
            <small className="manual-only">{updatePending || updateIntentAt ? "คำสั่งกำลังทำงาน · ไม่ต้องกดซ้ำ" : updateSettling ? "Agent ทำเสร็จแล้ว · กำลังรอ EA รายงานเวอร์ชันใหม่" : "Manual Update เท่านั้น · ระบบจะไม่อัปเดตหรือรีสตาร์ทเอง"}</small>
          </div>
          <button
            type="button"
            disabled={updateDisabled || botRunning || botStarting}
            onClick={requestPersistentUpdate}
          >
            {busyAction === "UPDATE_EA_RESTART" || updatePending || updateSettling || updateIntentAt
              ? (updateSettling ? "กำลังยืนยันเวอร์ชัน..." : "กำลังดำเนินการ...")
              : installerRequired && !needsEaUpdate
                ? `ดาวน์โหลด Agent v${installerVersion}`
                : installerRequired
                  ? `อัปเดต SCENOVA ${installerVersion} + EA`
                  : `อัปเดต EA v${String(update?.latestEaVersion || "ล่าสุด")}`}
          </button>
        </div>,
        persistentUpdateMount
      )
    : null;

  return (
    <>
      <style>{`
        /* The old dashboard alert auto-hid after 3 seconds. Replace it with the
           persistent manual-update panel rendered by this runtime guard. */
        .cc-update-alert{display:none!important}
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
        .cc-v6-command.settings.scenova-settings-locked{opacity:.42!important;filter:saturate(.45);cursor:not-allowed!important;transform:none!important}
        .scenova-runtime-status-mount{width:100%;margin:8px 0 10px}
        .scenova-runtime-status{display:flex;align-items:center;gap:10px;width:100%;border:1px solid rgba(120,132,170,.22);background:rgba(10,15,28,.76);border-radius:12px;padding:9px 11px;box-sizing:border-box}
        .scenova-runtime-status>div{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}
        .scenova-runtime-status b{font-size:11px;color:#e9eefb}.scenova-runtime-status small{font-size:9px;color:#8792ac;line-height:1.45}
        .scenova-runtime-status em{font-style:normal;font-size:8px;font-weight:900;letter-spacing:.05em;color:#c8adff;border:1px solid rgba(153,111,255,.28);background:rgba(102,67,184,.16);border-radius:999px;padding:4px 7px;white-space:nowrap}
        .scenova-runtime-dot{width:8px;height:8px;border-radius:50%;background:#7b879f;box-shadow:0 0 12px rgba(123,135,159,.35);flex:none}
        .scenova-runtime-status.good{border-color:rgba(72,219,160,.28);background:linear-gradient(90deg,rgba(19,64,52,.34),rgba(10,15,28,.72))}.scenova-runtime-status.good .scenova-runtime-dot{background:#65e0ae;box-shadow:0 0 14px rgba(101,224,174,.6)}
        .scenova-runtime-status.warn{border-color:rgba(242,191,86,.3);background:linear-gradient(90deg,rgba(91,66,20,.34),rgba(10,15,28,.72))}.scenova-runtime-status.warn .scenova-runtime-dot{background:#f3c65d;box-shadow:0 0 14px rgba(243,198,93,.55)}
        .scenova-runtime-status.safe{border-color:rgba(242,191,86,.22)}
        .scenova-runtime-status.bad{border-color:rgba(255,89,119,.34);background:linear-gradient(90deg,rgba(102,28,45,.38),rgba(10,15,28,.74))}.scenova-runtime-status.bad .scenova-runtime-dot{background:#ff6d88;box-shadow:0 0 14px rgba(255,109,136,.55)}
        .scenova-persistent-update-mount{width:100%;margin-top:8px}
        .scenova-persistent-update{display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;border:1px solid rgba(242,191,86,.32);background:linear-gradient(110deg,rgba(85,60,18,.38),rgba(33,22,18,.42));border-radius:12px;padding:9px 10px}
        .scenova-persistent-update-copy{display:flex;flex:1;min-width:0;flex-direction:column;gap:2px}.scenova-persistent-update-copy b{font-size:10px;color:#ffe09a}.scenova-persistent-update-copy small{font-size:8px;color:#bfa97f}.scenova-persistent-update-copy .manual-only{color:#d3b9ff}
        .scenova-persistent-update button{flex:none;border:1px solid rgba(242,191,86,.42);background:linear-gradient(135deg,rgba(116,82,20,.62),rgba(73,46,20,.52));color:#ffe5a7;border-radius:10px;padding:8px 11px;font-size:9px;font-weight:900;cursor:pointer;white-space:nowrap}.scenova-persistent-update button:disabled{opacity:.45;cursor:not-allowed}
        @media(max-width:980px){#scenova-ea-update-action-mount{justify-content:flex-start}.scenova-manual-action-wrap{align-items:flex-start}.scenova-persistent-update{align-items:flex-start;flex-direction:column}.scenova-persistent-update button{width:100%}}
        @media(max-width:720px){.scenova-manual-action{width:100%}.scenova-runtime-status{align-items:flex-start;flex-wrap:wrap}.scenova-runtime-status em{margin-left:18px}}
      `}</style>
      {updateButton}
      {recoveryButton}
      {runtimeStatus}
      {persistentUpdatePanel}
    </>
  );
}
