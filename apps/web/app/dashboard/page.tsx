"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import { OwnerMobileNav, OwnerSidebar } from "../../components/OwnerSidebar";
import { ScenovaIcon } from "../../components/ScenovaIcon";

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
type SettingsTab = "basic" | "exit" | "risk" | "session";

const defaultSettings = {
  symbol: "XAUUSD",
  tradingProfile: "BALANCED",
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
  allowMinimumLotOverride: false,
  hardStopAtrMultiplier: 2,
  atrPeriod: 14,
  confidenceThreshold: 70,
  sessionStartHour: 0,
  sessionEndHour: 24,
  maxAtrPoints: 0,
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
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("basic");
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
        m.server || snapshot.broker_server || data?.account?.broker_server,
        "HTTP " + String(m.heartbeatHttpStatus || "—"),
        Number(m.heartbeatLatencyMs || 0) > 0 ? Number(m.heartbeatLatencyMs).toFixed(0) + " ms" : ""
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
      "Spread " + (Number(m.spreadPrice || 0) > 0
        ? Number(m.spreadPrice).toFixed(Math.max(0,Math.min(8,Number(m.symbolDigits ?? 3))))
        : Number(m.spreadPoints || 0).toFixed(0) + " points") +
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
        "Basket Run-On · ย่อ " + Number(m.profitRunTrailPercent || settings.profitRunTrailPercent).toFixed(0) + "%",
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

  const basketProfitEnabled = Number(settings.basketProfitTargetMoney || 0) > 0;
  const perPositionProfitEnabled = Number(settings.perPositionProfitMoney || 0) > 0;
  const state = data?.instance?.actual_state || "OFFLINE";
  const desired = data?.instance?.desired_state || "STOPPED";
  const eaLastSeen = data?.instance?.last_seen_at
    ? new Date(data.instance.last_seen_at)
    : null;
  const isMt5Online = Boolean(data?.instance?.mt5_online) && state !== "OFFLINE";
  const eaLastSeenAgeSeconds = Number(data?.instance?.ea_last_seen_age_seconds ?? -1);
  const symbolDigits = Math.max(0, Math.min(8, Number(metrics.symbolDigits ?? 3)));
  const spreadPoints = Number(metrics.spreadPoints || 0);
  const pointSize = Number(metrics.pointSize || 0);
  const spreadPrice = Number(metrics.spreadPrice ?? (pointSize > 0 ? spreadPoints * pointSize : 0));
  const adaptiveSpreadLimitPoints = Number(metrics.adaptiveSpreadLimitPoints ?? metrics.maxSpreadPoints ?? settings.maxSpreadPoints ?? 0);
  const maxSpreadPrice = Number(metrics.adaptiveSpreadLimitPrice ?? (pointSize > 0 ? adaptiveSpreadLimitPoints * pointSize : metrics.maxSpreadPrice || 0));
  const spreadValueLabel = spreadPrice > 0
    ? spreadPrice.toFixed(symbolDigits) + " (" + spreadPoints.toFixed(0) + " points)"
    : spreadPoints.toFixed(0) + " points";
  const spreadLimitLabel = maxSpreadPrice > 0 ? maxSpreadPrice.toFixed(symbolDigits) : "—";
  const spreadMetricLabel = (points:any) => {
    const value = Number(points || 0);
    if (value <= 0) return "—";
    return pointSize > 0
      ? (value * pointSize).toFixed(symbolDigits) + " (" + value.toFixed(0) + ")"
      : value.toFixed(0) + " points";
  };
  const spreadStatus = String(metrics.spreadStatus || "WARMUP");
  const tradingProfile = String(metrics.tradingProfile || settings.tradingProfile || "BALANCED");
  const tradingProfileLabel:Record<string,string> = {
    SAFE: "ปลอดภัย",
    BALANCED: "สมดุล",
    AGGRESSIVE: "เชิงรุก",
    BURST_10: "Burst"
  };
  const spreadStatusLabel:Record<string,string> = {
    NORMAL: "ปกติ",
    ELEVATED: "สูงกว่าปกติ",
    BLOCKED: "พักเปิดออเดอร์ใหม่",
    FALLBACK_BLOCKED: "พักเปิดออเดอร์ใหม่",
    WARMUP: "กำลังเรียนรู้"
  };
  const heartbeatAgeSeconds = Math.max(0, Number(data?.instance?.ea_last_seen_age_seconds ?? metrics.heartbeatAgeSeconds ?? 0));
  const heartbeatLatencyMs = Number(metrics.heartbeatLatencyMs ?? 0);
  const heartbeatHttpStatus = Number(metrics.heartbeatHttpStatus ?? 0);
  const lastServerContactEpoch = Number(metrics.lastServerContactAt || 0);
  const lastServerContactLabel = lastServerContactEpoch > 0
    ? new Date(lastServerContactEpoch * 1000).toLocaleString("th-TH", {hour12:false})
    : "—";
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
    desired === "RUNNING" ||
    state === "RUNNING" ||
    installerUpdateRequired ||
    !entitlement?.allowed ||
    hardStartBlocks.has(String(liveStatus.code || ""));
  const stopBlocked = busy || (desired !== "RUNNING" && state !== "RUNNING");
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
  const marketRegimeLabel: Record<string,string> = {
    TREND_UP: "ขาขึ้น",
    TREND_DOWN: "ขาลง",
    RANGE: "แกว่งตัว",
    HIGH_VOLATILITY: "ผันผวนสูง",
    QUIET: "ตลาดเงียบ",
    DATA_NOT_READY: "รอข้อมูล",
    DISABLED: "ปิดการวิเคราะห์"
  };
  const currentPositions = Math.max(0, Number(metrics.positions || 0));
  const configuredMaxPositions = Math.max(1, Number(settings.maxPositions || 1));
  const effectiveMaxPositions = Math.max(1, Number(metrics.adaptiveMaxPositions || configuredMaxPositions));
  const pyramidProgressPoints = Number(metrics.pyramidProgressPoints || 0);
  const pyramidRequiredPoints = Number(metrics.pyramidRequiredPoints || 0);
  const entryBias = String(metrics.entryBias || (metrics.marketRegime === "TREND_UP" ? "BUY" : metrics.marketRegime === "TREND_DOWN" ? "SELL" : "BOTH"));
  const entryBiasLabel = entryBias === "BUY" ? "BUY ตามเทรนด์" : entryBias === "SELL" ? "SELL ตามเทรนด์" : "BUY / SELL ตามสัญญาณ";
  const trendText = (value:any) => Number(value) > 0 ? "ขึ้น" : Number(value) < 0 ? "ลง" : "กลาง";
  const positionCapacityLabel = currentPositions + " / " + effectiveMaxPositions + (effectiveMaxPositions !== configuredMaxPositions ? " · ตั้ง " + configuredMaxPositions : "");
  const basketAddExplanation = currentPositions > 0 && currentPositions < effectiveMaxPositions
    ? "เปิดแล้ว " + currentPositions + "/" + configuredMaxPositions + " ไม้ · " +
      (pyramidRequiredPoints > 0 ? "รอราคาเดินต่อฝั่งกำไร " + Math.max(0,pyramidRequiredPoints-pyramidProgressPoints).toFixed(0) + " points ก่อนเพิ่มไม้" : "รอ Momentum และความมั่นใจยืนยันก่อนเพิ่มไม้") +
      " · Position สูงสุดคือเพดาน ไม่ใช่ยิงครบทุกไม้พร้อมกัน"
    : "";
  const liveExplanation = basketAddExplanation || liveStatus.detail || "บอทกำลังประเมิน Momentum, แนวโน้ม, Spread และ Risk แบบเรียลไทม์";
  const hideModeIrrelevantStatus = String(liveStatus.code || "") === "RISK_LIMIT_TOO_SMALL";
  const visibleLiveStatus = hideModeIrrelevantStatus
    ? { label: "รอสัญญาณเข้า", tone: "good" }
    : liveStatus;
  const showControlAlert = !hideModeIrrelevantStatus && (liveStatus.tone === "bad" || liveStatus.tone === "warn");

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
      "InpTradingProfile=" + ({SAFE:0,BALANCED:1,AGGRESSIVE:2,BURST_10:3} as Record<string,number>)[String(settings.tradingProfile||"BALANCED")],
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
      "InpAllowMinimumLotOverride=" + Boolean(settings.allowMinimumLotOverride),
      "InpHardStopAtrMultiplier=" + settings.hardStopAtrMultiplier,
      "InpAtrPeriod=" + settings.atrPeriod,
      "InpConfidenceThreshold=" + settings.confidenceThreshold,
      "InpSessionStartHour=" + settings.sessionStartHour,
      "InpSessionEndHour=" + settings.sessionEndHour,
      "InpMaxAtrPoints=" + settings.maxAtrPoints
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

      // Profit mode 1: Basket target. profitRunTrailPercent is now the
      // optional percentage giveback AFTER the Basket target is reached.
      if (key === "basketProfitTargetMoney") {
        if (enabled) {
          next.perPositionProfitMoney = 0;
          next.basketTriggerMoney = 0;
          next.basketTrailMoney = 0;
        } else {
          next.profitRunTrailPercent = 0;
        }
      }

      // Profit mode 2: close each Position independently. It is mutually
      // exclusive with Basket target + percentage giveback.
      if (key === "perPositionProfitMoney" && enabled) {
        next.basketProfitTargetMoney = 0;
        next.profitRunTrailPercent = 0;
        next.basketTriggerMoney = 0;
        next.basketTrailMoney = 0;
      }

      if (key === "profitRunTrailPercent" && enabled) {
        next.perPositionProfitMoney = 0;
        next.basketTriggerMoney = 0;
        next.basketTrailMoney = 0;
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
        "maxAtrPoints"
      ];
      const requiredNumericKeys = new Set([
        "lot",
        "maxPositions",
        "maxOrdersPerMinute",
        "atrPeriod",
        "confidenceThreshold",
        "sessionStartHour",
        "sessionEndHour"
      ]);
      const integerKeys = new Set([
        "maxPositions",
        "minOrderIntervalMs",
        "maxOrdersPerMinute"
      ]);

      const payload:any = { ...settings };

      // New profit UX no longer exposes the legacy dollar Basket trailing.
      // Clear hidden legacy values on every save so they cannot affect trades.
      payload.basketTriggerMoney = 0;
      payload.basketTrailMoney = 0;
      if (Number(payload.basketProfitTargetMoney || 0) <= 0) {
        payload.profitRunTrailPercent = 0;
      }
      if (Number(payload.perPositionProfitMoney || 0) > 0) {
        payload.basketProfitTargetMoney = 0;
        payload.profitRunTrailPercent = 0;
      }

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

        <header className={"page-head human-head cc-page-head cc-v3-head " + (activeView === "overview" ? "cc-page-head-overview" : "")}>
          <div className="cc-v3-title">
            <span className="cc-v3-title-icon"><ScenovaIcon name={activeView === "overview" ? "control" : activeView === "account" ? "account" : "shield"} size={24}/></span>
            <div>
              <h1>{activeView === "overview" ? "Control Center" : activeView === "account" ? "บัญชีและการเชื่อมต่อ MT5" : "สิทธิ์ใช้งาน"}</h1>
              <p>{activeView === "overview" ? "ควบคุมบอทเทรดอัตโนมัติ พร้อมติดตามสัญญาณและสถานะแบบเรียลไทม์" : activeView === "account" ? "ติดตั้ง อัปเดต และตรวจการเชื่อมต่อ MT5 / EA" : "ตรวจสถานะ Trial สมาชิก และสิทธิ์ของ Slot"}</p>
            </div>
          </div>
          <div className="cc-v3-head-actions">
            <span className={"cc-head-chip " + (isMt5Online ? "good" : "bad")}><i/><span><b>{isMt5Online ? "เชื่อมต่อแล้ว" : "ยังไม่เชื่อมต่อ"}</b><small>{data.account?.broker || "MT5"} · {data.selectedSlot?.mode || "LOCAL"}</small></span></span>
            <span className={"cc-head-chip bot " + (desired==="RUNNING" ? "active" : "")}><ScenovaIcon name="bot" size={18}/><span><b>{controlStateLabel}</b><small>{settings.entryMode || "AUTO MOMENTUM"}</small></span></span>
            <span className="cc-head-icon-button" aria-label="การแจ้งเตือน"><ScenovaIcon name="bell" size={18}/></span>
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
            <div className="cc-overview cc-v3">
              {!isMt5Online && (
                <div className="cc-connect-alert">
                  <div className="cc-alert-icon"><ScenovaIcon name="info" size={20}/></div>
                  <div className="cc-alert-copy"><b>ยังไม่ได้เชื่อมต่อ MT5</b><span>{data.account.mode === "LOCAL" ? "เปิด MetaTrader 5 เพื่อเชื่อมต่อ" : "กำลังรอการเชื่อมต่อ"}</span></div>
                  <button className="btn cc-alert-action" onClick={()=>setActiveView("account")}>ไปหน้าการเชื่อมต่อ →</button>
                </div>
              )}

              <section className="cc-kpi-grid cc-v3-kpis">
                <DashboardMetric icon="wallet" label="ยอดเงิน" value={isMt5Online ? "$"+Number(metrics.balance||0).toFixed(2) : "—"} sub="Balance" />
                <DashboardMetric icon="equity" label="มูลค่ารวม (Equity)" value={isMt5Online ? "$"+Number(metrics.equity||0).toFixed(2) : "—"} sub="เงินทุนรวมปัจจุบัน" />
                <DashboardMetric icon="pnl" label="กำไร / ขาดทุนวันนี้" value={isMt5Online ? (Number(metrics.dailyProfit||0)>=0 ? "+$" : "-$")+Math.abs(Number(metrics.dailyProfit||0)).toFixed(2) : "—"} sub="Daily P/L" tone={isMt5Online ? (Number(metrics.dailyProfit||0)>=0 ? "good" : "bad") : "neutral"} />
                <DashboardMetric icon="orders" label="ออเดอร์เปิด" value={isMt5Online ? String(currentPositions) : "—"} sub={"เพดาน "+configuredMaxPositions+" ไม้"} />
              </section>

              <div className="cc-workspace cc-v3-workspace">
                <section className="panel cc-control-card cc-v3-control">
                  <div className="cc-card-head cc-v3-control-head">
                    <div className="cc-symbol-title"><span className="cc-gold-icon"><ScenovaIcon name="gold" size={28}/></span><div><h2>{metrics.symbol || settings.symbol}</h2><small>{String(metrics.symbol || settings.symbol).startsWith("XAU") ? "Gold Spot / US Dollar" : "Live Trading Symbol"}</small></div></div>
                    <div className="cc-control-head-right">
                      <span className={"cc-state-pill "+(state==="RUNNING"?"running":state==="SAFE_STOP"?"safe":"stopped")}><span className="cc-state-dot"/><span><b>{state==="RUNNING"?"กำลังทำงาน":state==="SAFE_STOP"?"Safe Stop":"หยุดอยู่"}</b><small>{state==="RUNNING"?"บอททำงานปกติ":controlStateLabel}</small></span></span>
                      <span className="cc-last-update">อัปเดต {heartbeatAgeSeconds.toFixed(0)} วิ <ScenovaIcon name="refresh" size={14}/></span>
                    </div>
                  </div>

                  <div className="cc-control-fields cc-v3-control-fields">
                    <div className="cc-control-field"><span>Symbol</span><b>{metrics.symbol || settings.symbol}</b></div>
                    <div className="cc-control-field"><span>โหมดเข้าออเดอร์</span><select value={settings.entryMode} onChange={e=>editSetting("entryMode",e.target.value)}><option value="AUTO_MOMENTUM">AUTO MOMENTUM</option><option value="BUY_ONLY">BUY ONLY</option><option value="SELL_ONLY">SELL ONLY</option></select></div>
                    <div className="cc-control-field"><span>จำนวนไม้</span><select value={String(settings.maxPositions)} onChange={e=>editSetting("maxPositions",e.target.value)}>{[1,2,3,4,5,6,7,8,9,10,12,15,20,25,30,50,75,100].map(v=><option key={v} value={v}>{v}</option>)}</select></div>
                    <div className="cc-control-field"><span>Lot สูงสุด</span><select value={String(settings.lot)} onChange={e=>editSetting("lot",e.target.value)}>{[0.01,0.02,0.03,0.05,0.1,0.2,0.3,0.5,1].map(v=><option key={v} value={v}>{v}</option>)}</select></div>
                  </div>

                  <div className="cc-primary-actions cc-v3-actions">
                    <button className="cc-action start" disabled={startBlocked} onClick={()=>command("/bot/start","ส่งคำสั่ง Start แล้ว บอทกำลังเริ่มทำงาน")}><span className="cc-action-icon"><ScenovaIcon name="play" size={19}/></span><b>เริ่มบอท</b></button>
                    <button className="cc-action safe" disabled={stopBlocked} onClick={()=>command("/bot/stop","ส่งคำสั่งหยุดอย่างปลอดภัยแล้ว")}><span className="cc-action-icon"><ScenovaIcon name="stop" size={18}/></span><b>หยุดบอท</b></button>
                    <button className="cc-action close" disabled={busy || currentPositions===0} onClick={()=>confirm("ยืนยันปิดออเดอร์ทั้งหมดทันที?") && command("/bot/close-all","ส่งคำสั่งปิดออเดอร์ทั้งหมดแล้ว")}><span className="cc-action-icon"><ScenovaIcon name="close" size={19}/></span><b>ปิดทุกไม้</b></button>
                  </div>

                  <div className="cc-signal-grid">
                    <div className="cc-signal-item good"><ScenovaIcon name="trend" size={20}/><span><small>สภาพตลาด</small><b>{marketRegimeLabel[String(metrics.marketRegime||"")]||"รอข้อมูล"}</b></span></div>
                    <div className="cc-signal-item"><ScenovaIcon name="target" size={20}/><span><small>ความมั่นใจ</small><b>{Number(metrics.signalConfidence||0).toFixed(0)}%</b></span></div>
                    <div className="cc-signal-item"><ScenovaIcon name="spread" size={20}/><span><small>Spread</small><b>{spreadValueLabel}</b></span></div>
                    <div className="cc-signal-item warn"><ScenovaIcon name="layers" size={20}/><span><small>Position</small><b>{positionCapacityLabel}</b></span></div>
                    <div className={"cc-signal-item "+(visibleLiveStatus.tone==="bad"?"bad":visibleLiveStatus.tone==="warn"?"warn":"good")}><ScenovaIcon name="status" size={20}/><span><small>การเทรด</small><b>{visibleLiveStatus.label||"—"}</b></span></div>
                  </div>

                  <div className="cc-direction-strip">
                    <div><span>Bias</span><b className={entryBias==="BUY"?"text-good":entryBias==="SELL"?"text-bad":""}>{entryBiasLabel}</b></div>
                    <div><span>M5</span><b>{trendText(metrics.trendM5)}</b></div><div><span>M15</span><b>{trendText(metrics.trendM15)}</b></div><div><span>H1</span><b>{trendText(metrics.trendH1)}</b></div><div><span>Adaptive Max</span><b>{effectiveMaxPositions} ไม้</b></div>
                  </div>

                  {showControlAlert&&<div className={"cc-intel-banner "+(liveStatus.tone==="bad"?"bad":"warn")}><ScenovaIcon name="info" size={19}/><div><b>{liveStatus.label||"ตรวจสอบการทำงาน"}</b><span>{liveExplanation}</span></div></div>}
                </section>

                <section className="panel cc-status-card cc-v3-account">
                  <div className="cc-card-head"><div className="cc-card-title"><span className="cc-card-icon alt"><ScenovaIcon name="account" size={20}/></span><div><h2>สถานะบัญชี</h2></div></div><span className={"cc-mini-health "+(isMt5Online?"good":"warn")}><i/>{isMt5Online?"ใช้งานปกติ":"รอเชื่อมต่อ"}</span></div>
                  <div className="cc-status-list">
                    <StatusRow label="เลขบัญชี" value={data.account.account_number}/><StatusRow label="โบรกเกอร์" value={data.account.broker}/><StatusRow label="เซิร์ฟเวอร์" value={metrics.server||data.account.broker_server}/><StatusRow label="การเชื่อมต่อ" value={connectionLabel} tone={isMt5Online?"good":"warn"} dot/><StatusRow label="Heartbeat" value={heartbeatAgeSeconds.toFixed(0)+" วินาที · HTTP "+(heartbeatHttpStatus||"—")} tone={heartbeatAgeSeconds<=20?"good":"warn"} dot/><StatusRow label="สถานะบอท" value={controlStateLabel} tone={state==="RUNNING"?"good":state==="SAFE_STOP"?"warn":"bad"} dot/><StatusRow label="สิทธิ์ใช้งาน" value={accessLabel}/>
                  </div>
                  <div className="cc-status-actions"><button className="btn full cc-status-detail" onClick={()=>setActiveView("account")}><ScenovaIcon name="settings" size={16}/>จัดการบัญชี</button><button className="btn full cc-status-detail" onClick={()=>setLogsOpen(true)}><ScenovaIcon name="clock" size={16}/>ประวัติการทำงาน</button></div>
                </section>
              </div>

              <section id="bot-settings" className="panel cc-settings-shell">
                <div className="cc-settings-head">
                  <div className="cc-settings-title"><span><ScenovaIcon name="settings" size={22}/></span><div><h2>ตั้งค่าการเทรด</h2><small>เลือกเฉพาะสิ่งที่ต้องการ ระบบจะจัดการส่วนที่เหลือให้</small></div></div>
                  <div className="cc-settings-actions"><span className={"cc-change-chip "+(settingsDirty?"warn":"good")}><i/>{settingsDirty?"มีการเปลี่ยนแปลง":"บันทึกแล้ว"}</span><button type="button" className="btn cc-save-primary" disabled={busy||!settingsDirty} onClick={(e:any)=>saveSettings(e)}><ScenovaIcon name="save" size={17}/>{busy?"กำลังบันทึก...":"บันทึกการตั้งค่า"}</button></div>
                </div>

                <div className="cc-settings-tabs" role="tablist" aria-label="หมวดการตั้งค่าบอท">
                  {([["basic","settings","ตั้งค่าหลัก"],["exit","profit","เป้าหมายกำไร"],["risk","shield","ป้องกันขาดทุน"],["session","clock","เวลาเทรด"]] as Array<[SettingsTab,string,string]>).map(([key,icon,label])=><button type="button" key={key} className={settingsTab===key?"active":""} onClick={()=>setSettingsTab(key)}><ScenovaIcon name={icon} size={17}/><span>{label}</span></button>)}
                </div>

                <form className="cc-settings-form-v3" onSubmit={saveSettings}>
                  {settingsTab==="basic"&&<><div className="cc-settings-section-title"><b>ตั้งค่าพื้นฐาน</b><span>กำหนดสินทรัพย์ รูปแบบการเข้า และจำนวนไม้</span></div><div className="cc-settings-grid">
                    <SettingTile icon="brain" title="โปรไฟล์การเทรด" description="เลือกแบบเดียว ระบบจัดค่าภายในให้ทั้งหมด" wide><div className="cc-profile-picker">{[
                      ["SAFE","ปลอดภัย","คัดสัญญาณเข้ม"],
                      ["BALANCED","สมดุล","เหมาะใช้ทั่วไป"],
                      ["AGGRESSIVE","เชิงรุก","เข้าเร็วขึ้น"],
                      ["BURST_10","Burst","เปิดรัวตามจำนวนไม้ที่เลือก"]
                    ].map(([value,label,detail])=><button type="button" key={value} className={String(settings.tradingProfile||"BALANCED")===value?"active":""} onClick={()=>editSetting("tradingProfile",value)}><b>{label}</b><small>{detail}</small></button>)}</div></SettingTile>
                    <SettingTile icon="gold" title="Symbol" description="สินทรัพย์ที่ EA กำลังเทรด"><div className="input read-only-value">{metrics.symbol||settings.symbol}</div></SettingTile>
                    <SettingTile icon="bot" title="โหมดเข้าออเดอร์" description="AUTO ใช้ Momentum + Trend"><select className="input" value={settings.entryMode} onChange={e=>editSetting("entryMode",e.target.value)}><option value="AUTO_MOMENTUM">AUTO MOMENTUM</option><option value="BUY_ONLY">BUY ONLY</option><option value="SELL_ONLY">SELL ONLY</option></select></SettingTile>
                    <SettingTile icon="layers" title="จำนวนไม้ที่ต้องการ" description="Burst จะส่งตามจำนวนนี้"><select className="input" value={String(settings.maxPositions)} onChange={e=>editSetting("maxPositions",e.target.value)}>{[1,2,3,4,5,6,7,8,9,10,12,15,20,25,30,50,75,100].map(v=><option key={v} value={v}>{v} ไม้</option>)}</select></SettingTile>
                    <SettingTile icon="lot" title="Lot สูงสุด (Adaptive)" description="Adaptive ลดได้ แต่ไม่เพิ่มเกินค่านี้"><select className="input" value={String(settings.lot)} onChange={e=>editSetting("lot",e.target.value)}>{[0.01,0.02,0.03,0.05,0.1,0.2,0.3,0.5,1].map(v=><option key={v} value={v}>{v}</option>)}</select></SettingTile>
                  </div></>}

                  {settingsTab==="risk"&&<><div className="cc-settings-section-title cc-risk-title"><div><b>ป้องกันขาดทุน</b><span>กำหนดวงเงินที่ยอมรับได้</span></div><div className="cc-risk-summary"><span>รูปแบบ <b>{tradingProfileLabel[tradingProfile]||tradingProfile}</b></span><span>ขนาดไม้ปัจจุบัน <b>{Number(metrics.adaptiveLot||settings.lot).toFixed(2)} Lot</b></span></div></div><div className="cc-settings-grid cc-risk-grid">
                    <SettingTile icon="pnl" title="หยุดเมื่อขาดทุนวันนี้" description="หยุดบอทเมื่อยอดขาดทุนรวมวันนี้ถึงจำนวนนี้"><ToggleSelectField options={[0.5,1,2,3,5,10,15,20,25,30,50,75,100,200,300,500,750,1000]} defaultValue="25" value={settings.dailyLossMoney} format={(v:string)=>"$"+v} onChange={(v:string)=>editSetting("dailyLossMoney",v)}/></SettingTile>
                    <SettingTile icon="risk" title="ปิดทั้งชุดเมื่อขาดทุน" description="รวมผลขาดทุนของทุกไม้ในชุดปัจจุบัน"><ToggleSelectField options={[0.5,1,2,3,5,10,15,20,25,30,50,75,100,200,300,500,750,1000]} defaultValue="10" value={settings.maxBasketLossMoney} format={(v:string)=>"$"+v} onChange={(v:string)=>editSetting("maxBasketLossMoney",v)}/></SettingTile>
                    <SettingTile icon="orders" title="ตัดขาดทุนแต่ละไม้" description="ปิดเฉพาะไม้ที่ขาดทุนถึงจำนวนนี้"><ToggleSelectField options={[0.5,1,2,3,5,10,15,20,25,30,50,75,100,200,300,500,750,1000]} defaultValue="2" value={settings.perPositionLossMoney} format={(v:string)=>"$"+v} onChange={(v:string)=>editSetting("perPositionLossMoney",v)}/></SettingTile>
                  </div></>}

                  {settingsTab==="session"&&<><div className="cc-settings-section-title"><b>เวลาเทรด</b><span>อ้างอิงเวลา Server ของ Broker</span></div><div className="cc-settings-grid cc-session-grid">
                    <SettingTile icon="clock" title="เริ่ม Session" description="เวลา Server"><select className="input" value={String(settings.sessionStartHour)} onChange={e=>editSetting("sessionStartHour",e.target.value)}>{[0,1,2,3,4,5,6,7,8,9,10,12,14,16,18,20,22,23].map(v=><option key={v} value={v}>{String(v).padStart(2,"0")}:00</option>)}</select></SettingTile>
                    <SettingTile icon="clock" title="จบ Session" description="เวลา Server"><select className="input" value={String(settings.sessionEndHour)} onChange={e=>editSetting("sessionEndHour",e.target.value)}>{[1,2,3,4,5,6,7,8,9,10,12,14,16,18,20,22,23,24].map(v=><option key={v} value={v}>{String(v).padStart(2,"0")}:00</option>)}</select></SettingTile>
                    <SettingTile icon="timer" title="Session ปัจจุบัน" description="อ่านจาก EA"><div className="cc-readout"><b>{String(metrics.sessionProfile||"UNKNOWN")}</b><small>Server session profile</small></div></SettingTile>
                    <SettingTile icon="spread" title="Spread ตอนนี้" description={"Adaptive limit "+spreadLimitLabel}><div className="cc-readout"><b>{spreadValueLabel}</b><small>{spreadStatusLabel[spreadStatus]||spreadStatus}</small></div></SettingTile>
                  </div></>}

                  {settingsTab==="exit"&&<><div className="cc-settings-section-title cc-profit-title"><div><b>เป้าหมายกำไร</b><span>เลือกวิธีปิดกำไรหลักเพียงแบบเดียว</span></div><div className="cc-profit-mode-note"><ScenovaIcon name="info" size={14}/><span>เปิดอันไหน อีกอันจะปิดเองอัตโนมัติ</span></div></div>
                    {String(settings.tradingProfile||"BALANCED")==="BURST_10"?<div className="cc-settings-grid">
                      <SettingTile icon="orders" title="Basket Scalping Engine" description="Burst ใช้เป้ากำไรอัตโนมัติตาม Cycle" wide><div className="cc-readout"><b>{metrics.burstActive?"กำลังส่ง "+Number(metrics.burstRequestsSent||0)+" / "+configuredMaxPositions+" ไม้":"พร้อมเปิด "+configuredMaxPositions+" ไม้"}</b><small>โปรไฟล์ Burst จัดการเป้ากำไร Basket อัตโนมัติ</small></div></SettingTile>
                      <SettingTile icon="profit" title="เป้ากำไร Basket อัตโนมัติ" description="ค่าจริงจาก EA"><div className="cc-readout"><b>{"$"+Number(metrics.burstTargetMoney||0).toFixed(2)}</b><small>ปรับใหม่ทุก Cycle</small></div></SettingTile>
                      <SettingTile icon="risk" title="ขีดจำกัด Basket อัตโนมัติ" description="ค่าจริงจาก EA"><div className="cc-readout"><b>{"$"+Number(metrics.burstLossMoney||0).toFixed(2)}</b><small>ดูแล Position ที่เปิดสำเร็จแล้ว</small></div></SettingTile>
                    </div>:<>
                      <div className="cc-settings-grid cc-profit-mode-grid">
                        <SettingTile icon="profit" title="กำไรทั้งชุดถึงแล้วปิด" description="รวมกำไรทุก Position ใน Basket เดียวกัน" wide accent={basketProfitEnabled}>
                          <BasketProfitTargetField
                            value={settings.basketProfitTargetMoney}
                            trailPercent={settings.profitRunTrailPercent}
                            targetOptions={[0.5,1,2,3,5,10,15,20,25,30,50,75,100,200,300,500,750,1000]}
                            percentOptions={[5,10,15,20,25,30,40,50]}
                            defaultTarget="10"
                            defaultPercent="20"
                            onTargetChange={(v:string)=>editSetting("basketProfitTargetMoney",v)}
                            onPercentChange={(v:string)=>editSetting("profitRunTrailPercent",v)}
                          />
                        </SettingTile>

                        <SettingTile icon="orders" title="กำไรต่อไม้" description="แต่ละ Position ถึงกำไรที่ตั้ง ให้ปิดเฉพาะไม้นั้นทันที" wide accent={perPositionProfitEnabled}>
                          <ToggleSelectField
                            label="เปิดกำไรต่อไม้"
                            options={[0.5,1,2,3,5,10,15,20,25,30,50,75,100,200,300,500,750,1000]}
                            defaultValue="2"
                            value={settings.perPositionProfitMoney}
                            format={(v:string)=>"ถึง $"+v+" → ปิดไม้นั้น"}
                            onChange={(v:string)=>editSetting("perPositionProfitMoney",v)}
                          />
                        </SettingTile>
                      </div>

                      <div className="cc-profit-independent">
                        <div className="cc-settings-section-title"><b>เป้ากำไรรายวัน</b><span>ทำงานแยกจากวิธีปิด Basket / Position ด้านบน</span></div>
                        <div className="cc-settings-grid">
                          <SettingTile icon="pnl" title="เป้ากำไรวันนี้" description="ถึงเป้ารายวันแล้วเลือกหยุดหรือปล่อยต่อ" wide>
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
                          </SettingTile>
                        </div>
                      </div>
                    </>}
                  </>}

                </form>
              </section>

              <div className="cc-mobile-command-dock mobile-only" aria-label="ควบคุมบอท">
                <button className="cc-mobile-command start" disabled={startBlocked} onClick={()=>command("/bot/start","ส่งคำสั่งเริ่มบอทแล้ว")}>
                  <span>▶</span><b>เริ่ม</b>
                </button>
                <button className="cc-mobile-command stop" disabled={stopBlocked} onClick={()=>command("/bot/stop","ส่งคำสั่งหยุดบอทแล้ว")}>
                  <span>■</span><b>หยุด</b>
                </button>
              </div>
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
                <TerminalStat label="SPREAD" value={spreadValueLabel} />
                <TerminalStat label="MOMENTUM" value={Number(metrics.momentumPoints || 0).toFixed(1)} />
                <TerminalStat label="POSITIONS" value={String(metrics.positions || 0)} />
                <TerminalStat label="HEARTBEAT AGE" value={heartbeatAgeSeconds.toFixed(0) + "s"} tone={heartbeatAgeSeconds <= 20 ? "good" : "bad"} />
                <TerminalStat label="LATENCY" value={heartbeatLatencyMs > 0 ? heartbeatLatencyMs.toFixed(0) + " ms" : "—"} tone={heartbeatLatencyMs > 2000 ? "warn" : "neutral"} />
                <TerminalStat label="HTTP STATUS" value={heartbeatHttpStatus > 0 ? String(heartbeatHttpStatus) : "—"} tone={heartbeatHttpStatus >= 200 && heartbeatHttpStatus < 300 ? "good" : "bad"} />
                <TerminalStat label="LAST CONTACT" value={lastServerContactLabel} />
              </div>

              <div className="cc-terminal-drawer-meta">
                <div><span>Execution</span><b>{liveStatus.label}</b></div>
                <div><span>Daily P/L</span><b className={Number(metrics.dailyProfit || 0)>=0 ? "text-good" : "text-bad"}>{"$"+Number(metrics.dailyProfit || 0).toFixed(2)}</b></div>
                <div><span>Basket P/L</span><b className={Number(metrics.basketCycleProfit || metrics.basketProfit || 0)>=0 ? "text-good" : "text-bad"}>{"$"+Number(metrics.basketCycleProfit || metrics.basketProfit || 0).toFixed(2)}</b></div>
                <div><span>Last order</span><b>retcode {String(metrics.lastOrderRetcode || "—")} / error {String(metrics.lastOrderError || 0)}</b></div>
                <div><span>Adaptive Spread</span><b>{spreadStatusLabel[spreadStatus] || spreadStatus} · P95 {spreadMetricLabel(metrics.spreadP95Points)}</b></div>
                <div><span>Spread cost</span><b>${Number(metrics.spreadCost || 0).toFixed(2)} · {Number(metrics.adaptiveLot || settings.lot).toFixed(2)} lot</b></div>
                <div><span>Adaptive limits</span><b>{Number(metrics.adaptiveMaxPositions || settings.maxPositions)} positions · {Number(metrics.adaptiveEntrySpacingMs || settings.minOrderIntervalMs)} ms</b></div>
                <div><span>Execution quality</span><b>{Number(metrics.executionQuality || 0).toFixed(0)}% · slip {Number(metrics.averageSlippagePoints || 0).toFixed(1)} pt</b></div>
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
  return <div className={"cc-kpi cc-tone-"+tone}><span className="cc-kpi-icon"><ScenovaIcon name={icon} size={22}/></span><div><span className="cc-kpi-label">{label}</span><b>{value}</b>{sub?<small>{sub}</small>:null}</div></div>;
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

function SettingTile({icon,title,description,children,wide=false,accent=false}:{icon:string;title:string;description?:string;children:any;wide?:boolean;accent?:boolean}) {
  return <div className={"cc-setting-tile "+(wide?"wide ":"")+(accent?"accent":"")}><div className="cc-setting-tile-head"><span><ScenovaIcon name={icon} size={18}/></span><div><b>{title}</b>{description?<small>{description}</small>:null}</div></div><div className="cc-setting-control">{children}</div></div>;
}
function SwitchSetting({checked,onChange,onLabel,offLabel}:{checked:boolean;onChange:(value:boolean)=>void;onLabel:string;offLabel:string}) {
  return <label className={"cc-switch "+(checked?"on":"")}><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/><span className="cc-switch-track"><i/></span><b>{checked?onLabel:offLabel}</b></label>;
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
          aria-label={props.label || "เปิดหรือปิดการตั้งค่านี้"}
          checked={enabled}
          disabled={Boolean(props.disabled)}
          onChange={e=>{
            props.onChange?.(e.target.checked ? selectedValue : "0");
          }}
        />
        <span className="setting-toggle-track"><i/></span>
        <span className="setting-toggle-text">{props.label || (enabled ? "เปิดใช้งาน" : "ปิดใช้งาน")}</span>
      </label>
      {enabled&&<select
        className="input"
        value={selectedValue}
        disabled={!enabled || Boolean(props.disabled)}
        onChange={e=>props.onChange?.(e.target.value)}
      >
        {values.map((value:string)=>(
          <option key={value} value={value}>{props.format ? props.format(value) : value}</option>
        ))}
      </select>}
    </div>
  );
}

