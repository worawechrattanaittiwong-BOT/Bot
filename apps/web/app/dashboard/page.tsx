"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { API_URL, api, getToken } from "../../lib/api";
import { OwnerMobileNav, OwnerSidebar } from "../../components/OwnerSidebar";
import { ScenovaIcon } from "../../components/ScenovaIcon";
import { ScenovaBrand } from "../../components/ScenovaBrand";
import { useSystemPopup } from "../../components/SystemPopupProvider";

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
  startTransition: any;
  maintenance: any;
  partner: any;
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

type View = "overview" | "account" | "backtest";
const LIVE_PRICE_WINDOW_MS = 15 * 60 * 1000;
const defaultSettings = {
  symbol: "XAUUSD",
  lot: 0.01,
  maxPositions: 10,
  autoLot: 0.01,
  autoMaxPositions: 10,
  raceLot: 0.01,
  raceMaxPositions: 10,
  flipLockLot: 0.01,
  manualLot: 0.01,
  manualMaxPositions: 10,
  standardMaxBasketLossMoney: 10,
  standardDailyLossMoney: 25,
  standardDailyProfitTargetMoney: 0,
  manualMaxBasketLossMoney: 0,
  manualDailyLossMoney: 0,
  manualDailyProfitTargetMoney: 0,
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
  indicatorV6Mode: "SOFT_WEIGHT",
  controlMode: undefined,
  engineMode: "AUTO",
  raceCloseAllProfitEnabled: true,
  raceCloseAllProfitMoney: 0.5,
  zeroGridStepPrice: 3,
  zeroGridLowVolatilityEnabled: false,
  zeroGridLevelsPerSide: 10,
  zeroGridBaseLot: 0.01,
  zeroGridMinNetProfitMoney: 0.5,
  zeroGridCloseReserveMoney: 0.2,
  entryMode: "AUTO_MOMENTUM"
};

