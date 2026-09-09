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
  tradeJournal: any;
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
  profitTargetMode: "AUTO",
  perPositionLossMoney: 0,
  manualStopLossPoints: 0,
  minOrderIntervalMs: 300,
  maxOrdersPerMinute: 120,
  adaptiveEngine: true,
  riskPerOrderPercent: 0.25,
  allowMinimumLotOverride: true,
  hardStopAtrMultiplier: 2,
  atrPeriod: 14,
  confidenceGateEnabled: false,
  confidenceThreshold: 55,
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
  const [botSettingsOpen, setBotSettingsOpen] = useState(false);
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
    if (!botSettingsOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setBotSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [botSettingsOpen]);

  useEffect(() => {
    const terminalVisible = activeView === "overview";
    if ((!logsOpen && !terminalVisible) || !data?.instance?.id) return;
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
  const spreadStatusLabel:Record<string,string> = {
    NORMAL: "ปกติ",
    ELEVATED: "สูงกว่าปกติ",
    BLOCKED: "พักเปิดออเดอร์ใหม่",
    FALLBACK_BLOCKED: "พักเปิดออเดอร์ใหม่",
    NEWS_WIDE: "สเปรดกว้างช่วงข่าว · ยังเทรดได้",
    EXTREME: "สเปรดผิดปกติรุนแรง · หยุดส่งคำสั่ง",
    WARMUP: "กำลังเรียนรู้"
  };
  const heartbeatAgeSeconds = Math.max(0, Number(data?.instance?.ea_last_seen_age_seconds ?? metrics.heartbeatAgeSeconds ?? 0));
  const isAgentOnline = Boolean(data?.instance?.agent_online || data?.instance?.device_online);
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
  const softwareUpdate = data?.softwareUpdate || {
    required: false,
    installerRequired: false,
    eaUpdateRequired: false,
    currentVersion: null,
    latestVersion: "",
    currentEaVersion: null,
    latestEaVersion: "",
    currentEaHash: null,
    latestEaHash: null,
    eaVersionMatch: false,
    eaHashMatch: false,
    downloadPath: "",
    reason: null
  };
  const softwareUpdateRequired =
    data?.selectedSlot?.mode === "LOCAL" &&
    Boolean(softwareUpdate.required);
  const botStarting = desired === "RUNNING" && state !== "RUNNING";
  const botRunning = state === "RUNNING";
  const startConnectionReady = isMt5Online || isAgentOnline;
  // Let the customer press Start whenever SCENOVA has a live connection.
  // Runtime/update/access/trading blockers are validated by /bot/start and
  // shown as an explicit warning instead of silently disabling the button.
  const startBlocked =
    busy ||
    botStarting ||
    botRunning ||
    !startConnectionReady;
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

  const connectionLabel = isMt5Online
    ? "EA + MT5 เชื่อมต่อแล้ว"
    : isAgentOnline
      ? "Windows Agent เชื่อมแล้ว · รอ EA"
      : data?.account
        ? "รอ Windows Agent / MT5"
        : "ยังไม่ได้เชื่อมบัญชี";
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
  const marketRegimeDetailLabel: Record<string,string> = {
    NEWS_IMPULSE: "มีแรงส่งเร็วจากตลาด",
    VOLATILITY_EXPANSION: "ความผันผวนกำลังเพิ่ม",
    BREAKOUT_EXPANSION: "ราคากำลังขยายหลังเบรกกรอบ",
    TREND_PULLBACK: "ราคากำลังย่อในแนวโน้ม",
    TREND_ACCELERATION: "แนวโน้มกำลังเร่งตัว",
    TREND_CONTINUATION: "แนวโน้มกำลังเดินต่อ",
    LOW_VOLATILITY: "ตลาดเคลื่อนไหวแคบ",
    RANGE_BREAK_ATTEMPT: "กำลังทดสอบการออกจากกรอบ",
    RANGE_ROTATION: "ราคาแกว่งสลับในกรอบ",
    TRANSITION: "ตลาดกำลังเปลี่ยนสภาวะ"
  };
  const currentPositions = Math.max(0, Number(metrics.positions || 0));
  const configuredMaxPositions = Math.max(1, Number(settings.maxPositions || 1));

  const openPositions = Array.isArray(metrics.openPositions)
    ? [...metrics.openPositions].sort((a:any,b:any)=>Number(a.openedAt||0)-Number(b.openedAt||0))
    : [];
  const latestBotCommand = Array.isArray(botLogs?.events) && botLogs.events.length
    ? botLogs.events[0]
    : null;
  const latestCommandStatusLabel:Record<string,string> = {
    PENDING: "รอ EA รับคำสั่ง",
    DELIVERED: "ส่งถึง EA แล้ว",
    ACKED: "EA รับและตอบกลับแล้ว",
    FAILED: "คำสั่งมีปัญหา"
  };
  const latestCommandStatus = latestBotCommand
    ? (latestCommandStatusLabel[String(latestBotCommand.status||"")] || String(latestBotCommand.status||"—"))
    : "ยังไม่มีคำสั่งล่าสุด";
  const marketTradeLabel =
    !isMt5Online
      ? (isAgentOnline ? "Agent เชื่อมแล้ว · รอ EA Heartbeat — ยังส่งออเดอร์ไม่ได้" : "รอ MT5 เชื่อมต่อ")
      : String(liveStatus.code||"") === "MARKET_CLOSED"
        ? "ตลาดปิด — รอ Session"
        : metrics.tradeReady === true
          ? "ตลาดเปิด — พร้อมส่งออเดอร์"
          : "มีราคา แต่ยังมีเงื่อนไขที่บล็อกการเทรด";


  const nearlyEqual = (left:any, right:any, tolerance=0.005) =>
    Math.abs(Number(left || 0) - Number(right || 0)) <= tolerance;
  const eaSettingsTelemetryReady =
    isMt5Online &&
    metrics.configuredMaxPositions !== undefined &&
    metrics.configuredBasketProfitTarget !== undefined &&
    metrics.configuredMaxBasketLoss !== undefined &&
    metrics.manualStopLossPoints !== undefined &&
    metrics.profitTargetMode !== undefined;
  const desiredProfitTargetMode = String(settings.profitTargetMode ||
    (Number(settings.basketProfitTargetMoney || 0) > 0 ||
     Number(settings.perPositionProfitMoney || 0) > 0 ? "MANUAL" : "AUTO")).toUpperCase();
  const eaSettingsSynced =
    eaSettingsTelemetryReady &&
    String(metrics.profitTargetMode || "").toUpperCase() === desiredProfitTargetMode &&
    Number(metrics.configuredMaxPositions || 0) === Number(settings.maxPositions || 0) &&
    nearlyEqual(metrics.configuredLot, settings.lot, 0.0001) &&
    nearlyEqual(metrics.configuredBasketProfitTarget, settings.basketProfitTargetMoney) &&
    nearlyEqual(metrics.appliedPerPositionProfit, settings.perPositionProfitMoney) &&
    nearlyEqual(metrics.appliedProfitRunTrailPercent, settings.profitRunTrailPercent) &&
    nearlyEqual(metrics.configuredMaxBasketLoss, settings.maxBasketLossMoney) &&
    nearlyEqual(metrics.manualStopLossPoints, settings.manualStopLossPoints);
  const settingsSyncLabel = settingsDirty
    ? "ยังไม่บันทึก"
    : !eaSettingsTelemetryReady
      ? "รอ EA รายงานค่า"
      : eaSettingsSynced
        ? "EA รับค่าตรงกัน"
        : "รอ EA รับค่าล่าสุด";
  const settingsSyncTone = settingsDirty
    ? "warn"
    : eaSettingsSynced
      ? "good"
      : "warn";
  const hardStopMultiplier = Number(metrics.hardStopAtrMultiplier || 0);
  const hardStopDistancePoints = Number(metrics.hardStopDistancePoints || 0);
  const systemHardStopDistancePoints = Number(metrics.systemHardStopDistancePoints ?? metrics.hardStopDistancePoints ?? 0);
  const manualStopLossPoints = Number(settings.manualStopLossPoints || 0);
  const stopLossMode = String(metrics.stopLossMode || (manualStopLossPoints > 0 ? "MANUAL_POINTS" : "SYSTEM_ATR"));
  const stopLossModeLabel = stopLossMode === "MANUAL_POINTS" ? "กำหนดเอง" : "ตามระบบ ATR";
  const effectiveBasketProfit = Number(metrics.effectiveBasketProfitTarget ?? metrics.basketProfitTarget ?? 0);
  const effectiveBasketLoss = Number(metrics.effectiveMaxBasketLoss ?? settings.maxBasketLossMoney ?? 0);
  const profitControlMode = String(metrics.profitControlMode || "");
  const effectiveMaxPositions = Math.max(1, Number(metrics.adaptiveMaxPositions || configuredMaxPositions));
  const pyramidProgressPoints = Number(metrics.pyramidProgressPoints || 0);
  const pyramidRequiredPoints = Number(metrics.pyramidRequiredPoints || 0);
  const entryBias = String(metrics.entryBias || (metrics.marketRegime === "TREND_UP" ? "BUY" : metrics.marketRegime === "TREND_DOWN" ? "SELL" : "BOTH"));
  const entryBiasLabel = entryBias === "BUY" ? "BUY ตามเทรนด์" : entryBias === "SELL" ? "SELL ตามเทรนด์" : "BUY / SELL ตามสัญญาณ";
  const trendText = (value:any) => Number(value) > 0 ? "ขึ้น" : Number(value) < 0 ? "ลง" : "กลาง";
  const positionCapacityLabel = currentPositions + " / " + effectiveMaxPositions + (effectiveMaxPositions !== configuredMaxPositions ? " · ตั้ง " + configuredMaxPositions : "");
  const ladderProgressPoints = Number(metrics.basketLadderProgressPoints || 0);
  const ladderRequiredPoints = Number(metrics.basketLadderRequiredPoints || 0);
  const ladderRung = Number(metrics.basketLadderRung || Math.max(1,currentPositions+1));
  const ladderPullbackPoints = Number(metrics.basketLadderPullbackPoints || 0);
  const ladderPullbackRequiredPoints = Number(metrics.basketLadderPullbackRequiredPoints || 0);
  const antiChaseActive = Boolean(metrics.antiChaseActive);
  const priceLocationState = String(metrics.priceLocationState || "NORMAL");
  const exhaustionScore = Number(metrics.exhaustionScore || 0);
  const extensionAtr = Number(metrics.extensionAtr || 0);
  const adverseWickRatio = Number(metrics.adverseWickRatio || 0);
  const antiChaseReason = String(metrics.antiChaseReason || "NONE");

  const emaStack = String(metrics.emaStack || "MIXED");
  const emaSlope = String(metrics.emaSlope || "FLAT");
  const emaVolatilityState = String(metrics.emaVolatilityState || "NORMAL");
  const emaPriceVs200 = String(metrics.emaPriceVs200 || "UNKNOWN");
  const emaReclaimState = String(metrics.emaReclaimState || "NONE");
  const emaTfText = [metrics.emaTrendM1,metrics.emaTrendM5,metrics.emaTrendM15,metrics.emaTrendM30,metrics.emaTrendH1]
    .map(v=>Number(v)>0?"↑":Number(v)<0?"↓":"·").join(" ");

  const rescueState = String(metrics.rescueState || "NORMAL");
  const rescueActive = rescueState !== "NORMAL";
  const rescuePrimaryDirection = Number(metrics.rescuePrimaryDirection || 0);
  const rescueDirectionLabel = rescuePrimaryDirection > 0 ? "BUY" : rescuePrimaryDirection < 0 ? "SELL" : "—";
  const rescueHedgeLot = Number(metrics.rescueHedgeLot || 0);
  const rescueNetExposure = Number(metrics.rescueNetExposure || 0);
  const rescueRequiredMoney = Number(metrics.rescueRequiredMoney || 0);
  const rescueRecoveredMoney = Number(metrics.rescueRecoveredMoney || 0);
  const rescueRecoveryPrice = Number(metrics.rescueRecoveryPrice || 0);
  const rescueCombinedProfit = Number(metrics.rescueCombinedProfit || 0);
  const rescueReversalScore = Number(metrics.rescueReversalScore || 0);
  const rescueOldestMinutes = Number(metrics.rescueOldestAgeSeconds || 0) / 60;
  const rescueReason = String(metrics.rescueReversalReason || "NONE");
  const effectiveLadderTarget = Number(metrics.effectiveLadderTargetPositions || configuredMaxPositions);
  const performanceRiskMode = String(metrics.performanceRiskMode || "NORMAL");
  const consecutiveBasketLosses = Number(metrics.consecutiveBasketLosses || 0);
  const rescueStableSeconds = Number(metrics.rescueReversalStableSeconds || 0);
  const rescueHedgeLockSeconds = Number(metrics.rescueHedgeLockSeconds || 0);

  const journalStats = data?.tradeJournal?.stats || {};
  const journalRecent = Array.isArray(data?.tradeJournal?.recent) ? data.tradeJournal.recent : [];
  const hideModeIrrelevantStatus = String(liveStatus.code || "") === "RISK_LIMIT_TOO_SMALL";
  const visibleLiveStatus = hideModeIrrelevantStatus
    ? { label: "รอสัญญาณเข้า", tone: "good" }
    : liveStatus;

  const customerSetupLabel = (value:any) => {
    const code = String(value || "NONE").toUpperCase();
    const labels: Record<string,string> = {
      NONE: "ยังไม่มีจุดเข้าที่ชัดเจน",
      FIB_PULLBACK: "ราคาย่อกลับเข้าโซน Fibonacci",
      ORDER_BLOCK_PULLBACK: "ราคาย่อกลับเข้า Order Block",
      OB_FIB_PULLBACK: "Order Block และ Fibonacci สนับสนุนตรงกัน",
      LEVEL_REACTION: "ราคากำลังตอบสนองแนวรับ/แนวต้าน",
      BREAKOUT: "ราคากำลังเบรกกรอบ",
      BREAKOUT_RETEST: "เบรกแล้วกลับมาทดสอบโซน",
      PULLBACK_RETEST: "ราคาย่อกลับมาทดสอบแนวโน้ม",
      CONTINUATION: "มีจังหวะเดินตามแนวโน้มต่อ",
      STRUCTURE_EXECUTION: "โครงสร้างราคาเริ่มยืนยันจุดเข้า",
      NEWS_EXECUTION: "มีแรงส่งระยะสั้นจากตลาด",
      CAUTION_ZONE: "จุดเข้าอยู่ใกล้โซนที่ต้องระวัง"
    };
    return labels[code] || "กำลังประเมินจุดเข้า";
  };
  const rawSetupCode = String(metrics.entryTrigger || metrics.entryModel || "NONE");
  const setupCustomerText = customerSetupLabel(rawSetupCode);
  const entryQualityGrade = String(metrics.entryQuality || "C").toUpperCase();
  const entryQualityCustomerText =
    entryQualityGrade === "A" ? "A · คุณภาพสูง"
      : entryQualityGrade === "B" ? "B · คุณภาพปานกลาง"
      : "C · รอเงื่อนไขเพิ่ม";
  const priceLocationCustomerText = antiChaseActive
    ? "ราคาวิ่งไกลเกินจุดเหมาะสม · รอจังหวะใหม่"
    : priceLocationState === "BREAKOUT_RETEST_READY"
      ? "ราคากลับมาทดสอบหลังเบรก · พร้อมประเมินเข้า"
      : priceLocationState === "PULLBACK_RETEST_READY" || priceLocationState === "RETEST_READY"
        ? "ราคาย่อกลับเข้าบริเวณที่เหมาะสม"
        : "ตำแหน่งราคาอยู่ในช่วงที่ประเมินเข้าได้";
  const rawOrderBlockState = entryBias === "SELL"
    ? String(metrics.bearishOrderBlockState || "NONE")
    : String(metrics.bullishOrderBlockState || "NONE");
  const orderBlockQuality = entryBias === "SELL"
    ? Number(metrics.bearishOrderBlockQuality || 0)
    : Number(metrics.bullishOrderBlockQuality || 0);
  const orderBlockCustomerText =
    rawOrderBlockState === "NONE" || orderBlockQuality <= 0
      ? "ยังไม่พบ Order Block ที่เด่น"
      : orderBlockQuality >= 75
        ? "พบ Order Block คุณภาพสูง"
        : orderBlockQuality >= 45
          ? "พบ Order Block ที่ใช้งานได้"
          : "พบ Order Block แต่ยังต้องรอยืนยัน";
  const fibScore = Number(metrics.fibSetupScore || 0);
  const fibCustomerText =
    fibScore >= 70 ? "Fibonacci สนับสนุนจุดเข้าอย่างชัดเจน"
      : fibScore >= 40 ? "Fibonacci เริ่มสนับสนุนจุดเข้า"
      : "Fibonacci ยังไม่ให้สัญญาณเด่น";
  const emaStackCustomerText =
    emaStack === "BULLISH" ? "เส้นค่าเฉลี่ยเรียงตัวสนับสนุนขาขึ้น"
      : emaStack === "BEARISH" ? "เส้นค่าเฉลี่ยเรียงตัวสนับสนุนขาลง"
      : "เส้นค่าเฉลี่ยยังผสมกัน · รอทิศทางชัดขึ้น";
  const emaReclaimCustomerText =
    emaReclaimState === "RECLAIM_EMA21_UP" ? "ราคากลับยืนเหนือแนวเฉลี่ยระยะสั้น"
      : emaReclaimState === "LOSE_EMA21_DOWN" ? "ราคาหลุดแนวเฉลี่ยระยะสั้น"
      : "ยังไม่มีสัญญาณกลับตัวจากเส้นค่าเฉลี่ย";
  const ladderCustomerText = currentPositions > 0
    ? "กำลังจัดจังหวะไม้ถัดไปตามระยะราคา · ไม้ "+currentPositions+"/"+configuredMaxPositions
    : "จะเริ่มเพิ่มไม้หลังจากเปิดไม้แรกแล้ว";
  const protectionCustomerText = Number(metrics.dynamicTakeProfitPrice || 0) > 0
    ? "กำลังใช้ TP "+Number(metrics.dynamicTakeProfitPrice).toFixed(symbolDigits)+" และ SL "+Number(metrics.dynamicStopPrice || 0).toFixed(symbolDigits)
    : "ระบบจะคำนวณ TP และ SL ตามสภาพตลาดเมื่อมีออเดอร์";
  const riskCustomerText = performanceRiskMode === "NORMAL"
    ? "ระดับความเสี่ยงปกติ · ใช้จำนวนไม้ตามที่ลูกค้ากำหนด"
    : "ระบบกำลังระมัดระวังมากขึ้นหลังผลการเทรดช่วงล่าสุด";
  const rescueStateCustomerText =
    rescueState === "NORMAL" ? "ยังไม่ต้องใช้การฟื้นตัว"
      : rescueState === "WARNING" ? "กำลังเฝ้าระวัง Basket ที่ติดลบ"
      : rescueState === "ACTIVE" ? "กำลังลดความเสี่ยงของ Basket"
      : rescueState === "RECOVERY" ? "กำลังฟื้นผลขาดทุนของ Basket"
      : "กำลังจัดการ Basket ให้กลับสู่สถานะปกติ";
  const recoveryCustomerText = rescueActive
    ? "ฟื้นแล้ว $"+rescueRecoveredMoney.toFixed(2)+" · เหลือ $"+rescueRequiredMoney.toFixed(2)
    : "ไม่มีภาระการฟื้นตัวในขณะนี้";
  const reversalCustomerText = rescueActive
    ? (Boolean(metrics.rescueReversalConfirmed)
        ? "ยืนยันแรงกลับตัวแล้ว"
        : "กำลังติดตามแรงกลับตัว")
    : "ยังไม่มีสถานะที่ต้องติดตามการกลับตัว";

  const desiredStateLabel =
    desired === "RUNNING" ? "RUNNING — ให้บอททำงาน"
      : desired === "SAFE_STOP" ? "SAFE_STOP — ห้ามเปิดออเดอร์ใหม่"
      : desired === "STOPPED" ? "STOPPED — หยุด"
      : desired;
  const agentLastSeen = data?.instance?.agent_last_seen_at
    ? new Date(data.instance.agent_last_seen_at)
    : null;
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
      if (actualRunningNow || Number(data?.instance?.metrics?.positions || 0) > 0) {
        throw new Error("กรุณาหยุดบอทและปิด Position ให้หมดก่อนติดตั้งหรืออัปเดต SCENOVA");
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
      "InpMinOrderIntervalMs=300",
      "InpMaxOrdersPerMinute=120",
      "InpEntryMode=" + (settings.entryMode === "BUY_ONLY" ? 1 : settings.entryMode === "SELL_ONLY" ? 2 : 0),
      "InpMomentumTicks=20",
      "InpMomentumEntryPoints=8.0",
      "InpStrongFlowPoints=25.0",
      "InpFlowTrailBoost=0.60",
      "InpPauseOnManualTrade=true",
      "InpHeartbeatSeconds=3",
      "InpMaxOfflineLeaseSeconds=600",
      "InpAdaptiveEngine=true",
      "InpRiskPerOrderPercent=0.25",
      "InpAllowMinimumLotOverride=true",
      "InpHardStopAtrMultiplier=2",
      "InpManualStopLossPoints=" + Number(settings.manualStopLossPoints || 0),
      "InpPerPositionLossMoney=0",
      "InpAtrPeriod=" + settings.atrPeriod,
      "InpConfidenceGateEnabled=" + (settings.confidenceGateEnabled ? "true" : "false"),
      "InpConfidenceThreshold=55",
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
      const message = String(e?.message || "เกิดข้อผิดพลาด");
      setError(path.startsWith("/bot/start") ? "เริ่มบอทไม่ได้: " + message : message);
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

      if (key === "profitTargetMode") {
        const mode = String(value || "AUTO").toUpperCase();
        next.profitTargetMode = mode;
        if (mode === "AUTO" || mode === "OFF") {
          next.basketProfitTargetMoney = 0;
          next.perPositionProfitMoney = 0;
          next.profitRunTrailPercent = 0;
          next.basketTriggerMoney = 0;
          next.basketTrailMoney = 0;
        } else if (mode === "MANUAL" &&
                   Number(next.basketProfitTargetMoney || 0) <= 0 &&
                   Number(next.perPositionProfitMoney || 0) <= 0) {
          next.basketProfitTargetMoney = 10;
        }
      }

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
        "manualStopLossPoints",
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
      delete payload.tradingProfile;
      payload.adaptiveEngine = true;
      payload.minOrderIntervalMs = 300;
      payload.maxOrdersPerMinute = 120;
      payload.riskPerOrderPercent = 0.25;
      payload.allowMinimumLotOverride = true;
      payload.hardStopAtrMultiplier = 2;
      payload.confidenceGateEnabled = Boolean(settings.confidenceGateEnabled);
      payload.confidenceThreshold = 55;
      payload.sessionStartHour = 0;
      payload.sessionEndHour = 24;
      payload.maxAtrPoints = 0;
      payload.profitTargetMode = ["AUTO","MANUAL","OFF"].includes(
        String(settings.profitTargetMode || "AUTO").toUpperCase()
      ) ? String(settings.profitTargetMode || "AUTO").toUpperCase() : "AUTO";

      if (payload.profitTargetMode === "AUTO" || payload.profitTargetMode === "OFF") {
        payload.basketProfitTargetMoney = 0;
        payload.perPositionProfitMoney = 0;
        payload.profitRunTrailPercent = 0;
      }

      // New profit UX no longer exposes the legacy dollar Basket trailing.
      // Clear hidden legacy values on every save so they cannot affect trades.
      payload.basketTriggerMoney = 0;
      payload.basketTrailMoney = 0;
      // EA 1.017 uses a real Broker SL. Never send the retired floating-money
      // per-position loss control from the web.
      payload.perPositionLossMoney = 0;
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
            <span className={"cc-head-chip " + (isMt5Online ? "good" : isAgentOnline ? "warn" : "bad")}><i/><span><b>{isMt5Online ? "เชื่อมต่อแล้ว" : isAgentOnline ? "Agent เชื่อมแล้ว" : "ยังไม่เชื่อมต่อ"}</b><small>{isMt5Online ? (data.account?.broker || "MT5")+" · EA Online" : isAgentOnline ? "Windows Agent Online · รอ EA" : (data.account?.broker || "MT5")+" · "+(data.selectedSlot?.mode || "LOCAL")}</small></span></span>
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

        {activeView === "overview" && data.account && data.selectedSlot?.mode === "LOCAL" && softwareUpdateRequired && (
          <div className="cc-update-alert" role="alert">
            <div className="cc-update-alert-head">
              <span className="cc-update-alert-icon">!</span>
              <div>
                <b>ต้องดำเนินการก่อนเริ่มบอท</b>
                <small>กล่องนี้จะแสดงเฉพาะเมื่อ Agent / EA / EX5 ไม่ตรงกับ Server เท่านั้น</small>
              </div>
              <button className="btn cc-update-refresh" disabled={busy} onClick={()=>load(selectedSlotIdRef.current)}>
                <ScenovaIcon name="refresh" size={15}/>ตรวจสอบอีกครั้ง
              </button>
            </div>

            <div className="cc-update-alert-list">
              {softwareUpdate.installerRequired && (
                <div className="cc-update-alert-row">
                  <span className="cc-update-row-dot">!</span>
                  <div className="cc-update-row-copy">
                    <b>Windows Agent ไม่ตรงเวอร์ชัน</b>
                    <small>
                      ปัจจุบัน {softwareUpdate.currentVersion ? "v"+softwareUpdate.currentVersion : "ไม่พบเวอร์ชัน"} · Server ต้องการ v{softwareUpdate.latestVersion || "—"}
                    </small>
                  </div>
                  <div className="cc-update-row-action">
                    <strong>
                      {(state === "RUNNING" || desired === "RUNNING" || currentPositions > 0)
                        ? "หยุดบอทและรอให้ออเดอร์เป็น 0 ก่อนติดตั้งใหม่"
                        : "ต้องติดตั้ง Windows Agent ใหม่"}
                    </strong>
                    <button
                      className="btn danger-outline"
                      disabled={busy || state === "RUNNING" || desired === "RUNNING" || currentPositions > 0}
                      onClick={downloadWindowsInstaller}
                    >
                      ติดตั้ง v{softwareUpdate.latestVersion || "ล่าสุด"}
                    </button>
                  </div>
                </div>
              )}

              {(softwareUpdate.eaUpdateRequired || !softwareUpdate.eaVersionMatch) && (
                <div className="cc-update-alert-row">
                  <span className="cc-update-row-dot">!</span>
                  <div className="cc-update-row-copy">
                    <b>EA Runtime ไม่ตรงเวอร์ชัน</b>
                    <small>
                      ปัจจุบัน {softwareUpdate.currentEaVersion ? "v"+softwareUpdate.currentEaVersion : "ไม่พบเวอร์ชัน"} · Server ต้องการ v{softwareUpdate.latestEaVersion || "—"}
                    </small>
                  </div>
                  <div className="cc-update-row-action">
                    <strong>
                      {(state === "RUNNING" || desired === "RUNNING" || currentPositions > 0)
                        ? "หยุดบอท และรอให้ออเดอร์เป็น 0"
                        : "ไม่ต้องติดตั้งเอง — รอ Agent อัปเดต EA อัตโนมัติ"}
                    </strong>
                    <small>เมื่อปลอดภัย Agent จะโหลด EA รุ่นใหม่และรีโหลด MT5 ให้เอง</small>
                  </div>
                </div>
              )}

              {!softwareUpdate.eaHashMatch && (
                <div className="cc-update-alert-row">
                  <span className="cc-update-row-dot">!</span>
                  <div className="cc-update-row-copy">
                    <b>EX5 Hash ไม่ตรง Server</b>
                    <small>ไฟล์ EA ในเครื่องไม่ใช่ไฟล์เดียวกับ Release ล่าสุดบน Server</small>
                  </div>
                  <div className="cc-update-row-action">
                    <strong>
                      {(state === "RUNNING" || desired === "RUNNING" || currentPositions > 0)
                        ? "หยุดบอท และรอให้ออเดอร์เป็น 0"
                        : "ไม่ต้องติดตั้งเอง — รอ Agent รีโหลด EX5 อัตโนมัติ"}
                    </strong>
                    <small>ระบบจะไม่บังคับ Restart MT5 ระหว่างที่บอทกำลังทำงานหรือยังมี Position</small>
                  </div>
                </div>
              )}
            </div>
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
                      <button
                        type="button"
                        className="cc-control-settings-button"
                        onClick={() => {
                          setBotSettingsOpen(true);
                        }}
                      >
                        <ScenovaIcon name="settings" size={18}/>
                        <span>ตั้งค่าบอท</span>
                      </button>
                      <span className={"cc-state-pill "+(state==="RUNNING"?"running":state==="SAFE_STOP"?"safe":"stopped")}><span className="cc-state-dot"/><span><b>{state==="RUNNING"?"กำลังทำงาน":state==="SAFE_STOP"?"Safe Stop":"หยุดอยู่"}</b><small>{state==="RUNNING"?"บอททำงานปกติ":controlStateLabel}</small></span></span>
                      <span className="cc-last-update">อัปเดต {heartbeatAgeSeconds.toFixed(0)} วิ <ScenovaIcon name="refresh" size={14}/></span>
                    </div>
                  </div>

                  <div className="cc-control-fields cc-v3-control-fields">
                    <div className="cc-control-field"><span>Symbol</span><b>{metrics.symbol || settings.symbol}</b></div>
                    <div className="cc-control-field"><span>โหมดเข้าออเดอร์</span><select value={settings.entryMode} onChange={e=>editSetting("entryMode",e.target.value)}><option value="AUTO_MOMENTUM">AUTO SMART</option><option value="BUY_ONLY">BUY ONLY</option><option value="SELL_ONLY">SELL ONLY</option></select></div>
                    <div className="cc-control-field"><span>จำนวนไม้</span><select value={String(settings.maxPositions)} onChange={e=>editSetting("maxPositions",e.target.value)}>{[1,2,3,4,5,6,7,8,9,10,12,15,20,25,30,50,75,100].map(v=><option key={v} value={v}>{v}</option>)}</select></div>
                    <div className="cc-control-field"><span>Lot ต่อไม้</span><select value={String(settings.lot)} onChange={e=>editSetting("lot",e.target.value)}>{[0.01,0.02,0.03,0.05,0.1,0.2,0.3,0.5,1].map(v=><option key={v} value={v}>{v}</option>)}</select></div>
                  </div>

                  <div className="cc-primary-actions cc-v3-actions">
                    <button
                      className={"cc-action start " + (botStarting ? "starting" : botRunning ? "running" : "idle")}
                      disabled={startBlocked}
                      title={!startConnectionReady ? "รอการเชื่อมต่อจาก Windows Agent หรือ EA/MT5" : undefined}
                      onClick={()=>command("/bot/start","ส่งคำสั่ง Start แล้ว บอทกำลังเริ่มทำงาน")}
                      aria-live="polite"
                    >
                      <span className="cc-action-icon">
                        {botStarting ? <i className="cc-start-spinner" aria-hidden="true"/> : botRunning ? <i className="cc-start-pulse" aria-hidden="true"/> : <ScenovaIcon name="play" size={19}/>}
                      </span>
                      <b>{botStarting ? "กำลังเริ่มบอท..." : botRunning ? "บอทกำลังทำงาน" : "เริ่มบอท"}</b>
                    </button>
                    <button className="cc-action safe" disabled={stopBlocked} onClick={()=>command("/bot/stop","ส่งคำสั่งหยุดอย่างปลอดภัยแล้ว")}><span className="cc-action-icon"><ScenovaIcon name="stop" size={18}/></span><b>หยุดบอท</b></button>
                    <button className="cc-action close" disabled={busy || currentPositions===0} onClick={()=>confirm("ยืนยันปิดออเดอร์ทั้งหมดทันที?") && command("/bot/close-all","ส่งคำสั่งปิดออเดอร์ทั้งหมดแล้ว")}><span className="cc-action-icon"><ScenovaIcon name="close" size={19}/></span><b>ปิดทุกไม้</b></button>
                  </div>

                  <div className="cc-signal-grid">
                    <div className="cc-signal-item good"><ScenovaIcon name="trend" size={20}/><span><small>สภาพตลาด</small><b>{marketRegimeDetailLabel[String(metrics.marketRegimeDetail||"")]||marketRegimeLabel[String(metrics.marketRegime||"")]||"รอข้อมูล"}</b></span></div>
                    <div className="cc-signal-item"><ScenovaIcon name="target" size={20}/><span><small>ความมั่นใจ</small><b>{Boolean(settings.confidenceGateEnabled) ? Number(metrics.signalConfidence||0).toFixed(0)+"% / เกณฑ์ "+Number(metrics.effectiveConfidenceThreshold||55).toFixed(0)+"%" : Number(metrics.signalConfidence||0).toFixed(0)+"% · ใช้ประกอบการตัดสินใจ"}</b></span></div>
                    <div className={"cc-signal-item "+(String(metrics.entryQuality||"C")==="A"?"good":String(metrics.entryQuality||"C")==="B"?"warn":"")}><ScenovaIcon name="status" size={20}/><span><small>คุณภาพจุดเข้า</small><b>{entryQualityCustomerText+" · "+Number(metrics.entryQualityScore||0).toFixed(0)+"/100"}</b></span></div>
                    <div className="cc-signal-item"><ScenovaIcon name="spread" size={20}/><span><small>สเปรด</small><b>{spreadValueLabel}</b></span></div>
                    <div className="cc-signal-item warn"><ScenovaIcon name="layers" size={20}/><span><small>ออเดอร์</small><b>{positionCapacityLabel}</b></span></div>
                    <div className={"cc-signal-item "+(visibleLiveStatus.tone==="bad"?"bad":visibleLiveStatus.tone==="warn"?"warn":"good")}><ScenovaIcon name="status" size={20}/><span><small>การเทรด</small><b>{visibleLiveStatus.label||"—"}</b></span></div>
                  </div>

                  <div className="cc-direction-strip">
                    <div><span>ทิศทาง</span><b className={entryBias==="BUY"?"text-good":entryBias==="SELL"?"text-bad":""}>{entryBiasLabel}</b></div>
                    <div><span>M5</span><b>{trendText(metrics.trendM5)}</b></div>
                    <div><span>M15</span><b>{trendText(metrics.trendM15)}</b></div>
                    <div><span>H1</span><b>{trendText(metrics.trendH1)}</b></div>
                    <div><span>จุดเข้า</span><b>{setupCustomerText}</b></div>
                    <div><span>เพิ่มไม้</span><b>{currentPositions>0 ? "ไม้ "+currentPositions+"/"+configuredMaxPositions : "รอไม้แรก"}</b></div>
                  </div>

                  <div className="cc-realtime-strip" aria-label="ข้อมูลเรียลไทม์">
                    <div><span>ตำแหน่งราคา</span><b>{priceLocationCustomerText}</b></div>
                    <div><span>Order Block</span><b>{orderBlockCustomerText}</b></div>
                    <div><span>Fibonacci</span><b>{fibCustomerText}</b></div>
                    <div><span>TP / SL ปัจจุบัน</span><b>{Number(metrics.dynamicTakeProfitPrice||0)>0 ? "TP "+Number(metrics.dynamicTakeProfitPrice).toFixed(symbolDigits)+" · SL "+Number(metrics.dynamicStopPrice||0).toFixed(symbolDigits) : "รอออเดอร์เพื่อคำนวณ"}</b></div>
                    <div><span>การฟื้นตัว</span><b>{recoveryCustomerText}</b></div>
                    <div><span>แรงกลับตัว</span><b>{reversalCustomerText}</b></div>
                  </div>

                </section>

                <section className="panel cc-status-card cc-v3-account">
                  <div className="cc-card-head"><div className="cc-card-title"><span className="cc-card-icon alt"><ScenovaIcon name="account" size={20}/></span><div><h2>สถานะบัญชี</h2></div></div><span className={"cc-mini-health "+(isMt5Online?"good":"warn")}><i/>{isMt5Online?"ใช้งานปกติ":isAgentOnline?"Agent เชื่อมแล้ว · รอ EA":"รอเชื่อมต่อ"}</span></div>
                  <div className="cc-status-list">
                    <StatusRow label="เลขบัญชี" value={data.account.account_number}/><StatusRow label="โบรกเกอร์" value={data.account.broker}/><StatusRow label="เซิร์ฟเวอร์" value={metrics.server||data.account.broker_server}/><StatusRow label="การเชื่อมต่อ" value={connectionLabel} tone={isMt5Online?"good":"warn"} dot/><StatusRow label="Heartbeat" value={heartbeatAgeSeconds.toFixed(0)+" วินาที · HTTP "+(heartbeatHttpStatus||"—")} tone={heartbeatAgeSeconds<=20?"good":"warn"} dot/><StatusRow label="สถานะบอท" value={controlStateLabel} tone={state==="RUNNING"?"good":state==="SAFE_STOP"?"warn":"bad"} dot/><StatusRow label="สิทธิ์ใช้งาน" value={accessLabel}/>
                  </div>
                  <div className="cc-status-actions"><button className="btn full cc-status-detail" onClick={()=>setActiveView("account")}><ScenovaIcon name="settings" size={16}/>จัดการบัญชี</button><button className="btn full cc-status-detail" onClick={()=>setLogsOpen(true)}><ScenovaIcon name="clock" size={16}/>ประวัติการทำงาน</button></div>
                </section>
              </div>

              <section className="panel cc-intelligence-v3 cc-customer-intelligence">
                <div className="cc-card-head">
                  <div className="cc-card-title">
                    <span className="cc-card-icon"><ScenovaIcon name="brain" size={20}/></span>
                    <div>
                      <h2>ภาพรวมการวิเคราะห์</h2>
                      <small>สรุปสิ่งที่บอทเห็นในตลาดและสิ่งที่กำลังรอ ก่อนตัดสินใจเปิดหรือดูแลออเดอร์</small>
                    </div>
                  </div>
                  <span className="cc-mini-health good"><i/>อัปเดตตามตลาด</span>
                </div>

                <div className="cc-intel-summary-grid">
                  <div className="cc-intel-summary-card">
                    <span className="cc-summary-icon"><ScenovaIcon name="target" size={19}/></span>
                    <div><small>จังหวะราคา</small><b>{priceLocationCustomerText}</b><p>{setupCustomerText}</p></div>
                  </div>
                  <div className="cc-intel-summary-card">
                    <span className="cc-summary-icon"><ScenovaIcon name="trend" size={19}/></span>
                    <div><small>แนวโน้ม</small><b>{emaStackCustomerText}</b><p>{emaReclaimCustomerText}</p></div>
                  </div>
                  <div className="cc-intel-summary-card">
                    <span className="cc-summary-icon"><ScenovaIcon name="layers" size={19}/></span>
                    <div><small>โซนสนับสนุนจุดเข้า</small><b>{orderBlockCustomerText}</b><p>{fibCustomerText}</p></div>
                  </div>
                  <div className="cc-intel-summary-card">
                    <span className="cc-summary-icon"><ScenovaIcon name="shield" size={19}/></span>
                    <div><small>การป้องกันออเดอร์</small><b>{protectionCustomerText}</b><p>บอทปรับการป้องกันตามราคาจริงและค่าที่ลูกค้าตั้งไว้</p></div>
                  </div>
                  <div className="cc-intel-summary-card">
                    <span className="cc-summary-icon"><ScenovaIcon name="layers" size={19}/></span>
                    <div><small>การเพิ่มไม้</small><b>{ladderCustomerText}</b><p>จะเพิ่มไม้เมื่อราคาผ่านจังหวะที่กำหนด ไม่ยิงเพิ่มทันทีโดยไม่มีเงื่อนไข</p></div>
                  </div>
                  <div className={"cc-intel-summary-card "+(rescueActive?"warn":"")}>
                    <span className="cc-summary-icon"><ScenovaIcon name="shield" size={19}/></span>
                    <div><small>การดูแลความเสี่ยง</small><b>{rescueStateCustomerText}</b><p>{riskCustomerText}</p></div>
                  </div>
                </div>

                <div className="cc-performance-board">
                  <div className="cc-performance-head">
                    <div><b>ผลการเทรดโดยรวม</b><small>สรุปจากรายการที่ปิดแล้ว เพื่อให้เห็นคุณภาพการทำงานแบบอ่านง่าย</small></div>
                  </div>

                  <div className="cc-performance-kpis">
                    <div className="cc-performance-kpi"><span>เทรดที่ปิดแล้ว</span><b>{Number(journalStats.closedTrades||0)}</b><small>รายการ</small></div>
                    <div className={"cc-performance-kpi "+(Number(journalStats.winRate||0)>=50?"good":"warn")}><span>อัตราชนะ</span><b>{Number(journalStats.winRate||0).toFixed(1)+"%"}</b><small>จากรายการที่มีผลลัพธ์</small></div>
                    <div className={"cc-performance-kpi "+(Number(journalStats.netProfit||0)>=0?"good":"bad")}><span>กำไรสุทธิ</span><b>{(Number(journalStats.netProfit||0)>=0?"+$":"-$")+Math.abs(Number(journalStats.netProfit||0)).toFixed(2)}</b><small>รวมรายการที่บันทึก</small></div>
                    <div className="cc-performance-kpi"><span>Profit Factor</span><b>{Number(journalStats.profitFactor||0).toFixed(2)}</b><small>กำไรรวมเทียบขาดทุนรวม</small></div>
                    <div className="cc-performance-kpi good"><span>กำไรเฉลี่ย</span><b>{"+$"+Number(journalStats.averageWin||0).toFixed(2)}</b><small>ต่อรายการที่ชนะ</small></div>
                    <div className="cc-performance-kpi bad"><span>ขาดทุนเฉลี่ย</span><b>{"-$"+Math.abs(Number(journalStats.averageLoss||0)).toFixed(2)}</b><small>ต่อรายการที่แพ้</small></div>
                  </div>

                  <div className="cc-recent-activity">
                    <div className="cc-recent-activity-head"><b>รายการล่าสุด</b><small>แสดงสูงสุด 5 รายการล่าสุด</small></div>
                    <div className="cc-recent-activity-list">
                      {journalRecent.length ? journalRecent.slice(0,5).map((row:any,index:number)=>{
                        const isExit = row.event_type === "EXIT";
                        const pnl = Number(row.net_profit || 0);
                        const activitySetup = customerSetupLabel(row.entry_trigger || row.entry_model || row.market_regime_detail);
                        const timeLabel = row.created_at ? new Date(row.created_at).toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"}) : "—";
                        return (
                          <div className="cc-recent-activity-row" key={String(row.created_at||index)+"-"+index}>
                            <span className={"cc-activity-badge "+(isExit?(pnl>=0?"good":"bad"):"entry")}>{isExit?"ปิด":"เข้า"}</span>
                            <div className="cc-activity-main">
                              <b>{String(row.direction||"—")+" · "+activitySetup}</b>
                              <small>{timeLabel+" · คุณภาพ "+String(row.entry_quality||"—")}</small>
                            </div>
                            <strong className={isExit?(pnl>=0?"text-good":"text-bad"):""}>
                              {isExit ? (pnl>=0?"+$":"-$")+Math.abs(pnl).toFixed(2) : Number(row.price||0).toFixed(symbolDigits)}
                            </strong>
                          </div>
                        );
                      }) : <div className="cc-recent-activity-empty">ยังไม่มีรายการเทรดที่บันทึกไว้</div>}
                    </div>
                  </div>
                </div>
              </section>

              <LiveTerminalPanel
                symbol={String(metrics.symbol||settings.symbol||"")}
                accountNumber={String(data.account?.account_number||"—")}
                server={String(metrics.server||data.account?.broker_server||"—")}
                connectionLabel={connectionLabel}
                state={String(state)}
                desired={String(desired)}
                executionLabel={String(liveStatus.label||"—")}
                executionDetail={String(liveStatus.detail||"")}
                marketTradeLabel={marketTradeLabel}
                marketRegime={marketRegimeLabel[String(metrics.marketRegime||"")]||String(metrics.marketRegime||"รอข้อมูล")}
                entryBias={entryBiasLabel}
                confidence={Number(metrics.signalConfidence||0)}
                spread={spreadValueLabel}
                spreadStatus={spreadStatusLabel[spreadStatus]||spreadStatus}
                momentum={Number(metrics.momentumPoints||0)}
                heartbeatAge={heartbeatAgeSeconds}
                heartbeatLatency={heartbeatLatencyMs}
                heartbeatHttp={heartbeatHttpStatus}
                latestCommand={latestBotCommand ? commandLabel(String(latestBotCommand.command||"")) : "—"}
                latestCommandStatus={latestCommandStatus}
                openPositions={openPositions}
                positionsCount={currentPositions}
                maxPositions={configuredMaxPositions}
                symbolDigits={symbolDigits}
                dailyProfit={Number(metrics.dailyProfit||0)}
                basketProfit={Number(metrics.basketCycleProfit||metrics.basketProfit||0)}
                filter={terminalFilter}
                onFilter={setTerminalFilter}
                entries={filteredTerminalEntries}
                loading={logsLoading}
                autoScroll={terminalAutoScroll}
                onAutoScroll={setTerminalAutoScroll}
                terminalRef={terminalWindowRef}
                onOpenFull={()=>setLogsOpen(true)}
              />

              <BotSettingsModal
                open={botSettingsOpen}
                onClose={() => {
                  setBotSettingsOpen(false);
                }}
                settings={settings}
                symbol={String(metrics.symbol||settings.symbol||"")}
                dirty={settingsDirty}
                busy={busy}
                syncLabel={settingsSyncLabel}
                metrics={metrics}
                hardStopMultiplier={hardStopMultiplier}
                systemHardStopDistancePoints={systemHardStopDistancePoints}
                hardStopDistancePoints={hardStopDistancePoints}
                manualStopLossPoints={manualStopLossPoints}
                effectiveBasketLoss={effectiveBasketLoss}
                effectiveBasketProfit={effectiveBasketProfit}
                basketCycleProfit={Number(metrics.basketCycleProfit||metrics.basketProfit||0)}
                profitControlMode={profitControlMode}
                spreadValueLabel={spreadValueLabel}
                spreadLimitLabel={spreadLimitLabel}
                spreadStatusLabel={spreadStatusLabel[spreadStatus]||spreadStatus}
                onEdit={editSetting}
                onSave={async(e:any)=>{
                  await saveSettings(e);
                  if (!settingsDirtyRef.current) {
                    setBotSettingsOpen(false);
                  }
                }}
              />

              <div className="cc-mobile-command-dock mobile-only" aria-label="ควบคุมบอท">
                <button
                  className={"cc-mobile-command start " + (botStarting ? "starting" : botRunning ? "running" : "idle")}
                  disabled={startBlocked}
                  title={!startConnectionReady ? "รอการเชื่อมต่อจาก Windows Agent หรือ EA/MT5" : undefined}
                  onClick={()=>command("/bot/start","ส่งคำสั่งเริ่มบอทแล้ว")}
                  aria-live="polite"
                >
                  <span>{botStarting ? <i className="cc-start-spinner" aria-hidden="true"/> : botRunning ? <i className="cc-start-pulse" aria-hidden="true"/> : "▶"}</span>
                  <b>{botStarting ? "กำลังเริ่ม" : botRunning ? "กำลังทำงาน" : "เริ่ม"}</b>
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

function LiveTerminalPanel(props:any) {
  const positions = Array.isArray(props.openPositions) ? props.openPositions : [];
  const filters = ["ALL","COMMAND","STATE","MARKET","RISK","ORDER"] as const;

  return (
    <section className="panel cc-live-terminal-panel">
      <div className="cc-live-terminal-head">
        <div className="cc-live-terminal-title">
          <span className="cc-terminal-icon">&gt;_</span>
          <div>
            <div className="eyebrow">LIVE EA TERMINAL</div>
            <h2>{props.symbol} · สถานะการทำงานแบบ Real-time</h2>
            <small>Account {props.accountNumber} · {props.server}</small>
          </div>
        </div>
        <div className="cc-live-terminal-head-actions">
          <label className="cc-terminal-auto">
            <input type="checkbox" checked={Boolean(props.autoScroll)} onChange={e=>props.onAutoScroll?.(e.target.checked)}/>
            <span>เลื่อนตามอัตโนมัติ</span>
          </label>
          <button type="button" className="btn" onClick={props.onOpenFull}>เปิด Terminal เต็มจอ</button>
        </div>
      </div>

      <div className="cc-live-terminal-status-grid">
        <TerminalStatusCard icon="status" label="EA กำลังทำอะไร" value={props.executionLabel} detail={props.executionDetail||"สถานะล่าสุดจาก EA"} tone={props.state==="RUNNING"?"good":"neutral"}/>
        <TerminalStatusCard icon="clock" label="คำสั่งล่าสุดจากเว็บ" value={props.latestCommand} detail={props.latestCommandStatus} tone={String(props.latestCommandStatus).includes("ตอบกลับ")?"good":"neutral"}/>
        <TerminalStatusCard icon="trend" label="สถานะตลาด" value={props.marketTradeLabel} detail={props.marketRegime+" · Bias "+props.entryBias} tone={String(props.marketTradeLabel).includes("พร้อม")?"good":String(props.marketTradeLabel).includes("ปิด")?"warn":"neutral"}/>
        <TerminalStatusCard icon="spread" label="สัญญาณ / Spread" value={"Confidence "+Number(props.confidence||0).toFixed(0)+"%"} detail={"Spread "+props.spread+" · "+props.spreadStatus+" · Momentum "+Number(props.momentum||0).toFixed(1)} tone={Number(props.confidence||0)>=70?"good":"neutral"}/>
      </div>

      <div className="cc-live-terminal-mini-grid">
        <div><span>Web ต้องการ</span><b>{props.desired}</b></div>
        <div><span>EA จริง</span><b>{props.state}</b></div>
        <div><span>Position</span><b>{props.positionsCount} / {props.maxPositions}</b></div>
        <div><span>Heartbeat</span><b>{Number(props.heartbeatAge||0).toFixed(0)}s · HTTP {props.heartbeatHttp||"—"}</b></div>
        <div><span>Latency</span><b>{Number(props.heartbeatLatency||0)>0?Number(props.heartbeatLatency).toFixed(0)+" ms":"—"}</b></div>
        <div><span>Daily / Basket P&L</span><b className={Number(props.dailyProfit||0)>=0?"text-good":"text-bad"}>{"$"+Number(props.dailyProfit||0).toFixed(2)} / {"$"+Number(props.basketProfit||0).toFixed(2)}</b></div>
      </div>

      <div className="cc-live-terminal-split">
        <div className="cc-live-terminal-half cc-live-terminal-half-positions">
          <div className="cc-live-positions">
            <div className="cc-live-subhead">
              <div><b>ออเดอร์ที่เปิดอยู่</b><small>รายละเอียดส่งตรงจาก EA ทุก Heartbeat</small></div>
              <span>{positions.length} ไม้</span>
            </div>
            {positions.length ? (
              <div className="cc-live-position-table">
                <div className="cc-live-position-row header">
                  <span>ไม้ / Ticket</span><span>ฝั่ง</span><span>Lot</span><span>ราคาเปิด</span><span>ราคาปัจจุบัน</span><span>SL</span><span>P/L</span><span>ระยะเดิน</span>
                </div>
                {positions.map((position:any,index:number)=>(
                  <div className="cc-live-position-row" key={String(position.ticket||index)}>
                    <span><b>#{index+1}</b><small>{String(position.ticket||"—")}</small></span>
                    <span><b className={String(position.side)==="BUY"?"text-good":"text-bad"}>{String(position.side||"—")}</b></span>
                    <span><b>{Number(position.volume||0).toFixed(2)}</b></span>
                    <span><b>{Number(position.openPrice||0).toFixed(props.symbolDigits)}</b></span>
                    <span><b>{Number(position.currentPrice||0).toFixed(props.symbolDigits)}</b></span>
                    <span><b>{Number(position.sl||0)>0?Number(position.sl).toFixed(props.symbolDigits):"ไม่มี"}</b><small>{Number(position.slDistancePoints||0)>0?Number(position.slDistancePoints).toFixed(0)+" pt ถึง SL":""}</small></span>
                    <span><b className={Number(position.profit||0)>=0?"text-good":"text-bad"}>{Number(position.profit||0)>=0?"+$":"-$"}{Math.abs(Number(position.profit||0)).toFixed(2)}</b></span>
                    <span><b className={Number(position.movePoints||0)>=0?"text-good":"text-bad"}>{Number(position.movePoints||0)>=0?"+":""}{Number(position.movePoints||0).toFixed(0)} pt</b></span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="cc-live-position-empty"><ScenovaIcon name="orders" size={20}/><div><b>ยังไม่มี Position เปิดอยู่</b><small>เมื่อ EA เปิดออเดอร์ รายละเอียดแต่ละไม้จะขึ้นตรงนี้ทันที</small></div></div>
            )}
          </div>
        </div>

        <div className="cc-live-terminal-half cc-live-terminal-half-events">
          <div className="cc-live-terminal-events-shell">
            <div className="cc-terminal-toolbar cc-live-terminal-toolbar">
              {filters.map(filter=><button type="button" key={filter} className={"cc-terminal-filter "+(props.filter===filter?"active":"")} onClick={()=>props.onFilter?.(filter)}>{filter}</button>)}
              <span className="cc-terminal-count">{props.entries?.length||0} lines · refresh 5s</span>
            </div>

            <div className="cc-terminal-window cc-live-terminal-window" ref={props.terminalRef}>
              {(props.entries||[]).map((entry:any)=>(
                <TerminalLine key={"inline-"+entry.id} time={entry.time} level={entry.level} category={entry.category} text={entry.text} detail={entry.detail}/>
              ))}
              {!props.loading && !(props.entries||[]).length && <div className="cc-terminal-empty">ยังไม่มี Event ในหมวดนี้</div>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TerminalStatusCard({icon,label,value,detail,tone="neutral"}:{icon:string;label:string;value:string;detail?:string;tone?:"neutral"|"good"|"warn"|"bad"}) {
  return <div className={"cc-live-status-card tone-"+tone}><span><ScenovaIcon name={icon} size={19}/></span><div><small>{label}</small><b>{value}</b>{detail?<em>{detail}</em>:null}</div></div>;
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

function BotSettingsModal(props:any) {
  const [activeSection,setActiveSection] = useState("basic");

  useEffect(() => {
    if (props.open) setActiveSection("basic");
  }, [props.open]);

  if (!props.open) return null;

  const profitTargetMode = String(props.settings?.profitTargetMode ||
    (Number(props.settings?.basketProfitTargetMoney || 0) > 0 ||
     Number(props.settings?.perPositionProfitMoney || 0) > 0 ? "MANUAL" : "AUTO")).toUpperCase();
  const basketProfitEnabled = profitTargetMode === "MANUAL" && Number(props.settings?.basketProfitTargetMoney || 0) > 0;
  const perPositionProfitEnabled = profitTargetMode === "MANUAL" && Number(props.settings?.perPositionProfitMoney || 0) > 0;
  const manualSl = Number(props.settings?.manualStopLossPoints || 0);
  const stopLossMode = manualSl > 0 ? "MANUAL" : "AUTO";
  const suggestedManualSl = String(Math.max(
    1,
    Math.round(Number(
      props.systemHardStopDistancePoints ||
      props.hardStopDistancePoints ||
      1000
    ))
  ));

  return (
    <div className="cc-bot-modal-backdrop" role="presentation" onMouseDown={e=>{
      if (e.target === e.currentTarget && !props.busy) props.onClose?.();
    }}>
      <div className="cc-bot-modal cc-bot-modal-full" role="dialog" aria-modal="true" aria-labelledby="cc-bot-modal-title">
        <div className="cc-bot-modal-head">
          <div className="cc-bot-modal-title">
            <span><ScenovaIcon name="bot" size={26}/></span>
            <div>
              <h2 id="cc-bot-modal-title">ตั้งค่าบอททั้งหมด</h2>
              <small>ตั้งค่าการเข้าออเดอร์ เป้ากำไร ความเสี่ยง และเวลาเทรด</small>
            </div>
          </div>
          <div className="cc-bot-modal-head-actions">
            <span className={"cc-bot-modal-dirty "+(props.dirty?"warn":"good")}><i/>{props.dirty?"มีค่าที่ยังไม่บันทึก":"ค่าถูกบันทึกแล้ว"}</span>
            <button type="button" className="cc-bot-modal-close" onClick={()=>props.onClose?.()} disabled={props.busy} aria-label="ปิดหน้าต่างตั้งค่าบอท">×</button>
          </div>
        </div>

        <div className="cc-bot-modal-body">
          <section className="cc-smart-engine-banner">
            <span className="cc-smart-engine-icon"><ScenovaIcon name="brain" size={24}/></span>
            <div className="cc-smart-engine-copy">
              <b>Setup-First Intelligence พร้อมทำงาน</b>
              <small>วิเคราะห์ M1/M5/M15/M30/H1 + แนวรับ–แนวต้าน + Order Block + Fibonacci + Price Action โดย Confidence เป็นตัวกรองเสริมที่เลือกเปิดได้</small>
            </div>
            <div className="cc-smart-engine-badges">
              <span>{"Fib M5 + M15 · หลัก "+String(props.metrics?.fibTimeframe||"กำลังเลือก")}</span>
              <span>เปิดเป็นชุดอัตโนมัติ</span>
              <span>{String(props.metrics?.entryModel||"กำลังวิเคราะห์")}</span>
            </div>
          </section>

          <nav className="cc-bot-settings-nav" aria-label="หมวดการตั้งค่าบอท">
            <button type="button" className={activeSection==="basic"?"active":""} onClick={()=>setActiveSection("basic")} aria-current={activeSection==="basic"?"page":undefined}>
              <span><ScenovaIcon name="settings" size={18}/></span>
              <div><b>ตั้งค่าพื้นฐาน</b><small>{Number(props.settings.maxPositions||1)} ไม้ · {Number(props.settings.lot||0.01).toFixed(2)} Lot</small></div>
            </button>
            <button type="button" className={activeSection==="profit"?"active":""} onClick={()=>setActiveSection("profit")} aria-current={activeSection==="profit"?"page":undefined}>
              <span><ScenovaIcon name="profit" size={18}/></span>
              <div><b>เป้าหมายกำไร</b><small>{profitTargetMode==="AUTO"?"Auto · รักษากำไรตามตลาด":profitTargetMode==="OFF"?"ปิดอยู่":basketProfitEnabled?"กำไรรวม $"+Number(props.settings.basketProfitTargetMoney).toFixed(2):perPositionProfitEnabled?"ต่อไม้ $"+Number(props.settings.perPositionProfitMoney).toFixed(2):"กำหนดเอง"}</small></div>
            </button>
            <button type="button" className={activeSection==="risk"?"active":""} onClick={()=>setActiveSection("risk")} aria-current={activeSection==="risk"?"page":undefined}>
              <span><ScenovaIcon name="shield" size={18}/></span>
              <div><b>ป้องกันขาดทุน</b><small>{stopLossMode==="AUTO"?"Auto · ระบบตั้ง SL":"กำหนดเอง · "+Number(manualSl).toFixed(0)+" pt"}</small></div>
            </button>
            <button type="button" className={activeSection==="time"?"active":""} onClick={()=>setActiveSection("time")} aria-current={activeSection==="time"?"page":undefined}>
              <span><ScenovaIcon name="clock" size={18}/></span>
              <div><b>เวลาเทรด</b><small>{String(props.settings.sessionStartHour).padStart(2,"0")}:00–{String(props.settings.sessionEndHour).padStart(2,"0")}:00</small></div>
            </button>
          </nav>

          <section className="cc-bot-basic-section cc-bot-settings-panel" hidden={activeSection!=="basic"}>
            <div className="cc-mode-section-head compact"><div><span className="cc-mode-step">1</span><div><b>ตั้งค่าพื้นฐาน</b><small>เลือกทิศทาง จำนวนไม้ และ Lot ที่ต้องการ</small></div></div></div>
            <div className="cc-bot-basic-grid">
              <div className="cc-bot-basic-card">
                <div className="cc-bot-basic-label"><span><ScenovaIcon name="gold" size={19}/></span><div><b>Symbol</b><small>สินทรัพย์ที่ EA กำลังทำงานอยู่</small></div></div>
                <div className="cc-bot-basic-readonly">{props.symbol || "—"}</div>
              </div>
              <label className="cc-bot-basic-card">
                <div className="cc-bot-basic-label"><span><ScenovaIcon name="bot" size={19}/></span><div><b>ทิศทางออเดอร์</b><small>AUTO ให้ระบบเลือก BUY/SELL อัตโนมัติ</small></div></div>
                <select className="input" value={String(props.settings.entryMode||"AUTO_MOMENTUM")} onChange={e=>props.onEdit?.("entryMode",e.target.value)}>
                  <option value="AUTO_MOMENTUM">AUTO SMART — Setup-First เลือก BUY/SELL</option>
                  <option value="BUY_ONLY">BUY ONLY — เปิดเฉพาะ Buy</option>
                  <option value="SELL_ONLY">SELL ONLY — เปิดเฉพาะ Sell</option>
                </select>
              </label>
              <label className="cc-bot-basic-card">
                <div className="cc-bot-basic-label"><span><ScenovaIcon name="layers" size={19}/></span><div><b>จำนวนไม้</b><small>เมื่อสัญญาณผ่าน ระบบจะเปิดเป็นชุดตามจำนวนนี้</small></div></div>
                <select className="input" value={String(props.settings.maxPositions||1)} onChange={e=>props.onEdit?.("maxPositions",e.target.value)}>
                  {[1,2,3,4,5,6,7,8,9,10,12,15,20,25,30,50,75,100].map(v=><option key={v} value={v}>{v} ไม้</option>)}
                </select>
              </label>
              <label className="cc-bot-basic-card">
                <div className="cc-bot-basic-label"><span><ScenovaIcon name="lot" size={19}/></span><div><b>Lot ต่อไม้</b><small>ใช้ตามค่าที่ลูกค้ากำหนด ระบบจะไม่ลด Lot อัตโนมัติ</small></div></div>
                <select className="input" value={String(props.settings.lot||0.01)} onChange={e=>props.onEdit?.("lot",e.target.value)}>
                  {[0.01,0.02,0.03,0.05,0.1,0.2,0.3,0.5,1].map(v=><option key={v} value={v}>{Number(v).toFixed(2)} Lot</option>)}
                </select>
              </label>
              <div className={"cc-bot-basic-card "+(props.settings.confidenceGateEnabled?"accent":"")}>
                <div className="cc-bot-basic-label"><span><ScenovaIcon name="target" size={19}/></span><div><b>ตัวกรอง Confidence</b><small>ค่าเริ่มต้นปิด — ถ้าเปิดจะใช้ Dynamic Threshold ตาม Setup (ฐาน 55); ถ้าปิดคะแนนยังคำนวณแต่ไม่บล็อกออเดอร์</small></div></div>
                <SwitchSetting
                  checked={Boolean(props.settings.confidenceGateEnabled)}
                  onChange={(value:boolean)=>props.onEdit?.("confidenceGateEnabled",value)}
                  onLabel="เปิดใช้ · Dynamic Confidence จะช่วยกรองจุดเข้า"
                  offLabel="ปิดอยู่ · คะแนนยังคำนวณ แต่ไม่บล็อกออเดอร์"
                />
              </div>
            </div>
          </section>

          <section className="cc-modal-settings-section cc-bot-settings-panel" hidden={activeSection!=="profit"}>
            <div className="cc-mode-section-head compact"><div><span className="cc-mode-step">2</span><div><b>เป้าหมายกำไร</b><small>เลือกให้ EA ตัดสินใจอัตโนมัติ หรือกำหนดจำนวนเงินเอง</small></div></div></div>
            <ProfitTargetModeField
              mode={profitTargetMode}
              cycleProfit={props.basketCycleProfit}
              peakProfit={props.metrics?.profitRunPeak}
              onChange={(mode:string)=>props.onEdit?.("profitTargetMode",mode)}
            />
            {profitTargetMode==="MANUAL"&&<div className="cc-modal-setting-grid two">
              <SettingTile icon="profit" title="กำไรทั้งชุดถึงแล้วปิด" description="รวมกำไรทุก Position ใน Basket เดียวกัน" wide accent={basketProfitEnabled}>
                <BasketProfitTargetField
                  value={props.settings.basketProfitTargetMoney}
                  trailPercent={props.settings.profitRunTrailPercent}
                  targetOptions={[0.5,1,2,3,5,10,15,20,25,30,50,75,100,200,300,500,750,1000]}
                  percentOptions={[5,10,15,20,25,30,40,50]}
                  defaultTarget="10"
                  defaultPercent="20"
                  currentCycleProfit={props.basketCycleProfit}
                  onTargetChange={(v:string)=>props.onEdit?.("basketProfitTargetMoney",v)}
                  onPercentChange={(v:string)=>props.onEdit?.("profitRunTrailPercent",v)}
                />
              </SettingTile>
              <SettingTile icon="orders" title="กำไรต่อไม้" description="Position ไหนถึงกำไรที่ตั้ง ปิดเฉพาะไม้นั้น" wide accent={perPositionProfitEnabled}>
                <ToggleMoneyField label="เปิดกำไรต่อไม้" defaultValue="2" value={props.settings.perPositionProfitMoney} suffix="กำไรต่อ Position" onChange={(v:string)=>props.onEdit?.("perPositionProfitMoney",v)}/>
              </SettingTile>
            </div>}
            <div className="cc-modal-setting-grid one">
              <SettingTile icon="pnl" title="เป้ากำไรวันนี้" description="ทำงานแยกจากกำไร Basket/ต่อไม้; ถึงเป้าแล้วเลือกหยุดหรือปล่อยต่อ" wide>
                <DailyProfitTargetField
                  value={props.settings.dailyProfitTargetMoney}
                  continueAfterTarget={Boolean(props.settings.dailyProfitContinueAfterTarget)}
                  drawdownPercent={props.settings.dailyProfitDrawdownPercent}
                  targetOptions={[0.5,1,2,3,5,10,15,20,25,30,50,75,100,200,300,500,750,1000]}
                  percentOptions={[5,10,15,20,25,30,40,50]}
                  defaultTarget="10"
                  defaultPercent="20"
                  onTargetChange={(v:string)=>props.onEdit?.("dailyProfitTargetMoney",v)}
                  onContinueChange={(v:boolean)=>props.onEdit?.("dailyProfitContinueAfterTarget",v)}
                  onPercentChange={(v:string)=>props.onEdit?.("dailyProfitDrawdownPercent",v)}
                />
              </SettingTile>
            </div>
          </section>

          <section className="cc-modal-settings-section cc-bot-settings-panel" hidden={activeSection!=="risk"}>
            <div className="cc-mode-section-head compact"><div><span className="cc-mode-step">3</span><div><b>ป้องกันขาดทุน / Stop Loss</b><small>ค่าเริ่มต้น Auto — ให้ EA คำนวณ SL หรือเลือกกำหนดระยะเอง</small></div></div></div>

            <StopLossModeField
              mode={stopLossMode}
              manualPoints={manualSl}
              suggestedManualPoints={suggestedManualSl}
              systemMultiplier={props.hardStopMultiplier}
              systemDistancePoints={props.systemHardStopDistancePoints}
              appliedDistancePoints={props.hardStopDistancePoints}
              pointSize={props.metrics?.pointSize}
              symbolDigits={props.metrics?.symbolDigits}
              onModeChange={(mode:string)=>{
                if (mode === "AUTO") {
                  props.onEdit?.("manualStopLossPoints",0);
                } else if (manualSl <= 0) {
                  props.onEdit?.("manualStopLossPoints",suggestedManualSl);
                }
              }}
              onManualChange={(v:string)=>props.onEdit?.("manualStopLossPoints",v)}
            />

            <div className="cc-modal-setting-grid two">
              <SettingTile icon="pnl" title="หยุดเมื่อขาดทุนวันนี้" description="ขาดทุนรวมวันนี้ถึงจำนวนนี้ ระบบหยุดตาม Daily Loss">
                <ToggleMoneyField label="เปิดขาดทุนรายวัน" defaultValue="25" value={props.settings.dailyLossMoney} suffix="ขาดทุนรวมวันนี้" onChange={(v:string)=>props.onEdit?.("dailyLossMoney",v)}/>
              </SettingTile>
              <SettingTile icon="risk" title="ปิดทั้งชุดเมื่อขาดทุน" description="รวมขาดทุนทุกไม้ใน Basket">
                <ToggleMoneyField label="เปิด Basket Loss" defaultValue="10" value={props.settings.maxBasketLossMoney} suffix="ขาดทุนรวมทั้งชุด" onChange={(v:string)=>props.onEdit?.("maxBasketLossMoney",v)}/>
              </SettingTile>
            </div>

            <div className="cc-modal-auto-strip">
              <span><small>โหมด SL ต่อไม้</small><b>{stopLossMode==="AUTO"?"AUTO · ระบบ ATR":"กำหนดเอง"}</b></span>
              <span><small>EA ใช้ SL จริง</small><b>{Number(props.hardStopDistancePoints||0)>0?Number(props.hardStopDistancePoints).toFixed(0)+" pt":"รอข้อมูล"}</b></span>
              <span><small>EA ใช้ Basket Loss</small><b>{"$"+Number(props.effectiveBasketLoss||0).toFixed(2)}</b></span>
            </div>
          </section>

          <section className="cc-modal-settings-section cc-bot-settings-panel" hidden={activeSection!=="time"}>
            <div className="cc-mode-section-head compact"><div><span className="cc-mode-step">4</span><div><b>เวลาเทรด</b><small>อ้างอิงเวลา Server ของ Broker</small></div></div></div>
            <div className="cc-modal-setting-grid four">
              <SettingTile icon="clock" title="ช่วงเวลาเทรด" description="Setup-First Engine เปิดวิเคราะห์ตลอด 24 ชั่วโมง">
                <div className="cc-readout"><b>00:00–24:00</b><small>ไม่ใช้ Session filter มาดักออเดอร์</small></div>
              </SettingTile>
              <SettingTile icon="status" title="เทรดช่วงข่าว" description="ไม่มี News Calendar hard block">
                <div className="cc-readout"><b>เปิดใช้งาน</b><small>หยุดเฉพาะ Spread ระดับ EXTREME / Broker ไม่อนุญาต</small></div>
              </SettingTile>
              <SettingTile icon="timer" title="Session ปัจจุบัน" description="อ่านจาก EA"><div className="cc-readout"><b>{String(props.metrics?.sessionProfile||"UNKNOWN")}</b><small>ช่วงเวลาตลาด</small></div></SettingTile>
              <SettingTile icon="spread" title="Spread ตอนนี้" description={"Adaptive limit "+String(props.spreadLimitLabel||"—")}><div className="cc-readout"><b>{String(props.spreadValueLabel||"—")}</b><small>{String(props.spreadStatusLabel||"—")}</small></div></SettingTile>
            </div>
          </section>

          <div className="cc-bot-modal-summary cc-bot-modal-summary-compact">
            <div><small>ระบบวิเคราะห์</small><b>Setup-First 5 TF</b></div>
            <div><small>จำนวนไม้</small><b>{Number(props.settings.maxPositions||1)} ไม้</b></div>
            <div><small>Lot สูงสุด</small><b>{Number(props.settings.lot||0.01).toFixed(2)}</b></div>
            <div><small>EA Sync</small><b>{props.syncLabel || "รอ EA"}</b></div>
          </div>
        </div>

        <div className="cc-bot-modal-footer">
          <div><ScenovaIcon name="info" size={16}/><span>บันทึกครั้งเดียว ระบบจะนำค่าชุดนี้ไปใช้กับ EA อัตโนมัติ</span></div>
          <div>
            <button type="button" className="btn" onClick={()=>props.onClose?.()} disabled={props.busy}>ปิดหน้าต่าง</button>
            <button type="button" className="btn cc-save-primary" disabled={props.busy||!props.dirty} onClick={props.onSave}><ScenovaIcon name="save" size={17}/>{props.busy?"กำลังบันทึก...":"บันทึกทั้งหมด"}</button>
          </div>
        </div>
      </div>
    </div>
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

function MoneyInput(props: any) {
  const externalValue = String(props.value ?? "");
  const [draft, setDraft] = useState(externalValue);

  useEffect(() => {
    setDraft(externalValue);
  }, [externalValue]);

  const commit = () => {
    const normalized = String(draft || "").replace(",", ".").trim();
    const value = Number(normalized);
    if (!Number.isFinite(value) || value <= 0) {
      setDraft(externalValue);
      return;
    }
    const next = String(Math.round(value * 100) / 100);
    setDraft(next);
    if (next !== externalValue) props.onCommit?.(next);
  };

  return (
    <div className={"money-input-shell " + (props.disabled ? "disabled" : "")}>
      <span className="money-prefix">$</span>
      <input
        className="input money-input"
        type="text"
        inputMode="decimal"
        aria-label={props.ariaLabel || "จำนวนเงิน"}
        value={draft}
        disabled={Boolean(props.disabled)}
        onFocus={e=>e.currentTarget.select()}
        onChange={e=>{
          const value = e.target.value.replace(",", ".");
          if (value === "" || /^\d*(?:\.\d{0,2})?$/.test(value)) {
            setDraft(value);
          }
        }}
        onBlur={commit}
        onKeyDown={e=>{
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
      {props.suffix ? <small>{props.suffix}</small> : null}
    </div>
  );
}

function NumberInput(props: any) {
  const externalValue = String(props.value ?? "");
  const [draft, setDraft] = useState(externalValue);

  useEffect(() => {
    setDraft(externalValue);
  }, [externalValue]);

  const commit = () => {
    const normalized = String(draft || "").replace(",", ".").trim();
    const value = Number(normalized);
    if (!Number.isFinite(value) || value <= 0) {
      setDraft(externalValue);
      return;
    }
    const next = String(Math.round(value * 100) / 100);
    setDraft(next);
    if (next !== externalValue) props.onCommit?.(next);
  };

  return (
    <div className={"money-input-shell " + (props.disabled ? "disabled" : "")}>
      {props.prefix ? <span className="money-prefix">{props.prefix}</span> : null}
      <input
        className="input money-input"
        type="text"
        inputMode="decimal"
        aria-label={props.ariaLabel || "ค่าตัวเลข"}
        value={draft}
        disabled={Boolean(props.disabled)}
        onFocus={e=>e.currentTarget.select()}
        onChange={e=>{
          const value = e.target.value.replace(",", ".");
          if (value === "" || /^\d*(?:\.\d{0,2})?$/.test(value)) {
            setDraft(value);
          }
        }}
        onBlur={commit}
        onKeyDown={e=>{
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
      {props.suffix ? <small>{props.suffix}</small> : null}
    </div>
  );
}

function ToggleNumberField(props: any) {
  const enabled = Number(props.value || 0) > 0;
  const selectedValue = enabled ? String(props.value) : String(props.defaultValue || "1");

  return (
    <div className={"field toggle-select-field toggle-money-field " + (enabled ? "enabled" : "") + (props.disabled ? " disabled" : "")}>
      <label className="toggle-setting-label">
        <input
          type="checkbox"
          aria-label={props.label || "เปิดหรือปิดการตั้งค่านี้"}
          checked={enabled}
          disabled={Boolean(props.disabled)}
          onChange={e=>props.onChange?.(e.target.checked ? selectedValue : "0")}
        />
        <span className="setting-toggle-track"><i/></span>
        <span className="setting-toggle-text">{props.label || (enabled ? "เปิดใช้งาน" : "ปิดใช้งาน")}</span>
      </label>
      {enabled ? (
        <NumberInput
          value={selectedValue}
          disabled={Boolean(props.disabled)}
          prefix={props.prefix}
          suffix={props.suffix}
          ariaLabel={props.label}
          onCommit={(value:string)=>props.onChange?.(value)}
        />
      ) : null}
    </div>
  );
}

function ToggleMoneyField(props: any) {
  const enabled = Number(props.value || 0) > 0;
  const selectedValue = enabled ? String(props.value) : String(props.defaultValue || "1");

  return (
    <div className={"field toggle-select-field toggle-money-field " + (enabled ? "enabled" : "") + (props.disabled ? " disabled" : "")}>
      <label className="toggle-setting-label">
        <input
          type="checkbox"
          aria-label={props.label || "เปิดหรือปิดการตั้งค่านี้"}
          checked={enabled}
          disabled={Boolean(props.disabled)}
          onChange={e=>props.onChange?.(e.target.checked ? selectedValue : "0")}
        />
        <span className="setting-toggle-track"><i/></span>
        <span className="setting-toggle-text">{props.label || (enabled ? "เปิดใช้งาน" : "ปิดใช้งาน")}</span>
      </label>
      {enabled ? (
        <MoneyInput
          value={selectedValue}
          disabled={Boolean(props.disabled)}
          suffix={props.suffix}
          ariaLabel={props.label}
          onCommit={(value:string)=>props.onChange?.(value)}
        />
      ) : null}
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

function ProfitTargetModeField(props:any) {
  const mode = String(props.mode || "AUTO").toUpperCase();
  const options = [
    { value:"AUTO", label:"Auto (ค่าเริ่มต้น)", detail:"EA คำนวณเป้ากำไรและปิดทั้งชุดเมื่อกำไรย่อลงหรือกราฟยืนยันกลับตัว" },
    { value:"MANUAL", label:"กำหนดเอง", detail:"ตั้งจำนวนเงินกำไรรวม หรือกำไรต่อไม้ด้วยตัวเอง" },
    { value:"OFF", label:"ปิด", detail:"ไม่ใช้เป้ากำไร เงินขาดทุนและ Stop Loss ยังทำงาน" }
  ];
  return (
    <div className={"profit-target-mode-card mode-"+mode.toLowerCase()}>
      <div className="profit-target-mode-options" role="radiogroup" aria-label="โหมดเป้าหมายกำไร">
        {options.map(option=><button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={mode===option.value}
          className={mode===option.value?"active":""}
          onClick={()=>props.onChange?.(option.value)}
        >
          <b>{option.label}</b>
          <small>{option.detail}</small>
        </button>)}
      </div>
      {mode==="AUTO"&&<div className="auto-profit-live">
        <span><i/>Auto กำลังดูแลกำไร</span>
        <b>{"รอบนี้ $"+Number(props.cycleProfit||0).toFixed(2)+" · สูงสุด $"+Number(props.peakProfit||0).toFixed(2)}</b>
        <small>ระบบจะปิดเฉพาะตอนกำไรรวมยังเป็นบวกและเหลือมากกว่าค่าเผื่อปิดออเดอร์</small>
      </div>}
      {mode==="OFF"&&<div className="auto-profit-off-note">ปิดเฉพาะระบบทำกำไรอัตโนมัติ — Stop Loss และตัวควบคุมขาดทุนยังทำงานตามเดิม</div>}
    </div>
  );
}

function StopLossModeField(props:any) {
  const mode = String(props.mode || "AUTO").toUpperCase() === "MANUAL" ? "MANUAL" : "AUTO";
  const systemDistance = Number(props.systemDistancePoints || 0);
  const appliedDistance = Number(props.appliedDistancePoints || 0);
  const manualValue = Number(props.manualPoints || 0) > 0
    ? String(props.manualPoints)
    : String(props.suggestedManualPoints || "1000");
  const pointSize = Number(props.pointSize || 0);
  const symbolDigits = Math.max(0, Math.min(8, Number(props.symbolDigits ?? 3)));
  const manualPoints = Number(manualValue || 0);
  const manualPriceDistance = pointSize > 0 ? manualPoints * pointSize : 0;
  const tenPricePoints = pointSize > 0 ? Math.round(10 / pointSize) : 0;
  const options = [
    {
      value:"AUTO",
      label:"Auto (ค่าเริ่มต้น)",
      detail:"EA คำนวณ Stop Loss จาก ATR + โครงสร้างตลาด และปรับการป้องกันให้อัตโนมัติ"
    },
    {
      value:"MANUAL",
      label:"กำหนดเอง",
      detail:"กำหนดระยะ Stop Loss เป็น points ของ Broker จากราคาเปิดของแต่ละ Position"
    }
  ];

  return (
    <div className={"profit-target-mode-card stop-loss-mode-card mode-"+mode.toLowerCase()}>
      <div className="profit-target-mode-options stop-loss-mode-options" role="radiogroup" aria-label="โหมด Stop Loss">
        {options.map(option=><button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={mode===option.value}
          className={mode===option.value?"active":""}
          onClick={()=>props.onModeChange?.(option.value)}
        >
          <b>{option.label}</b>
          <small>{option.detail}</small>
        </button>)}
      </div>

      {mode==="AUTO"
        ? <div className="auto-profit-live stop-loss-auto-live">
            <span><i/>Auto SL กำลังทำงาน</span>
            <b>{Number(props.systemMultiplier||0)>0
              ? "ATR × "+Number(props.systemMultiplier).toFixed(2)
              : "ระบบกำลังคำนวณ ATR"}</b>
            <small>{systemDistance>0
              ? "ระยะระบบตอนนี้ "+systemDistance.toFixed(0)+" points · EA ใช้จริง "+(appliedDistance>0?appliedDistance.toFixed(0)+" points":"รอ Sync")
              : "EA จะคำนวณระยะ SL ตาม ATR และสภาพตลาดทันทีเมื่อข้อมูลพร้อม"}</small>
          </div>
        : <div className="stop-loss-manual-live">
            <b>ระยะ Stop Loss ที่กำหนดเอง</b>
            <NumberInput
              value={manualValue}
              prefix="SL"
              suffix="points จากราคาเปิด"
              ariaLabel="ระยะ Stop Loss ที่กำหนดเอง"
              onCommit={(value:string)=>props.onManualChange?.(value)}
            />
            <div className="stop-loss-point-explain">
              <span>{pointSize>0
                ? Number(manualPoints).toLocaleString("en-US")+" points = ระยะราคา "+manualPriceDistance.toFixed(symbolDigits)
                : Number(manualPoints).toLocaleString("en-US")+" points ของ Broker"}</span>
              <small>{pointSize>0
                ? "Point size "+pointSize.toFixed(symbolDigits)+" · ตัวอย่าง ราคา 4300 → 4310 = "+tenPricePoints.toLocaleString("en-US")+" points"
                : "จำนวน points อ้างอิง _Point ของ Symbol/Broker ไม่ใช่จำนวนดอลลาร์ของราคา"}</small>
            </div>
          </div>}
    </div>
  );
}

function BasketProfitTargetField(props: any) {
  const enabled = Number(props.value || 0) > 0;
  const targetValue = enabled ? String(props.value) : String(props.defaultTarget);
  const trailEnabled = enabled && Number(props.trailPercent || 0) > 0;
  const percentValue = trailEnabled ? String(props.trailPercent) : String(props.defaultPercent);
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
        <MoneyInput
          value={targetValue}
          suffix="กำไรรวมทั้ง Basket"
          ariaLabel="เป้ากำไรรวมทั้งชุด"
          onCommit={(value:string)=>props.onTargetChange?.(value)}
        />

        <label className="mini-check">
          <input
            type="checkbox"
            checked={trailEnabled}
            onChange={e=>props.onPercentChange?.(e.target.checked ? percentValue : "0")}
          />
          <span>Profit Run — ถึงเป้าแล้วอย่าเพิ่งปิด</span>
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
          ? <><b>Profit Run เปิดอยู่:</b> <b>{"$"+targetValue}</b> คือจุดเริ่มปล่อยกำไรวิ่ง ไม่ใช่จุดปิด · EA จะปิดเมื่อกำไรย่อลงตามเปอร์เซ็นต์ที่เลือก</>
          : <>ถึงกำไรรวม <b>{"$"+targetValue}</b> → ปิดทุกออเดอร์ในชุดทันที</>}
        <br/>
        <small>{"EA ใช้ Basket Cycle P/L รวมผล Partial Close/Rescue · ตอนนี้ $"+Number(props.currentCycleProfit||0).toFixed(2)}</small>
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
      {enabled&&<div className="daily-profit-unlock-note">ถ้าเคยถึงเป้าและถูกล็อก แล้วแก้เป้าใหม่ให้สูงกว่ากำไรวันนี้ ระบบจะปลดล็อกและกลับ RUNNING อัตโนมัติใน Heartbeat ถัดไป</div>}
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