function BasketProfitTargetField(props: any) {
  const enabled = Number(props.value || 0) > 0;
  const targetValue = enabled ? String(props.value) : String(props.defaultTarget);
  const trailEnabled = enabled && Number(props.trailPercent || 0) > 0;
  const percentValue = trailEnabled ? String(props.trailPercent) : String(props.defaultPercent);
  const targetValues = Array.from(new Set([
    ...props.targetOptions.map((value:any)=>String(value)),
    targetValue
  ]));
  const percentValues = Array.from(new Set([
    ...props.percentOptions.map((value:any)=>String(value)),
    percentValue
  ]));

  return (
    <div className={"daily-profit-target-field basket-profit-target-field " + (enabled ? "enabled" : "")}>
      <label className="toggle-setting-label">
        <input
          type="checkbox"
          aria-label="เปิดหรือปิดเป้ากำไรรวมทั้งชุด"
          checked={enabled}
          onChange={e=>{
            if (e.target.checked) {
              props.onTargetChange?.(targetValue);
            } else {
              props.onTargetChange?.("0");
              props.onPercentChange?.("0");
            }
          }}
        />
        <span className="setting-toggle-track"><i/></span>
        <span className="setting-toggle-text">{enabled ? "เปิดเป้ากำไรรวมทั้งชุด" : "ปิดเป้ากำไรรวมทั้งชุด"}</span>
      </label>

      {enabled&&<div className="daily-profit-main-row basket-profit-main-row">
        <select className="input" value={targetValue} onChange={e=>props.onTargetChange?.(e.target.value)}>
          {targetValues.map((value:string)=><option key={value} value={value}>{"กำไรรวมถึง $"+value}</option>)}
        </select>

        <label className="mini-check">
          <input
            type="checkbox"
            checked={trailEnabled}
            onChange={e=>props.onPercentChange?.(e.target.checked ? percentValue : "0")}
          />
          <span>ถึงเป้าแล้วปล่อยกำไรวิ่งต่อ</span>
        </label>

        <select
          className="input daily-profit-percent-select"
          value={percentValue}
          disabled={!trailEnabled}
          onChange={e=>props.onPercentChange?.(e.target.value)}
        >
          {percentValues.map((value:string)=><option key={value} value={value}>{"ย่อลงจากกำไรสูงสุด "+value+"% → ปิดทุกออเดอร์"}</option>)}
        </select>
      </div>}

      {enabled&&<div className="basket-profit-explain">
        {trailEnabled
          ? <>ถึงเป้า <b>{"$"+targetValue}</b> แล้วจะยังไม่ปิดทันที · ระบบจำกำไรสูงสุด และปิดทุกออเดอร์เมื่อกำไรย่อลง <b>{percentValue}%</b></>
          : <>ถึงกำไรรวม <b>{"$"+targetValue}</b> → ปิดทุกออเดอร์ในชุดทันที</>}
      </div>}
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
          aria-label="เปิดหรือปิดเป้ากำไรวันนี้"
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
        <span className="setting-toggle-track"><i/></span>
        <span className="setting-toggle-text">{enabled ? "เปิดเป้ากำไรวันนี้" : "ไม่ตั้งเป้ากำไรวันนี้"}</span>
      </label>

      {enabled&&<div className="daily-profit-main-row">
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
          <span>ถึงเป้าแล้วทำงานต่อ</span>
        </label>

        <select
          className="input daily-profit-percent-select"
          value={percentValue}
          disabled={!enabled || !props.continueAfterTarget}
          onChange={e=>props.onPercentChange?.(e.target.value)}
        >
          {percentValues.map((value:string)=>(
            <option key={value} value={value}>กำไรลด {value}% แล้วหยุด</option>
          ))}
        </select>
      </div>}
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
          aria-label={props.label || "เปิดหรือปิดการตั้งค่านี้"}
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
        <span className="setting-toggle-track"><i/></span>
        <span className="setting-toggle-text">{props.label || (enabled ? "เปิดใช้งาน" : "ปิดใช้งาน")}</span>
      </label>
      {enabled&&<div className="toggle-pair-controls">
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
      </div>}
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
