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
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"CLOUD"|"LOCAL">("CLOUD");
  const [accountNumber, setAccountNumber] = useState("");
  const [brokerServer, setBrokerServer] = useState("");
  const [tradingPassword, setTradingPassword] = useState("");
  const [installToken, setInstallToken] = useState("");
  const [installInstanceId, setInstallInstanceId] = useState("");
  const [settings, setSettings] = useState<any>(defaultSettings);

  async function load() {
    try {
      const d = await api("/bot/dashboard");
      setData(d);
      setSettings({ ...defaultSettings, ...(d.settings || {}) });
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
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  const metrics = data?.instance?.metrics || {};
  const state = data?.instance?.actual_state || "OFFLINE";
  const desired = data?.instance?.desired_state || "STOPPED";
  const entitlement = data?.entitlement;

  const accessExpiry = entitlement?.expiresAt ? new Date(entitlement.expiresAt) : null;
  const accessRemaining = accessExpiry
    ? Math.max(0, accessExpiry.getTime() - Date.now())
    : null;
  const remainingText = accessRemaining === null
    ? ""
    : Math.floor(accessRemaining / 3600000).toString().padStart(2,"0") + ":" +
      Math.floor((accessRemaining % 3600000) / 60000).toString().padStart(2,"0") + ":" +
      Math.floor((accessRemaining % 60000) / 1000).toString().padStart(2,"0");

  const trialLabel = useMemo(() => {
    if (!entitlement) return "—";
    if (entitlement.source === "TRIAL_READY") return "พร้อมเริ่ม 3 ชั่วโมง";
    if (entitlement.source === "TRIAL") return "Trial กำลังใช้งาน";
    if (entitlement.source === "SUBSCRIPTION") return "สมาชิก Active";
    if (entitlement.source === "TRIAL_EXPIRED") return "Trial หมดแล้ว";
    return "ยังไม่มีสิทธิ์";
  }, [entitlement]);

  async function linkAccount(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api("/bot/mt5", {
        method: "POST",
        body: JSON.stringify({
          accountNumber,
          broker: "Exness",
          brokerServer,
          mode
        })
      });
      setInstallToken(result.installToken || "");
      setInstallInstanceId(result.instance?.id || "");
      if (mode === "CLOUD" && tradingPassword) {
        await api("/bot/mt5/cloud-credential", {
          method: "POST",
          body: JSON.stringify({
            mt5AccountId: result.account.id,
            tradingPassword
          })
        });
      }
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function command(path: string) {
    setBusy(true);
    setError("");
    try {
      await api(path, { method: "POST" });
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
    try {
      await api("/bot/settings", {
        method: "PUT",
        body: JSON.stringify(settings)
      });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem("bot_token");
    window.location.href = "/";
  }

  if (!data) {
    return <main className="auth-shell"><div className="auth-card">กำลังเชื่อม Control Center...</div></main>;
  }

  return (
    <div className="app-wrap">
      <aside className="sidebar">
        <div className="side-brand brand"><b>◆</b> BOT // MT5</div>
        <nav className="side-nav">
          <a className="side-link active" href="/dashboard">⌁ Dashboard</a>
          <a className="side-link" href="#settings">⚙ Bot Settings</a>
          <a className="side-link" href="#account">▣ MT5 Account</a>
          <a className="side-link" href="/">◇ Website</a>
        </nav>
        <button className="btn ghost full" style={{marginTop:30}} onClick={logout}>ออกจากระบบ</button>
      </aside>

      <main className="main">
        <div className="mobile-only" style={{marginBottom:16}}>
          <div className="brand"><b>◆</b> BOT // MT5</div>
        </div>

        <header className="page-head">
          <div>
            <div className="eyebrow">TRADING CONTROL CENTER</div>
            <h2 style={{marginTop:7}}>สวัสดี {data.user?.user_code}</h2>
            <div className="muted" style={{marginTop:5}}>ควบคุม Cloud/Local MT5 จากหน้าจอเดียว</div>
          </div>
          <div className="status-row">
            <span className="badge"><span className={"dot " + (state === "RUNNING" ? "green":"red")}/> MT5 {state}</span>
            <span className="badge"><span className={"dot " + (desired === "RUNNING" ? "blue":"purple")}/> BOT {desired}</span>
          </div>
        </header>

        {error && <div className="notice bad" style={{marginBottom:14}}>{error}</div>}

        {!data.account ? (
          <section className="panel purple" id="account">
            <div className="panel-head">
              <div>
                <div className="eyebrow">STEP 01 // CONNECT</div>
                <h2 style={{marginTop:7}}>เชื่อมบัญชี MT5</h2>
              </div>
            </div>
            <div className="grid2" style={{marginBottom:14}}>
              <button className="tech-card purple" onClick={()=>setMode("CLOUD")}>
                <div className="badge"><span className="dot purple"/> CLOUD MODE</div>
                <h3 style={{marginTop:14}}>มีแค่มือถือ</h3>
                <p className="muted">MT5 + EA รันบน Server ของระบบ ปิดมือถือได้</p>
              </button>
              <button className="tech-card" onClick={()=>setMode("LOCAL")}>
                <div className="badge"><span className="dot blue"/> LOCAL MODE</div>
                <h3 style={{marginTop:14}}>มีคอม / VPS ของตัวเอง</h3>
                <p className="muted">ติดตั้ง EA บน MT5 ของลูกค้าและควบคุมผ่านเว็บ</p>
              </button>
            </div>

            <form className="form-grid" onSubmit={linkAccount}>
              <div className="field">
                <label>เลขบัญชี MT5</label>
                <input className="input" value={accountNumber} onChange={e=>setAccountNumber(e.target.value)} placeholder="เช่น 123456789" required />
              </div>
              <div className="field">
                <label>MT5 Broker Server</label>
                <input className="input" value={brokerServer} onChange={e=>setBrokerServer(e.target.value)} placeholder="เช่น Exness-Real..." required />
              </div>
              {mode === "CLOUD" && (
                <div className="field">
                  <label>Trading Password สำหรับ Cloud Worker</label>
                  <input className="input" type="password" value={tradingPassword} onChange={e=>setTradingPassword(e.target.value)} required />
                  <div className="help">Backend เข้ารหัสก่อนเก็บ และจะไม่แสดงรหัสผ่านกลับมาหน้าเว็บ</div>
                </div>
              )}
              <div className="field" style={{justifyContent:"flex-end"}}>
                <button className="btn primary" disabled={busy}>เชื่อม MT5</button>
              </div>
            </form>
          </section>
        ) : (
          <>
            <section className="kpi-grid">
              <div className="kpi"><div className="label">Balance</div><div className="value">{"$" + Number(metrics.balance||0).toFixed(2)}</div></div>
              <div className="kpi"><div className="label">Equity</div><div className="value">{"$" + Number(metrics.equity||0).toFixed(2)}</div></div>
              <div className="kpi"><div className="label">Floating P/L</div><div className={"value " + (Number(metrics.basketProfit||0)>=0?"green":"")}>{"$" + Number(metrics.basketProfit||0).toFixed(2)}</div></div>
              <div className="kpi"><div className="label">Positions</div><div className="value">{metrics.positions||0}</div></div>
            </section>

            <div className="grid2">
              <section className="panel blue">
                <div className="panel-head">
                  <div>
                    <div className="eyebrow">LIVE BOT ENGINE</div>
                    <h2 style={{marginTop:7}}>{settings.symbol}</h2>
                  </div>
                  <span className="badge"><span className="dot green"/> {data.account.mode}</span>
                </div>

                <div className="flow-node">
                  <b>ENTRY ENGINE</b>
                  <small>{settings.entryMode} · Max {settings.maxPositions} positions</small>
                </div>
                <div className="flow-arrow">↓</div>
                <div className="flow-node">
                  <b>BASKET MANAGER</b>
                  <small>Trigger {"$" + settings.basketTriggerMoney} · Current {"$" + Number(metrics.basketProfit||0).toFixed(2)}</small>
                </div>
                <div className="flow-arrow">↓</div>
                <div className="flow-node purple">
                  <b>DYNAMIC PROFIT TRAIL</b>
                  <small>Peak {"$" + Number(metrics.peakProfit||0).toFixed(2)} · Trail {"$" + settings.basketTrailMoney}</small>
                </div>

                <div className="command-row">
                  <button className="btn primary" disabled={busy || !entitlement?.allowed} onClick={()=>command("/bot/start")}>▶ START BOT</button>
                  <button className="btn purple" disabled={busy} onClick={()=>command("/bot/stop")}>■ SAFE STOP</button>
                  <button className="btn danger" disabled={busy} onClick={()=>command("/bot/close-all")}>⚠ CLOSE ALL</button>
                </div>
              </section>

              <section className="panel purple">
                <div className="panel-head">
                  <div>
                    <div className="eyebrow">ACCESS CONTROL</div>
                    <h2 style={{marginTop:7}}>{trialLabel}</h2>
                  </div>
                </div>
                <div className="notice">
                  Trial 3 ชั่วโมงจะไม่เปิดอัตโนมัติ กรุณาแจ้ง User ID <b>{data.user.user_code}</b> กับผู้ดูแล
                  เพื่ออนุมัติสิทธิ์ บัญชี MT5 ที่เคยรับ Trial แล้วจะรับซ้ำไม่ได้
                </div>
                {remainingText && (
                  <div className="flow-node purple" style={{marginTop:12}}>
                    <b>ACCESS TIME REMAINING</b>
                    <small className="mono" style={{fontSize:22,color:"var(--text)"}}>{remainingText}</small>
                    <small>หมดอายุ {accessExpiry?.toLocaleString("th-TH")}</small>
                  </div>
                )}
                <div style={{height:14}}/>
                <div className="flow-node purple">
                  <b>MT5 ACCOUNT</b>
                  <small>{data.account.broker} // {data.account.account_number}</small>
                  <small>{data.account.broker_server}</small>
                </div>
                <div className="flow-node">
                  <b>RUNNER STATUS</b>
                  <small>{data.instance.actual_state} · last seen {data.instance.last_seen_at || "never"}</small>
                </div>
              </section>
            </div>

            <section className="panel" id="settings" style={{marginTop:16}}>
              <div className="panel-head">
                <div>
                  <div className="eyebrow">BOT PARAMETERS</div>
                  <h2 style={{marginTop:7}}>ตั้งค่าการเทรด</h2>
                </div>
              </div>
              <form className="form-grid" onSubmit={saveSettings}>
                <Field label="Symbol" value={settings.symbol} onChange={(v:string)=>setSettings({...settings,symbol:v})}/>
                <Field label="Lot" type="number" step="0.01" value={settings.lot} onChange={(v:string)=>setSettings({...settings,lot:Number(v)})}/>
                <Field label="จำนวน Position สูงสุด" type="number" value={settings.maxPositions} onChange={(v:string)=>setSettings({...settings,maxPositions:Number(v)})}/>
                <Field label="กำไรรวมเริ่ม Trailing ($)" type="number" step="0.01" value={settings.basketTriggerMoney} onChange={(v:string)=>setSettings({...settings,basketTriggerMoney:Number(v)})}/>
                <Field label="ย่อจาก Peak แล้วปิด ($)" type="number" step="0.01" value={settings.basketTrailMoney} onChange={(v:string)=>setSettings({...settings,basketTrailMoney:Number(v)})}/>
                <Field label="ขาดทุน Basket สูงสุด ($)" type="number" step="0.01" value={settings.maxBasketLossMoney} onChange={(v:string)=>setSettings({...settings,maxBasketLossMoney:Number(v)})}/>
                <Field label="Daily Loss Limit ($)" type="number" step="0.01" value={settings.dailyLossMoney} onChange={(v:string)=>setSettings({...settings,dailyLossMoney:Number(v)})}/>
                <Field label="Max Spread (points)" type="number" value={settings.maxSpreadPoints} onChange={(v:string)=>setSettings({...settings,maxSpreadPoints:Number(v)})}/>
                <Field label="ระยะห่างคำสั่งขั้นต่ำ (ms)" type="number" value={settings.minOrderIntervalMs} onChange={(v:string)=>setSettings({...settings,minOrderIntervalMs:Number(v)})}/>
                <Field label="คำสั่งสูงสุดต่อนาที" type="number" value={settings.maxOrdersPerMinute} onChange={(v:string)=>setSettings({...settings,maxOrdersPerMinute:Number(v)})}/>
                <div className="field">
                  <label>Entry Mode</label>
                  <select className="input" value={settings.entryMode} onChange={e=>setSettings({...settings,entryMode:e.target.value})}>
                    <option value="AUTO_MOMENTUM">AUTO MOMENTUM</option>
                    <option value="BUY_ONLY">BUY ONLY</option>
                    <option value="SELL_ONLY">SELL ONLY</option>
                  </select>
                  <div className="help">AUTO ใช้ tick momentum เลือกฝั่งเข้าอัตโนมัติ</div>
                </div>
                <div className="field" style={{justifyContent:"flex-end"}}>
                  <button className="btn primary" disabled={busy}>SAVE SETTINGS</button>
                </div>
              </form>
              <div className="notice" style={{marginTop:14}}>
                ระบบเทรดอัตโนมัติมีความเสี่ยงและอาจขาดทุนได้ ควรเริ่มจากบัญชี Demo และค่าความเสี่ยงต่ำก่อนใช้งานเงินจริง
              </div>
            </section>
          </>
        )}

        {installToken && (
          <div className="notice good" style={{marginTop:16}}>
            <b>Local EA Activation (แสดงครั้งนี้ครั้งเดียว)</b><br/>
            Instance ID: <span className="mono" style={{wordBreak:"break-all"}}>{installInstanceId}</span><br/>
            Install Token: <span className="mono" style={{wordBreak:"break-all"}}>{installToken}</span>
          </div>
        )}
      </main>
    </div>
  );
}

function Field(props: any) {
  return (
    <div className="field">
      <label>{props.label}</label>
      <input
        className="input"
        type={props.type || "text"}
        step={props.step}
        value={props.value}
        onChange={e=>props.onChange(e.target.value)}
      />
    </div>
  );
}
