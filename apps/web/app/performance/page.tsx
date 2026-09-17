"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { API_URL, api, getToken } from "../../lib/api";
import { OwnerSidebar } from "../../components/OwnerSidebar";
import { ScenovaBrand } from "../../components/ScenovaBrand";
import { ScenovaIcon } from "../../components/ScenovaIcon";
import styles from "./performance.module.css";

type Scope = "SYSTEM" | "ACCOUNT";
type Mode = "LIVE" | "BACKTEST";
type Options = {
  user: { id: string; user_code: string; email: string; role: string } | null;
  elevated: boolean;
  accounts: Array<any>;
};

const DAY = 24 * 60 * 60 * 1000;

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function money(value: any, signed = false) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const sign = signed && n > 0 ? "+" : "";
  return `${sign}$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function num(value: any, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

function percent(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : "—";
}

function tone(value: any) {
  const n = Number(value || 0);
  return n > 0 ? styles.good : n < 0 ? styles.bad : "";
}

function closedDrawdown(points: any[], key = "balance") {
  let peak = 0;
  return (points || []).map((point) => {
    const value = Number(point[key] ?? point.cumulative ?? 0);
    peak = Math.max(peak, value);
    const amount = Math.max(0, peak - value);
    const pct = peak > 0 ? amount / peak * 100 : 0;
    return { ...point, value, drawdownMoney: amount, drawdownPercent: pct };
  });
}

function systemDrawdown(points: any[]) {
  let peak = 0;
  let max = 0;
  const rows = (points || []).map((point) => {
    const value = Number(point.cumulative || 0);
    peak = Math.max(peak, value);
    const dd = Math.max(0, peak - value);
    max = Math.max(max, dd);
    return { ...point, drawdownMoney: dd, drawdownPercent: 0 };
  });
  return { rows, max };
}

function PremiumChart({ points, valueKey, drawdown = false, id }:{ points:any[]; valueKey:string; drawdown?:boolean; id:string }) {
  const width = 1000;
  const height = 290;
  if (!points?.length) return <div className={styles.emptyChart}>ยังไม่มีข้อมูลในช่วงเวลานี้</div>;
  const values = points.map((p) => drawdown ? -Math.abs(Number(p[valueKey] || 0)) : Number(p[valueKey] || 0));
  const min = Math.min(...values, drawdown ? -1 : Infinity);
  const max = Math.max(...values, drawdown ? 0 : -Infinity);
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? max : 1;
  const range = Math.max(1, safeMax - safeMin);
  const coords = values.map((value, index) => {
    const x = values.length <= 1 ? 0 : index / (values.length - 1) * width;
    const y = height - 18 - ((value - safeMin) / range) * (height - 36);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = coords[coords.length - 1];
  const area = `0,${height} ${coords.join(" ")} ${width},${height}`;
  return (
    <div className={styles.chartWrap}>
      <svg className={`${styles.chart} ${drawdown ? styles.chartDanger : ""}`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img">
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={drawdown ? "#ff4668" : "#8a63ff"} stopOpacity="0.42" />
            <stop offset="100%" stopColor={drawdown ? "#ff4668" : "#5e3de0"} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon points={area} fill={`url(#${id}-fill)`} />
        <polyline points={coords.join(" ")} fill="none" vectorEffect="non-scaling-stroke" />
        {last ? <circle cx={last.split(",")[0]} cy={last.split(",")[1]} r="5" vectorEffect="non-scaling-stroke" /> : null}
      </svg>
    </div>
  );
}

function MetricCard({ icon, label, en, value, sub, className = "" }:{ icon:string; label:string; en:string; value:string; sub?:string; className?:string }) {
  return (
    <div className={`${styles.metricCard} ${className}`}>
      <span className={styles.metricIcon}>{icon}</span>
      <div><span className={styles.metricLabel}>{label}<small>{en}</small></span><strong>{value}</strong>{sub ? <em>{sub}</em> : null}</div>
    </div>
  );
}

function StatusBadge({ children, green = false }:{ children:any; green?:boolean }) {
  return <span className={`${styles.statusBadge} ${green ? styles.statusGreen : ""}`}>{children}</span>;
}

