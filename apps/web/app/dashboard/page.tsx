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
  dailyProfitContinueAfterTarget: false,
  dailyProfitDrawdownPercent: 20,
  basketProfitTargetMoney: 0,
  perPositionProfitMoney: 0,
  profitRunTrailPercent: 0,
  perPositionLossMoney: 0,
  minOrderIntervalMs: 300,
  maxOrdersPerMinute: 120,
  adaptiveEngine: true,
  riskPerOrderPercent: 0.25,
  hardStopAtrMultiplier: 2,
  atrPeriod: 14,
  confidenceThreshold: 70,
  sessionStartHour: 0,
  sessionEndHour: 24,
  maxAtrPoints: 3000,
  cooldownMinutesAfterLoss: 15,
  maxConsecutiveLosses: 3,
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
  const [terminalFilter, setTerminalFilter] = useState<"ALL"|"COMMAND"|"STATE"|"MARKET"|"RISK"|"ORDER">("ALL");
  const [terminalAutoScroll, setTerminalAutoScroll] = useState(true);
  const terminalWindowRef = useRef<HTMLDivElement | null>(null);
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
    if ((!logsOpen && activeView !== "overview") || !data?.instance?.id) return;
    let cancelled = false;
    const refreshLogs = async () => {
      try {
        setLogsLoading(true);
        const slotQuery = selectedSlotIdRef.current ? "?slotId=" + encodeURIComponent(selectedSlotIdRef.current) : "";
        const result = await api("/bot/logs" + slotQuery);
        if (!cancelled) setBotLogs(result);
      } catch (e: any) {
        if (!cancelled && logsOpen) setError(e.message);
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
  }, [logsOpen, activeView, data?.instance?.id, selectedSlotId]);

  const metrics = data?.instance?.metrics || {};
  const terminalEntries = useMemo(() => {
    const snapshot = botLogs?.snapshot || {};
    const m = snapshot.metrics || metrics || {};
    const heartbeatTime = snapshot.last_seen_at || data?.instance?.last_seen_at || null;
    const entries:any[] = [];

    const add = (time:any, level:string, category:string, text:string, detail="") => {
      entries.push({
        id: category + "-" + level + "-" + String(time || "") + "-" + entries.length,
        time,
        level,
        category,
        text,
        detail
      });
    };

    add(
      heartbeatTime,
      Boolean(data?.instance?.mt5_online) ? "SUCCESS" : "WARN",
      "STATE",
      "MT5 " + (Boolean(data?.instance?.mt5_online) ? "CONNECTED" : "WAITING"),
      [
        snapshot.account_number || data?.account?.account_number,
        snapshot.broker || data?.account?.broker,
        m.server || snapshot.broker_server || data?.account?.broker_server
      ].filter(Boolean).join(" · ")
    );

    add(
      heartbeatTime,
      "STATE",
      "STATE",
      "BOT " + String(snapshot.actual_state || data?.instance?.actual_state || "—"),
      "WEB " + String(snapshot.desired_state || data?.instance?.desired_state || "—") +
      " · Execution " + String(m.executionStatus || data?.liveStatus?.code || "—")
    );

    add(
      heartbeatTime,
      Number(m.basketProfit || 0) >= 0 ? "MARKET" : "WARN",
      "MARKET",
      "Floating $" + Number(m.basketProfit || 0).toFixed(2) +
      " · Positions " + Number(m.positions || 0),
      "Spread " + Number(m.spreadPoints || 0).toFixed(1) + " pt" +
      " · Momentum " + Number(m.momentumPoints || 0).toFixed(1)
    );

    add(
      heartbeatTime,
      "RISK",
      "RISK",
      "Daily P/L $" + Number(m.dailyProfit || 0).toFixed(2) +
      (Number(m.dailyProfitTarget || settings.dailyProfitTargetMoney || 0) > 0
        ? " / Target $" + Number(m.dailyProfitTarget || settings.dailyProfitTargetMoney || 0).toFixed(2)
        : ""),
      Number(m.dailyProfitGivebackFloor || 0) > 0
        ? "Giveback floor $" + Number(m.dailyProfitGivebackFloor).toFixed(2) +
          " · " + Number(m.dailyProfitDrawdownPercent || settings.dailyProfitDrawdownPercent || 0).toFixed(0) + "%"
        : (Number(settings.maxBasketLossMoney || 0) > 0
            ? "Max Basket Loss $" + Number(settings.maxBasketLossMoney).toFixed(2)
            : "Risk guard active")
    );

    if (Number(m.profitRunTrailPercent || settings.profitRunTrailPercent || 0) > 0) {
      add(
        heartbeatTime,
        "TRAIL",
        "RISK",
        "Profit Run " + Number(m.profitRunTrailPercent || settings.profitRunTrailPercent).toFixed(0) + "%",
        "Peak $" + Number(m.profitRunPeak || 0).toFixed(2) +
        " · Basket cycle $" + Number(m.basketCycleProfit || m.basketProfit || 0).toFixed(2)
      );
    }

    if (Number(m.lastOrderAt || 0) > 0 || Number(m.lastOrderRetcode || 0) > 0 || Number(m.lastOrderError || 0) > 0) {
      const rawLastOrderAt = Number(m.lastOrderAt || 0);
      const lastOrderTime = rawLastOrderAt > 0
        ? new Date(rawLastOrderAt > 100000000000 ? rawLastOrderAt : rawLastOrderAt * 1000).toISOString()
        : heartbeatTime;
      add(
        lastOrderTime,
        Number(m.lastOrderError || 0) > 0 ? "ERROR" : "ORDER",
        "ORDER",
        "Last order · retcode " + String(m.lastOrderRetcode || "—"),
        "error " + String(m.lastOrderError || 0) +
        " · tradeReady " + (m.tradeReady === false ? "NO" : "YES")
      );
    }

    for (const event of (botLogs?.events || [])) {
      let payloadText = "";
      if (event.payload && typeof event.payload === "object" && Object.keys(event.payload).length) {
        payloadText = Object.entries(event.payload)
          .slice(0, 4)
          .map(([key,value])=>key + "=" + String(value))
          .join(" · ");
      }
      const delivery = event.acked_at
        ? "ACK " + new Date(event.acked_at).toLocaleTimeString("th-TH",{hour12:false})
        : event.delivered_at
          ? "DELIVERED " + new Date(event.delivered_at).toLocaleTimeString("th-TH",{hour12:false})
          : "WAITING EA";
      add(
        event.created_at,
        String(event.status || "COMMAND").toUpperCase(),
        "COMMAND",
        "#" + event.id + " · " + commandLabel(event.command),
        delivery + (payloadText ? " · " + payloadText : "")
      );
    }

    return entries
      .filter(entry=>entry.time)
      .sort((a,b)=>new Date(a.time).getTime() - new Date(b.time).getTime());
  }, [
    botLogs,
    metrics,
    data?.instance?.last_seen_at,
    data?.instance?.actual_state,
    data?.instance?.desired_state,
    data?.instance?.mt5_online,
    data?.account?.account_number,
    data?.account?.broker,
    data?.account?.broker_server,
    data?.liveStatus?.code,
    settings.dailyProfitTargetMoney,
    settings.dailyProfitDrawdownPercent,
    settings.maxBasketLossMoney,
    settings.profitRunTrailPercent
  ]);

  const filteredTerminalEntries = useMemo(
    () => terminalFilter === "ALL"
      ? terminalEntries
      : terminalEntries.filter((entry:any)=>entry.category === terminalFilter),
    [terminalEntries, terminalFilter]
  );

  useEffect(() => {
    if (!terminalAutoScroll || !terminalWindowRef.current) return;
    terminalWindowRef.current.scrollTop = terminalWindowRef.current.scrollHeight;
  }, [filteredTerminalEntries.length, terminalAutoScroll]);

  const profitRunModeEnabled = Number(settings.profitRunTrailPercent || 0) > 0;
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
      "InpMaxOfflineLeaseSeconds=600",
      "InpAdaptiveEngine=" + Boolean(settings.adaptiveEngine),
      "InpRiskPerOrderPercent=" + settings.riskPerOrderPercent,
      "InpHardStopAtrMultiplier=" + settings.hardStopAtrMultiplier,
      "InpAtrPeriod=" + settings.atrPeriod,
      "InpConfidenceThreshold=" + settings.confidenceThreshold,
      "InpSessionStartHour=" + settings.sessionStartHour,
      "InpSessionEndHour=" + settings.sessionEndHour,
      "InpMaxAtrPoints=" + settings.maxAtrPoints,
      "InpCooldownMinutesAfterLoss=" + settings.cooldownMinutesAfterLoss,
      "InpMaxConsecutiveLosses=" + settings.maxConsecutiveLosses
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

      const enabled = Number(value || 0) > 0;

      if (key === "profitRunTrailPercent" && enabled) {
        next.perPositionProfitMoney = 0;
        next.basketProfitTargetMoney = 0;
        next.basketTriggerMoney = 0;
        next.basketTrailMoney = 0;
      }

      if (
        enabled &&
        [
          "perPositionProfitMoney",
          "basketProfitTargetMoney",
          "basketTriggerMoney",
          "basketTrailMoney"
        ].includes(key)
      ) {
        next.profitRunTrailPercent = 0;
      }

      if (key === "perPositionProfitMoney" && enabled) {
        next.basketProfitTargetMoney = 0;
      }
      if (key === "basketProfitTargetMoney" && enabled) {
        next.perPositionProfitMoney = 0;
      }

      if (key === "dailyProfitTargetMoney" && !enabled) {
        next.dailyProfitContinueAfterTarget = false;
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
        "dailyProfitDrawdownPercent",
        "basketProfitTargetMoney",
        "perPositionProfitMoney",
        "profitRunTrailPercent",
        "perPositionLossMoney",
        "basketTriggerMoney",
        "basketTrailMoney",
        "maxBasketLossMoney",
        "dailyLossMoney",
        "minOrderIntervalMs",
        "maxOrdersPerMinute",
        "riskPerOrderPercent",
        "hardStopAtrMultiplier",
        "atrPeriod",
        "confidenceThreshold",
        "sessionStartHour",
        "sessionEndHour",
        "maxAtrPoints",
        "cooldownMinutesAfterLoss",
        "maxConsecutiveLosses"
      ];
      const requiredNumericKeys = new Set([
        "lot",
        "maxPositions",
        "maxOrdersPerMinute",
        "atrPeriod",
        "confidenceThreshold",
        "sessionStartHour",
        "sessionEndHour",
        "cooldownMinutesAfterLoss",
        "maxConsecutiveLosses"
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
      setNotice("บันทึกการตั้งค่าแล้ว");
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
            <span className="brand-emblem" aria-hidden="true"><i/><b>◆</b></span>
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

        <header className="page-head human-head cc-page-head">
          <div>
            <div className="eyebrow">CONTROL CENTER</div>
            <h2 style={{marginTop:7}}>
              {activeView === "overview" && "บอทและการตั้งค่า"}
              {activeView === "account" && "บัญชีและการเชื่อมต่อ MT5"}
              {activeView === "access" && "สิทธิ์ใช้งาน"}
            </h2>
            <div className="muted page-subtitle">
              {activeView === "overview" && "ดูสถานะ ควบคุมบอท และติดตามการทำงานแบบเรียลไทม์"}
              {activeView === "account" && "ติดตั้ง/อัปเดต SCENOVA และจัดการการเชื่อมต่อ MT5"}
              {activeView === "access" && "ตรวจสถานะ Trial สมาชิก และเวลาคงเหลือ"}
            </div>
          </div>
          <div className="status-row cc-head-status">
            <span className="badge"><span className={"dot " + (isMt5Online ? "green":"red")}/>{connectionLabel}</span>
            <span className="badge"><span className={"dot " + (desired==="RUNNING" ? "blue":"purple")}/>{controlStateLabel}</span>
            {activeView === "overview" && (
              <span className="badge cc-version-chip">
                <b>{metrics.productVersion ? "v" + metrics.productVersion : "SCENOVA"}</b>
              </span>
            )}
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
              </span>
            </div>
            <button
              className="btn primary"
              disabled={busy || desired === "RUNNING" || (state === "RUNNING" && isMt5Online)}
              onClick={downloadWindowsInstaller}
            >
              {busy ? "กำลังเตรียม..." : "อัปเดตเป็น v" + softwareUpdate.latestVersion}
            </button>
          </div>
        )}

        {activeView === "overview" && (
          !data.account ? (
            <EmptySetup onNext={()=>setActiveView("account")} />
          ) : (
            <div className="cc-overview">
              {!isMt5Online && (
                <div className="cc-connect-alert">
                  <div className="cc-alert-icon">!</div>
                  <div className="cc-alert-copy">
                    <b>ยังไม่ได้เชื่อมต่อ MT5</b>
                    <span>{data.account.mode === "LOCAL" ? "เปิด MetaTrader 5 และให้ EA เชื่อมต่อกับ SCENOVA" : "กำลังรอ Cloud MT5 เชื่อมต่อ"}</span>
                  </div>
                  <button className="btn cc-alert-action" onClick={()=>setActiveView("account")}>ไปหน้าการเชื่อมต่อ →</button>
                </div>
              )}

              <section className="cc-kpi-grid">
                <DashboardMetric icon="◉" label="Balance" value={isMt5Online ? "$"+Number(metrics.balance||0).toFixed(2) : "—"} />
                <DashboardMetric icon="▣" label="Equity" value={isMt5Online ? "$"+Number(metrics.equity||0).toFixed(2) : "—"} />
                <DashboardMetric
                  icon="▥"
                  label="Floating P/L"
                  value={isMt5Online ? "$"+Number(metrics.basketProfit||0).toFixed(2) : "—"}
                  tone={isMt5Online ? (Number(metrics.basketProfit||0)>=0 ? "good" : "bad") : "neutral"}
                />
                <DashboardMetric icon="▤" label="Positions" value={isMt5Online ? String(metrics.positions ?? 0) : "—"} sub={isMt5Online && Number(metrics.positions||0)===0 ? "ไม่มีออเดอร์" : ""} />
                <DashboardMetric
                  icon="ϟ"
                  label="Heartbeat"
                  value={eaLastSeenAgeSeconds >= 0 ? eaLastSeenAgeSeconds.toFixed(1) + "s" : "—"}
                  sub={isMt5Online ? "เชื่อมต่อปกติ" : "รอ EA"}
                  tone={isMt5Online ? "good" : "warn"}
                />
              </section>

              <div className="cc-workspace">
                <div className="cc-left-stack">
                  <section className="panel cc-control-card">
                    <div className="cc-card-head">
                      <div className="cc-card-title">
                        <span className="cc-card-icon">◆</span>
                        <div>
                          <h2>ควบคุมบอท</h2>
                          <span>{metrics.symbol || settings.symbol} · {data.account.mode}</span>
                        </div>
                      </div>
                      <span className={"cc-state-pill " + (state==="RUNNING" ? "running" : state==="SAFE_STOP" ? "safe" : "stopped")}>
                        <span className="cc-state-dot"/>
                        <b>{state==="RUNNING" ? "RUNNING" : state==="SAFE_STOP" ? "SAFE STOP" : "STOPPED"}</b>
                        <small>{controlStateLabel}</small>
                      </span>
                    </div>

                    <div className="cc-control-fields">
                      <div className="cc-control-field">
                        <span>Symbol</span>
                        <b>{metrics.symbol || settings.symbol}</b>
                      </div>
                      <div className="cc-control-field">
                        <span>โหมดการเทรด</span>
                        <select value={settings.entryMode} onChange={e=>editSetting("entryMode",e.target.value)}>
                          <option value="AUTO_MOMENTUM">AUTO MOMENTUM</option>
                          <option value="BUY_ONLY">BUY ONLY</option>
                          <option value="SELL_ONLY">SELL ONLY</option>
                        </select>
                      </div>
                      <div className="cc-control-field">
                        <span>Position สูงสุด</span>
                        <select value={String(settings.maxPositions)} onChange={e=>editSetting("maxPositions",e.target.value)}>
                          {[1,2,3,4,5,6,7,8,9,10,12,15,20].map(v=><option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                      <div className="cc-control-field">
                        <span>Lot</span>
                        <select value={String(settings.lot)} onChange={e=>editSetting("lot",e.target.value)}>
                          {[0.01,0.02,0.03,0.05,0.1,0.2,0.3,0.5,1].map(v=><option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="cc-primary-actions">
                      <button className="cc-action start" disabled={startBlocked} onClick={()=>command("/bot/start","ส่งคำสั่ง Start แล้ว บอทกำลังเริ่มทำงาน")}>
                        <span>▶</span><b>เริ่มบอท</b><small>Start Bot</small>
                      </button>
                      <button className="cc-action safe" disabled={busy} onClick={()=>command("/bot/stop","ส่งคำสั่งหยุดอย่างปลอดภัยแล้ว")}>
                        <span>■</span><b>หยุดอย่างปลอดภัย</b><small>Safe Stop</small>
                      </button>
                      <button className="cc-action close" disabled={busy} onClick={()=>command("/bot/close-all","ส่งคำสั่งปิดออเดอร์ทั้งหมดแล้ว")}>
                        <span>×</span><b>ปิดออเดอร์ทั้งหมด</b><small>Close All</small>
                      </button>
                    </div>

                    <div className="cc-quick-row">
                      <div className="cc-live-cell"><span>Momentum</span><b>{Number(metrics.momentumPoints ?? 0).toFixed(1)}</b></div>
                      <div className="cc-live-cell"><span>Spread</span><b>{Number(metrics.spreadPoints ?? 0).toFixed(1)} pt</b></div>
                      <div className="cc-live-cell"><span>Algo</span><b className={metrics.terminalTradeAllowed === false ? "text-bad" : "text-good"}>{metrics.terminalTradeAllowed === false ? "OFF" : metrics.terminalTradeAllowed === true ? "ON" : "—"}</b></div>
                      <div className="cc-live-cell"><span>EA Trading</span><b className={metrics.mqlTradeAllowed === false ? "text-bad" : "text-good"}>{metrics.mqlTradeAllowed === false ? "OFF" : metrics.mqlTradeAllowed === true ? "ON" : "—"}</b></div>
                      <button
                        className="btn cc-save-quick"
                        disabled={busy || !settingsDirty}
                        onClick={(e:any)=>saveSettings(e)}
                      >
                        {settingsDirty ? "บันทึกการตั้งค่า" : "บันทึกแล้ว"}
                      </button>
                    </div>

                    {startBlocked && !busy && (
                      <div className="cc-inline-warning">{liveStatus.detail || "ตรวจสอบ MT5 และสิทธิ์ก่อนเริ่มบอท"}</div>
                    )}
                  </section>

                  <section className="panel cc-terminal-card">
                    <div className="cc-terminal-head">
                      <div className="cc-card-title">
                        <span className="cc-terminal-icon">&gt;_</span>
                        <div><h3>SCENOVA Terminal</h3><span>Live execution stream · MT5 / EA / Risk / Commands</span></div>
                      </div>
                      <div className="cc-terminal-actions">
                        <span className={"cc-terminal-live " + (logsLoading ? "loading" : "")}>
                          <i/>{logsLoading ? "SYNC" : "LIVE"}
                        </span>
                        <button className={"cc-terminal-auto " + (terminalAutoScroll ? "active" : "")} onClick={()=>setTerminalAutoScroll(v=>!v)}>
                          AUTO
                        </button>
                        <button className="btn" onClick={()=>setLogsOpen(true)}>ขยาย ↗</button>
                      </div>
                    </div>

                    <div className="cc-terminal-summary">
                      <TerminalStat label="MT5" value={isMt5Online ? "ONLINE" : "OFFLINE"} tone={isMt5Online ? "good" : "bad"} />
                      <TerminalStat label="BOT" value={state} tone={state==="RUNNING" ? "good" : state==="SAFE_STOP" ? "warn" : "neutral"} />
                      <TerminalStat label="P/L TODAY" value={"$"+Number(metrics.dailyProfit || 0).toFixed(2)} tone={Number(metrics.dailyProfit || 0)>=0 ? "good" : "bad"} />
                      <TerminalStat label="BASKET" value={"$"+Number(metrics.basketCycleProfit || metrics.basketProfit || 0).toFixed(2)} tone={Number(metrics.basketCycleProfit || metrics.basketProfit || 0)>=0 ? "good" : "bad"} />
                      <TerminalStat label="LAST RETCODE" value={String(metrics.lastOrderRetcode || "—")} tone={Number(metrics.lastOrderError || 0)>0 ? "bad" : "neutral"} />
                    </div>

                    <div className="cc-terminal-toolbar">
                      {(["ALL","COMMAND","STATE","MARKET","RISK","ORDER"] as const).map(filter=>(
                        <button
                          key={filter}
                          className={"cc-terminal-filter " + (terminalFilter===filter ? "active" : "")}
                          onClick={()=>setTerminalFilter(filter)}
                        >
                          {filter}
                        </button>
                      ))}
                      <span className="cc-terminal-count">{filteredTerminalEntries.length} lines</span>
                    </div>

                    <div className="cc-terminal-window" ref={terminalWindowRef}>
                      {filteredTerminalEntries.slice(-40).map((entry:any)=>(
                        <TerminalLine
                          key={entry.id}
                          time={entry.time}
                          level={entry.level}
                          category={entry.category}
                          text={entry.text}
                          detail={entry.detail}
                        />
                      ))}
                      {!logsLoading && !filteredTerminalEntries.length && (
                        <div className="cc-terminal-empty">No events in this filter · waiting for live data</div>
                      )}
                    </div>
                  </section>
                </div>

                <section className="panel cc-status-card">
                  <div className="cc-card-head">
                    <div className="cc-card-title">
                      <span className="cc-card-icon alt">▥</span>
                      <div>
                        <h2>สถานะบัญชีและการเชื่อมต่อ</h2>
                        <span>ข้อมูล MT5 และสถานะการทำงาน</span>
                      </div>
                    </div>
                  </div>

                  <div className="cc-status-list">
                    <StatusRow label="เลขบัญชี" value={data.account.account_number} />
                    <StatusRow label="Broker" value={data.account.broker} />
                    <StatusRow label="Server" value={metrics.server || data.account.broker_server} />
                    <StatusRow label="SCENOVA" value={metrics.productVersion ? "v"+metrics.productVersion : "—"} />
                    <StatusRow label="การเชื่อมต่อ" value={connectionLabel} tone={isMt5Online ? "good" : "warn"} dot />
                    <StatusRow label="สถานะบอท" value={actualStateLabel} tone={state==="RUNNING" ? "good" : state==="SAFE_STOP" ? "warn" : "bad"} dot />
                    <StatusRow label="Execution" value={liveStatus.label} tone={liveStatus.tone === "good" ? "good" : liveStatus.tone === "bad" ? "bad" : "warn"} dot />
                    <StatusRow label="สาเหตุ" value={liveStatus.detail} />
                    <StatusRow label="สิทธิ์ใช้งาน" value={accessLabel} />
                    <StatusRow label="Heartbeat ล่าสุด" value={eaLastSeenAgeSeconds >= 0 ? eaLastSeenAgeSeconds.toFixed(1)+" วินาทีที่แล้ว" : "—"} />
                  </div>

                  <button className="btn full cc-status-detail" onClick={()=>setActiveView("account")}>ดูรายละเอียดการเชื่อมต่อ</button>

                  <div className={"cc-system-note " + (isMt5Online && entitlement?.allowed ? "good" : "warn")}>
                    <span>i</span>
                    <div>
                      <b>{isMt5Online && entitlement?.allowed ? "ระบบพร้อมใช้งาน" : "กำลังรอความพร้อม"}</b>
                      <small>{liveStatus.detail}</small>
                    </div>
                  </div>
                </section>
              </div>

              <details id="bot-settings" className="panel settings-panel overview-bot-settings cc-settings-details">
                <summary className="cc-settings-summary">
                  <div>
                    <span className="cc-settings-summary-icon">⚙</span>
                    <span><b>ตั้งค่าบอททั้งหมด</b><small>กำไร ความเสี่ยง Trailing และความถี่คำสั่ง</small></span>
                  </div>
                  <span className={"owner-state-chip " + (settingsDirty ? "warn" : "good")}>
                    {settingsDirty ? "มีค่าที่ยังไม่ได้บันทึก" : "บันทึกแล้ว"}
                  </span>
                </summary>
                <div className="panel-head">
                  <div>
                    <div className="eyebrow">BOT SETTINGS</div>
                    <h2>ตั้งค่าบอท</h2>
                  </div>
                  <span className={"owner-state-chip " + (settingsDirty ? "warn" : "good")}>
                    {settingsDirty ? "มีค่าที่ยังไม่ได้บันทึก" : "ค่าบันทึกแล้ว"}
                  </span>
                </div>
                <form className="form-grid form-grid-human simple-settings-form cc-settings-form" onSubmit={saveSettings}>
                  <div className="field">
                    <label>Symbol</label>
                    <div className="input read-only-value">{metrics.symbol || settings.symbol}</div>
                  </div>
                  <SelectField
                    label="Lot สูงสุด (Adaptive จะลดให้ตามความเสี่ยง)"
                    options={[0.01,0.02,0.03,0.05,0.1,0.2,0.3,0.5,1]}
                    value={settings.lot}
                    onChange={(v:string)=>editSetting("lot",v)}
                  />

                  <SelectField
                    label="จำนวน Position สูงสุด"
                    options={[1,2,3,4,5,6,7,8,9,10,12,15,20]}
                    value={settings.maxPositions}
                    onChange={(v:string)=>editSetting("maxPositions",v)}
                  />
                  <div className="field">
                    <label>โหมดเข้าออเดอร์</label>
                    <select className="input" value={settings.entryMode} onChange={e=>editSetting("entryMode",e.target.value)}>
                      <option value="AUTO_MOMENTUM">AUTO MOMENTUM</option>
                      <option value="BUY_ONLY">BUY ONLY</option>
                      <option value="SELL_ONLY">SELL ONLY</option>
                    </select>
                  </div>

                  <div className="settings-group-title cc-settings-group trail"><span className="cc-settings-group-icon">◈</span><div><b>Adaptive Intelligence</b><small>Multi-timeframe & Dynamic Risk</small></div></div>

                  <div className="field">
                    <label>ระบบวิเคราะห์อัจฉริยะ</label>
                    <select className="input" value={settings.adaptiveEngine ? "on" : "off"} onChange={e=>editSetting("adaptiveEngine", e.target.value === "on")}>
                      <option value="on">เปิดใช้งาน (แนะนำ)</option>
                      <option value="off">ปิด ใช้ Momentum เดิม</option>
                    </select>
                  </div>
                  <SelectField label="ความเสี่ยงสูงสุดต่อไม้" options={[0.1,0.25,0.5,0.75,1,1.5,2]} value={settings.riskPerOrderPercent} format={(v:string)=>v + "% Equity"} onChange={(v:string)=>editSetting("riskPerOrderPercent",v)} />
                  <SelectField label="คะแนนสัญญาณขั้นต่ำ" options={[50,60,65,70,75,80,85,90]} value={settings.confidenceThreshold} format={(v:string)=>v + "%"} onChange={(v:string)=>editSetting("confidenceThreshold",v)} />
                  <SelectField label="Hard Stop ตาม ATR" options={[1,1.5,2,2.5,3,4]} value={settings.hardStopAtrMultiplier} format={(v:string)=>v + " × ATR"} onChange={(v:string)=>editSetting("hardStopAtrMultiplier",v)} />
                  <SelectField label="ATR Period" options={[7,10,14,20,28,50]} value={settings.atrPeriod} onChange={(v:string)=>editSetting("atrPeriod",v)} />
                  <SelectField label="พักหลังขาดทุน" options={[0,5,10,15,30,60,120]} value={settings.cooldownMinutesAfterLoss} format={(v:string)=>Number(v) === 0 ? "ไม่พัก" : v + " นาที"} onChange={(v:string)=>editSetting("cooldownMinutesAfterLoss",v)} />
                  <SelectField label="ขาดทุนติดต่อกันสูงสุด" options={[0,1,2,3,4,5,7,10]} value={settings.maxConsecutiveLosses} format={(v:string)=>Number(v) === 0 ? "ไม่จำกัด" : v + " ไม้"} onChange={(v:string)=>editSetting("maxConsecutiveLosses",v)} />
                  <SelectField label="เริ่ม Session (เวลา Server)" options={[0,1,2,3,4,5,6,7,8,9,10,12,14,16,18,20,22,23]} value={settings.sessionStartHour} format={(v:string)=>String(v).padStart(2,"0") + ":00"} onChange={(v:string)=>editSetting("sessionStartHour",v)} />
                  <SelectField label="จบ Session (เวลา Server)" options={[1,2,3,4,5,6,7,8,9,10,12,14,16,18,20,22,23,24]} value={settings.sessionEndHour} format={(v:string)=>String(v).padStart(2,"0") + ":00"} onChange={(v:string)=>editSetting("sessionEndHour",v)} />
                  <SelectField label="ATR สูงสุดที่อนุญาต" options={[0,500,1000,1500,2000,3000,5000,10000]} value={settings.maxAtrPoints} format={(v:string)=>Number(v) === 0 ? "ไม่จำกัด" : v + " points"} onChange={(v:string)=>editSetting("maxAtrPoints",v)} />

                  <div className="settings-group-title cc-settings-group profit"><span className="cc-settings-group-icon">↗</span><div><b>เป้ากำไรและความเสี่ยง</b><small>Profit & Risk</small></div></div>

                  <ToggleSelectField
                    label="ปล่อยกำไรวิ่ง แล้วปิดเมื่อย่อลงจากจุดสูงสุด"
                    options={[5,10,15,20,25,30,40,50]}
                    defaultValue="20"
                    value={settings.profitRunTrailPercent}
                    format={(v:string)=>v + "%"}
                    onChange={(v:string)=>editSetting("profitRunTrailPercent",v)}
                  />

                  <DailyProfitTargetField
                    value={settings.dailyProfitTargetMoney}
                    continueAfterTarget={Boolean(settings.dailyProfitContinueAfterTarget)}
                    drawdownPercent={settings.dailyProfitDrawdownPercent}
                    targetOptions={[0.5,1,2,3,5,10,15,20,25,30,50,75,100,200,300,500,750,1000]}
                    percentOptions={[5,10,15,20,25,30,40,50]}
                    defaultTarget="10"
                    defaultPercent="20"
                    onTargetChange={(v:string)=>editSetting("dailyProfitTargetMoney",v)}
                    onContinueChange={(v:boolean)=>editSetting("dailyProfitContinueAfterTarget",v)}
                    onPercentChange={(v:string)=>editSetting("dailyProfitDrawdownPercent",v)}
                  />
                  <ToggleSelectField
                    label="ขาดทุนต่อวันแล้วหยุด"
                    options={[0.5,1,2,3,5,10,15,20,25,30,50,75,100,200,300,500,750,1000]}
                    defaultValue="25"
                    value={settings.dailyLossMoney}
                    format={(v:string)=>"$" + v}
                    onChange={(v:string)=>editSetting("dailyLossMoney",v)}
                  />

                  <ToggleSelectField
                    label="กำไรต่อไม้แล้วปิด"
                    options={[0.5,1,2,3,5,10,15,20,25,30,50,75,100,200,300,500,750,1000]}
                    defaultValue="2"
                    value={settings.perPositionProfitMoney}
                    disabled={profitRunModeEnabled}
                    format={(v:string)=>"$" + v}
                    onChange={(v:string)=>editSetting("perPositionProfitMoney",v)}
                  />
                  <ToggleSelectField
                    label="กำไรรวม Basket แล้วปิด"
                    options={[0.5,1,2,3,5,10,15,20,25,30,50,75,100,200,300,500,750,1000]}
                    defaultValue="10"
                    value={settings.basketProfitTargetMoney}
                    disabled={profitRunModeEnabled}
                    format={(v:string)=>"$" + v}
                    onChange={(v:string)=>editSetting("basketProfitTargetMoney",v)}
                  />

                  <ToggleSelectField
                    label="ขาดทุนต่อไม้แล้วปิด"
                    options={[0.5,1,2,3,5,10,15,20,25,30,50,75,100,200,300,500,750,1000]}
                    defaultValue="2"
                    value={settings.perPositionLossMoney}
                    format={(v:string)=>"$" + v}
                    onChange={(v:string)=>editSetting("perPositionLossMoney",v)}
                  />
                  <ToggleSelectField
                    label="ขาดทุน Basket สูงสุด"
                    options={[0.5,1,2,3,5,10,15,20,25,30,50,75,100,200,300,500,750,1000]}
                    defaultValue="10"
                    value={settings.maxBasketLossMoney}
                    format={(v:string)=>"$" + v}
                    onChange={(v:string)=>editSetting("maxBasketLossMoney",v)}
                  />

                  <div className="settings-group-title cc-settings-group trail"><span className="cc-settings-group-icon">⌁</span><div><b>Basket Trailing</b><small>Protect Profit</small></div></div>

                  <TogglePairField
                    label="ใช้ Basket Trailing"
                    firstValue={settings.basketTriggerMoney}
                    secondValue={settings.basketTrailMoney}
                    disabled={profitRunModeEnabled}
                    firstDefault="2"
                    secondDefault="0.5"
                    firstOptions={[0.5,1,2,3,5,10,15,20,30,50,100]}
                    secondOptions={[0.1,0.2,0.3,0.5,0.75,1,2,3,5,10]}
                    firstPrefix="เริ่ม $"
                    secondPrefix="ย่อ $"
                    onFirstChange={(v:string)=>editSetting("basketTriggerMoney",v)}
                    onSecondChange={(v:string)=>editSetting("basketTrailMoney",v)}
                  />

                  <div className="settings-group-title cc-settings-group speed"><span className="cc-settings-group-icon">ϟ</span><div><b>ความถี่การส่งคำสั่ง</b><small>Execution Speed</small></div></div>

                  <SelectField
                    label="ระยะห่างคำสั่งขั้นต่ำ"
                    options={[100,200,300,500,750,1000,1500,2000,3000,5000]}
                    value={settings.minOrderIntervalMs}
                    format={(v:string)=>v + " ms"}
                    onChange={(v:string)=>editSetting("minOrderIntervalMs",v)}
                  />
                  <SelectField
                    label="คำสั่งสูงสุดต่อนาที"
                    options={[10,20,30,60,90,120,180,240]}
                    value={settings.maxOrdersPerMinute}
                    format={(v:string)=>v + " ครั้ง"}
                    onChange={(v:string)=>editSetting("maxOrdersPerMinute",v)}
                  />

                  <div className="field submit-field settings-submit">
                    <button className="btn primary btn-lg" disabled={busy || !settingsDirty}>
                      {busy ? "กำลังบันทึก..." : settingsDirty ? "บันทึกการตั้งค่า" : "บันทึกแล้ว"}
                    </button>
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
                      {profitRunModeEnabled
                        ? "ปล่อยกำไรวิ่ง · ย่อ " + Number(settings.profitRunTrailPercent).toFixed(0) + "%"
                        : Number(settings.perPositionProfitMoney || 0) > 0
                          ? "ต่อไม้ · $" + Number(settings.perPositionProfitMoney).toFixed(2)
                          : Number(settings.basketProfitTargetMoney || 0) > 0
                            ? "รวม Basket · $" + Number(settings.basketProfitTargetMoney).toFixed(2)
                            : "ไม่ตั้งเป้าปิดกำไร"}
                    </b>
                  </div>
                  <div><span>สภาวะตลาด</span><b>{String(metrics.marketRegime || "รอข้อมูล")}</b></div>
                  <div><span>ความมั่นใจสัญญาณ</span><b>{Number(metrics.signalConfidence || 0).toFixed(0)}% · Lot {Number(metrics.adaptiveLot || settings.lot).toFixed(2)}</b></div>
                </div>
                <div className="notice risk-notice">กำไรต่อวันใช้ได้ตลอด ส่วน “ปล่อยกำไรวิ่ง” จะปิดเฉพาะกำไรต่อไม้ กำไรรวม Basket และ Basket Trailing แบบ $</div>
              </details>
            </div>
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
            <section className="bot-log-drawer cc-terminal-drawer" onClick={e=>e.stopPropagation()}>
              <div className="bot-log-head cc-terminal-drawer-head">
                <div className="cc-card-title">
                  <span className="cc-terminal-icon">&gt;_</span>
                  <div>
                    <div className="eyebrow">SCENOVA TERMINAL</div>
                    <h2>{metrics.symbol || settings.symbol} · Live Execution Console</h2>
                    <span>Account {data.account?.account_number || "—"} · {metrics.server || data.account?.broker_server || "—"}</span>
                  </div>
                </div>
                <button className="btn" onClick={()=>setLogsOpen(false)}>ปิด ×</button>
              </div>

              <div className="cc-terminal-drawer-stats">
                <TerminalStat label="CONNECTION" value={connectionLabel} tone={isMt5Online ? "good" : "bad"} />
                <TerminalStat label="ACTUAL" value={String(botLogs?.snapshot?.actual_state || state)} tone={state==="RUNNING" ? "good" : "neutral"} />
                <TerminalStat label="DESIRED" value={String(botLogs?.snapshot?.desired_state || desired)} tone={desired==="RUNNING" ? "good" : "neutral"} />
                <TerminalStat label="SPREAD" value={Number(metrics.spreadPoints || 0).toFixed(1)+" pt"} />
                <TerminalStat label="MOMENTUM" value={Number(metrics.momentumPoints || 0).toFixed(1)} />
                <TerminalStat label="POSITIONS" value={String(metrics.positions || 0)} />
              </div>

              <div className="cc-terminal-drawer-meta">
                <div><span>Execution</span><b>{liveStatus.label}</b></div>
                <div><span>Daily P/L</span><b className={Number(metrics.dailyProfit || 0)>=0 ? "text-good" : "text-bad"}>{"$"+Number(metrics.dailyProfit || 0).toFixed(2)}</b></div>
                <div><span>Basket P/L</span><b className={Number(metrics.basketCycleProfit || metrics.basketProfit || 0)>=0 ? "text-good" : "text-bad"}>{"$"+Number(metrics.basketCycleProfit || metrics.basketProfit || 0).toFixed(2)}</b></div>
                <div><span>Last order</span><b>retcode {String(metrics.lastOrderRetcode || "—")} / error {String(metrics.lastOrderError || 0)}</b></div>
              </div>

              <div className="cc-terminal-toolbar drawer">
                {(["ALL","COMMAND","STATE","MARKET","RISK","ORDER"] as const).map(filter=>(
                  <button
                    key={filter}
                    className={"cc-terminal-filter " + (terminalFilter===filter ? "active" : "")}
                    onClick={()=>setTerminalFilter(filter)}
                  >
                    {filter}
                  </button>
                ))}
                <span className="cc-terminal-count">{filteredTerminalEntries.length} lines · refresh 5s</span>
              </div>

              <div className="cc-terminal-window cc-terminal-window-full">
                {filteredTerminalEntries.map((entry:any)=>(
                  <TerminalLine
                    key={"drawer-"+entry.id}
                    time={entry.time}
                    level={entry.level}
                    category={entry.category}
                    text={entry.text}
                    detail={entry.detail}
                  />
                ))}
                {!logsLoading && !filteredTerminalEntries.length && (
                  <div className="cc-terminal-empty">No events in this filter</div>
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

function DashboardMetric({icon,label,value,sub,tone="neutral"}:{icon:string;label:string;value:string;sub?:string;tone?:"neutral"|"good"|"warn"|"bad"}) {
  return (
    <div className={"cc-kpi cc-tone-" + tone}>
      <span className="cc-kpi-icon">{icon}</span>
      <div>
        <span className="cc-kpi-label">{label}</span>
        <b>{value}</b>
        {sub ? <small>{sub}</small> : null}
      </div>
    </div>
  );
}

function StatusRow({label,value,tone="neutral",dot=false}:{label:string;value:any;tone?:"neutral"|"good"|"warn"|"bad";dot?:boolean}) {
  return (
    <div className="cc-status-row">
      <span>{label}</span>
      <b className={"cc-status-value cc-tone-" + tone}>{dot ? <i/> : null}{value}</b>
    </div>
  );
}

function TerminalStat({label,value,tone="neutral"}:{label:string;value:string;tone?:"neutral"|"good"|"warn"|"bad"}) {
  return (
    <div className={"cc-terminal-stat cc-tone-" + tone}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function TerminalLine({time,level,category,text,detail}:{time?:any;level:string;category?:string;text:string;detail?:string}) {
  const stamp = time ? new Date(time).toLocaleTimeString("th-TH",{hour12:false}) : "--:--:--";
  return (
    <div className="cc-terminal-line">
      <time>[{stamp}]</time>
      <b className={"cc-terminal-level level-" + String(level || "INFO").toLowerCase()}>{level}</b>
      <em>{category || "SYSTEM"}</em>
      <span>
        <strong>{text}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
    </div>
  );
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

function SelectField(props: any) {
  const values = Array.from(
    new Set([
      ...(props.options || []).map((value:any)=>String(value)),
      props.value !== undefined && props.value !== null && String(props.value) !== ""
        ? String(props.value)
        : ""
    ].filter(Boolean))
  );

  return (
    <div className="field">
      <label>{props.label}</label>
      <select
        className="input"
        value={String(props.value ?? "")}
        disabled={Boolean(props.disabled)}
        onChange={e=>props.onChange?.(e.target.value)}
      >
        {values.map((value:string)=>(
          <option key={value} value={value}>{props.format ? props.format(value) : value}</option>
        ))}
      </select>
    </div>
  );
}

function ToggleSelectField(props: any) {
  const enabled = Number(props.value || 0) > 0;
  const selectedValue = enabled ? String(props.value) : String(props.defaultValue);
  const values = Array.from(
    new Set([
      ...(props.options || []).map((value:any)=>String(value)),
      selectedValue
    ].filter(Boolean))
  );

  return (
    <div className={"field toggle-select-field " + (enabled ? "enabled" : "") + (props.disabled ? " disabled" : "")}>
      <label className="toggle-setting-label">
        <input
          type="checkbox"
          checked={enabled}
          disabled={Boolean(props.disabled)}
          onChange={e=>{
            props.onChange?.(e.target.checked ? selectedValue : "0");
          }}
        />
        <span>{props.label}</span>
      </label>
      <select
        className="input"
        value={selectedValue}
        disabled={!enabled || Boolean(props.disabled)}
        onChange={e=>props.onChange?.(e.target.value)}
      >
        {values.map((value:string)=>(
          <option key={value} value={value}>{props.format ? props.format(value) : value}</option>
        ))}
      </select>
    </div>
  );
}

function DailyProfitTargetField(props: any) {
  const enabled = Number(props.value || 0) > 0;
  const targetValue = enabled ? String(props.value) : String(props.defaultTarget);
  const percentValue = String(props.drawdownPercent || props.defaultPercent);
  const targetValues = Array.from(new Set([
    ...props.targetOptions.map((value:any)=>String(value)),
    targetValue
  ]));
  const percentValues = Array.from(new Set([
    ...props.percentOptions.map((value:any)=>String(value)),
    percentValue
  ]));

  return (
    <div className={"field daily-profit-target-field " + (enabled ? "enabled" : "")}>
      <label className="toggle-setting-label">
        <input
          type="checkbox"
          checked={enabled}
          onChange={e=>{
            if (e.target.checked) {
              props.onTargetChange?.(targetValue);
            } else {
              props.onTargetChange?.("0");
              props.onContinueChange?.(false);
            }
          }}
        />
        <span>กำไรต่อวัน</span>
      </label>

      <div className="daily-profit-main-row">
        <select
          className="input"
          value={targetValue}
          disabled={!enabled}
          onChange={e=>props.onTargetChange?.(e.target.value)}
        >
          {targetValues.map((value:string)=>(
            <option key={value} value={value}>${value}</option>
          ))}
        </select>

        <label className={"mini-check " + (!enabled ? "disabled" : "")}>
          <input
            type="checkbox"
            checked={enabled && Boolean(props.continueAfterTarget)}
            disabled={!enabled}
            onChange={e=>props.onContinueChange?.(e.target.checked)}
          />
          <span>ถึงเป้าแล้วรันต่อ</span>
        </label>

        <select
          className="input daily-profit-percent-select"
          value={percentValue}
          disabled={!enabled || !props.continueAfterTarget}
          onChange={e=>props.onPercentChange?.(e.target.value)}
        >
          {percentValues.map((value:string)=>(
            <option key={value} value={value}>ลด {value}% แล้วหยุด</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function TogglePairField(props: any) {
  const enabled = Number(props.firstValue || 0) > 0 && Number(props.secondValue || 0) > 0;
  const firstValue = enabled ? String(props.firstValue) : String(props.firstDefault);
  const secondValue = enabled ? String(props.secondValue) : String(props.secondDefault);
  const firstValues = Array.from(new Set([
    ...props.firstOptions.map((value:any)=>String(value)),
    firstValue
  ]));
  const secondValues = Array.from(new Set([
    ...props.secondOptions.map((value:any)=>String(value)),
    secondValue
  ]));

  return (
    <div className={"field toggle-pair-field " + (enabled ? "enabled" : "") + (props.disabled ? " disabled" : "")}>
      <label className="toggle-setting-label">
        <input
          type="checkbox"
          checked={enabled}
          disabled={Boolean(props.disabled)}
          onChange={e=>{
            if (e.target.checked) {
              props.onFirstChange?.(firstValue);
              props.onSecondChange?.(secondValue);
            } else {
              props.onFirstChange?.("0");
              props.onSecondChange?.("0");
            }
          }}
        />
        <span>{props.label}</span>
      </label>
      <div className="toggle-pair-controls">
        <select
          className="input"
          value={firstValue}
          disabled={!enabled || Boolean(props.disabled)}
          onChange={e=>props.onFirstChange?.(e.target.value)}
        >
          {firstValues.map((value:string)=>(
            <option key={value} value={value}>{props.firstPrefix || ""}{value}</option>
          ))}
        </select>
        <select
          className="input"
          value={secondValue}
          disabled={!enabled || Boolean(props.disabled)}
          onChange={e=>props.onSecondChange?.(e.target.value)}
        >
          {secondValues.map((value:string)=>(
            <option key={value} value={value}>{props.secondPrefix || ""}{value}</option>
          ))}
        </select>
      </div>
    </div>
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
        type={props.type === "number" ? "text" : (props.type || "text")}
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
        onChange={e=>{
          if (props.type === "number") {
            const value = e.target.value.replace(",", ".");
            if (value === "" || /^\d*(?:\.\d*)?$/.test(value)) {
              props.onChange?.(value);
            }
            return;
          }
          props.onChange?.(e.target.value);
        }}
      />
      {props.help && <div className="help">{props.help}</div>}
    </div>
  );
}