export default function DashboardPage() {
  const { showPopup, confirmPopup } = useSystemPopup();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkingVersion, setCheckingVersion] = useState(false);
  const statusDialogRef = useRef<HTMLDialogElement | null>(null);
  const [activeView, setActiveView] = useState<View>("overview");
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const selectedSlotIdRef = useRef("");
  const dashboardLoadInFlightRef = useRef(false);
  const dashboardReloadPendingRef = useRef<string | null>(null);
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
  const [livePricePoints, setLivePricePoints] = useState<Array<{t:number;price:number}>>([]);
  const livePriceSlotRef = useRef("");
  const mt5ApiBase =
    process.env.NEXT_PUBLIC_MT5_API_BASE ||
    (typeof window !== "undefined" ? window.location.origin + "/backend" : "");

  async function load(slotIdArg?: string, light = false) {
    const requestedSlotId = slotIdArg ?? selectedSlotIdRef.current;
    if (dashboardLoadInFlightRef.current) {
      dashboardReloadPendingRef.current = requestedSlotId;
      return;
    }

    dashboardLoadInFlightRef.current = true;
    try {
      const slotId = requestedSlotId;
      const query = new URLSearchParams();
      if (slotId) query.set("slotId", slotId);
      if (light) query.set("light", "1");
      const d = await api("/bot/dashboard" + (query.toString() ? "?" + query.toString() : ""));
      if (light) {
        setData((previous) => previous ? {
          ...d,
          tradeJournal: {
            ...(previous.tradeJournal || {}),
            ...(d.tradeJournal || {}),
            recent: previous.tradeJournal?.recent || [],
            hourlyWinRate: previous.tradeJournal?.hourlyWinRate || []
          }
        } : d);
      } else {
        setData(d);
      }
      if (!settingsDirtyRef.current) {
        const storedSettings:any = d.settings || {};
        const nextSettings:any = {
          ...defaultSettings,
          ...storedSettings,
          ...(d.instance?.metrics?.symbol ? { symbol: d.instance.metrics.symbol } : {})
        };
        const loadedControlModeRaw = String(nextSettings.controlMode || nextSettings.engineMode || "AUTO").toUpperCase();
        const loadedControlMode = loadedControlModeRaw === "ASSISTED" ? "AUTO" : loadedControlModeRaw;
        const legacyLot = Math.max(0.01, Number(nextSettings.lot || 0.01));
        const legacyMaxPositions = Math.max(1, Number(nextSettings.maxPositions || 1));
        const sizingProfileByMode:Record<string,{lot:string;max?:string}> = {
          AUTO:{lot:"autoLot",max:"autoMaxPositions"},
          RACE:{lot:"raceLot",max:"raceMaxPositions"},
          FLIP_LOCK:{lot:"flipLockLot"},
          MANUAL:{lot:"manualLot",max:"manualMaxPositions"}
        };
        const loadedSizingProfile = sizingProfileByMode[loadedControlMode];
        if (loadedSizingProfile) {
          if (storedSettings[loadedSizingProfile.lot] === undefined) nextSettings[loadedSizingProfile.lot] = legacyLot;
          if (loadedSizingProfile.max && storedSettings[loadedSizingProfile.max] === undefined) nextSettings[loadedSizingProfile.max] = legacyMaxPositions;
        }
        const legacyMaxBasketLoss = Math.max(0, Number(nextSettings.maxBasketLossMoney || 0));
        const legacyDailyLoss = Math.max(0, Number(nextSettings.dailyLossMoney || 0));
        const legacyDailyProfit = Math.max(0, Number(nextSettings.dailyProfitTargetMoney || 0));
        if (loadedControlMode === "MANUAL") {
          if (storedSettings.manualMaxBasketLossMoney === undefined) nextSettings.manualMaxBasketLossMoney = legacyMaxBasketLoss;
          if (storedSettings.manualDailyLossMoney === undefined) nextSettings.manualDailyLossMoney = legacyDailyLoss;
          if (storedSettings.manualDailyProfitTargetMoney === undefined) nextSettings.manualDailyProfitTargetMoney = legacyDailyProfit;
        } else if (loadedControlMode !== "ZERO_GRID") {
          if (storedSettings.standardMaxBasketLossMoney === undefined) nextSettings.standardMaxBasketLossMoney = legacyMaxBasketLoss;
          if (storedSettings.standardDailyLossMoney === undefined) nextSettings.standardDailyLossMoney = legacyDailyLoss;
          if (storedSettings.standardDailyProfitTargetMoney === undefined) nextSettings.standardDailyProfitTargetMoney = legacyDailyProfit;
        }
        if (loadedControlMode === "ZERO_GRID") {
          nextSettings.zeroGridStepPrice = Number(nextSettings.zeroGridStepPrice) === 2 ? 2 : 3;
          if (typeof nextSettings.zeroGridLowVolatilityEnabled !== "boolean") nextSettings.zeroGridLowVolatilityEnabled = false;
          nextSettings.zeroGridLevelsPerSide = Math.max(1, Math.min(30, Number(nextSettings.zeroGridLevelsPerSide) || 10));
          if (!Number.isFinite(Number(nextSettings.zeroGridBaseLot)) || Number(nextSettings.zeroGridBaseLot) <= 0) nextSettings.zeroGridBaseLot = 0.01;
          if (!Number.isFinite(Number(nextSettings.zeroGridMinNetProfitMoney)) || Number(nextSettings.zeroGridMinNetProfitMoney) <= 0.01) nextSettings.zeroGridMinNetProfitMoney = 0.5;
          if (!Number.isFinite(Number(nextSettings.zeroGridCloseReserveMoney)) || Number(nextSettings.zeroGridCloseReserveMoney) <= 0) nextSettings.zeroGridCloseReserveMoney = 0.2;
        }
        if (loadedControlMode === "RACE") {
          if (typeof nextSettings.raceCloseAllProfitEnabled !== "boolean") nextSettings.raceCloseAllProfitEnabled = true;
          if (!Number.isFinite(Number(nextSettings.raceCloseAllProfitMoney)) || Number(nextSettings.raceCloseAllProfitMoney) <= 0) nextSettings.raceCloseAllProfitMoney = 0.5;
        }
        setSettings(nextSettings);
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
    } finally {
      dashboardLoadInFlightRef.current = false;
      const pendingSlotId = dashboardReloadPendingRef.current;
      dashboardReloadPendingRef.current = null;
      if (pendingSlotId !== null) void load(pendingSlotId);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem("bot_token")) {
      window.location.href = "/login";
      return;
    }

    const requestedView = new URLSearchParams(window.location.search).get("view");
    if (requestedView === "account" || requestedView === "backtest") {
      setActiveView(requestedView);
    } else if (requestedView === "access") {
      // Access & Permissions was retired as a standalone page. Keep old bookmarks
      // working by taking the user to MT5 & EA, where membership/trial actions now live.
      setActiveView("account");
      window.history.replaceState({}, "", "/dashboard?view=account");
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
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible" || dashboardLoadInFlightRef.current) return;
      void load(undefined, true);
    }, 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!notice && !error) return;
    const text = error || notice;
    const pending = !error && /^กำลัง/.test(notice);
    showPopup({
      tone: error ? "error" : pending ? "info" : "success",
      title: error ? "ดำเนินการไม่สำเร็จ" : pending ? "กำลังดำเนินการ" : "ดำเนินการสำเร็จ",
      message: text,
      duration: pending ? 5000 : 2800
    });
    const timer = window.setTimeout(() => {
      setNotice("");
      setError("");
    }, pending ? 5000 : 3000);
    return () => window.clearTimeout(timer);
  }, [notice, error, showPopup]);

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
    if (!logsOpen || !data?.instance?.id) return;
    let cancelled = false;
    let requestInFlight = false;
    const refreshLogs = async () => {
      if (cancelled || requestInFlight || document.visibilityState !== "visible") return;
      requestInFlight = true;
      try {
        setLogsLoading(true);
        const slotQuery = selectedSlotIdRef.current ? "?slotId=" + encodeURIComponent(selectedSlotIdRef.current) : "";
        const result = await api("/bot/logs" + slotQuery);
        if (!cancelled) setBotLogs(result);
      } catch (e: any) {
        if (!cancelled && logsOpen) setError(e.message);
      } finally {
        requestInFlight = false;
        if (!cancelled) setLogsLoading(false);
      }
    };
    refreshLogs();
    const id = window.setInterval(refreshLogs, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [logsOpen, activeView, data?.instance?.id, selectedSlotId]);

  const metrics = data?.instance?.metrics || {};

  useEffect(() => {
    const slotKey = String(data?.selectedSlot?.id || data?.instance?.id || "");
    if (livePriceSlotRef.current !== slotKey) {
      livePriceSlotRef.current = slotKey;
      setLivePricePoints([]);
    }

    const heartbeatMetrics = data?.instance?.metrics || {};
    const marketState = String(heartbeatMetrics.marketSessionState || "").toUpperCase();
    const price = Number(heartbeatMetrics.marketMid || 0);
    if (!slotKey || marketState === "CLOSED" || !Number.isFinite(price) || price <= 0) return;

    const sampledAt = Date.now();
    setLivePricePoints(previous => {
      const cutoff = sampledAt - LIVE_PRICE_WINDOW_MS;
      const trimmed = previous.filter(point => point.t >= cutoff);
      const last = trimmed[trimmed.length - 1];
      if (last && sampledAt - last.t < 1000) return trimmed;
      return [...trimmed, { t: sampledAt, price }];
    });
  }, [data?.instance?.last_seen_at, data?.selectedSlot?.id]);
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
  const atrPoints = Number(metrics.atrPoints || 0);
  const atrPrice = pointSize > 0 ? atrPoints * pointSize : 0;
  const atrValueLabel = atrPoints > 0
    ? (atrPrice > 0 ? atrPrice.toFixed(symbolDigits) + " · " : "") + atrPoints.toFixed(0) + " pt"
    : "—";
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
  const marketSessionState = String(metrics.marketSessionState || "").toUpperCase();
  const marketSessionClosed =
    marketSessionState === "CLOSED" ||
    String(metrics.executionStatus || "").toUpperCase() === "MARKET_CLOSED";
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
  const statusNoticeCount = Number(marketSessionClosed || !isMt5Online) + Number(softwareUpdateRequired);

  const maintenance = data?.maintenance || { status:"OFF", blockStarts:false, summary:{ openPositions:0, runningInstances:0 } };
  const maintenanceBlocksStart = Boolean(maintenance.blockStarts);
  const maintenanceTimeLabel = maintenance.maintenance_at
    ? new Date(maintenance.maintenance_at).toLocaleString("th-TH", { timeZone:"Asia/Bangkok", dateStyle:"medium", timeStyle:"short" })
    : "—";
  const maintenanceForceCloseLabel = maintenance.force_close_at
    ? new Date(maintenance.force_close_at).toLocaleString("th-TH", { timeZone:"Asia/Bangkok", dateStyle:"medium", timeStyle:"short" })
    : maintenanceTimeLabel;
  const botStarting = desired === "RUNNING" && state !== "RUNNING";
  const botRunning = state === "RUNNING";
  const startTransition = data?.startTransition || {};
  const startPhase = String(startTransition.phase || (botRunning ? "RUNNING" : botStarting ? "COMMAND_QUEUED" : "IDLE"));
  // A timeout is only an active UI state while the Server is still trying RUNNING.
  // Once the Server has released control back to STOPPED/SAFE_STOP, do not keep an old red banner.
  const startTimedOut = startPhase === "TIMEOUT" && desired === "RUNNING";
  const settingsLocked = botStarting || botRunning || desired === "RUNNING";
  const startPhaseLabel: Record<string,string> = {
    COMMAND_QUEUED: "ส่งคำสั่ง Start แล้ว · รอ EA รับคำสั่ง",
    DELIVERED_TO_EA: "EA ได้รับคำสั่งแล้ว · รอยืนยัน RUNNING",
    WAITING_HEARTBEAT: "EA รับคำสั่งแล้ว · รอ Heartbeat ยืนยัน",
    RUNNING: "EA ยืนยัน RUNNING · ระบบกำลังทำงาน",
    TIMEOUT: "Start Timeout · ยกเลิกคำสั่งค้างแล้ว",
    IDLE: "พร้อมรับคำสั่ง"
  };
  const startConnectionReady = isMt5Online || isAgentOnline;
  const safeStopPositionCount = Math.max(0, Number(metrics.positions || 0));
  const safeStopInProgress =
    safeStopPositionCount > 0 &&
    (desired === "SAFE_STOP" || state === "SAFE_STOP");
  // Let the customer press Start whenever SCENOVA has a live connection, but
  // never race an in-flight Safe Stop drain. The Server also enforces this.
  const startBlocked =
    busy ||
    botStarting ||
    botRunning ||
    safeStopInProgress ||
    maintenanceBlocksStart ||
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
    startTimedOut
      ? "เริ่มบอทไม่สำเร็จ — พร้อมให้ลองใหม่"
      : desired === "RUNNING"
        ? (state === "RUNNING" ? "บอทกำลังทำงาน" : (startPhaseLabel[startPhase] || "กำลังเริ่มบอท"))
        : safeStopInProgress
          ? `กำลังหยุดอย่างปลอดภัย — รอจัดการ ${safeStopPositionCount} Position`
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
  const activeControlModeRaw = String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase();
  const activeControlMode = ["AUTO","RACE","FLIP_LOCK","ZERO_GRID","MANUAL"].includes(activeControlModeRaw)
    ? activeControlModeRaw
    : "AUTO";
  const todayPerformance = data?.tradeJournal?.today || {
    trades:0,wins:0,losses:0,winRate:0,netProfit:0,drawdownMoney:0,drawdownPercent:0
  };
  const modePerformanceToday = Array.isArray(data?.tradeJournal?.modeToday)
    ? data.tradeJournal.modeToday
    : ["AUTO","RACE","FLIP_LOCK","ZERO_GRID","MANUAL"].map(mode=>({
        mode,trades:0,wins:0,losses:0,winRate:0,netProfit:0,drawdownMoney:0,drawdownPercent:0
      }));

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
    marketSessionClosed
      ? "ตลาดปิด — MT5/EA ยังเชื่อมต่อ · รอ Session เปิด"
      : !isMt5Online
        ? (isAgentOnline ? "Agent เชื่อมแล้ว · EA Heartbeat ขาดช่วง — ตรวจ EA โดยไม่สรุปว่า MT5 หลุด" : "รอ MT5 เชื่อมต่อ")
        : metrics.tradeReady === true
          ? "ตลาดเปิด — พร้อมส่งออเดอร์"
          : "มีราคา แต่ยังมีเงื่อนไขที่บล็อกการเทรด";


  const nearlyEqual = (left:any, right:any, tolerance=0.005) =>
    Math.abs(Number(left || 0) - Number(right || 0)) <= tolerance;
  const desiredControlMode = String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase();
  const desiredEngineMode = desiredControlMode === "ZERO_GRID"
    ? "ZERO_GRID"
    : desiredControlMode === "RACE"
      ? "RACE"
      : "AUTO";
  const eaSettingsTelemetryReady =
    isMt5Online &&
    metrics.controlMode !== undefined &&
    metrics.engineMode !== undefined &&
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
    String(metrics.controlMode || "").toUpperCase() === desiredControlMode &&
    String(metrics.engineMode || "").toUpperCase() === desiredEngineMode &&
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

  const marketCycleState = String(metrics.marketCycleState || "TREND_CONTINUATION");
  const marketCycleLabel:Record<string,string> = {
    TREND_CONTINUATION: "เทรนกำลังเดินต่อ",
    PULLBACK: "กำลังย่อในเทรน",
    EXHAUSTION: "แรงเดิมเริ่มหมด",
    REVERSAL_SETUP: "เริ่มมีเงื่อนไขกลับตัว",
    REVERSAL_CONFIRMED: "ยืนยันการกลับตัว",
    BREAKOUT: "กำลัง Breakout",
    RETEST: "กำลัง Retest"
  };
  const lowerTimeframeState = String(metrics.lowerTimeframeState || "NEUTRAL");
  const lowerTimeframeLabel:Record<string,string> = {
    CONFIRMED: "M1/M5 ยืนยันทิศ",
    PULLBACK: "M1/M5 กำลังย่อ",
    REVERSAL: "M1/M5 สวนแรง",
    NEUTRAL: "M1/M5 ยังไม่ชัด"
  };
  const demandZoneScore = Number(metrics.demandZoneScore || 0);
  const supplyZoneScore = Number(metrics.supplyZoneScore || 0);
  const demandZoneQuality = String(metrics.demandZoneQuality || "WEAK");
  const supplyZoneQuality = String(metrics.supplyZoneQuality || "WEAK");
  const zoneQualityLabel:Record<string,string> = {
    STRONG: "แข็งแรงมาก",
    GOOD: "ดี",
    MODERATE: "ปานกลาง",
    SUPPORTING: "ใช้ประกอบ",
    WEAK: "ยังอ่อน"
  };
  const rsiM5 = Number(metrics.rsiM5 || 0);
  const rsiBullDiv = Number(metrics.rsiDivergenceBuyScore || 0);
  const rsiBearDiv = Number(metrics.rsiDivergenceSellScore || 0);
  const adxM5 = Number(metrics.adxM5 || 0);
  const plusDiM5 = Number(metrics.plusDiM5 || 0);
  const minusDiM5 = Number(metrics.minusDiM5 || 0);
  const vwapDistanceAtr = Number(metrics.vwapDistanceAtr || 0);
  const spaceToTargetAtr = Number(metrics.spaceToTargetAtr ?? 99);
  const reversalStatus = String(metrics.reversalStatus || "NONE");
  const newsMode = String(metrics.newsMode || "NORMAL");
  const newsModeLabel:Record<string,string> = {
    NORMAL: "ตลาดปกติ",
    NEWS_WAIT_IMPULSE: "ข่าว · รอ Impulse ชัด",
    NEWS_CONTINUATION: "ข่าว · Continuation",
    NEWS_RETEST: "ข่าว · รอ/เล่น Retest",
    NEWS_EXHAUSTION: "ข่าว · แรงเริ่มหมด"
  };
  const fillTargetPositions = Math.max(1,Number(metrics.basketTargetPositions || configuredMaxPositions));
  const fillPositions = Math.max(0,Number(metrics.basketFilledPositions ?? currentPositions));
  const fillPhase = String(metrics.fillPhase || "STRICT");
  const fillBlockReason = String(metrics.fillBlockReason || "NONE");
  const fillReasonLabel:Record<string,string> = {
    NONE: "พร้อมประเมินไม้ถัดไป",
    COMPLETE: "ครบเป้าหมายแล้ว",
    WAITING_RETEST: "รอ Pullback / Retest",
    EXHAUSTION_WAIT_RETEST: "แรงเดิมเริ่มหมด · รอ Retest",
    WAITING_CONTINUATION: "รอ Continuation กลับมา",
    WAITING_TIMING_TURN: "รอ Turning event",
    WAITING_CONTINUATION_SPACE: "รอระยะเพิ่มไม้",
    LOWER_TF_REVERSAL: "M1/M5 สวนแรง · หยุดเติม",
    LOCAL_TOP_ADD_BLOCK: "หยุดเติม BUY บน Local Top · รอ Pullback/Retest/Breakout Hold",
    LOCAL_BOTTOM_ADD_BLOCK: "หยุดเติม SELL ที่ Local Bottom · รอ Pullback/Retest/Breakdown Hold",
    WAIT_ADD_PRICE_SEPARATION: "รอราคาแยกจากไม้ล่าสุด · ไม่กองหลายไม้ราคาเดียวกัน",
    INDICATOR_CONTEXT_ADD_WAIT: "Indicator V6 หลายหมวดยังอ่อน · ชะลอการเติมไม้",
    EXTREME_SPREAD: "Spread EXTREME",
    WAIT_TERMINAL_DEMAND: "ใกล้ Demand · ไม่ไล่ SELL",
    WAIT_TERMINAL_SUPPLY: "ใกล้ Supply · ไม่ไล่ BUY",
    ORDER_RATE_LIMIT: "รอจังหวะส่งคำสั่งถัดไป"
  };
  const fillPhaseLabel:Record<string,string> = {
    STRICT: "0–3 นาที · เข้ม",
    BALANCED: "3–7 นาที · ผ่อน Timing",
    COMPLETION: "7–10 นาที · เน้นเติมให้ครบ"
  };
  const localExtremeState = String(metrics.localExtremeState || "NONE");
  const localExtremeScore = Number(metrics.localExtremeScore || 0);
  const breakoutHoldConfirmed = Boolean(metrics.breakoutHoldConfirmed);
  const tacticalCountertrendActive = Boolean(metrics.tacticalCountertrendActive);
  const tacticalCountertrendDirection = Number(metrics.tacticalCountertrendDirection || 0);
  const tacticalCountertrendScore = Number(metrics.tacticalCountertrendScore || 0);
  const tacticalCountertrendReason = String(metrics.tacticalCountertrendReason || "NONE");

  const indicatorV6Mode = String(metrics.indicatorV6Mode || "SOFT_WEIGHT");
  const indicatorDecision = String(metrics.indicatorDecision || "OBSERVE");
  const indicatorWhy = String(metrics.indicatorWhy || "DATA_NOT_READY");
  const indicatorLocationScore = Number(metrics.indicatorLocationScore ?? 50);
  const indicatorMomentumScore = Number(metrics.indicatorMomentumScore ?? 50);
  const indicatorStructureScore = Number(metrics.indicatorStructureScore ?? 50);
  const indicatorVolatilityScore = Number(metrics.indicatorVolatilityScore ?? 50);
  const indicatorExecutionScore = Number(metrics.indicatorExecutionScore ?? 50);
  const indicatorCostSpaceScore = Number(metrics.indicatorCostSpaceScore ?? 50);
  const indicatorCompositeScore = Number(metrics.indicatorCompositeScore ?? 50);
  const volumeProfileState = String(metrics.volumeProfileState || "DATA_NOT_READY");
  const volumePoc = Number(metrics.volumePoc || 0);
  const volumeVah = Number(metrics.volumeVah || 0);
  const volumeVal = Number(metrics.volumeVal || 0);
  const swingAnchoredVwap = Number(metrics.swingAnchoredVwap || 0);
  const impulseAnchoredVwap = Number(metrics.impulseAnchoredVwap || 0);
  const multiVwapState = String(metrics.multiVwapState || "NEUTRAL");
  const donchianState = String(metrics.donchianState || "NEUTRAL");
  const squeezeState = String(metrics.squeezeState || "NORMAL");
  const macdState = String(metrics.macdState || "NEUTRAL");
  const stochState = String(metrics.stochState || "NEUTRAL");
  const levelFlipState = String(metrics.levelFlipState || "NONE");
  const premiumDiscountState = String(metrics.premiumDiscountState || "EQUILIBRIUM");
  const indicatorHistorySamples = Number(metrics.indicatorHistorySamples || 0);
  const indicatorHistoryWinProbability = Number(metrics.indicatorHistoryWinProbability || 0);
  const indicatorHistoryEvScore = Number(metrics.indicatorHistoryEvScore ?? 50);
  const indicatorTargetPrice = Number(metrics.indicatorTargetPrice || 0);

  const indicatorWhyLabel:Record<string,string> = {
    DATA_NOT_READY: "กำลังสะสมข้อมูล Indicator",
    NO_DIRECTION: "ยังไม่มีทิศสำหรับประเมิน",
    LOCATION_WEAK: "ตำแหน่งราคาไม่คุ้มพอ",
    EXECUTION_WEAK: "จังหวะ M1/M5 ยังไม่สวย",
    COST_OR_SPACE_WEAK: "Spread/พื้นที่ทำกำไรยังไม่คุ้ม",
    MOMENTUM_WEAK: "Momentum ยังไม่สนับสนุน",
    STRUCTURE_WEAK: "โครงสร้างยังไม่แข็งแรง",
    VOLATILITY_COMPRESSED: "ตลาดกำลังบีบตัว รอ Release",
    MULTI_FACTOR_CONTEXT: "หลายปัจจัยสนับสนุนร่วมกัน"
  };
  const indicatorDecisionLabel:Record<string,string> = {
    IDEAL: "IDEAL · จุดเข้าดีมาก",
    ACCEPTABLE: "ACCEPTABLE · เข้าได้ตามระบบ",
    WAIT_BETTER_CONTEXT: "WAIT · รอบริบทดีกว่า",
    WEAK_CONTEXT: "WEAK · ยังไม่ควรเร่งเข้า",
    OBSERVE: "กำลังประเมิน"
  };

  const latestDecisionReason = String(metrics.lastEntryReason || metrics.adaptiveBlockReason || "NONE");
  const latestCloseReason = String(metrics.lastCloseReason || "NONE");
  const decisionReasonLabel:Record<string,string> = {
    WAITING_SETUP: "รอจุดเข้าที่ชัดเจน",
    WAITING_EXECUTION_TURN: "รอ Buy/Sell เพราะ M1/M5 ยังอยู่ใน Pullback และยังไม่เกิด Turning event",
    WAITING_REVERSAL_CONFIRMATION: "M1/M5 สวน Macro แรง · กำลังรอยืนยันว่าเป็น Reversal จริง",
    WAITING_PULLBACK_RETEST: "ราคา Extended · รอ Pullback / Retest ก่อนเข้า",
    WAITING_BREAKOUT_RETEST: "Breakout ยืดเกินไป · รอ Retest ก่อนเข้า",
    WAITING_BETTER_PRICE: "Entry Precision V3 รอราคาที่คุ้มกว่าชั่วคราว แล้วจะ fallback อัตโนมัติ",
    BUY_WAIT_PULLBACK: "ไม่ไล่ BUY บน Local Top · รอ Pullback หรือ Breakout Hold",
    SELL_WAIT_PULLBACK: "ไม่ไล่ SELL ที่ Local Bottom · รอ Pullback หรือ Breakdown Hold",
    TACTICAL_COUNTERTREND_EXIT: "ปิด Tactical สั้น เพราะ Macro เดิมกลับมายืนยัน",
    WAIT_INDICATOR_CONTEXT: "Indicator V6 พบ Location + Execution อ่อนพร้อมกัน · รอสั้น ๆ แล้วมี bounded fallback",
    INDICATOR_CONTEXT_ADD_WAIT: "Basket Add รอหลายหมวดกลับมาสนับสนุนก่อนเติมไม้",
    WAIT_TERMINAL_DEMAND: "ไม่ Sell ต่อ · ราคาอยู่ใกล้ Demand และแรงขายเริ่มหมด",
    WAIT_TERMINAL_SUPPLY: "ไม่ Buy ต่อ · ราคาอยู่ใกล้ Supply และแรงซื้อเริ่มหมด",
    EXTREME_SPREAD: "ยังไม่เปิดไม้ใหม่ · Spread อยู่ระดับ EXTREME",
    WAIT_FRESH_EXECUTION_EVENT: "รอ EMA reclaim / Price Action / Momentum / Zone reaction ใหม่ก่อนเข้าอีกครั้ง",
    AUTO_V20_WAIT_CONFLICT: "AUTO รอ · คะแนน BUY/SELL ยังใกล้กันเกินไป",
    AUTO_V20_WAIT_QUALITY: "AUTO รอ · คุณภาพ Setup กลางยังไม่ถึงเกณฑ์",
    AUTO_V20_WAIT_RR: "AUTO รอ · TP/SL จริงยังไม่คุ้มความเสี่ยง",
    AUTO_V20_WAIT_ADD: "AUTO รอเพิ่มไม้ · ต้องเดินถูกทางหรือ Pullback กลับไปต่อก่อน",
    AUTO_V20_RISK_LIMIT: "AUTO ไม่เพิ่มไม้ · ความเสี่ยงรวมถึงขอบเขตที่ตั้งไว้"
  };
  const latestDecisionCustomerText = latestDecisionReason === "NONE"
    ? "กำลังประเมินตลาด"
    : decisionReasonLabel[latestDecisionReason]
      || latestDecisionReason
        .replace("REVERSAL_BUY", "เข้า Reversal BUY")
        .replace("REVERSAL_SELL", "เข้า Reversal SELL")
        .replace("BUY · Zone", "เข้า BUY · Demand/Location")
        .replace("SELL · Zone", "เข้า SELL · Supply/Location")
        .replace("EMA Turn", "EMA กลับทิศ");
  const closeReasonLabel:Record<string,string> = {
    SMART_PROFIT_REVERSAL: "ปิด Basket · M5/Structure/EMA/Price Action ยืนยัน True Reversal",
    AUTO_PROFIT_GIVEBACK: "ปิด Basket · กำไรย่อจาก Peak ตามบริบทตลาด",
    BASKET_PROFIT_TARGET: "ปิด Basket · ถึงเป้ากำไรรวม",
    PROFIT_RUN_PERCENT_TRAIL: "ปิด Basket · กำไรย่อจาก Peak หลังถึงเป้า",
    MAX_BASKET_LOSS: "ปิด Basket · ถึงขีดจำกัดขาดทุนรวม",
    DAILY_PROFIT_TARGET: "ปิด Basket · ถึงเป้ากำไรรายวัน",
    DAILY_PROFIT_GIVEBACK: "ปิด Basket · กำไรรายวันย่อตามเปอร์เซ็นต์ที่ตั้ง",
    REMOTE_CLOSE_ALL: "ปิด Basket · ผู้ใช้สั่งปิดทั้งหมด",
    AUTO_V20_STRUCTURE_STOP: "AUTO ปิด · ราคาเสียโครงสร้างที่วางไว้",
    AUTO_V20_CONFIRMED_WRONG: "AUTO ปิด · M5/M1/Momentum ยืนยันว่าเข้าไม่ถูกทาง",
    AUTO_V20_MODERATE_TARGET: "AUTO ปิด · ถึงเป้ากำไรพอประมาณ",
    AUTO_V20_PROFIT_GIVEBACK: "AUTO ปิด · กำไรย่อจาก Peak 25%",
    AUTO_V20_TIME_BANK_PROFIT: "AUTO ปิด · ถือครบช่วงประเมินและแรงเริ่มหมด",
    AUTO_V20_TIME_STOP: "AUTO ปิด · ถือเกินกรอบเวลาโดยยังไม่ฟื้น"
  };
  const latestCloseCustomerText = closeReasonLabel[latestCloseReason]
    || latestCloseReason.replace(/_/g," ");

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



  const customerSetupLabel = (value:any) => {
    const code = String(value || "NONE").toUpperCase();
    const labels: Record<string,string> = {
      NONE: "กำลังประเมินจุดเข้าที่เหมาะสม",
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
      NEWS_CONTINUATION: "ข่าวมี Impulse ชัดและ M5 ยืนยัน Continuation",
      NEWS_RETEST: "แท่งข่าวผ่านแล้วและราคากลับมา Retest",
      REVERSAL_BUY: "Demand + Turning event ยืนยัน Reversal BUY",
      REVERSAL_SELL: "Supply + Turning event ยืนยัน Reversal SELL",
      TACTICAL_COUNTERTREND_BUY: "สวน BUY สั้นหลัง Failed Breakdown/Bottom Rejection",
      TACTICAL_COUNTERTREND_SELL: "สวน SELL สั้นหลัง Failed Breakout/Top Rejection",
      CAUTION_ZONE: "จุดเข้าอยู่ในโซนติดตามพิเศษ"
    };
    return labels[code] || "กำลังประเมินจุดเข้า";
  };
  const rawSetupCode = String(metrics.entryTrigger || metrics.entryModel || "NONE");
  const setupCustomerText = customerSetupLabel(rawSetupCode);
  const entryQualityGrade = String(metrics.entryQuality || "C").toUpperCase();
  const entryQualityCustomerText =
    entryQualityGrade === "A" ? "A · คุณภาพสูง"
      : entryQualityGrade === "B" ? "B · คุณภาพปานกลาง"
      : "C · กำลังสะสมเงื่อนไข";
  const priceLocationCustomerText = antiChaseActive
    ? "ราคานอกโซนประเมิน · ติดตามจังหวะถัดไป"
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
      ? "กำลังประเมิน Order Block"
      : orderBlockQuality >= 75
        ? "พบ Order Block คุณภาพสูง"
        : orderBlockQuality >= 45
          ? "พบ Order Block ที่ใช้งานได้"
          : "พบ Order Block · อยู่ระหว่างยืนยัน";
  const fibScore = Number(metrics.fibSetupScore || 0);
  const fibCustomerText =
    fibScore >= 70 ? "Fibonacci สนับสนุนจุดเข้าอย่างชัดเจน"
      : fibScore >= 40 ? "Fibonacci เริ่มสนับสนุนจุดเข้า"
      : "Fibonacci อยู่ระหว่างประเมิน";
  const emaStackCustomerText =
    emaStack === "BULLISH" ? "เส้นค่าเฉลี่ยเรียงตัวสนับสนุนขาขึ้น"
      : emaStack === "BEARISH" ? "เส้นค่าเฉลี่ยเรียงตัวสนับสนุนขาลง"
      : "โครงสร้างค่าเฉลี่ยอยู่ระหว่างสร้างทิศทาง";
  const emaReclaimCustomerText =
    emaReclaimState === "RECLAIM_EMA21_UP" ? "ราคากลับยืนเหนือแนวเฉลี่ยระยะสั้น"
      : emaReclaimState === "LOSE_EMA21_DOWN" ? "ราคาหลุดแนวเฉลี่ยระยะสั้น"
      : "กำลังติดตามสัญญาณจากเส้นค่าเฉลี่ย";
  const ladderCustomerText = currentPositions > 0
    ? "กำลังจัดจังหวะไม้ถัดไปตามระยะราคา · ไม้ "+currentPositions+"/"+configuredMaxPositions
    : "จะเริ่มเพิ่มไม้หลังจากเปิดไม้แรกแล้ว";
  const protectionCustomerText = Number(metrics.dynamicTakeProfitPrice || 0) > 0
    ? "กำลังใช้ TP "+Number(metrics.dynamicTakeProfitPrice).toFixed(symbolDigits)+" และ SL "+Number(metrics.dynamicStopPrice || 0).toFixed(symbolDigits)
    : "ระบบจะคำนวณ TP และ SL ตามสภาพตลาดเมื่อมีออเดอร์";
  const riskCustomerText = performanceRiskMode === "NORMAL"
    ? "ระดับความเสี่ยงปกติ · ใช้จำนวนไม้ตามที่ลูกค้ากำหนด"
    : "ระบบกำลังปรับระดับความเสี่ยงตามผลการเทรดล่าสุด";
  const marketMidPrice = Number(metrics.marketMid || livePricePoints[livePricePoints.length-1]?.price || 0);
  const marketDemandLow = Number(metrics.demandZoneLow || 0);
  const marketDemandHigh = Number(metrics.demandZoneHigh || 0);
  const marketSupplyLow = Number(metrics.supplyZoneLow || 0);
  const marketSupplyHigh = Number(metrics.supplyZoneHigh || 0);
  const marketSupport = Number(metrics.autoV20NearestSupport || metrics.nearestSupport || 0);
  const marketResistance = Number(metrics.autoV20NearestResistance || metrics.nearestResistance || 0);
  const rawBuySignalScore = Math.max(0, Number(metrics.autoV20BuyScore || 0));
  const rawSellSignalScore = Math.max(0, Number(metrics.autoV20SellScore || 0));
  const signalScoreTotal = rawBuySignalScore + rawSellSignalScore;
  const signalScoreReady = signalScoreTotal > 0;
  const buySignalPercent = signalScoreReady ? Math.round((rawBuySignalScore / signalScoreTotal) * 100) : 50;
  const sellSignalPercent = signalScoreReady ? 100 - buySignalPercent : 50;
  const liquidityState = String(metrics.liquidityState || "NONE");
  const marketRegime = String(metrics.marketRegime || "DATA_NOT_READY");
  const marketRegimeText = marketRegimeLabel[marketRegime] || marketRegime.replace(/_/g," ");
  const sessionProfile = String(metrics.sessionProfile || "—").replace(/_/g," ");
  const rescueStateCustomerText =
    rescueState === "NORMAL" ? "ระบบปรับสมดุลพร้อมใช้งาน"
      : rescueState === "WARNING" ? "กำลังติดตามสถานะ Basket"
      : rescueState === "ACTIVE" ? "กำลังลดความเสี่ยงของ Basket"
      : rescueState === "RECOVERY" ? "กำลังปรับสมดุลผลลัพธ์ Basket"
      : "กำลังจัดการ Basket ให้กลับสู่สถานะปกติ";
  const recoveryCustomerText = rescueActive
    ? "ฟื้นแล้ว $"+rescueRecoveredMoney.toFixed(2)+" · เหลือ $"+rescueRequiredMoney.toFixed(2)
    : "ระบบบริหาร Basket พร้อมใช้งาน";
  const reversalCustomerText = rescueActive
    ? (Boolean(metrics.rescueReversalConfirmed)
        ? "ยืนยันแรงกลับตัวแล้ว"
        : "กำลังติดตามแรงกลับตัว")
    : "ระบบติดตามการกลับตัวพร้อมใช้งาน";

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

  async function checkSoftwareVersions() {
    if (checkingVersion) return;
    setCheckingVersion(true);
    setError("");
    setNotice("");
    try {
      await load(selectedSlotIdRef.current);
      setNotice("ตรวจสอบเวอร์ชันล่าสุดแล้ว");
    } finally {
      setCheckingVersion(false);
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

  function submitInstallerDownload(code: string, version: string) {
    if (typeof document === "undefined") {
      throw new Error("เบราว์เซอร์ยังไม่พร้อมดาวน์โหลด SCENOVA Installer");
    }
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/installer-download";
    form.style.display = "none";
    const addField = (name: string, value: string) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    };
    addField("code", code);
    addField("version", version);
    document.body.appendChild(form);
    form.submit();
    window.setTimeout(() => form.remove(), 1000);
  }

  async function downloadInstallerForSlot(slotId: string) {
    const result = await api("/bot/installers/windows", {
      method: "POST",
      body: JSON.stringify({ slotId: slotId || undefined })
    });
    const code = String(result?.code || "").trim();
    const version = String(result?.installerVersion || "").trim();
    if (!code || !version) {
      throw new Error("ยังไม่มี SCENOVA Windows Installer สำหรับบัญชีนี้");
    }
    submitInstallerDownload(code, version);
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
        ? "ผูก MT5 " + accountText + " เป็นบัญชีที่ใช้งานใช่หรือไม่?"
        : "เปลี่ยนมาใช้ MT5 " + accountText + " ใช่หรือไม่?"
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
          ? "ผูกบัญชี MT5 แรกเรียบร้อยแล้ว"
          : "เปลี่ยนบัญชี MT5 เรียบร้อยแล้ว ไม่ต้องเปลี่ยน .set หรือ Install Token"
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
      "InpHeartbeatSeconds=5",
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
      "InpMaxAtrPoints=" + settings.maxAtrPoints,
      "InpIndicatorV6Mode=" + (String(settings.indicatorV6Mode||"SOFT_WEIGHT").toUpperCase()==="SHADOW" ? 0 : String(settings.indicatorV6Mode||"SOFT_WEIGHT").toUpperCase()==="TIMING" ? 2 : String(settings.indicatorV6Mode||"SOFT_WEIGHT").toUpperCase()==="ADAPTIVE" ? 3 : 1),
      "InpVolumeProfileBars=144",
      "InpDonchianPeriod=20",
      "InpIndicatorMaxWaitSeconds=20"
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
    if (path.startsWith("/bot/start") && settingsDirtyRef.current) {
      setError("มีการตั้งค่าที่ยังไม่ได้บันทึก กรุณากดบันทึกก่อนเริ่มบอท");
      setBotSettingsOpen(true);
      return;
    }
    setBusy(true);
    setError("");
    const commandPendingNotice = path.startsWith("/bot/start")
      ? "กำลังส่งคำสั่งเริ่มบอท..."
      : path.startsWith("/bot/stop")
        ? "กำลังส่งคำสั่ง Safe Stop..."
        : "";
    setNotice(commandPendingNotice);
    try {
      const suffix = selectedSlotIdRef.current
        ? (path.includes("?") ? "&" : "?") + "slotId=" + encodeURIComponent(selectedSlotIdRef.current)
        : "";
      await api(path + suffix, { method: "POST" });
      setNotice(success);
      await load();
      if (path.startsWith("/bot/start")) {
        // Pull the START transition sooner than the normal 10s dashboard poll.
        window.setTimeout(() => void load(selectedSlotIdRef.current, true), 2500);
        window.setTimeout(() => void load(selectedSlotIdRef.current, true), 6500);
      }
    } catch (e: any) {
      const message = String(e?.message || "เกิดข้อผิดพลาด");
      setError(path.startsWith("/bot/start") ? "เริ่มบอทไม่ได้: " + message : message);
    } finally {
      setBusy(false);
    }
  }

  function editSetting(key: string, value: any) {
    if (settingsLocked) {
      setError("การตั้งค่าถูกล็อกขณะบอทกำลังเริ่มหรือกำลังทำงาน · หยุดบอทก่อนแก้ไข");
      return;
    }
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
    if (settingsLocked) {
      setError("การตั้งค่าถูกล็อกขณะบอทกำลังเริ่มหรือกำลังทำงาน · หยุดบอทก่อนบันทึก");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const numericKeys = [
        "lot",
        "maxPositions",
        "autoLot",
        "autoMaxPositions",
        "raceLot",
        "raceMaxPositions",
        "flipLockLot",
        "manualLot",
        "manualMaxPositions",
        "standardMaxBasketLossMoney",
        "standardDailyLossMoney",
        "standardDailyProfitTargetMoney",
        "manualMaxBasketLossMoney",
        "manualDailyLossMoney",
        "manualDailyProfitTargetMoney",
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
        "maxAtrPoints",
        "zeroGridStepPrice",
        "zeroGridLevelsPerSide",
        "zeroGridBaseLot",
        "zeroGridMinNetProfitMoney",
        "zeroGridCloseReserveMoney"
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
        "autoMaxPositions",
        "raceMaxPositions",
        "manualMaxPositions",
        "minOrderIntervalMs",
        "maxOrdersPerMinute",
        "zeroGridLevelsPerSide"
      ]);

      const payload:any = { ...settings };
      delete payload.tradingProfile;
      payload.adaptiveEngine = true;

      // Keep controlMode/engineMode atomic. ZERO GRID is a pending-order engine,
      // never an AUTO entry mode.
      const requestedControlMode = String(payload.controlMode || payload.engineMode || "AUTO").toUpperCase();
      if (requestedControlMode === "ZERO_GRID") {
        payload.controlMode = "ZERO_GRID";
        payload.engineMode = "ZERO_GRID";
      } else if (requestedControlMode === "RACE") {
        payload.controlMode = "RACE";
        payload.engineMode = "RACE";
      } else {
        payload.controlMode = ["AUTO","FLIP_LOCK","MANUAL"].includes(requestedControlMode) ? requestedControlMode : "AUTO";
        payload.engineMode = "AUTO";
      }

      const sizingProfiles:Record<string,{lot:string;max?:string}> = {
        AUTO:{lot:"autoLot",max:"autoMaxPositions"},
        RACE:{lot:"raceLot",max:"raceMaxPositions"},
        FLIP_LOCK:{lot:"flipLockLot"},
        MANUAL:{lot:"manualLot",max:"manualMaxPositions"}
      };
      const activeSizingProfile = sizingProfiles[payload.controlMode];
      if (activeSizingProfile) {
        payload.lot = payload[activeSizingProfile.lot];
        payload.maxPositions = payload.controlMode === "FLIP_LOCK" ? 1 : payload[activeSizingProfile.max || "maxPositions"];
      }
      if (payload.controlMode === "MANUAL") {
        payload.maxBasketLossMoney = payload.manualMaxBasketLossMoney;
        payload.dailyLossMoney = payload.manualDailyLossMoney;
        payload.dailyProfitTargetMoney = payload.manualDailyProfitTargetMoney;
      } else if (payload.controlMode !== "ZERO_GRID") {
        payload.maxBasketLossMoney = payload.standardMaxBasketLossMoney;
        payload.dailyLossMoney = payload.standardDailyLossMoney;
        payload.dailyProfitTargetMoney = payload.standardDailyProfitTargetMoney;
      }

      const raceSpeedX2 = payload.engineMode === "RACE";
      payload.minOrderIntervalMs = raceSpeedX2 ? 150 : 300;
      payload.maxOrdersPerMinute = raceSpeedX2 ? 240 : 120;
      payload.riskPerOrderPercent = 0.25;
      payload.allowMinimumLotOverride = true;
      payload.hardStopAtrMultiplier = 2;
      // The simplified control modes do not expose a hidden entry gate.
      // Confidence is still calculated by the EA, but it cannot silently block orders.
      payload.confidenceGateEnabled = false;
      payload.confidenceThreshold = 55;
      payload.sessionStartHour = 0;
      payload.sessionEndHour = 24;
      payload.maxAtrPoints = 0;
      payload.profitTargetMode = ["AUTO","MANUAL","OFF"].includes(
        String(settings.profitTargetMode || "AUTO").toUpperCase()
      ) ? String(settings.profitTargetMode || "AUTO").toUpperCase() : "AUTO";
      // Daily target in the compact settings means "stop at target" exactly.
      // Remove the retired hidden giveback behavior from saved configurations.
      payload.dailyProfitContinueAfterTarget = false;

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
    if (requested === "access") {
      setActiveView("account");
      setError("");
      setNotice("");
      window.history.pushState({}, "", "/dashboard?view=account");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return true;
    }
    if (requested === "overview" || requested === "account" || requested === "backtest" || requested === "settings") {
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
    activeView === "backtest" ? "trading-backtest" :
    "trading-overview";

  const navItems: Array<{id:View;label:string;hint:string}> = [
    { id:"overview", label:"บอท", hint:"สถานะ ควบคุม และตั้งค่า" },
    { id:"account", label:"บัญชี MT5", hint:"MT5, Device, สมาชิก และ Trial" },
    { id:"backtest", label:"Backtest", hint:"ผลย้อนหลัง ดาวน์โหลด และแชร์ตัวอย่าง" }
  ];

  return (
    <div className={"app-wrap "+(activeView === "overview" ? "cc-shell-v4" : "")}>
      {isOwner ? (
        <OwnerSidebar activeKey={ownerActiveKey} onLogout={logout} onNavigate={handleOwnerNavigate}/>
      ) : (
        <aside className="sidebar app-sidebar">
          <div className="brand-lockup side-brand scenova-brand-lockup">
            <ScenovaBrand className="scenova-brand-logo-sidebar"/>
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
            {data.partner && (
              <a className="side-link side-link-rich partner-dashboard-link" href="/partner">
                <span>Partner Dashboard</span>
                <small>{data.partner.usedSeats || 0}/{data.partner.seat_limit || 0} Seats · {data.partner.status}</small>
              </a>
            )}
          </nav>
          <div className="sidebar-user">
            <div><small>User ID</small><b>{data.user?.user_code}</b></div>
            <button className="btn ghost full" onClick={logout}>ออกจากระบบ</button>
          </div>
        </aside>
      )}

      <main className="main app-main">
        <div className="mobile-only mobile-app-head">
          <div className="brand-lockup scenova-brand-lockup"><ScenovaBrand className="scenova-brand-logo-mobile"/></div>
          <button className="btn ghost" onClick={logout}>ออก</button>
        </div>

        {isOwner ? (
          <OwnerMobileNav activeKey={ownerActiveKey} onNavigate={handleOwnerNavigate}/>
        ) : (
          <div className="mobile-only mobile-nav">
            {navItems.map(item=>(
              <button key={item.id} className={activeView===item.id ? "active" : ""} onClick={()=>setActiveView(item.id)}>{item.label}</button>
            ))}
            {data.partner && <a href="/partner">Partner</a>}
          </div>
        )}

        <header className={"page-head human-head cc-page-head cc-v3-head " + (activeView === "overview" ? "cc-page-head-overview cc-v4-page-head" : "")}>
          <div className="cc-v3-title">
            <span className="cc-v3-title-icon"><ScenovaIcon name={activeView === "overview" ? "control" : activeView === "account" ? "account" : "strategy"} size={24}/></span>
            <div>
              <h1>{activeView === "overview" ? "Control Center" : activeView === "account" ? "บัญชีและการเชื่อมต่อ MT5" : "Backtest & Performance"}</h1>
              <p>{activeView === "overview" ? "ควบคุมบอทเทรดอัตโนมัติ พร้อมติดตามสัญญาณและสถานะแบบเรียลไทม์" : activeView === "account" ? "ติดตั้ง อัปเดต ตรวจ MT5 / EA และจัดการสมาชิกหรือ Trial ที่จำเป็น" : "ดูผลทดสอบย้อนหลัง ดาวน์โหลดรายงาน และสร้างหน้าพอร์ตตัวอย่างแบบอ่านอย่างเดียว"}</p>
            </div>
          </div>
          <div className="cc-v3-head-actions">
            <span className={"cc-head-chip " + (isMt5Online ? "good" : isAgentOnline ? "warn" : "bad")}><i/><span><b>{isMt5Online ? "เชื่อมต่อแล้ว" : isAgentOnline ? "Agent เชื่อมแล้ว" : "ยังไม่เชื่อมต่อ"}</b><small>{isMt5Online ? (data.account?.broker || "MT5")+" · EA Online" : isAgentOnline ? "Windows Agent Online · รอ EA" : (data.account?.broker || "MT5")+" · "+(data.selectedSlot?.mode || "LOCAL")}</small></span></span>
            <span className={"cc-head-chip bot " + (desired==="RUNNING" ? "active" : "")}><ScenovaIcon name="bot" size={18}/><span><b>{controlStateLabel}</b><small>{settings.entryMode || "AUTO MOMENTUM"}</small></span></span>
            <span className="cc-head-icon-button" aria-label="การแจ้งเตือน"><ScenovaIcon name="bell" size={18}/></span>
          </div>
        </header>


        {maintenance.status !== "OFF" && (
          <div className={"system-maintenance-banner status-" + String(maintenance.status).toLowerCase()} role="alert">
            <div className="system-maintenance-icon">!</div>
            <div className="system-maintenance-copy">
              <b>{maintenance.title || (maintenance.status === "SCHEDULED" ? "ประกาศปิดปรับปรุงระบบ" : "ระบบกำลังปิดเพื่ออัปเดต")}</b>
              <span>{maintenance.message || "กรุณาปิด Position ที่ยังค้างก่อนเวลาที่กำหนด"}</span>
              <small>Maintenance: {maintenanceTimeLabel} · Close All deadline: {maintenanceForceCloseLabel}{maintenance.expected_resume_at ? " · คาดว่าเปิด: " + new Date(maintenance.expected_resume_at).toLocaleString("th-TH", { timeZone:"Asia/Bangkok", dateStyle:"medium", timeStyle:"short" }) : ""}</small>
            </div>
            <div className="system-maintenance-side">
              <strong>{maintenance.status}</strong>
              <small>{maintenanceBlocksStart ? "ปิด Start ใหม่แล้ว" : "โปรดเตรียมปิด Position"}</small>
            </div>
          </div>
        )}


        {activeView === "overview" && (
          !data.account ? (
            <EmptySetup onNext={()=>setActiveView("account")} />
          ) : (
            <div className="cc-overview cc-v3 cc-v4 cc-v12 cc-v15 cc-v47">
              <div className="cc-v4-ambient" aria-hidden="true"><i/><i/><i/></div>
              <dialog
                ref={statusDialogRef}
                id="cc-system-status"
                className="cc-status-dialog"
                aria-labelledby="cc-system-status-title"
                onClick={event => {
                  if (event.target !== event.currentTarget) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
                    event.currentTarget.close();
                  }
                }}
              >
                <header className="cc-status-dialog-head">
                  <div><ScenovaIcon name="bell" size={18}/><h3 id="cc-system-status-title">สถานะระบบ</h3></div>
                  <button type="button" autoFocus className="cc-status-dismiss" aria-label="ปิดสถานะระบบ" onClick={()=>statusDialogRef.current?.close()}><ScenovaIcon name="close" size={18}/></button>
                </header>
                <div className="cc-status-center" aria-label="การเชื่อมต่อและเวอร์ชันระบบ">
              {marketSessionClosed ? (
                <div className="cc-connect-alert cc-status-connection" role="status">
                  <div className="cc-alert-icon"><ScenovaIcon name="timer" size={20}/></div>
                  <div className="cc-alert-copy"><b>ตลาดปิดชั่วคราว</b><span>MT5 และ EA ยังเชื่อมต่ออยู่ · ระบบจะรอ Session เปิดโดยอัตโนมัติ</span></div>
                  <button type="button" className="btn cc-alert-action" disabled>รอเปิดตลาด</button>
                </div>
              ) : !isMt5Online && (
                <div className="cc-connect-alert cc-status-connection" role="status">
                  <div className="cc-alert-icon"><ScenovaIcon name="info" size={20}/></div>
                  <div className="cc-alert-copy">
                    <b>{isAgentOnline ? "EA Heartbeat ขาดช่วง" : "ยังไม่ได้เชื่อมต่อ MT5"}</b>
                    <span>{isAgentOnline ? "Windows Agent ยังเชื่อมอยู่ · ตรวจว่า EA ยังติดอยู่บนกราฟก่อนเชื่อม MT5 ใหม่" : data.account.mode === "LOCAL" ? "เปิด MetaTrader 5 เพื่อเชื่อมต่อ" : "กำลังรอการเชื่อมต่อ"}</span>
                  </div>
                  <button type="button" className="btn cc-alert-action" onClick={()=>{statusDialogRef.current?.close();setActiveView("account");}}>{isAgentOnline ? "ตรวจการเชื่อมต่อ →" : "ไปหน้าการเชื่อมต่อ →"}</button>
                </div>
              )}
                {!marketSessionClosed && isMt5Online && (
                  <div className="cc-status-connected"><ScenovaIcon name="status" size={18}/><span>MT5 และ EA เชื่อมต่อแล้ว</span></div>
                )}
                <section className="cc-status-software" aria-label="เวอร์ชันระบบ">
                  <div className="cc-status-software-head">
                    <span className="cc-status-software-icon"><ScenovaIcon name="layers" size={19}/></span>
                    <div><b>เวอร์ชันระบบ</b><small>EA &amp; Windows Agent</small></div>
                    <button type="button" className="cc-status-version-check" disabled={checkingVersion || busy} onClick={()=>{statusDialogRef.current?.close();void checkSoftwareVersions();}}>
                      <ScenovaIcon name="refresh" size={14}/>{checkingVersion ? "กำลังตรวจ..." : "ตรวจสอบเวอร์ชัน"}
                    </button>
                  </div>
                  <div className="cc-v6-version-row">
                    <span className={"cc-v6-version-chip "+(softwareUpdate.eaVersionMatch && softwareUpdate.eaHashMatch !== false && softwareUpdate.runtimeContractMatch !== false ? "ok" : "warn")} title={softwareUpdate.eaUpdateRequired ? "EA มี Build ใหม่หรือ Runtime ใหม่พร้อมอัปเดต" : "EA Runtime ปัจจุบัน → เวอร์ชันล่าสุดบน Server"}>
                      EA {softwareUpdate.currentEaVersion ? "v"+softwareUpdate.currentEaVersion : "—"}<em>→</em>{softwareUpdate.latestEaVersion ? "v"+softwareUpdate.latestEaVersion : "—"}{softwareUpdate.eaVersionMatch && softwareUpdate.eaHashMatch === false ? " · Build ใหม่พร้อมอัปเดต" : softwareUpdate.eaVersionMatch && softwareUpdate.runtimeContractMatch === false ? " · Runtime ใหม่พร้อมอัปเดต" : ""}
                    </span>
                    {data.selectedSlot?.mode === "LOCAL" && (
                      <span className={"cc-v6-version-chip "+(!softwareUpdate.installerRequired ? "ok" : "warn")} title="Windows Agent ปัจจุบัน → เวอร์ชันล่าสุดบน Server">
                        Agent {softwareUpdate.currentVersion ? "v"+softwareUpdate.currentVersion : "—"}<em>→</em>{softwareUpdate.latestVersion ? "v"+softwareUpdate.latestVersion : "—"}
                      </span>
                    )}
                  </div>
                  {softwareUpdate.runtimeContractMatch === false && (
                    <div className="cc-runtime-contract-warning" role="status">
                      EA ใน MT5 ยังไม่ได้โหลด Runtime ล่าสุด
                    </div>
                  )}
                  <div id="scenova-status-update-mount" className="cc-status-update-slot"/>
                </section>
                </div>
              </dialog>

              <section className="cc-v6-telemetry" aria-label="ข้อมูลสดจาก EA">
                <div className="cc-v6-telemetry-live"><i/>{marketSessionClosed ? "MARKET CLOSED" : "REALTIME"}</div>
                <LiveTelemetryItem icon="timer" label="ATR (M15)" value={atrValueLabel} tone={atrPoints>0?"good":"neutral"}/>
                <LiveTelemetryItem icon="spread" label="Spread" value={spreadValueLabel} tone={spreadStatus==="NORMAL"?"good":spreadStatus==="EXTREME"?"bad":"warn"}/>
                <LiveTelemetryItem icon="spark" label="Momentum" value={Number(metrics.momentumPoints||0).toFixed(1)+" pt"}/>
                <LiveTelemetryItem icon="clock" label="Latency" value={heartbeatLatencyMs>0?heartbeatLatencyMs.toFixed(0)+" ms":"—"} tone={heartbeatLatencyMs>2000?"bad":heartbeatLatencyMs>700?"warn":"good"}/>
                <LiveTelemetryItem icon="status" label="Heartbeat" value={heartbeatAgeSeconds.toFixed(0)+"s · HTTP "+(heartbeatHttpStatus||"—")} tone={heartbeatAgeSeconds<=20&&heartbeatHttpStatus>=200&&heartbeatHttpStatus<300?"good":"warn"}/>
                <LiveTelemetryItem icon="shield" label="Execution" value={Number(metrics.executionQuality||0)>0?Number(metrics.executionQuality).toFixed(0)+"%":"—"} tone={Number(metrics.executionQuality||0)>=80?"good":"neutral"}/>
              </section>

              <section className={"panel cc-v6-hero cc-v47-command-bar "+(state === "RUNNING" ? "is-running" : "is-idle")}>
                <div className="cc-v47-brand-lockup">
                  <ScenovaBrand className="cc-v47-brand-logo"/>
                  <span>LIVE EXECUTION</span>
                </div>

                <div className="cc-v6-hero-main">
                  <div className="cc-v6-gold-stage"><ScenovaIcon name="gold" size={52}/><i/><i/></div>
                  <div className="cc-v6-symbol-copy">
                    <span className="cc-v4-eyebrow">SCENOVA · LIVE EXECUTION</span>
                    <h2>{metrics.symbol || settings.symbol}</h2>
                    <p>{String(metrics.symbol || settings.symbol).startsWith("XAU") ? "Gold Spot / US Dollar" : "Live Trading Symbol"}<em/>MT5 Expert Advisor</p>
                    <div className="cc-v6-symbol-chips">
                      <span>{String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "ZERO_GRID" ? "ZERO GRID" : String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "RACE" ? "RACE" : String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "FLIP_LOCK" ? "FLIP LOCK" : String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "MANUAL" ? "MANUAL" : settings.entryMode === "AUTO_MOMENTUM" ? "AUTO · VECTOR" : settings.entryMode}</span>
                      <span>{Number(settings.lot||0).toFixed(2)} Lot</span>
                      <span>{String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "ZERO_GRID" ? Math.max(1,Math.min(30,Number(settings.zeroGridLevelsPerSide)||10))+" BUY STOP + "+Math.max(1,Math.min(30,Number(settings.zeroGridLevelsPerSide)||10))+" SELL STOP" : configuredMaxPositions+" ไม้"}</span>
                      <HeroTrendChip label="M5" value={metrics.trendM5}/>
                      <HeroTrendChip label="M15" value={metrics.trendM15}/>
                      <HeroTrendChip label="M30" value={metrics.trendM30}/>
                      <HeroTrendChip label="H1" value={metrics.trendH1}/>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className={"cc-v47-live-state cc-status-trigger "+(!isMt5Online || marketSessionClosed ? "waiting" : state === "RUNNING" ? "running" : "idle")}
                  aria-haspopup="dialog"
                  aria-controls="cc-system-status"
                  aria-label={"เปิดสถานะระบบ"+(statusNoticeCount ? " · "+statusNoticeCount+" รายการแจ้งเตือน" : "")}
                  onClick={()=>statusDialogRef.current?.showModal()}
                >
                  <i/>
                  <span className="cc-status-trigger-copy">
                    <b>{!isMt5Online ? "Waiting for MT5" : marketSessionClosed ? "Waiting Session" : state === "RUNNING" ? "Live Execution" : "Ready"}</b>
                    <small>สถานะและอัปเดต</small>
                  </span>
                  <span className="cc-status-trigger-bell"><ScenovaIcon name="bell" size={16}/>{statusNoticeCount > 0 && <em>{statusNoticeCount}</em>}</span>
                </button>

                <div className="cc-v13-hero-actions" aria-label="ควบคุมบอท">
                  <div className="cc-v12-quick-actions cc-v19-hero-quick-actions">
                    <button className="start" disabled={startBlocked} onClick={()=>command("/bot/start","ส่งคำสั่ง Start แล้ว บอทกำลังเริ่มทำงาน")}><ScenovaIcon name="play" size={15}/><span><b>เริ่มบอท</b><small>Start</small></span></button>
                    <button className="stop" disabled={stopBlocked} onClick={()=>command("/bot/stop","Safe Stop แล้ว · ไม่เปิดรอบใหม่ และรอรอบปัจจุบันปิดตามเงื่อนไขปกติ")}><ScenovaIcon name="stop" size={15}/><span><b>หยุดปลอดภัย</b><small>Safe Stop</small></span></button>
                    <button className="close" disabled={busy||currentPositions===0} onClick={async()=>{const ok=await confirmPopup({tone:"warning",title:"ปิดออเดอร์ทั้งหมด",message:"ยืนยันปิดออเดอร์ที่กำลังเปิดทั้งหมดทันที?",confirmLabel:"ปิดทุกไม้",cancelLabel:"ยกเลิก"});if(ok)await command("/bot/close-all","ส่งคำสั่งปิดออเดอร์ทั้งหมดแล้ว")}}><ScenovaIcon name="close" size={15}/><span><b>ปิดทุกไม้</b><small>Close All</small></span></button>
                    <button className="terminal" onClick={()=>setLogsOpen(true)}><ScenovaIcon name="terminal" size={15}/><span><b>Terminal</b><small>Live Logs</small></span></button>
                  </div>
                </div>
              </section>

              <section className="cc-kpi-grid cc-v3-kpis cc-v6-kpis cc-v12-kpis cc-v13-kpis">
                <DashboardMetric icon="wallet" label="ยอดเงิน" value={isMt5Online?"$"+Number(metrics.balance||0).toFixed(2):"—"} sub="Balance" />
                <DashboardMetric icon="equity" label="มูลค่ารวม" value={isMt5Online?"$"+Number(metrics.equity||0).toFixed(2):"—"} sub="Equity" />
                <DashboardMetric icon="pnl" label="กำไร / ขาดทุนวันนี้" value={isMt5Online?(Number(metrics.dailyProfit||0)>=0?"+$":"-$")+Math.abs(Number(metrics.dailyProfit||0)).toFixed(2):"—"} sub="Daily P/L" tone={isMt5Online?(Number(metrics.dailyProfit||0)>=0?"good":"bad"):"neutral"} />
                <DashboardMetric icon="target" label="Win Rate วันนี้" value={Number(todayPerformance.trades||0)>0?Number(todayPerformance.winRate||0).toFixed(1)+"%":"—"} sub={Number(todayPerformance.trades||0)>0?Number(todayPerformance.wins||0)+" / "+Number(todayPerformance.trades||0)+" Basket":"ยังไม่มี Basket ปิดวันนี้"} tone={Number(todayPerformance.trades||0)>0?(Number(todayPerformance.winRate||0)>=60?"good":Number(todayPerformance.winRate||0)>=45?"warn":"bad"):"neutral"} />
                <DashboardMetric icon="risk" label="Drawdown วันนี้" value={Number(todayPerformance.trades||0)>0?Number(todayPerformance.drawdownPercent||0).toFixed(2)+"%":"0.00%"} sub={"-$"+Number(todayPerformance.drawdownMoney||0).toFixed(2)+" Realized DD"} tone={Number(todayPerformance.drawdownPercent||0)>=5?"bad":Number(todayPerformance.drawdownPercent||0)>=2?"warn":"good"} />
                <DashboardMetric icon="orders" label="ออเดอร์เปิด" value={isMt5Online?currentPositions+" / "+configuredMaxPositions:"—"} sub="Open Positions" />
              </section>

              <div className="cc-v19-three-card-grid">
                <section className="cc-v17-settings-column cc-v19-settings-card" aria-label="ตั้งค่าบอท">
                  <BotSettingsModal
                    embedded
                    open
                    locked={settingsLocked}
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
                    onSave={async(e:any)=>{ await saveSettings(e); }}
                  />
                </section>

                <section className="panel cc-v17-running-positions" aria-label="ออเดอร์ที่บอทกำลังรัน">
                  <div className="cc-v17-running-head">
                    <div><span><ScenovaIcon name="orders" size={18}/></span><div><small>LIVE EXECUTION</small><b>ออเดอร์ที่กำลังรัน</b></div></div>
                    <em className={currentPositions>0?"live":"idle"}>{currentPositions>0?currentPositions+" Running":"No Position"}</em>
                  </div>
                  <div className="cc-v17-running-table">
                    <div className="head"><span>เวลา</span><span>Symbol</span><span>Type</span><span>Lot</span><span>ราคาเปิด</span><span>P&L</span></div>
                    <div className="body">
                      {openPositions.length ? [...openPositions].reverse().map((position:any,index:number)=>{
                        const openedAt=Number(position.openedAt||0);
                        const openedLabel=openedAt>0
                          ? new Date(openedAt*1000).toLocaleTimeString("th-TH",{timeZone:"Asia/Bangkok",hour:"2-digit",minute:"2-digit",hour12:false})
                          : "—";
                        const side=String(position.side||"").toUpperCase()==="SELL"?"SELL":"BUY";
                        const pnl=Number(position.profit||0);
                        return <div className="row" key={String(position.ticket||openedAt||index)}>
                          <span>{openedLabel}</span>
                          <span className="symbol">{String(metrics.symbol||settings.symbol||"—")}</span>
                          <span><i className={"side "+side.toLowerCase()}>{side}</i></span>
                          <span>{Number(position.volume||0).toFixed(2)}</span>
                          <span>{Number(position.openPrice||0).toFixed(Math.max(2,Math.min(5,Number(metrics.symbolDigits||3))))}</span>
                          <span className={pnl>0?"pnl good":pnl<0?"pnl bad":"pnl"}>{pnl>0?"+$":"$"}{pnl.toFixed(2)}</span>
                        </div>;
                      }) : <div className="empty"><ScenovaIcon name="orders" size={20}/><span>ยังไม่มีออเดอร์ที่กำลังถือ</span></div>}
                    </div>
                  </div>
                </section>



                <section className="panel cc-v12-mode-performance">
                  <div className="cc-v12-card-head">
                    <div><span><ScenovaIcon name="pnl" size={17}/></span><div><small>PERFORMANCE BY MODE</small><b>สถิติรายโหมดวันนี้</b></div></div>
                    <em>Today</em>
                  </div>
                  <div className="cc-v12-mode-table">
                    <div className="head"><span>โหมด</span><span>Win Rate</span><span>Drawdown</span><span>Trades</span></div>
                    {modePerformanceToday.map((row:any)=>{
                      const mode=String(row.mode||"AUTO");
                      const active=mode===activeControlMode;
                      const win=Number(row.winRate||0);
                      const dd=Number(row.drawdownPercent||0);
                      return <div key={mode} className={"row "+(active?"active":"")}>
                        <span className="mode"><i/>{mode}</span>
                        <span className={Number(row.trades||0)>0?(win>=60?"good":win>=45?"warn":"bad"):"neutral"}>{Number(row.trades||0)>0?win.toFixed(1)+"%":"—"}</span>
                        <span className={dd>=5?"bad":dd>=2?"warn":"good"}>{dd.toFixed(2)+"%"}<small>{"-$"+Number(row.drawdownMoney||0).toFixed(2)}</small></span>
                        <span>{Number(row.trades||0)}<small>{active?(botRunning?"Active":"Selected"):"Idle"}</small></span>
                      </div>;
                    })}
                  </div>

                  <div className="cc-v46-performance-system">
                    <div className="cc-v46-performance-system-head">
                      <div>
                        <span><ScenovaIcon name="status" size={16}/></span>
                        <div><b>Platform / MT5 / EA Status</b><small>สถานะการเชื่อมต่อระบบ</small></div>
                      </div>
                      <em className={isMt5Online&&isAgentOnline?"good":"warn"}>{isMt5Online&&isAgentOnline?"All Online":"Check"}</em>
                    </div>
                    <div className="cc-v46-performance-system-grid">
                      <div>
                        <span><i className="good"/>SCENOVA</span>
                        <b>Online</b>
                        <small>Web Dashboard</small>
                      </div>
                      <div>
                        <span><i className={isAgentOnline?"good":"warn"}/>Agent</span>
                        <b>{isAgentOnline?"Connected":"Waiting"}</b>
                        <small>{heartbeatLatencyMs>0?heartbeatLatencyMs.toFixed(0)+" ms":"—"}</small>
                      </div>
                      <div>
                        <span><i className={isMt5Online?"good":"warn"}/>MT5 / EA</span>
                        <b>{isMt5Online?"Connected":"Waiting"}</b>
                        <small>{heartbeatAgeSeconds.toFixed(0)}s heartbeat</small>
                      </div>
                    </div>
                  </div>
                </section>


              </div>


              <section className="cc-v48-bottom-intelligence" aria-label="SCENOVA market intelligence">
                <section className="panel cc-v48-market-panel">
                  <div className="cc-v48-panel-head">
                    <div className="cc-v48-title">
                      <span><ScenovaIcon name="brain" size={19}/></span>
                      <div><b>SCENOVA MARKET INTELLIGENCE</b><small>Real-time market data, key levels and AI trading context</small></div>
                    </div>
                    <em className={marketSessionClosed?"warn":isMt5Online?"live":"idle"}><i/>{marketSessionClosed?"Market Closed":isMt5Online?"Live":"Waiting MT5"}</em>
                  </div>

                  <div className="cc-v48-market-strip">
                    <div className="cc-v48-symbol"><ScenovaIcon name="trend" size={17}/><span><b>{String(metrics.symbol||settings.symbol||"—")}</b><small>{String(metrics.symbol||settings.symbol||"").startsWith("XAU")?"Gold Spot / US Dollar":"Live Trading Symbol"}</small></span></div>
                    <div className="cc-v48-timeframes" aria-label="แนวโน้มหลายกรอบเวลา">
                      {[{label:"M1",value:metrics.trendM1},{label:"M5",value:metrics.trendM5},{label:"M15",value:metrics.trendM15},{label:"M30",value:metrics.trendM30},{label:"H1",value:metrics.trendH1}].map(item=>{
                        const direction=Number(item.value)>0?"up":Number(item.value)<0?"down":"flat";
                        return <span key={item.label} className={direction}>{item.label}<i>{direction==="up"?"↑":direction==="down"?"↓":"·"}</i></span>;
                      })}
                    </div>
                    <div className="cc-v48-price"><small>ราคากลาง</small><b>{marketMidPrice>0?marketMidPrice.toFixed(symbolDigits):"—"}</b><em>{Number(metrics.momentumPoints||0)>0?"+":""}{Number(metrics.momentumPoints||0).toFixed(1)} pt</em></div>
                  </div>

                  <MarketIntelligenceChart
                    points={livePricePoints}
                    currentPrice={marketMidPrice}
                    digits={symbolDigits}
                    demandLow={marketDemandLow}
                    demandHigh={marketDemandHigh}
                    supplyLow={marketSupplyLow}
                    supplyHigh={marketSupplyHigh}
                    support={marketSupport}
                    resistance={marketResistance}
                    marketClosed={marketSessionClosed}
                  />
                </section>

                <section className="panel cc-v48-signal-panel">
                  <div className="cc-v48-panel-head">
                    <div className="cc-v48-title">
                      <span><ScenovaIcon name="spark" size={19}/></span>
                      <div><b>AI SIGNAL COCKPIT</b><small>Multi-timeframe analysis &amp; institutional order flow</small></div>
                    </div>
                    <em className={isMt5Online?"live":"idle"}><i/>{isMt5Online?"Live":"Offline"}</em>
                  </div>

                  <div className={"cc-v48-signal-split "+(!signalScoreReady?"waiting":"")}>
                    <div className="buy"><small>BUY</small><b>{signalScoreReady?buySignalPercent+"%":"—"}</b></div>
                    <div className="sell"><small>SELL</small><b>{signalScoreReady?sellSignalPercent+"%":"—"}</b></div>
                    <span><i style={{width:buySignalPercent+"%"}}/><i style={{width:sellSignalPercent+"%"}}/></span>
                  </div>

                  <div className="cc-v48-signal-grid">
                    <div><span><ScenovaIcon name="trend" size={15}/>Market Regime</span><b>{marketRegimeText}</b></div>
                    <div><span><ScenovaIcon name="pnl" size={15}/>ATR (M15)</span><b>{atrValueLabel}</b></div>
                    <div><span><ScenovaIcon name="spread" size={15}/>Spread</span><b className={spreadStatus==="NORMAL"?"good":"warn"}>{spreadValueLabel}</b></div>
                    <div><span><ScenovaIcon name="arrow-up" size={15}/>Momentum</span><b className={Number(metrics.momentumPoints||0)>=0?"good":"bad"}>{Number(metrics.momentumPoints||0).toFixed(1)} pt</b></div>
                  </div>

                  <div className="cc-v48-trend-row">
                    <span>Timeframe Trend</span>
                    <div>{[{label:"M5",value:metrics.trendM5},{label:"M15",value:metrics.trendM15},{label:"M30",value:metrics.trendM30},{label:"H1",value:metrics.trendH1}].map(item=>{
                      const direction=Number(item.value)>0?"up":Number(item.value)<0?"down":"flat";
                      return <i key={item.label} className={direction}><small>{item.label}</small><b>{direction==="up"?"▲ Buy":direction==="down"?"▼ Sell":"• Flat"}</b></i>;
                    })}</div>
                  </div>

                  <div className="cc-v48-context-grid">
                    <div><span><ScenovaIcon name="layers" size={16}/></span><small>Order Block</small><b>{orderBlockCustomerText}</b></div>
                    <div><span><ScenovaIcon name="spark" size={16}/></span><small>Liquidity</small><b>{liquidityState==="NONE"?"กำลังติดตาม":liquidityState.replace(/_/g," ")}</b></div>
                    <div><span><ScenovaIcon name="target" size={16}/></span><small>Entry Context</small><b>{indicatorDecisionLabel[indicatorDecision]||indicatorDecision}</b></div>
                  </div>

                  <div className="cc-v48-session-row"><span>Session</span><b>{sessionProfile}</b><em className={metrics.tradeReady===true?"good":"warn"}>{metrics.tradeReady===true?"พร้อมส่งออเดอร์":latestDecisionCustomerText}</em></div>
                </section>
              </section>

              <section className="cc-v42-bottom-suite cc-v48-legacy-hidden" aria-hidden="true">
                <section className="panel cc-v42-card cc-v42-position-monitor">
                  <div className="cc-v42-card-head">
                    <div>
                      <span className="cc-v42-head-icon"><ScenovaIcon name="orders" size={15}/></span>
                      <div><b>Position Monitor</b><small>สถานะการถือครองปัจจุบัน</small></div>
                    </div>
                    <em>{currentPositions} Positions</em>
                  </div>
                  <div className="cc-v42-table cc-v42-position-table">
                    <div className="cc-v42-table-head"><span>Symbol</span><span>Type</span><span>Lot</span><span>P&amp;L</span></div>
                    <div className="cc-v42-table-body">
                      {openPositions.length ? [...openPositions].reverse().slice(0,5).map((position:any,index:number)=>{
                        const side=String(position.side||"").toUpperCase()==="SELL"?"SELL":"BUY";
                        const pnl=Number(position.profit||0);
                        return <div className="cc-v42-table-row" key={"monitor-"+String(position.ticket||position.openedAt||index)}>
                          <span className="symbol">{String(metrics.symbol||settings.symbol||"—")}</span>
                          <span><i className={"cc-v42-side "+side.toLowerCase()}>{side}</i></span>
                          <span>{Number(position.volume||0).toFixed(2)}</span>
                          <span className={pnl>0?"good":pnl<0?"bad":"neutral"}>{pnl>0?"+$":"$"}{pnl.toFixed(2)}</span>
                        </div>;
                      }) : <div className="cc-v42-empty">ยังไม่มี Position ที่เปิดอยู่</div>}
                    </div>
                  </div>
                  <div className="cc-v42-mini-stats">
                    <div><b>{currentPositions}</b><small>Positions</small></div>
                    <div><b>{openPositions.reduce((sum:number,p:any)=>sum+Number(p.volume||0),0).toFixed(2)}</b><small>Total Lot</small></div>
                    <div><b className={Number(metrics.basketProfit||0)>=0?"good":"bad"}>{Number(metrics.basketProfit||0)>=0?"+$":"-$"}{Math.abs(Number(metrics.basketProfit||0)).toFixed(2)}</b><small>Floating P/L</small></div>
                  </div>
                </section>

                <section className="panel cc-v42-card cc-v42-live-logs">
                  <div className="cc-v42-card-head">
                    <div>
                      <span className="cc-v42-head-icon"><ScenovaIcon name="terminal" size={15}/></span>
                      <div><b>Live Logs</b><small>บันทึกการทำงานแบบเรียลไทม์</small></div>
                    </div>
                    <button type="button" onClick={()=>setLogsOpen(true)}>View All</button>
                  </div>
                  <div className="cc-v42-log-list">
                    {terminalEntries.length ? [...terminalEntries].reverse().slice(0,7).map((entry:any,index:number)=>{
                      const time=entry.time ? new Date(entry.time).toLocaleTimeString("th-TH",{timeZone:"Asia/Bangkok",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}) : "—";
                      const tone=String(entry.level||"").toUpperCase();
                      return <div className="cc-v42-log-row" key={"quick-log-"+String(entry.id||index)}>
                        <span className={"cc-v42-log-dot "+(tone==="SUCCESS"?"good":tone==="WARN"||tone==="ERROR"?"bad":"info")}/>
                        <time>{time}</time>
                        <div><b>{entry.text||entry.category||"Event"}</b>{entry.detail?<small>{entry.detail}</small>:null}</div>
                      </div>;
                    }) : <div className="cc-v42-empty">ยังไม่มี Log ล่าสุด</div>}
                  </div>
                </section>

                <section className="panel cc-v42-card cc-v42-goals">
                  <div className="cc-v42-card-head">
                    <div>
                      <span className="cc-v42-head-icon"><ScenovaIcon name="target" size={15}/></span>
                      <div><b>Bot Goals / Daily Target</b><small>เป้าหมายกำไรรายวัน</small></div>
                    </div>
                    <em>{Number(settings.dailyProfitTargetMoney||0)>0?"Active":"Not set"}</em>
                  </div>
                  <div className="cc-v42-goal-main">
                    <div
                      className="cc-v42-goal-ring"
                      style={{background:Number(settings.dailyProfitTargetMoney||0)>0
                        ? `conic-gradient(#62dfa6 ${Math.max(0,Math.min(100,(Math.max(0,Number(metrics.dailyProfit||0))/Math.max(0.01,Number(settings.dailyProfitTargetMoney||0)))*100))}% , rgba(78,91,128,.28) 0)`
                        : "conic-gradient(#5f6b8a 0%, rgba(78,91,128,.28) 0)"}}
                    >
                      <div>
                        <b>{Number(settings.dailyProfitTargetMoney||0)>0
                          ? Math.max(0,Math.min(100,(Math.max(0,Number(metrics.dailyProfit||0))/Math.max(0.01,Number(settings.dailyProfitTargetMoney||0)))*100)).toFixed(0)+"%"
                          : "—"}</b>
                        <small>{Number(settings.dailyProfitTargetMoney||0)>0
                          ? "$"+Math.max(0,Number(metrics.dailyProfit||0)).toFixed(2)+" / $"+Number(settings.dailyProfitTargetMoney||0).toFixed(2)
                          : "ยังไม่ตั้งเป้า"}</small>
                      </div>
                    </div>
                    <div className="cc-v42-goal-copy">
                      <div><span>เป้าหมายวันนี้</span><b>{Number(settings.dailyProfitTargetMoney||0)>0?"$"+Number(settings.dailyProfitTargetMoney||0).toFixed(2):"—"}</b></div>
                      <div><span>กำไรปัจจุบัน</span><b className={Number(metrics.dailyProfit||0)>=0?"good":"bad"}>{Number(metrics.dailyProfit||0)>=0?"+$":"-$"}{Math.abs(Number(metrics.dailyProfit||0)).toFixed(2)}</b></div>
                      <div><span>คงเหลือ</span><b>{Number(settings.dailyProfitTargetMoney||0)>0?"$"+Math.max(0,Number(settings.dailyProfitTargetMoney||0)-Math.max(0,Number(metrics.dailyProfit||0))).toFixed(2):"—"}</b></div>
                    </div>
                  </div>
                  <div className="cc-v42-goal-foot">
                    <span>Win Rate วันนี้</span>
                    <b>{Number(todayPerformance.trades||0)>0?Number(todayPerformance.winRate||0).toFixed(1)+"%":"—"}</b>
                    <small>{Number(todayPerformance.trades||0)} Basket</small>
                  </div>
                </section>

                <section className="panel cc-v42-card cc-v42-news">
                  <div className="cc-v42-card-head">
                    <div>
                      <span className="cc-v42-head-icon"><ScenovaIcon name="calendar" size={15}/></span>
                      <div><b>News &amp; High-impact Events</b><small>ข่าวสารและเหตุการณ์สำคัญ</small></div>
                    </div>
                    <em>Live status</em>
                  </div>
                  <div className="cc-v42-news-status">
                    <span className={marketSessionClosed?"warn":isMt5Online?"good":"neutral"}>{marketSessionClosed?"Market Closed":isMt5Online?"Market Online":"Waiting MT5"}</span>
                    <b>{marketTradeLabel}</b>
                  </div>
                  <div className="cc-v42-news-list">
                    <div><time>MARKET</time><span><b>Economic Calendar Feed</b><small>ยังไม่ได้เชื่อมแหล่งข่าวเข้ากับ Dashboard นี้</small></span><em>—</em></div>
                    <div><time>SPREAD</time><span><b>Spread Status</b><small>{spreadStatusLabel[spreadStatus]||spreadStatus}</small></span><em className={spreadStatus==="NORMAL"?"good":"warn"}>{spreadValueLabel}</em></div>
                    <div><time>SESSION</time><span><b>Execution Status</b><small>{controlStateLabel}</small></span><em>{String(metrics.executionStatus||state||"—")}</em></div>
                  </div>
                  <div className="cc-v42-news-note"><ScenovaIcon name="info" size={13}/>ส่วนนี้แสดงเฉพาะข้อมูลที่ระบบมีจริง และไม่สร้างข่าวจำลอง</div>
                </section>

                <section className="panel cc-v42-card cc-v42-risk">
                  <div className="cc-v42-card-head">
                    <div>
                      <span className="cc-v42-head-icon green"><ScenovaIcon name="shield" size={15}/></span>
                      <div><b>AI Risk Commentary</b><small>มุมมองความเสี่ยงจากระบบ</small></div>
                    </div>
                    <em>AI</em>
                  </div>
                  <div className="cc-v42-risk-level">
                    <b>สถานะความเสี่ยง</b>
                    <span className={performanceRiskMode==="NORMAL"?"good":"warn"}>{performanceRiskMode==="NORMAL"?"ปกติ":"กำลังปรับความเสี่ยง"}</span>
                  </div>
                  <p>{riskCustomerText}</p>
                  <ul>
                    <li><i className={isMt5Online?"good":"warn"}/><span>{connectionLabel}</span></li>
                    <li><i className={spreadStatus==="NORMAL"?"good":"warn"}/><span>Spread: {spreadStatusLabel[spreadStatus]||spreadStatus}</span></li>
                    <li><i className={Number(todayPerformance.drawdownPercent||0)<2?"good":"warn"}/><span>Drawdown วันนี้ {Number(todayPerformance.drawdownPercent||0).toFixed(2)}%</span></li>
                  </ul>
                </section>
              </section>

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
                <button className="cc-mobile-command stop" disabled={stopBlocked} onClick={()=>command("/bot/stop","Safe Stop แล้ว · ไม่เปิดรอบใหม่ และรอรอบปัจจุบันปิดตามเงื่อนไขปกติ")}>
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
                  <div className="eyebrow">MT5 ACCOUNT · {data.selectedSlot?.mode || "LOCAL"}</div>
                  <h2>
                    {data.account
                      ? (data.account.broker + " · " + data.account.account_number)
                      : "ยังไม่ได้ผูกบัญชี MT5"}
                  </h2>
                  <p className="muted">
                    {data.account
                      ? (data.account.broker_server + " · บัญชีนี้เป็น MT5 ที่กำลังใช้งาน")
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
                      <div><span>{data.account ? "บัญชีเดิม" : "บัญชีปัจจุบัน"}</span><b>{data.account?.account_number || "ยังไม่มีบัญชี"}</b></div>
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
                    ครั้งแรกระบบจะผูก MT5 ที่ตรวจพบกับบัญชี SCENOVA นี้ให้อัตโนมัติ หาก MT5 Login + Server ยังไม่ถูกบัญชี SCENOVA อื่นใช้อยู่
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
                      <div className="eyebrow">CLOUD MT5</div>
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

          {!isOwner && (
            <div className="access-workspace account-access-summary" id="membership-and-trial">
            <section className="panel purple"><div className="eyebrow">CLOUD MEMBERSHIP</div><h2>ให้ Cloud ดูแล MT5 ของคุณ</h2><p className="muted">เลือก 1 / 3 / 6 / 12 เดือน ชำระผ่าน QR และติดตามการเปิดใช้งานได้จากหน้าเดียว</p><a className="btn primary" href={"/cloud"+(data.selectedSlot?.mode==="CLOUD"?"?slotId="+encodeURIComponent(data.selectedSlot.id):"")}>ซื้อ / ต่ออายุ Cloud →</a></section>
            <div className="grid2 access-grid">
              <section className="panel purple">
                <div className="eyebrow">ACCESS STATUS</div>
                <h2 style={{marginTop:8}}>{accessLabel}</h2>
                {entitlement?.source === "OWNER" ? (
                  <div className="notice good owner-unlimited-access">
                    <b>สิทธิ์เจ้าของระบบเปิดครบทุกฟังก์ชัน</b>
                    <span>ไม่ต้องเปิด Trial หรือแพ็กเกจให้บัญชีนี้ และไม่มีวันหมดอายุ</span>
                  </div>
                ) : remainingText ? (
                  <div className="time-card"><span>เวลาคงเหลือ</span><b className="mono">{remainingText}</b><small>หมดอายุ {accessExpiry?.toLocaleString("th-TH")}</small></div>
                ) : (
                  <p className="muted">ยังไม่มีสิทธิ์สมาชิกที่กำลังใช้งาน</p>
                )}
                {data.selectedSlot?.plan_code && (
                  <div className="slot-plan-summary">
                    <span>แพ็กเกจ</span>
                    <b>{data.selectedSlot.plan_code}</b>
                    <small>{data.selectedSlot.allow_resale ? (data.selectedSlot.plan_slots || 1) + " Customer Seats · Partner / Reseller" : data.selectedSlot.mode}</small>
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
            </div>
          )}
          </div>
        )}

        {activeView === "backtest" && (
          <BacktestCenter
            slotId={selectedSlotId || data.selectedSlot?.id || ""}
            onError={(message:string)=>setError(message)}
            onNotice={(message:string)=>setNotice(message)}
          />
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

function BacktestCenter(props:{slotId:string;onError:(message:string)=>void;onNotice:(message:string)=>void}) {
  const [runs,setRuns] = useState<any[]>([]);
  const [selected,setSelected] = useState<any|null>(null);
  const [loading,setLoading] = useState(false);
  const [busy,setBusy] = useState(false);

  async function refresh(selectId?:string) {
    setLoading(true);
    try {
      const query = props.slotId ? "?slotId="+encodeURIComponent(props.slotId) : "";
      const rows = await api("/backtest/runs"+query);
      setRuns(Array.isArray(rows)?rows:[]);
      const targetId = selectId || selected?.id || rows?.[0]?.id;
      if (targetId) {
        const detail = await api("/backtest/run?id="+encodeURIComponent(targetId));
        setSelected(detail);
      } else {
        setSelected(null);
      }
    } catch (e:any) {
      props.onError(String(e?.message||"โหลด Backtest ไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(()=>{
    refresh();
  },[props.slotId]);

  async function createSample() {
    setBusy(true);
    try {
      const created = await api("/backtest/sample",{
        method:"POST",
        body:JSON.stringify({
          slotId:props.slotId,
          title:"SCENOVA Backtest ตัวอย่าง",
          symbol:"XAUUSDm",
          timeframe:"M5",
          initialDeposit:1000,
          lot:0.01
        })
      });
      props.onNotice("สร้าง Backtest ตัวอย่างแล้ว");
      await refresh(created.id);
    } catch (e:any) {
      props.onError(String(e?.message||"สร้างตัวอย่างไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish() {
    if(!selected?.id) return;
    setBusy(true);
    try {
      const result = await api("/backtest/publish",{
        method:"POST",
        body:JSON.stringify({id:selected.id,published:!selected.is_published})
      });
      const detail = await api("/backtest/run?id="+encodeURIComponent(selected.id));
      setSelected(detail);
      setRuns(rows=>rows.map(row=>row.id===selected.id?{...row,...result}:row));
      props.onNotice(result.is_published?"เปิดหน้าพอร์ตตัวอย่างแล้ว":"ปิดการแชร์สาธารณะแล้ว");
    } catch (e:any) {
      props.onError(String(e?.message||"เปลี่ยนสถานะการแชร์ไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function downloadCsv() {
    if(!selected?.id) return;
    try {
      const token = getToken();
      const response = await fetch(API_URL+"/api/backtest/export.csv?id="+encodeURIComponent(selected.id),{
        headers:token?{Authorization:"Bearer "+token}:{},
        cache:"no-store"
      });
      if(!response.ok){
        const body = await response.json().catch(()=>({}));
        throw new Error(body.message||"ดาวน์โหลดไม่สำเร็จ");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition")||"";
      const match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const fileName = match ? decodeURIComponent(match[1]) : "scenova-backtest.csv";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href=url;
      link.download=fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch(e:any){
      props.onError(String(e?.message||"ดาวน์โหลดไม่สำเร็จ"));
    }
  }

  const summary = selected?.summary || {};
  const equity = Array.isArray(selected?.equity_curve)?selected.equity_curve:[];
  const publicUrl = selected?.is_published && selected?.public_slug
    ? (typeof window!=="undefined"?window.location.origin:"")+"/performance/"+selected.public_slug
    : "";

  return (
    <div className="backtest-workspace">
      <section className="panel backtest-hero">
        <div>
          <span className="eyebrow">BACKTEST CENTER</span>
          <h2>ผลทดสอบย้อนหลังและพอร์ตตัวอย่าง</h2>
          <p>ผล Backtest เป็นข้อมูลจำลองย้อนหลัง ไม่ใช่การรับประกันกำไรในอนาคต หน้าพอร์ตสาธารณะเป็นแบบอ่านอย่างเดียวและไม่เปิดเผยรหัส MT5</p>
        </div>
        <div className="backtest-hero-actions">
          <button className="btn" disabled={loading||busy} onClick={()=>refresh()}><ScenovaIcon name="refresh" size={16}/>รีเฟรช</button>
          <button className="btn primary" disabled={busy} onClick={createSample}><ScenovaIcon name="strategy" size={16}/>สร้างตัวอย่าง</button>
        </div>
      </section>

      <div className="backtest-layout">
        <section className="panel backtest-run-list">
          <div className="panel-head">
            <div><div className="eyebrow">REPORTS</div><h2>รายงาน Backtest</h2></div>
            <span className="badge">{runs.length} รายการ</span>
          </div>
          <div className="backtest-run-scroll">
            {runs.map((run:any)=>(
              <button key={run.id} className={"backtest-run-item "+(selected?.id===run.id?"active":"")} onClick={async()=>{
                setLoading(true);
                try{setSelected(await api("/backtest/run?id="+encodeURIComponent(run.id)));}
                catch(e:any){props.onError(String(e?.message||"เปิดรายงานไม่สำเร็จ"));}
                finally{setLoading(false);}
              }}>
                <div><b>{run.title}</b><small>{run.symbol+" · "+run.timeframe+" · "+new Date(run.created_at).toLocaleDateString("th-TH")}</small></div>
                <span className={run.source==="SAMPLE"?"warn":""}>{run.source==="SAMPLE"?"ตัวอย่าง":"Backtest"}</span>
              </button>
            ))}
            {!loading&&!runs.length&&<div className="backtest-empty">ยังไม่มีรายงาน Backtest<br/><small>สร้างตัวอย่างเพื่อดูรูปแบบหน้ารายงานได้ทันที</small></div>}
          </div>
        </section>

        <section className="panel backtest-report">
          {selected ? (
            <>
              <div className="backtest-report-head">
                <div>
                  <div className="eyebrow">{selected.source==="SAMPLE"?"SIMULATED SAMPLE":"BACKTEST REPORT"}</div>
                  <h2>{selected.title}</h2>
                  <p>{selected.symbol+" · "+selected.timeframe+" · Lot "+Number(selected.lot||0).toFixed(2)+" · เงินเริ่มต้น $"+Number(selected.initial_deposit||0).toFixed(2)}</p>
                </div>
                <div className="backtest-actions">
                  <button className="btn" onClick={downloadCsv}>ดาวน์โหลด CSV</button>
                  <button className={selected.is_published?"btn danger-outline":"btn primary"} disabled={busy} onClick={togglePublish}>
                    {selected.is_published?"หยุดแชร์":"สร้างพอร์ตตัวอย่าง"}
                  </button>
                </div>
              </div>

              {selected.source==="SAMPLE"&&<div className="notice warn backtest-disclaimer"><b>ผลจำลองตัวอย่าง</b><span>ข้อมูลชุดนี้สร้างขึ้นเพื่อสาธิตหน้ารายงานเท่านั้น ไม่ใช่ผลการเทรดจริง</span></div>}

              <div className="backtest-kpis">
                <BacktestKpi label="Net P/L" value={(Number(summary.netProfit||0)>=0?"+$":"-$")+Math.abs(Number(summary.netProfit||0)).toFixed(2)} tone={Number(summary.netProfit||0)>=0?"good":"bad"}/>
                <BacktestKpi label="Return" value={Number(summary.returnPercent||0).toFixed(2)+"%"} tone={Number(summary.returnPercent||0)>=0?"good":"bad"}/>
                <BacktestKpi label="Win Rate" value={Number(summary.winRate||0).toFixed(1)+"%"} />
                <BacktestKpi label="Profit Factor" value={Number(summary.profitFactor||0).toFixed(2)} />
                <BacktestKpi label="Max Drawdown" value={Number(summary.maxDrawdownPercent||0).toFixed(2)+"%"} tone="warn"/>
                <BacktestKpi label="Trades" value={String(summary.closedTrades||0)} />
                {Number(summary.maeSamples||0)>0&&<BacktestKpi label="Avg MAE" value={Number(summary.avgMae||0).toFixed(2)} tone="warn"/>}
                {Number(summary.mfeSamples||0)>0&&<BacktestKpi label="Avg MFE" value={Number(summary.avgMfe||0).toFixed(2)} tone="good"/>}
                {Number(summary.captureSamples||0)>0&&<BacktestKpi label="Profit Capture" value={Number(summary.profitCapturePercent||0).toFixed(1)+"%"}/>}
                {Number(summary.terminalChaseSamples||0)>0&&<BacktestKpi label="BUY Top / SELL Bottom" value={Number(summary.terminalChaseRate||0).toFixed(1)+"%"} tone="warn"/>}
                {Number(summary.basketFillSamples||0)>0&&<BacktestKpi label="Avg Basket Fill" value={(Number(summary.avgBasketFillSeconds||0)/60).toFixed(1)+" นาที"}/>}
                {Number(summary.basketFillSamples||0)>0&&<BacktestKpi label="Fill ≤ 10 นาที" value={Number(summary.basketFillWithin10MinRate||0).toFixed(1)+"%"} tone="good"/>}
                {Number(summary.churnSamples||0)>0&&<BacktestKpi label="Same-side Churn" value={Number(summary.churnRate||0).toFixed(1)+"%"} tone="warn"/>}
              </div>

              <div className="backtest-chart-card">
                <div className="backtest-chart-head"><div><b>Equity Curve</b><small>การเปลี่ยนแปลง Balance หลังแต่ละรายการ</small></div><strong>{"$"+Number(summary.finalBalance||0).toFixed(2)}</strong></div>
                <BacktestEquityChart points={equity}/>
              </div>

              {publicUrl&&(
                <div className="backtest-public-link">
                  <div><b>พอร์ตตัวอย่างเปิดให้ลูกค้าดูแล้ว</b><small>เป็นหน้าอ่านอย่างเดียว ไม่มีรหัสผ่าน MT5 และไม่มีสิทธิ์ส่งคำสั่งเทรด</small></div>
                  <a className="btn primary" href={publicUrl} target="_blank" rel="noreferrer">เปิดหน้าสาธารณะ ↗</a>
                  <button className="btn" onClick={()=>navigator.clipboard?.writeText(publicUrl).then(()=>props.onNotice("คัดลอกลิงก์แล้ว"))}>คัดลอกลิงก์</button>
                </div>
              )}

              <div className="backtest-trade-table">
                <div className="backtest-trade-row header"><span>#</span><span>ฝั่ง</span><span>Lot</span><span>ราคาเปิด</span><span>ราคาปิด</span><span>P/L</span><span>Balance</span></div>
                {(selected.trades||[]).slice(-20).reverse().map((trade:any)=>(
                  <div className="backtest-trade-row" key={trade.trade_index}>
                    <span>{trade.trade_index}</span>
                    <span className={trade.direction==="BUY"?"text-good":"text-bad"}>{trade.direction}</span>
                    <span>{Number(trade.volume||0).toFixed(2)}</span>
                    <span>{Number(trade.open_price||0).toFixed(3)}</span>
                    <span>{Number(trade.close_price||0).toFixed(3)}</span>
                    <span className={Number(trade.profit||0)>=0?"text-good":"text-bad"}>{Number(trade.profit||0)>=0?"+$":"-$"}{Math.abs(Number(trade.profit||0)).toFixed(2)}</span>
                    <span>{"$"+Number(trade.balance_after||0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <div className="backtest-report-empty"><ScenovaIcon name="strategy" size={28}/><b>เลือกรายงาน Backtest</b><span>ผลสรุป กราฟ รายการเทรด และปุ่มดาวน์โหลดจะแสดงตรงนี้</span></div>}
        </section>
      </div>
    </div>
  );
}

function BacktestKpi(props:{label:string;value:string;tone?:string}) {
  return <div className={"backtest-kpi "+(props.tone||"")}><span>{props.label}</span><b>{props.value}</b></div>;
}

function BacktestEquityChart({points}:{points:any[]}) {
  if(!points.length) return <div className="backtest-chart-empty">ยังไม่มีข้อมูล Equity</div>;
  const values = points.map((point:any)=>Number(point.balance||0));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1,max-min);
  const width = 900;
  const height = 220;
  const coords = values.map((value,index)=>{
    const x = values.length<=1 ? 0 : index/(values.length-1)*width;
    const y = height-((value-min)/range*(height-20)+10);
    return x.toFixed(1)+","+y.toFixed(1);
  }).join(" ");
  return (
    <svg className="backtest-equity-svg" viewBox={"0 0 "+width+" "+height} preserveAspectRatio="none" role="img" aria-label="Equity curve">
      <polyline points={coords} fill="none" vectorEffect="non-scaling-stroke"/>
    </svg>
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
  return <div className={"cc-kpi cc-tone-"+tone}><span className="cc-kpi-icon"><ScenovaIcon name={icon} size={22}/></span><div><span className="cc-kpi-label">{label}</span><b>{value}</b>{sub?<small>{sub}</small>:null}</div><i className="cc-kpi-trace" aria-hidden="true"/></div>;
}

function LiveTelemetryItem({icon,label,value,tone="neutral"}:{icon:string;label:string;value:string;tone?:"neutral"|"good"|"warn"|"bad"}) {
  return <div className={"cc-v6-telemetry-item tone-"+tone}><ScenovaIcon name={icon} size={15}/><span>{label}</span><b>{value}</b></div>;
}

function HeroTrendChip({label,value}:{label:string;value:any}) {
  const direction = Number(value)>0 ? "up" : Number(value)<0 ? "down" : "flat";
  return <span className={"cc-v6-hero-trend "+direction}><ScenovaIcon name="spark" size={12}/>{label} {direction==="up"?"ขึ้น":direction==="down"?"ลง":"กลาง"}</span>;
}

function InsightRow({label,value,tone="neutral"}:{label:string;value:string;tone?:"neutral"|"good"|"warn"|"bad"}) {
  return <div className={"cc-v6-insight-row tone-"+tone}><span>{label}</span><b>{value}</b></div>;
}

function AccountLiveStat({icon,label,value,tone="neutral"}:{icon:string;label:string;value:string;tone?:"neutral"|"good"|"warn"|"bad"}) {
  return <div className={"cc-v9-account-live-stat tone-"+tone}><span><ScenovaIcon name={icon} size={14}/></span><div><small>{label}</small><b>{value}</b></div></div>;
}

function LivePriceChart({points,symbol,marketClosed}:{points:Array<{t:number;price:number}>;symbol:string;marketClosed:boolean}) {
  const [nowMs,setNowMs] = useState(()=>Date.now());

  useEffect(() => {
    if (marketClosed) {
      setNowMs(Date.now());
      return;
    }
    const id = window.setInterval(()=>setNowMs(Date.now()),100);
    return () => window.clearInterval(id);
  }, [marketClosed]);

  const width = 940;
  const height = 286;
  const pad = 10;
  const cutoff = nowMs - LIVE_PRICE_WINDOW_MS;
  const visible = points.filter(point=>point.t>=cutoff && point.t<=nowMs+5000);
  const prices = visible.map(point=>point.price);
  const low = prices.length ? Math.min(...prices) : 0;
  const high = prices.length ? Math.max(...prices) : 0;
  const rawRange = Math.max(0,high-low);
  const center = prices.length ? (high+low)/2 : 0;
  const breathingRoom = prices.length
    ? Math.max(rawRange*0.22,Math.abs(center)*0.00004,0.01)
    : 1;
  const minPrice = low-breathingRoom;
  const maxPrice = high+breathingRoom;
  const range = Math.max(0.0000001,maxPrice-minPrice);
  const xFor = (time:number)=>pad+((time-cutoff)/LIVE_PRICE_WINDOW_MS)*(width-pad*2);
  const yFor = (price:number)=>pad+((maxPrice-price)/range)*(height-pad*2);
  const plotted = visible.map(point=>({...point,x:xFor(point.t),y:yFor(point.price)}));
  const linePath = plotted.reduce((path,point,index)=>{
    if(index===0) return "M"+point.x.toFixed(2)+" "+point.y.toFixed(2);
    const previous = plotted[index-1];
    const middleX = (previous.x+point.x)/2;
    return path+" C"+middleX.toFixed(2)+" "+previous.y.toFixed(2)+" "+middleX.toFixed(2)+" "+point.y.toFixed(2)+" "+point.x.toFixed(2)+" "+point.y.toFixed(2);
  },"");
  const areaPath = plotted.length>1
    ? linePath+" L "+plotted[plotted.length-1].x.toFixed(2)+" "+height+" L "+plotted[0].x.toFixed(2)+" "+height+" Z"
    : "";
  const latest = plotted[plotted.length-1];

  return (
    <section className="panel cc-v6-hourly-chart">
      <div className="cc-v6-panel-head">
        <div><span><ScenovaIcon name="trend" size={18}/></span><div><b>ราคาสด {symbol}</b><small>เส้นราคาไหลแบบ Live · เก็บเฉพาะข้อมูล 15 นาทีล่าสุดในหน้านี้</small></div></div>
        <em className={marketClosed?"warn":"good"}>{marketClosed?"MARKET CLOSED":"LIVE · 15 MIN"}</em>
      </div>
      <div className="cc-v6-chart-canvas" style={{height:"278px",marginTop:"10px"}}>
        <svg viewBox={"0 0 "+width+" "+height} preserveAspectRatio="none" role="img" aria-label="กราฟราคาสด 15 นาทีล่าสุด">
          <defs>
            <linearGradient id="hourlyWinLine" x1="0" x2="1"><stop offset="0" stopColor="#48e8ff"/><stop offset=".56" stopColor="#57a9ff"/><stop offset="1" stopColor="#a978ff"/></linearGradient>
            <linearGradient id="hourlyWinArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4fcfff" stopOpacity=".20"/><stop offset="1" stopColor="#7658ff" stopOpacity="0"/></linearGradient>
            <filter id="livePriceGlow"><feGaussianBlur stdDeviation="3.4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            <radialGradient id="livePriceDot"><stop offset="0" stopColor="#f4fdff"/><stop offset=".35" stopColor="#65e4ff"/><stop offset="1" stopColor="#7f6cff"/></radialGradient>
          </defs>
          {areaPath&&<path d={areaPath} className="cc-v6-chart-area"/>}
          {linePath&&<path d={linePath} className="cc-v6-chart-line" filter="url(#livePriceGlow)"/>}
          {latest&&<g>
            <circle cx={latest.x} cy={latest.y} r="5.5" fill="url(#livePriceDot)" stroke="#eafcff" strokeWidth="1.2" vectorEffect="non-scaling-stroke"/>
            {!marketClosed&&<circle cx={latest.x} cy={latest.y} r="8" fill="none" stroke="#62ddff" strokeWidth="1" opacity=".7" vectorEffect="non-scaling-stroke"><animate attributeName="r" values="7;14;7" dur="1.7s" repeatCount="indefinite"/><animate attributeName="opacity" values=".75;0;.75" dur="1.7s" repeatCount="indefinite"/></circle>}
          </g>}
        </svg>
        {!visible.length&&<div className="cc-v6-chart-empty"><ScenovaIcon name="trend" size={24}/><b>{marketClosed?"ตลาดปิดอยู่":"กำลังรอราคาสด"}</b><span>{marketClosed?"เมื่อ Session เปิด กราฟจะเริ่มไหลจากข้อมูลใหม่ทันที":"ข้อมูลจะเริ่มวาดเมื่อ EA ส่งราคาล่าสุดเข้ามา"}</span></div>}
      </div>
    </section>
  );
}

function MarketIntelligenceChart({
  points,currentPrice,digits,demandLow,demandHigh,supplyLow,supplyHigh,support,resistance,marketClosed
}:{
  points:Array<{t:number;price:number}>;
  currentPrice:number;
  digits:number;
  demandLow:number;
  demandHigh:number;
  supplyLow:number;
  supplyHigh:number;
  support:number;
  resistance:number;
  marketClosed:boolean;
}) {
  const width=980;
  const height=205;
  const padX=14;
  const padY=12;
  const visible=points.slice(-120);
  const prices=visible.map(point=>Number(point.price)).filter(price=>Number.isFinite(price)&&price>0);
  const levelPrices=[currentPrice,demandLow,demandHigh,supplyLow,supplyHigh,support,resistance].filter(price=>Number.isFinite(price)&&price>0);
  const allPrices=[...prices,...levelPrices];
  const rawLow=allPrices.length?Math.min(...allPrices):0;
  const rawHigh=allPrices.length?Math.max(...allPrices):0;
  const margin=allPrices.length?Math.max((rawHigh-rawLow)*.14,Math.abs((rawHigh+rawLow)/2)*.00008,.01):1;
  const minPrice=rawLow-margin;
  const maxPrice=rawHigh+margin;
  const range=Math.max(.0000001,maxPrice-minPrice);
  const xFor=(index:number)=>padX+(index/Math.max(1,visible.length-1))*(width-padX*2);
  const yFor=(price:number)=>padY+((maxPrice-price)/range)*(height-padY*2);
  const plotted=visible.map((point,index)=>({x:xFor(index),y:yFor(Number(point.price))})).filter(point=>Number.isFinite(point.y));
  const linePath=plotted.reduce((path,point,index)=>{
    if(index===0)return `M${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    const previous=plotted[index-1];
    const middle=(previous.x+point.x)/2;
    return `${path} C${middle.toFixed(2)} ${previous.y.toFixed(2)} ${middle.toFixed(2)} ${point.y.toFixed(2)} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  },"");
  const areaPath=plotted.length>1?`${linePath} L${plotted[plotted.length-1].x.toFixed(2)} ${height} L${plotted[0].x.toFixed(2)} ${height} Z`:"";
  const band=(low:number,high:number)=>{
    if(low<=0||high<=0)return null;
    const top=yFor(Math.max(low,high));
    const bottom=yFor(Math.min(low,high));
    return {y:top,height:Math.max(3,bottom-top)};
  };
  const demandBand=band(demandLow,demandHigh);
  const supplyBand=band(supplyLow,supplyHigh);
  const latest=plotted[plotted.length-1];
  const priceLabel=(value:number)=>value>0?value.toFixed(digits):"—";

  return <div className="cc-v48-chart-shell">
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="กราฟราคาสดพร้อม Demand Supply และแนวรับแนวต้าน">
      <defs>
        <linearGradient id="v48PriceLine" x1="0" x2="1"><stop offset="0" stopColor="#62e7ff"/><stop offset=".58" stopColor="#55c6d9"/><stop offset="1" stopColor="#72f0b1"/></linearGradient>
        <linearGradient id="v48PriceArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4ad9f3" stopOpacity=".2"/><stop offset="1" stopColor="#4ad9f3" stopOpacity="0"/></linearGradient>
        <filter id="v48Glow"><feGaussianBlur stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      {[.2,.4,.6,.8].map(step=><line key={"h"+step} x1="0" x2={width} y1={height*step} y2={height*step} className="grid"/>)}
      {[.16,.32,.48,.64,.8].map(step=><line key={"v"+step} x1={width*step} x2={width*step} y1="0" y2={height} className="grid"/>)}
      {supplyBand&&<rect x="0" width={width} y={supplyBand.y} height={supplyBand.height} className="supply-zone"/>}
      {demandBand&&<rect x="0" width={width} y={demandBand.y} height={demandBand.height} className="demand-zone"/>}
      {resistance>0&&<line x1="0" x2={width} y1={yFor(resistance)} y2={yFor(resistance)} className="resistance-line"/>}
      {support>0&&<line x1="0" x2={width} y1={yFor(support)} y2={yFor(support)} className="support-line"/>}
      {areaPath&&<path d={areaPath} className="price-area"/>}
      {linePath&&<path d={linePath} className="price-line" filter="url(#v48Glow)"/>}
      {latest&&<><line x1="0" x2={width} y1={latest.y} y2={latest.y} className="current-line"/><circle cx={latest.x} cy={latest.y} r="4" className="current-dot"/></>}
    </svg>
    {supplyBand&&<span className="cc-v48-zone-label supply" style={{top:`${(supplyBand.y/height)*100}%`}}>SUPPLY {priceLabel(supplyLow)}–{priceLabel(supplyHigh)}</span>}
    {demandBand&&<span className="cc-v48-zone-label demand" style={{top:`${(demandBand.y/height)*100}%`}}>DEMAND {priceLabel(demandLow)}–{priceLabel(demandHigh)}</span>}
    {resistance>0&&<span className="cc-v48-level-label resistance" style={{top:`${(yFor(resistance)/height)*100}%`}}>Resistance {priceLabel(resistance)}</span>}
    {support>0&&<span className="cc-v48-level-label support" style={{top:`${(yFor(support)/height)*100}%`}}>Support {priceLabel(support)}</span>}
    {!plotted.length&&<div className="cc-v48-chart-empty"><ScenovaIcon name="trend" size={22}/><b>{marketClosed?"ตลาดปิดอยู่":"กำลังรอราคาสดจาก EA"}</b><small>กราฟและโซนจะแสดงเมื่อได้รับข้อมูลจริง</small></div>}
  </div>;
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
  const [revealedManualRisk,setRevealedManualRisk] = useState<Record<string,boolean>>({});
  if (!props.open && !props.embedded) return null;
  const embedded = Boolean(props.embedded);

  const entryMode = String(props.settings?.entryMode || "AUTO_MOMENTUM");
  const engineMode = String(props.settings?.engineMode || "AUTO").toUpperCase();
  const profitTargetMode = String(props.settings?.profitTargetMode || "AUTO").toUpperCase();
  const manualSl = Number(props.settings?.manualStopLossPoints || 0);
  const hasManualExit = profitTargetMode === "MANUAL" || manualSl > 0;
  const inferredControlMode = engineMode === "ZERO_GRID" ? "ZERO_GRID" : engineMode === "RACE" ? "RACE" : hasManualExit ? "MANUAL" : "AUTO";
  const requestedControlModeRaw = String(props.settings?.controlMode || inferredControlMode).toUpperCase();
  const requestedControlMode = requestedControlModeRaw === "ASSISTED" ? "AUTO" : requestedControlModeRaw;
  const controlMode = ["AUTO","FLIP_LOCK","RACE","ZERO_GRID","MANUAL"].includes(requestedControlMode)
    ? requestedControlMode
    : inferredControlMode;
  const sizingProfiles:Record<string,{lot:string;max?:string}> = {
    AUTO:{lot:"autoLot",max:"autoMaxPositions"},
    RACE:{lot:"raceLot",max:"raceMaxPositions"},
    FLIP_LOCK:{lot:"flipLockLot"},
    MANUAL:{lot:"manualLot",max:"manualMaxPositions"}
  };
  const activeSizingProfile = sizingProfiles[controlMode];
  const activeLot = controlMode === "ZERO_GRID"
    ? Number(props.settings?.zeroGridBaseLot || 0.01)
    : Math.max(0.01, Number(props.settings?.[activeSizingProfile?.lot] ?? props.settings?.lot ?? 0.01));
  const activeMaxPositions = controlMode === "FLIP_LOCK"
    ? 1
    : Math.max(1, Number(props.settings?.[activeSizingProfile?.max || "maxPositions"] ?? props.settings?.maxPositions ?? 1));
  const editModeSizing = (kind:"lot"|"max",value:any) => {
    if (!activeSizingProfile) return;
    const profileKey = kind === "lot" ? activeSizingProfile.lot : activeSizingProfile.max;
    if (profileKey) props.onEdit?.(profileKey,value);
    props.onEdit?.(kind === "lot" ? "lot" : "maxPositions",value);
  };
  const riskProfile = controlMode === "MANUAL"
    ? {basket:"manualMaxBasketLossMoney",dailyLoss:"manualDailyLossMoney",dailyProfit:"manualDailyProfitTargetMoney"}
    : {basket:"standardMaxBasketLossMoney",dailyLoss:"standardDailyLossMoney",dailyProfit:"standardDailyProfitTargetMoney"};
  const riskValue = (profileKey:string,genericKey:string) => Number(props.settings?.[profileKey] ?? props.settings?.[genericKey] ?? 0);
  const updateRiskValue = (profileKey:string,genericKey:string,value:any) => {
    props.onEdit?.(profileKey,value);
    props.onEdit?.(genericKey,value);
    if (controlMode === "MANUAL" && Number(value || 0) <= 0) {
      setRevealedManualRisk(previous=>({...previous,[profileKey]:false}));
    }
  };
  const profitKind = Number(props.settings?.perPositionProfitMoney || 0) > 0 ? "POSITION" : "BASKET";
  const suggestedManualSl = String(Math.max(1, Math.round(Number(
    props.systemHardStopDistancePoints || props.hardStopDistancePoints || 1000
  ))));
  const modeCopy:Record<string,{title:string;subtitle:string}> = {
    AUTO:{title:"AUTO · VECTOR EDGE",subtitle:"Vector Edge / V20 เป็นเจ้าของเฉพาะ Position ที่ AUTO เปิดเอง ไม่รับช่วง Position จาก FLIP LOCK, RACE, ZERO GRID หรือ MANUAL"},
    FLIP_LOCK:{title:"FLIP LOCK",subtitle:"อ่านราคา MT5 โดยตรง · เมื่อกำไรบวกมากพอให้ Broker วาง SL ฝั่งกำไรได้ จะยก SL และไล่ตาม Tick โดยไม่รอราคา/คำสั่งจาก Server"},
    RACE:{title:"RACE",subtitle:"เพิ่มความถี่ในการเปิดสถานะเพื่อให้ครบจำนวนที่กำหนดเร็วขึ้น โดยแยกการบริหารรอบจากโหมดอัตโนมัติ"},
    ZERO_GRID:{title:"ZERO GRID",subtitle:"วางคำสั่ง BUY STOP และ SELL STOP แบบสมมาตร รองรับ 1–30 ระดับต่อฝั่ง"},
    MANUAL:{title:"MANUAL",subtitle:"โหมดตั้งค่าด้วยตนเอง ใช้เป้ากำไรและ Stop ของ MANUAL เอง และไม่ส่ง Position ให้ AUTO V20 จัดการ"}
  };

  const applyControlMode = (mode:string) => {
    props.onEdit?.("controlMode",mode);
    props.onEdit?.("confidenceGateEnabled",false);
    const targetSizing = sizingProfiles[mode];
    if (targetSizing) {
      const targetLot = Math.max(0.01, Number(props.settings?.[targetSizing.lot] ?? 0.01));
      props.onEdit?.("lot",targetLot);
      if (mode === "FLIP_LOCK") {
        props.onEdit?.("maxPositions",1);
      } else if (targetSizing.max) {
        props.onEdit?.("maxPositions",Math.max(1,Number(props.settings?.[targetSizing.max] ?? 1)));
      }
    }
    if (mode === "MANUAL") {
      props.onEdit?.("maxBasketLossMoney",Number(props.settings?.manualMaxBasketLossMoney || 0));
      props.onEdit?.("dailyLossMoney",Number(props.settings?.manualDailyLossMoney || 0));
      props.onEdit?.("dailyProfitTargetMoney",Number(props.settings?.manualDailyProfitTargetMoney || 0));
    } else if (mode !== "ZERO_GRID") {
      props.onEdit?.("maxBasketLossMoney",Number(props.settings?.standardMaxBasketLossMoney ?? props.settings?.maxBasketLossMoney ?? 0));
      props.onEdit?.("dailyLossMoney",Number(props.settings?.standardDailyLossMoney ?? props.settings?.dailyLossMoney ?? 0));
      props.onEdit?.("dailyProfitTargetMoney",Number(props.settings?.standardDailyProfitTargetMoney ?? props.settings?.dailyProfitTargetMoney ?? 0));
    }
    // ZERO GRID is price-only and does not use AUTO direction/brain settings.
    if (mode === "ZERO_GRID") {
      props.onEdit?.("engineMode","ZERO_GRID");
      props.onEdit?.("profitTargetMode","OFF");
      props.onEdit?.("manualStopLossPoints",0);
      props.onEdit?.("zeroGridStepPrice",Number(props.settings?.zeroGridStepPrice) === 2 ? 2 : 3);
      if (typeof props.settings?.zeroGridLowVolatilityEnabled !== "boolean") props.onEdit?.("zeroGridLowVolatilityEnabled",false);
      props.onEdit?.("zeroGridLevelsPerSide",Math.max(1,Math.min(30,Number(props.settings?.zeroGridLevelsPerSide)||10)));
      if (!Number.isFinite(Number(props.settings?.zeroGridBaseLot)) || Number(props.settings?.zeroGridBaseLot) <= 0) props.onEdit?.("zeroGridBaseLot",0.01);
      if (!Number.isFinite(Number(props.settings?.zeroGridMinNetProfitMoney)) || Number(props.settings?.zeroGridMinNetProfitMoney) <= 0.01) props.onEdit?.("zeroGridMinNetProfitMoney",0.5);
      if (!Number.isFinite(Number(props.settings?.zeroGridCloseReserveMoney)) || Number(props.settings?.zeroGridCloseReserveMoney) <= 0) props.onEdit?.("zeroGridCloseReserveMoney",0.2);
      return;
    }
    // Keep the currently selected direction when switching control modes.
    if (mode === "RACE") {
      props.onEdit?.("engineMode","RACE");
      props.onEdit?.("profitTargetMode","AUTO");
      props.onEdit?.("manualStopLossPoints",0);
      if (typeof props.settings?.raceCloseAllProfitEnabled !== "boolean") props.onEdit?.("raceCloseAllProfitEnabled",true);
      if (!Number.isFinite(Number(props.settings?.raceCloseAllProfitMoney)) || Number(props.settings?.raceCloseAllProfitMoney) <= 0) props.onEdit?.("raceCloseAllProfitMoney",0.5);
      return;
    }
    props.onEdit?.("engineMode","AUTO");
    if (mode === "FLIP_LOCK") {
      props.onEdit?.("profitTargetMode","OFF");
      props.onEdit?.("manualStopLossPoints",0);
      props.onEdit?.("maxPositions",1);
      props.onEdit?.("dailyProfitContinueAfterTarget",false);
      props.onEdit?.("dailyProfitDrawdownPercent",0);
      return;
    }
    if (mode === "AUTO") {
      props.onEdit?.("profitTargetMode","AUTO");
      props.onEdit?.("manualStopLossPoints",0);
      return;
    }
    props.onEdit?.("profitTargetMode","MANUAL");
    if (Number(props.settings?.basketProfitTargetMoney || 0) <= 0 && Number(props.settings?.perPositionProfitMoney || 0) <= 0) {
      props.onEdit?.("basketProfitTargetMoney",10);
    }
    if (manualSl <= 0) props.onEdit?.("manualStopLossPoints",suggestedManualSl);
  };

  const directionLabel = entryMode === "SELL_ONLY" ? "SELL เท่านั้น" : entryMode === "BUY_ONLY" ? "BUY เท่านั้น" : "อัตโนมัติ · EA เลือก BUY / SELL";
  const directionHelp = controlMode === "FLIP_LOCK"
    ? (entryMode === "AUTO_MOMENTUM"
        ? "ไม้แรกใช้ Momentum/โครงสร้าง · หลังไม้ปิด ระบบอ่านแรงแท่ง M1 + Momentum ใหม่แล้วเข้า Market ทันที"
        : "กำหนดทิศทางของไม้แรก · หลังจากไม้ปิด ระบบประเมินแรงแท่งใหม่ก่อนเข้า Market รอบถัดไป")
    : (entryMode === "AUTO_MOMENTUM"
        ? "M1 / M5 / M15 / M30 / H1 วิเคราะห์ทิศทางอัตโนมัติ"
        : "บังคับทิศตามที่เลือกจนกว่าจะเปลี่ยนค่า");
  const raceCloseAllProfitEnabled = props.settings?.raceCloseAllProfitEnabled !== false;
  const raceCloseAllProfitMoney = Number(props.settings?.raceCloseAllProfitMoney || 0.5);
  const manualTrailEnabled = Number(props.settings?.profitRunTrailPercent || 0) > 0;
  const manualStopEnabled = Number(props.settings?.manualStopLossPoints || 0) > 0;
  const updateOptionalValue = (key:string,value:any) => props.onEdit?.(key,value);
  const exitLabel = controlMode === "FLIP_LOCK"
    ? "Trailing SL จากราคา MT5 โดยตรง"
    : controlMode === "RACE"
      ? (raceCloseAllProfitEnabled ? "ปิดทั้งหมดที่ +$"+raceCloseAllProfitMoney.toFixed(2) : "ระบบรักษากำไรแบบไดนามิก")
      : controlMode === "MANUAL"
        ? (profitKind === "POSITION" ? "$"+Number(props.settings.perPositionProfitMoney||0).toFixed(2)+" ต่อไม้" : "$"+Number(props.settings.basketProfitTargetMoney||0).toFixed(2)+" ทั้งชุด")
        : "ระบบรักษากำไรแบบไดนามิก";
  const slLabel = controlMode === "FLIP_LOCK"
    ? "Safety Stop ก่อน · ยก SL เมื่อ Broker ล็อกกำไรได้"
    : controlMode === "MANUAL"
      ? Number(manualSl).toFixed(0)+" points"
      : "ATR × 2.00";
  const selectedZeroLevels = Math.max(1,Math.min(30,Number(props.settings?.zeroGridLevelsPerSide)||10));
  const zeroGridLowVolatilityEnabled = props.settings?.zeroGridLowVolatilityEnabled === true;
  const appliedZeroLevels = Number(props.metrics?.zeroGridConfiguredLevelsPerSide);
  const zeroGridSettingsSynced =
    controlMode === "ZERO_GRID" &&
    String(props.metrics?.controlMode || "").toUpperCase() === "ZERO_GRID" &&
    Number.isInteger(appliedZeroLevels) &&
    appliedZeroLevels === selectedZeroLevels &&
    Number(props.metrics?.zeroGridMaxLevelsPerSide) === 30;

  return (
    <div
      id={embedded ? "bot-settings" : undefined}
      className={embedded ? "cc-bot-embedded-frame" : "cc-bot-modal-backdrop"}
      role={embedded ? "region" : "presentation"}
      onMouseDown={e=>{
        if (!embedded && e.target === e.currentTarget && !props.busy) props.onClose?.();
      }}
    >
      <div className={"cc-bot-modal cc-bot-modal-full cc-bot-v2 "+(embedded?"cc-bot-v2-embedded ":"")+"cc-bot-mode-"+controlMode.toLowerCase()+" "+(props.locked?"is-locked":"")} role={embedded?"group":"dialog"} aria-modal={embedded?undefined:true} aria-labelledby="cc-bot-modal-title">
        <div className="cc-bot-modal-head cc-bot-v2-head">
          <div className="cc-bot-modal-title">
            <span><ScenovaIcon name="bot" size={25}/></span>
            <div><small className="cc-bot-v2-kicker">SCENOVA BOT CONTROL</small><h2 id="cc-bot-modal-title">ตั้งค่าบอท</h2></div>
          </div>
          <div className="cc-bot-modal-head-actions">
            {props.locked&&<span className="cc-bot-v12-lock"><ScenovaIcon name="shield" size={12}/>กำลังทำงาน</span>}
            {embedded&&<button type="button" className="btn cc-save-primary cc-bot-v14-head-save" disabled={props.busy||props.locked||!props.dirty} onClick={props.onSave}><ScenovaIcon name="save" size={15}/>{props.busy?"กำลังบันทึก...":"บันทึกการตั้งค่า"}</button>}
            {!embedded&&<span className={"cc-bot-modal-dirty "+(props.dirty?"warn":"good")}><i/>{props.dirty?"รอบันทึก":"บันทึกแล้ว"}</span>}
            {!embedded&&<button type="button" className="cc-bot-modal-close" onClick={()=>props.onClose?.()} disabled={props.busy} aria-label="ปิดหน้าต่างตั้งค่าบอท">×</button>}
          </div>
        </div>

        <div className="cc-bot-modal-body cc-bot-v2-body">
          <div className="cc-bot-v17-contract-copy" aria-hidden="true">
            <span>AUTO Ownership · ไม่รับไม้ของโหมดอื่นมาจัดการต่อ</span>
            <span>MANUAL Ownership</span>
            <span>MT5 Local Tick · Server ไม่กำหนดราคา SL</span>
            <span>ราคา / SL / TP / Exit บริหารใน MT5 โดยตรงทุกโหมด</span>
            <span>Safety Stop → Trailing SL ขยับตามราคา MT5</span>
            <span>ไม่มีการวาง BUY STOP / SELL STOP ล่วงหน้า</span>
          </div>
          <section className="cc-bot-v2-mode-section">
            <div className="cc-bot-v2-section-title"><span>01</span><div><b>โหมดการเทรด</b></div></div>
            {embedded ? (
              <div className="cc-bot-v12-mode-select-wrap">
                <label>
                  <span><ScenovaIcon name="brain" size={17}/>โหมดการเทรด <small>Trading Mode</small></span>
                  <select className="input cc-bot-v12-mode-select" value={controlMode} disabled={props.locked} onChange={e=>applyControlMode(e.target.value)} style={{colorScheme:"dark"}}>
                    <option value="AUTO">AUTO</option>
                    <option value="RACE">RACE</option>
                    <option value="FLIP_LOCK">FLIP LOCK</option>
                    <option value="ZERO_GRID">ZERO GRID</option>
                    <option value="MANUAL">MANUAL</option>
                  </select>
                </label>

              </div>
            ) : (
              <div className="cc-bot-v2-modes" role="radiogroup" aria-label="รูปแบบการควบคุมบอท">
                {[
                  {id:"AUTO",icon:"brain",tag:"AUTO + VECTOR"},
                  {id:"FLIP_LOCK",icon:"trend",tag:"ล็อกกำไร + สลับฝั่ง"},
                  {id:"RACE",icon:"status",tag:"ดำเนินการเร็ว"},
                  {id:"ZERO_GRID",icon:"layers",tag:"กริดแบบ Hedging"},
                  {id:"MANUAL",icon:"settings",tag:"กำหนดรายละเอียด"}
                ].map(mode=><button key={mode.id} type="button" role="radio" aria-checked={controlMode===mode.id} className={controlMode===mode.id?"active":""} onClick={()=>applyControlMode(mode.id)}>
                  <span className="cc-bot-v2-mode-icon"><ScenovaIcon name={mode.icon} size={22}/></span>
                  <span><em>{mode.tag}</em><b>{modeCopy[mode.id].title}</b><small>{modeCopy[mode.id].subtitle}</small></span>
                  <i className="cc-bot-v2-radio"/>
                </button>)}
              </div>
            )}
          </section>

          <div className="cc-bot-v2-workspace">
            <main className="cc-bot-v2-main">
              <section className="cc-bot-v2-panel">
                <div className="cc-bot-v2-section-title compact"><span>02</span><div><b>การเปิดออเดอร์</b></div></div>
                {controlMode==="ZERO_GRID"&&<div className="cc-bot-v2-field cc-bot-v2-toggle-row">
                  <span><ScenovaIcon name="layers" size={17}/>กริดตลาดความผันผวนต่ำ</span>
                  <div className="cc-bot-v2-control-cell"><SwitchSetting checked={zeroGridLowVolatilityEnabled} onChange={(value:boolean)=>props.onEdit?.("zeroGridLowVolatilityEnabled",value)} onLabel="เปิด" offLabel="ปิด"/></div>
                </div>}
                <div className="cc-bot-v2-fields">
                  {controlMode==="ZERO_GRID" ? <>
                    {zeroGridLowVolatilityEnabled
                      ? <div className="cc-bot-v2-field"><span><ScenovaIcon name="layers" size={17}/>ระยะห่างกริด</span><div className="cc-bot-v2-readonly-control"><b>0.30</b></div></div>
                      : <label className="cc-bot-v2-field"><span><ScenovaIcon name="layers" size={17}/>ระยะห่างกริด</span><select className="input" value={String(Number(props.settings.zeroGridStepPrice) === 2 ? 2 : 3)} onChange={e=>props.onEdit?.("zeroGridStepPrice",e.target.value)}><option value="2">2.00</option><option value="3">3.00</option></select></label>}
                    <label className="cc-bot-v2-field"><span><ScenovaIcon name="layers" size={17}/>จำนวนคำสั่งรอต่อฝั่ง</span><select className="input" value={String(Math.max(1,Math.min(30,Number(props.settings.zeroGridLevelsPerSide)||10)))} onChange={e=>props.onEdit?.("zeroGridLevelsPerSide",Number(e.target.value))}>{Array.from({length:30},(_,i)=>i+1).map(value=><option key={value} value={value}>{value} ระดับต่อฝั่ง</option>)}</select></label>
                    <label className="cc-bot-v2-field"><span><ScenovaIcon name="lot" size={17}/>{zeroGridLowVolatilityEnabled?"Lot คงที่ต่อระดับ":"Lot เริ่มต้น"}</span><NumberInput value={props.settings.zeroGridBaseLot || 0.01} suffix="Lot" onCommit={(v:string)=>props.onEdit?.("zeroGridBaseLot",v)}/></label>
                    <label className="cc-bot-v2-field"><span><ScenovaIcon name="profit" size={17}/>เป้ากำไรสุทธิขั้นต่ำ</span><MoneyInput value={props.settings.zeroGridMinNetProfitMoney || 0.5} suffix="เงินบัญชี" onCommit={(v:string)=>props.onEdit?.("zeroGridMinNetProfitMoney",v)}/></label>
                    <label className="cc-bot-v2-field"><span><ScenovaIcon name="shield" size={17}/>เงินสำรองสำหรับค่าปิด</span><MoneyInput value={props.settings.zeroGridCloseReserveMoney || 0.2} suffix="เงินบัญชี" onCommit={(v:string)=>props.onEdit?.("zeroGridCloseReserveMoney",v)}/></label>
                  </> : <>
                    <label className="cc-bot-v2-field"><span><ScenovaIcon name="trend" size={17}/>ทิศทาง</span><select className="input" value={entryMode} onChange={e=>props.onEdit?.("entryMode",e.target.value)}><option value="AUTO_MOMENTUM">อัตโนมัติ</option><option value="BUY_ONLY">BUY</option><option value="SELL_ONLY">SELL</option></select></label>
                    {controlMode!=="FLIP_LOCK"&&<label className="cc-bot-v2-field"><span><ScenovaIcon name="layers" size={17}/>จำนวนไม้สูงสุด</span><select className="input" value={String(activeMaxPositions)} onChange={e=>editModeSizing("max",e.target.value)}>{[1,2,3,4,5,6,7,8,9,10,12,15,20,25,30,50,75,100].map(v=><option key={v} value={v}>{v} ไม้</option>)}</select></label>}
                    <label className="cc-bot-v2-field"><span><ScenovaIcon name="lot" size={17}/>Lot ต่อไม้</span><select className="input" value={String(activeLot)} onChange={e=>editModeSizing("lot",e.target.value)}>{[0.01,0.02,0.03,0.05,0.1,0.2,0.3,0.5,1].map(v=><option key={v} value={v}>{Number(v).toFixed(2)} Lot</option>)}</select></label>
                  </>}
                </div>
                <div className="cc-bot-v17-hidden-engine">{controlMode!=="ZERO_GRID"&&(controlMode==="FLIP_LOCK"
                  ? <div className="cc-bot-v2-engine-line"><ScenovaIcon name="trend" size={16}/><b>โครงสร้าง FLIP LOCK</b><span>1 Position เท่านั้น · ไม่มี Pending BUY/SELL STOP ล่วงหน้า · SL อ่านราคา MT5 โดยตรงและเริ่มล็อกกำไรทันทีที่ Broker อนุญาต · Server ควบคุมเฉพาะ Start/Stop/Settings</span></div>
                  : controlMode==="AUTO"
                    ? <div className="cc-bot-v2-engine-line"><ScenovaIcon name="spark" size={16}/><b>AUTO Ownership</b><span>Vector Edge / V20 จัดการเฉพาะ Position ที่ติดแท็ก AUTO เท่านั้น · ไม่รับไม้ของโหมดอื่นมาจัดการต่อ</span></div>
                    : controlMode==="MANUAL"
                      ? <div className="cc-bot-v2-engine-line"><ScenovaIcon name="settings" size={16}/><b>MANUAL Ownership</b><span>ใช้เป้ากำไร / Stop / จำนวนไม้ของ MANUAL เอง · AUTO V20 จะไม่เข้ามาปิดหรือกลับทิศ Position นี้</span></div>
                      : <div className="cc-bot-v2-engine-line"><ScenovaIcon name="spark" size={16}/><b>การเพิ่มสถานะอัตโนมัติ</b><span>EA กระจายจังหวะเพิ่มสถานะตาม ATR และแรงเคลื่อนไหวของตลาด</span></div>)}</div>
              </section>

              {(controlMode==="RACE"||controlMode==="MANUAL")&&(
              <section className="cc-bot-v2-panel">
                <div className="cc-bot-v2-section-title compact"><span>03</span><div><b>กำไร / Stop Loss</b></div></div>
                {controlMode==="RACE" ? <div className="cc-bot-v2-fields exit-fields">
                  <div className="cc-bot-v2-field">
                    <span><ScenovaIcon name="profit" size={17}/>ปิดไม้ทั้งหมดที่กำไร</span>
                    <div className="cc-bot-v2-inline-toggle-value">
                      <SwitchSetting checked={raceCloseAllProfitEnabled} onChange={(value:boolean)=>props.onEdit?.("raceCloseAllProfitEnabled",value)} onLabel="เปิด" offLabel="ปิด"/>
                      <MoneyInput value={raceCloseAllProfitMoney} disabled={!raceCloseAllProfitEnabled} suffix="เงินบัญชี" onCommit={(v:string)=>props.onEdit?.("raceCloseAllProfitMoney",v)}/>
                    </div>
                  </div>
                </div> : <div className="cc-bot-v2-fields exit-fields">
                  <div className="cc-bot-v2-field cc-bot-profit-kind-field">
                    <span><ScenovaIcon name="profit" size={17}/>รูปแบบกำไร</span>
                    <div className="cc-bot-v2-choice-row cc-bot-v2-choice-inline">
                      <button type="button" className={profitKind==="BASKET"?"active":""} onClick={()=>{props.onEdit?.("basketProfitTargetMoney",Number(props.settings.basketProfitTargetMoney||10));props.onEdit?.("perPositionProfitMoney",0)}}><ScenovaIcon name="profit" size={16}/><span><b>ทั้งชุด</b></span></button>
                      <button type="button" className={profitKind==="POSITION"?"active":""} onClick={()=>{props.onEdit?.("perPositionProfitMoney",Number(props.settings.perPositionProfitMoney||2));props.onEdit?.("basketProfitTargetMoney",0)}}><ScenovaIcon name="orders" size={16}/><span><b>ต่อไม้</b></span></button>
                    </div>
                  </div>
                  <label className="cc-bot-v2-field"><span><ScenovaIcon name="profit" size={17}/>{profitKind==="BASKET"?"เป้ากำไรทั้งชุด":"เป้ากำไรต่อไม้"}</span><MoneyInput value={profitKind==="BASKET"?props.settings.basketProfitTargetMoney:props.settings.perPositionProfitMoney} suffix="USD" onCommit={(v:string)=>props.onEdit?.(profitKind==="BASKET"?"basketProfitTargetMoney":"perPositionProfitMoney",v)}/></label>
                  {profitKind==="BASKET"&&<label className="cc-bot-v2-field"><span><ScenovaIcon name="trend" size={17}/>ยอมให้กำไรย่อตัว</span><select className="input" value={String(props.settings.profitRunTrailPercent||0)} onChange={e=>updateOptionalValue("profitRunTrailPercent",e.target.value)}><option value="0">ปิด</option>{[5,10,15,20,25,30,40,50].map(v=><option key={v} value={v}>{v}%</option>)}</select></label>}
                  <div className="cc-bot-v2-field">
                    <span><ScenovaIcon name="shield" size={17}/>Stop Loss</span>
                    <ToggleNumberField alwaysShowInput label="เปิด" defaultValue={suggestedManualSl} value={props.settings.manualStopLossPoints} suffix="points" onChange={(v:string)=>updateOptionalValue("manualStopLossPoints",v)}/>
                  </div>
                </div>}
              </section>
              )}

              {controlMode!=="ZERO_GRID"&&(
              <section className="cc-bot-v2-panel">
                <div className="cc-bot-v2-section-title compact"><span>04</span><div><b>Risk Controls</b></div></div>
                <div className="cc-bot-v2-limit-grid">
                  {(controlMode!=="MANUAL" || riskValue(riskProfile.basket,"maxBasketLossMoney")>0 || revealedManualRisk[riskProfile.basket])&&<div><div><ScenovaIcon name="risk" size={18}/><span><b>ขาดทุนสูงสุดต่อรอบ</b></span></div><ToggleMoneyField alwaysShowInput label="เปิด" defaultValue="10" value={riskValue(riskProfile.basket,"maxBasketLossMoney")} suffix="USD" onChange={(v:string)=>updateRiskValue(riskProfile.basket,"maxBasketLossMoney",v)}/></div>}
                  {(controlMode!=="MANUAL" || riskValue(riskProfile.dailyLoss,"dailyLossMoney")>0 || revealedManualRisk[riskProfile.dailyLoss])&&<div><div><ScenovaIcon name="pnl" size={18}/><span><b>ขาดทุนสูงสุดต่อวัน</b></span></div><ToggleMoneyField alwaysShowInput label="เปิด" defaultValue="25" value={riskValue(riskProfile.dailyLoss,"dailyLossMoney")} suffix="USD" onChange={(v:string)=>updateRiskValue(riskProfile.dailyLoss,"dailyLossMoney",v)}/></div>}
                  {(controlMode!=="MANUAL" || riskValue(riskProfile.dailyProfit,"dailyProfitTargetMoney")>0 || revealedManualRisk[riskProfile.dailyProfit])&&<div><div><ScenovaIcon name="target" size={18}/><span><b>เป้ากำไรต่อวัน</b></span></div><ToggleMoneyField alwaysShowInput label="เปิด" defaultValue="10" value={riskValue(riskProfile.dailyProfit,"dailyProfitTargetMoney")} suffix="USD" onChange={(v:string)=>updateRiskValue(riskProfile.dailyProfit,"dailyProfitTargetMoney",v)}/></div>}
                  {controlMode==="MANUAL"&&(
                    (riskValue(riskProfile.basket,"maxBasketLossMoney")<=0&&!revealedManualRisk[riskProfile.basket]) ||
                    (riskValue(riskProfile.dailyLoss,"dailyLossMoney")<=0&&!revealedManualRisk[riskProfile.dailyLoss]) ||
                    (riskValue(riskProfile.dailyProfit,"dailyProfitTargetMoney")<=0&&!revealedManualRisk[riskProfile.dailyProfit])
                  )&&<div className="cc-bot-v2-field cc-bot-manual-risk-add"><span><ScenovaIcon name="settings" size={16}/>การตั้งค่าเพิ่มเติม</span><button type="button" className="cc-bot-manual-risk-add-all" onClick={()=>setRevealedManualRisk(previous=>({...previous,[riskProfile.basket]:true,[riskProfile.dailyLoss]:true,[riskProfile.dailyProfit]:true}))}><ScenovaIcon name="plus" size={14}/>แสดงทั้งหมด</button></div>}
                </div>
              </section>
              )}
            </main>

            <aside className="cc-bot-v2-summary">
              <div className="cc-bot-v2-summary-head"><span><ScenovaIcon name="status" size={19}/></span><div><small>แผนที่จะบันทึก</small><b>{modeCopy[controlMode].title}</b></div><i/></div>
              {controlMode==="ZERO_GRID" ? <dl>
                <div><dt>คู่เทรด</dt><dd>{props.symbol || "—"}</dd></div>
                <div><dt>รูปแบบกริด</dt><dd>{zeroGridLowVolatilityEnabled?"ตลาดความผันผวนต่ำ":"กริดมาตรฐาน"}</dd></div>
                <div><dt>คำสั่งรอ</dt><dd>{Math.max(1,Math.min(30,Number(props.settings.zeroGridLevelsPerSide)||10))} BUY + {Math.max(1,Math.min(30,Number(props.settings.zeroGridLevelsPerSide)||10))} SELL</dd></div>
                <div><dt>ระยะห่างกริด</dt><dd>{zeroGridLowVolatilityEnabled?"0.30":(Number(props.settings.zeroGridStepPrice) === 2 ? "2.00" : "3.00")}</dd></div>
                <div><dt>{zeroGridLowVolatilityEnabled?"Lot คงที่":"Lot เริ่มต้น"}</dt><dd>{Number(props.settings.zeroGridBaseLot||0.01).toFixed(2)} Lot</dd></div>
                <div><dt>เป้ากำไรสุทธิขั้นต่ำ</dt><dd>${Number(props.settings.zeroGridMinNetProfitMoney||0.5).toFixed(2)}</dd></div>
                <div><dt>เงินสำรองสำหรับค่าปิด</dt><dd>${Number(props.settings.zeroGridCloseReserveMoney||0.2).toFixed(2)}</dd></div>
              </dl> : (
              <dl>
                <div><dt>Symbol</dt><dd>{props.symbol || "—"}</dd></div>
                <div><dt>ทิศทาง</dt><dd>{directionLabel}</dd></div>
                <div><dt>การเปิดไม้</dt><dd>{controlMode==="FLIP_LOCK" ? "1 Position · "+activeLot.toFixed(2)+" Lot" : activeMaxPositions+" × "+activeLot.toFixed(2)+" Lot"}</dd></div>
                <div><dt>เป้ากำไร</dt><dd>{exitLabel}</dd></div>
                <div><dt>Stop Loss</dt><dd>{slLabel}</dd></div>
                <div><dt>EA Sync</dt><dd className="good">{props.syncLabel || "พร้อมส่งค่า"}</dd></div>
              </dl>
              )}
              {controlMode!=="ZERO_GRID"&&<div className="cc-bot-v2-summary-note"><ScenovaIcon name="brain" size={17}/><span><b>การวิเคราะห์ 5 กรอบเวลา</b><small>แนวรับ–แนวต้าน · Order Block · Fibonacci · Momentum</small></span></div>}
            </aside>
          </div>
        </div>

        {!embedded&&<div className="cc-bot-modal-footer cc-bot-v2-footer">
          <div/>
          <div><button type="button" className="btn" onClick={()=>props.onClose?.()} disabled={props.busy}>ยกเลิก</button><button type="button" className="btn cc-save-primary" disabled={props.busy||!props.dirty} onClick={props.onSave}><ScenovaIcon name="save" size={17}/>{props.busy?"กำลังบันทึก...":"บันทึกการตั้งค่า"}</button></div>
        </div>}
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
  const showInput = enabled || Boolean(props.alwaysShowInput);

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
      {showInput ? (
        <NumberInput
          value={selectedValue}
          disabled={!enabled || Boolean(props.disabled)}
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
  const showInput = enabled || Boolean(props.alwaysShowInput);

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
      {showInput ? (
        <MoneyInput
          value={selectedValue}
          disabled={!enabled || Boolean(props.disabled)}
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
