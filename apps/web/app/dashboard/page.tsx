"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { API_URL, api, getToken } from "../../lib/api";
import { CustomerMobileNav, CustomerSidebar, OwnerMobileNav, OwnerSidebar } from "../../components/OwnerSidebar";
import { ScenovaIcon } from "../../components/ScenovaIcon";
import { ScenovaBrand } from "../../components/ScenovaBrand";
import { Mt5ConnectionExperience, VpsMigrationProgressCard } from "../../components/Mt5ConnectionExperience";
import { EaDecisionCenter } from "../../components/EaDecisionCenter";
import { BotPerformanceSummary } from "../../components/BotPerformanceSummary";
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
  cloudUpdate: any;
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

type CloudCatalog = {
  packages: Array<{ months:number; price_satang:number; enabled:boolean; updated_at?:string }>;
  addonPackages: Array<{ months:number; price_satang:number; enabled:boolean; updated_at?:string }>;
  available: number;
  provisioningPaused: boolean;
  salesPaused: boolean;
  paymentMode: string;
  paymentAccounts?: Array<{
    id:number;
    bankCode:string;
    bankName?:string;
    bankShortCode?:string;
    bankNumber:string;
    nameTh:string;
    nameEn:string;
    type:string;
  }>;
  checkoutEnabled: boolean;
};

type CloudOrder = {
  id:string;
  months:number;
  amount:number;
  original_amount?:number|null;
  discount_amount?:number|null;
  promotion_code?:string|null;
  status:string;
  qr_url?:string|null;
  expires_at?:string|null;
  created_at:string;
  paid_at?:string|null;
  slot_id?:string|null;
  subscription_expires_at?:string|null;
  account_number?:string|null;
  purchase_type?:string|null;
  slot_type?:string|null;
};

type View = "overview" | "account" | "backtest";
const LIVE_PRICE_WINDOW_MS = 15 * 60 * 1000;
const TRADING_SYMBOL_PATTERN = /^[A-Za-z0-9._#-]+$/;

function normalizeAccountCurrency(value: unknown) {
  const currency = String(value || "").trim().toUpperCase();
  return currency || "USD";
}

function formatAccountMoney(value: unknown, currency: unknown, signed = false) {
  const amount = Number(value || 0);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const prefix = signed && safeAmount > 0 ? "+" : "";
  return prefix + safeAmount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + " " + normalizeAccountCurrency(currency);
}
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
  // Per-mode risk profiles. standard* remains only for backward compatibility.
  standardMaxBasketLossMoney: 10,
  standardDailyLossMoney: 25,
  standardDailyProfitTargetMoney: 0,
  autoMaxBasketLossMoney: 10,
  autoDailyLossMoney: 25,
  autoDailyProfitTargetMoney: 0,
  raceMaxBasketLossMoney: 10,
  raceDailyLossMoney: 25,
  raceDailyProfitTargetMoney: 0,
  flipLockMaxBasketLossMoney: 10,
  flipLockDailyLossMoney: 25,
  flipLockDailyProfitTargetMoney: 0,
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
  // Profit targets are remembered independently by mode.
  autoProfitTargetMoney: 0,
  manualBasketProfitTargetMoney: 0,
  manualPerPositionProfitMoney: 0,
  // Legacy/runtime mirror populated from the active mode on save.
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
  raceProfitTargetMode: "BASKET",
  raceCloseAllProfitMoney: 0.5,
  racePerPositionProfitMoney: 0.5,
  zeroGridStepPrice: 3,
  zeroGridLowVolatilityEnabled: false,
  zeroGridLevelsPerSide: 10,
  zeroGridBaseLot: 0.01,
  zeroGridMinNetProfitMoney: 0.5,
  zeroGridCloseReserveMoney: 0,
  entryMode: "AUTO_MOMENTUM"
};

