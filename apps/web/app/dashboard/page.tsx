"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";

type Dashboard = {
  user: any;
  account: any;
  instance: any;
  settings: any;
  entitlement: any;
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
  maxSpreadPoints: 50,
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
  const [settings, setSettings] = useState<any>(defaultSettings);
  const mt5ApiBase =
    process.env.NEXT_PUBLIC_MT5_API_BASE ||
    (typeof window !== "undefined" ? window.location.origin + "/backend" : "");

  async function load() {
    try {
      const d = await api("/bot/dashboard");
      setData(d);
      setSettings({ ...defaultSettings, ...(d.settings || {}) });
      const requestedView = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("view")
        : null;
      if (!d.account && !requestedView) setActiveView("account");
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

    load();
    api("/catalog/brokers")
      .then((rows)=>setBrokerCatalog(rows))
      .catch(()=>setBrokerCatalog([]));
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  const metrics = data?.instance?.metrics || {};
  const state = data?.instance?.actual_state || "OFFLINE";
  const desired = data?.instance?.desired_state || "STOPPED";
  const isMt5Online = Boolean(data?.instance?.last_seen_at) && state !== "OFFLINE";
  const entitlement = data?.entitlement;
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
  const isAgentOnline = Boolean(agentLastSeen) && Date.now() - (agentLastSeen?.getTime() || 0) < 30 * 60 * 1000;

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
          accountNumber,
          broker: selectedBrokerName,
          brokerServer: selectedServer,
          mode
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
      if (data?.instance?.actual_state === "RUNNING" || data?.instance?.desired_state === "RUNNING") {
        throw new Error("กรุณาหยุดบอทก่อนติดตั้งหรือเชื่อมใหม่");
      }

      const result = await api("/bot/mt5/rotate-install-token", { method: "POST" });
      const instanceId = result.instanceId || data?.instance?.id || "";
      const token = result.installToken || "";
      if (!instanceId || !token) throw new Error("ไม่สามารถสร้างรหัสติดตั้งได้");

      setInstallInstanceId(instanceId);
      setInstallToken(token);

      const webBase = window.location.origin;
      const apiBase = mt5ApiBase || webBase + "/backend";
      const installerUrl = webBase + "/downloads/SCENOVA-MT5-Setup.ps1";
      const cmd = [
        "@echo off",
        "chcp 65001 >nul",
        "title SCENOVA MT5 BOT EA Installer",
        "echo.",
        "echo ================================================",
        "echo  SCENOVA MT5 BOT EA - Automatic Installer",
        "echo ================================================",
        "echo.",
        "set \"SCENOVA_SETUP=%TEMP%\\SCENOVA-MT5-Setup.ps1\"",
        "echo Downloading SCENOVA installer...",
        "powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \"try { Invoke-WebRequest -UseBasicParsing -Uri '" + installerUrl + "' -OutFile $env:SCENOVA_SETUP } catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }\"",
        "if errorlevel 1 goto :failed",
        "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%SCENOVA_SETUP%\" -ApiBase \"" + apiBase + "\" -WebBase \"" + webBase + "\" -InstanceId \"" + instanceId + "\" -InstallToken \"" + token + "\"",
        "goto :end",
        ":failed",
        "echo.",
        "echo Installation download failed. Please check your internet connection.",
        ":end",
        "echo.",
        "pause"
      ].join("\r\n");

      const blob = new Blob([cmd], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "SCENOVA-MT5-Installer.cmd";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      setActivationMessage("ดาวน์โหลด SCENOVA Installer แล้ว ให้ดับเบิลคลิกไฟล์ SCENOVA-MT5-Installer.cmd จากนั้นกด Yes เมื่อ Windows ขอสิทธิ์");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
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
    a.download = "FastBasketBot-" + instanceId.slice(0,8) + ".set";
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
      await api("/bot/mt5/reset", { method: "POST" });
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
      await api(path, { method: "POST" });
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
      await api("/bot/settings", { method: "PUT", body: JSON.stringify(settings) });
      setNotice("บันทึกค่าการเทรดแล้ว");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem("bot_token");
    window.location.href = "/login";
  }

  if (!data) {
    return <main className="auth-shell"><div className="auth-card loading-card"><span className="dot green"/> กำลังเปิด SCENOVA Control Center...</div></main>;
  }

  const navItems: Array<{id:View;label:string;hint:string}> = [
    { id:"overview", label:"ภาพรวม", hint:"สถานะและควบคุมบอท" },
    { id:"account", label:"บัญชี MT5", hint:"เชื่อมต่อและติดตั้ง EA" },
    { id:"settings", label:"ตั้งค่าบอท", hint:"กลยุทธ์และความเสี่ยง" },
    { id:"access", label:"สิทธิ์ใช้งาน", hint:"Trial และสมาชิก" }
  ];

  return (
    <div className="app-wrap">
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

      <main className="main app-main">
        <div className="mobile-only mobile-app-head">
          <div className="brand-lockup"><span className="brand-mark">◆</span><span><strong>SCENOVA</strong><small>MT5 BOT EA</small></span></div>
          <button className="btn ghost" onClick={logout}>ออก</button>
        </div>

        <div className="mobile-only mobile-nav">
          {navItems.map(item=>(
            <button key={item.id} className={activeView===item.id ? "active" : ""} onClick={()=>setActiveView(item.id)}>{item.label}</button>
          ))}
        </div>

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
              {activeView === "account" && "ตั้งค่าการเชื่อมต่อให้ครบตามลำดับ"}
              {activeView === "settings" && "ปรับค่าที่มีผลต่อการเข้าออเดอร์และการควบคุมความเสี่ยง"}
              {activeView === "access" && "ตรวจสถานะ Trial สมาชิก และเวลาคงเหลือ"}
            </div>
          </div>
          <div className="status-row">
            <span className="badge"><span className={"dot " + (isMt5Online ? "green":"red")}/>{connectionLabel}</span>
            <span className="badge"><span className={"dot " + (desired==="RUNNING" ? "blue":"purple")}/>{desired==="RUNNING" ? "บอทกำลังทำงาน" : "บอทหยุดอยู่"}</span>
          </div>
        </header>

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
                  <div className="panel-head">
                    <div><div className="eyebrow">BOT CONTROL</div><h2>{metrics.symbol || settings.symbol}</h2></div>
                    <span className="badge"><span className={"dot "+(isMt5Online?"green":"red")}/>{data.account.mode}</span>
                  </div>
                  <div className="bot-summary">
                    <div><small>โหมดเข้าออเดอร์</small><b>{settings.entryMode}</b></div>
                    <div><small>จำนวน Position สูงสุด</small><b>{settings.maxPositions}</b></div>
                    <div><small>Basket Trigger</small><b>{"$"+settings.basketTriggerMoney}</b></div>
                  </div>
                  <div className="primary-actions">
                    <button className="btn primary btn-lg" disabled={busy || !entitlement?.allowed} onClick={()=>command("/bot/start","ส่งคำสั่งเริ่มบอทแล้ว")}>▶ เริ่มบอท</button>
                    <button className="btn purple btn-lg" disabled={busy} onClick={()=>command("/bot/stop","ส่งคำสั่งหยุดอย่างปลอดภัยแล้ว")}>■ หยุดอย่างปลอดภัย</button>
                  </div>
                  <button className="btn danger full" disabled={busy} onClick={()=>command("/bot/close-all","ส่งคำสั่งปิดออเดอร์ทั้งหมดแล้ว")}>⚠ ปิดออเดอร์ทั้งหมด</button>
                  {!entitlement?.allowed && <div className="help action-help">ยังเริ่มบอทไม่ได้ เพราะบัญชียังไม่มีสิทธิ์ใช้งาน</div>}
                </section>

                <section className="panel">
                  <div className="panel-head"><div><div className="eyebrow">LIVE STATUS</div><h2>สถานะบัญชี</h2></div></div>
                  <div className="detail-list">
                    <div><span>บัญชี</span><b>{data.account.account_number}</b></div>
                    <div><span>Broker</span><b>{data.account.broker}</b></div>
                    <div><span>Server</span><b>{metrics.server || data.account.broker_server}</b></div>
                    <div><span>การเชื่อมต่อ</span><b className={isMt5Online ? "text-good":"text-warn"}>{connectionLabel}</b></div>
                    <div><span>สิทธิ์</span><b>{accessLabel}</b></div>
                  </div>
                  <button className="btn full" onClick={()=>setActiveView("account")}>ดูรายละเอียดการเชื่อมต่อ</button>
                </section>
              </div>
            </>
          )
        )}

        {activeView === "account" && (
          !data.account ? (
            <section className="panel purple setup-panel">
              <div className="setup-heading">
                <div><div className="eyebrow">SETUP // 1 OF 3</div><h2>เลือกวิธีที่คุณจะรัน MT5</h2><p className="muted">เลือกตามอุปกรณ์ที่คุณใช้จริง ระบบจะแสดงเฉพาะข้อมูลที่จำเป็น</p></div>
              </div>

              <div className="mode-picker">
                <button className={"mode-option "+(mode==="LOCAL"?"selected":"")} onClick={()=>setMode("LOCAL")} type="button">
                  <span className="mode-icon">PC</span><div><b>Local — ใช้ MT5 บนเครื่องของคุณ</b><small>เหมาะกับผู้มีคอมพิวเตอร์หรือ VPS ของตัวเอง</small></div><span className="radio-dot"/>
                </button>
                <button className={"mode-option "+(mode==="CLOUD"?"selected":"")} onClick={()=>setMode("CLOUD")} type="button">
                  <span className="mode-icon purple">24/7</span><div><b>Cloud — ให้ระบบรัน MT5 ให้</b><small>เหมาะกับผู้ใช้มือถือและต้องการเปิดทำงานต่อเนื่อง</small></div><span className="radio-dot"/>
                </button>
              </div>

              <div className="setup-divider"><span>2</span><b>กรอกข้อมูลบัญชี MT5</b></div>
              <form className="form-grid form-grid-human" onSubmit={linkAccount}>
                <div className="field">
                  <label>เลขบัญชี MT5 <em>ไม่ใช่อีเมล</em></label>
                  <input className="input" inputMode="numeric" value={accountNumber} onChange={e=>setAccountNumber(e.target.value)} placeholder="เช่น 414302260" required />
                  <div className="help">ดูเลขบัญชีได้จากแถบ Accounts ใน MetaTrader 5</div>
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
                    {(selectedBroker?.servers || []).map(s=><option key={s.serverName} value={s.serverName}>{s.serverName}{s.environment!=="UNKNOWN"?" · "+s.environment:""}</option>)}
                    <option value="__CUSTOM__">ไม่พบในรายการ — ระบุเอง</option>
                  </select>
                  <div className="help">ชื่อต้องตรงกับ Server ใน MT5 ทุกตัวอักษร</div>
                </div>
                {brokerServer === "__CUSTOM__" && <div className="field"><label>ชื่อ MT5 Server</label><input className="input" value={customBrokerServer} onChange={e=>setCustomBrokerServer(e.target.value)} placeholder="เช่น Exness-MT5Trial6" required /></div>}
                {mode === "CLOUD" && <div className="field"><label>Trading Password</label><input className="input" type="password" value={tradingPassword} onChange={e=>setTradingPassword(e.target.value)} required /><div className="help">ระบบเข้ารหัสก่อนบันทึกและไม่แสดงรหัสกลับมา</div></div>}
                <div className="field submit-field"><button className="btn primary btn-lg" disabled={busy}>{busy?"กำลังเชื่อม...":"บันทึกและไปขั้นต่อไป →"}</button></div>
              </form>
            </section>
          ) : (
            <>
              <section className="panel account-card">
                <div className="panel-head">
                  <div><div className="eyebrow">MT5 ACCOUNT</div><h2>{data.account.broker} · {data.account.account_number}</h2><p className="muted">{data.account.broker_server} · {data.account.mode}</p></div>
                  <span className="badge"><span className={"dot "+(isMt5Online?"green":"red")}/>{connectionLabel}</span>
                </div>
              </section>

              {data.account.mode === "LOCAL" && (
                <section className="panel purple local-install-panel" style={{marginTop:16}}>
                  <div className="panel-head">
                    <div>
                      <div className="eyebrow">LOCAL CONNECTION</div>
                      <h2>ติดตั้ง SCENOVA บน MT5</h2>
                      <p className="muted">แนะนำการติดตั้งอัตโนมัติ ระบบจะตรวจหา MT5, ลง EA, สร้างไฟล์เชื่อมต่อ และติดตั้ง Agent ให้เอง</p>
                    </div>
                    <span className={"badge "+(isAgentOnline?"agent-online":"")}>
                      <span className={"dot "+(isAgentOnline?"green":"red")}/>
                      {isAgentOnline ? "Desktop Agent พร้อมใช้งาน" : "ยังไม่พบ Desktop Agent"}
                    </span>
                  </div>

                  <div className="auto-install-card">
                    <div className="auto-install-visual">
                      <span className="auto-install-icon">WIN</span>
                      <div>
                        <b>SCENOVA Automatic Installer</b>
                        <small>สำหรับ Windows + MetaTrader 5</small>
                      </div>
                    </div>
                    <div className="auto-install-features">
                      <span>✓ ตรวจหา MT5 อัตโนมัติ</span>
                      <span>✓ ติดตั้ง FastBasketBot</span>
                      <span>✓ สร้าง .set และผูกบัญชี</span>
                      <span>✓ ติดตั้ง Agent อัปเดตอัตโนมัติ</span>
                    </div>
                    <button className="btn primary btn-lg auto-install-button" disabled={busy} onClick={downloadWindowsInstaller}>
                      {busy ? "กำลังเตรียม Installer..." : "↓ ติดตั้ง SCENOVA บน Windows"}
                    </button>
                    <div className="help">หลังดาวน์โหลด ให้ดับเบิลคลิก <b>SCENOVA-MT5-Installer.cmd</b> และกด Yes ที่ Windows UAC</div>
                  </div>

                  {isAgentOnline && (
                    <div className="agent-status-card">
                      <span className="dot green"/>
                      <div>
                        <b>SCENOVA Desktop Agent เชื่อมต่อแล้ว</b>
                        <small>
                          เวอร์ชัน {data.instance?.agent_version || "—"} · ล่าสุด {agentLastSeen?.toLocaleString("th-TH") || "—"}
                        </small>
                      </div>
                    </div>
                  )}

                  {activationMessage && <div className="notice good">{activationMessage}</div>}

                  <div className="final-mt5-steps">
                    <div><span>1</span><div><b>เปิด MT5 หลังติดตั้ง</b><small>Navigator → Expert Advisors → SCENOVA → FastBasketBot</small></div></div>
                    <div><span>2</span><div><b>อนุญาต WebRequest</b><small>Tools → Options → Expert Advisors → เพิ่ม https://snvea-bot.online</small></div></div>
                    <div><span>3</span><div><b>Attach EA และเปิด Algo Trading</b><small>Load SCENOVA-FastBasketBot.set แล้วสถานะเว็บจะเปลี่ยนเป็น “เชื่อมต่อแล้ว”</small></div></div>
                  </div>

                  <details className="manual-install">
                    <summary>ซ่อมการเชื่อมต่อ / Advanced</summary>
                    <div className="manual-install-body">
                      <div className="notice security-notice">
                        <b>โค้ดกลยุทธ์ถูกป้องกัน</b>
                        <span>SCENOVA ไม่ส่งไฟล์ .mq5 ไปยังเครื่องลูกค้า ตัว EA จะถูกติดตั้งเป็นไฟล์ .ex5 ที่ Compile แล้วผ่าน Installer เท่านั้น</span>
                      </div>
                      <div className="instruction-list">
                        <div><span>1</span><div><b>ติดตั้ง EA ใหม่</b><small>ใช้ปุ่ม “ติดตั้ง SCENOVA บน Windows” ด้านบน ระบบจะดาวน์โหลด .ex5 ผ่านสิทธิ์ของบัญชีนี้</small></div></div>
                        <div><span>2</span><div><b>สร้างรหัสเชื่อมต่อใหม่</b><small>ใช้เมื่อเปลี่ยนเครื่องหรือสงสัยว่า Token เดิมรั่ว Token เก่าจะถูกยกเลิกทันที</small></div></div>
                        <div><span>3</span><div><b>ดาวน์โหลด .set ใหม่</b><small>ไฟล์ .set มีเฉพาะค่าการเชื่อมต่อและการตั้งค่า ไม่มี Source Code ของกลยุทธ์</small></div></div>
                      </div>
                      <div className="primary-actions">
                        <button className="btn" disabled={busy} onClick={rotateInstallToken}>{busy?"กำลังสร้าง...":"หมุนรหัสเชื่อมต่อใหม่"}</button>
                        <button className="btn download-set-btn" disabled={!installToken || !installInstanceId} onClick={()=>downloadEaSet()}>↓ ดาวน์โหลดไฟล์ .set</button>
                      </div>
                    </div>
                  </details>

                  {mt5ApiBase && <div className="connection-url"><span>API สำหรับ EA</span><code>{mt5ApiBase}</code></div>}
                </section>
              )}

              {data.account.mode === "CLOUD" && !isMt5Online && (
                <div className="notice onboarding-notice" style={{marginTop:16}}>
                  <b>กำลังรอ Cloud Worker</b><span>ระบบจะเชื่อม MT5 ของบัญชีนี้เมื่อมี Trading Node พร้อมใช้งาน</span>
                </div>
              )}

              <button className="btn ghost" style={{marginTop:16}} disabled={busy || state==="RUNNING" || desired==="RUNNING"} onClick={resetMt5}>เปลี่ยนบัญชี / เปลี่ยนโหมด</button>
            </>
          )
        )}

        {activeView === "settings" && (
          !data.account ? <EmptySetup onNext={()=>setActiveView("account")} /> :
          <section className="panel settings-panel">
            <div className="panel-head"><div><div className="eyebrow">BOT SETTINGS</div><h2>ค่าการเทรดที่ใช้งานอยู่</h2><p className="muted">ค่าที่มีผลต่อความเสี่ยงจะแสดงคำอธิบายไว้ใต้ช่อง</p></div></div>
            <form className="form-grid form-grid-human" onSubmit={saveSettings}>
              <Field label="Symbol" help="ชื่อสัญลักษณ์ต้องตรงกับ Broker" value={settings.symbol} onChange={(v:string)=>setSettings({...settings,symbol:v})}/>
              <Field label="Lot" help="เริ่มจากค่าน้อยบน Demo ก่อน" type="number" step="0.01" value={settings.lot} onChange={(v:string)=>setSettings({...settings,lot:Number(v)})}/>
              <Field label="จำนวน Position สูงสุด" type="number" value={settings.maxPositions} onChange={(v:string)=>setSettings({...settings,maxPositions:Number(v)})}/>
              <Field label="กำไรรวมเริ่ม Trailing ($)" type="number" step="0.01" value={settings.basketTriggerMoney} onChange={(v:string)=>setSettings({...settings,basketTriggerMoney:Number(v)})}/>
              <Field label="ย่อตัวจาก Peak แล้วปิด ($)" type="number" step="0.01" value={settings.basketTrailMoney} onChange={(v:string)=>setSettings({...settings,basketTrailMoney:Number(v)})}/>
              <Field label="ขาดทุน Basket สูงสุด ($)" help="ถึงค่านี้ระบบจะควบคุมความเสี่ยงตามกลยุทธ์" type="number" step="0.01" value={settings.maxBasketLossMoney} onChange={(v:string)=>setSettings({...settings,maxBasketLossMoney:Number(v)})}/>
              <Field label="Daily Loss Limit ($)" type="number" step="0.01" value={settings.dailyLossMoney} onChange={(v:string)=>setSettings({...settings,dailyLossMoney:Number(v)})}/>
              <Field label="Max Spread (points)" type="number" value={settings.maxSpreadPoints} onChange={(v:string)=>setSettings({...settings,maxSpreadPoints:Number(v)})}/>
              <Field label="ระยะห่างคำสั่งขั้นต่ำ (ms)" type="number" value={settings.minOrderIntervalMs} onChange={(v:string)=>setSettings({...settings,minOrderIntervalMs:Number(v)})}/>
              <Field label="คำสั่งสูงสุดต่อนาที" type="number" value={settings.maxOrdersPerMinute} onChange={(v:string)=>setSettings({...settings,maxOrdersPerMinute:Number(v)})}/>
              <div className="field">
                <label>โหมดเข้าออเดอร์</label>
                <select className="input" value={settings.entryMode} onChange={e=>setSettings({...settings,entryMode:e.target.value})}>
                  <option value="AUTO_MOMENTUM">AUTO MOMENTUM — เลือกฝั่งอัตโนมัติ</option>
                  <option value="BUY_ONLY">BUY ONLY — Buy เท่านั้น</option>
                  <option value="SELL_ONLY">SELL ONLY — Sell เท่านั้น</option>
                </select>
              </div>
              <div className="field submit-field"><button className="btn primary btn-lg" disabled={busy}>{busy?"กำลังบันทึก...":"บันทึกการตั้งค่า"}</button></div>
            </form>
            <div className="notice risk-notice">การเทรดอัตโนมัติมีความเสี่ยง ควรทดสอบบนบัญชี Demo และใช้ขนาด Lot ที่เหมาะสมก่อนบัญชีเงินจริง</div>
          </section>
        )}

        {activeView === "access" && (
          <div className="grid2 access-grid">
            <section className="panel purple">
              <div className="eyebrow">ACCESS STATUS</div>
              <h2 style={{marginTop:8}}>{accessLabel}</h2>
              {remainingText ? (
                <div className="time-card"><span>เวลาคงเหลือ</span><b className="mono">{remainingText}</b><small>หมดอายุ {accessExpiry?.toLocaleString("th-TH")}</small></div>
              ) : (
                <p className="muted">ยังไม่มีเวลาสิทธิ์ที่กำลังนับอยู่</p>
              )}
            </section>
            <section className="panel">
              <div className="eyebrow">YOUR USER ID</div>
              <h2 className="mono user-code-big">{data.user.user_code}</h2>
              <p className="muted">ใช้รหัสนี้แจ้งผู้ดูแลเพื่อขอ Trial หรือเปิดสมาชิก</p>
              <div className="notice">Trial 3 ชั่วโมงจะเริ่มหลังผู้ดูแลอนุมัติ และเริ่มนับเมื่อเริ่มใช้งานครั้งแรก บัญชี MT5 เดิมรับ Trial ซ้ำไม่ได้</div>
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

function Field(props: any) {
  return (
    <div className="field">
      <label>{props.label}</label>
      <input className="input" type={props.type || "text"} step={props.step} value={props.value} onChange={e=>props.onChange(e.target.value)} />
      {props.help && <div className="help">{props.help}</div>}
    </div>
  );
}