function CustomerSidebar({ onLogout }:{ onLogout:()=>void }) {
  return (
    <aside className={styles.customerSidebar}>
      <Link href="/dashboard?view=overview" className={styles.brand}><ScenovaBrand className={styles.brandLogo}/></Link>
      <nav>
        <Link href="/dashboard?view=overview"><ScenovaIcon name="control" size={18}/>Control Center</Link>
        <Link href="/dashboard?view=account"><ScenovaIcon name="account" size={18}/>MT5 & EA</Link>
        <Link href="/performance" className={styles.activeNav}><ScenovaIcon name="strategy" size={18}/>Trading Performance</Link>
      </nav>
      <button className={styles.logout} onClick={onLogout}><ScenovaIcon name="logout" size={18}/>Sign Out</button>
    </aside>
  );
}

export default function PerformancePage() {
  const today = useMemo(() => new Date(), []);
  const [options, setOptions] = useState<Options | null>(null);
  const [scope, setScope] = useState<Scope>("SYSTEM");
  const [mode, setMode] = useState<Mode>("LIVE");
  const [accountId, setAccountId] = useState("");
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState(isoDate(new Date(today.getTime() - 30 * DAY)));
  const [to, setTo] = useState(isoDate(today));
  const [system, setSystem] = useState<any>(null);
  const [report, setReport] = useState<any>(null);
  const [backtest, setBacktest] = useState<any>(null);
  const [selectedBacktestId, setSelectedBacktestId] = useState("");
  const [shareResult, setShareResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");

  const elevated = Boolean(options?.elevated);
  const users = useMemo(() => {
    const map = new Map<string, any>();
    (options?.accounts || []).forEach((a) => map.set(a.userId, { id:a.userId, userCode:a.userCode, email:a.email }));
    return Array.from(map.values());
  }, [options]);
  const visibleAccounts = useMemo(() => (options?.accounts || []).filter((a) => !userId || a.userId === userId), [options, userId]);

  function logout() {
    localStorage.removeItem("bot_token");
    window.location.href = "/login";
  }

  async function loadOptions() {
    const next = await api("/performance-analytics/options");
    setOptions(next);
    const first = next.accounts?.[0];
    if (first) { setAccountId(first.id); setUserId(first.userId || ""); }
    setScope(next.elevated ? "SYSTEM" : "ACCOUNT");
  }

  async function refresh() {
    if (!options) return;
    setLoading(true);
    try {
      if (scope === "SYSTEM" && elevated) {
        setSystem(await api(`/performance-analytics/system?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`));
      } else if (accountId) {
        const next = await api(`/performance-analytics/report?accountId=${encodeURIComponent(accountId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
        setReport(next);
        if (mode === "BACKTEST") {
          const id = selectedBacktestId || next.backtests?.[0]?.id || "";
          setSelectedBacktestId(id);
          setBacktest(id ? await api(`/performance-analytics/backtest?id=${encodeURIComponent(id)}`) : null);
        }
      }
      setError("");
    } catch (e:any) {
      setError(String(e?.message || "โหลดข้อมูลไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getToken()) { window.location.href = "/login"; return; }
    loadOptions().catch((e:any)=>setError(String(e?.message || "โหลดข้อมูลไม่สำเร็จ"))).finally(()=>setLoading(false));
  }, []);

  useEffect(() => {
    if (!options) return;
    setShareResult(null);
    refresh();
  }, [options, scope, mode, accountId, from, to]);

  async function chooseBacktest(id:string) {
    setSelectedBacktestId(id);
    setBacktest(id ? await api(`/performance-analytics/backtest?id=${encodeURIComponent(id)}`) : null);
  }

  async function createShare() {
    if (!accountId || mode !== "LIVE") return;
    setSharing(true);
    try {
      setShareResult(await api("/performance-actions/share-live", { method:"POST", body:JSON.stringify({ accountId, from, to }) }));
    } catch (e:any) { setError(String(e?.message || "สร้างลิงก์แชร์ไม่สำเร็จ")); }
    finally { setSharing(false); }
  }

  async function copyShare() {
    if (!shareResult?.path) return;
    await navigator.clipboard.writeText(`${window.location.origin}${shareResult.path}`);
  }

  async function resetTestData() {
    if (!elevated) return;
    const typed = window.prompt("ล้างข้อมูลทดสอบ Performance ทั้งระบบ\n\nลบ Trade Journal, Backtest และลิงก์แชร์ แต่ไม่ลบลูกค้า/บัญชี MT5/สมาชิก/การตั้งค่าบอท\n\nพิมพ์ RESET เพื่อยืนยัน");
    if (typed !== "RESET" || !window.confirm("ยืนยันล้างข้อมูลทดสอบ Performance ทั้งระบบ?")) return;
    setResetting(true);
    try {
      await api("/performance-actions/reset-test-data", { method:"POST", body:JSON.stringify({ confirm:"RESET" }) });
      setShareResult(null); setBacktest(null); setSelectedBacktestId("");
      await refresh();
    } catch (e:any) { setError(String(e?.message || "ล้างข้อมูลไม่สำเร็จ")); }
    finally { setResetting(false); }
  }

  async function downloadCsv() {
    if (!accountId) return;
    const response = await fetch(`${API_URL}/api/performance-analytics/export.csv?accountId=${encodeURIComponent(accountId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { headers:{ Authorization:`Bearer ${getToken()}` }, cache:"no-store" });
    if (!response.ok) return setError("ดาวน์โหลด CSV ไม่สำเร็จ");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href=url; link.download=`scenova-performance-${report?.account?.accountNumber || "report"}.csv`; link.click(); URL.revokeObjectURL(url);
  }

  function drill(account:string, user:string) {
    setUserId(user); setAccountId(account); setScope("ACCOUNT"); setMode("LIVE");
  }

  const liveSummary = report?.summary || {};
  const backSummary = backtest?.summary || {};
  const summary = mode === "BACKTEST" ? {
    netProfit: backSummary.netProfit, returnPercent: backSummary.returnPercent, winRate: backSummary.winRate,
    profitFactor: backSummary.profitFactor, maxDrawdownPercent: backSummary.maxDrawdownPercent,
    maxDrawdownMoney: backSummary.maxDrawdownMoney, trades: backSummary.closedTrades,
    grossProfit: backSummary.grossProfit, grossLoss: backSummary.grossLoss, wins: backSummary.wins,
    losses: backSummary.losses, averageWin: backSummary.averageWin, averageLoss: backSummary.averageLoss,
    recoveryFactor: backSummary.maxDrawdownMoney ? Number(backSummary.netProfit || 0) / Number(backSummary.maxDrawdownMoney || 1) : null
  } : liveSummary;
  const accountCurve = mode === "BACKTEST"
    ? closedDrawdown((backtest?.equity_curve || []).map((p:any)=>({ ...p, balance:Number(p.balance || 0) })))
    : (report?.curve || []);

  return (
    <div className={styles.shell}>
      {elevated ? <OwnerSidebar activeKey="trading-backtest" onLogout={logout}/> : <CustomerSidebar onLogout={logout}/>} 
      <main className={styles.main}>
        {error ? <div className={styles.error}>{error}</div> : null}

        <section className={styles.controlDock}>
          {elevated ? <div className={styles.tabs}><button className={scope==="SYSTEM"?styles.tabActive:""} onClick={()=>setScope("SYSTEM")}>ภาพรวมทั้งระบบ</button><button className={scope==="ACCOUNT"?styles.tabActive:""} onClick={()=>setScope("ACCOUNT")}>รายลูกค้า / รายบัญชี</button></div> : <div/>}
          <div className={styles.filters}>
            {scope === "ACCOUNT" && elevated ? <select value={userId} onChange={(e)=>{ const id=e.target.value; setUserId(id); const first=(options?.accounts||[]).find((a)=>a.userId===id); if(first)setAccountId(first.id); }}><option value="">ทุกลูกค้า</option>{users.map((u)=><option key={u.id} value={u.id}>{u.userCode} · {u.email}</option>)}</select> : null}
            {scope === "ACCOUNT" ? <select value={accountId} onChange={(e)=>setAccountId(e.target.value)}>{visibleAccounts.map((a)=><option key={a.id} value={a.id}>{a.accountNumber} · {a.broker}</option>)}</select> : null}
            {scope === "ACCOUNT" ? <select value={mode} onChange={(e)=>setMode(e.target.value as Mode)}><option value="LIVE">Live Performance</option><option value="BACKTEST">Backtest</option></select> : null}
            <input type="date" value={from} onChange={(e)=>setFrom(e.target.value)}/><input type="date" value={to} onChange={(e)=>setTo(e.target.value)}/>
            <button className={styles.refreshBtn} onClick={refresh} disabled={loading}><ScenovaIcon name="refresh" size={15}/>{loading?"กำลังโหลด":"Refresh"}</button>
            {elevated ? <button className={styles.resetBtn} onClick={resetTestData} disabled={resetting}>{resetting?"กำลังล้าง":"ล้างข้อมูลทดสอบ"}</button> : null}
          </div>
        </section>

        {scope === "SYSTEM" && elevated
          ? <SystemReport data={system} from={from} to={to} loading={loading} onDrill={drill}/>
          : <AccountReport report={report} mode={mode} backtest={backtest} selectedBacktestId={selectedBacktestId} chooseBacktest={chooseBacktest} summary={summary} curve={accountCurve} from={from} to={to} loading={loading} sharing={sharing} shareResult={shareResult} createShare={createShare} copyShare={copyShare} downloadCsv={downloadCsv}/>
        }
      </main>
    </div>
  );
}

function SystemReport({ data, from, to, loading, onDrill }:{ data:any; from:string; to:string; loading:boolean; onDrill:(a:string,u:string)=>void }) {
  const s = data?.summary || {};
  const dd = systemDrawdown(data?.curve || []);
  const wins = Number(s.wins || 0);
  const losses = Number(s.losses || 0);
  return <>
    <section className={styles.hero}>
      <div className={styles.heroIdentity}><span className={styles.heroIcon}>▰</span><div><span className={styles.eyebrow}>ภาพรวมผลการเทรดทั้งระบบ</span><h1>SCENOVA System Performance</h1><p>ข้อมูลจริงจาก Trade Journal ของบัญชีลูกค้า · สรุปผลแบบอ่านง่ายในหน้าเดียว</p><div className={styles.metaLine}><span>◉ {s.customers || 0} Customers</span><span>▣ {s.accounts || 0} MT5 Accounts</span><span>◷ {from} – {to}</span></div></div></div>
      <div className={styles.heroBadges}><StatusBadge green>✓ Live Data</StatusBadge><StatusBadge>{s.onlineAccounts || 0} Online</StatusBadge><StatusBadge>{loading?"Updating…":"Updated"}</StatusBadge><div className={styles.quote}>“ภาพรวมนี้ใช้เฉพาะข้อมูลผลการเทรดจริงที่ SCENOVA บันทึกไว้”</div></div>
    </section>

    <section className={styles.metricsRow}>
      <MetricCard icon="◎" label="ลูกค้า" en="Customers" value={String(s.customers || 0)} sub="ลูกค้าในระบบ"/>
      <MetricCard icon="↗" label="กำไรสุทธิ" en="Net Profit" value={money(s.netProfit,true)} sub="รวม Closed P/L" className={tone(s.netProfit)}/>
      <MetricCard icon="◒" label="อัตรากำไร" en="Profit Factor" value={num(s.profitFactor)} sub="ทั้งระบบ"/>
      <MetricCard icon="♜" label="อัตราชนะ" en="Win Rate" value={percent(s.winRate)} sub={`${wins} / ${Number(s.trades || 0)} ไม้`}/>
      <MetricCard icon="⬡" label="ขาดทุนสูงสุด" en="Closed Drawdown" value={money(dd.max)} sub="จาก System P/L Curve" className={styles.bad}/>
      <MetricCard icon="☷" label="จำนวนการเทรด" en="Total Trades" value={String(s.trades || 0)} sub="Basket ที่ปิดแล้ว"/>
      <MetricCard icon="▣" label="บัญชี MT5" en="MT5 Accounts" value={String(s.accounts || 0)} sub={`${s.profitableAccounts || 0} บัญชีกำไร`}/>
    </section>

    <section className={styles.chartsGrid}>
      <div className={`${styles.panel} ${styles.equityPanel}`}><div className={styles.panelHead}><div><span className={styles.panelIcon}>▰</span><b>กราฟผลการเทรดรวม <em>(System P/L Curve)</em></b></div><strong className={tone(s.netProfit)}>{money(s.netProfit,true)}</strong></div><PremiumChart points={data?.curve || []} valueKey="cumulative" id="system-equity"/></div>
      <div className={`${styles.panel} ${styles.ddPanel}`}><div className={styles.panelHead}><div><span className={styles.panelIcon}>⌁</span><b>กราฟการขาดทุน <em>(Drawdown)</em></b></div><strong className={styles.bad}>{money(dd.max)}</strong></div><PremiumChart points={dd.rows} valueKey="drawdownMoney" drawdown id="system-dd"/></div>
    </section>

    <section className={`${styles.panel} ${styles.statsPanel}`}><div className={styles.sectionTitle}><span>▮▮</span><b>สถิติผลการเทรดโดยละเอียด</b></div><div className={styles.statsColumns}>
      <div><Stat label="กำไร/ขาดทุนสุทธิ (Net P/L)" value={money(s.netProfit,true)} className={tone(s.netProfit)}/><Stat label="Profit Factor" value={num(s.profitFactor)}/><Stat label="บัญชีที่มีกำไร" value={`${s.profitableAccounts || 0} (${num(s.profitableAccountRate,1)}%)`}/></div>
      <div><Stat label="จำนวนการเทรดทั้งหมด" value={String(s.trades || 0)}/><Stat label="อัตราชนะ (Win Rate)" value={percent(s.winRate)} className={styles.good}/><Stat label="ชนะ / แพ้" value={`${wins} / ${losses}`}/></div>
      <div><Stat label="บัญชีออนไลน์" value={`${s.onlineAccounts || 0} / ${s.accounts || 0}`}/><Stat label="System Closed Drawdown" value={money(dd.max)} className={styles.bad}/><Stat label="ช่วงข้อมูล" value={`${from} → ${to}`}/></div>
    </div></section>

    <section className={styles.bottomGrid}><div className={`${styles.panel} ${styles.aboutPanel}`}><div className={styles.sectionTitle}><span>▣</span><b>เกี่ยวกับรายงาน</b></div><p>Admin System Performance รวมข้อมูลบัญชีลูกค้าทั้งหมดและตัดบัญชี OWNER / ADMIN ภายในออก เพื่อให้เห็นภาพการใช้งานจริงของระบบอย่างชัดเจน</p></div><div className={`${styles.panel} ${styles.conditionsPanel}`}><div className={styles.sectionTitle}><span>⚙</span><b>เงื่อนไขข้อมูล</b></div><ul><li>แหล่งข้อมูล: SCENOVA Trade Journal</li><li>นับเฉพาะ Basket ที่ปิดแล้ว</li><li>Drawdown ระบบเป็น Closed P/L Drawdown</li></ul></div><div className={styles.riskPanel}><b>⚠ คำเตือนข้อมูล</b><p>System Drawdown ไม่มีฐาน Equity รวมของทุกบัญชี จึงแสดงเป็นมูลค่า Closed Drawdown ไม่ใช่ Floating Equity Drawdown</p></div></section>

    <section className={`${styles.panel} ${styles.accountsPanel}`}><div className={styles.panelHead}><div><span className={styles.panelIcon}>☷</span><b>รายลูกค้า / รายบัญชี</b></div><small>กดดูรายงานเพื่อเปิด Performance Detail</small></div><div className={styles.tableWrap}><table><thead><tr><th>ลูกค้า</th><th>MT5</th><th>Mode</th><th>Status</th><th>Trades</th><th>Win Rate</th><th>Net P/L</th><th></th></tr></thead><tbody>{(data?.accounts || []).map((r:any)=><tr key={r.accountId}><td><b>{r.userCode}</b><small>{r.email}</small></td><td>{r.accountNumber}</td><td>{r.mode}</td><td><span className={r.online?styles.online:styles.offline}>{r.online?"ONLINE":"OFFLINE"}</span></td><td>{r.trades}</td><td>{percent(r.winRate)}</td><td className={tone(r.netProfit)}>{money(r.netProfit,true)}</td><td><button onClick={()=>onDrill(r.accountId,r.userId)}>ดูรายงาน →</button></td></tr>)}{!data?.accounts?.length?<tr><td colSpan={8} className={styles.emptyCell}>ยังไม่มีบัญชีลูกค้า</td></tr>:null}</tbody></table></div></section>
  </>;
}

function AccountReport({ report, mode, backtest, selectedBacktestId, chooseBacktest, summary, curve, from, to, loading, sharing, shareResult, createShare, copyShare, downloadCsv }:{ report:any; mode:Mode; backtest:any; selectedBacktestId:string; chooseBacktest:(id:string)=>void; summary:any; curve:any[]; from:string; to:string; loading:boolean; sharing:boolean; shareResult:any; createShare:()=>void; copyShare:()=>void; downloadCsv:()=>void }) {
  const title = mode === "BACKTEST" ? (backtest?.title || "Backtest Report") : `${report?.account?.accountNumber || "MT5"} Performance`;
  const initial = mode === "BACKTEST" ? (backtest?.initial_deposit ?? summary.initialDeposit) : report?.balance?.derivedStart;
  const ddCurve = curve || [];
  return <>
    <section className={styles.hero}>
      <div className={styles.heroIdentity}><span className={styles.heroIcon}>▰</span><div><span className={styles.eyebrow}>{mode === "BACKTEST" ? "ผลการทดสอบย้อนหลัง (Backtest)" : "ผลการเทรดจริง (Live Performance)"}</span><h1>{title}</h1><p>{mode === "BACKTEST" ? "รายงาน Backtest ที่บันทึกในระบบ SCENOVA" : "ผลจริงจากบัญชี MT5 พร้อมระบบวิเคราะห์ Drawdown และรายงานย้อนหลัง"}</p><div className={styles.metaLine}><span>♙ {report?.account?.userCode || report?.account?.email || "—"}</span><span>▣ {report?.account?.symbol || backtest?.symbol || "—"}</span><span>⚙ MetaTrader 5</span><span>▤ {report?.account?.timeframe || backtest?.timeframe || "—"}</span></div></div></div>
      <div className={styles.heroBadges}><StatusBadge green>✓ Verified Data</StatusBadge><StatusBadge>{mode === "LIVE" ? "Public Share Ready" : "Backtest"}</StatusBadge><StatusBadge>{loading?"Updating…":"Updated"}</StatusBadge><div className={styles.quote}>“ข้อมูลชุดนี้ดึงจากระบบ SCENOVA โดยตรง ไม่มีการสร้างตัวเลขจำลองเพื่อเติมหน้าจอ”</div></div>
    </section>

    {mode === "BACKTEST" ? <section className={styles.backtestPicker}><span>เลือกรายงาน Backtest</span><select value={selectedBacktestId} onChange={(e)=>chooseBacktest(e.target.value)}><option value="">เลือกรายงาน</option>{(report?.backtests || []).map((r:any)=><option key={r.id} value={r.id}>{r.title} · {r.symbol} · {r.timeframe}</option>)}</select></section> : null}

    <section className={styles.metricsRow}>
      <MetricCard icon="▣" label="เงินเริ่มต้น" en="Initial Balance" value={money(initial)} sub={mode==="LIVE"?"คำนวณจาก Balance และ Closed P/L":"Backtest deposit"}/>
      <MetricCard icon="↗" label="กำไรสุทธิ" en="Net Profit" value={money(summary.netProfit,true)} sub={summary.returnPercent!==null&&summary.returnPercent!==undefined?`${Number(summary.returnPercent)>=0?"▲":"▼"} ${percent(Math.abs(Number(summary.returnPercent)))}`:"ผลสุทธิ"} className={tone(summary.netProfit)}/>
      <MetricCard icon="◒" label="อัตรากำไร" en="Profit Factor" value={num(summary.profitFactor)} sub="Gross Profit / Gross Loss"/>
      <MetricCard icon="♜" label="อัตราชนะ" en="Win Rate" value={percent(summary.winRate)} sub={`${summary.wins ?? 0} / ${summary.trades ?? 0} ไม้`}/>
      <MetricCard icon="⬡" label="การขาดทุนสูงสุด" en="Max Drawdown" value={percent(summary.maxDrawdownPercent)} sub={`${money(summary.maxDrawdownMoney)} · Closed`} className={styles.bad}/>
      <MetricCard icon="☷" label="จำนวนการเทรด" en="Total Trades" value={String(summary.trades ?? 0)} sub="รายการที่ปิดแล้ว"/>
      <MetricCard icon="◷" label="ช่วงเวลาที่ดู" en="Period" value={`${Math.max(1,Math.round((new Date(to).getTime()-new Date(from).getTime())/DAY))} วัน`} sub={`${from} – ${to}`}/>
    </section>

    <section className={styles.chartsGrid}><div className={`${styles.panel} ${styles.equityPanel}`}><div className={styles.panelHead}><div><span className={styles.panelIcon}>▰</span><b>{mode==="LIVE"?"กราฟเส้นทุน (Balance Curve)":"Backtest Balance Curve"}</b></div><strong className={tone(summary.netProfit)}>{money(summary.netProfit,true)}</strong></div><PremiumChart points={curve} valueKey="balance" id="account-equity"/></div><div className={`${styles.panel} ${styles.ddPanel}`}><div className={styles.panelHead}><div><span className={styles.panelIcon}>⌁</span><b>กราฟการขาดทุน <em>(Drawdown)</em></b></div><strong className={styles.bad}>{percent(summary.maxDrawdownPercent)}</strong></div><PremiumChart points={ddCurve} valueKey="drawdownPercent" drawdown id="account-dd"/></div></section>

    <section className={`${styles.panel} ${styles.statsPanel}`}><div className={styles.sectionTitle}><span>▮▮</span><b>สถิติผลการทดสอบโดยละเอียด</b></div><div className={styles.statsColumns}><div><Stat label="กำไรรวม (Gross Profit)" value={money(summary.grossProfit)}/><Stat label="ขาดทุนรวม (Gross Loss)" value={money(-Math.abs(Number(summary.grossLoss || 0)))} className={styles.bad}/><Stat label="อัตราการฟื้นตัว (Recovery Factor)" value={num(summary.recoveryFactor)}/></div><div><Stat label="จำนวนการเทรดทั้งหมด" value={String(summary.trades ?? 0)}/><Stat label="อัตราชนะ (Win Rate)" value={`${percent(summary.winRate)} (${summary.wins ?? 0} / ${summary.trades ?? 0})`} className={styles.good}/><Stat label="แพ้" value={String(summary.losses ?? 0)}/></div><div><Stat label="กำไรเฉลี่ยต่อไม้" value={money(summary.averageWin)}/><Stat label="ขาดทุนเฉลี่ยต่อไม้" value={money(summary.averageLoss)} className={styles.bad}/><Stat label="Max Drawdown" value={`${percent(summary.maxDrawdownPercent)} (${money(summary.maxDrawdownMoney)})`} className={styles.bad}/></div></div></section>

    <section className={styles.bottomGrid}><div className={`${styles.panel} ${styles.aboutPanel}`}><div className={styles.sectionTitle}><span>▣</span><b>เกี่ยวกับรายงาน</b></div><p>{mode==="LIVE"?`รายงานนี้สรุปผลจริงของบัญชี ${report?.account?.accountNumber || "MT5"} จากข้อมูล Trade Journal ที่ SCENOVA บันทึกไว้ สามารถเลือกช่วงเวลาและแชร์ Snapshot แบบ Read-only ได้`:`รายงาน Backtest ${backtest?.title || "ที่เลือก"} แสดงผลตามข้อมูลที่ถูกบันทึกไว้ในระบบ โดยแยกออกจาก Live Performance อย่างชัดเจน`}</p></div><div className={`${styles.panel} ${styles.conditionsPanel}`}><div className={styles.sectionTitle}><span>⚙</span><b>เงื่อนไขรายงาน</b></div><ul><li>บัญชี: {report?.account?.accountNumber || "—"}</li><li>Symbol: {report?.account?.symbol || backtest?.symbol || "—"}</li><li>Timeframe: {report?.account?.timeframe || backtest?.timeframe || "—"}</li><li>ช่วงข้อมูล: {from} → {to}</li></ul></div><div className={styles.riskPanel}><b>⚠ คำเตือนความเสี่ยง</b><p>ผลการเทรดในอดีตไม่ได้รับประกันผลในอนาคต ค่า Drawdown หน้านี้เป็น Closed-performance Drawdown จนกว่าจะมี Equity Snapshot แบบต่อเนื่อง</p></div></section>

    <section className={styles.actionBar}><div><b>{mode==="LIVE"?"แชร์ Performance":"Export Report"}</b><span>{mode==="LIVE"?"สร้าง Snapshot แล้วส่งลิงก์ให้ผู้อื่นดูได้":"ดาวน์โหลดหรือพิมพ์รายงาน"}</span></div><div>{mode==="LIVE"?<button className={styles.secondaryBtn} onClick={createShare} disabled={sharing || !Number(summary.trades||0)}>{sharing?"กำลังสร้าง…":"🔗 สร้างลิงก์"}</button>:null}{shareResult?.path?<><button className={styles.secondaryBtn} onClick={copyShare}>คัดลอกลิงก์</button><a className={styles.secondaryBtn} href={shareResult.path} target="_blank" rel="noreferrer">เปิด Public Page</a></>:null}<button className={styles.secondaryBtn} onClick={downloadCsv}>CSV</button><button className={styles.primaryBtn} onClick={()=>window.print()}>ดูสถิติ / PDF →</button></div></section>

    <section className={`${styles.panel} ${styles.tradesPanel}`}><div className={styles.panelHead}><div><span className={styles.panelIcon}>☷</span><b>รายการเทรด</b></div><small>แสดงสูงสุด 100 รายการ</small></div><TradesTable rows={mode==="LIVE"?(report?.closedTrades||[]):(backtest?.trades||[])} backtest={mode==="BACKTEST"}/></section>
  </>;
}

function Stat({ label, value, className="" }:{ label:string; value:string; className?:string }) {
  return <div className={styles.stat}><span>{label}</span><b className={className}>{value}</b></div>;
}

function TradesTable({ rows, backtest }:{ rows:any[]; backtest:boolean }) {
  return <div className={styles.tableWrap}><table><thead><tr><th>#</th><th>Ticket</th><th>Symbol</th><th>Side</th><th>Lot</th><th>Entry</th><th>Exit</th><th>P/L</th><th>Close Time</th></tr></thead><tbody>{(rows||[]).slice(0,100).map((r:any,i:number)=>{const side=String(backtest?r.direction:r.side||"").toUpperCase(); const profit=Number(backtest?r.profit:r.profit||0); const dt=backtest?(r.closed_at||r.opened_at):r.closedAt; return <tr key={String(r.ticket||r.trade_index||i)}><td>{i+1}</td><td>{backtest?r.trade_index:r.ticket}</td><td>{backtest?(r.metadata?.symbol||"—"):r.symbol}</td><td><span className={side==="BUY"?styles.buy:styles.sell}>{side||"—"}</span></td><td>{num(backtest?r.volume:r.lot)}</td><td>{num(backtest?r.open_price:r.entryPrice,3)}</td><td>{num(backtest?r.close_price:r.exitPrice,3)}</td><td className={tone(profit)}>{money(profit,true)}</td><td>{dt?new Date(dt).toLocaleString("th-TH"):"—"}</td></tr>})}{!rows?.length?<tr><td colSpan={9} className={styles.emptyCell}>ยังไม่มีรายการในช่วงเวลาที่เลือก</td></tr>:null}</tbody></table></div>;
}
