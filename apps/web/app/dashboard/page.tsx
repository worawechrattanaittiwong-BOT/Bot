"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import { OwnerMobileNav, OwnerSidebar } from "../../components/OwnerSidebar";

type Dashboard = {
  user: any;
  slots: any[];
  selectedSlot: any;
  account: any;
  instance: any;
  settings: any;
  entitlement: any;
  trialRequest: any;
  liveStatus: any;
  softwareUpdate: any;
};

type BrokerCatalog = {
  code: string;
  name: string;
  servers: Array<{
    serverName: string;
    environment: "DEMO" | "REAL" | "UNKNOWN";
  }>;
};

type View = "overview" | "account" | "access";

const defaultSettings = {
  symbol: "XAUUSD",
  lot: 0.01,
  maxPositions: 10,
  basketTriggerMoney: 2,
  basketTrailMoney: 0.5,
  maxBasketLossMoney: 10,
  dailyLossMoney: 25,
  dailyProfitTargetMoney: 0,
  basketProfitTargetMoney: 0,
  perPositionProfitMoney: 0,
  perPositionLossMoney: 0,
  minOrderIntervalMs: 300,
  maxOrdersPerMinute: 120,
  entryMode: "AUTO_MOMENTUM"
};

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeView, setActiveView] = useState<View>("overview");
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const selectedSlotIdRef = useRef("");
  const [lineContact, setLineContact] = useState("");
  const [mode, setMode] = useState<"CLOUD"|"LOCAL">("LOCAL");
  const [accountNumber, setAccountNumber] = useState("");
  const [brokerCatalog, setBrokerCatalog] = useState<BrokerCatalog[]>([]);
  const [brokerCode, setBrokerCode] = useState("EXNESS");
  const [customBrokerName, setCustomBrokerName] = useState("");
  const [brokerServer, setBrokerServer] = useState("");
  const [customBrokerServer, setCustomBrokerServer] = useState("");
  const [tradingPassword, setTradingPassword] = useState("");
  const [installToken, setInstallToken] = useState("");
  const [installInstanceId, setInstallInstanceId] = useState("");
  const [activationMessage, setActivationMessage] = useState("");
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [botLogs, setBotLogs] = useState<any>(null);
  const [settings, setSettings] = useState<any>(defaultSettings);
  const settingsDirtyRef = useRef(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const mt5ApiBase =
    process.env.NEXT_PUBLIC_MT5_API_BASE ||
    (typeof window !== "undefined" ? window.location.origin + "/backend" : "");

  async function load(slotIdArg?: string) {
    try {
      const slotId = slotIdArg ?? selectedSlotIdRef.current;
      const d = await api("/bot/dashboard" + (slotId ? "?slotId=" + encodeURIComponent(slotId) : ""));
      setData(d);
      if (!settingsDirtyRef.current) {
        setSettings({
          ...defaultSettings,
          ...(d.settings || {}),
          ...(d.instance?.metrics?.symbol ? { symbol: d.instance.metrics.symbol } : {})
        });
      }
      const resolvedSlotId = String(d.selectedSlot?.id || "");
      if (resolvedSlotId && resolvedSlotId !== selectedSlotIdRef.current) {
        selectedSlotIdRef.current = resolvedSlotId;
        setSelectedSlotId(resolvedSlotId);
      }
      if (d.selectedSlot?.mode === "CLOUD" || d.selectedSlot?.mode === "LOCAL") {
        setMode(d.selectedSlot.mode);
      }
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem("bot_token")) {
      window.location.href = "/login";
      return;
    }

    const requestedView = new URLSearchParams(window.location.search).get("view");
    if (requestedView === "account" || requestedView === "access") {
      setActiveView(requestedView);
    } else {
      setActiveView("overview");
      if (requestedView === "settings") {
        window.setTimeout(() => document.getElementById("bot-settings")?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
      }
    }

    load("");
    api("/catalog/brokers")
      .then((rows)=>setBrokerCatalog(rows))
      .catch(()=>setBrokerCatalog([]));
    const id = setInterval(()=>load(selectedSlotIdRef.current), 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!logsOpen || !data?.instance?.id) return;
    let cancelled = false;
    const refreshLogs = async () => {
      try {
        setLogsLoading(true);
        const slotQuery = selectedSlotIdRef.current ? "?slotId=" + encodeURIComponent(selectedSlotIdRef.current) : "";
        const result = await api("/bot/logs" + slotQuery);
        if (!cancelled) setBotLogs(result);
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLogsLoading(false);
      }
    };
    refreshLogs();
    const id = setInterval(refreshLogs, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [logsOpen, data?.instance?.id, selectedSlotId]);

  const metrics = data?.instance?.metrics || {};
  const state = data?.instance?.actual_state || "OFFLINE";
  const desired = data?.instance?.desired_state || "STOPPED";
  const eaLastSeen = data?.instance?.last_seen_at
    ? new Date(data.instance.last_seen_at)
    : null;
  const isMt5Online = Boolean(data?.instance?.mt5_online) && state !== "OFFLINE";
  const eaLastSeenAgeSeconds = Number(data?.instance?.ea_last_seen_age_seconds ?? -1);
  const entitlement = data?.entitlement;
  const liveStatus = data?.liveStatus || {
    code: isMt5Online ? "RUNNING_READY" : "MT5_OFFLINE",
    label: isMt5Online ? "กำลังตรวจสอบสถานะบอท" : "MT5 ยังไม่เชื่อมต่อ",
    detail: isMt5Online ? "รอข้อมูล Execution จาก EA" : "เปิด MT5 และ EA บนกราฟ",
    tone: isMt5Online ? "neutral" : "bad",
    tradeReady: false
  };
  const hardStartBlocks = new Set([
    "NOT_INSTALLED",
    "MT5_OFFLINE",
    "TERMINAL_DISCONNECTED",
    "ALGO_TRADING_OFF",
    "EA_TRADING_DISABLED",
    "EA_RUNTIME_OUTDATED",
    "ACCOUNT_TRADING_DISABLED",
    "ACCOUNT_EXPERT_DISABLED",
    "SYMBOL_TRADING_DISABLED",
    "NO_ACCESS",
    "DAILY_PROFIT_LOCK"
  ]);
  const softwareUpdate = data?.softwareUpdate || { required: false, currentVersion: null, latestVersion: "", downloadPath: "" };
  const installerUpdateRequired = data?.selectedSlot?.mode === "LOCAL" && Boolean(softwareUpdate.required);
  const startBlocked =
    busy ||
    installerUpdateRequired ||
    !entitlement?.allowed ||
    hardStartBlocks.has(String(liveStatus.code || ""));
  const selectedBroker = brokerCatalog.find((item)=>item.code === brokerCode);
  const selectedBrokerName = brokerCode === "OTHER"
    ? customBrokerName.trim()
    : (selectedBroker?.name || brokerCode);
  const selectedServer = brokerServer === "__CUSTOM__"
    ? customBrokerServer.trim()
    : brokerServer;

  const accessExpiry = entitlement?.expiresAt ? new Date(entitlement.expiresAt) : null;
  const accessRemaining = accessExpiry ? Math.max(0, accessExpiry.getTime() - Date.now()) : null;
  const remainingText = accessRemaining === null ? "" :
    Math.floor(accessRemaining / 3600000).toString().padStart(2,"0") + ":" +
    Math.floor((accessRemaining % 3600000) / 60000).toString().padStart(2,"0") + ":" +
    Math.floor((accessRemaining % 60000) / 1000).toString().padStart(2,"0");

  const accessLabel = useMemo(() => {
    if (!entitlement) return "ยังไม่มีสิทธิ์ใช้งาน";
    if (entitlement.source === "OWNER") return "OWNER — ใช้งานได้ไม่จำกัด";
    if (entitlement.source === "TRIAL_READY") return "Trial พร้อมเริ่ม";
    if (entitlement.source === "TRIAL") return "Trial กำลังใช้งาน";
    if (entitlement.source === "SUBSCRIPTION") return "สมาชิกกำลังใช้งาน";
    if (entitlement.source === "TRIAL_EXPIRED") return "Trial หมดแล้ว";
    return "ยังไม่มีสิทธิ์ใช้งาน";
  }, [entitlement]);

  const connectionLabel = isMt5Online ? "เชื่อมต่อแล้ว" : data?.account ? "รอ MT5 เชื่อมต่อ" : "ยังไม่ได้เชื่อมบัญชี";
  const controlStateLabel =
    desired === "RUNNING"
      ? (state === "RUNNING" ? "บอทกำลังทำงาน" : "กำลังเริ่มบอท")
      : desired === "SAFE_STOP"
        ? "Safe Stop — ไม่เปิดออเดอร์ใหม่"
        : "บอทหยุดอยู่";
  const actualStateLabel =
    state === "RUNNING" ? "RUNNING — กำลังทำงาน"
      : state === "SAFE_STOP" ? "SAFE_STOP — ไม่เปิดออเดอร์ใหม่"
      : state === "STOPPED" ? "STOPPED — หยุด"
      : state;
  const desiredStateLabel =
    desired === "RUNNING" ? "RUNNING — ให้บอททำงาน"
      : desired === "SAFE_STOP" ? "SAFE_STOP — ห้ามเปิดออเดอร์ใหม่"
      : desired === "STOPPED" ? "STOPPED — หยุด"
      : desired;
  const agentLastSeen = data?.instance?.agent_last_seen_at
    ? new Date(data.instance.agent_last_seen_at)
    : null;
  const isAgentOnline = Boolean(data?.instance?.agent_online);
  const terminalDataPath = String(data?.instance?.agent_terminal_path || "").replace(/[\\/]+$/, "");
  const presetFolderPath = terminalDataPath
    ? terminalDataPath + "\\MQL5\\Presets"
    : "MQL5\\Presets";
  const presetFilePath = presetFolderPath + "\\SCENOVA-FastBasketBot.set";

  async function linkAccount(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!selectedBrokerName) throw new Error("กรุณาเลือก Broker");
      if (!selectedServer) throw new Error("กรุณาเลือก MT5 Server");
      const result = await api("/bot/mt5", {
        method: "POST",
        body: JSON.stringify({
          slotId: selectedSlotIdRef.current || undefined,
          accountNumber,
          broker: selectedBrokerName,
          brokerServer: selectedServer,
          mode: "CLOUD"
        })
      });
      setInstallToken(result.installToken || "");
      setInstallInstanceId(result.instance?.id || "");
      if (mode === "CLOUD" && tradingPassword) {
        await api("/bot/mt5/cloud-credential", {
          method: "POST",
          body: JSON.stringify({ mt5AccountId: result.account.id, tradingPassword })
        });
      }
      setNotice("บันทึกบัญชี MT5 แล้ว ขั้นต่อไปคือเชื่อม EA ให้ระบบเห็นสถานะจริง");
      await load();
      setActiveView("account");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadWindowsInstaller() {
    setBusy(true);
    setError("");
    setActivationMessage("");
    try {
      const actualRunningNow =
        data?.instance?.actual_state === "RUNNING" &&
        Boolean(data?.instance?.mt5_online);
      if (actualRunningNow || data?.instance?.desired_state === "RUNNING") {
        throw new Error("กรุณาหยุดบอทก่อนติดตั้งหรืออัปเดต SCENOVA");
      }

      await downloadInstallerForSlot(selectedSlotIdRef.current);
      setActivationMessage("ดาวน์โหลด SCENOVA Setup แล้ว ดับเบิลคลิกไฟล์ .exe ที่ได้จากหน้านี้เพื่อติดตั้ง ไม่ต้องใช้ CMD หรือ PowerShell");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadInstallerForSlot(slotId: string) {
    const result = await api("/bot/installers/windows", {
      method: "POST",
      body: JSON.stringify({ slotId: slotId || undefined })
    });
    if (!result?.downloadPath || !result?.fileName) {
      throw new Error("ยังไม่มี SCENOVA Windows Installer พร้อมดาวน์โหลด");
    }

    const response = await fetch(result.downloadPath, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("ไฟล์ SCENOVA Installer ยังไม่พร้อม กรุณาลองอีกครั้งหลังระบบ Build เสร็จ");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = result.fileName;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return result;
  }

  async function rebindDetectedAccount() {
    if (!data?.instance?.pending_account_number) return;
    const firstBind = !data?.account;
    const accountText =
      data.instance.pending_account_number +
      " (" + (data.instance.pending_broker_server || "ไม่ทราบ Server") + ")";

    if (!confirm(
      firstBind
        ? "ผูก MT5 " + accountText + " เข้ากับ Slot นี้เป็นบัญชีแรกใช่หรือไม่?"
        : "เปลี่ยน Slot นี้มาใช้ MT5 " + accountText + " ใช่หรือไม่?"
    )) return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api(
        "/bot/mt5/rebind?slotId=" + encodeURIComponent(selectedSlotIdRef.current),
        { method: "POST" }
      );
      setNotice(
        result?.firstBind
          ? "ผูกบัญชี MT5 แรกให้ Slot นี้แล้ว"
          : "เปลี่ยนบัญชี MT5 ให้ Slot นี้แล้ว ไม่ต้องเปลี่ยน .set หรือ Install Token"
      );
      await load(selectedSlotIdRef.current);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function requestTrial(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/bot/trial-request?slotId=" + encodeURIComponent(selectedSlotIdRef.current), {
        method: "POST",
        body: JSON.stringify({ lineContact })
      });
      setNotice("ส่งคำขอ Trial แล้ว กรุณาแจ้ง User ID และ LINE นี้กับผู้ดูแลเพื่อรออนุมัติ");
      setLineContact("");
      await load(selectedSlotIdRef.current);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function assignPartnerSlot(slot: any) {
    const target = prompt("กรอก Email หรือ User ID ของลูกค้าที่จะใช้ Slot #" + slot.slot_number);
    if (!target) return;
    setBusy(true);
    setError("");
    try {
      await api("/bot/slots/assign", {
        method: "POST",
        body: JSON.stringify({ slotId: slot.id, target })
      });
      setNotice("เปิด Slot #" + slot.slot_number + " ให้ " + target + " แล้ว");
      await load(selectedSlotIdRef.current);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function releasePartnerSlot(slot: any) {
    if (!confirm("คืน Slot #" + slot.slot_number + " และยกเลิกเครื่อง/MT5 ที่ผูกกับ Slot นี้ใช่หรือไม่?")) return;
    setBusy(true);
    setError("");
    try {
      await api("/bot/slots/release", {
        method: "POST",
        body: JSON.stringify({ slotId: slot.id })
      });
      setNotice("คืน Slot #" + slot.slot_number + " แล้ว พร้อมนำไปเปิดให้ผู้ใช้อื่น");
      await load(selectedSlotIdRef.current);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function selectSlot(slotId: string) {
    if (!slotId || slotId === selectedSlotIdRef.current) return;
    settingsDirtyRef.current = false;
    setSettingsDirty(false);
    selectedSlotIdRef.current = slotId;
    setSelectedSlotId(slotId);
    setError("");
    setNotice("");
    setActivationMessage("");
    load(slotId);
  }

  async function rotateInstallToken() {
    setBusy(true);
    setError("");
    setActivationMessage("");
    try {
      const result = await api("/bot/mt5/rotate-install-token", { method: "POST" });
      const instanceId = result.instanceId || data?.instance?.id || "";
      const token = result.installToken || "";
      setInstallInstanceId(instanceId);
      setInstallToken(token);
      if (instanceId && token) {
        const downloaded = downloadEaSet(instanceId, token);
        setActivationMessage(
          downloaded
            ? "สร้างรหัสเชื่อมต่อสำเร็จ ระบบเริ่มดาวน์โหลดไฟล์ .set แล้ว หากเบราว์เซอร์บล็อกให้กด “ดาวน์โหลดไฟล์ .set” อีกครั้ง"
            : "สร้างรหัสเชื่อมต่อสำเร็จแล้ว กด “ดาวน์โหลดไฟล์ .set” เพื่อบันทึกไฟล์"
        );
      } else {
        setActivationMessage("สร้างรหัสเชื่อมต่อสำเร็จแล้ว แต่ยังสร้างไฟล์ไม่ได้ กรุณาลองใหม่");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function downloadEaSet(instanceIdArg?: string, tokenArg?: string) {
    const instanceId = instanceIdArg || installInstanceId;
    const token = tokenArg || installToken;
    const apiBase =
      mt5ApiBase ||
      (typeof window !== "undefined" ? window.location.origin + "/backend" : "");
    if (!token || !instanceId || !apiBase) return false;
    const content = [
      "InpApiBase=" + apiBase,
      "InpInstanceId=" + instanceId,
      "InpInstallToken=" + token,
      "InpMagic=26090501",
      "InpLot=" + settings.lot,
      "InpMaxPositions=" + settings.maxPositions,
      "InpBasketTriggerMoney=" + settings.basketTriggerMoney,
      "InpBasketTrailMoney=" + settings.basketTrailMoney,
      "InpMaxBasketLossMoney=" + settings.maxBasketLossMoney,
      "InpDailyLossMoney=" + settings.dailyLossMoney,
      "InpMinOrderIntervalMs=" + settings.minOrderIntervalMs,
      "InpMaxOrdersPerMinute=" + settings.maxOrdersPerMinute,
      "InpEntryMode=" + (settings.entryMode === "BUY_ONLY" ? 1 : settings.entryMode === "SELL_ONLY" ? 2 : 0),
      "InpMomentumTicks=20",
      "InpMomentumEntryPoints=8.0",
      "InpStrongFlowPoints=25.0",
      "InpFlowTrailBoost=0.60",
      "InpPauseOnManualTrade=true",
      "InpHeartbeatSeconds=3",
      "InpMaxOfflineLeaseSeconds=600"
    ].join("\r\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "SCENOVA-FastBasketBot.set";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  async function resetMt5() {
    if (!confirm("ต้องการเปลี่ยนบัญชีหรือโหมด MT5 ใช่หรือไม่?")) return;
    setBusy(true);
    setError("");
    try {
      await api("/bot/mt5/reset?slotId=" + encodeURIComponent(selectedSlotIdRef.current), { method: "POST" });
      setInstallToken("");
      setInstallInstanceId("");
      await load();
      setActiveView("account");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function command(path: string, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const suffix = selectedSlotIdRef.current
        ? (path.includes("?") ? "&" : "?") + "slotId=" + encodeURIComponent(selectedSlotIdRef.current)
        : "";
      await api(path + suffix, { method: "POST" });
      setNotice(success);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function editSetting(key: string, value: any) {
    settingsDirtyRef.current = true;
    setSettingsDirty(true);
    setSettings((current:any)=>{
      const next = { ...current, [key]: value };

      // Profit closing modes are mutually exclusive. Whichever one the user
      // enters last becomes active and the other is turned off immediately.
      if (key === "perPositionProfitMoney" && Number(value || 0) > 0) {
        next.basketProfitTargetMoney = 0;
      }
      if (key === "basketProfitTargetMoney" && Number(value || 0) > 0) {
        next.perPositionProfitMoney = 0;
      }

      return next;
    });
  }

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const numericKeys = [
        "lot",
        "maxPositions",
        "dailyProfitTargetMoney",
        "basketProfitTargetMoney",
        "perPositionProfitMoney",
        "perPositionLossMoney",
        "basketTriggerMoney",
        "basketTrailMoney",
        "maxBasketLossMoney",
        "dailyLossMoney",
        "minOrderIntervalMs",
        "maxOrdersPerMinute"
      ];
      const requiredNumericKeys = new Set([
        "lot",
        "maxPositions",
        "basketTriggerMoney",
        "basketTrailMoney",
        "maxOrdersPerMinute"
      ]);
      const integerKeys = new Set([
        "maxPositions",
        "minOrderIntervalMs",
        "maxOrdersPerMinute"
      ]);

      const payload:any = { ...settings };
      for (const key of numericKeys) {
        const raw = payload[key];

        // Allow an empty field while the user is typing. On save, optional
        // risk controls use 0 (= disabled); required fields must be filled.
        if (raw === "" || raw === null || raw === undefined) {
          if (requiredNumericKeys.has(key)) {
            throw new Error("กรุณากรอกค่าช่องที่จำเป็นให้ครบก่อนบันทึก");
          }
          payload[key] = 0;
          continue;
        }

        const value = Number(raw);
        if (!Number.isFinite(value)) {
          throw new Error("พบค่าตัวเลขไม่ถูกต้อง กรุณาตรวจสอบช่องตั้งค่าบอท");
        }
        payload[key] = integerKeys.has(key) ? Math.trunc(value) : value;
      }

      const suffix = selectedSlotIdRef.current ? "?slotId=" + encodeURIComponent(selectedSlotIdRef.current) : "";
      await api("/bot/settings" + suffix, { method: "PUT", body: JSON.stringify(payload) });
      settingsDirtyRef.current = false;
      setSettingsDirty(false);
      setNotice("บันทึกการตั้งค่าแล้ว · EA จะรับค่าล่าสุดใน Heartbeat ถัดไป");
      await load(selectedSlotIdRef.current);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function handleOwnerNavigate(href:string) {
    if (!href.startsWith("/dashboard?view=")) return false;
    const requested = new URL(href, window.location.origin).searchParams.get("view");
    if (requested === "overview" || requested === "account" || requested === "access" || requested === "settings") {
      const targetView: View = requested === "settings" ? "overview" : requested;
      setActiveView(targetView);
      setError("");
      setNotice("");
      window.history.pushState({}, "", requested === "settings" ? "/dashboard?view=overview#bot-settings" : href);
      if (requested === "settings") {
        window.setTimeout(() => document.getElementById("bot-settings")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return true;
    }
    return false;
  }

  function logout() {
    localStorage.removeItem("bot_token");
    window.location.href = "/login";
  }

  if (!data) {
    return <main className="auth-shell"><div className="auth-card loading-card"><span className="dot green"/> กำลังเปิด SCENOVA Control Center...</div></main>;
  }

  const isOwner = data.user?.role === "OWNER" || data.user?.role === "ADMIN";
  const ownerActiveKey =
    activeView === "account" ? "trading-account" :
    activeView === "access" ? "trading-access" :
    "trading-overview";

  const navItems: Array<{id:View;label:string;hint:string}> = [
    { id:"overview", label:"บอท", hint:"สถานะ ควบคุม และตั้งค่า" },
    { id:"account", label:"บัญชี MT5", hint:"Slots, Device และการเชื่อมต่อ" },
    { id:"access", label:"สิทธิ์ใช้งาน", hint:"Trial และสมาชิก" }
  ];

  return (
    <div className="app-wrap">
      {isOwner ? (
        <OwnerSidebar activeKey={ownerActiveKey} onLogout={logout} onNavigate={handleOwnerNavigate}/>
      ) : (
        <aside className="sidebar app-sidebar">
          <div className="brand-lockup side-brand">
            <span className="brand-mark">◆</span>
            <span><strong>SCENOVA</strong><small>MT5 BOT EA</small></span>
          </div>
          <div className="side-section-label">เมนูหลัก</div>
          <nav className="side-nav">
            {navItems.map(item=>(
              <button
                type="button"
                key={item.id}
                className={"side-link side-link-rich " + (activeView===item.id ? "active" : "")}
                onClick={()=>setActiveView(item.id)}
              >
                <span>{item.label}</span>
                <small>{item.hint}</small>
              </button>
            ))}
          </nav>
          <div className="sidebar-user">
            <div><small>User ID</small><b>{data.user?.user_code}</b></div>
            <button className="btn ghost full" onClick={logout}>ออกจากระบบ</button>
          </div>
        </aside>
      )}

      <main className="main app-main">
        <div className="mobile-only mobile-app-head">
          <div className="brand-lockup"><span className="brand-mark">◆</span><span><strong>SCENOVA</strong><small>{isOwner ? "OWNER CONSOLE" : "MT5 BOT EA"}</small></span></div>
          <button className="btn ghost" onClick={logout}>ออก</button>
        </div>

        {isOwner ? (
          <OwnerMobileNav activeKey={ownerActiveKey} onNavigate={handleOwnerNavigate}/>
        ) : (
          <div className="mobile-only mobile-nav">
            {navItems.map(item=>(
              <button key={item.id} className={activeView===item.id ? "active" : ""} onClick={()=>setActiveView(item.id)}>{item.label}</button>
            ))}
          </div>
        )}

        <header className="page-head human-head">
          <div>
            <div className="eyebrow">CONTROL CENTER</div>
            <h2 style={{marginTop:7}}>
              {activeView === "overview" && "บอทและการตั้งค่า"}
              {activeView === "account" && "บัญชีและการเชื่อมต่อ MT5"}
              {activeView === "access" && "สิทธิ์ใช้งาน"}
            </h2>
            <div className="muted page-subtitle">
              {activeView === "overview" && "ดูสถานะ สั่ง Start/Stop และตั้งค่าบอทจากหน้าเดียว"}
              {activeView === "account" && "ติดตั้ง/อัปเดตจากเว็บไซต์ และจัดการการเชื่อมต่อ MT5 โดยไม่ต้องแก้ .set เอง"}
              {activeView === "access" && "ตรวจสถานะ Trial สมาชิก และเวลาคงเหลือ"}
            </div>
          </div>
          <div className="status-row">
            <span className="badge"><span className={"dot " + (isMt5Online ? "green":"red")}/>{connectionLabel}</span>
            <span className="badge"><span className={"dot " + (desired==="RUNNING" ? "blue":"purple")}/>{controlStateLabel}</span>
          </div>
        </header>

        {(data.slots || []).filter((slot:any)=>slot.can_control).length > 1 && (
          <section className="slot-switcher">
            <div>
              <span className="slot-switcher-label">ACTIVE SLOT</span>
              <b>เลือก Slot ที่ต้องการควบคุม</b>
            </div>
            <select
              className="input slot-switcher-select"
              value={selectedSlotId || data.selectedSlot?.id || ""}
              onChange={e=>selectSlot(e.target.value)}
            >
              {(data.slots || []).filter((slot:any)=>slot.can_control).map((slot:any)=>(
                <option key={slot.id} value={slot.id}>
                  Slot {slot.slot_number} · {slot.mode} · {slot.account_number || "ยังไม่เชื่อม MT5"}
                </option>
              ))}
            </select>
          </section>
        )}

        {error && <div className="notice bad page-notice">{error}</div>}
        {notice && <div className="notice good page-notice">{notice}</div>}

        {activeView === "overview" && installerUpdateRequired && (
          <div className="notice bad page-notice onboarding-notice">
            <div>
              <b>ต้องอัปเดต SCENOVA ก่อนเริ่มบอท</b>
              <span>
                เครื่องนี้ใช้ {softwareUpdate.currentVersion ? "v" + softwareUpdate.currentVersion : "เวอร์ชันที่ตรวจสอบไม่ได้"}
                {" · "}เวอร์ชันล่าสุดคือ v{softwareUpdate.latestVersion}
                {" · "}ปุ่มเริ่มบอทถูกล็อกจนกว่า Device Agent จะรายงานเวอร์ชันล่าสุด
              </span>
            </div>
            <button
              className="btn primary"
              disabled={busy || desired === "RUNNING" || (state === "RUNNING" && isMt5Online)}
              onClick={downloadWindowsInstaller}
            >
              {busy ? "กำลังเตรียม..." : "อัปเดตเป็น v" + softwareUpdate.latestVersion}
            </button>
            {(desired === "RUNNING" || (state === "RUNNING" && isMt5Online)) && (
              <small className="help">หยุดบอทก่อน แล้วจึงกดอัปเดต</small>
            )}
          </div>
        )}

        {activeView === "overview" && (
          !data.account ? (
            <EmptySetup onNext={()=>setActiveView("account")} />
          ) : (
            <>
              {!isMt5Online && (
                <div className="notice onboarding-notice">
                  <b>เหลืออีก 1 ขั้นเพื่อดูข้อมูล MT5 จริง</b>
                  <span>{data.account.mode === "LOCAL" ? "เปิด EA บน MetaTrader 5 ให้ส่งสถานะเข้าระบบ" : "รอ Cloud Worker เปิด MT5 ของบัญชีนี้"}</span>
                  <button className="btn" onClick={()=>setActiveView("account")}>ไปหน้าการเชื่อมต่อ</button>
                </div>
              )}

              <section className="kpi-grid">
                <Metric label="Balance" value={isMt5Online ? "$"+Number(metrics.balance||0).toFixed(2) : "—"} />
                <Metric label="Equity" value={isMt5Online ? "$"+Number(metrics.equity||0).toFixed(2) : "—"} />
                <Metric label="Floating P/L" value={isMt5Online ? "$"+Number(metrics.basketProfit||0).toFixed(2) : "—"} positive={isMt5Online && Number(metrics.basketProfit||0)>=0} />
                <Metric label="Positions" value={isMt5Online ? String(metrics.positions ?? 0) : "—"} />
              </section>

              <div className="grid2 dashboard-grid">
                <section className="panel blue action-panel">
                  <div className="panel-head bot-control-head">
                    <button type="button" className="bot-log-title" onClick={()=>setLogsOpen(true)}>
                      <div className="eyebrow">BOT CONTROL</div>
                      <h2>{metrics.symbol || settings.symbol}</h2>
                      <small>กดเพื่อดู Log การทำงาน →</small>
                    </button>
                    <div className="bot-head-actions">
                      <span className="badge"><span className={"dot "+(isMt5Online?"green":"red")}/>{data.account.mode}</span>
                      <button type="button" className="btn" onClick={()=>setLogsOpen(true)}>ดู Log</button>
                    </div>
                  </div>
                  <div className="bot-summary">
                    <div><small>โหมดเข้าออเดอร์</small><b>{settings.entryMode}</b></div>
                    <div><small>จำนวน Position สูงสุด</small><b>{settings.maxPositions}</b></div>
                    <div><small>Basket Trigger</small><b>{"$"+settings.basketTriggerMoney}</b></div>
                  </div>
                  <div className={"execution-live execution-" + String(liveStatus.tone || "neutral")}>
                    <div className="execution-live-head">
                      <span className="live-pulse"/>
                      <div>
                        <small>REAL-TIME EXECUTION</small>
                        <b>{liveStatus.label}</b>
                      </div>
                      <span className="execution-code">{liveStatus.code}</span>
                    </div>
                    <p>{liveStatus.detail}</p>
                    <div className="execution-metrics">
                      <span>
                        <span className="metric-label-with-info">Momentum</span>
                        <b>{Number(metrics.momentumPoints ?? 0).toFixed(1)}</b>
                      </span>
                      <span>
                        <span className="metric-label-with-info">Spread</span>
                        <b>{Number(metrics.spreadPoints ?? 0).toFixed(1)} pt</b>
                      </span>
                      <span>
                        <span className="metric-label-with-info">Algo</span>
                        <b>{metrics.terminalTradeAllowed === false ? "OFF" : metrics.terminalTradeAllowed === true ? "ON" : "รอ EA v1.003"}</b>
                      </span>
                      <span>
                        <span className="metric-label-with-info">EA Trading</span>
                        <b>{metrics.mqlTradeAllowed === false ? "OFF" : metrics.mqlTradeAllowed === true ? "ON" : "รอ EA v1.003"}</b>
                      </span>
                    </div>
                    {Number(liveStatus.lastOrderRetcode || 0) > 0 && (
                      <div className="execution-last-order">
                        Order ล่าสุด: Retcode <b>{liveStatus.lastOrderRetcode}</b>
                        {liveStatus.lastOrderError ? <> · Error <b>{liveStatus.lastOrderError}</b></> : null}
                      </div>
                    )}
                  </div>
                  <div className="primary-actions">
                    <button className="btn primary btn-lg" title="สั่ง EA เริ่มทำงานและเปิดออเดอร์แรกทันทีเมื่อรับคำสั่ง" disabled={startBlocked} onClick={()=>command("/bot/start","ส่งคำสั่ง Start แล้ว บอทกำลังเริ่มทำงาน")}>▶ เริ่มบอท</button>
                    <button className="btn purple btn-lg" title="หยุดการเปิดออเดอร์ใหม่ แต่ยังให้ EA จัดการ Basket/Position ที่มีอยู่ตาม Logic ความปลอดภัย" disabled={busy} onClick={()=>command("/bot/stop","ส่งคำสั่งหยุดอย่างปลอดภัยแล้ว")}>■ หยุดอย่างปลอดภัย</button>
                  </div>
                  <button className="btn danger full" title="สั่ง EA ปิด Position ของบอททั้งหมดและหยุดบอท" disabled={busy} onClick={()=>command("/bot/close-all","ส่งคำสั่งปิดออเดอร์ทั้งหมดแล้ว")}>⚠ ปิดออเดอร์ทั้งหมด</button>
                  <div className="control-help-row">
                    <span>เริ่มบอท: เปิดออเดอร์แรกทันทีเมื่อ EA รับคำสั่ง</span>
                    <span>Safe Stop: ห้ามเปิดออเดอร์ใหม่</span>
                    <span>Close All: ปิด Position ของบอททั้งหมด</span>
                  </div>
                  {startBlocked && !busy && (
                    <div className="help action-help">
                      เริ่มบอทยังไม่ได้: {liveStatus.detail || "ตรวจสถานะ MT5 / สิทธิ์ / Algo Trading"}
                    </div>
                  )}
                </section>

                <section className="panel">
                  <div className="panel-head">
                    <div><div className="eyebrow">LIVE STATUS · AUTO REFRESH 2S</div><h2>สถานะบัญชีและการส่งคำสั่ง</h2></div>
                    <span className={"owner-state-chip " + (liveStatus.tone === "good" ? "good" : liveStatus.tone === "bad" ? "bad" : "")}>{liveStatus.label}</span>
                  </div>
                  <div className="detail-list">
                    <div><span>บัญชี</span><b>{data.account.account_number}</b></div>
                    <div><span>Broker</span><b>{data.account.broker}</b></div>
                    <div><span>Server</span><b>{metrics.server || data.account.broker_server}</b></div>
                    <div>
                      <span>SCENOVA Version</span>
                      <b>
                        {metrics.productVersion
                          ? "v" + metrics.productVersion
                          : metrics.eaVersion
                            ? "กำลังอัปเดตเวอร์ชัน..."
                            : "ยังไม่รายงาน"}
                      </b>
                    </div>
                    <div><span>การเชื่อมต่อ</span><b className={isMt5Online ? "text-good":"text-warn"}>{connectionLabel}</b></div>
                    <div><span>Bot State</span><b>{actualStateLabel}</b></div>
                    <div><span>คำสั่งจากเว็บ</span><b>{desiredStateLabel}</b></div>
                    <div><span>Execution</span><b className={liveStatus.tone === "good" ? "text-good" : liveStatus.tone === "bad" ? "text-bad" : "text-warn"}>{liveStatus.label}</b></div>
                    <div><span>เหตุผล</span><b>{liveStatus.detail}</b></div>
                    <div><span>สิทธิ์</span><b>{accessLabel}</b></div>
                    <div><span>Heartbeat</span><b>{eaLastSeenAgeSeconds >= 0 ? eaLastSeenAgeSeconds.toFixed(1) + " วินาทีที่แล้ว" : "—"}</b></div>
                  </div>
                  <button className="btn full" onClick={()=>setActiveView("account")}>ดูรายละเอียดการเชื่อมต่อ</button>
                </section>
              </div>

              <section id="bot-settings" className="panel settings-panel overview-bot-settings">
                <div className="panel-head">
                  <div>
                    <div className="eyebrow">BOT SETTINGS · SAME PAGE</div>
                    <h2>ตั้งค่าบอท</h2>
                    <p className="muted">ตั้งค่าจากหน้า Control Center นี้ได้เลย ค่า Lot, Position, Basket, Risk และ Entry Mode จะถูกส่งให้ EA ผ่าน Server โดยไม่ต้องไปแก้ Inputs ใน MT5</p>
                  </div>
                  <span className={"owner-state-chip " + (settingsDirty ? "warn" : "good")}>
                    {settingsDirty ? "มีค่าที่ยังไม่ได้บันทึก" : "ค่าบันทึกแล้ว"}
                  </span>
                </div>
                <form className="form-grid form-grid-human" onSubmit={saveSettings}>
                  <Field
                    label="Symbol ที่ EA กำลังใช้"
                    info="อ่านจาก MT5/กราฟที่ FastBasketBot ทำงานอยู่ เพื่อป้องกันชื่อ Symbol ของแต่ละ Broker เช่น XAUUSDm ไม่ตรงกัน"
                    help="ระบบตรวจจาก MT5 อัตโนมัติ ไม่ต้องกรอกเอง"
                    value={metrics.symbol || settings.symbol}
                    readOnly
                  />
                  <Field label="Lot" info="ขนาด Lot ต่อ Order ค่านี้ถูกส่งให้ EA จาก Server" help="เริ่มจากค่าน้อยบน Demo ก่อน" type="number" step="0.01" value={settings.lot} onChange={(v:string)=>editSetting("lot",v)}/>
                  <Field label="จำนวน Position สูงสุด" info="จำนวน Position สูงสุดที่บอทเปิดพร้อมกันได้" type="number" value={settings.maxPositions} onChange={(v:string)=>editSetting("maxPositions",v)}/>
                  <Field
                    label="กำไรต่อวันแล้วหยุด ($)"
                    info="กำไรสะสมของ EA วันนี้ = กำไร/ขาดทุนที่ปิดแล้ววันนี้ + Floating ของ Basket ปัจจุบัน เมื่อถึงค่านี้ EA จะปิดทั้งหมดและล็อกหยุดจนขึ้นวันใหม่"
                    help="ใส่ 0 = ปิดฟังก์ชันนี้"
                    type="number"
                    step="0.01"
                    value={settings.dailyProfitTargetMoney}
                    onChange={(v:string)=>editSetting("dailyProfitTargetMoney",v)}
                  />
                  <Field
                    label="กำไรรวม Basket แล้วปิด ($)"
                    info="เมื่อกำไรรวมของรอบ Basket ถึงค่านี้ EA จะปิด Position ที่เหลือทั้งหมด"
                    help={
                      Number(settings.basketProfitTargetMoney || 0) > 0
                        ? "โหมดกำไรรวมกำลังทำงาน · กำไรต่อไม้ถูกปิดอัตโนมัติ"
                        : "ใส่ 0 = ปิดโหมดกำไรรวม"
                    }
                    type="number"
                    step="0.01"
                    value={settings.basketProfitTargetMoney}
                    onChange={(v:string)=>editSetting("basketProfitTargetMoney",v)}
                  />
                  <Field
                    label="กำไรต่อไม้แล้วปิด ($)"
                    info="Position ไหนมี P/L ถึงกำไรที่กำหนด EA จะปิดเฉพาะ Position นั้น"
                    help={
                      Number(settings.perPositionProfitMoney || 0) > 0
                        ? "โหมดกำไรต่อไม้กำลังทำงาน · กำไรรวม Basket ถูกปิดอัตโนมัติ"
                        : "ใส่ 0 = ปิดโหมดกำไรต่อไม้"
                    }
                    type="number"
                    step="0.01"
                    value={settings.perPositionProfitMoney}
                    onChange={(v:string)=>editSetting("perPositionProfitMoney",v)}
                  />
                  <Field
                    label="ขาดทุนต่อไม้แล้วปิด ($)"
                    info="Position ไหนมี P/L ถึงค่าขาดทุนที่กำหนด EA จะปิดเฉพาะ Position นั้นทันที ไม่รอ Max Basket Loss"
                    help="เช่น 2 = ปิดไม้เมื่อ P/L ของไม้นั้น ≤ -$2 · ใส่ 0 = ปิดฟังก์ชันนี้"
                    type="number"
                    step="0.01"
                    value={settings.perPositionLossMoney}
                    onChange={(v:string)=>editSetting("perPositionLossMoney",v)}
                  />
                  <Field label="กำไรรวมเริ่ม Trailing ($)" info="เมื่อกำไรรวม Floating ของ Basket ถึงค่านี้ ระบบเริ่มจำ Peak Profit" type="number" step="0.01" value={settings.basketTriggerMoney} onChange={(v:string)=>editSetting("basketTriggerMoney",v)}/>
                  <Field label="ย่อตัวจาก Peak แล้วปิด ($)" info="หลังเริ่ม Trailing หากกำไรรวมย่อลงจาก Peak ตามค่านี้ EA จะปิด Basket" type="number" step="0.01" value={settings.basketTrailMoney} onChange={(v:string)=>editSetting("basketTrailMoney",v)}/>
                  <Field label="ขาดทุน Basket สูงสุด ($)" info="ขีดจำกัดขาดทุนรวม Floating ของ Basket ถ้าถึงจะปิดทุกไม้ใน Basket" type="number" step="0.01" value={settings.maxBasketLossMoney} onChange={(v:string)=>editSetting("maxBasketLossMoney",v)}/>
                  <Field label="ขาดทุนต่อวันแล้วหยุด ($)" info="วงเงินขาดทุนรายวันแบบเดิม เมื่อถึงขีดจำกัดระบบจะหยุดตาม Logic ความเสี่ยง" type="number" step="0.01" value={settings.dailyLossMoney} onChange={(v:string)=>editSetting("dailyLossMoney",v)}/>
                  <Field label="ระยะห่างคำสั่งขั้นต่ำ (ms)" info="เวลาขั้นต่ำระหว่างการส่ง Order แต่ละครั้ง" type="number" value={settings.minOrderIntervalMs} onChange={(v:string)=>editSetting("minOrderIntervalMs",v)}/>
                  <Field label="คำสั่งสูงสุดต่อนาที" info="Rate Limit จำนวนคำสั่ง Order สูงสุดใน 1 นาที" type="number" value={settings.maxOrdersPerMinute} onChange={(v:string)=>editSetting("maxOrdersPerMinute",v)}/>
                  <div className="field">
                    <label className="label-with-info">โหมดเข้าออเดอร์</label>
                    <select className="input" value={settings.entryMode} onChange={e=>editSetting("entryMode",e.target.value)}>
                      <option value="AUTO_MOMENTUM">AUTO MOMENTUM — เลือกฝั่งออเดอร์แรก แล้วล็อกฝั่งเดียวทั้ง Basket</option>
                      <option value="BUY_ONLY">BUY ONLY — Buy ทุกออเดอร์ ไม่เปิด Sell</option>
                      <option value="SELL_ONLY">SELL ONLY — Sell ทุกออเดอร์ ไม่เปิด Buy</option>
                    </select>
                    <small className="help">เมื่อ Basket มี Buy อยู่จะไม่เปิด Sell สวน และเมื่อมี Sell อยู่จะไม่เปิด Buy สวน</small>
                  </div>
                  <div className="field submit-field">
                    <button className="btn primary btn-lg" title="บันทึกค่าไป Server ให้ EA รับใน Heartbeat ถัดไป" disabled={busy || !settingsDirty}>
                      {busy ? "กำลังบันทึก..." : settingsDirty ? "บันทึกและใช้ค่ากับบอท" : "ใช้ค่าล่าสุดแล้ว"}
                    </button>
                    <small className="help">Auto Refresh 2 วินาทีจะไม่เขียนทับค่าที่คุณกำลังแก้ ก่อนกดบันทึก</small>
                  </div>
                </form>
                <div className="detail-list" style={{marginTop:12}}>
                  <div>
                    <span>กำไร EA วันนี้</span>
                    <b>
                      ${Number(metrics.dailyProfit || 0).toFixed(2)}
                      {Number(settings.dailyProfitTargetMoney || 0) > 0 ? " / $" + Number(settings.dailyProfitTargetMoney).toFixed(2) : " · ไม่ตั้งเป้า"}
                    </b>
                  </div>
                  <div>
                    <span>กำไรรอบ Basket</span>
                    <b>
                      ${Number(metrics.basketCycleProfit || metrics.basketProfit || 0).toFixed(2)}
                      {Number(settings.basketProfitTargetMoney || 0) > 0 ? " / $" + Number(settings.basketProfitTargetMoney).toFixed(2) : " · ไม่ตั้งเป้า"}
                    </b>
                  </div>
                  <div>
                    <span>โหมดปิดกำไร</span>
                    <b>
                      {Number(settings.perPositionProfitMoney || 0) > 0
                        ? "ต่อไม้ · $" + Number(settings.perPositionProfitMoney).toFixed(2)
                        : Number(settings.basketProfitTargetMoney || 0) > 0
                          ? "รวม Basket · $" + Number(settings.basketProfitTargetMoney).toFixed(2)
                          : "ไม่ตั้งเป้าปิดกำไร"}
                    </b>
                  </div>
                </div>
                <div className="notice risk-notice">กำไรต่อไม้และกำไรรวม Basket ใช้พร้อมกันไม่ได้ · ถ้ากำหนดตัวใดมากกว่า 0 ระบบจะปิดอีกตัวเป็น 0 อัตโนมัติ ทั้งหน้าเว็บ Server และ EA</div>
              </section>

              <section className="panel overview-access-card">
                <div className="panel-head">
                  <div><div className="eyebrow">ACCOUNT & ACCESS</div><h2>สถานะพร้อมใช้งาน</h2></div>
                  <button className="btn" onClick={()=>setActiveView("access")}>ดูสิทธิ์</button>
                </div>
                <div className="detail-list">
                  <div><span>MT5</span><b className={isMt5Online ? "text-good":"text-warn"}>{connectionLabel}</b></div>
                  <div><span>Bot State</span><b>{actualStateLabel}</b></div>
                  <div><span>คำสั่งจากเว็บ</span><b>{desiredStateLabel}</b></div>
                  <div><span>Execution</span><b>{liveStatus.label}</b></div>
                  <div><span>เหตุผลล่าสุด</span><b>{liveStatus.detail}</b></div>
                  <div><span>สิทธิ์</span><b>{accessLabel}</b></div>
                  {accessExpiry && <div><span>หมดอายุ</span><b>{accessExpiry.toLocaleString("th-TH")}</b></div>}
                </div>
              </section>
            </>
          )
        )}

        {activeView === "account" && (
          <div className="account-workspace">
            <section className="panel account-card">
              <div className="panel-head">
                <div>
                  <div className="eyebrow">SLOT {data.selectedSlot?.slot_number || "—"} · {data.selectedSlot?.mode || "LOCAL"}</div>
                  <h2>
                    {data.account
                      ? (data.account.broker + " · " + data.account.account_number)
                      : "ยังไม่ได้ผูกบัญชี MT5"}
                  </h2>
                  <p className="muted">
                    {data.account
                      ? (data.account.broker_server + " · บัญชีนี้เป็น Active MT5 ของ Slot")
                      : data.selectedSlot?.mode === "LOCAL"
                        ? "ไม่ต้องกรอกเลขบัญชี MT5 · เปิด MT5 ที่ Login บัญชีที่ต้องการ แล้วติดตั้ง SCENOVA ระบบจะอ่านบัญชีจาก Terminal และผูกให้อัตโนมัติ"
                        : "Cloud ต้องใช้ MT5 Login และ Trading Password เพื่อให้ Trading Node Login แทนคุณ"}
                  </p>
                </div>
                <div className="account-card-actions">
                  <span className="badge">
                    <span className={"dot "+(isMt5Online?"green":"red")}/>
                    {connectionLabel}
                  </span>
                  {data.selectedSlot?.mode === "LOCAL" && !data.account && (
                    data.instance?.pending_account_number ? (
                      <button
                        className="btn primary"
                        disabled={busy || !data.instance?.first_bind_ready || state==="RUNNING" || desired==="RUNNING"}
                        onClick={rebindDetectedAccount}
                      >
                        ผูกบัญชีนี้
                      </button>
                    ) : (
                      <span className="owner-state-chip">รอ EA ตรวจบัญชี</span>
                    )
                  )}
                </div>
              </div>
              {data.selectedSlot?.mode === "LOCAL" && (
                <div className="help">
                  {!data.account
                    ? data.instance?.pending_account_number
                      ? "ระบบตรวจพบบัญชีจาก EA แล้ว ปกติจะผูกบัญชีแรกให้อัตโนมัติ หากยังค้างสามารถกด “ผูกบัญชีนี้” ได้"
                      : "เปิด MT5 ที่ Login บัญชีที่ต้องการแล้วติดตั้ง SCENOVA ระบบจะอ่าน Login / Broker / Server และผูกบัญชีแรกให้อัตโนมัติ"
                    : "ถ้าจะเปลี่ยน Demo / Real หรือ Login อื่น: ปิด Position เดิมให้เรียบร้อย แล้ว Login บัญชีใหม่ใน MT5 ระบบจะ Safe Stop และแสดงบัญชีใหม่ให้ยืนยันครั้งเดียว"}
                </div>
              )}
            </section>

            {data.selectedSlot?.mode === "LOCAL" && (
              <>
                <section className="panel purple website-install-panel">
                  <div className="panel-head">
                    <div>
                      <div className="eyebrow">SCENOVA LOCAL INSTALL</div>
                      <h2>ติดตั้ง / อัปเดต SCENOVA</h2>
                      <p className="muted">
                        Installer มีหน้าที่ลง EA + preset + Device Agent เท่านั้น การอนุญาตให้บอททำงานตรวจจากบัญชี SCENOVA, MT5 Login/Server และสิทธิ์บน Server ทุกครั้ง
                      </p>
                    </div>
                    <span className={"badge "+(isMt5Online?"agent-online":"")}>
                      <span className={"dot "+(isMt5Online?"green":"red")}/>
                      {isMt5Online ? "EA CONNECTED" : "WAITING FOR EA"}
                    </span>
                  </div>

                  <div className="website-install-card">
                    <div className="website-install-copy">
                      <span className="auto-install-icon">EXE</span>
                      <div>
                        <b>SCENOVA Windows Setup</b>
                        <small>ติดตั้งซ้ำหรือย้ายไปเครื่องใหม่ได้ · ไม่ต้องปลด Device Lock · ระบบตรวจสิทธิ์จาก Server</small>
                      </div>
                    </div>
                    <button
                      className="btn primary btn-lg"
                      disabled={busy || desired==="RUNNING" || (state==="RUNNING" && isMt5Online)}
                      onClick={downloadWindowsInstaller}
                    >
                      {busy ? "กำลังเตรียม..." : data.instance?.id ? "ติดตั้ง / อัปเดตใหม่" : "ติดตั้ง SCENOVA"}
                    </button>
                  </div>

                  {data.instance?.agent_last_seen_at && (
                    <div className="help">
                      Device Agent ล่าสุด: {new Date(data.instance.agent_last_seen_at).toLocaleString("th-TH")} · ใช้เพื่ออัปเดต EA และวินิจฉัยเท่านั้น ไม่ใช่สิทธิ์เทรด
                    </div>
                  )}
                  {activationMessage && <div className="notice good">{activationMessage}</div>}
                </section>

                {data.instance?.pending_account_number && (
                  <section className="panel detected-mt5-card">
                    <div className="detected-mt5-head">
                      <div>
                        <div className="eyebrow">{data.account ? "NEW MT5 DETECTED" : "FIRST MT5 DETECTED"}</div>
                        <h2>พบบัญชี {data.instance.pending_account_number}</h2>
                        <p className="muted">{data.instance.pending_broker_server || "ไม่ทราบ Server"}</p>
                      </div>
                      <span className={"owner-state-chip " + (data.account ? "bad" : "warn")}>
                        {data.account ? "SAFE STOP" : "รอผูกบัญชี"}
                      </span>
                    </div>
                    <div className="mt5-change-arrow">
                      <div><span>{data.account ? "บัญชีเดิม" : "สถานะ Slot"}</span><b>{data.account?.account_number || "ยังไม่มีบัญชี"}</b></div>
                      <span>→</span>
                      <div><span>บัญชีที่ MT5 กำลัง Login</span><b>{data.instance.pending_account_number}</b></div>
                    </div>
                    <button
                      className="btn primary btn-lg"
                      disabled={
                        busy ||
                        (data.account ? !data.instance.rebind_ready : !data.instance.first_bind_ready) ||
                        Number(data.instance?.metrics?.previousBoundPositions || 0) > 0 ||
                        state==="RUNNING" ||
                        desired==="RUNNING"
                      }
                      onClick={rebindDetectedAccount}
                    >
                      {data.account ? "ใช้บัญชีนี้" : "ผูกบัญชีนี้"}
                    </button>
                    <div className="help">
                      {!data.account
                        ? data.instance.first_bind_ready
                          ? "บัญชีแรกปกติจะถูกผูกอัตโนมัติจาก EA หากยังค้าง กด “ผูกบัญชีนี้” ได้"
                          : "กำลังรอ Heartbeat ล่าสุดจาก EA"
                        : Number(data.instance?.metrics?.previousBoundPositions || 0) > 0
                          ? "บัญชีเดิมยังมี " + Number(data.instance.metrics.previousBoundPositions) + " Position ตามสถานะล่าสุด กรุณา Login กลับบัญชีเดิมและปิดให้หมดก่อน"
                          : data.instance.rebind_ready
                            ? "บัญชีที่ MT5 กำลัง Login ต่างจากบัญชีเดิม ระบบ Safe Stop แล้ว กด “ใช้บัญชีนี้” เพื่อยืนยันการเปลี่ยนครั้งเดียว"
                            : "กำลังรอ Heartbeat ล่าสุดจากบัญชี MT5 ใหม่"}
                    </div>
                  </section>
                )}

                <section className="panel first-install-guide">
                  <div className="eyebrow">LOCAL MT5 · AUTO DETECT</div>
                  <h2>ไม่ต้องกรอกเลขบัญชี MT5</h2>
                  <div className="first-install-steps">
                    <div><span>1</span><div><b>เปิด MT5 และ Login บัญชีที่ต้องการใช้</b><small>เลข Login, Broker และ Server จะถูกอ่านจาก MT5 จริง ไม่รับค่าที่ผู้ใช้พิมพ์เอง</small></div></div>
                    <div><span>2</span><div><b>ดาวน์โหลดและติดตั้ง SCENOVA จากหน้านี้</b><small>Installer จะลง EA + preset + Device Agent และเปิด FastBasketBot ให้โดยอัตโนมัติ</small></div></div>
                    <div><span>3</span><div><b>อนุญาต WebRequest ถ้า MT5 ยังบล็อก</b><small>MT5 → Tools → Options → Expert Advisors → เพิ่ม <code>{mt5ApiBase}</code> แล้วระบบจะเชื่อมและผูกบัญชีให้เอง</small></div></div>
                  </div>
                  <div className="notice good">
                    ครั้งแรกระบบจะผูก MT5 ที่ตรวจพบเข้ากับ Slot อัตโนมัติ หาก MT5 Login + Server ยังไม่ถูก SCENOVA Slot อื่นใช้อยู่
                  </div>
                  <div className="notice">
                    ถ้าจะเปลี่ยน Demo → Real หรือเปลี่ยนบัญชีภายหลัง: ปิด Position เดิม → Login บัญชีใหม่ใน MT5 → ระบบ Safe Stop อัตโนมัติ → กลับมากดยืนยัน <b>“ใช้บัญชีนี้”</b> ครั้งเดียว
                  </div>
                </section>
              </>
            )}

            {data.selectedSlot?.mode === "CLOUD" && (
              !data.account ? (
                <section className="panel purple setup-panel">
                  <div className="setup-heading">
                    <div>
                      <div className="eyebrow">CLOUD SLOT {data.selectedSlot?.slot_number || "—"}</div>
                      <h2>เชื่อม MT5 Login สำหรับ Cloud</h2>
                      <p className="muted">เฉพาะ Cloud เท่านั้นที่ต้องกรอก MT5 Login + Trading Password เพราะ Trading Node ต้อง Login Terminal แทนลูกค้า; LOCAL ไม่ต้องกรอกเลขบัญชี</p>
                    </div>
                  </div>
                  <form className="form-grid form-grid-human" onSubmit={linkAccount}>
                    <div className="field">
                      <label>MT5 Login</label>
                      <input className="input" inputMode="numeric" value={accountNumber} onChange={e=>setAccountNumber(e.target.value)} required />
                    </div>
                    <div className="field">
                      <label>Broker</label>
                      <select className="input" value={brokerCode} onChange={e=>{setBrokerCode(e.target.value);setBrokerServer("");setCustomBrokerServer("");}} required>
                        {brokerCatalog.map(b=><option key={b.code} value={b.code}>{b.name}</option>)}
                        {!brokerCatalog.length && <option value="EXNESS">Exness</option>}
                      </select>
                    </div>
                    {brokerCode === "OTHER" && <div className="field"><label>ชื่อ Broker</label><input className="input" value={customBrokerName} onChange={e=>setCustomBrokerName(e.target.value)} required /></div>}
                    <div className="field">
                      <label>MT5 Server</label>
                      <select className="input" value={brokerServer} onChange={e=>setBrokerServer(e.target.value)} required>
                        <option value="">เลือก Server</option>
                        {(selectedBroker?.servers || []).map(server=><option key={server.serverName} value={server.serverName}>{server.serverName}{server.environment!=="UNKNOWN"?" · "+server.environment:""}</option>)}
                        <option value="__CUSTOM__">ไม่พบในรายการ — ระบุเอง</option>
                      </select>
                    </div>
                    {brokerServer === "__CUSTOM__" && <div className="field"><label>ชื่อ MT5 Server</label><input className="input" value={customBrokerServer} onChange={e=>setCustomBrokerServer(e.target.value)} required /></div>}
                    <div className="field"><label>Trading Password</label><input className="input" type="password" value={tradingPassword} onChange={e=>setTradingPassword(e.target.value)} required /></div>
                    <div className="field submit-field"><button className="btn primary btn-lg" disabled={busy}>{busy?"กำลังเชื่อม...":"เชื่อม Cloud MT5"}</button></div>
                  </form>
                </section>
              ) : (
                <section className="panel">
                  <div className="eyebrow">CLOUD MT5</div>
                  <h2>{data.account.account_number}</h2>
                  <p className="muted">{data.account.broker} · {data.account.broker_server}</p>
                  <button className="btn ghost" disabled={busy || state==="RUNNING" || desired==="RUNNING"} onClick={resetMt5}>เปลี่ยนบัญชี Cloud</button>
                </section>
              )
            )}
          </div>
        )}

        {activeView === "access" && (
          <div className="access-workspace">
            <div className="grid2 access-grid">
              <section className="panel purple">
                <div className="eyebrow">ACCESS STATUS · SLOT {data.selectedSlot?.slot_number || "—"}</div>
                <h2 style={{marginTop:8}}>{accessLabel}</h2>
                {entitlement?.source === "OWNER" ? (
                  <div className="notice good owner-unlimited-access">
                    <b>สิทธิ์เจ้าของระบบเปิดครบทุกฟังก์ชัน</b>
                    <span>ไม่ต้องเปิด Trial หรือแพ็กเกจให้บัญชีนี้ และไม่มีวันหมดอายุ</span>
                  </div>
                ) : remainingText ? (
                  <div className="time-card"><span>เวลาคงเหลือ</span><b className="mono">{remainingText}</b><small>หมดอายุ {accessExpiry?.toLocaleString("th-TH")}</small></div>
                ) : (
                  <p className="muted">ยังไม่มีสิทธิ์ที่กำลังใช้งานกับ Slot นี้</p>
                )}
                {data.selectedSlot?.plan_code && (
                  <div className="slot-plan-summary">
                    <span>แพ็กเกจ</span>
                    <b>{data.selectedSlot.plan_code}</b>
                    <small>{data.selectedSlot.plan_slots || 1} Slots{data.selectedSlot.allow_resale ? " · Partner / Reseller" : ""}</small>
                  </div>
                )}
              </section>

              <section className="panel">
                <div className="eyebrow">YOUR USER ID</div>
                <h2 className="mono user-code-big">{data.user.user_code}</h2>
                <p className="muted">ใช้รหัสนี้แจ้งผู้ดูแลเรื่อง Trial หรือสมาชิก</p>

                {entitlement?.source !== "OWNER" && (
                  <>
                    {data.trialRequest?.status === "PENDING" ? (
                      <div className="notice">
                        <b>คำขอ Trial กำลังรอ Owner อนุมัติ</b>
                        <span>LINE: {data.trialRequest.line_contact}</span>
                      </div>
                    ) : !["TRIAL","TRIAL_READY","TRIAL_EXPIRED"].includes(String(entitlement?.source || "")) ? (
                      <form className="trial-request-form" onSubmit={requestTrial}>
                        <div className="field">
                          <label>LINE ที่ใช้ติดต่อขอ Trial</label>
                          <input className="input" value={lineContact} onChange={e=>setLineContact(e.target.value)} placeholder="@line หรือชื่อ LINE" required />
                          <div className="help">Trial ไม่ได้มาอัตโนมัติหลังสมัคร Owner จะตรวจ User / LINE / MT5 / ประวัติ IP ก่อนอนุมัติ</div>
                        </div>
                        <button className="btn primary" disabled={busy || !data.account}>ส่งคำขอ Trial 3 ชั่วโมง</button>
                      </form>
                    ) : (
                      <div className="notice">Trial ของ User นี้มีประวัติแล้ว ระบบจะไม่สร้าง Trial ใหม่จากการเปลี่ยน MT5 ภายใต้ User เดิม</div>
                    )}
                  </>
                )}
              </section>
            </div>

            {(data.slots || []).some((slot:any)=>slot.can_manage && slot.slot_type === "PARTNER") && (
              <section className="panel partner-slots-panel">
                <div className="panel-head">
                  <div>
                    <div className="eyebrow">PARTNER / RESELLER</div>
                    <h2>จัดการ Slots ที่เปิดให้ผู้อื่น</h2>
                    <p className="muted">ผู้รับ Slot ต้องมีบัญชี SCENOVA ของตัวเอง ไม่ต้องแชร์ Email/Password, EX5 หรือ .set</p>
                  </div>
                  <span className="badge">{(data.slots || []).filter((slot:any)=>slot.can_manage && slot.slot_type === "PARTNER").length} SLOTS</span>
                </div>
                <div className="partner-slot-list">
                  {(data.slots || []).filter((slot:any)=>slot.can_manage && slot.slot_type === "PARTNER").map((slot:any)=>(
                    <div className="partner-slot-row" key={slot.id}>
                      <div className="partner-slot-number"><span>SLOT</span><b>{slot.slot_number}</b></div>
                      <div className="partner-slot-user">
                        <b>{slot.assigned_user_code || "ว่าง — พร้อมเปิดให้ลูกค้า"}</b>
                        <small>{slot.assigned_email || slot.label || "AVAILABLE"}</small>
                      </div>
                      <div className="partner-slot-meta">
                        <span>{slot.account_number ? "MT5 " + slot.account_number : "ยังไม่เชื่อม MT5"}</span>
                        <small>{slot.subscription_expires_at ? "แพ็กหมด " + new Date(slot.subscription_expires_at).toLocaleDateString("th-TH") : ""}</small>
                      </div>
                      <div className="partner-slot-actions">
                        {slot.assigned_user_id && slot.assigned_user_id !== data.user.id ? (
                          <button className="btn danger" disabled={busy} onClick={()=>releasePartnerSlot(slot)}>คืน Slot</button>
                        ) : slot.assigned_user_id === data.user.id ? (
                          <span className="owner-state-chip good">ใช้เอง</span>
                        ) : (
                          <button className="btn primary" disabled={busy} onClick={()=>assignPartnerSlot(slot)}>เปิดให้ลูกค้า</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {logsOpen && (
          <div className="bot-log-overlay" onClick={()=>setLogsOpen(false)}>
            <section className="bot-log-drawer" onClick={e=>e.stopPropagation()}>
              <div className="bot-log-head">
                <div>
                  <div className="eyebrow">BOT ACTIVITY LOG</div>
                  <h2>{metrics.symbol || settings.symbol} · การทำงานล่าสุด</h2>
                  <p className="muted">ดูคำสั่งจากเว็บ สถานะการส่งคำสั่ง และสถานะ EA ล่าสุด โดยไม่เปลี่ยน Logic การเทรด</p>
                </div>
                <button className="btn" onClick={()=>setLogsOpen(false)}>ปิด</button>
              </div>

              <div className="bot-log-snapshot">
                <div><span>MT5</span><b className={isMt5Online?"text-good":"text-warn"}>{connectionLabel}</b></div>
                <div><span>Actual State</span><b>{botLogs?.snapshot?.actual_state || state}</b></div>
                <div><span>Desired State</span><b>{botLogs?.snapshot?.desired_state || desired}</b></div>
                <div><span>Heartbeat ล่าสุด</span><b>{botLogs?.snapshot?.last_seen_at ? new Date(botLogs.snapshot.last_seen_at).toLocaleString("th-TH") : "—"}</b></div>
              </div>

              <div className="bot-log-toolbar">
                <b>เหตุการณ์ล่าสุด</b>
                <span>{logsLoading ? "กำลังอัปเดต..." : "อัปเดตอัตโนมัติทุก 5 วินาที"}</span>
              </div>

              <div className="bot-log-list">
                {(botLogs?.events || []).map((event:any)=>(
                  <div className="bot-log-row" key={event.id}>
                    <span className={"bot-log-dot "+String(event.status || "").toLowerCase()}/>
                    <div className="bot-log-copy">
                      <b>{commandLabel(event.command)}</b>
                      <small>
                        สถานะ {event.status}
                        {event.delivered_at ? " · ส่งถึง EA " + new Date(event.delivered_at).toLocaleTimeString("th-TH") : ""}
                        {event.acked_at ? " · EA รับแล้ว " + new Date(event.acked_at).toLocaleTimeString("th-TH") : ""}
                      </small>
                    </div>
                    <time>{event.created_at ? new Date(event.created_at).toLocaleString("th-TH") : "—"}</time>
                  </div>
                ))}
                {!logsLoading && !(botLogs?.events || []).length && (
                  <div className="owner-empty">ยังไม่มีคำสั่งหรือเหตุการณ์ของบอท</div>
                )}
              </div>
            </section>
          </div>
        )}

        {installToken && activeView === "account" && (
          <div className="notice good secret-box">
            <b>รหัสเชื่อมต่อ Local EA — เก็บเป็นความลับ</b>
            <span>Instance ID: <code>{installInstanceId}</code></span>
            <span>Install Token: <code>{installToken}</code></span>
            <small>เมื่อสร้าง Token ใหม่ Token เก่าจะถูกยกเลิก</small>
          </div>
        )}
      </main>
    </div>
  );
}

function commandLabel(command:string) {
  const labels:Record<string,string> = {
    START:"เริ่มบอท",
    SAFE_STOP:"หยุดอย่างปลอดภัย",
    CLOSE_ALL:"ปิดออเดอร์ทั้งหมด",
    UPDATE_SETTINGS:"อัปเดตการตั้งค่า"
  };
  return labels[command] || command || "SYSTEM";
}

function Metric({label,value,positive}:{label:string;value:string;positive?:boolean}) {
  return <div className="kpi"><div className="label">{label}</div><div className={"value "+(positive?"green":"")}>{value}</div></div>;
}

function EmptySetup({onNext}:{onNext:()=>void}) {
  return (
    <section className="panel empty-state">
      <div className="empty-icon">01</div>
      <div><div className="eyebrow">เริ่มต้นใช้งาน</div><h2>เชื่อมบัญชี MT5 ก่อน</h2><p className="muted">ใช้เวลาประมาณ 2–3 นาที ระบบจะพาไปทีละขั้น</p></div>
      <button className="btn primary btn-lg" onClick={onNext}>เริ่มเชื่อม MT5 →</button>
    </section>
  );
}

function InfoTip({text}:{text:string}) {
  return (
    <span className="info-tip-wrap">
      <button type="button" className="info-tip" aria-label={"ข้อมูล: " + text} title={text}>!</button>
      <span className="info-tip-popover" role="tooltip">{text}</span>
    </span>
  );
}

function Field(props: any) {
  return (
    <div className="field">
      <label className="label-with-info">
        <span>{props.label}</span>
        {props.info && <InfoTip text={props.info} />}
      </label>
      <input
        className="input"
        type={props.type || "text"}
        step={props.step}
        inputMode={props.type === "number" ? "decimal" : undefined}
        value={props.value ?? ""}
        readOnly={Boolean(props.readOnly)}
        disabled={Boolean(props.disabled)}
        onFocus={e=>{
          if (props.type === "number" && !props.readOnly && !props.disabled) {
            e.currentTarget.select();
          }
          props.onFocus?.(e);
        }}
        onChange={e=>props.onChange?.(e.target.value)}
      />
      {props.help && <div className="help">{props.help}</div>}
    </div>
  );
}