export default function DashboardPage() {
  const { showPopup, confirmPopup } = useSystemPopup();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const botCommandLockRef = useRef(false);
  const [botCommandLocked, setBotCommandLocked] = useState(false);
  const [checkingVersion, setCheckingVersion] = useState(false);
  const statusDialogRef = useRef<HTMLDialogElement | null>(null);
  const symbolDialogRef = useRef<HTMLDialogElement | null>(null);
  const ownerVpsDialogRef = useRef<HTMLDialogElement | null>(null);
  const cloudMt5DialogRef = useRef<HTMLDialogElement | null>(null);
  const vpsSlotDialogRef = useRef<HTMLDialogElement | null>(null);
  const [cloudCatalog, setCloudCatalog] = useState<CloudCatalog | null>(null);
  const [cloudOrders, setCloudOrders] = useState<CloudOrder[]>([]);
  const [vpsPurchaseMonths, setVpsPurchaseMonths] = useState(1);
  const [vpsRenewSlotId, setVpsRenewSlotId] = useState("");
  const [vpsPaymentOrderId, setVpsPaymentOrderId] = useState("");
  const [vpsPurchaseBusy, setVpsPurchaseBusy] = useState(false);
  const [ownerAddonPriceEditorOpen, setOwnerAddonPriceEditorOpen] = useState(false);
  const [ownerAddonPrices, setOwnerAddonPrices] = useState<Record<number,{priceBaht:string;enabled:boolean}>>({
    1:{priceBaht:"",enabled:false},
    3:{priceBaht:"",enabled:false},
    6:{priceBaht:"",enabled:false},
    12:{priceBaht:"",enabled:false}
  });
  const [vpsSlipFile, setVpsSlipFile] = useState<File | null>(null);
  const [vpsSlipPreview, setVpsSlipPreview] = useState("");
  const [ownerVpsPassword, setOwnerVpsPassword] = useState("");
  const [ownerVpsBusy, setOwnerVpsBusy] = useState(false);
  const [vpsMigrationProgress, setVpsMigrationProgress] = useState<any>(null);
  const [dismissedCloudUpdateKey, setDismissedCloudUpdateKey] = useState("");
  const [tradingSymbol, setTradingSymbol] = useState("");
  const [symbolBusy, setSymbolBusy] = useState(false);
  const [serverOperation, setServerOperation] = useState<any>(null);
  const [serverOperationMinimized, setServerOperationMinimized] = useState(false);
  const [activeView, setActiveView] = useState<View>("overview");
  const [accessClockNow, setAccessClockNow] = useState(()=>Date.now());
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const selectedSlotIdRef = useRef("");
  const connectionWasOnlineRef = useRef<Record<string,boolean>>({});
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
  const [cloudMt5DialogMode, setCloudMt5DialogMode] = useState<"NEW"|"RECONNECT">("NEW");
  const [cloudMt5DialogAccountId, setCloudMt5DialogAccountId] = useState("");
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

  async function loadVpsCommerce() {
    const [catalog, orders] = await Promise.all([
      api("/cloud/catalog"),
      api("/cloud/orders")
    ]);
    setCloudCatalog(catalog || null);
    setCloudOrders(Array.isArray(orders) ? orders : []);
    return { catalog, orders: Array.isArray(orders) ? orders : [] };
  }

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
        } else if (loadedControlMode === "AUTO") {
          if (storedSettings.autoMaxBasketLossMoney === undefined) nextSettings.autoMaxBasketLossMoney = Number(storedSettings.standardMaxBasketLossMoney ?? legacyMaxBasketLoss);
          if (storedSettings.autoDailyLossMoney === undefined) nextSettings.autoDailyLossMoney = Number(storedSettings.standardDailyLossMoney ?? legacyDailyLoss);
          if (storedSettings.autoDailyProfitTargetMoney === undefined) nextSettings.autoDailyProfitTargetMoney = Number(storedSettings.standardDailyProfitTargetMoney ?? legacyDailyProfit);
        } else if (loadedControlMode === "RACE") {
          if (storedSettings.raceMaxBasketLossMoney === undefined) nextSettings.raceMaxBasketLossMoney = Number(storedSettings.standardMaxBasketLossMoney ?? legacyMaxBasketLoss);
          if (storedSettings.raceDailyLossMoney === undefined) nextSettings.raceDailyLossMoney = Number(storedSettings.standardDailyLossMoney ?? legacyDailyLoss);
          if (storedSettings.raceDailyProfitTargetMoney === undefined) nextSettings.raceDailyProfitTargetMoney = Number(storedSettings.standardDailyProfitTargetMoney ?? legacyDailyProfit);
        } else if (loadedControlMode === "FLIP_LOCK") {
          if (storedSettings.flipLockMaxBasketLossMoney === undefined) nextSettings.flipLockMaxBasketLossMoney = Number(storedSettings.standardMaxBasketLossMoney ?? legacyMaxBasketLoss);
          if (storedSettings.flipLockDailyLossMoney === undefined) nextSettings.flipLockDailyLossMoney = Number(storedSettings.standardDailyLossMoney ?? legacyDailyLoss);
          if (storedSettings.flipLockDailyProfitTargetMoney === undefined) nextSettings.flipLockDailyProfitTargetMoney = Number(storedSettings.standardDailyProfitTargetMoney ?? legacyDailyProfit);
        }
        if (loadedControlMode === "ZERO_GRID") {
          nextSettings.zeroGridStepPrice = Number(nextSettings.zeroGridStepPrice) === 2 ? 2 : 3;
          if (typeof nextSettings.zeroGridLowVolatilityEnabled !== "boolean") nextSettings.zeroGridLowVolatilityEnabled = false;
          nextSettings.zeroGridLevelsPerSide = Math.max(1, Math.min(30, Number(nextSettings.zeroGridLevelsPerSide) || 10));
          if (!Number.isFinite(Number(nextSettings.zeroGridBaseLot)) || Number(nextSettings.zeroGridBaseLot) <= 0) nextSettings.zeroGridBaseLot = 0.01;
          if (!Number.isFinite(Number(nextSettings.zeroGridMinNetProfitMoney)) || Number(nextSettings.zeroGridMinNetProfitMoney) <= 0.01) nextSettings.zeroGridMinNetProfitMoney = 0.5;
          nextSettings.zeroGridCloseReserveMoney = 0;
        }
        if (loadedControlMode === "RACE") {
          const raceProfitMode = String(nextSettings.raceProfitTargetMode || "").toUpperCase();
          nextSettings.raceProfitTargetMode = ["BASKET","POSITION","OFF"].includes(raceProfitMode)
            ? raceProfitMode
            : (nextSettings.raceCloseAllProfitEnabled === false ? "OFF" : "BASKET");
          nextSettings.raceCloseAllProfitEnabled = nextSettings.raceProfitTargetMode === "BASKET";
          if (!Number.isFinite(Number(nextSettings.raceCloseAllProfitMoney)) || Number(nextSettings.raceCloseAllProfitMoney) <= 0) nextSettings.raceCloseAllProfitMoney = 0.5;
          if (!Number.isFinite(Number(nextSettings.racePerPositionProfitMoney)) || Number(nextSettings.racePerPositionProfitMoney) <= 0) nextSettings.racePerPositionProfitMoney = 0.5;
        }

        // One-time migration from the old shared target. Only the currently
        // active legacy mode receives it; other mode targets remain independent.
        const legacyProfitMode = String(storedSettings.profitTargetMode || "").toUpperCase();
        const legacyBasketProfit = Math.max(0, Number(storedSettings.basketProfitTargetMoney || 0));
        const legacyPerPositionProfit = Math.max(0, Number(storedSettings.perPositionProfitMoney || 0));
        if (storedSettings.autoProfitTargetMoney === undefined) {
          nextSettings.autoProfitTargetMoney =
            loadedControlMode === "AUTO" && legacyProfitMode === "AUTO" ? legacyBasketProfit : 0;
        }
        if (storedSettings.manualBasketProfitTargetMoney === undefined) {
          nextSettings.manualBasketProfitTargetMoney =
            loadedControlMode === "MANUAL" && legacyProfitMode === "MANUAL" ? legacyBasketProfit : 0;
        }
        if (storedSettings.manualPerPositionProfitMoney === undefined) {
          nextSettings.manualPerPositionProfitMoney =
            loadedControlMode === "MANUAL" && legacyProfitMode === "MANUAL" ? legacyPerPositionProfit : 0;
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
    void loadVpsCommerce().catch(()=>{});
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible" || dashboardLoadInFlightRef.current) return;
      void load(undefined, true);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!vpsSlipFile) {
      setVpsSlipPreview("");
      return;
    }
    const url = URL.createObjectURL(vpsSlipFile);
    setVpsSlipPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [vpsSlipFile]);

  useEffect(() => {
    if (!selectedSlotId) return;

    let stopped = false;
    let controller: AbortController | null = null;
    let reconnectTimer: number | null = null;
    let reloadTimer: number | null = null;

    const scheduleRealtimeReload = () => {
      if (reloadTimer !== null) window.clearTimeout(reloadTimer);
      reloadTimer = window.setTimeout(() => {
        if (!stopped && document.visibilityState === "visible") {
          void load(selectedSlotIdRef.current, true);
        }
      }, 250);
    };

    const connect = async () => {
      controller = new AbortController();
      try {
        const token = getToken();
        if (!token) return;

        const query = new URLSearchParams({ slotId: selectedSlotId });
        const response = await fetch(
          API_URL + "/api/realtime/events?" + query.toString(),
          {
            method:"GET",
            headers:{
              "Accept":"text/event-stream",
              "Authorization":"Bearer " + token
            },
            signal:controller.signal,
            cache:"no-store"
          }
        );
        if (!response.ok || !response.body) {
          throw new Error("realtime stream unavailable");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!stopped) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream:true });
          buffer = buffer.replace(/\r\n/g, "\n");

          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0) {
            const frame = buffer.slice(0, boundary).replace(/\r/g, "");
            buffer = buffer.slice(boundary + 2);

            const dataLines = frame
              .split("\n")
              .filter(line => line.startsWith("data:"))
              .map(line => line.slice(5).trim());
            if (dataLines.length) {
              try {
                const event = JSON.parse(dataLines.join("\n"));
                if (event?.eventType) {
                  setData((previous:any) => {
                    if (!previous?.instance || String(event.slotId || "") !== String(selectedSlotIdRef.current || "")) {
                      return previous;
                    }
                    return {
                      ...previous,
                      instance:{
                        ...previous.instance,
                        ...(event.state ? { actual_state:event.state } : {}),
                        metrics:{
                          ...(previous.instance.metrics || {}),
                          ...(event.metrics || {})
                        }
                      }
                    };
                  });
                  scheduleRealtimeReload();
                }
              } catch {
                // Ignore malformed/keepalive SSE frames. The 5s poll remains fallback.
              }
            }

            boundary = buffer.indexOf("\n\n");
          }
        }
      } catch {
        // SSE is an acceleration layer only. Existing polling remains the
        // recovery path if the stream or proxy is temporarily unavailable.
      } finally {
        if (!stopped) {
          reconnectTimer = window.setTimeout(() => void connect(), 1500);
        }
      }
    };

    void connect();
    return () => {
      stopped = true;
      controller?.abort();
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (reloadTimer !== null) window.clearTimeout(reloadTimer);
    };
  }, [selectedSlotId]);

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
  const accountCurrency = normalizeAccountCurrency(metrics.currency);
  const marketWatchSymbols = Array.isArray(metrics.marketWatchSymbols)
    ? Array.from(new Map(
        metrics.marketWatchSymbols
          .map((item:any)=>String(item || "").trim())
          .filter((item:string)=>item && TRADING_SYMBOL_PATTERN.test(item))
          .map((item:string)=>[item.toUpperCase(),item])
      ).values()) as string[]
    : [];
  const desiredTradingSymbol = String(
    data?.settings?.startupSymbol ||
    metrics.requestedStartupSymbol ||
    metrics.symbol ||
    settings.symbol ||
    ""
  ).trim();
  // Only symbols reported by the connected MT5 Market Watch are selectable.
  // Never inject guessed canonical names such as BTCUSD/XAUUSD into the picker.
  const tradingSymbolOptions = marketWatchSymbols;
  const tradingSymbolLabel = (symbol:string) => {
    const upper = String(symbol || "").toUpperCase();
    if (upper.includes("BTC") || upper.includes("XBT")) return "Bitcoin · " + symbol;
    if (upper.startsWith("XAU")) return "Gold · " + symbol;
    if (upper.includes("ETH")) return "Ethereum · " + symbol;
    return symbol;
  };

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
      "Floating " + formatAccountMoney(m.basketProfit, m.currency || metrics.currency, true) +
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
      "Daily P/L " + formatAccountMoney(m.dailyProfit, m.currency || metrics.currency, true) +
      (Number(m.dailyProfitTarget || settings.dailyProfitTargetMoney || 0) > 0
        ? " / Target " + formatAccountMoney(m.dailyProfitTarget || settings.dailyProfitTargetMoney, m.currency || metrics.currency)
        : ""),
      Number(m.dailyProfitGivebackFloor || 0) > 0
        ? "Giveback floor " + formatAccountMoney(m.dailyProfitGivebackFloor, m.currency || metrics.currency) +
          " · " + Number(m.dailyProfitDrawdownPercent || settings.dailyProfitDrawdownPercent || 0).toFixed(0) + "%"
        : (Number(settings.maxBasketLossMoney || 0) > 0
            ? "Max Basket Loss " + formatAccountMoney(settings.maxBasketLossMoney, m.currency || metrics.currency)
            : "Risk guard active")
    );

    if (Number(m.profitRunTrailPercent || settings.profitRunTrailPercent || 0) > 0) {
      add(
        heartbeatTime,
        "TRAIL",
        "RISK",
        "Basket Run-On · ย่อ " + Number(m.profitRunTrailPercent || settings.profitRunTrailPercent).toFixed(0) + "%",
        "Peak " + formatAccountMoney(m.profitRunPeak, m.currency || metrics.currency, true) +
        " · Basket cycle " + formatAccountMoney(m.basketCycleProfit || m.basketProfit, m.currency || metrics.currency, true)
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
  const isHeartbeatDelayed =
    !isMt5Online &&
    isAgentOnline &&
    eaLastSeenAgeSeconds >= 0 &&
    eaLastSeenAgeSeconds <= 60;
  const connectionAgeLabel = eaLastSeenAgeSeconds >= 0
    ? Math.max(0, eaLastSeenAgeSeconds).toFixed(0) + "s"
    : "—";
  const showLastKnownTelemetry = isMt5Online || isHeartbeatDelayed;
  const marketSessionState = String(metrics.marketSessionState || "").toUpperCase();
  const marketSessionClosed =
    marketSessionState === "CLOSED" ||
    String(metrics.executionStatus || "").toUpperCase() === "MARKET_CLOSED";
  const heartbeatLatencyMs = Number(metrics.heartbeatLatencyMs ?? 0);
  const brokerPingMs = Math.max(0, Number(metrics.brokerPingMs ?? 0));
  const runtimeModeLabel = String(data?.selectedSlot?.mode || "").toUpperCase() === "CLOUD" ? "VPS" : "LOCAL";
  const runtimeLocationLabel = runtimeModeLabel === "VPS"
    ? String(data?.instance?.runner_region || data?.instance?.runner_id || "VPS").trim()
    : "LOCAL DEVICE";
  const heartbeatHttpStatus = Number(metrics.heartbeatHttpStatus ?? 0);
  const lastServerContactEpoch = Number(metrics.lastServerContactAt || 0);
  const lastServerContactLabel = lastServerContactEpoch > 0
    ? new Date(lastServerContactEpoch * 1000).toLocaleString("th-TH", {hour12:false})
    : "—";
  const entitlement = data?.entitlement;

  useEffect(() => {
    if (!entitlement?.expiresAt) return;
    setAccessClockNow(Date.now());
    const timer = window.setInterval(() => setAccessClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [entitlement?.expiresAt]);

  const cloudMigrationTarget = (data?.slots || []).find((slot:any) =>
    String(slot?.mode || "").toUpperCase() === "CLOUD" &&
    Boolean(slot?.subscription_active) &&
    Boolean(slot?.can_control) &&
    !slot?.instance_id &&
    ["ACTIVE","AVAILABLE"].includes(String(slot?.status || "").toUpperCase())
  ) || null;
  const customerHasCloudMigrationAccess = Boolean(cloudMigrationTarget);
  const serverLiveStatus = data?.liveStatus || {
    code: isMt5Online ? "RUNNING_READY" : "MT5_OFFLINE",
    label: isMt5Online ? "กำลังตรวจสอบสถานะบอท" : "MT5 ยังไม่เชื่อมต่อ",
    detail: isMt5Online ? "รอข้อมูล Execution จาก EA" : "เปิด MT5 และ EA บนกราฟ",
    tone: isMt5Online ? "neutral" : "bad",
    tradeReady: false
  };
  const liveStatus = isHeartbeatDelayed
    ? {
        ...serverLiveStatus,
        code: "EA_HEARTBEAT_DELAYED",
        label: "EA Heartbeat ขาดช่วง",
        detail: "Windows Agent ยังเชื่อมอยู่ · Heartbeat ล่าสุด " + connectionAgeLabel,
        tone: "warn"
      }
    : serverLiveStatus;
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
  const cloudUpdate = data?.selectedSlot?.mode === "CLOUD" ? data?.cloudUpdate : null;
  const cloudUpdateState = String(cloudUpdate?.state || "");
  const cloudUpdateStageKey = cloudUpdate
    ? [String(cloudUpdate.created_at || ""),String(cloudUpdate.target_version || ""),cloudUpdateState].join("|")
    : "";
  const cloudUpdateVisible =
    Boolean(cloudUpdate) &&
    cloudUpdateState !== "COMPLETED" &&
    cloudUpdateStageKey !== dismissedCloudUpdateKey;
  const cloudUpdateLabel =
    cloudUpdateState === "WAITING_SAFE"
      ? (desired === "RUNNING" || state === "RUNNING"
          ? "มีอัปเดตใหม่ · กดหยุดบอทเมื่อคุณสะดวก"
          : "รอระบบเริ่มอัปเดตบัญชีนี้")
      : cloudUpdateState === "DELIVERED"
        ? "กำลังอัปเดต EA ของบัญชีนี้"
        : cloudUpdateState === "VERIFYING"
          ? "กำลังเปิด MT5 ใหม่และตรวจสอบเวอร์ชัน"
          : cloudUpdateState === "FAILED"
            ? "อัปเดตบัญชีนี้ไม่สำเร็จ · ผู้ดูแลกำลังตรวจสอบ"
            : "กำลังเตรียมอัปเดต SCENOVA";
  const cloudUpdateDetail =
    cloudUpdateState === "WAITING_SAFE"
      ? (desired === "RUNNING" || state === "RUNNING"
          ? "บอทยังทำงานต่อได้ตามปกติ ระบบจะไม่หยุดให้เอง และจะอัปเดตเฉพาะบัญชีนี้หลังคุณกด Stop และ Position เป็น 0"
          : "กรุณารอสักครู่ Worker จะรีเฟรช EA เฉพาะบัญชีนี้ แล้วตรวจ Heartbeat ให้อัตโนมัติ")
      : cloudUpdateState === "DELIVERED"
        ? "กำลังปิด/รีเฟรชเฉพาะ MT5 บัญชีนี้เพื่อเปลี่ยน EA โดยไม่กระทบบัญชีอื่น"
        : cloudUpdateState === "VERIFYING"
          ? "กำลังรอ EA เวอร์ชันใหม่ส่ง Heartbeat กลับมา เมื่อตรวจผ่านแล้วคุณสามารถกด Start เอง"
          : cloudUpdateState === "FAILED"
            ? "บอทยังคงหยุดอยู่เพื่อความปลอดภัย กรุณารอผู้ดูแลตรวจสอบ"
            : "กำลังประมวลผล";
  const cloudUpdateOperation = cloudUpdateVisible
    ? {
        id:"cloud-update-" + cloudUpdateStageKey,
        kind:"CLOUD_UPDATE",
        title:"SCENOVA CLOUD UPDATE" + (cloudUpdate?.target_version ? " · v" + cloudUpdate.target_version : ""),
        status:cloudUpdateState === "FAILED" ? "FAILED" : "RUNNING",
        message:cloudUpdateLabel + " · " + cloudUpdateDetail,
        target:String(cloudUpdate?.target_version || ""),
        canClose:cloudUpdateState === "WAITING_SAFE" || cloudUpdateState === "FAILED",
        cloudUpdateKey:cloudUpdateStageKey
      }
    : null;
  const operationTerminal = serverOperation || cloudUpdateOperation;
  const operationTerminalVisible =
    Boolean(operationTerminal) &&
    !(
      serverOperationMinimized &&
      operationTerminal?.kind === "STOP" &&
      operationTerminal?.status === "RUNNING"
    );
  const statusNoticeCount = Number(marketSessionClosed || !isMt5Online) + Number(softwareUpdateRequired) + Number(cloudUpdateVisible);

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
  useEffect(() => {
    if (!serverOperation || serverOperation.status !== "RUNNING") return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible" || dashboardLoadInFlightRef.current) return;
      void load(selectedSlotIdRef.current, true);
    }, 1500);
    return () => clearInterval(id);
  }, [serverOperation?.id, serverOperation?.status]);

  useEffect(() => {
    if (!serverOperation || serverOperation.status !== "RUNNING" || !data?.instance) return;

    const op = serverOperation;
    const liveMetrics = data.instance.metrics || {};
    const actual = String(data.instance.actual_state || "").toUpperCase();
    const wanted = String(data.instance.desired_state || "").toUpperCase();
    const positions = Math.max(0, Number(liveMetrics.positions || 0));
    const pendingOrders = Math.max(0, Number(liveMetrics.accountScenovaPendingOrders || 0));
    const httpStatus = Number(liveMetrics.heartbeatHttpStatus || 0);
    const heartbeatOk = Boolean(data.instance.mt5_online) && httpStatus >= 200 && httpStatus < 300;

    let complete = false;
    let failed = false;
    let message = String(op.message || "");
    const operationAgeMs = Math.max(0, Date.now() - Number(op.startedAt || Date.now()));

    if (
      operationAgeMs >= 90_000 &&
      (
        op.kind === "SYMBOL" ||
        op.kind === "START" ||
        op.kind === "CLOSE_ALL"
      )
    ) {
      failed = true;
      message = "Server ไม่ได้รับสถานะยืนยันภายใน 90 วินาที · กรุณาตรวจ MT5/EA แล้วลองใหม่";
    } else if (op.kind === "SYMBOL") {
      const target = String(op.target || "");
      const current = String(liveMetrics.symbol || "");
      const symbolStatus = String(liveMetrics.symbolChangeStatus || liveMetrics.manualMt5ActionStatus || "").toUpperCase();
      if (symbolStatus === "FAILED") {
        failed = true;
        message = String(liveMetrics.manualMt5ActionMessage || "Cloud Worker เปลี่ยน Symbol ไม่สำเร็จ");
      } else if (target && current.toUpperCase() === target.toUpperCase() && heartbeatOk) {
        complete = true;
        message = "MT5 เปิด " + target + " และ EA ส่ง Heartbeat ยืนยันแล้ว";
      } else if (symbolStatus === "RELOADED" || current.toUpperCase() === target.toUpperCase()) {
        message = "Worker เปิดกราฟ " + target + " แล้ว · กำลังรอ EA Heartbeat ยืนยัน";
      } else {
        message = "Server ส่งคำสั่งไป Cloud Worker แล้ว · กำลังเปิดกราฟ " + target + " และโหลด FastBasketBot";
      }
    } else if (op.kind === "START") {
      if (actual === "RUNNING" && wanted === "RUNNING" && heartbeatOk) {
        complete = true;
        message = "EA ยืนยัน RUNNING แล้ว · บอทเริ่มทำงานสำเร็จ";
      } else {
        message = String(startTransition.message || startPhaseLabel[startPhase] || "Server กำลังรอ EA ยืนยัน RUNNING");
      }
    } else if (op.kind === "STOP") {
      if (wanted === "STOPPED" && actual === "STOPPED" && positions <= 0) {
        complete = true;
        message = "EA ยืนยัน STOPPED แล้ว · Safe Stop สำเร็จ";
      } else {
        message = positions > 0
          ? "Safe Stop ทำงานอยู่ · รอรอบปัจจุบันปิดตามเงื่อนไข (" + positions + " Position)"
          : "Server ส่ง Safe Stop แล้ว · กำลังรอ EA ยืนยัน STOPPED";
      }
    } else if (op.kind === "CLOSE_ALL") {
      if (wanted === "STOPPED" && positions <= 0 && pendingOrders <= 0) {
        complete = true;
        message = "Force Flat สำเร็จ · Position และ Pending Order ของ SCENOVA เป็น 0";
      } else {
        message = "Server กำลัง Force Flat · เหลือ " + positions + " Position / " + pendingOrders + " Pending";
      }
    }

    if (failed) {
      setServerOperation((current:any) =>
        current?.id === op.id
          ? { ...current, status:"FAILED", message, updatedAt:Date.now() }
          : current
      );
      return;
    }

    if (complete) {
      setServerOperation((current:any) =>
        current?.id === op.id
          ? { ...current, status:"SUCCESS", message, updatedAt:Date.now() }
          : current
      );
      return;
    }

    if (message !== op.message) {
      setServerOperation((current:any) =>
        current?.id === op.id ? { ...current, message, updatedAt:Date.now() } : current
      );
    }
  }, [
    data?.instance?.last_seen_at,
    data?.instance?.actual_state,
    data?.instance?.desired_state,
    data?.instance?.metrics?.symbol,
    data?.instance?.metrics?.symbolChangeStatus,
    data?.instance?.metrics?.manualMt5ActionStatus,
    data?.instance?.metrics?.positions,
    data?.instance?.metrics?.accountScenovaPendingOrders,
    serverOperation?.id,
    serverOperation?.status,
    startPhase,
    startTransition.message
  ]);

  useEffect(() => {
    if (!vpsMigrationProgress?.migrationId || vpsMigrationProgress?.status !== "RUNNING") return;
    let cancelled = false;

    const pollMigration = async () => {
      try {
        const snapshot = await api("/runtime-migration/status");
        if (cancelled) return;
        const migration = (snapshot?.migrations || []).find(
          (item:any) => String(item.id) === String(vpsMigrationProgress.migrationId)
        );
        if (!migration) return;

        const migrationState = String(migration.state || "").toUpperCase();
        const runnerLabel = String(
          vpsMigrationProgress.runnerRegion ||
          vpsMigrationProgress.runnerId ||
          migration.target_runner_id ||
          "SCENOVA VPS"
        );
        const stateMessage:Record<string,string> = {
          STOPPING_LOCAL:"กำลังย้ายระบบ · กำลังตรวจและหยุด Local MT5 อย่างปลอดภัย",
          SOURCE_STOP_CONFIRMED:"Local MT5 หยุดแล้ว · กำลังส่งระบบไป VPS",
          TARGET_PROVISIONING:"กำลังติดตั้งระบบ VPS · กำลังเปิด MT5 และ FastBasketBot บน " + runnerLabel,
          COMPLETED:"ย้ายระบบไป VPS สำเร็จ · VPS Online แล้ว · พร้อมกดเริ่มบอท"
        };

        if (migrationState === "FAILED" || migrationState === "CANCELLED") {
          setVpsMigrationProgress((current:any) =>
            current?.migrationId === vpsMigrationProgress.migrationId
              ? {
                  ...current,
                  status:"FAILED",
                  stage:migrationState,
                  message:String(migration.error_detail || migration.error_code || "ย้ายบัญชีไป VPS ไม่สำเร็จ")
                }
              : current
          );
          return;
        }

        if (migrationState === "COMPLETED") {
          const targetSlotId = String(vpsMigrationProgress.targetSlotId || migration.target_slot_id || "");
          setVpsMigrationProgress((current:any) =>
            current?.migrationId === vpsMigrationProgress.migrationId
              ? { ...current, status:"SUCCESS", stage:"COMPLETED", message:stateMessage.COMPLETED }
              : current
          );
          setNotice("ย้ายระบบไป VPS สำเร็จ");
          if (targetSlotId) {
            selectedSlotIdRef.current = targetSlotId;
            setSelectedSlotId(targetSlotId);
            void load(targetSlotId, true);
          }
          return;
        }

        const nextMessage = stateMessage[migrationState];
        if (nextMessage) {
          setVpsMigrationProgress((current:any) =>
            current?.migrationId === vpsMigrationProgress.migrationId
              ? { ...current, stage:migrationState, message:nextMessage }
              : current
          );
        }
      } catch {
        // Keep the compact migration status visible; the next poll can recover.
      }
    };

    void pollMigration();
    const id = window.setInterval(pollMigration, 1200);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    vpsMigrationProgress?.migrationId,
    vpsMigrationProgress?.status,
    vpsMigrationProgress?.runnerId,
    vpsMigrationProgress?.runnerRegion,
    vpsMigrationProgress?.targetSlotId
  ]);

  useEffect(() => {
    if (serverOperation?.status !== "SUCCESS") return;
    const delayMs = serverOperation?.kind === "START" ? 550 : 1200;
    const id = window.setTimeout(() => setServerOperation(null), delayMs);
    return () => clearTimeout(id);
  }, [serverOperation?.id, serverOperation?.kind, serverOperation?.status]);

  const startConnectionReady = isMt5Online || isAgentOnline;
  const safeStopPositionCount = Math.max(0, Number(metrics.positions || 0));
  const safeStopOperationRunning =
    serverOperation?.kind === "STOP" &&
    serverOperation?.status === "RUNNING";
  const safeStopInProgress =
    desired === "SAFE_STOP" ||
    state === "SAFE_STOP" ||
    safeStopOperationRunning;
  const safeStopStatusDetail = safeStopPositionCount > 0
    ? "Safe Stop · เหลือ " + safeStopPositionCount + " Position"
    : "Safe Stop · รอ EA ยืนยัน STOPPED";
  // Let the customer press Start whenever SCENOVA has a live connection, but
  // never race an in-flight Safe Stop drain. The Server also enforces this.
  const startBlocked =
    busy ||
    botCommandLocked ||
    botStarting ||
    botRunning ||
    safeStopInProgress ||
    maintenanceBlocksStart ||
    !startConnectionReady;
  const stopBlocked =
    busy ||
    botCommandLocked ||
    (desired !== "RUNNING" && state !== "RUNNING");
  const selectedBroker = brokerCatalog.find((item)=>item.code === brokerCode);
  const selectedBrokerName = brokerCode === "OTHER"
    ? customBrokerName.trim()
    : (selectedBroker?.name || brokerCode);
  const selectedServer = brokerServer === "__CUSTOM__"
    ? customBrokerServer.trim()
    : brokerServer;
  const mt5ServerQuery = String(brokerServer || "").trim().toLowerCase();
  const mt5ServerSuggestions = (selectedBroker?.servers || [])
    .filter(server =>
      !mt5ServerQuery ||
      String(server.serverName || "").toLowerCase().includes(mt5ServerQuery)
    )
    .slice(0, 8);
  const hasLocalConnectionSlot = (data?.slots || []).some((slot:any) =>
    String(slot?.mode || "").toUpperCase() === "LOCAL" &&
    Boolean(slot?.can_control) &&
    ["ACTIVE","AVAILABLE"].includes(String(slot?.status || "").toUpperCase())
  );
  const hasCloudConnectionSlot = (data?.slots || []).some((slot:any) =>
    String(slot?.mode || "").toUpperCase() === "CLOUD" &&
    Boolean(slot?.can_control) &&
    ["ACTIVE","AVAILABLE"].includes(String(slot?.status || "").toUpperCase())
  );
  const cloudSlots = (data?.slots || [])
    .filter((slot:any) =>
      String(slot?.mode || "").toUpperCase() === "CLOUD" &&
      String(slot?.status || "").toUpperCase() !== "DELETED" &&
      (Boolean(slot?.can_manage) || Boolean(slot?.can_control))
    )
    .sort((a:any,b:any)=>Number(a?.slot_number || 0)-Number(b?.slot_number || 0));
  const ownerCloudAccess = ["OWNER","ADMIN"].includes(String(data?.user?.role || "").toUpperCase());
  const cloudSlotSummary = {
    total:cloudSlots.length,
    online:cloudSlots.filter((slot:any)=>Boolean(slot?.mt5_online)).length,
    ready:cloudSlots.filter((slot:any)=>
      !slot?.mt5_account_id &&
      ["ACTIVE","AVAILABLE"].includes(String(slot?.status || "").toUpperCase()) &&
      (ownerCloudAccess || Boolean(slot?.subscription_active))
    ).length,
    expiring:cloudSlots.filter((slot:any)=>{
      if (ownerCloudAccess || !slot?.subscription_expires_at) return false;
      const expires = new Date(slot.subscription_expires_at).getTime();
      const remaining = expires - Date.now();
      return remaining > 0 && remaining < 3 * 24 * 60 * 60 * 1000;
    }).length
  };
  const primaryCloudSlot = cloudSlots.find((slot:any)=>String(slot?.slot_type || "").toUpperCase()==="PERSONAL")
    || cloudSlots.find((slot:any)=>Number(slot?.slot_number || 0)===1)
    || null;
  const primaryCloudExpiry = primaryCloudSlot?.subscription_expires_at
    ? new Date(primaryCloudSlot.subscription_expires_at)
    : null;
  const primaryCloudRemaining = primaryCloudExpiry
    ? primaryCloudExpiry.getTime() - accessClockNow
    : null;
  const primaryCloudActive = ownerCloudAccess || (
    Boolean(primaryCloudSlot?.subscription_active) &&
    primaryCloudRemaining !== null &&
    primaryCloudRemaining > 0
  );
  const vpsPaymentOrder = cloudOrders.find(order=>order.id===vpsPaymentOrderId) || null;
  const vpsPaymentAccount = cloudCatalog?.paymentAccounts?.[0] || null;
  const vpsPackages = (cloudCatalog?.addonPackages || [])
    .filter(pack=>pack.enabled && Number(pack.price_satang) > 0)
    .sort((a,b)=>Number(a.months)-Number(b.months));
  const selectedVpsPackage = vpsPackages.find(pack=>Number(pack.months)===Number(vpsPurchaseMonths)) || vpsPackages[0] || null;
  const vpsRenewSlot = cloudSlots.find((slot:any)=>String(slot?.id || "")===String(vpsRenewSlotId || "")) || null;
  const canBuyVpsSlot = Boolean(cloudCatalog?.checkoutEnabled) &&
    Number(cloudCatalog?.available || 0) > 0 &&
    primaryCloudActive;
  const canCheckoutVpsOrder = Boolean(cloudCatalog?.checkoutEnabled) &&
    primaryCloudActive &&
    (Boolean(vpsRenewSlotId) || Number(cloudCatalog?.available || 0) > 0);

  const accessExpiry = entitlement?.expiresAt ? new Date(entitlement.expiresAt) : null;
  const accessRemaining = accessExpiry ? Math.max(0, accessExpiry.getTime() - accessClockNow) : null;
  const cloudRenewalWarning =
    String(data?.selectedSlot?.mode || "").toUpperCase() === "CLOUD" &&
    !ownerCloudAccess &&
    primaryCloudRemaining !== null &&
    primaryCloudRemaining > 0 &&
    primaryCloudRemaining < 3 * 24 * 60 * 60 * 1000;
  const accessCompactCountdown = accessRemaining === null ? "" : (() => {
    const totalSeconds = Math.floor(accessRemaining / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [
      String(days).padStart(2,"0"),
      String(hours).padStart(2,"0"),
      String(minutes).padStart(2,"0"),
      String(seconds).padStart(2,"0")
    ].join(":");
  })();
  const unlimitedAccess = entitlement?.source === "OWNER";
  const showCompactAccessCountdown =
    Boolean(entitlement?.allowed) &&
    (unlimitedAccess || (accessRemaining !== null && Boolean(accessExpiry)));
  const accessCompactLabel = unlimitedAccess ? "OWNER ∞" : accessCompactCountdown;
  const accessCompactTitle = unlimitedAccess
    ? "Owner Access · ใช้งานได้ไม่จำกัดเวลา"
    : "เวลาสมาชิกคงเหลือ · หมดอายุ " +
      (accessExpiry ? accessExpiry.toLocaleString("th-TH",{dateStyle:"medium",timeStyle:"medium",hour12:false}) : "—");

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
    : isHeartbeatDelayed
      ? "EA Heartbeat ขาดช่วง · กำลังเชื่อมต่อใหม่"
      : isAgentOnline
        ? "Windows Agent เชื่อมแล้ว · EA ยังไม่ตอบสนอง"
        : data?.account
          ? "รอ Windows Agent / MT5"
          : "ยังไม่ได้เชื่อมบัญชี";
  const accountConnectionOnline = isMt5Online;
  const accountConnectionLabel = accountConnectionOnline
    ? "เชื่อมต่อแล้ว"
    : data?.account
      ? "ไม่เชื่อมต่อ"
      : "ยังไม่ได้เชื่อมบัญชี";

  useEffect(() => {
    const slotId = String(data?.selectedSlot?.id || "");
    if (!slotId || !data?.instance?.id || !data?.account) return;

    if (isMt5Online) {
      connectionWasOnlineRef.current[slotId] = true;
      return;
    }

    if (connectionWasOnlineRef.current[slotId] !== true) return;
    connectionWasOnlineRef.current[slotId] = false;

    if (activeView !== "account") {
      setActiveView("account");
      window.history.replaceState({}, "", "/dashboard?view=account");
    }
  }, [
    activeView,
    isMt5Online,
    data?.selectedSlot?.id,
    data?.instance?.id,
    data?.account?.id
  ]);

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
  const dashboardBotTodayProfit = Number(metrics.botTodayProfit ?? metrics.dailyProfit ?? 0);
  const activeControlModeRaw = String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase();
  const activeControlMode = ["AUTO","RACE","FLIP_LOCK","ZERO_GRID","MANUAL"].includes(activeControlModeRaw)
    ? activeControlModeRaw
    : "AUTO";
  const todayPerformance = data?.tradeJournal?.today || {
    trades:0,closedTrades:0,wins:0,losses:0,winRate:0,netProfit:0,drawdownMoney:0,drawdownPercent:0
  };
  const modePerformanceToday = Array.isArray(data?.tradeJournal?.modeToday)
    ? data.tradeJournal.modeToday
    : ["AUTO","RACE","FLIP_LOCK","ZERO_GRID","MANUAL"].map(mode=>({
        mode,trades:0,closedTrades:0,wins:0,losses:0,winRate:0,netProfit:0,drawdownMoney:0,drawdownPercent:0
      }));

  const rawOpenPositions = (() => {
    if (Array.isArray(metrics.openPositions)) return metrics.openPositions;
    if (typeof metrics.openPositions === "string") {
      try {
        const parsed = JSON.parse(metrics.openPositions);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  })();
  const openPositions = [...rawOpenPositions]
    .sort((a:any,b:any)=>Number(a.openedAt||0)-Number(b.openedAt||0));
  const livePositionProfitSum = openPositions.reduce((sum:number, position:any) => {
    const profit = Number(position?.profit ?? 0);
    return sum + (Number.isFinite(profit) ? profit : 0);
  }, 0);
  const basketProfitMetric = Number(metrics.basketProfit);
  const liveNetProfit = Number.isFinite(basketProfitMetric) ? basketProfitMetric : livePositionProfitSum;
  const livePositionTelemetryMissing = currentPositions > 0 && openPositions.length === 0;
  const livePositionEaVersion = String(metrics.eaVersion || softwareUpdate.currentEaVersion || "—");
  const livePositionRequiredVersion = String(softwareUpdate.latestEaVersion || "1.0.43");
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
        ? (isHeartbeatDelayed
            ? "EA Heartbeat ขาดช่วง — Windows Agent ยังออนไลน์และกำลังเชื่อมต่อใหม่"
            : isAgentOnline
              ? "Windows Agent ออนไลน์ แต่ EA ไม่ตอบสนองเกินช่วงรอ — ตรวจ MT5/EA"
              : "รอ MT5 เชื่อมต่อ")
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
  const rescueStateCustomerText = rescueActive
    ? "กำลังปิด Rescue เดิมที่ค้างจากเวอร์ชันก่อน"
    : "ปิดระบบแก้ไม้แล้ว";
  const recoveryCustomerText = rescueActive
    ? "กำลังเคลียร์ไม้ Rescue เดิม · จะไม่เปิดไม้แก้ใหม่"
    : "ไม่เปิด Hedge / Recovery สวนฝั่งหลัก";
  const reversalCustomerText = "สัญญาณกลับตัวใช้เพื่อวิเคราะห์เท่านั้น · ไม่ใช้เปิดไม้แก้";

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

    const confirmed = await confirmPopup({
      title:firstBind ? "ยืนยันการผูกบัญชี MT5" : "ยืนยันการเปลี่ยนบัญชี MT5",
      tone:"warning",
      message:firstBind
        ? "ผูก MT5 " + accountText + " เป็นบัญชีที่ใช้งานใช่หรือไม่?"
        : "เปลี่ยนมาใช้ MT5 " + accountText + " ใช่หรือไม่?",
      confirmLabel:firstBind ? "ผูกบัญชี" : "เปลี่ยนบัญชี"
    });
    if (!confirmed) return;

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


  function openPrimaryPackagePage() {
    window.location.href = "/packages?system=cloud&renew=primary";
  }

  function openVpsSlotDialog(slotId = "") {
    const targetSlot = cloudSlots.find((slot:any)=>String(slot?.id || "")===String(slotId || "")) || null;
    const targetIsPrimary =
      Boolean(targetSlot) &&
      (
        String(targetSlot?.slot_type || "").toUpperCase()==="PERSONAL" ||
        Number(targetSlot?.slot_number || 0)===1
      );
    if (targetIsPrimary && !ownerCloudAccess) {
      openPrimaryPackagePage();
      return;
    }

    const enabledPackages = (cloudCatalog?.addonPackages || [])
      .filter(pack=>pack.enabled && Number(pack.price_satang) > 0)
      .sort((a,b)=>Number(a.months)-Number(b.months));
    setVpsPurchaseMonths(Number(enabledPackages[0]?.months || 1));
    setVpsSlipFile(null);
    setOwnerAddonPriceEditorOpen(false);

    const pending = cloudOrders.find(order =>
      String(order.purchase_type || "PACKAGE").toUpperCase()==="ADDON" &&
      ["CREATING","PENDING","REVIEW"].includes(String(order.status || "").toUpperCase())
    );
    setVpsRenewSlotId(pending ? String(pending.slot_id || "") : slotId);
    setVpsPaymentOrderId(String(pending?.id || ""));
    vpsSlotDialogRef.current?.showModal();
  }

  function openOwnerAddonPricing() {
    const next:Record<number,{priceBaht:string;enabled:boolean}> = {
      1:{priceBaht:"",enabled:false},
      3:{priceBaht:"",enabled:false},
      6:{priceBaht:"",enabled:false},
      12:{priceBaht:"",enabled:false}
    };
    for (const months of [1,3,6,12]) {
      const pack = (cloudCatalog?.addonPackages || []).find(item=>Number(item.months)===months);
      next[months] = {
        priceBaht: pack ? String(Number(pack.price_satang || 0) / 100) : "",
        enabled: Boolean(pack?.enabled)
      };
    }
    setOwnerAddonPrices(next);
    setOwnerAddonPriceEditorOpen(true);
    setVpsRenewSlotId("");
    setVpsPaymentOrderId("");
    setVpsSlipFile(null);
    vpsSlotDialogRef.current?.showModal();
  }

  async function saveOwnerAddonPrices() {
    if (vpsPurchaseBusy) return;
    setVpsPurchaseBusy(true);
    setError("");
    setNotice("");
    try {
      const packages = [1,3,6,12].map(months=>{
        const row = ownerAddonPrices[months] || {priceBaht:"",enabled:false};
        const priceBaht = Number(row.priceBaht || 0);
        if (!Number.isFinite(priceBaht) || priceBaht < 0) {
          throw new Error("กรุณาตรวจราคา Slot เสริมให้ถูกต้อง");
        }
        return {
          months,
          priceSatang:Math.round(priceBaht * 100),
          enabled:Boolean(row.enabled)
        };
      });
      await api("/cloud/addon-prices", {
        method:"POST",
        body:JSON.stringify({ packages })
      });
      await loadVpsCommerce();
      setOwnerAddonPriceEditorOpen(false);
      setNotice("บันทึกราคา VPS Slot เสริมแล้ว");
    } catch (e:any) {
      setError(String(e?.message || "บันทึกราคา Slot เสริมไม่สำเร็จ"));
    } finally {
      setVpsPurchaseBusy(false);
    }
  }

  async function createVpsSlotOrder() {
    if (vpsPurchaseBusy) return;
    setVpsPurchaseBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api("/cloud/checkout", {
        method:"POST",
        body:JSON.stringify({
          months:vpsPurchaseMonths,
          ...(vpsRenewSlotId
            ? { slotId:vpsRenewSlotId }
            : { purchaseType:"ADDON" })
        })
      });
      if (result?.free) {
        const next = await loadVpsCommerce();
        const paidOrder = next.orders.find((item:CloudOrder)=>item.id===String(result?.id || ""));
        const targetSlotId = String(paidOrder?.slot_id || vpsRenewSlotId || selectedSlotIdRef.current || "");
        await load(targetSlotId);
        vpsSlotDialogRef.current?.close();
        setNotice(vpsRenewSlotId ? "ต่ออายุ VPS Slot เสริมเรียบร้อยแล้ว" : "เพิ่ม VPS Slot เสริมเรียบร้อยแล้ว");
        return;
      }
      setVpsPaymentOrderId(String(result?.id || ""));
      await loadVpsCommerce();
      setNotice("พร้อมชำระเงิน");
    } catch (e:any) {
      setError(String(e?.message || "สร้างรายการ VPS Slot ไม่สำเร็จ"));
      await loadVpsCommerce().catch(()=>{});
    } finally {
      setVpsPurchaseBusy(false);
    }
  }

  async function verifyVpsSlotSlip() {
    if (vpsPurchaseBusy || !vpsPaymentOrderId || !vpsSlipFile) return;
    if (!["image/jpeg","image/png","image/gif","image/webp"].includes(vpsSlipFile.type)) {
      setError("รองรับสลิป JPG, PNG, GIF หรือ WebP เท่านั้น");
      return;
    }
    if (vpsSlipFile.size <= 0 || vpsSlipFile.size > 4 * 1024 * 1024) {
      setError("รูปสลิปต้องมีขนาดไม่เกิน 4 MB");
      return;
    }

    setVpsPurchaseBusy(true);
    setError("");
    try {
      const base64 = await new Promise<string>((resolve,reject)=>{
        const reader = new FileReader();
        reader.onload = ()=>resolve(String(reader.result || ""));
        reader.onerror = ()=>reject(new Error("อ่านรูปสลิปไม่สำเร็จ"));
        reader.readAsDataURL(vpsSlipFile);
      });
      const result = await api(`/cloud/orders/${vpsPaymentOrderId}/verify-slip`, {
        method:"POST",
        body:JSON.stringify({ base64 })
      });
      const next = await loadVpsCommerce();
      const paidOrder = next.orders.find((item:CloudOrder)=>item.id===vpsPaymentOrderId);
      const targetSlotId = String(paidOrder?.slot_id || vpsRenewSlotId || selectedSlotIdRef.current || "");
      await load(targetSlotId);
      if (result?.status === "PAID") {
        vpsSlotDialogRef.current?.close();
        setVpsPaymentOrderId("");
        setVpsSlipFile(null);
        setNotice(vpsRenewSlotId ? "ต่ออายุ VPS Slot เสริมสำเร็จ" : "ชำระสำเร็จ · เพิ่ม VPS Slot เสริมใหม่แล้ว");
      }
    } catch (e:any) {
      setError(String(e?.message || "ตรวจสลิปไม่สำเร็จ"));
    } finally {
      setVpsPurchaseBusy(false);
    }
  }

  async function refreshVpsSlotOrder() {
    if (vpsPurchaseBusy || !vpsPaymentOrderId) return;
    setVpsPurchaseBusy(true);
    try {
      await api(`/cloud/orders/${vpsPaymentOrderId}/refresh`, { method:"POST" });
      const next = await loadVpsCommerce();
      const order = next.orders.find((item:CloudOrder)=>item.id===vpsPaymentOrderId);
      if (order?.status === "PAID") {
        const targetSlotId = String(order.slot_id || vpsRenewSlotId || selectedSlotIdRef.current || "");
        await load(targetSlotId);
        vpsSlotDialogRef.current?.close();
        setVpsPaymentOrderId("");
        setNotice(vpsRenewSlotId ? "ต่ออายุ VPS Slot เสริมสำเร็จ" : "ชำระสำเร็จ · เพิ่ม VPS Slot เสริมใหม่แล้ว");
      }
    } catch (e:any) {
      setError(String(e?.message || "ตรวจสอบการชำระเงินไม่สำเร็จ"));
    } finally {
      setVpsPurchaseBusy(false);
    }
  }

  async function cancelVpsSlotOrder() {
    if (vpsPurchaseBusy || !vpsPaymentOrderId) {
      vpsSlotDialogRef.current?.close();
      return;
    }
    setVpsPurchaseBusy(true);
    try {
      await api(`/cloud/orders/${vpsPaymentOrderId}/cancel-slip-payment`, { method:"POST" });
      setVpsPaymentOrderId("");
      setVpsSlipFile(null);
      await loadVpsCommerce();
      setNotice("ยกเลิกรายการชำระเงินแล้ว");
    } catch (e:any) {
      setError(String(e?.message || "ยกเลิกรายการไม่สำเร็จ"));
    } finally {
      setVpsPurchaseBusy(false);
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
    setTradingPassword("");
    load(slotId);
  }

  function selectConnectionMode(nextMode: "LOCAL" | "CLOUD") {
    const candidates = (data?.slots || [])
      .filter((slot:any) =>
        String(slot?.mode || "").toUpperCase() === nextMode &&
        Boolean(slot?.can_control) &&
        ["ACTIVE","AVAILABLE"].includes(String(slot?.status || "").toUpperCase())
      )
      .sort((a:any,b:any) => {
        const score = (slot:any) =>
          (slot?.instance_id ? 0 : 4) +
          (slot?.subscription_active ? 0 : 2) +
          Number(slot?.slot_number || 0) / 1000;
        return score(a) - score(b);
      });

    const current = candidates.find((slot:any) => String(slot?.id || "") === String(selectedSlotIdRef.current || ""));
    const target = current || candidates[0];
    if (!target?.id) {
      setError(nextMode === "CLOUD"
        ? "ยังไม่มี VPS Slot ที่ใช้งานได้สำหรับบัญชีนี้"
        : "ยังไม่มี Local Slot ที่ใช้งานได้สำหรับบัญชีนี้");
      return;
    }

    setActiveView("account");
    window.history.replaceState({}, "", "/dashboard?view=account");
    selectSlot(String(target.id));
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

  async function performMt5Reset() {
    const confirmed = await confirmPopup({
      title:"เปลี่ยนบัญชี MT5",
      tone:"warning",
      message:"ถ้าบอทหยุดและไม่มี Position / Pending Order ระบบจะปิด MT5 เดิมบน VPS แล้วให้เชื่อมบัญชีใหม่ได้ทันที",
      confirmLabel:"เปลี่ยนบัญชี"
    });
    if (!confirmed) return false;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const resetUrl = "/bot/mt5/reset?slotId=" + encodeURIComponent(selectedSlotIdRef.current);
      let result = await api(resetUrl, { method: "POST" });
      let attempts = 0;

      while (result?.pendingCloudStop && attempts < 45) {
        if (attempts === 0) {
          setNotice("กำลังปิด MT5 เดิมบน VPS เพื่อเปลี่ยนบัญชี");
        }
        await new Promise(resolve=>window.setTimeout(resolve, 1200));
        result = await api(resetUrl, { method: "POST" });
        attempts += 1;
      }

      if (result?.pendingCloudStop) {
        throw new Error("VPS ยังไม่ยืนยันการปิด MT5 ภายในเวลาที่กำหนด กรุณาลองอีกครั้ง");
      }

      setInstallToken("");
      setInstallInstanceId("");
      setTradingPassword("");
      setAccountNumber("");
      setBrokerServer("");
      setCustomBrokerServer("");
      await load(selectedSlotIdRef.current);
      setActiveView("account");
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function resetMt5() {
    await performMt5Reset();
  }

  async function deleteVpsSlot(slotId:string) {
    if (busy) return;
    const slot = cloudSlots.find((item:any)=>String(item?.id || "")===String(slotId || ""));
    if (!slot) {
      setError("ไม่พบ VPS Slot นี้");
      return;
    }
    const primary = String(slot?.slot_type || "").toUpperCase()==="PERSONAL" || Number(slot?.slot_number || 0)===1;
    if (primary) {
      setError("Slot #1 เป็นแพ็กเกจหลัก ไม่สามารถลบได้");
      return;
    }

    const confirmed = await confirmPopup({
      title:"ลบ VPS Slot",
      tone:"warning",
      message:"ลบ Slot #" + String(slot.slot_number || "") + " ออกจากบัญชีนี้หรือไม่? ถ้ามี MT5 บน VPS ระบบจะหยุด Runtime ก่อนลบ Slot",
      confirmLabel:"ลบ Slot"
    });
    if (!confirmed) return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const resetUrl = "/bot/mt5/reset?slotId=" + encodeURIComponent(slotId);
      let reset = await api(resetUrl, { method:"POST" });
      let attempts = 0;
      while (reset?.pendingCloudStop && attempts < 45) {
        if (attempts === 0) setNotice("กำลังหยุด MT5 บน VPS ก่อนลบ Slot");
        await new Promise(resolve=>window.setTimeout(resolve,1200));
        reset = await api(resetUrl, { method:"POST" });
        attempts += 1;
      }
      if (reset?.pendingCloudStop) {
        throw new Error("VPS ยังไม่ยืนยันการหยุด MT5 ภายในเวลาที่กำหนด กรุณาลองอีกครั้ง");
      }

      await api("/bot/slots/delete", {
        method:"POST",
        body:JSON.stringify({ slotId })
      });

      if (String(selectedSlotIdRef.current || "") === String(slotId)) {
        selectedSlotIdRef.current = "";
        setSelectedSlotId("");
      }
      setNotice("ลบ VPS Slot #" + String(slot.slot_number || "") + " แล้ว");
      await Promise.all([load(""), loadVpsCommerce()]);
    } catch (e:any) {
      setError(String(e?.message || "ลบ VPS Slot ไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  function prepareCloudMt5Dialog(slotId:string, dialogMode:"NEW"|"RECONNECT") {
    const slot = cloudSlots.find((item:any)=>String(item?.id || "")===String(slotId || "")) || null;
    if (slotId && slotId !== selectedSlotIdRef.current) {
      selectSlot(slotId);
    }

    setCloudMt5DialogMode(dialogMode);
    setCloudMt5DialogAccountId(dialogMode === "RECONNECT" ? String(slot?.mt5_account_id || "") : "");
    setTradingPassword("");

    if (dialogMode === "RECONNECT" && slot?.account_number) {
      setAccountNumber(String(slot.account_number || ""));
      const brokerMatch = brokerCatalog.find(item =>
        String(item.name || "").toLowerCase() === String(slot.broker || "").toLowerCase() ||
        String(item.code || "").toLowerCase() === String(slot.broker || "").toLowerCase()
      );
      if (brokerMatch) {
        setBrokerCode(brokerMatch.code);
        setCustomBrokerName("");
      } else {
        setBrokerCode("OTHER");
        setCustomBrokerName(String(slot.broker || ""));
      }
      setBrokerServer(String(slot.broker_server || ""));
      setCustomBrokerServer("");
    } else {
      setAccountNumber("");
      setBrokerServer("");
      setCustomBrokerServer("");
      if (!brokerCatalog.some(item=>item.code===brokerCode)) {
        setBrokerCode(brokerCatalog[0]?.code || "EXNESS");
      }
    }

    window.setTimeout(()=>cloudMt5DialogRef.current?.showModal(),0);
  }

  async function beginCloudAccountChange() {
    const blocked =
      state === "RUNNING" ||
      desired === "RUNNING" ||
      Number(data?.instance?.metrics?.positions || 0) > 0 ||
      Number(data?.instance?.metrics?.accountScenovaPendingOrders || 0) > 0;
    if (blocked) {
      setError("ต้องหยุดบอทและไม่มี Position / Pending Order ค้างอยู่ก่อนเปลี่ยนบัญชี");
      return;
    }

    const slotId = String(selectedSlotIdRef.current || data?.selectedSlot?.id || "");
    const ok = await performMt5Reset();
    if (ok) prepareCloudMt5Dialog(slotId,"NEW");
  }

  async function submitCloudMt5Dialog(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!tradingPassword) throw new Error("กรุณากรอก MT5 Trading Password");

      if (cloudMt5DialogMode === "RECONNECT" && cloudMt5DialogAccountId) {
        await api("/bot/mt5/cloud-credential", {
          method:"POST",
          body:JSON.stringify({
            mt5AccountId:cloudMt5DialogAccountId,
            tradingPassword
          })
        });
      } else {
        if (!accountNumber.trim()) throw new Error("กรุณากรอก MT5 Login");
        if (!selectedBrokerName) throw new Error("กรุณาเลือก Broker");
        if (!selectedServer.trim()) throw new Error("กรุณาเลือกหรือพิมพ์ MT5 Server");

        await api("/bot/mt5", {
          method:"POST",
          body:JSON.stringify({
            slotId:selectedSlotIdRef.current || undefined,
            accountNumber:accountNumber.trim(),
            broker:selectedBrokerName,
            brokerServer:selectedServer.trim(),
            mode:"CLOUD",
            tradingPassword
          })
        });
      }

      setTradingPassword("");
      cloudMt5DialogRef.current?.close();
      setNotice(cloudMt5DialogMode === "RECONNECT"
        ? "บันทึกรหัสแล้ว กำลังเชื่อม MT5 บน VPS ใหม่"
        : "เชื่อมบัญชี MT5 ใหม่แล้ว กำลังเปิดบน VPS");
      await load(selectedSlotIdRef.current,true);
    } catch (e:any) {
      setError(String(e?.message || "เชื่อม MT5 ไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  function openOwnerVpsMigration() {
    if (!isOwner && !cloudMigrationTarget) {
      window.location.href = "/packages?system=cloud&from=mt5-ea";
      return;
    }
    if (!data?.account) {
      setError("กรุณาเชื่อมบัญชี MT5 ก่อนย้ายไป VPS Server");
      return;
    }
    setOwnerVpsPassword("");
    setError("");
    ownerVpsDialogRef.current?.showModal();
  }

  async function moveOwnerLocalToVps(e: FormEvent) {
    e.preventDefault();
    const sourceSlotId = String(selectedSlotIdRef.current || data?.selectedSlot?.id || "");
    if (!sourceSlotId) {
      setError("ไม่พบ Local Slot ที่จะย้าย");
      return;
    }
    if (!ownerVpsPassword) {
      setError("กรุณากรอก MT5 Trading Password");
      return;
    }

    setOwnerVpsBusy(true);
    setError("");
    setNotice("");

    // Close the credential dialog and replace the action card immediately.
    // The migration continues in the background and reports compact progress
    // instead of opening the full-screen Server Terminal.
    ownerVpsDialogRef.current?.close();
    setVpsMigrationProgress({
      status:"RUNNING",
      stage:"REQUESTING",
      message:"กำลังย้ายระบบ · กำลังตรวจ Local MT5 และเตรียม VPS"
    });

    try {
      const result = isOwner
        ? await api("/runtime-migration/owner/local-to-cloud", {
            method:"POST",
            body:JSON.stringify({
              sourceSlotId,
              tradingPassword:ownerVpsPassword
            })
          })
        : await api("/runtime-migration/request", {
            method:"POST",
            body:JSON.stringify({
              sourceSlotId,
              targetSlotId:String(cloudMigrationTarget?.id || ""),
              tradingPassword:ownerVpsPassword,
              confirmFlat:true,
              confirmSwitch:true
            })
          });

      const migration = isOwner ? result?.migration : result;
      const targetSlotId = isOwner
        ? String(result?.targetSlotId || migration?.target_slot_id || "")
        : String(cloudMigrationTarget?.id || migration?.target_slot_id || "");

      setOwnerVpsPassword("");
      setVpsMigrationProgress({
        status:"RUNNING",
        stage:String(migration?.state || "STOPPING_LOCAL"),
        migrationId:String(migration?.id || ""),
        targetSlotId,
        runnerId:String(result?.runnerId || migration?.target_runner_id || ""),
        runnerRegion:String(result?.runnerRegion || ""),
        message:String(migration?.state || "").toUpperCase() === "TARGET_PROVISIONING"
          ? "กำลังติดตั้งระบบ VPS · กำลังเปิด MT5 และ FastBasketBot"
          : "กำลังย้ายระบบ · กำลังตรวจและหยุด Local MT5 อย่างปลอดภัย"
      });
    } catch (e:any) {
      setVpsMigrationProgress({
        status:"FAILED",
        stage:"FAILED",
        message:String(e?.message || "ย้ายบัญชีไป VPS ไม่สำเร็จ")
      });
    } finally {
      setOwnerVpsBusy(false);
    }
  }

  async function command(path: string, success: string) {
    const singleClickBotCommand =
      path.startsWith("/bot/start") || path.startsWith("/bot/stop");
    if (singleClickBotCommand && botCommandLockRef.current) return;

    if (path.startsWith("/bot/start") && settingsDirtyRef.current) {
      setError("มีการตั้งค่าที่ยังไม่ได้บันทึก กรุณากดบันทึกก่อนเริ่มบอท");
      setBotSettingsOpen(true);
      return;
    }

    if (singleClickBotCommand) {
      botCommandLockRef.current = true;
      setBotCommandLocked(true);
    }
    setBusy(true);
    setError("");
    setNotice("");
    const operationId = Date.now() + "-" + Math.random().toString(36).slice(2);
    const operationKind = path.startsWith("/bot/start")
      ? "START"
      : path.startsWith("/bot/stop")
        ? "STOP"
        : path.startsWith("/bot/close-all")
          ? "CLOSE_ALL"
          : "COMMAND";
    const operationTitle = operationKind === "START"
      ? "กำลังเริ่มบอท"
      : operationKind === "STOP"
        ? "กำลัง Safe Stop"
        : operationKind === "CLOSE_ALL"
          ? "กำลัง Force Flat"
          : "Server กำลังดำเนินการ";
    setServerOperationMinimized(false);
    setServerOperation({
      id:operationId,
      kind:operationKind,
      title:operationTitle,
      status:"RUNNING",
      message:"กำลังส่งคำสั่งจากเว็บไป Server...",
      startedAt:Date.now()
    });
    try {
      const suffix = selectedSlotIdRef.current
        ? (path.includes("?") ? "&" : "?") + "slotId=" + encodeURIComponent(selectedSlotIdRef.current)
        : "";
      await api(path + suffix, { method: "POST" });
      if (operationKind === "START") {
        setServerOperation((current:any) =>
          current?.id === operationId
            ? {
                ...current,
                status:"SUCCESS",
                title:"เริ่มบอทสำเร็จ",
                message:"บอททำงานสำเร็จ",
                updatedAt:Date.now()
              }
            : current
        );
        if (vpsMigrationProgress?.status === "SUCCESS") {
          setVpsMigrationProgress(null);
        }
        void load(selectedSlotIdRef.current, true);
      } else {
        setServerOperation((current:any) =>
          current?.id === operationId
            ? { ...current, message: success || "Server รับคำสั่งแล้ว · กำลังรอ EA ยืนยัน", updatedAt:Date.now() }
            : current
        );
        await load(selectedSlotIdRef.current, true);
      }
    } catch (e: any) {
      const message = String(e?.message || "เกิดข้อผิดพลาด");
      setServerOperation((current:any) =>
        current?.id === operationId
          ? {
              ...current,
              status:"FAILED",
              message:path.startsWith("/bot/start") ? "เริ่มบอทไม่ได้: " + message : message,
              updatedAt:Date.now()
            }
          : current
      );
    } finally {
      if (singleClickBotCommand) {
        botCommandLockRef.current = false;
        setBotCommandLocked(false);
      }
      setBusy(false);
    }
  }

  function openTradingSymbolPicker() {
    const desired = desiredTradingSymbol;
    const match = tradingSymbolOptions.find(
      item => item.toUpperCase() === desired.toUpperCase()
    );
    setTradingSymbol(match || tradingSymbolOptions[0] || "");
    symbolDialogRef.current?.showModal();
  }

  async function applyTradingSymbol() {
    const next = String(tradingSymbol || "").trim();
    if (!selectedSlotIdRef.current) {
      setError("ไม่พบบัญชี MT5 ที่เลือก");
      return;
    }
    if (!next || next.length > 64 || !TRADING_SYMBOL_PATTERN.test(next)) {
      setError("Symbol ไม่ถูกต้อง กรุณาเลือกชื่อเดียวกับ MT5 Market Watch");
      return;
    }

    setSymbolBusy(true);
    setError("");
    setNotice("");
    const operationId = Date.now() + "-" + Math.random().toString(36).slice(2);
    setServerOperationMinimized(false);
    setServerOperation({
      id:operationId,
      kind:"SYMBOL",
      title:"กำลังเปลี่ยน Trading Symbol",
      target:next,
      status:"RUNNING",
      message:"กำลังตรวจสอบ Symbol จริงจาก MT5 Market Watch...",
      startedAt:Date.now()
    });
    try {
      const result = await api(
        "/bot/trading-symbol?slotId=" + encodeURIComponent(selectedSlotIdRef.current),
        {
          method:"PUT",
          body:JSON.stringify({ symbol: next })
        }
      );
      const resolved = String(result?.resolvedSymbol || result?.symbol || next);
      symbolDialogRef.current?.close();
      setServerOperation((current:any) =>
        current?.id === operationId
          ? {
              ...current,
              target:resolved,
              message:"Server ยืนยัน " + resolved + " แล้ว · กำลังสั่ง Worker เปิดกราฟและโหลด EA",
              updatedAt:Date.now()
            }
          : current
      );
      await load(selectedSlotIdRef.current, true);
    } catch (e:any) {
      setServerOperation((current:any) =>
        current?.id === operationId
          ? {
              ...current,
              status:"FAILED",
              message:String(e?.message || "เปลี่ยน Symbol ไม่สำเร็จ"),
              updatedAt:Date.now()
            }
          : current
      );
    } finally {
      setSymbolBusy(false);
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
        if (mode === "OFF") {
          next.basketProfitTargetMoney = 0;
          next.perPositionProfitMoney = 0;
          next.profitRunTrailPercent = 0;
          next.basketTriggerMoney = 0;
          next.basketTrailMoney = 0;
        } else if (mode === "AUTO") {
          // AUTO keeps the Basket money target. It is a hard close target,
          // while per-position/run-on settings remain MANUAL-only.
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

      // Basket target is absolute: reaching it closes the Basket immediately.
      if (key === "basketProfitTargetMoney") {
        if (enabled) {
          next.perPositionProfitMoney = 0;
          next.profitRunTrailPercent = 0;
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
        "autoMaxBasketLossMoney",
        "autoDailyLossMoney",
        "autoDailyProfitTargetMoney",
        "raceMaxBasketLossMoney",
        "raceDailyLossMoney",
        "raceDailyProfitTargetMoney",
        "flipLockMaxBasketLossMoney",
        "flipLockDailyLossMoney",
        "flipLockDailyProfitTargetMoney",
        "manualMaxBasketLossMoney",
        "manualDailyLossMoney",
        "manualDailyProfitTargetMoney",
        "dailyProfitTargetMoney",
        "dailyProfitDrawdownPercent",
        "autoProfitTargetMoney",
        "manualBasketProfitTargetMoney",
        "manualPerPositionProfitMoney",
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
      const modeRiskProfiles:Record<string,{basket:string;dailyLoss:string;dailyProfit:string}> = {
        AUTO:{basket:"autoMaxBasketLossMoney",dailyLoss:"autoDailyLossMoney",dailyProfit:"autoDailyProfitTargetMoney"},
        RACE:{basket:"raceMaxBasketLossMoney",dailyLoss:"raceDailyLossMoney",dailyProfit:"raceDailyProfitTargetMoney"},
        FLIP_LOCK:{basket:"flipLockMaxBasketLossMoney",dailyLoss:"flipLockDailyLossMoney",dailyProfit:"flipLockDailyProfitTargetMoney"},
        MANUAL:{basket:"manualMaxBasketLossMoney",dailyLoss:"manualDailyLossMoney",dailyProfit:"manualDailyProfitTargetMoney"}
      };
      const activeRiskProfile = modeRiskProfiles[payload.controlMode];
      if (activeRiskProfile) {
        payload.maxBasketLossMoney = Number(payload[activeRiskProfile.basket] || 0);
        payload.dailyLossMoney = Number(payload[activeRiskProfile.dailyLoss] || 0);
        payload.dailyProfitTargetMoney = Number(payload[activeRiskProfile.dailyProfit] || 0);
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
      // Build the legacy/runtime target mirror from the ACTIVE profile only.
      // Persisted profile fields remain untouched when another mode is selected.
      if (payload.controlMode === "RACE") {
        const raceMode = String(payload.raceProfitTargetMode || "BASKET").toUpperCase();
        payload.raceProfitTargetMode = ["BASKET","POSITION","OFF"].includes(raceMode) ? raceMode : "BASKET";
        payload.raceCloseAllProfitEnabled = payload.raceProfitTargetMode === "BASKET";
      }
      if (payload.controlMode === "AUTO") {
        payload.profitTargetMode = "AUTO";
        payload.basketProfitTargetMoney = Number(payload.autoProfitTargetMoney || 0);
        payload.perPositionProfitMoney = 0;
      } else if (payload.controlMode === "MANUAL") {
        payload.profitTargetMode = "MANUAL";
        payload.basketProfitTargetMoney = Number(payload.manualBasketProfitTargetMoney || 0);
        payload.perPositionProfitMoney = Number(payload.manualPerPositionProfitMoney || 0);
        if (payload.basketProfitTargetMoney > 0 && payload.perPositionProfitMoney > 0) {
          throw new Error("MANUAL เลือกกำไรทั้งชุดหรือกำไรต่อไม้ได้อย่างใดอย่างหนึ่ง");
        }
      } else {
        // RACE/ZERO use dedicated fields. FLIP LOCK keeps its own lock engine.
        payload.profitTargetMode = "OFF";
        payload.basketProfitTargetMoney = 0;
        payload.perPositionProfitMoney = 0;
      }
      payload.profitRunTrailPercent = 0;

      // Daily target in the compact settings means "stop at target" exactly.
      // Remove the retired hidden giveback behavior from saved configurations.
      payload.dailyProfitContinueAfterTarget = false;

      // New profit UX no longer exposes the legacy dollar Basket trailing.
      // Clear hidden legacy values on every save so they cannot affect trades.
      payload.basketTriggerMoney = 0;
      payload.basketTrailMoney = 0;
      // EA 1.017 uses a real Broker SL. Never send the retired floating-money
      // per-position loss control from the web.
      payload.perPositionLossMoney = 0;
      // Basket money targets never use giveback/run-on.
      payload.profitRunTrailPercent = 0;

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
  const controlSlots = (data.slots || [])
    .filter((slot:any) =>
      Boolean(slot?.can_control) &&
      ["ACTIVE","AVAILABLE"].includes(String(slot?.status || "").toUpperCase())
    )
    .sort((a:any,b:any) => {
      const aMode = String(a?.mode || "").toUpperCase() === "CLOUD" ? 0 : 1;
      const bMode = String(b?.mode || "").toUpperCase() === "CLOUD" ? 0 : 1;
      return aMode - bMode || Number(a?.slot_number || 0) - Number(b?.slot_number || 0);
    });
  const ownerActiveKey =
    activeView === "account" ? "trading-account" :
    activeView === "backtest" ? "trading-backtest" :
    "trading-overview";

  return (
    <div className={"app-wrap "+(activeView === "overview" ? "cc-shell-v4" : "")}>
      {isOwner ? (
        <OwnerSidebar
          activeKey={ownerActiveKey}
          onLogout={logout}
          onNavigate={handleOwnerNavigate}
          role={String(data.user?.role || "OWNER")}
        />
      ) : (
        <CustomerSidebar
          activeKey={ownerActiveKey}
          onLogout={logout}
          onNavigate={handleOwnerNavigate}
          userCode={data.user?.user_code}
          partner={data.partner}
        />
      )}

      <main className={"main app-main" + (activeView === "account" ? " account-view-main" : "")}>
        <div className="mobile-only mobile-app-head">
          <div className="brand-lockup scenova-brand-lockup"><ScenovaBrand className="scenova-brand-logo-mobile"/></div>
          <div className="mobile-app-head-actions">
            {isOwner ? (
              <OwnerMobileNav activeKey={ownerActiveKey} onNavigate={handleOwnerNavigate}/>
            ) : (
              <CustomerMobileNav
                activeKey={ownerActiveKey}
                onNavigate={handleOwnerNavigate}
                partner={data.partner}
              />
            )}
            <button className="btn ghost" onClick={logout}>ออก</button>
          </div>
        </div>

        <header className={"page-head human-head cc-page-head cc-v3-head " + (activeView === "overview" ? "cc-page-head-overview cc-v4-page-head" : activeView === "account" ? "cc-page-head-account" : "")}>
          <div className="cc-v3-title">
            <span className="cc-v3-title-icon"><ScenovaIcon name={activeView === "overview" ? "control" : activeView === "account" ? "account" : "strategy"} size={24}/></span>
            <div>
              <h1>{activeView === "overview" ? "Control Center" : activeView === "account" ? "MT5 & EA" : "Backtest & Performance"}</h1>
              {activeView !== "account" && (
                <p>{activeView === "overview" ? "ควบคุมบอทเทรดอัตโนมัติ พร้อมติดตามสัญญาณและสถานะแบบเรียลไทม์" : "ดูผลทดสอบย้อนหลัง ดาวน์โหลดรายงาน และสร้างหน้าพอร์ตตัวอย่างแบบอ่านอย่างเดียว"}</p>
              )}
            </div>
          </div>
          <div className="cc-v3-head-actions">
            <span className={"cc-head-chip " + (isMt5Online ? "good" : isHeartbeatDelayed ? "warn" : "bad")}><i/><span><b>{isMt5Online ? "เชื่อมต่อแล้ว" : isHeartbeatDelayed ? "กำลังเชื่อมต่อใหม่" : isAgentOnline ? "EA ไม่ตอบสนอง" : "ยังไม่เชื่อมต่อ"}</b><small>{isMt5Online ? (data.account?.broker || "MT5")+" · EA Online" : isHeartbeatDelayed ? "Windows Agent Online · Heartbeat "+connectionAgeLabel : isAgentOnline ? "Windows Agent Online · รอ EA" : (data.account?.broker || "MT5")+" · "+(data.selectedSlot?.mode || "LOCAL")}</small></span></span>
            <span className={"cc-head-chip bot " + (desired==="RUNNING" ? "active" : "")}><ScenovaIcon name="bot" size={18}/><span><b>{controlStateLabel}</b><small>{settings.entryMode || "AUTO MOMENTUM"}</small></span></span>
            <span className="cc-head-icon-button" aria-label="การแจ้งเตือน"><ScenovaIcon name="bell" size={18}/></span>
          </div>
        </header>

        {activeView === "overview" && data.account && (
          <section className="cc-slot-switcher" aria-label="บัญชีบอทที่กำลังควบคุม">
            <div className="cc-slot-switcher-copy">
              <small>BOT INSTANCE</small>
              <b>
                {String(data.selectedSlot?.mode || "").toUpperCase() === "CLOUD"
                  ? "VPS Slot #" + String(data.selectedSlot?.slot_number || "1")
                  : "Local MT5"}
                {" · "}
                {data.account?.account_number || "ยังไม่เชื่อม MT5"}
              </b>
            </div>
            <div className="cc-slot-switcher-actions">
              {controlSlots.length > 1 ? (
                <select
                  value={String(data.selectedSlot?.id || selectedSlotId || "")}
                  onChange={event=>selectSlot(event.target.value)}
                  aria-label="สลับ VPS Slot หรือ Local MT5"
                >
                  {controlSlots.map((slot:any)=>(
                    <option key={slot.id} value={slot.id}>
                      {String(slot.mode || "").toUpperCase() === "CLOUD"
                        ? "VPS Slot #" + String(slot.slot_number || "1")
                        : "Local MT5"}
                      {slot.account_number ? " · " + String(slot.account_number) : " · ยังไม่เชื่อม MT5"}
                      {slot.actual_state ? " · " + String(slot.actual_state).toUpperCase() : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="cc-slot-single">1 Slot</span>
              )}
              <button
                type="button"
                className="btn ghost"
                onClick={()=>{
                  setActiveView("account");
                  window.history.pushState({}, "", "/dashboard?view=account");
                  window.scrollTo({top:0,behavior:"smooth"});
                }}
              >
                จัดการ MT5 & EA
              </button>
            </div>
          </section>
        )}

        {activeView === "overview" && String(data.selectedSlot?.mode || "").toUpperCase() === "CLOUD" && !ownerCloudAccess && !primaryCloudActive && (
          <section className="membership-expiry-warning membership-expiry-warning-overview primary-expired" role="alert">
            <div className="membership-expiry-warning-icon">!</div>
            <div className="membership-expiry-warning-copy">
              <small>PRIMARY VPS PACKAGE · SLOT #1 EXPIRED</small>
              <b>แพ็กเกจ VPS หลักหมดอายุ · ระงับการใช้งาน VPS Slot ทั้งหมด</b>
              <p>ต้องต่ออายุ Slot #1 ก่อนจึงจะใช้ Slot เสริมได้อีกครั้ง วันคงเหลือของ Slot เสริมยังคงเดิมและจะไม่ถูกยืดตามแพ็กเกจหลัก</p>
            </div>
            <button type="button" className="btn primary" onClick={openPrimaryPackagePage}>
              ต่ออายุแพ็กเกจหลัก
            </button>
          </section>
        )}

        {activeView === "overview" && cloudRenewalWarning && (
          <section className="membership-expiry-warning membership-expiry-warning-overview" role="alert">
            <div className="membership-expiry-warning-icon">!</div>
            <div className="membership-expiry-warning-copy">
              <small>PRIMARY VPS PACKAGE · เหลือน้อยกว่า 3 วัน</small>
              <b>กรุณาต่ออายุแพ็กเกจหลัก Slot #1 ก่อนหมดอายุ</b>
              <p>
                เมื่อแพ็กเกจหลักหมดอายุ Server จะปิด MT5 ของ VPS Slot ทุกตัวทันที แม้ Slot เสริมยังมีวันเหลืออยู่
                การปิด MT5 ไม่ได้ปิด Position ที่ Broker ให้อัตโนมัติ
              </p>
            </div>
            <button type="button" className="btn primary" onClick={openPrimaryPackagePage}>
              ต่ออายุแพ็กเกจหลัก
            </button>
          </section>
        )}

                {activeView === "overview" && <BotPerformanceSummary dashboard={data} />}

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


        {operationTerminalVisible && operationTerminal && (
          <div className="cc-server-operation-backdrop" role="presentation">
            <section
              id="cc-server-operation-dialog"
              className={"cc-server-operation-terminal status-" + String(operationTerminal.status || "RUNNING").toLowerCase()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="cc-server-operation-title"
            >
              <header>
                <div>
                  <span className="cc-server-operation-icon">&gt;_</span>
                  <div>
                    <small>SCENOVA SERVER TERMINAL</small>
                    <h3 id="cc-server-operation-title">{operationTerminal.title}</h3>
                  </div>
                </div>
                {(operationTerminal.status === "FAILED" || operationTerminal.canClose || (operationTerminal.kind === "STOP" && operationTerminal.status === "RUNNING")) && (
                  <button
                    type="button"
                    aria-label={operationTerminal.kind === "STOP" && operationTerminal.status === "RUNNING" ? "ย่อสถานะ Safe Stop" : "ปิด"}
                    onClick={()=>{
                      if (operationTerminal.kind === "STOP" && operationTerminal.status === "RUNNING") {
                        setServerOperationMinimized(true);
                      } else if (operationTerminal.kind === "CLOUD_UPDATE") {
                        setDismissedCloudUpdateKey(String(operationTerminal.cloudUpdateKey || cloudUpdateStageKey));
                      } else {
                        setServerOperation(null);
                      }
                    }}
                  >×</button>
                )}
              </header>
              <div className="cc-server-operation-body">
                <div className="cc-server-operation-line">
                  <span className="prompt">server@scenova:~$</span>
                  <b>{operationTerminal.status === "RUNNING" ? "processing" : operationTerminal.status === "SUCCESS" ? "completed" : "failed"}</b>
                </div>
                <p>{operationTerminal.message}</p>
                {operationTerminal.kind === "SYMBOL" && operationTerminal.target && (
                  <div className="cc-server-operation-meta"><span>Target Symbol</span><b>{operationTerminal.target}</b></div>
                )}
                {operationTerminal.kind === "CLOUD_UPDATE" && operationTerminal.target && (
                  <div className="cc-server-operation-meta"><span>Target Version</span><b>v{operationTerminal.target}</b></div>
                )}
                <div className="cc-server-operation-progress" aria-hidden="true"><i/></div>
              </div>
              <footer>
                <span>{operationTerminal.kind === "CLOUD_UPDATE"
                  ? operationTerminal.status === "FAILED"
                    ? "อัปเดตไม่สำเร็จ · ตรวจข้อความด้านบนแล้วกดปิด"
                    : cloudUpdateState === "WAITING_SAFE"
                      ? "ปิดหน้าต่างนี้เพื่อกดหยุดบอทเมื่อคุณพร้อม แล้วระบบจะอัปเดตต่อ"
                      : "SCENOVA กำลังอัปเดตบัญชีนี้ใน Terminal เดียว"
                  : operationTerminal.status === "RUNNING"
                    ? operationTerminal.kind === "STOP"
                      ? "Safe Stop ยังทำงานต่อแม้ย่อหน้าต่าง · กดการ์ดสถานะด้านบนเพื่อเปิดกลับ"
                      : "กำลังติดตามสถานะจาก Server อัตโนมัติทุก 1.5 วินาที"
                    : operationTerminal.status === "SUCCESS"
                      ? "สำเร็จ · หน้าต่างจะปิดอัตโนมัติ"
                      : "ไม่สำเร็จ · ตรวจข้อความด้านบนแล้วกดปิด"}</span>
                {(operationTerminal.status === "FAILED" || operationTerminal.canClose || (operationTerminal.kind === "STOP" && operationTerminal.status === "RUNNING")) && (
                  <button
                    type="button"
                    className="btn"
                    onClick={()=>{
                      if (operationTerminal.kind === "STOP" && operationTerminal.status === "RUNNING") {
                        setServerOperationMinimized(true);
                      } else if (operationTerminal.kind === "CLOUD_UPDATE") {
                        setDismissedCloudUpdateKey(String(operationTerminal.cloudUpdateKey || cloudUpdateStageKey));
                      } else {
                        setServerOperation(null);
                      }
                    }}
                  >{operationTerminal.kind === "STOP" && operationTerminal.status === "RUNNING" ? "ย่อไว้" : "ปิด"}</button>
                )}
              </footer>
            </section>
          </div>
        )}

        <dialog
          ref={ownerVpsDialogRef}
          className="cc-symbol-picker"
          onCancel={()=>{ if(!ownerVpsBusy) ownerVpsDialogRef.current?.close(); }}
        >
          <form className="cc-symbol-picker-card" onSubmit={moveOwnerLocalToVps}>
            <div className="cc-symbol-picker-head">
              <b>ย้ายบัญชีนี้ไป SCENOVA VPS</b>
              <button type="button" aria-label="ปิด" disabled={ownerVpsBusy} onClick={()=>ownerVpsDialogRef.current?.close()}>×</button>
            </div>
            <p className="cc-symbol-picker-source">
              {data.account
                ? data.account.account_number + " · " + data.account.broker_server
                : "บัญชี MT5 ปัจจุบัน"}
            </p>
            <label className="field">
              <span>MT5 Trading Password</span>
              <input
                className="input"
                autoFocus
                type="password"
                autoComplete="off"
                value={ownerVpsPassword}
                disabled={ownerVpsBusy}
                onChange={e=>setOwnerVpsPassword(e.target.value)}
                placeholder="กรอกรหัส Trading ของ MT5"
                required
              />
            </label>
            <p className="cc-symbol-picker-source">
              {isOwner
                ? "SCENOVA จะเลือก VPS ที่ ONLINE / HEALTHY และมี Capacity ให้อัตโนมัติ"
                : "ระบบจะใช้สิทธิ์แพ็กเกจ VPS ที่บัญชีนี้ซื้อไว้"} · Local เดิมจะถูกหยุดอย่างปลอดภัยก่อนติดตั้ง MT5 และ EA บน VPS
            </p>
            <div className="cc-symbol-picker-actions">
              <button type="button" className="btn" disabled={ownerVpsBusy} onClick={()=>ownerVpsDialogRef.current?.close()}>ยกเลิก</button>
              <button type="submit" className="btn primary" disabled={ownerVpsBusy || !ownerVpsPassword}>
                {ownerVpsBusy ? "กำลังย้าย..." : "ยืนยันย้ายไป VPS"}
              </button>
            </div>
          </form>
        </dialog>


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
                    <b>{isHeartbeatDelayed ? "EA Heartbeat ขาดช่วง" : isAgentOnline ? "EA ยังไม่ตอบสนอง" : "ยังไม่ได้เชื่อมต่อ MT5"}</b>
                    <span>{isHeartbeatDelayed ? "Windows Agent ยังเชื่อมอยู่ · กำลังรอ Heartbeat ถัดไป (ล่าสุด "+connectionAgeLabel+")" : isAgentOnline ? "Windows Agent ยังเชื่อมอยู่ แต่ EA ไม่ส่ง Heartbeat เกิน 60 วินาที · ตรวจ MT5/EA" : data.account.mode === "LOCAL" ? "เปิด MetaTrader 5 เพื่อเชื่อมต่อ" : "กำลังรอการเชื่อมต่อ"}</span>
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
                <div className="cc-v6-hero-main">
                  <div className="cc-v6-gold-stage"><ScenovaIcon name="gold" size={52}/><i/><i/></div>
                  <div className="cc-v6-symbol-copy">
                    <span className="cc-v4-eyebrow">SCENOVA · LIVE EXECUTION</span>
                    <div className="cc-symbol-title-row">
                      <h2>{metrics.symbol || settings.symbol}</h2>
                      {showCompactAccessCountdown && (
                        <span
                          className="cc-membership-mobile-countdown"
                          title={accessCompactTitle}
                          aria-label={unlimitedAccess ? "Owner Access ไม่จำกัดเวลา" : "เวลาสมาชิกคงเหลือ "+accessCompactCountdown}
                        >
                          {accessCompactLabel}
                        </span>
                      )}
                    </div>
                    <div className="cc-v6-symbol-chips" aria-label="Runtime connection">
                      <span title="ระบบที่บัญชีนี้กำลังใช้งาน">{runtimeModeLabel}</span>
                      <span title="ตำแหน่ง SCENOVA Trading Node">{runtimeLocationLabel}</span>
                      <span title="Ping จริงจาก MT5 ไป Broker Trade Server">{brokerPingMs>0?brokerPingMs.toFixed(0)+" ms":"— ms"}</span>
                      {showCompactAccessCountdown && (
                        <span
                          className="cc-membership-mini-countdown"
                          title={accessCompactTitle}
                          aria-label={unlimitedAccess ? "Owner Access ไม่จำกัดเวลา" : "เวลาสมาชิกคงเหลือ "+accessCompactCountdown}
                        >
                          {accessCompactLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className={"cc-v47-live-state cc-status-trigger "+(safeStopInProgress || statusNoticeCount > 0 ? "waiting" : state === "RUNNING" ? "running" : "idle")}
                  aria-haspopup="dialog"
                  aria-controls={safeStopInProgress && safeStopOperationRunning ? "cc-server-operation-dialog" : "cc-system-status"}
                  aria-label={safeStopInProgress ? "เปิดสถานะ Safe Stop" : "เปิดสถานะระบบ"+(statusNoticeCount ? " · "+statusNoticeCount+" รายการแจ้งเตือน" : "")}
                  onClick={()=>{
                    if (safeStopInProgress && safeStopOperationRunning) {
                      setServerOperationMinimized(false);
                    } else {
                      statusDialogRef.current?.showModal();
                    }
                  }}
                >
                  <i/>
                  <span className="cc-status-trigger-copy">
                    <b>{safeStopInProgress ? "กำลังหยุดบอท" : isHeartbeatDelayed ? "Reconnecting" : !isMt5Online ? "Waiting for MT5" : marketSessionClosed ? "Waiting Session" : state === "RUNNING" ? "Live Execution" : "Ready"}</b>
                    <small>{safeStopInProgress ? safeStopStatusDetail : "สถานะและอัปเดต"}</small>
                  </span>
                  <span className="cc-status-trigger-bell"><ScenovaIcon name="bell" size={16}/>{statusNoticeCount > 0 && <em>{statusNoticeCount}</em>}</span>
                </button>

                <div className="cc-v13-hero-actions" aria-label="ควบคุมบอท">
                  <div className="cc-v12-quick-actions cc-v19-hero-quick-actions">
                    <button className="symbol" disabled={symbolBusy} onClick={openTradingSymbolPicker}><ScenovaIcon name="trend" size={15}/><span><b>{desiredTradingSymbol||"Symbol"}</b><small>เลือก Symbol</small></span></button>
                    <button className="start" disabled={startBlocked} onClick={()=>command("/bot/start","ส่งคำสั่ง Start แล้ว บอทกำลังเริ่มทำงาน")}><ScenovaIcon name="play" size={15}/><span><b>เริ่มบอท</b><small>Start</small></span></button>
                    <button className="stop" disabled={stopBlocked} onClick={()=>command("/bot/stop","Safe Stop แล้ว · ไม่เปิดรอบใหม่ และรอรอบปัจจุบันปิดตามเงื่อนไขปกติ")}><ScenovaIcon name="stop" size={15}/><span><b>หยุดปลอดภัย</b><small>Safe Stop</small></span></button>
                    <button className="close" disabled={busy} onClick={async()=>{const ok=await confirmPopup({tone:"warning",title:"ยืนยันปิดสถานะทั้งหมด",message:"คำสั่งนี้จะปิด Position ของ SCENOVA ทั้งหมดทันที และรีเซ็ตสถานะรอบที่ค้างของบัญชีนี้ ใช้ได้แม้หน้าจอแสดง 0 Position ยืนยันดำเนินการหรือไม่?",confirmLabel:"ปิดสถานะทั้งหมด",cancelLabel:"ยกเลิก"});if(ok)await command("/bot/close-all","ส่งคำสั่งปิดสถานะทั้งหมดและรีเซ็ตสถานะแล้ว")}}><ScenovaIcon name="close" size={15}/><span><b>ปิดสถานะทั้งหมด</b><small>Close All Positions</small></span></button>
                    <button className="terminal" onClick={()=>setLogsOpen(true)}><ScenovaIcon name="terminal" size={15}/><span><b>Terminal</b><small>Live Logs</small></span></button>
                  </div>
                </div>
              </section>

              <dialog
                ref={symbolDialogRef}
                className="cc-symbol-picker"
                onCancel={()=>{ if(!symbolBusy) symbolDialogRef.current?.close(); }}
              >
                <div className="cc-symbol-picker-card">
                  <div className="cc-symbol-picker-head">
                    <b>Trading Symbol</b>
                    <button type="button" aria-label="ปิด" disabled={symbolBusy} onClick={()=>symbolDialogRef.current?.close()}>×</button>
                  </div>
                  <p className="cc-symbol-picker-source">แสดงเฉพาะ Symbol ที่ MT5 บัญชีนี้รายงานจาก Market Watch</p>
                  <select
                    autoFocus
                    value={tradingSymbol}
                    disabled={symbolBusy || tradingSymbolOptions.length===0}
                    onChange={(event)=>setTradingSymbol(event.target.value)}
                  >
                    {tradingSymbolOptions.length
                      ? tradingSymbolOptions.map(item=><option key={item} value={item}>{tradingSymbolLabel(item)}</option>)
                      : <option value="">รอ Symbol จาก MT5</option>}
                  </select>
                  <button
                    type="button"
                    className="confirm"
                    disabled={symbolBusy || !tradingSymbol}
                    onClick={applyTradingSymbol}
                  >
                    {symbolBusy ? "กำลังใช้..." : "ยืนยัน"}
                  </button>
                </div>
              </dialog>

              <section className="cc-kpi-grid cc-v3-kpis cc-v6-kpis cc-v12-kpis cc-v13-kpis">
                <DashboardMetric icon="wallet" label="ยอดเงิน" value={showLastKnownTelemetry?formatAccountMoney(metrics.balance,accountCurrency):"—"} sub={"Balance · "+accountCurrency} />
                <DashboardMetric icon="equity" label="มูลค่ารวม" value={showLastKnownTelemetry?formatAccountMoney(metrics.equity,accountCurrency):"—"} sub={"Equity · "+accountCurrency} />
                <DashboardMetric icon="pnl" label="กำไร / ขาดทุนวันนี้" value={showLastKnownTelemetry?formatAccountMoney(dashboardBotTodayProfit,accountCurrency,true):"—"} sub={"Bot P/L ทุกโหมด · "+accountCurrency} tone={showLastKnownTelemetry?(dashboardBotTodayProfit>=0?"good":"bad"):"neutral"} />
                <DashboardMetric icon="target" label="Win Rate วันนี้" value={Number(todayPerformance.trades||0)>0?Number(todayPerformance.winRate||0).toFixed(1)+"%":"—"} sub={Number(todayPerformance.trades||0)>0?Number(todayPerformance.wins||0)+" / "+Number(todayPerformance.trades||0)+" Basket":"ยังไม่มี Basket ปิดวันนี้"} tone={Number(todayPerformance.trades||0)>0?(Number(todayPerformance.winRate||0)>=60?"good":Number(todayPerformance.winRate||0)>=45?"warn":"bad"):"neutral"} />
                <DashboardMetric icon="risk" label="Drawdown วันนี้" value={Number(todayPerformance.trades||0)>0?Number(todayPerformance.drawdownPercent||0).toFixed(2)+"%":"0.00%"} sub={formatAccountMoney(-Math.abs(Number(todayPerformance.drawdownMoney||0)),accountCurrency)+" Realized DD"} tone={Number(todayPerformance.drawdownPercent||0)>=5?"bad":Number(todayPerformance.drawdownPercent||0)>=2?"warn":"good"} />
                <DashboardMetric icon="orders" label="ออเดอร์เปิด" value={showLastKnownTelemetry?currentPositions+" / "+configuredMaxPositions:"—"} sub="Open Positions" />
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
                    <div className="cc-v17-running-title"><span><ScenovaIcon name="orders" size={18}/></span><div><small>LIVE EXECUTION</small><b>ออเดอร์ที่กำลังรัน</b></div></div>
                    <div className="cc-v17-running-head-metrics">
                      <span className={"cc-v17-net-profit "+(liveNetProfit>0?"good":liveNetProfit<0?"bad":"neutral")}>
                        Net Profit <b>{formatAccountMoney(liveNetProfit,accountCurrency,true)}</b>
                      </span>
                      <em className={currentPositions>0?"live":"idle"}>{currentPositions>0?currentPositions+" Running":"No Position"}</em>
                    </div>
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
                          <span className={pnl>0?"pnl good":pnl<0?"pnl bad":"pnl"}>{formatAccountMoney(pnl,accountCurrency,true)}</span>
                        </div>;
                      }) : livePositionTelemetryMissing ? (
                        <div className="empty telemetry-missing">
                          <ScenovaIcon name="warning" size={20}/>
                          <span>
                            พบ {currentPositions} Position ใน MT5 แต่ EA ยังไม่ส่งรายละเอียดออเดอร์
                            <small>EA v{livePositionEaVersion} · Runtime ที่รองรับรายการสด v{livePositionRequiredVersion}</small>
                          </span>
                        </div>
                      ) : <div className="empty"><ScenovaIcon name="orders" size={20}/><span>ยังไม่มีออเดอร์ที่กำลังถือ</span></div>}
                    </div>
                  </div>
                </section>



                <section className="panel cc-v12-mode-performance">
                  <div className="cc-v12-card-head">
                    <div><span><ScenovaIcon name="pnl" size={17}/></span><div><small>PERFORMANCE BY MODE</small><b>สถิติรายโหมดวันนี้</b></div></div>
                    <em>Today</em>
                  </div>
                  <div className="cc-v12-mode-table">
                    <div className="head"><span>โหมด</span><span>Win Rate</span><span>Drawdown</span><span>Activity</span></div>
                    {modePerformanceToday.map((row:any)=>{
                      const mode=String(row.mode||"AUTO");
                      const active=mode===activeControlMode;
                      const win=Number(row.winRate||0);
                      const dd=Number(row.drawdownPercent||0);
                      const entries=Number(row.activityEntries ?? row.trades ?? 0);
                      const closedTrades=Number(row.closedTrades??0);
                      return <div key={mode} className={"row "+(active?"active":"")}>
                        <span className="mode"><i/>{mode}</span>
                        <span className={closedTrades>0?(win>=60?"good":win>=45?"warn":"bad"):"neutral"}>{closedTrades>0?win.toFixed(1)+"%":"—"}</span>
                        <span className={dd>=5?"bad":dd>=2?"warn":"good"}>{dd.toFixed(2)+"%"}<small>{formatAccountMoney(-Math.abs(Number(row.drawdownMoney||0)),accountCurrency)}</small></span>
                        <span>{entries}<small>{closedTrades>0?closedTrades+" Basket · ":""}{active?(botRunning?"Active":"Selected"):"Inactive"}</small></span>
                      </div>;
                    })}
                  </div>

                  <div className="cc-v46-performance-system">
                    <div className="cc-v46-performance-system-head">
                      <div>
                        <span><ScenovaIcon name="status" size={16}/></span>
                        <div><b>System Pulse</b><small>สถานะระบบแบบย่อ</small></div>
                      </div>
                      <em className={isMt5Online&&isAgentOnline?"good":"warn"}>{isMt5Online&&isAgentOnline?"All Online":isHeartbeatDelayed?"Reconnecting":"Check"}</em>
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
                        <b>{isMt5Online?"Connected":isHeartbeatDelayed?"Reconnecting":"Waiting"}</b>
                        <small>{heartbeatAgeSeconds.toFixed(0)}s heartbeat</small>
                      </div>
                    </div>
                  </div>
                </section>


              </div>


              <EaDecisionCenter
                key={[data.selectedSlot?.id || data.instance?.id, metrics.symbol || settings.symbol, metrics.controlMode || activeControlMode].join(":")}
                metrics={metrics}
                mode={activeControlMode}
                symbol={String(metrics.symbol || settings.symbol || "—")}
                state={state}
                online={isMt5Online}
                marketClosed={marketSessionClosed}
                observedAt={data.instance?.last_seen_at || null}
                digits={symbolDigits}
                lot={settings.lot}
                maxPositions={configuredMaxPositions}
                currency={accountCurrency}
                decisionLabel={latestDecisionCustomerText}
                marketRegimeLabel={marketRegimeText}
                spreadLabel={spreadValueLabel}
                liveStatus={liveStatus}
              />

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
                          <span className={pnl>0?"good":pnl<0?"bad":"neutral"}>{formatAccountMoney(pnl,accountCurrency,true)}</span>
                        </div>;
                      }) : <div className="cc-v42-empty">ยังไม่มี Position ที่เปิดอยู่</div>}
                    </div>
                  </div>
                  <div className="cc-v42-mini-stats">
                    <div><b>{currentPositions}</b><small>Positions</small></div>
                    <div><b>{openPositions.reduce((sum:number,p:any)=>sum+Number(p.volume||0),0).toFixed(2)}</b><small>Total Lot</small></div>
                    <div><b className={Number(metrics.basketProfit||0)>=0?"good":"bad"}>{formatAccountMoney(metrics.basketProfit,accountCurrency,true)}</b><small>{"Floating P/L · "+accountCurrency}</small></div>
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
                          ? formatAccountMoney(Math.max(0,Number(metrics.dailyProfit||0)),accountCurrency)+" / "+formatAccountMoney(settings.dailyProfitTargetMoney,accountCurrency)
                          : "ยังไม่ตั้งเป้า"}</small>
                      </div>
                    </div>
                    <div className="cc-v42-goal-copy">
                      <div><span>เป้าหมายวันนี้</span><b>{Number(settings.dailyProfitTargetMoney||0)>0?formatAccountMoney(settings.dailyProfitTargetMoney,accountCurrency):"—"}</b></div>
                      <div><span>กำไรปัจจุบัน</span><b className={Number(metrics.dailyProfit||0)>=0?"good":"bad"}>{formatAccountMoney(metrics.dailyProfit,accountCurrency,true)}</b></div>
                      <div><span>คงเหลือ</span><b>{Number(settings.dailyProfitTargetMoney||0)>0?formatAccountMoney(Math.max(0,Number(settings.dailyProfitTargetMoney||0)-Math.max(0,Number(metrics.dailyProfit||0))),accountCurrency):"—"}</b></div>
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
                    <span className={marketSessionClosed?"warn":isMt5Online?"good":isHeartbeatDelayed?"warn":"neutral"}>{marketSessionClosed?"Market Closed":isMt5Online?"Market Online":isHeartbeatDelayed?"Reconnecting":"Waiting MT5"}</span>
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
                  <b>{botStarting ? "กำลังเริ่ม" : botRunning ? "กำลังทำงาน" : "เริ่มบอท"}</b>
                </button>
                <button className="cc-mobile-command stop" disabled={stopBlocked} onClick={()=>command("/bot/stop","Safe Stop แล้ว · ไม่เปิดรอบใหม่ และรอรอบปัจจุบันปิดตามเงื่อนไขปกติ")}>
                  <span>■</span><b>หยุดบอท</b>
                </button>
              </div>
            </div>
          )
        )}

        {activeView === "account" && (
          <div className="account-workspace account-workspace-compact">
            <section className="panel account-card connection-mode-card">
              <div className="panel-head">
                <div>
                  <div className="eyebrow">CONNECTION MODE</div>
                  <h2>เลือกระบบเชื่อมต่อ</h2>
                </div>
                <div className="connection-mode-actions">
                  <span className="badge">{String(data.selectedSlot?.mode || "").toUpperCase() === "CLOUD" ? "VPS SERVER" : "LOCAL MT5"}</span>
                </div>
              </div>
              <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                <button
                  type="button"
                  className={"btn " + (String(data.selectedSlot?.mode || "").toUpperCase() === "LOCAL" ? "primary" : "ghost")}
                  disabled={!hasLocalConnectionSlot}
                  onClick={()=>selectConnectionMode("LOCAL")}
                >
                  Local MT5
                </button>
                <button
                  type="button"
                  className={"btn " + (String(data.selectedSlot?.mode || "").toUpperCase() === "CLOUD" ? "primary" : "ghost")}
                  disabled={!hasCloudConnectionSlot}
                  onClick={()=>selectConnectionMode("CLOUD")}
                >
                  VPS Server
                </button>
              </div>
            </section>

            {(entitlement?.source === "SUBSCRIPTION" || entitlement?.source === "SUBSCRIPTION_EXPIRED") && accessExpiry && accessRemaining !== null ? (
              <MembershipCountdownCard
                remainingMs={accessRemaining}
                expiresAt={accessExpiry}
                planCode={String(entitlement?.planCode || "")}
                mode={String(data.selectedSlot?.mode || "")}
              />
            ) : entitlement?.source === "OWNER" ? (
              <MembershipCountdownCard
                unlimited
                mode={String(data.selectedSlot?.mode || "")}
              />
            ) : null}

            {String(data.selectedSlot?.mode || "").toUpperCase() === "CLOUD" && !ownerCloudAccess && !primaryCloudActive && (
              <section className="membership-expiry-warning primary-expired" role="alert">
                <div className="membership-expiry-warning-icon">!</div>
                <div className="membership-expiry-warning-copy">
                  <small>PRIMARY VPS PACKAGE · SLOT #1 EXPIRED</small>
                  <b>แพ็กเกจ VPS หลักหมดอายุ · VPS Slot เสริมทั้งหมดถูกระงับ</b>
                  <p>ต่ออายุแพ็กเกจหลักก่อนเพื่อกลับมาใช้งาน ระบบจะไม่เพิ่มหรือลดวันคงเหลือของ Slot เสริม</p>
                </div>
                <button type="button" className="btn primary" onClick={openPrimaryPackagePage}>
                  ต่ออายุแพ็กเกจหลัก
                </button>
              </section>
            )}

            {cloudRenewalWarning && (
              <section className="membership-expiry-warning" role="alert">
                <div className="membership-expiry-warning-icon">!</div>
                <div className="membership-expiry-warning-copy">
                  <small>PRIMARY VPS PACKAGE · เหลือน้อยกว่า 3 วัน</small>
                  <b>กรุณาต่ออายุแพ็กเกจหลัก Slot #1 ก่อนหมดอายุ</b>
                  <p>
                    เมื่อแพ็กเกจหลักหมดอายุ Server จะปิด MT5 บน VPS ทุก Slot ทันที แม้ Slot เสริมยังมีวันเหลืออยู่
                    การปิด MT5 ไม่ได้ปิด Position ที่ Broker ให้อัตโนมัติ
                  </p>
                </div>
                <button type="button" className="btn primary" onClick={openPrimaryPackagePage}>
                  ต่ออายุแพ็กเกจหลัก
                </button>
              </section>
            )}

            {String(data.selectedSlot?.mode || "").toUpperCase() === "CLOUD" && (
              <VpsSlotManager
                slots={cloudSlots}
                summary={cloudSlotSummary}
                selectedSlotId={String(data.selectedSlot?.id || "")}
                ownerUnlimited={ownerCloudAccess}
                primaryActive={primaryCloudActive}
                canBuy={canBuyVpsSlot}
                capacity={Number(cloudCatalog?.available || 0)}
                ownerCanPrice={String(data.user?.role || "").toUpperCase()==="OWNER"}
                onSelect={(slotId:string)=>selectSlot(slotId)}
                onConnect={(slotId:string)=>prepareCloudMt5Dialog(slotId,"NEW")}
                onDelete={(slotId:string)=>void deleteVpsSlot(slotId)}
                onBuy={()=>openVpsSlotDialog("")}
                onRenew={(slotId:string)=>openVpsSlotDialog(slotId)}
                onPrimaryRenew={openPrimaryPackagePage}
                onConfigurePricing={openOwnerAddonPricing}
              />
            )}

            {data.selectedSlot?.mode === "LOCAL" ? (
              <>
                <Mt5ConnectionExperience
                  account={data.account}
                  online={accountConnectionOnline}
                  busy={busy}
                  downloadBlocked={desired==="RUNNING" || (state==="RUNNING" && isMt5Online) || Number(data?.instance?.metrics?.positions || 0)>0}
                  apiBase={mt5ApiBase}
                  message={activationMessage}
                  error={error}
                  onDownload={downloadWindowsInstaller}
                  vpsMove={{
                    hasAccess:Boolean(data.account) && (isOwner || customerHasCloudMigrationAccess),
                    isOwner,
                    busy:ownerVpsBusy,
                    blockedReason:
                      desired === "RUNNING" || state === "RUNNING"
                        ? "กรุณากด Safe Stop ก่อนย้ายไป VPS"
                        : Number(data?.instance?.metrics?.positions || 0) > 0
                          ? "ต้องไม่มี Position ค้างก่อนย้ายไป VPS"
                          : "",
                    packageHref:"/packages?system=cloud&from=mt5-ea",
                    progress:vpsMigrationProgress,
                    onMove:openOwnerVpsMigration,
                    onRetry:()=>{
                      setVpsMigrationProgress(null);
                      setError("");
                    }
                  }}
                />
              </>
            ) : vpsMigrationProgress ? (
              <VpsMigrationProgressCard
                progress={vpsMigrationProgress}
                onRetry={()=>{
                  setVpsMigrationProgress(null);
                  setError("");
                }}
              />
            ) : null}

            {data.selectedSlot?.mode === "LOCAL" && (
              <>

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

              </>
            )}

            {data.selectedSlot?.mode === "CLOUD" && data.account && (
              <section className="panel vps-connected-card">
                <div className="vps-connected-copy">
                  <div className="eyebrow">SELECTED VPS SLOT</div>
                  <div className="vps-connected-title-row">
                    <h2>{data.account.account_number}</h2>
                    <span className={"badge " + (isMt5Online ? "" : "warn")}>
                      <span className={"dot " + (isMt5Online ? "green" : "amber")}/>
                      {isMt5Online ? "ออนไลน์" : "ออฟไลน์"}
                    </span>
                  </div>
                  <p className="muted">{data.account.broker} · {data.account.broker_server} · Slot #{data.selectedSlot?.slot_number || "—"}</p>
                </div>
                <div className="vps-connected-actions">
                  {!isMt5Online && (
                    <button
                      type="button"
                      className="btn primary"
                      disabled={busy}
                      onClick={()=>prepareCloudMt5Dialog(String(data.selectedSlot?.id || ""),"RECONNECT")}
                    >
                      เชื่อม MT5 ใหม่
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={
                      busy ||
                      state==="RUNNING" ||
                      desired==="RUNNING" ||
                      Number(data?.instance?.metrics?.positions || 0)>0 ||
                      Number(data?.instance?.metrics?.accountScenovaPendingOrders || 0)>0
                    }
                    title={
                      state==="RUNNING" || desired==="RUNNING"
                        ? "หยุดบอทก่อนเปลี่ยนบัญชี"
                        : Number(data?.instance?.metrics?.positions || 0)>0 || Number(data?.instance?.metrics?.accountScenovaPendingOrders || 0)>0
                          ? "ปิด Position และ Pending Order ให้หมดก่อนเปลี่ยนบัญชี"
                          : "เปลี่ยนบัญชี MT5 ได้ทันที"
                    }
                    onClick={()=>void beginCloudAccountChange()}
                  >
                    {busy ? "กำลังดำเนินการ..." : "เปลี่ยนบัญชี VPS"}
                  </button>
                </div>
              </section>
            )}

          </div>
        )}

        <dialog
          ref={cloudMt5DialogRef}
          className="cloud-mt5-dialog"
          onClose={()=>{
            setTradingPassword("");
            setCloudMt5DialogAccountId("");
            setCloudMt5DialogMode("NEW");
          }}
        >
          <form className="cloud-mt5-dialog-card" onSubmit={submitCloudMt5Dialog}>
            <header className="cloud-mt5-dialog-head">
              <div>
                <div className="eyebrow">VPS MT5 CONNECTION</div>
                <h2>{cloudMt5DialogMode === "RECONNECT" ? "เชื่อม MT5 เดิมอีกครั้ง" : "เชื่อมบัญชี MT5"}</h2>
              </div>
              <button type="button" aria-label="ปิด" disabled={busy} onClick={()=>cloudMt5DialogRef.current?.close()}>×</button>
            </header>

            <div className="cloud-mt5-dialog-grid">
              <label className="field">
                <span>MT5 Login</span>
                <input
                  className="input"
                  inputMode="numeric"
                  autoFocus
                  value={accountNumber}
                  readOnly={cloudMt5DialogMode === "RECONNECT"}
                  onChange={e=>setAccountNumber(e.target.value.replace(/\D/g,""))}
                  placeholder="เช่น 12345678"
                  required
                />
              </label>

              <label className="field">
                <span>Broker</span>
                <select
                  className="input"
                  value={brokerCode}
                  disabled={cloudMt5DialogMode === "RECONNECT"}
                  onChange={e=>{
                    setBrokerCode(e.target.value);
                    setBrokerServer("");
                    setCustomBrokerServer("");
                  }}
                  required
                >
                  {brokerCatalog.map(b=><option key={b.code} value={b.code}>{b.name}</option>)}
                  {!brokerCatalog.length && <option value="EXNESS">Exness</option>}
                  <option value="OTHER">อื่น ๆ</option>
                </select>
              </label>

              {brokerCode === "OTHER" && (
                <label className="field">
                  <span>ชื่อ Broker</span>
                  <input
                    className="input"
                    value={customBrokerName}
                    readOnly={cloudMt5DialogMode === "RECONNECT"}
                    onChange={e=>setCustomBrokerName(e.target.value)}
                    placeholder="ชื่อ Broker"
                    required
                  />
                </label>
              )}

              <label className="field cloud-mt5-server-field">
                <span>MT5 Server</span>
                <input
                  className="input"
                  list="cloud-mt5-server-options"
                  value={brokerServer}
                  readOnly={cloudMt5DialogMode === "RECONNECT"}
                  onChange={e=>setBrokerServer(e.target.value)}
                  placeholder="พิมพ์ เช่น 13 หรือ Exness-MT5Real13"
                  autoComplete="off"
                  required
                />
                <datalist id="cloud-mt5-server-options">
                  {(selectedBroker?.servers || []).map(server=>(
                    <option key={server.serverName} value={server.serverName}>
                      {server.environment!=="UNKNOWN" ? server.environment : ""}
                    </option>
                  ))}
                </datalist>
                {cloudMt5DialogMode !== "RECONNECT" && brokerServer.trim() && mt5ServerSuggestions.length > 0 && (
                  <div className="cloud-mt5-server-suggestions">
                    {mt5ServerSuggestions.map(server=>(
                      <button
                        type="button"
                        key={server.serverName}
                        onClick={()=>setBrokerServer(server.serverName)}
                      >
                        <b>{server.serverName}</b>
                        {server.environment!=="UNKNOWN" && <span>{server.environment}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </label>

              <label className="field cloud-mt5-password-field">
                <span>MT5 Trading Password</span>
                <input
                  className="input"
                  type="password"
                  autoComplete="off"
                  value={tradingPassword}
                  onChange={e=>setTradingPassword(e.target.value)}
                  placeholder="Trading Password"
                  required
                />
              </label>
            </div>

            <footer className="cloud-mt5-dialog-actions">
              <button type="button" className="btn ghost" disabled={busy} onClick={()=>cloudMt5DialogRef.current?.close()}>
                ยกเลิก
              </button>
              <button type="submit" className="btn primary" disabled={busy}>
                {busy ? "กำลังเชื่อม..." : cloudMt5DialogMode === "RECONNECT" ? "เชื่อม MT5 ใหม่" : "เชื่อมบัญชีนี้"}
              </button>
            </footer>
          </form>
        </dialog>

        <dialog
          ref={vpsSlotDialogRef}
          className="vps-slot-dialog"
          onClose={()=>{
            setVpsSlipFile(null);
            if (!vpsPaymentOrderId) setVpsRenewSlotId("");
          }}
        >
          <div className="vps-slot-dialog-shell">
            <header className="vps-slot-dialog-head">
              <div>
                {ownerAddonPriceEditorOpen && <div className="eyebrow">OWNER · ADD-ON PRICING</div>}
                <h2>
                  {ownerAddonPriceEditorOpen
                    ? "ตั้งราคา VPS Slot เสริม"
                    : vpsPaymentOrder
                      ? "ชำระเงิน VPS Slot เสริม"
                      : vpsRenewSlot
                        ? "ต่ออายุ VPS Slot เสริม #" + vpsRenewSlot.slot_number
                        : "ซื้อ VPS Slot เสริม"}
                </h2>
              </div>
              <div className="vps-slot-dialog-head-actions">
                {String(data.user?.role || "").toUpperCase()==="OWNER" && !ownerAddonPriceEditorOpen && !vpsPaymentOrder && (
                  <button type="button" className="btn ghost" onClick={openOwnerAddonPricing}>ตั้งราคา Slot เสริม</button>
                )}
                <button type="button" className="vps-slot-dialog-close" onClick={()=>vpsSlotDialogRef.current?.close()} aria-label="ปิด">×</button>
              </div>
            </header>

            {ownerAddonPriceEditorOpen ? (
              <section className="vps-addon-price-editor">
                <div className="vps-addon-price-note">
                  <b>ราคา Slot เสริม</b>
                  <span>ตั้งราคา 1 / 3 / 6 / 12 เดือนได้อิสระ การแก้ราคานี้จะไม่เปลี่ยนราคาแพ็กเกจหลัก</span>
                </div>
                <div className="vps-addon-price-grid">
                  {[1,3,6,12].map(months=>{
                    const row = ownerAddonPrices[months] || {priceBaht:"",enabled:false};
                    return (
                      <div className="vps-addon-price-row" key={months}>
                        <div>
                          <b>{months} เดือน</b>
                          <small>ต่อ 1 VPS Slot เสริม</small>
                        </div>
                        <label>
                          <span>ราคา (บาท)</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={row.priceBaht}
                            onChange={event=>setOwnerAddonPrices(current=>({
                              ...current,
                              [months]:{...(current[months] || {priceBaht:"",enabled:false}),priceBaht:event.target.value}
                            }))}
                          />
                        </label>
                        <label className="vps-addon-price-toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(row.enabled)}
                            onChange={event=>setOwnerAddonPrices(current=>({
                              ...current,
                              [months]:{...(current[months] || {priceBaht:"",enabled:false}),enabled:event.target.checked}
                            }))}
                          />
                          <span>เปิดขาย</span>
                        </label>
                      </div>
                    );
                  })}
                </div>
                <div className="vps-addon-price-actions">
                  <button type="button" className="btn ghost" disabled={vpsPurchaseBusy} onClick={()=>setOwnerAddonPriceEditorOpen(false)}>
                    กลับ
                  </button>
                  <button type="button" className="btn primary" disabled={vpsPurchaseBusy} onClick={()=>void saveOwnerAddonPrices()}>
                    {vpsPurchaseBusy ? "กำลังบันทึก..." : "บันทึกราคา Slot เสริม"}
                  </button>
                </div>
              </section>
            ) : !vpsPaymentOrder ? (
              <>
                <section className="vps-slot-package-section">
                  <div className="vps-slot-dialog-label">เลือกระยะเวลา</div>
                  <div className="vps-slot-package-grid">
                    {vpsPackages.map(pack=>(
                      <button
                        key={pack.months}
                        type="button"
                        className={"vps-slot-package-option " + (Number(pack.months)===Number(vpsPurchaseMonths) ? "active" : "")}
                        onClick={()=>setVpsPurchaseMonths(Number(pack.months))}
                      >
                        <span>{pack.months} เดือน</span>
                        <b>฿{(Number(pack.price_satang || 0)/100).toLocaleString("th-TH",{maximumFractionDigits:2})}</b>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="vps-slot-order-summary">
                  <div>
                    <span>{vpsRenewSlot ? "ต่ออายุ Slot เสริม" : "VPS Slot เสริมใหม่"}</span>
                    <b>{vpsRenewSlot ? "#" + vpsRenewSlot.slot_number : "เพิ่ม 1 Slot"}</b>
                  </div>
                  <div>
                    <span>ระยะเวลา</span>
                    <b>{selectedVpsPackage?.months || vpsPurchaseMonths} เดือน</b>
                  </div>
                  <div className="total">
                    <span>ยอดชำระ</span>
                    <b>฿{(Number(selectedVpsPackage?.price_satang || 0)/100).toLocaleString("th-TH",{maximumFractionDigits:2})}</b>
                  </div>
                </section>

                {!canCheckoutVpsOrder && (
                  <div className="vps-slot-capacity-warning">
                    {!primaryCloudActive
                      ? "แพ็กเกจ VPS หลัก Slot #1 หมดอายุ กรุณาต่ออายุแพ็กเกจหลักก่อนซื้อหรือต่ออายุ Slot เสริม"
                      : !cloudCatalog?.checkoutEnabled
                        ? "ยังไม่สามารถชำระเงินได้ในขณะนี้"
                        : "VPS Slot เต็มชั่วคราว กรุณาลองใหม่ภายหลัง"}
                  </div>
                )}

                <button
                  type="button"
                  className="btn primary btn-lg vps-slot-checkout-button"
                  disabled={vpsPurchaseBusy || !selectedVpsPackage || !canCheckoutVpsOrder}
                  onClick={()=>void createVpsSlotOrder()}
                >
                  {vpsPurchaseBusy ? "กำลังดำเนินการ..." : vpsRenewSlot ? "ชำระเงินต่ออายุ" : "ชำระเงิน"}
                </button>
              </>
            ) : (
              <section className="vps-slot-payment-stage">
                <div className="vps-slot-payment-summary">
                  <div>
                    <span>ระยะเวลา</span>
                    <b>{vpsPaymentOrder.months} เดือน</b>
                  </div>
                  <div className="total">
                    <span>ยอดชำระ</span>
                    <b>฿{(Number(vpsPaymentOrder.amount || 0)/100).toLocaleString("th-TH",{maximumFractionDigits:2})}</b>
                  </div>
                </div>

                {vpsPaymentOrder.qr_url ? (
                  <div className="vps-slot-qr-wrap">
                    <img src={vpsPaymentOrder.qr_url} alt="QR ชำระเงิน VPS Slot"/>
                  </div>
                ) : String(cloudCatalog?.paymentMode || "").toUpperCase() === "EASYSLIP" ? (
                  <div className="vps-slot-bank-card">
                    <span className="vps-slot-bank-icon"><ScenovaIcon name="wallet" size={24}/></span>
                    <div>
                      <b>{vpsPaymentAccount?.nameTh || vpsPaymentAccount?.nameEn || "SCENOVA"}</b>
                      <strong>{vpsPaymentAccount?.bankNumber || "—"}</strong>
                      <span>{vpsPaymentAccount?.bankShortCode || "BANK"}{vpsPaymentAccount?.bankName ? " · " + vpsPaymentAccount.bankName : ""}</span>
                    </div>
                  </div>
                ) : (
                  <div className="vps-slot-capacity-warning">QR ยังไม่พร้อม กรุณาลองใหม่</div>
                )}

                {String(cloudCatalog?.paymentMode || "").toUpperCase() === "EASYSLIP" ? (
                  <>
                    <label className="vps-slot-slip-upload">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        disabled={vpsPurchaseBusy}
                        onChange={e=>setVpsSlipFile(e.target.files?.[0] || null)}
                      />
                      <span>{vpsSlipFile ? vpsSlipFile.name : "แนบรูปสลิป"}</span>
                    </label>

                    {vpsSlipPreview && (
                      <div className="vps-slot-slip-preview">
                        <img src={vpsSlipPreview} alt="ตัวอย่างสลิป"/>
                      </div>
                    )}

                    <button
                      type="button"
                      className="btn primary btn-lg"
                      disabled={vpsPurchaseBusy || !vpsSlipFile}
                      onClick={()=>void verifyVpsSlotSlip()}
                    >
                      {vpsPurchaseBusy ? "กำลังยืนยัน..." : "ยืนยันการชำระเงิน"}
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn primary btn-lg" disabled={vpsPurchaseBusy} onClick={()=>void refreshVpsSlotOrder()}>
                    {vpsPurchaseBusy ? "กำลังตรวจสอบ..." : "ตรวจสอบการชำระเงิน"}
                  </button>
                )}

                <button type="button" className="btn ghost vps-slot-cancel-order" disabled={vpsPurchaseBusy} onClick={()=>void cancelVpsSlotOrder()}>
                  ยกเลิกรายการ
                </button>
              </section>
            )}
          </div>
        </dialog>

        {activeView === "backtest" && (
          <BacktestCenter
            slotId={selectedSlotId || data.selectedSlot?.id || ""}
            controlMode={activeControlMode}
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
                <TerminalStat label="CONNECTION" value={connectionLabel} tone={isMt5Online ? "good" : isHeartbeatDelayed ? "warn" : "bad"} />
                <TerminalStat label="ACTUAL" value={String(botLogs?.snapshot?.actual_state || state)} tone={state==="RUNNING" ? "good" : "neutral"} />
                <TerminalStat label="DESIRED" value={String(botLogs?.snapshot?.desired_state || desired)} tone={desired==="RUNNING" ? "good" : "neutral"} />
                <TerminalStat label="SPREAD" value={spreadValueLabel} />
                <TerminalStat label="MOMENTUM" value={Number(metrics.momentumPoints || 0).toFixed(1)} />
                <TerminalStat label="POSITIONS" value={String(metrics.positions || 0)} />
                <TerminalStat label="HEARTBEAT AGE" value={heartbeatAgeSeconds.toFixed(0) + "s"} tone={heartbeatAgeSeconds <= 20 ? "good" : heartbeatAgeSeconds <= 60 ? "warn" : "bad"} />
                <TerminalStat label="LATENCY" value={heartbeatLatencyMs > 0 ? heartbeatLatencyMs.toFixed(0) + " ms" : "—"} tone={heartbeatLatencyMs > 2000 ? "warn" : "neutral"} />
                <TerminalStat label="HTTP STATUS" value={heartbeatHttpStatus > 0 ? String(heartbeatHttpStatus) : "—"} tone={heartbeatHttpStatus >= 200 && heartbeatHttpStatus < 300 ? "good" : "bad"} />
                <TerminalStat label="LAST CONTACT" value={lastServerContactLabel} />
              </div>

              <div className="cc-terminal-drawer-meta">
                <div><span>Execution</span><b>{liveStatus.label}</b></div>
                <div><span>Daily P/L</span><b className={Number(metrics.dailyProfit || 0)>=0 ? "text-good" : "text-bad"}>{formatAccountMoney(metrics.dailyProfit,accountCurrency,true)}</b></div>
                <div><span>Basket P/L</span><b className={Number(metrics.basketCycleProfit || metrics.basketProfit || 0)>=0 ? "text-good" : "text-bad"}>{formatAccountMoney(metrics.basketCycleProfit || metrics.basketProfit,accountCurrency,true)}</b></div>
                <div><span>Last order</span><b>retcode {String(metrics.lastOrderRetcode || "—")} / error {String(metrics.lastOrderError || 0)}</b></div>
                <div><span>Adaptive Spread</span><b>{spreadStatusLabel[spreadStatus] || spreadStatus} · P95 {spreadMetricLabel(metrics.spreadP95Points)}</b></div>
                <div><span>Spread cost</span><b>{formatAccountMoney(metrics.spreadCost,accountCurrency)} · {Number(metrics.adaptiveLot || settings.lot).toFixed(2)} lot</b></div>
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

function VpsSlotManager(props:{
  slots:any[];
  summary:{total:number;online:number;ready:number;expiring:number};
  selectedSlotId:string;
  ownerUnlimited:boolean;
  primaryActive:boolean;
  canBuy:boolean;
  capacity:number;
  ownerCanPrice:boolean;
  onSelect:(slotId:string)=>void;
  onConnect:(slotId:string)=>void;
  onDelete:(slotId:string)=>void;
  onBuy:()=>void;
  onRenew:(slotId:string)=>void;
  onPrimaryRenew:()=>void;
  onConfigurePricing:()=>void;
}) {
  const isPrimary = (slot:any) =>
    String(slot?.slot_type || "").toUpperCase()==="PERSONAL" ||
    Number(slot?.slot_number || 0)===1;
  const formatExpiry = (value:any) => {
    if (props.ownerUnlimited) return "ไม่จำกัดเวลา";
    if (!value) return "ยังไม่มีแพ็กเกจ";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("th-TH",{day:"2-digit",month:"short",year:"numeric"});
  };
  const slotTone = (slot:any) => {
    if (!props.ownerUnlimited && !props.primaryActive && !isPrimary(slot)) return "blocked";
    if (!props.ownerUnlimited && slot?.subscription_expires_at && new Date(slot.subscription_expires_at).getTime() <= Date.now()) return "expired";
    if (slot?.mt5_online) return "online";
    if (slot?.instance_id) return "offline";
    return "ready";
  };
  const slotLabel = (slot:any) => {
    const tone = slotTone(slot);
    if (tone==="blocked") return "PRIMARY EXPIRED";
    if (tone==="expired") return "EXPIRED";
    if (tone==="online") return "ONLINE";
    if (tone==="offline") return "OFFLINE";
    return "READY";
  };

  return (
    <section className="vps-slot-manager">
      <div className="vps-slot-manager-head">
        <div>
          <div className="eyebrow">VPS SLOT MANAGER</div>
          <h2>VPS Slots ของคุณ</h2>
        </div>
        <div className="vps-slot-manager-actions">
          <span className={"vps-capacity-pill " + (props.capacity>0 ? "good" : "bad")}>
            <i/> Capacity {Math.max(0,props.capacity)}
          </span>
          {props.ownerCanPrice && (
            <button type="button" className="btn ghost" onClick={props.onConfigurePricing}>ตั้งราคา Slot เสริม</button>
          )}
          <button type="button" className="btn primary" disabled={!props.canBuy} onClick={props.onBuy}>+ ซื้อ Slot เสริม</button>
        </div>
      </div>

      {!props.ownerUnlimited && !props.primaryActive && (
        <div className="vps-primary-gate-note">
          <b>แพ็กเกจหลัก Slot #1 หมดอายุ</b>
          <span>Slot เสริมทั้งหมดถูกพักการใช้งานจนกว่าจะต่ออายุแพ็กเกจหลัก วันคงเหลือของ Slot เสริมไม่เปลี่ยนแปลง</span>
          <button type="button" className="btn primary" onClick={props.onPrimaryRenew}>ต่ออายุแพ็กเกจหลัก</button>
        </div>
      )}

      <div className="vps-slot-stats">
        <div><span>Slots ทั้งหมด</span><b>{props.summary.total}</b></div>
        <div><span>ออนไลน์</span><b>{props.summary.online}</b></div>
        <div><span>พร้อมเชื่อม MT5</span><b>{props.summary.ready}</b></div>
        <div><span>ใกล้หมดอายุ</span><b>{props.summary.expiring}</b></div>
      </div>

      <div className="vps-slot-grid">
        {props.slots.map(slot=>{
          const selected = String(slot?.id || "") === String(props.selectedSlotId || "");
          const primary = isPrimary(slot);
          const tone = slotTone(slot);
          return (
            <article key={slot.id} className={"vps-slot-card tone-"+tone+(selected ? " selected" : "")}>
              <header>
                <div>
                  <span>{primary ? "PRIMARY VPS PACKAGE" : "VPS ADD-ON SLOT"}</span>
                  <h3>Slot #{slot.slot_number}</h3>
                </div>
                <span className={"vps-slot-status "+tone}><i/>{slotLabel(slot)}</span>
              </header>

              <div className={"vps-slot-kind "+(primary ? "primary" : "addon")}>
                {primary ? "แพ็กเกจหลัก" : "Slot เสริม"}
              </div>

              <div className="vps-slot-account">
                <small>MT5 ACCOUNT</small>
                <b>{slot.account_number || "ยังไม่ได้เชื่อม MT5"}</b>
                <span>
                  {tone==="blocked"
                    ? "แพ็กเกจหลักหมดอายุ · ระงับการใช้งานชั่วคราว"
                    : slot.account_number
                      ? ((slot.broker || "Broker")+" · "+(slot.broker_server || "Server"))
                      : "พร้อมสำหรับเชื่อมบัญชีใหม่"}
                </span>
              </div>

              <div className="vps-slot-meta">
                <div><span>EA</span><b>{tone==="blocked" ? "BLOCKED" : slot.actual_state || (slot.instance_id ? "STOPPED" : "NOT INSTALLED")}</b></div>
                <div><span>หมดอายุ</span><b>{formatExpiry(slot.subscription_expires_at)}</b></div>
              </div>

              <footer>
                <button
                  type="button"
                  className={"btn "+(selected ? "primary" : "ghost")}
                  disabled={tone==="blocked"}
                  onClick={()=>{
                    if (!slot.account_number) {
                      props.onConnect(String(slot.id));
                      return;
                    }
                    props.onSelect(String(slot.id));
                  }}
                >
                  {tone==="blocked" ? "รอต่ออายุแพ็กเกจหลัก" : slot.account_number ? (selected ? "กำลังจัดการ" : "จัดการ Slot") : "เชื่อม MT5"}
                </button>
                {!props.ownerUnlimited && (
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={!primary && !props.primaryActive}
                    onClick={()=>primary ? props.onPrimaryRenew() : props.onRenew(String(slot.id))}
                  >
                    {primary ? "ต่ออายุแพ็กเกจหลัก" : "ต่ออายุ Slot เสริม"}
                  </button>
                )}
                {!primary && (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={()=>props.onDelete(String(slot.id))}
                  >
                    ลบ Slot
                  </button>
                )}
              </footer>
            </article>
          );
        })}

        <button type="button" className="vps-slot-add-card" disabled={!props.canBuy} onClick={props.onBuy}>
          <span className="vps-slot-add-icon">+</span>
          <b>ซื้อ VPS Slot เสริม</b>
        </button>
      </div>
    </section>
  );
}

function MembershipCountdownCard(props:{remainingMs?:number;expiresAt?:Date;planCode?:string;mode?:string;unlimited?:boolean}) {
  const remainingMs = Math.max(0, Number(props.remainingMs || 0));
  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const expired = !props.unlimited && remainingMs <= 0;
  const countdown = props.unlimited
    ? "∞"
    : days > 0
      ? days+" วัน "+String(hours).padStart(2,"0")+":"+String(minutes).padStart(2,"0")+":"+String(seconds).padStart(2,"0")
      : String(hours).padStart(2,"0")+":"+String(minutes).padStart(2,"0")+":"+String(seconds).padStart(2,"0");

  return (
    <section className={"membership-countdown-card membership-compact-card "+(expired ? "expired" : "")} aria-live="polite">
      <div className="membership-compact-left">
        <span className="membership-countdown-icon"><ScenovaIcon name="clock" size={18}/></span>
        <div>
          <div className="membership-countdown-eyebrow">MEMBERSHIP</div>
          <div className="membership-countdown-status">
            {props.unlimited ? "Owner Access" : expired ? "สมาชิกหมดอายุ" : "สิทธิ์ใช้งานกำลัง Active"}
          </div>
          <div className="membership-countdown-meta">
            {props.unlimited
              ? ((props.mode || "CLOUD")+" · ไม่จำกัดเวลา")
              : ((props.planCode ? props.planCode+" · " : "")+(props.mode || "CLOUD")+" · หมดอายุ "+(props.expiresAt ? props.expiresAt.toLocaleString("th-TH",{dateStyle:"medium",timeStyle:"short",hour12:false}) : "—"))}
          </div>
        </div>
      </div>
      <div className="membership-compact-right">
        <span className="membership-compact-time">{countdown}</span>
        <span className="membership-countdown-badge">{props.unlimited ? "OWNER · UNLIMITED" : expired ? "EXPIRED" : "ACTIVE"}</span>
      </div>
    </section>
  );
}

function BacktestCenter(props:{slotId:string;controlMode:string;onError:(message:string)=>void;onNotice:(message:string)=>void}) {
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

  async function syncZeroHistory() {
    setBusy(true);
    try {
      const created = await api("/backtest/zero-history",{
        method:"POST",
        body:JSON.stringify({slotId:props.slotId})
      });
      props.onNotice("เชื่อมประวัติ ZERO GRID จริงเข้า Backtest Center แล้ว");
      await refresh(created.id);
    } catch (e:any) {
      props.onError(String(e?.message||"เชื่อมข้อมูล ZERO GRID ไม่สำเร็จ"));
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
  const selectedZeroLive = String(selected?.settings?.dataSource || "") === "LIVE_ZERO_HISTORY";
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
          {props.controlMode==="ZERO_GRID"&&<button className="btn primary" disabled={busy} onClick={syncZeroHistory}><ScenovaIcon name="strategy" size={16}/>เชื่อมผล ZERO จริง</button>}
          <button className="btn" disabled={busy} onClick={createSample}><ScenovaIcon name="strategy" size={16}/>สร้างตัวอย่าง</button>
        </div>
      </section>

      <div className="backtest-layout">
        <section className="panel backtest-run-list">
          <div className="panel-head">
            <div><div className="eyebrow">REPORTS</div><h2>รายงาน Backtest</h2></div>
            <span className="badge">{runs.length} รายการ</span>
          </div>
          <div className="backtest-run-scroll">
            {runs.map((run:any)=>{
              const zeroLive = String(run.settings?.dataSource || "") === "LIVE_ZERO_HISTORY";
              return <button key={run.id} className={"backtest-run-item "+(selected?.id===run.id?"active":"")} onClick={async()=>{
                setLoading(true);
                try{setSelected(await api("/backtest/run?id="+encodeURIComponent(run.id)));}
                catch(e:any){props.onError(String(e?.message||"เปิดรายงานไม่สำเร็จ"));}
                finally{setLoading(false);}
              }}>
                <div><b>{run.title}</b><small>{run.symbol+" · "+run.timeframe+" · "+new Date(run.created_at).toLocaleDateString("th-TH")}</small></div>
                <span className={zeroLive?"good":run.source==="SAMPLE"?"warn":""}>{zeroLive?"ZERO LIVE":run.source==="SAMPLE"?"ตัวอย่าง":"Backtest"}</span>
              </button>;
            })}
            {!loading&&!runs.length&&<div className="backtest-empty">ยังไม่มีรายงาน Backtest<br/><small>สร้างตัวอย่างเพื่อดูรูปแบบหน้ารายงานได้ทันที</small></div>}
          </div>
        </section>

        <section className="panel backtest-report">
          {selected ? (
            <>
              <div className="backtest-report-head">
                <div>
                  <div className="eyebrow">{selectedZeroLive?"ZERO LIVE HISTORY":selected.source==="SAMPLE"?"SIMULATED SAMPLE":"BACKTEST REPORT"}</div>
                  <h2>{selected.title}</h2>
                  <p>{selected.symbol+" · "+selected.timeframe+" · Lot "+Number(selected.lot||0).toFixed(2)+" · เงินเริ่มต้น "+formatAccountMoney(selected.initial_deposit,selected.currency)}</p>
                </div>
                <div className="backtest-actions">
                  <button className="btn" onClick={downloadCsv}>ดาวน์โหลด CSV</button>
                  <button className={selected.is_published?"btn danger-outline":"btn primary"} disabled={busy} onClick={togglePublish}>
                    {selected.is_published?"หยุดแชร์":"สร้างพอร์ตตัวอย่าง"}
                  </button>
                </div>
              </div>

              {selectedZeroLive&&<div className="notice good backtest-disclaimer"><b>ZERO GRID · ข้อมูลจริง</b><span>รายงานนี้สร้างจากรอบ ZERO GRID ที่ปิดจริงใน Trade Journal ไม่ใช่ข้อมูลจำลอง</span></div>}
              {selected.source==="SAMPLE"&&<div className="notice warn backtest-disclaimer"><b>ผลจำลองตัวอย่าง</b><span>ข้อมูลชุดนี้สร้างขึ้นเพื่อสาธิตหน้ารายงานเท่านั้น ไม่ใช่ผลการเทรดจริง</span></div>}

              <div className="backtest-kpis">
                  <BacktestKpi label="Net P/L" value={formatAccountMoney(summary.netProfit,selected.currency,true)} tone={Number(summary.netProfit||0)>=0?"good":"bad"}/>
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
                  <div className="backtest-chart-head"><div><b>Equity Curve</b><small>การเปลี่ยนแปลง Balance หลังแต่ละรายการ</small></div><strong>{formatAccountMoney(summary.finalBalance,selected.currency)}</strong></div>
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
                          <span className={Number(trade.profit||0)>=0?"text-good":"text-bad"}>{formatAccountMoney(trade.profit,selected.currency,true)}</span>
                          <span>{formatAccountMoney(trade.balance_after,selected.currency)}</span>
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
                    <span><b className={Number(position.profit||0)>=0?"text-good":"text-bad"}>{formatAccountMoney(position.profit,props.currency,true)}</b></span>
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
  const accountCurrency = normalizeAccountCurrency(props.metrics?.currency);
  const savedAccountCurrency = String(props.settings?.accountCurrency || "").trim().toUpperCase();
  const reportedAccountCurrency = String(props.metrics?.currency || "").trim().toUpperCase();
  const implicitCurrencyReviewRequired =
    Boolean(reportedAccountCurrency) &&
    (
      (Boolean(savedAccountCurrency) && savedAccountCurrency !== reportedAccountCurrency) ||
      (!savedAccountCurrency && reportedAccountCurrency !== "USD")
    );
  const currencyReviewRequired =
    props.settings?.accountCurrencyReviewRequired === true ||
    implicitCurrencyReviewRequired;
  const previousAccountCurrency = String(
    props.settings?.previousAccountCurrency ||
    savedAccountCurrency ||
    "UNSET"
  ).trim().toUpperCase();
  if (!props.open && !props.embedded) return null;
  const embedded = Boolean(props.embedded);
  const tradingSymbol = String(
    props.symbol ||
    props.metrics?.symbol ||
    props.settings?.startupSymbol ||
    props.settings?.symbol ||
    ""
  ).toUpperCase();
  const isBitcoinSymbol = tradingSymbol.includes("BTC") || tradingSymbol.includes("XBT");
  const zeroGridBlockedForSymbol = isBitcoinSymbol;

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
  const riskProfiles:Record<string,{basket:string;dailyLoss:string;dailyProfit:string}> = {
    AUTO:{basket:"autoMaxBasketLossMoney",dailyLoss:"autoDailyLossMoney",dailyProfit:"autoDailyProfitTargetMoney"},
    RACE:{basket:"raceMaxBasketLossMoney",dailyLoss:"raceDailyLossMoney",dailyProfit:"raceDailyProfitTargetMoney"},
    FLIP_LOCK:{basket:"flipLockMaxBasketLossMoney",dailyLoss:"flipLockDailyLossMoney",dailyProfit:"flipLockDailyProfitTargetMoney"},
    MANUAL:{basket:"manualMaxBasketLossMoney",dailyLoss:"manualDailyLossMoney",dailyProfit:"manualDailyProfitTargetMoney"}
  };
  const riskProfile = riskProfiles[controlMode] || riskProfiles.AUTO;
  const riskValue = (profileKey:string,genericKey:string) => Number(props.settings?.[profileKey] ?? props.settings?.[genericKey] ?? 0);
  const updateRiskValue = (profileKey:string,genericKey:string,value:any) => {
    props.onEdit?.(profileKey,value);
    props.onEdit?.(genericKey,value);
    if (controlMode === "MANUAL" && Number(value || 0) <= 0) {
      setRevealedManualRisk(previous=>({...previous,[profileKey]:false}));
    }
  };
  const profitKind = Number(props.settings?.manualPerPositionProfitMoney || 0) > 0 ? "POSITION" : "BASKET";
  const suggestedManualSl = String(Math.max(1, Math.round(Number(
    props.systemHardStopDistancePoints || props.hardStopDistancePoints || 1000
  ))));
  const modeCopy:Record<string,{title:string;subtitle:string}> = {
    AUTO:{title:"AUTO · VECTOR EDGE",subtitle:"Vector Edge / V20 เป็นเจ้าของเฉพาะ Position ที่ AUTO เปิดเอง · Lot ต่อไม้ใช้ค่าที่ตั้งแบบตายตัว · ไม่รับช่วง Position จากโหมดอื่น"},
    FLIP_LOCK:{title:"FLIP LOCK",subtitle:"อ่านราคา MT5 โดยตรง · เมื่อกำไรบวกมากพอให้ Broker วาง SL ฝั่งกำไรได้ จะยก SL และไล่ตาม Tick โดยไม่รอราคา/คำสั่งจาก Server"},
    RACE:{title:"RACE",subtitle:"เพิ่มความถี่ในการเปิดสถานะเพื่อให้ครบจำนวนที่กำหนดเร็วขึ้น โดยแยกการบริหารรอบจากโหมดอัตโนมัติ"},
    ZERO_GRID:{title:"ZERO GRID",subtitle:"วางคำสั่ง BUY STOP และ SELL STOP แบบสมมาตร รองรับ 1–30 ระดับต่อฝั่ง"},
    MANUAL:{title:"MANUAL",subtitle:"โหมดตั้งค่าด้วยตนเอง ใช้เป้ากำไรและ Stop ของ MANUAL เอง และไม่ส่ง Position ให้ AUTO V20 จัดการ"}
  };

  const applyControlMode = (mode:string) => {
    if (mode === "ZERO_GRID" && zeroGridBlockedForSymbol) return;
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
    const nextRiskProfile = riskProfiles[mode];
    if (nextRiskProfile) {
      props.onEdit?.("maxBasketLossMoney",Number(props.settings?.[nextRiskProfile.basket] ?? 0));
      props.onEdit?.("dailyLossMoney",Number(props.settings?.[nextRiskProfile.dailyLoss] ?? 0));
      props.onEdit?.("dailyProfitTargetMoney",Number(props.settings?.[nextRiskProfile.dailyProfit] ?? 0));
    }
    // ZERO GRID is price-only and does not use AUTO direction/brain settings.
    if (mode === "ZERO_GRID") {
      props.onEdit?.("engineMode","ZERO_GRID");
      props.onEdit?.("profitTargetMode","OFF");
      props.onEdit?.("zeroGridStepPrice",Number(props.settings?.zeroGridStepPrice) === 2 ? 2 : 3);
      if (typeof props.settings?.zeroGridLowVolatilityEnabled !== "boolean") props.onEdit?.("zeroGridLowVolatilityEnabled",false);
      props.onEdit?.("zeroGridLevelsPerSide",Math.max(1,Math.min(30,Number(props.settings?.zeroGridLevelsPerSide)||10)));
      if (!Number.isFinite(Number(props.settings?.zeroGridBaseLot)) || Number(props.settings?.zeroGridBaseLot) <= 0) props.onEdit?.("zeroGridBaseLot",0.01);
      if (!Number.isFinite(Number(props.settings?.zeroGridMinNetProfitMoney)) || Number(props.settings?.zeroGridMinNetProfitMoney) <= 0.01) props.onEdit?.("zeroGridMinNetProfitMoney",0.5);
      props.onEdit?.("zeroGridCloseReserveMoney",0);
      return;
    }
    // Keep the currently selected direction when switching control modes.
    if (mode === "RACE") {
      props.onEdit?.("engineMode","RACE");
      props.onEdit?.("profitTargetMode","OFF");
      const raceMode = String(props.settings?.raceProfitTargetMode || "BASKET").toUpperCase();
      props.onEdit?.("raceProfitTargetMode",["BASKET","POSITION","OFF"].includes(raceMode) ? raceMode : "BASKET");
      if (!Number.isFinite(Number(props.settings?.raceCloseAllProfitMoney)) || Number(props.settings?.raceCloseAllProfitMoney) <= 0) props.onEdit?.("raceCloseAllProfitMoney",0.5);
      if (!Number.isFinite(Number(props.settings?.racePerPositionProfitMoney)) || Number(props.settings?.racePerPositionProfitMoney) <= 0) props.onEdit?.("racePerPositionProfitMoney",0.5);
      return;
    }
    props.onEdit?.("engineMode","AUTO");
    if (mode === "FLIP_LOCK") {
      props.onEdit?.("profitTargetMode","OFF");
      props.onEdit?.("maxPositions",1);
      props.onEdit?.("dailyProfitContinueAfterTarget",false);
      props.onEdit?.("dailyProfitDrawdownPercent",0);
      return;
    }
    if (mode === "AUTO") {
      props.onEdit?.("profitTargetMode","AUTO");
      // AUTO keeps its own target; switching mode never rewrites MANUAL.
      return;
    }
    props.onEdit?.("profitTargetMode","MANUAL");
    if (Number(props.settings?.manualBasketProfitTargetMoney || 0) <= 0 &&
        Number(props.settings?.manualPerPositionProfitMoney || 0) <= 0) {
      props.onEdit?.("manualBasketProfitTargetMoney",10);
    }
    // Keep MANUAL Stop Loss exactly as the user left it. Zero means OFF;
    // switching away and back must never silently re-enable a suggested ATR/point stop.
  };

  const directionLabel = entryMode === "SELL_ONLY" ? "SELL เท่านั้น" : entryMode === "BUY_ONLY" ? "BUY เท่านั้น" : "อัตโนมัติ · EA เลือก BUY / SELL";
  const directionHelp = controlMode === "FLIP_LOCK"
    ? (entryMode === "AUTO_MOMENTUM"
        ? "ไม้แรกใช้ Momentum/โครงสร้าง · หลังไม้ปิด ระบบอ่านแรงแท่ง M1 + Momentum ใหม่แล้วเข้า Market ทันที"
        : "กำหนดทิศทางของไม้แรก · หลังจากไม้ปิด ระบบประเมินแรงแท่งใหม่ก่อนเข้า Market รอบถัดไป")
    : (entryMode === "AUTO_MOMENTUM"
        ? "M1 / M5 / M15 / M30 / H1 วิเคราะห์ทิศทางอัตโนมัติ"
        : "บังคับทิศตามที่เลือกจนกว่าจะเปลี่ยนค่า");
  const raceProfitTargetMode = String(props.settings?.raceProfitTargetMode || "BASKET").toUpperCase();
  const raceCloseAllProfitEnabled = raceProfitTargetMode === "BASKET";
  const raceCloseAllProfitMoney = Number(props.settings?.raceCloseAllProfitMoney || 0.5);
  const racePerPositionProfitMoney = Number(props.settings?.racePerPositionProfitMoney || 0.5);
  const manualStopEnabled = Number(props.settings?.manualStopLossPoints || 0) > 0;
  const updateOptionalValue = (key:string,value:any) => props.onEdit?.(key,value);
  const exitLabel = controlMode === "FLIP_LOCK"
    ? "Trailing SL จากราคา MT5 โดยตรง"
    : controlMode === "RACE"
      ? (raceProfitTargetMode === "POSITION"
          ? "ปิดแต่ละไม้ที่ "+formatAccountMoney(racePerPositionProfitMoney,accountCurrency,true)
          : raceProfitTargetMode === "BASKET"
            ? "ปิดทั้งชุดที่ "+formatAccountMoney(raceCloseAllProfitMoney,accountCurrency,true)
            : "ไม่ได้ตั้งเป้ากำไร RACE")
      : controlMode === "AUTO"
        ? (Number(props.settings.autoProfitTargetMoney||0) > 0
            ? formatAccountMoney(props.settings.autoProfitTargetMoney,accountCurrency)+" ทั้งชุด · ถึงแล้วปิดทันที"
            : "ยังไม่ได้ตั้งเป้ากำไร")
        : controlMode === "MANUAL"
          ? (profitKind === "POSITION" ? formatAccountMoney(props.settings.manualPerPositionProfitMoney,accountCurrency)+" ต่อไม้" : formatAccountMoney(props.settings.manualBasketProfitTargetMoney,accountCurrency)+" ทั้งชุด · ถึงแล้วปิดทันที")
          : "—";
  const slLabel = controlMode === "FLIP_LOCK"
    ? "Safety Stop ก่อน · ยก SL เมื่อ Broker ล็อกกำไรได้"
    : controlMode === "MANUAL"
      ? Number(manualSl).toFixed(0)+" points"
      : controlMode === "RACE"
        ? "ATR × 1.50"
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
          {currencyReviewRequired&&<div className="cc-bot-v2-summary-note"><ScenovaIcon name="shield" size={17}/><span><b>ตรวจหน่วยเงินก่อนเริ่มบอท</b><small>{previousAccountCurrency+" → "+reportedAccountCurrency+" · ตรวจ Profit / Loss / Target ทุกโหมด แล้วกดบันทึกการตั้งค่า ระบบจะยังไม่ให้ Start จนกว่าจะบันทึก"}</small></span></div>}
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
            {isBitcoinSymbol&&<div className="cc-bot-v2-summary-note"><ScenovaIcon name="status" size={17}/><span><b>BTC Mode Support</b><small>AUTO · RACE · FLIP LOCK · MANUAL ใช้งานได้ · ZERO GRID ถูกบล็อก</small></span></div>}
            {embedded ? (
              <div className="cc-bot-v12-mode-select-wrap">
                <label>
                  <span><ScenovaIcon name="brain" size={17}/>โหมดการเทรด <small>Trading Mode</small></span>
                  <select className="input cc-bot-v12-mode-select" value={controlMode} disabled={props.locked} onChange={e=>applyControlMode(e.target.value)} style={{colorScheme:"dark"}}>
                    <option value="AUTO">AUTO</option>
                    <option value="RACE">RACE</option>
                    <option value="FLIP_LOCK">FLIP LOCK</option>
                    <option value="ZERO_GRID" disabled={zeroGridBlockedForSymbol}>ZERO GRID{zeroGridBlockedForSymbol ? " · ไม่รองรับ BTC" : ""}</option>
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
                  {id:"ZERO_GRID",icon:"layers",tag:zeroGridBlockedForSymbol?"ไม่รองรับ BTC":"กริดแบบ Hedging"},
                  {id:"MANUAL",icon:"settings",tag:"กำหนดรายละเอียด"}
                ].map(mode=>{
                  const blocked = mode.id === "ZERO_GRID" && zeroGridBlockedForSymbol;
                  return <button key={mode.id} type="button" role="radio" aria-checked={controlMode===mode.id} disabled={blocked} className={(controlMode===mode.id?"active ":"")+(blocked?"is-disabled":"")} onClick={()=>applyControlMode(mode.id)}>
                    <span className="cc-bot-v2-mode-icon"><ScenovaIcon name={mode.icon} size={22}/></span>
                    <span><em>{mode.tag}</em><b>{modeCopy[mode.id].title}</b><small>{blocked?"BTC/XBT ใช้ ZERO GRID ไม่ได้ · เลือก AUTO, RACE, FLIP LOCK หรือ MANUAL":modeCopy[mode.id].subtitle}</small></span>
                    <i className="cc-bot-v2-radio"/>
                  </button>;
                })}
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
                    <label className="cc-bot-v2-field"><span><ScenovaIcon name="profit" size={17}/>เป้ากำไรสุทธิ</span><MoneyInput value={props.settings.zeroGridMinNetProfitMoney || 0.5} currency={accountCurrency} suffix="เงินบัญชี" onCommit={(v:string)=>props.onEdit?.("zeroGridMinNetProfitMoney",v)}/></label>
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

              {(controlMode==="AUTO"||controlMode==="RACE"||controlMode==="MANUAL")&&(
              <section className="cc-bot-v2-panel">
                <div className="cc-bot-v2-section-title compact"><span>03</span><div><b>กำไร / Stop Loss</b></div></div>
                {controlMode==="RACE" ? <div className="cc-bot-v2-fields exit-fields">
                  <div className="cc-bot-v2-field cc-bot-profit-kind-field">
                    <span><ScenovaIcon name="profit" size={17}/>รูปแบบกำไร RACE</span>
                    <div className="cc-bot-v2-choice-row cc-bot-v2-choice-inline">
                      <button type="button" className={raceProfitTargetMode==="BASKET"?"active":""} onClick={()=>{props.onEdit?.("raceProfitTargetMode","BASKET");props.onEdit?.("raceCloseAllProfitEnabled",true)}}><ScenovaIcon name="profit" size={16}/><span><b>ทั้งชุด</b></span></button>
                      <button type="button" className={raceProfitTargetMode==="POSITION"?"active":""} onClick={()=>{props.onEdit?.("raceProfitTargetMode","POSITION");props.onEdit?.("raceCloseAllProfitEnabled",false)}}><ScenovaIcon name="orders" size={16}/><span><b>ต่อไม้</b></span></button>
                    </div>
                  </div>
                  <label className="cc-bot-v2-field"><span><ScenovaIcon name="profit" size={17}/>{raceProfitTargetMode==="POSITION"?"เป้ากำไร RACE ต่อไม้":"เป้ากำไร RACE ทั้งชุด"}</span><MoneyInput value={raceProfitTargetMode==="POSITION"?racePerPositionProfitMoney:raceCloseAllProfitMoney} currency={accountCurrency} suffix="เงินบัญชี" onCommit={(v:string)=>props.onEdit?.(raceProfitTargetMode==="POSITION"?"racePerPositionProfitMoney":"raceCloseAllProfitMoney",v)}/><small>ใช้เฉพาะ RACE · ถึงเป้าที่เลือกแล้วจึงปิดกำไร</small></label>
                </div> : controlMode==="AUTO" ? <div className="cc-bot-v2-fields exit-fields">
                  <label className="cc-bot-v2-field"><span><ScenovaIcon name="profit" size={17}/>เป้ากำไร AUTO</span><MoneyInput value={props.settings.autoProfitTargetMoney || 0} currency={accountCurrency} suffix="เงินบัญชี" onCommit={(v:string)=>props.onEdit?.("autoProfitTargetMoney",v)}/><small>ใช้เฉพาะ AUTO · ถึงแล้วปิด Basket ทันที</small></label>
                  <div className="cc-bot-v2-engine-line"><ScenovaIcon name="target" size={16}/><b>Hard Profit Target</b><span>ถึงจำนวนเงินที่ตั้งไว้แล้วปิดทั้งชุดทันที ไม่รอ Reversal / Giveback / EMA</span></div>
                </div> : <div className="cc-bot-v2-fields exit-fields">
                  <div className="cc-bot-v2-field cc-bot-profit-kind-field">
                    <span><ScenovaIcon name="profit" size={17}/>รูปแบบกำไร</span>
                    <div className="cc-bot-v2-choice-row cc-bot-v2-choice-inline">
                      <button type="button" className={profitKind==="BASKET"?"active":""} onClick={()=>{props.onEdit?.("manualBasketProfitTargetMoney",Number(props.settings.manualBasketProfitTargetMoney||10));props.onEdit?.("manualPerPositionProfitMoney",0)}}><ScenovaIcon name="profit" size={16}/><span><b>ทั้งชุด</b></span></button>
                      <button type="button" className={profitKind==="POSITION"?"active":""} onClick={()=>{props.onEdit?.("manualPerPositionProfitMoney",Number(props.settings.manualPerPositionProfitMoney||2));props.onEdit?.("manualBasketProfitTargetMoney",0)}}><ScenovaIcon name="orders" size={16}/><span><b>ต่อไม้</b></span></button>
                    </div>
                  </div>
                  <label className="cc-bot-v2-field"><span><ScenovaIcon name="profit" size={17}/>{profitKind==="BASKET"?"เป้ากำไร MANUAL ทั้งชุด":"เป้ากำไร MANUAL ต่อไม้"}</span><MoneyInput value={profitKind==="BASKET"?props.settings.manualBasketProfitTargetMoney:props.settings.manualPerPositionProfitMoney} currency={accountCurrency} suffix="เงินบัญชี" onCommit={(v:string)=>props.onEdit?.(profitKind==="BASKET"?"manualBasketProfitTargetMoney":"manualPerPositionProfitMoney",v)}/><small>ใช้เฉพาะ MANUAL · ไม่เปลี่ยนค่า AUTO/RACE/ZERO</small></label>
                  <div className="cc-bot-v2-field">
                    <span><ScenovaIcon name="shield" size={17}/>Stop Loss</span>
                    <ToggleNumberField alwaysShowInput label="เปิด" defaultValue={suggestedManualSl} value={props.settings.manualStopLossPoints} suffix="points" onChange={(v:string)=>updateOptionalValue("manualStopLossPoints",v)}/><small>ปิด = ไม่มี Broker Stop Loss · เปิด = ใช้ระยะ points ที่ตั้งไว้ตรง ๆ</small>
                  </div>
                </div>}
              </section>
              )}

              {controlMode!=="ZERO_GRID"&&(
              <section className="cc-bot-v2-panel">
                <div className="cc-bot-v2-section-title compact"><span>04</span><div><b>Risk Controls</b></div></div>
                <div className="cc-bot-v2-limit-grid">
                  {(controlMode!=="MANUAL" || riskValue(riskProfile.basket,"maxBasketLossMoney")>0 || revealedManualRisk[riskProfile.basket])&&<div><div><ScenovaIcon name="risk" size={18}/><span><b>ขาดทุนสูงสุดต่อรอบ</b></span></div><ToggleMoneyField alwaysShowInput label="เปิด" defaultValue="10" value={riskValue(riskProfile.basket,"maxBasketLossMoney")} currency={accountCurrency} suffix="เงินบัญชี" onChange={(v:string)=>updateRiskValue(riskProfile.basket,"maxBasketLossMoney",v)}/></div>}
                  {(controlMode!=="MANUAL" || riskValue(riskProfile.dailyLoss,"dailyLossMoney")>0 || revealedManualRisk[riskProfile.dailyLoss])&&<div><div><ScenovaIcon name="pnl" size={18}/><span><b>ขาดทุนสูงสุดต่อวัน</b></span></div><ToggleMoneyField alwaysShowInput label="เปิด" defaultValue="25" value={riskValue(riskProfile.dailyLoss,"dailyLossMoney")} currency={accountCurrency} suffix="เงินบัญชี" onChange={(v:string)=>updateRiskValue(riskProfile.dailyLoss,"dailyLossMoney",v)}/></div>}
                  {(controlMode!=="MANUAL" || riskValue(riskProfile.dailyProfit,"dailyProfitTargetMoney")>0 || revealedManualRisk[riskProfile.dailyProfit])&&<div><div><ScenovaIcon name="target" size={18}/><span><b>เป้ากำไรต่อวัน</b></span></div><ToggleMoneyField alwaysShowInput label="เปิด" defaultValue="10" value={riskValue(riskProfile.dailyProfit,"dailyProfitTargetMoney")} currency={accountCurrency} suffix="เงินบัญชี" onChange={(v:string)=>updateRiskValue(riskProfile.dailyProfit,"dailyProfitTargetMoney",v)}/></div>}
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
                <div><dt>เป้ากำไรสุทธิ</dt><dd>{formatAccountMoney(props.settings.zeroGridMinNetProfitMoney||0.5,accountCurrency)} · ถึงแล้วปิดทันที</dd></div>
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
  const currency = normalizeAccountCurrency(props.currency);
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
      <span className="money-prefix">{currency}</span>
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
          currency={props.currency}
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
        <b>{"รอบนี้ "+formatAccountMoney(props.cycleProfit,props.currency,true)+" · สูงสุด "+formatAccountMoney(props.peakProfit,props.currency,true)}</b>
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
          currency={props.currency}
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
          ? <><b>Profit Run เปิดอยู่:</b> <b>{formatAccountMoney(targetValue,props.currency)}</b> คือจุดเริ่มปล่อยกำไรวิ่ง ไม่ใช่จุดปิด · EA จะปิดเมื่อกำไรย่อลงตามเปอร์เซ็นต์ที่เลือก</>
          : <>ถึงกำไรรวม <b>{formatAccountMoney(targetValue,props.currency)}</b> → ปิดทุกออเดอร์ในชุดทันที</>}
        <br/>
        <small>{"EA ใช้ Basket Cycle P/L ของรอบเทรด · ตอนนี้ "+formatAccountMoney(props.currentCycleProfit,props.currency,true)}</small>
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
            <option key={value} value={value}>{formatAccountMoney(value,props.currency)}</option>
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
