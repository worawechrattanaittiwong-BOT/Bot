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
};

type BrokerCatalog = {
  code: string;
  name: string;
  servers: Array<{
    serverName: string;
    environment: "DEMO" | "REAL" | "UNKNOWN";
  }>;
};

type View = "overview" | "account" | "settings" | "access";

const defaultSettings = {
  symbol: "XAUUSD",
  lot: 0.01,
  maxPositions: 10,
  basketTriggerMoney: 2,
  basketTrailMoney: 0.5,
  maxBasketLossMoney: 10,
  dailyLossMoney: 25,
  maxSpreadPoints: 300,
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
  const mt5ApiBase =
    process.env.NEXT_PUBLIC_MT5_API_BASE ||
    (typeof window !== "undefined" ? window.location.origin + "/backend" : "");

  async function load(slotIdArg?: string) {
    try {
      const slotId = slotIdArg ?? selectedSlotIdRef.current;
      const d = await api("/bot/dashboard" + (slotId ? "?slotId=" + encodeURIComponent(slotId) : ""));
      setData(d);
      setSettings({ ...defaultSettings, ...(d.settings || {}) });
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
    if (requestedView === "overview" || requestedView === "account" || requestedView === "settings" || requestedView === "access") {
      setActiveView(requestedView);
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
    "ACCOUNT_TRADING_DISABLED",
    "ACCOUNT_EXPERT_DISABLED",
    "SYMBOL_TRADING_DISABLED",
    "NO_ACCESS"
  ]);
  const startBlocked = busy || !entitlement?.allowed || hardStartBlocks.has(String(liveStatus.code || ""));
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
        throw new Error("กรุณาหยุดบอทก่อนติดตั้ง ย้ายเครื่อง หรืออัปเกรด Device Lock");
      }

      const result = await api("/bot/installers/windows", {
        method: "POST",
        body: JSON.stringify({ slotId: selectedSlotIdRef.current || undefined })
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
      setActivationMessage("ดาวน์โหลด SCENOVA Setup แล้ว ดับเบิลคลิกไฟล์ .exe ที่ได้จากหน้านี้เพื่อติดตั้ง ไม่ต้องใช้ CMD หรือ PowerShell");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function requestMt5Change() {
    if (!data?.account) return;
    if (!confirm(
      "เตรียมเปลี่ยนบัญชี MT5 ของ Slot นี้ใช่หรือไม่?\n\n" +
      "ระบบจะ Safe Stop ก่อน จากนั้นให้ Login MT5 บัญชีใหม่บนเครื่องเดิม แล้วกลับมากด “ใช้บัญชีนี้”"
    )) return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api(
        "/bot/mt5/change-request?slotId=" + encodeURIComponent(selectedSlotIdRef.current),
        { method: "POST" }
      );
      setNotice(result?.message || "พร้อมเปลี่ยน MT5 แล้ว กรุณา Login บัญชีใหม่ใน MT5 บนเครื่องเดิม");
      await load(selectedSlotIdRef.current);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function rebindDetectedAccount() {
    if (!data?.instance?.pending_account_number) return;
    if (!confirm("เปลี่ยน Slot นี้มาใช้ MT5 " + data.instance.pending_account_number + " (" + (data.instance.pending_broker_server || "ไม่ทราบ Server") + ") ใช่หรือไม่?")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/bot/mt5/rebind?slotId=" + encodeURIComponent(selectedSlotIdRef.current), { method: "POST" });
      setNotice("เปลี่ยนบัญชี MT5 ให้ Slot นี้แล้ว ไม่ต้องเปลี่ยน .set หรือ Install Token");
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
      "InpMaxSpreadPoints=" + settings.maxSpreadPoints,
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

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const suffix = selectedSlotIdRef.current ? "?slotId=" + encodeURIComponent(selectedSlotIdRef.current) : "";
      await api("/bot/settings" + suffix, { method: "PUT", body: JSON.stringify(settings) });
      setNotice("บันทึกค่าการเทรดแล้ว");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function handleOwnerNavigate(href:string) {
    if (!href.startsWith("/dashboard?view=")) return false;
    const requested = new URL(href, window.location.origin).searchParams.get("view");
    if (requested === "overview" || requested === "account" || requested === "settings" || requested === "access") {
      setActiveView(requested);
      setError("");
      setNotice("");
      window.history.pushState({}, "", href);
      window.scrollTo({ top: 0, behavior: "smooth" });
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
    activeView === "settings" ? "trading-settings" :
    activeView === "access" ? "trading-access" :
    "trading-overview";

  const navItems: Array<{id:View;label:string;hint:string}> = [
    { id:"overview", label:"ภาพรวม", hint:"สถานะและควบคุมบอท" },
    { id:"account", label:"บัญชี MT5", hint:"Slots, Device และการเชื่อมต่อ" },
    { id:"settings", label:"ตั้งค่าบอท", hint:"กลยุทธ์และความเสี่ยง" },
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
              {activeView === "overview" && "ภาพรวมการทำงาน"}
              {activeView === "account" && "บัญชีและการเชื่อมต่อ MT5"}
              {activeView === "settings" && "ตั้งค่าบอทและความเสี่ยง"}
              {activeView === "access" && "สิทธิ์ใช้งาน"}
            </h2>
            <div className="muted page-subtitle">
              {activeView === "overview" && "ดูสิ่งสำคัญและสั่งงานบอทจากจุดเดียว"}
              {activeView === "account" && "ติดตั้งจากเว็บไซต์ จัดการ Device และเปลี่ยน MT5 โดยไม่ต้องเปลี่ยน .set"}
              {activeView === "settings" && "ปรับค่าที่มีผลต่อการเข้าออเดอร์และการควบคุมความเสี่ยง"}
              {activeView === "access" && "ตรวจสถานะ Trial สมาชิก และเวลาคงเหลือ"}
            </div>
          </div>
          <div className="status-row">
            <span className="badge"><span className={"dot " + (isMt5Online ? "green":"red")}/>{connectionLabel}</span>
            <span className="badge"><span className={"dot " + (desired==="RUNNING" ? "blue":"purple")}/>{desired==="RUNNING" ? "บอทกำลังทำงาน" : "บอทหยุดอยู่"}</span>
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
                        <span className="metric-label-with-info">Momentum <InfoTip text="ค่าการเคลื่อนที่ของราคาที่ EA วัดแบบ Real-time จาก Tick ล่าสุด ใช้ประกอบ AUTO_MOMENTUM ค่านี้เป็นค่าตลาด ไม่ใช่ช่องที่ผู้ใช้ตั้งโดยตรง" /></span>
                        <b>{Number(metrics.momentumPoints ?? 0).toFixed(1)}</b>
                      </span>
                      <span>
                        <span className="metric-label-with-info">Spread <InfoTip text="ตัวหน้า = Spread ปัจจุบันจาก Broker ปรับจากเว็บไม่ได้ · ตัวหลัง = Max Spread ที่คุณตั้งได้ ถ้า Spread ปัจจุบันสูงกว่า Max Spread บอทจะรอและไม่เปิดออเดอร์ใหม่" /></span>
                        <b>{Number(metrics.spreadPoints ?? 0).toFixed(1)} / {Number(settings.maxSpreadPoints ?? 50)} pt</b>
                      </span>
                      <span>
                        <span className="metric-label-with-info">Algo <InfoTip text="สถานะปุ่ม Algo Trading หลักของ MetaTrader 5 ต้องเป็น ON จึงจะอนุญาตให้ EA ส่งคำสั่งเทรด" /></span>
                        <b>{metrics.terminalTradeAllowed === false ? "OFF" : metrics.terminalTradeAllowed === true ? "ON" : "รอ EA v1.002"}</b>
                      </span>
                      <span>
                        <span className="metric-label-with-info">EA Trading <InfoTip text="สถานะ Allow Algo Trading ของ EA บนกราฟ ต้องเป็น ON เช่นกัน ไม่เช่นนั้น EA เชื่อม Server ได้แต่ส่ง Order ไม่ได้" /></span>
                        <b>{metrics.mqlTradeAllowed === false ? "OFF" : metrics.mqlTradeAllowed === true ? "ON" : "รอ EA v1.002"}</b>
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
                    <button className="btn primary btn-lg" title="สั่งให้ EA เริ่มประเมินเงื่อนไขและเปิดออเดอร์เมื่อเงื่อนไขผ่าน" disabled={startBlocked} onClick={()=>command("/bot/start","ส่งคำสั่ง Start แล้ว กำลังรอ EA ยืนยันสถานะการทำงานแบบ Real-time")}>▶ เริ่มบอท</button>
                    <button className="btn purple btn-lg" title="หยุดการเปิดออเดอร์ใหม่ แต่ยังให้ EA จัดการ Basket/Position ที่มีอยู่ตาม Logic ความปลอดภัย" disabled={busy} onClick={()=>command("/bot/stop","ส่งคำสั่งหยุดอย่างปลอดภัยแล้ว")}>■ หยุดอย่างปลอดภัย</button>
                  </div>
                  <button className="btn danger full" title="สั่ง EA ปิด Position ของบอททั้งหมดและหยุดบอท" disabled={busy} onClick={()=>command("/bot/close-all","ส่งคำสั่งปิดออเดอร์ทั้งหมดแล้ว")}>⚠ ปิดออเดอร์ทั้งหมด</button>
                  <div className="control-help-row">
                    <span><InfoTip text="เริ่มบอท: เปลี่ยนสถานะเป็น RUNNING แต่ไม่ได้บังคับเปิด Order ทันที EA ยังต้องรอ Momentum, Spread และเงื่อนไขความปลอดภัยให้ผ่าน" /> เริ่มบอท</span>
                    <span><InfoTip text="หยุดอย่างปลอดภัย: ห้ามเปิดรอบใหม่ แต่ Position/Basket ที่มีอยู่ยังถูก EA จัดการตาม Logic ที่กำหนด" /> Safe Stop</span>
                    <span><InfoTip text="ปิดออเดอร์ทั้งหมด: ส่งคำสั่ง CLOSE ALL ให้ EA ปิด Position ที่บอทจัดการอยู่ แล้วหยุดระบบ" /> Close All</span>
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
                    <div><span>การเชื่อมต่อ</span><b className={isMt5Online ? "text-good":"text-warn"}>{connectionLabel}</b></div>
                    <div><span>Bot State</span><b>{state}</b></div>
                    <div><span>คำสั่งจากเว็บ</span><b>{desired}</b></div>
                    <div><span>Execution</span><b className={liveStatus.tone === "good" ? "text-good" : liveStatus.tone === "bad" ? "text-bad" : "text-warn"}>{liveStatus.label}</b></div>
                    <div><span>เหตุผล</span><b>{liveStatus.detail}</b></div>
                    <div><span>สิทธิ์</span><b>{accessLabel}</b></div>
                    <div><span>Heartbeat</span><b>{eaLastSeenAgeSeconds >= 0 ? eaLastSeenAgeSeconds.toFixed(1) + " วินาทีที่แล้ว" : "—"}</b></div>
                  </div>
                  <button className="btn full" onClick={()=>setActiveView("account")}>ดูรายละเอียดการเชื่อมต่อ</button>
                </section>
              </div>

              <div className="grid2 overview-inspection-grid">
                <section className="panel overview-settings-card">
                  <div className="panel-head">
                    <div><div className="eyebrow">CURRENT SETTINGS</div><h2>ค่าที่บอทใช้อยู่</h2></div>
                    <button className="btn" onClick={()=>setActiveView("settings")}>แก้ไขการตั้งค่า</button>
                  </div>
                  <div className="overview-setting-grid">
                    <div><span>Symbol</span><b>{settings.symbol}</b></div>
                    <div><span>Lot</span><b>{settings.lot}</b></div>
                    <div><span>Entry Mode</span><b>{settings.entryMode}</b></div>
                    <div><span>Max Positions</span><b>{settings.maxPositions}</b></div>
                    <div><span>Basket Trigger</span><b>${settings.basketTriggerMoney}</b></div>
                    <div><span>Basket Trail</span><b>${settings.basketTrailMoney}</b></div>
                    <div><span>Max Basket Loss</span><b>${settings.maxBasketLossMoney}</b></div>
                    <div><span>Daily Loss Limit</span><b>${settings.dailyLossMoney}</b></div>
                    <div><span>Max Spread <InfoTip text="Spread สูงสุดที่ยอมให้เปิด Order ใหม่ ปรับได้ แต่ตั้งสูงเกินไปอาจทำให้ต้นทุนเข้าออเดอร์แพงขึ้น" /></span><b>{settings.maxSpreadPoints} pt</b></div>
                    <div><span>Min Order Interval</span><b>{settings.minOrderIntervalMs} ms</b></div>
                    <div><span>Max Orders / Min</span><b>{settings.maxOrdersPerMinute}</b></div>
                  </div>
                </section>

                <section className="panel overview-access-card">
                  <div className="panel-head">
                    <div><div className="eyebrow">ACCOUNT & ACCESS</div><h2>สถานะพร้อมใช้งาน</h2></div>
                    <button className="btn" onClick={()=>setActiveView("access")}>ดูสิทธิ์</button>
                  </div>
                  <div className="detail-list">
                    <div><span>MT5</span><b className={isMt5Online ? "text-good":"text-warn"}>{connectionLabel}</b></div>
                    <div><span>Bot State</span><b>{state}</b></div>
                    <div><span>คำสั่งจากเว็บ</span><b>{desired}</b></div>
                    <div><span>Execution</span><b>{liveStatus.label}</b></div>
                    <div><span>เหตุผลล่าสุด</span><b>{liveStatus.detail}</b></div>
                    <div><span>สิทธิ์</span><b>{accessLabel}</b></div>
                    {accessExpiry && <div><span>หมดอายุ</span><b>{accessExpiry.toLocaleString("th-TH")}</b></div>}
                  </div>
                </section>
              </div>
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
                      : "สมัคร SCENOVA ได้โดยไม่ต้องกรอก MT5 แล้วค่อยเชื่อมจาก Slot นี้"}
                  </p>
                </div>
                <div className="account-card-actions">
                  <span className="badge">
                    <span className={"dot "+(isMt5Online?"green":"red")}/>
                    {connectionLabel}
                  </span>
                  {data.selectedSlot?.mode === "LOCAL" && data.account && (
                    <button
                      className="btn primary"
                      disabled={busy || state==="RUNNING" || desired==="RUNNING" || !data.instance?.device_online}
                      onClick={requestMt5Change}
                    >
                      เปลี่ยนบัญชี MT5
                    </button>
                  )}
                </div>
              </div>
              {data.selectedSlot?.mode === "LOCAL" && data.account && !data.instance?.device_online && (
                <div className="help">ต้องให้ Device Agent ของเครื่องที่ลงทะเบียน Online ก่อน จึงจะกดเปลี่ยน MT5 ได้</div>
              )}
            </section>

            {data.selectedSlot?.mode === "LOCAL" && (
              <>
                <section className="panel purple website-install-panel">
                  <div className="panel-head">
                    <div>
                      <div className="eyebrow">WEBSITE-ONLY INSTALL</div>
                      <h2>{data.instance?.device_status === "ACTIVE" ? "เครื่องนี้ลงทะเบียนกับ SCENOVA แล้ว" : "ติดตั้ง / อัปเกรด SCENOVA จากเว็บไซต์"}</h2>
                      <p className="muted">
                        ลูกค้าติดตั้งจากหน้า SCENOVA เท่านั้น ระบบจะออกรหัสติดตั้งครั้งเดียวและผูก Device กับ Slot นี้
                        {data.instance?.id && data.instance?.device_status !== "ACTIVE"
                          ? " · เครื่องเดิมสามารถอัปเกรด Device Lock โดยระบบพยายามรักษา Instance/Token เดิม"
                          : ""}
                      </p>
                    </div>
                    <span className={"badge "+(data.instance?.device_status==="ACTIVE"?"agent-online":"")}>
                      <span className={"dot "+(data.instance?.device_status==="ACTIVE"?"green":"red")}/>
                      {data.instance?.device_status === "ACTIVE" ? "DEVICE LOCK ACTIVE" : "DEVICE UPGRADE REQUIRED"}
                    </span>
                  </div>

                  <div className="website-install-card">
                    <div className="website-install-copy">
                      <span className="auto-install-icon">EXE</span>
                      <div>
                        <b>SCENOVA Windows Setup</b>
                        <small>ไฟล์ .exe จาก Dashboard · ไม่ใช้ CMD / PowerShell · ลง EA + preset + Device Agent</small>
                      </div>
                    </div>
                    <button
                      className="btn primary btn-lg"
                      disabled={busy || desired==="RUNNING" || (state==="RUNNING" && isMt5Online)}
                      onClick={downloadWindowsInstaller}
                    >
                      {busy ? "กำลังเตรียม..." : data.instance?.device_status === "ACTIVE" ? "ติดตั้งใหม่ / ย้ายเครื่อง" : "ติดตั้งจากเว็บไซต์"}
                    </button>
                  </div>

                  {data.instance?.device_status === "ACTIVE" && (
                    <div className="device-lock-grid">
                      <div><span>Device</span><b>{data.instance.device_hostname || "REGISTERED PC"}</b></div>
                      <div><span>Agent</span><b className={data.instance.device_online?"text-good":"text-warn"}>{data.instance.device_online ? "ONLINE" : "OFFLINE"}</b></div>
                      <div><span>Last Seen</span><b>{data.instance.device_last_seen_at ? new Date(data.instance.device_last_seen_at).toLocaleString("th-TH") : "—"}</b></div>
                    </div>
                  )}

                  {activationMessage && <div className="notice good">{activationMessage}</div>}
                </section>

                {data.instance?.pending_account_number && (
                  <section className="panel detected-mt5-card">
                    <div className="detected-mt5-head">
                      <div>
                        <div className="eyebrow">NEW MT5 DETECTED</div>
                        <h2>พบบัญชี {data.instance.pending_account_number}</h2>
                        <p className="muted">{data.instance.pending_broker_server || "ไม่ทราบ Server"}</p>
                      </div>
                      <span className="owner-state-chip bad">SAFE STOP</span>
                    </div>
                    <div className="mt5-change-arrow">
                      <div><span>บัญชีเดิม</span><b>{data.account?.account_number || "ยังไม่มี"}</b></div>
                      <span>→</span>
                      <div><span>บัญชีที่ MT5 กำลัง Login</span><b>{data.instance.pending_account_number}</b></div>
                    </div>
                    <button
                      className="btn primary btn-lg"
                      disabled={busy || !data.instance.rebind_ready || state==="RUNNING" || desired==="RUNNING"}
                      onClick={rebindDetectedAccount}
                    >
                      ใช้บัญชีนี้
                    </button>
                    <div className="help">
                      {data.instance.rebind_ready
                        ? "ตรวจแล้วว่า EA และบัญชีใหม่มาจาก Device ที่ลงทะเบียนไว้ กดใช้บัญชีนี้ได้โดยไม่ต้องโหลด .set ใหม่"
                        : data.instance.account_change_requested_at
                          ? "รอ Device Agent และ Heartbeat จาก MT5 บัญชีใหม่บนเครื่องเดิม"
                          : "ถ้าต้องการเปลี่ยนอย่างปลอดภัย ให้กด “เปลี่ยนบัญชี MT5” ด้านบนก่อน แล้ว Login บัญชีใหม่ใน MT5"}
                    </div>
                  </section>
                )}

                <section className="panel first-install-guide">
                  <div className="eyebrow">FIRST INSTALL ONLY</div>
                  <h2>ครั้งแรกทำเพียงครั้งเดียว</h2>
                  <div className="first-install-steps">
                    <div><span>1</span><div><b>ดาวน์โหลด .exe จากหน้านี้</b><small>ห้ามใช้ไฟล์ที่ส่งต่อกัน ระบบจะตรวจ Enrollment และ Device</small></div></div>
                    <div><span>2</span><div><b>อนุญาต WebRequest</b><small>MT5 → Tools → Options → Expert Advisors → เพิ่ม <code>{mt5ApiBase}</code></small></div></div>
                    <div><span>3</span><div><b>ลาก FastBasketBot ลงกราฟ</b><small>Navigator → Expert Advisors → SCENOVA → FastBasketBot</small></div></div>
                    <div><span>4</span><div><b>Inputs → Load preset ครั้งแรก</b><small>เลือก <b>SCENOVA-FastBasketBot.set</b> ที่ Installer วางไว้ แล้วเปิด Algo Trading</small></div></div>
                  </div>
                  <div className="notice">
                    หลังจากนี้ถ้าจะเปลี่ยน Demo → Real หรือ MT5 ใหม่บนเครื่องเดิม: กด <b>“เปลี่ยนบัญชี MT5”</b> บนเว็บ → Login บัญชีใหม่ใน MT5 → ระบบตรวจพบและ Safe Stop → กด <b>“ใช้บัญชีนี้”</b> ไม่ต้องเปลี่ยน .set
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
                      <h2>เชื่อมบัญชี MT5 สำหรับ Cloud</h2>
                      <p className="muted">Cloud ยังต้องระบุบัญชีและ Trading Password เพื่อให้ Trading Node Login แทนคุณ</p>
                    </div>
                  </div>
                  <form className="form-grid form-grid-human" onSubmit={linkAccount}>
                    <div className="field">
                      <label>เลขบัญชี MT5</label>
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

        {activeView === "settings" && (
          !data.account ? <EmptySetup onNext={()=>setActiveView("account")} /> :
          <section className="panel settings-panel">
            <div className="panel-head"><div><div className="eyebrow">BOT SETTINGS</div><h2>ค่าการเทรดที่ใช้งานอยู่</h2><p className="muted">ค่าที่มีผลต่อความเสี่ยงจะแสดงคำอธิบายไว้ใต้ช่อง</p></div></div>
            <form className="form-grid form-grid-human" onSubmit={saveSettings}>
              <Field label="Symbol" info="ชื่อ Symbol ที่บอทใช้ ต้องตรงกับชื่อของ Broker เช่น XAUUSDm ถ้ากรอกไม่ตรง EA อาจไม่ทำงานกับสินทรัพย์ที่ต้องการ" help="ชื่อสัญลักษณ์ต้องตรงกับ Broker" value={settings.symbol} onChange={(v:string)=>setSettings({...settings,symbol:v})}/>
              <Field label="Lot" info="ขนาด Lot ต่อ Order สามารถปรับได้ ค่ายิ่งสูงความเสี่ยงและ Margin ที่ใช้ยิ่งสูง ควรทดสอบ Demo ก่อน" help="เริ่มจากค่าน้อยบน Demo ก่อน" type="number" step="0.01" value={settings.lot} onChange={(v:string)=>setSettings({...settings,lot:Number(v)})}/>
              <Field label="จำนวน Position สูงสุด" info="จำนวน Position สูงสุดที่บอทเปิดพร้อมกันได้ สามารถปรับได้ เมื่อถึงจำนวนนี้ EA จะหยุดเปิด Position ใหม่จนกว่าจะมีที่ว่าง" type="number" value={settings.maxPositions} onChange={(v:string)=>setSettings({...settings,maxPositions:Number(v)})}/>
              <Field label="กำไรรวมเริ่ม Trailing ($)" info="เมื่อกำไรรวมของ Basket ถึงค่านี้ ระบบเริ่มจำ Peak Profit เพื่อใช้ Trailing กำไร สามารถปรับได้" type="number" step="0.01" value={settings.basketTriggerMoney} onChange={(v:string)=>setSettings({...settings,basketTriggerMoney:Number(v)})}/>
              <Field label="ย่อตัวจาก Peak แล้วปิด ($)" info="หลังเริ่ม Trailing หากกำไรรวมย่อลงจาก Peak ตามจำนวนเงินนี้ EA จะปิด Basket เพื่อรักษากำไร สามารถปรับได้" type="number" step="0.01" value={settings.basketTrailMoney} onChange={(v:string)=>setSettings({...settings,basketTrailMoney:Number(v)})}/>
              <Field label="ขาดทุน Basket สูงสุด ($)" info="ขีดจำกัดขาดทุนของ Basket ใช้เป็นส่วนหนึ่งของระบบความเสี่ยง สามารถปรับได้ ยิ่งตั้งแคบยิ่งหยุดขาดทุนเร็ว" help="ถึงค่านี้ระบบจะควบคุมความเสี่ยงตามกลยุทธ์" type="number" step="0.01" value={settings.maxBasketLossMoney} onChange={(v:string)=>setSettings({...settings,maxBasketLossMoney:Number(v)})}/>
              <Field label="Daily Loss Limit ($)" info="วงเงินขาดทุนรายวันที่ยอมรับได้ เมื่อถึงขีดจำกัด EA จะเข้า Safe Stop ตาม Logic ความเสี่ยง สามารถปรับได้" type="number" step="0.01" value={settings.dailyLossMoney} onChange={(v:string)=>setSettings({...settings,dailyLossMoney:Number(v)})}/>
              <Field label="Max Spread (points)" info="Spread สูงสุดที่ยอมให้เปิด Order ใหม่ สามารถปรับได้ สำหรับ XAUUSDm แบบ 3 ทศนิยม ตัวอย่าง Bid 4415.693 / Ask 4415.953 ต่างกัน 0.260 ซึ่งเท่ากับ 260 points ดังนั้น 260 / 300 pt ยังผ่านได้ แต่ถ้าสูงกว่า 300 บอทจะรอ" help="ตัวเลขนี้เป็นเพดานที่คุณตั้งได้ ไม่ใช่ Spread จริงของ Broker" type="number" value={settings.maxSpreadPoints} onChange={(v:string)=>setSettings({...settings,maxSpreadPoints:Number(v)})}/>
              <Field label="ระยะห่างคำสั่งขั้นต่ำ (ms)" info="เวลาขั้นต่ำระหว่างการส่ง Order แต่ละครั้ง ปรับได้ ใช้ป้องกันการส่งคำสั่งถี่เกินไป 300 ms = อย่างน้อย 0.3 วินาทีต่อคำสั่ง" type="number" value={settings.minOrderIntervalMs} onChange={(v:string)=>setSettings({...settings,minOrderIntervalMs:Number(v)})}/>
              <Field label="คำสั่งสูงสุดต่อนาที" info="Rate Limit จำนวนคำสั่ง Order สูงสุดใน 1 นาที ปรับได้ ใช้ป้องกันการยิงคำสั่งผิดปกติหรือมากเกินไป" type="number" value={settings.maxOrdersPerMinute} onChange={(v:string)=>setSettings({...settings,maxOrdersPerMinute:Number(v)})}/>
              <div className="field">
                <label className="label-with-info">โหมดเข้าออเดอร์ <InfoTip text="AUTO MOMENTUM เลือก Buy/Sell จาก Momentum แบบ Real-time, BUY ONLY เปิดเฉพาะ Buy, SELL ONLY เปิดเฉพาะ Sell" /></label>
                <select className="input" value={settings.entryMode} onChange={e=>setSettings({...settings,entryMode:e.target.value})}>
                  <option value="AUTO_MOMENTUM">AUTO MOMENTUM — เลือกฝั่งอัตโนมัติ</option>
                  <option value="BUY_ONLY">BUY ONLY — Buy เท่านั้น</option>
                  <option value="SELL_ONLY">SELL ONLY — Sell เท่านั้น</option>
                </select>
              </div>
              <div className="field submit-field">
                <div className="button-label-with-info">
                  <button className="btn primary btn-lg" title="บันทึกค่าบน Server และส่ง UPDATE_SETTINGS ให้ EA ใช้ค่าล่าสุด" disabled={busy}>{busy?"กำลังบันทึก...":"บันทึกการตั้งค่า"}</button>
                  <InfoTip text="บันทึกค่าที่แก้บนเว็บลง Server และส่ง UPDATE_SETTINGS ไปยัง EA ของ Slot ที่กำลังเลือกอยู่" />
                </div>
              </div>
            </form>
            <div className="notice risk-notice">การเทรดอัตโนมัติมีความเสี่ยง ควรทดสอบบนบัญชี Demo และใช้ขนาด Lot ที่เหมาะสมก่อนบัญชีเงินจริง</div>
          </section>
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
      <input className="input" type={props.type || "text"} step={props.step} value={props.value} onChange={e=>props.onChange(e.target.value)} />
      {props.help && <div className="help">{props.help}</div>}
    </div>
  );
}
