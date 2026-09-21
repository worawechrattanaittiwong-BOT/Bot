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

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function inclusiveDays(from:string,to:string) {
  const start = new Date(from + "T00:00:00+07:00").getTime();
  const end = new Date(to + "T00:00:00+07:00").getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / 86400000) + 1;
}

function rangeFromDays(endRaw:string,daysRaw:number) {
  const days = Math.max(1,Math.min(730,Math.trunc(daysRaw || 1)));
  const end = new Date((endRaw || isoDate(new Date())) + "T12:00:00+07:00");
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  return { from: isoDate(start), to: isoDate(end) };
}

function currencyCode(value: any) {
  const code = String(value || "").trim().toUpperCase();
  return code || "UNKNOWN";
}

function money(value: any, signed = false, currency: any = "UNKNOWN") {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const sign = signed && n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencyCode(currency)}`;
}

function number(value: any, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

function percent(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : "—";
}

function tone(value: any) {
  const n = Number(value || 0);
  return n > 0 ? styles.good : n < 0 ? styles.bad : styles.muted;
}

function withDrawdown(points: any[]) {
  let peak = 0;
  return (points || []).map((point) => {
    const balance = Number(point.balance ?? point.cumulative ?? 0);
    peak = Math.max(peak, balance);
    const drawdownPercent = peak > 0 ? Math.max(0, (peak - balance) / peak * 100) : 0;
    return { ...point, balance, equity: Number(point.equity ?? balance), drawdownPercent };
  });
}

function Kpi({ label, value, sub, className = "" }:{ label:string; value:string; sub?:string; className?:string }) {
  return (
    <div className={`${styles.kpi} ${className}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

function chartPointTime(point:any) {
  return point?.time || point?.closedAt || point?.closed_at || point?.day || point?.date || null;
}

function chartAxisLabel(value:any, singleDay:boolean) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return "";
  return singleDay
    ? date.toLocaleTimeString("th-TH", { timeZone:"Asia/Bangkok", hour:"2-digit", minute:"2-digit", hour12:false })
    : date.toLocaleDateString("th-TH", { timeZone:"Asia/Bangkok", day:"2-digit", month:"2-digit" });
}

function LineChart({
  points,
  valueKey = "balance",
  secondaryKey = "equity",
  from = "",
  to = ""
}:{ points:any[]; valueKey?:string; secondaryKey?:string; from?:string; to?:string }) {
  const width = 900;
  const height = 278;
  const left = 26;
  const right = 10;
  const top = 10;
  const bottom = 34;
  if (!points?.length) return <div className={styles.emptyChart}>ยังไม่มีข้อมูลในช่วงเวลานี้</div>;
  const primary = points.map((point) => Number(point[valueKey] ?? point.cumulative ?? 0));
  const secondary = points.map((point) => Number(point[secondaryKey] ?? point[valueKey] ?? point.cumulative ?? 0));
  const values = [...primary, ...secondary].filter(Number.isFinite);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(1, (max - min) * .06);
  const low = min - pad;
  const high = max + pad;
  const range = Math.max(1, high - low);
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const coords = (series:number[]) => series.map((value, index) => {
    const x = left + (series.length <= 1 ? 0 : index / (series.length - 1) * plotWidth);
    const y = top + (high - value) / range * plotHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const fromDate = from ? new Date(from + "T00:00:00+07:00") : null;
  const toDate = to ? new Date(to + "T23:59:59+07:00") : null;
  const firstTime = chartPointTime(points[0]);
  const lastTime = chartPointTime(points[points.length - 1]);
  const firstDate = fromDate || (firstTime ? new Date(firstTime) : null);
  const lastDate = toDate || (lastTime ? new Date(lastTime) : null);
  const singleDay = Boolean(firstDate && lastDate &&
    new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).format(firstDate) ===
    new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).format(lastDate));
  const tickCount = Math.min(7, Math.max(2, points.length));
  const tickIndexes = Array.from({length:tickCount},(_,i)=>Math.round(i*(points.length-1)/Math.max(1,tickCount-1)))
    .filter((index,pos,arr)=>pos===0||index!==arr[pos-1]);

  return (
    <svg className={styles.lineChart} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Performance chart">
      {tickIndexes.map((index) => {
        const x = left + (points.length <= 1 ? 0 : index / (points.length - 1) * plotWidth);
        const rawTime = chartPointTime(points[index]);
        const label = rawTime ? chartAxisLabel(rawTime,singleDay) : String(index+1);
        return <g key={index}><line className={styles.chartTickLine} x1={x} x2={x} y1={top} y2={top+plotHeight}/><text className={styles.chartTickLabel} x={x} y={height-8} textAnchor="middle">{label}</text></g>;
      })}
      <polyline className={styles.lineSecondary} points={coords(secondary)} fill="none" vectorEffect="non-scaling-stroke" />
      <polyline className={styles.linePrimary} points={coords(primary)} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function DrawdownChart({ points, from = "", to = "" }:{ points:any[]; from?:string; to?:string }) {
  const normalized = (points || []).map((point) => ({ ...point, dd: -Math.abs(Number(point.drawdownPercent || 0)) }));
  return <LineChart points={normalized} valueKey="dd" secondaryKey="dd" from={from} to={to}/>;
}

function MonthlyBars({ rows, currency }:{ rows:any[]; currency:any }) {
  const max = Math.max(1, ...(rows || []).map((row) => Math.abs(Number(row.returnPercent ?? row.profit ?? 0))));
  if (!rows?.length) return <div className={styles.emptyChart}>ยังไม่มีข้อมูลรายเดือน</div>;
  return (
    <div className={styles.monthBars}>
      {rows.map((row) => {
        const value = Number(row.returnPercent ?? row.profit ?? 0);
        return (
          <div className={styles.monthBarItem} key={row.month}>
            <div className={styles.monthBarTrack}>
              <div className={value >= 0 ? styles.monthBarPositive : styles.monthBarNegative} style={{ height: `${Math.max(4, Math.abs(value) / max * 100)}%` }} />
            </div>
            <b className={value >= 0 ? styles.good : styles.bad}>{row.returnPercent === null || row.returnPercent === undefined ? money(row.profit, true, currency) : `${value.toFixed(1)}%`}</b>
            <small>{row.month}</small>
          </div>
        );
      })}
    </div>
  );
}

function QualityCard({ quality }:{ quality:any }) {
  const rows = [
    ["Stability", "ความเสถียร", quality?.stability],
    ["Risk Control", "การควบคุมความเสี่ยง", quality?.riskControl],
    ["Consistency", "ความสม่ำเสมอ", quality?.consistency],
    ["Drawdown Discipline", "วินัยด้าน Drawdown", quality?.drawdownDiscipline],
    ["Execution Quality", "คุณภาพการส่งคำสั่ง", quality?.executionQuality]
  ];
  const score = Number(quality?.score || 0);
  const stars = Math.max(0, Math.min(5, Number(quality?.stars || 0)));
  return (
    <section className={`${styles.card} ${styles.qualityCard}`}>
      <div className={styles.cardTitle}><div><b>Risk & Quality Score</b><small>SCENOVA Quality Score · แบบประเมินเชิงสถิติ</small></div></div>
      <div className={styles.qualityTop}>
        <div className={styles.scoreRing}><strong>{score}</strong><span>/100</span></div>
        <div><span className={styles.scoreLabel}>{score >= 85 ? "ยอดเยี่ยม" : score >= 70 ? "ดี" : score >= 55 ? "ปานกลาง" : "ต้องติดตาม"}</span><div className={styles.stars}>{[1,2,3,4,5].map((n)=><span key={n} className={n <= Math.round(stars) ? styles.starOn : styles.starOff}>★</span>)}</div><small>คะแนนนี้เป็น heuristic เพื่อช่วยอ่านคุณภาพ ไม่ใช่การรับประกันผลตอบแทน</small></div>
      </div>
      <div className={styles.scoreRows}>
        {rows.map(([en, th, raw]) => {
          const value = Math.max(0, Math.min(100, Number(raw || 0)));
          return <div className={styles.scoreRow} key={String(en)}><div><span>{en}</span><small>{th}</small></div><div className={styles.scoreTrack}><i style={{ width:`${value}%` }}/></div><b>{value.toFixed(0)}</b></div>;
        })}
      </div>
    </section>
  );
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

export default function PerformanceDashboardPage() {
  const today = useMemo(() => new Date(), []);
  const [options, setOptions] = useState<Options | null>(null);
  const [scope, setScope] = useState<Scope>("ACCOUNT");
  const [mode, setMode] = useState<Mode>("LIVE");
  const [accountId, setAccountId] = useState("");
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState(isoDate(new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000)));
  const [to, setTo] = useState(isoDate(today));
  const [customDays, setCustomDays] = useState("30");
  const [report, setReport] = useState<any>(null);
  const [system, setSystem] = useState<any>(null);
  const [selectedBacktestId, setSelectedBacktestId] = useState("");
  const [backtest, setBacktest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [shareResult, setShareResult] = useState<any>(null);
  const [error, setError] = useState("");

  const elevated = Boolean(options?.elevated);
  const users = useMemo(() => {
    const map = new Map<string, any>();
    (options?.accounts || []).forEach((account) => map.set(account.userId, { id:account.userId, userCode:account.userCode, email:account.email }));
    return Array.from(map.values());
  }, [options]);
  const visibleAccounts = useMemo(() => (options?.accounts || []).filter((account) => !userId || account.userId === userId), [options, userId]);

  function logout() {
    localStorage.removeItem("bot_token");
    window.location.href = "/login";
  }

  async function loadOptions() {
    try {
      const next = await api("/performance-analytics/options");
      setOptions(next);
      const first = next.accounts?.[0];
      if (first) {
        setAccountId(first.id);
        setUserId(first.userId || "");
      }
      if (next.elevated) setScope("SYSTEM");
      setError("");
    } catch (e:any) {
      setError(String(e?.message || "โหลดข้อมูลไม่สำเร็จ"));
    }
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
          const firstId = selectedBacktestId || next.backtests?.[0]?.id || "";
          setSelectedBacktestId(firstId);
          if (firstId) setBacktest(await api(`/performance-analytics/backtest?id=${encodeURIComponent(firstId)}`));
          else setBacktest(null);
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
    loadOptions().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!options) return;
    setShareResult(null);
    refresh();
  }, [options, scope, mode, accountId, from, to]);

  function applyDays(days:number) {
    const range = rangeFromDays(to || isoDate(today), days);
    setFrom(range.from);
    setTo(range.to);
    setCustomDays(String(days));
  }

  async function chooseBacktest(id:string) {
    setSelectedBacktestId(id);
    if (!id) { setBacktest(null); return; }
    try { setBacktest(await api(`/performance-analytics/backtest?id=${encodeURIComponent(id)}`)); }
    catch (e:any) { setError(String(e?.message || "โหลด Backtest ไม่สำเร็จ")); }
  }

  async function downloadCsv() {
    if (!accountId) return;
    const response = await fetch(`${API_URL}/api/performance-analytics/export.csv?accountId=${encodeURIComponent(accountId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
      headers: { Authorization: `Bearer ${getToken()}` }, cache:"no-store"
    });
    if (!response.ok) { setError("ดาวน์โหลด CSV ไม่สำเร็จ"); return; }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `scenova-performance-${report?.account?.accountNumber || "report"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function createShareSnapshot() {
    if (!accountId || mode !== "LIVE") return;
    setSharing(true);
    try {
      const result = await api("/performance-actions/share-live", {
        method: "POST",
        body: JSON.stringify({ accountId, from, to })
      });
      setShareResult(result);
      setError("");
    } catch (e:any) {
      setError(String(e?.message || "สร้างลิงก์แชร์ไม่สำเร็จ"));
    } finally {
      setSharing(false);
    }
  }

  async function copyShareLink() {
    if (!shareResult?.path) return;
    const url = `${window.location.origin}${shareResult.path}`;
    await navigator.clipboard.writeText(url);
  }

  async function resetTestData() {
    if (!elevated) return;
    const typed = window.prompt("ล้างข้อมูลทดสอบ Performance ทั้งระบบ\n\nจะลบ Trade Journal, Backtest และลิงก์แชร์ทั้งหมด แต่จะไม่ลบลูกค้า บัญชี MT5 สมาชิก หรือการตั้งค่าบอท\n\nพิมพ์ RESET เพื่อยืนยัน");
    if (typed !== "RESET") return;
    if (!window.confirm("ยืนยันอีกครั้ง: ต้องการล้างข้อมูลทดสอบ Performance ทั้งระบบใช่หรือไม่?")) return;
    setResetting(true);
    try {
      const result = await api("/performance-actions/reset-test-data", {
        method: "POST",
        body: JSON.stringify({ confirm: "RESET" })
      });
      setShareResult(null);
      setBacktest(null);
      setSelectedBacktestId("");
      await refresh();
      window.alert(`ล้างข้อมูลทดสอบแล้ว\nTrade Journal: ${result?.deleted?.tradeJournal || 0}\nBacktest: ${result?.deleted?.backtestRuns || 0}\nShare: ${result?.deleted?.performanceShares || 0}`);
    } catch (e:any) {
      setError(String(e?.message || "ล้างข้อมูลไม่สำเร็จ"));
    } finally {
      setResetting(false);
    }
  }

  function drillAccount(nextAccountId:string, nextUserId:string) {
    setUserId(nextUserId);
    setAccountId(nextAccountId);
    setScope("ACCOUNT");
    setMode("LIVE");
  }

  const activeBacktest = mode === "BACKTEST" ? backtest : null;
  const liveSummary = report?.summary || {};
  const backSummary = activeBacktest?.summary || {};
  const summary = mode === "BACKTEST" ? {
    netProfit: backSummary.netProfit,
    returnPercent: backSummary.returnPercent,
    winRate: backSummary.winRate,
    profitFactor: backSummary.profitFactor,
    maxDrawdownPercent: backSummary.maxDrawdownPercent,
    maxDrawdownMoney: backSummary.maxDrawdownMoney,
    sharpeRatio: null,
    recoveryFactor: backSummary.maxDrawdownMoney ? Number(backSummary.netProfit || 0) / Number(backSummary.maxDrawdownMoney || 1) : null,
    trades: backSummary.closedTrades,
    grossProfit: backSummary.grossProfit,
    grossLoss: backSummary.grossLoss,
    wins: backSummary.wins,
    losses: backSummary.losses
  } : liveSummary;
  const curve = mode === "BACKTEST"
    ? withDrawdown((activeBacktest?.equity_curve || []).map((p:any) => ({ ...p, balance:Number(p.balance||0), equity:Number(p.balance||0) })))
    : (report?.curve || []);
  const monthly = mode === "BACKTEST" ? [] : (report?.monthly || []);
  const initialBalance = mode === "BACKTEST" ? backSummary.initialDeposit : report?.balance?.derivedStart;
  const activeCurrency = mode === "BACKTEST"
    ? currencyCode(activeBacktest?.currency)
    : currencyCode(report?.account?.currency);

  return (
    <div className={styles.shell}>
      {elevated ? <OwnerSidebar activeKey="trading-backtest" onLogout={logout}/> : <CustomerSidebar onLogout={logout}/>} 
      <main className={styles.main}>
        {scope === "SYSTEM" && elevated ? (
          <header className={styles.header}>
            <div className={styles.headerTitle}><span className={styles.headerIcon}><ScenovaIcon name="strategy" size={24}/></span><div><h1>Trading Performance & Backtest</h1><p>ภาพรวมผลการเทรดทั้งระบบและรายบัญชี</p></div></div>
            <div className={styles.headerMeta}><span className={styles.onlineDot}/><div><b>{options?.user?.user_code || "SCENOVA"}</b><small>Owner / Admin Analytics</small></div></div>
          </header>
        ) : null}

        {error ? <div className={styles.error}>{error}</div> : null}

        {elevated ? (
          <div className={styles.scopeTabs}>
            <button className={scope === "SYSTEM" ? styles.tabActive : ""} onClick={()=>setScope("SYSTEM")}>ภาพรวมทั้งระบบ</button>
            <button className={scope === "ACCOUNT" ? styles.tabActive : ""} onClick={()=>setScope("ACCOUNT")}>รายลูกค้า / รายบัญชี</button>
          </div>
        ) : null}

        <section className={styles.filters}>
          {elevated && scope === "ACCOUNT" ? (
            <label><span>ลูกค้า</span><select value={userId} onChange={(e)=>{ const id=e.target.value; setUserId(id); const first=(options?.accounts||[]).find((a)=>a.userId===id); if(first)setAccountId(first.id); }}><option value="">ทุกคน</option>{users.map((user)=><option value={user.id} key={user.id}>{user.userCode} · {user.email}</option>)}</select></label>
          ) : null}
          {scope === "ACCOUNT" ? (
            <label className={styles.accountSelect}><span>{elevated ? "บัญชีที่ต้องการดู" : "บัญชีของฉัน"}</span><select value={accountId} onChange={(e)=>setAccountId(e.target.value)}>{visibleAccounts.map((account)=><option value={account.id} key={account.id}>{account.accountNumber} · {account.broker} · {account.mode}</option>)}</select></label>
          ) : null}
          <label><span>ตั้งแต่วันที่</span><input type="date" value={from} onChange={(e)=>setFrom(e.target.value)}/></label>
          <label><span>ถึงวันที่</span><input type="date" value={to} onChange={(e)=>setTo(e.target.value)}/></label>
          {scope === "ACCOUNT" ? <label><span>โหมดข้อมูล</span><select value={mode} onChange={(e)=>setMode(e.target.value as Mode)}><option value="LIVE">Live Performance</option><option value="BACKTEST">Backtest</option></select></label> : null}
          <button className={styles.refreshButton} onClick={refresh} disabled={loading}><ScenovaIcon name="refresh" size={16}/>{loading ? "กำลังโหลด..." : "Refresh ข้อมูล"}</button>
          {elevated ? <button className={styles.resetButton} onClick={resetTestData} disabled={resetting}>{resetting ? "กำลังล้าง..." : "Refresh / ล้างข้อมูลทดสอบ"}</button> : null}
        </section>

        <section className={styles.rangeTools}>
          <div className={styles.rangePresetButtons}>
            <button type="button" onClick={()=>applyDays(1)}>วันนี้</button>
            <button type="button" onClick={()=>applyDays(7)}>7 วัน</button>
            <button type="button" onClick={()=>applyDays(30)}>30 วัน</button>
            <button type="button" onClick={()=>applyDays(90)}>90 วัน</button>
          </div>
          <div className={styles.customDays}>
            <span>กำหนดเอง</span>
            <input type="number" min="1" max="730" value={customDays} onChange={(e)=>setCustomDays(e.target.value.replace(/\D/g,"").slice(0,3))}/>
            <span>วันย้อนหลังจากวันที่สิ้นสุด</span>
            <button type="button" onClick={()=>applyDays(Number(customDays||1))}>ใช้ช่วงนี้</button>
          </div>
          <strong>{inclusiveDays(from,to)} วัน · {from} → {to}</strong>
        </section>

        {scope === "SYSTEM" && elevated ? (
          <SystemOverview data={system} loading={loading} onDrill={drillAccount}/>
        ) : (
          <>
            <section className={styles.syncBar}>
              <div><span className={report?.status?.online ? styles.syncGreen : styles.syncGray}/><b>{mode === "LIVE" ? "ข้อมูลจริงจากบัญชีลูกค้า" : "ผล Backtest ที่บันทึกในระบบ"}</b><small>{mode === "LIVE" ? `${report?.account?.accountNumber || "—"} · ${report?.account?.brokerServer || "—"}` : "ข้อมูล Backtest แยกจาก Live Performance"}</small></div>
              <div><span>อัปเดตล่าสุด</span><b>{report?.status?.lastSeenAt ? new Date(report.status.lastSeenAt).toLocaleString("th-TH") : "—"}</b></div>
            </section>

            {mode === "LIVE" ? (
              <section className={styles.sharePanel}>
                <div><b>แชร์ Trading Performance แบบ Read-only</b><small>คนที่มีลิงก์สามารถเลือกวันที่, 7/30/90 วัน หรือกำหนดจำนวนวันเองได้ โดยไม่มีสิทธิ์สั่งเทรดหรือเข้าบัญชี</small></div>
                <div className={styles.shareButtons}>
                  <button onClick={createShareSnapshot} disabled={sharing || !Number(summary.trades || 0)}>{sharing ? "กำลังสร้าง..." : "สร้างลิงก์แชร์"}</button>
                  {shareResult?.path ? <><input className={styles.shareLink} readOnly value={`${typeof window !== "undefined" ? window.location.origin : ""}${shareResult.path}`}/><button onClick={copyShareLink}>คัดลอกลิงก์</button><a href={shareResult.path} target="_blank" rel="noreferrer">เปิดหน้าสาธารณะ</a></> : null}
                </div>
              </section>
            ) : null}

            {mode === "BACKTEST" ? (
              <section className={styles.backtestPicker}><div><b>เลือกรายงาน Backtest</b><small>Admin ดูของบัญชีที่เลือกได้ ลูกค้าดูเฉพาะของตัวเอง</small></div><select value={selectedBacktestId} onChange={(e)=>chooseBacktest(e.target.value)}><option value="">เลือกรายงาน</option>{(report?.backtests || []).map((run:any)=><option value={run.id} key={run.id}>{run.title} · {run.symbol} · {run.timeframe}</option>)}</select></section>
            ) : null}

            <PerformanceSummaryReport
              mode={mode}
              report={report}
              backtest={activeBacktest}
              summary={summary}
              liveSummary={liveSummary}
              curve={curve}
              initialBalance={initialBalance}
              currency={activeCurrency}
              from={from}
              to={to}
              loading={loading}
              onDownloadCsv={downloadCsv}
            />

            <details className={styles.reportTradesDetails}>
              <summary><ScenovaIcon name="orders" size={15}/><span>ดูรายการเทรดทั้งหมดในช่วงนี้</span></summary>
              <section className={`${styles.card} ${styles.tradesCard}`}>
                <div className={styles.cardTitle}><div><b>{mode === "LIVE" ? "รายการเทรดที่ปิดแล้ว" : "Backtest Trades"}</b><small>{mode === "LIVE" ? "Closed Trades จาก MT5 Trade Journal" : "รายการจาก Backtest ที่บันทึก"}</small></div><div className={styles.exportActions}>{mode === "LIVE" ? <button onClick={downloadCsv}>ดาวน์โหลด CSV</button> : null}<button onClick={()=>window.print()}>พิมพ์ / PDF</button></div></div>
                <TradesTable rows={mode === "LIVE" ? (report?.closedTrades || []) : (activeBacktest?.trades || [])} backtest={mode === "BACKTEST"} currency={activeCurrency}/>
              </section>
            </details>
          </>
        )}
      </main>
    </div>
  );
}


function deriveReportTradeStats(rows:any[]) {
  const normalized=(rows||[]).map((row:any)=>({
    profit:Number(row.profit ?? row.net_profit ?? 0),
    side:String(row.side ?? row.direction ?? "").toUpperCase()
  }));
  const wins=normalized.filter((row)=>row.profit>0);
  const losses=normalized.filter((row)=>row.profit<0);
  const bySide=(side:string)=>{
    const selected=normalized.filter((row)=>row.side===side);
    const won=selected.filter((row)=>row.profit>0).length;
    return { count:selected.length, winRate:selected.length?won/selected.length*100:0 };
  };
  let maxWinStreak=0,maxLossStreak=0,currentWin=0,currentLoss=0;
  let currentWinMoney=0,currentLossMoney=0,maxWinMoney=0,maxLossMoney=0;
  let winRuns=0,lossRuns=0,totalWinRunLength=0,totalLossRunLength=0;
  normalized.forEach((row)=>{
    if(row.profit>0){
      if(currentWin===0) winRuns++;
      currentWin++; currentWinMoney+=row.profit;
      currentLoss=0; currentLossMoney=0;
      totalWinRunLength++;
      if(currentWin>maxWinStreak){maxWinStreak=currentWin;maxWinMoney=currentWinMoney;}
      else if(currentWin===maxWinStreak) maxWinMoney=Math.max(maxWinMoney,currentWinMoney);
    }else if(row.profit<0){
      if(currentLoss===0) lossRuns++;
      currentLoss++; currentLossMoney+=row.profit;
      currentWin=0; currentWinMoney=0;
      totalLossRunLength++;
      if(currentLoss>maxLossStreak){maxLossStreak=currentLoss;maxLossMoney=currentLossMoney;}
      else if(currentLoss===maxLossStreak) maxLossMoney=Math.min(maxLossMoney,currentLossMoney);
    }else{
      currentWin=0;currentLoss=0;currentWinMoney=0;currentLossMoney=0;
    }
  });
  return {
    total:normalized.length,
    wins:wins.length,
    losses:losses.length,
    long:bySide("BUY"),
    short:bySide("SELL"),
    largestProfit:wins.length?Math.max(...wins.map((row)=>row.profit)):0,
    largestLoss:losses.length?Math.min(...losses.map((row)=>row.profit)):0,
    averageProfit:wins.length?wins.reduce((sum,row)=>sum+row.profit,0)/wins.length:0,
    averageLoss:losses.length?losses.reduce((sum,row)=>sum+row.profit,0)/losses.length:0,
    maxWinStreak,maxLossStreak,maxWinMoney,maxLossMoney,
    averageWinStreak:winRuns?totalWinRunLength/winRuns:0,
    averageLossStreak:lossRuns?totalLossRunLength/lossRuns:0
  };
}

function reportDateLabel(value:any) {
  if(!value) return "—";
  const date=new Date(value);
  if(!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("th-TH",{timeZone:"Asia/Bangkok",dateStyle:"medium",timeStyle:"short"});
}

function ReportRow({label,value,toneClass=""}:{label:string;value:string;toneClass?:string}) {
  return <div className={styles.reportRow}><span>{label}</span><b className={toneClass}>{value}</b></div>;
}

function ReportMetric({icon,label,value,toneClass=""}:{icon:string;label:string;value:string;toneClass?:string}) {
  return <div className={styles.reportMetric}><div><ScenovaIcon name={icon} size={13}/><span>{label}</span></div><b className={toneClass}>{value}</b></div>;
}

function PerformanceSummaryReport(props:{
  mode:Mode;report:any;backtest:any;summary:any;liveSummary:any;curve:any[];initialBalance:any;
  currency:string;from:string;to:string;loading:boolean;onDownloadCsv:()=>void;
}) {
  const rows=props.mode==="LIVE"?(props.report?.closedTrades||[]):(props.backtest?.trades||[]);
  const stats=deriveReportTradeStats(rows);
  const finalBalance=props.mode==="LIVE"
    ? Number(props.report?.balance?.current ?? Number(props.initialBalance||0)+Number(props.summary?.netProfit||0))
    : Number(props.backtest?.summary?.finalBalance ?? Number(props.initialBalance||0)+Number(props.summary?.netProfit||0));
  const startTime=props.mode==="LIVE"
    ? props.report?.range?.from
    : props.backtest?.started_at;
  const stopTime=props.mode==="LIVE"
    ? props.report?.range?.to
    : props.backtest?.ended_at;
  const account=props.report?.account||{};
  const expectedPayoff=Number(props.summary?.trades||0)>0
    ? Number(props.summary?.netProfit||0)/Number(props.summary?.trades||1)
    : 0;
  const periodDays=inclusiveDays(props.from,props.to);
  const singleDay=props.from===props.to;

  return (
    <section className={styles.reportFrame}>
      <header className={styles.reportHero}>
        <div className={styles.reportTitleLine}>
          <ScenovaIcon name="pnl" size={24}/>
          <h1>TRADING PERFORMANCE & BACKTEST</h1>
          <ScenovaIcon name="pnl" size={24}/>
        </div>
        <p>สรุปผลการเทรดในรูปแบบเดียวกับ Performance Report</p>
      </header>

      <section className={styles.reportInfo}>
        <div>
          <ReportRow label="Account" value={props.mode==="LIVE"?(account.accountNumber||"—"):(props.backtest?.title||"Backtest")}/>
          <ReportRow label="Symbol" value={props.mode==="LIVE"?(account.symbol||"—"):(props.backtest?.symbol||"—")}/>
          <ReportRow label="Currency" value={props.currency}/>
        </div>
        <div>
          <ReportRow label="Runtime Mode" value={props.mode==="LIVE"?(account.mode||"LIVE"):"BACKTEST"}/>
          <ReportRow label="Start Time" value={reportDateLabel(startTime)}/>
          <ReportRow label="Status" value={props.mode==="LIVE"?(props.report?.status?.actualState||"LIVE"):(props.backtest?.status||"COMPLETED")}/>
        </div>
        <div>
          <ReportRow label="Stop Time" value={reportDateLabel(stopTime)}/>
          <ReportRow label="Selected Period" value={periodDays+" วัน"}/>
          <ReportRow label="Closed Trades" value={String(Number(props.summary?.trades||0))}/>
        </div>
      </section>

      <section className={styles.reportMetrics}>
        <ReportMetric icon="wallet" label="Start Capital" value={money(props.initialBalance,false,props.currency)}/>
        <ReportMetric icon="equity" label="End Balance" value={money(finalBalance,false,props.currency)}/>
        <ReportMetric icon="profit" label="Net Profit" value={money(props.summary?.netProfit,true,props.currency)} toneClass={tone(props.summary?.netProfit)}/>
        <ReportMetric icon="trend" label="Return" value={percent(props.summary?.returnPercent)} toneClass={tone(props.summary?.returnPercent)}/>
        <ReportMetric icon="calendar" label="Period" value={periodDays+" วัน"}/>
        <ReportMetric icon="risk" label="Max Drawdown" value={percent(props.summary?.maxDrawdownPercent)}/>
        <ReportMetric icon="target" label="Win Rate" value={percent(props.summary?.winRate)}/>
      </section>

      <div className={styles.reportSectionTitle}><ScenovaIcon name="report" size={14}/>Results</div>
      <div className={styles.reportResultsGrid}>
        <section className={styles.reportPanel}>
          <h3><ScenovaIcon name="profit" size={14}/>Performance</h3>
          <ReportRow label="Total Net Profit" value={money(props.summary?.netProfit,true,props.currency)} toneClass={tone(props.summary?.netProfit)}/>
          <ReportRow label="Profit (%)" value={percent(props.summary?.returnPercent)} toneClass={tone(props.summary?.returnPercent)}/>
          <ReportRow label="Gross Profit" value={money(props.summary?.grossProfit,false,props.currency)}/>
          <ReportRow label="Gross Loss" value={money(-Math.abs(Number(props.summary?.grossLoss||0)),false,props.currency)} toneClass={styles.bad}/>
          <ReportRow label="Profit Factor" value={number(props.summary?.profitFactor,2)}/>
          <ReportRow label="Expected Payoff" value={money(expectedPayoff,false,props.currency)}/>
          <ReportRow label="Recovery Factor" value={number(props.summary?.recoveryFactor,2)}/>
          <ReportRow label="Sharpe Ratio" value={number(props.summary?.sharpeRatio,2)}/>
        </section>

        <div className={styles.reportMiddleStack}>
          <section className={styles.reportPanel}>
            <h3><ScenovaIcon name="shield" size={14}/>Drawdown</h3>
            <ReportRow label="Max Drawdown" value={percent(props.summary?.maxDrawdownPercent)}/>
            <ReportRow label="Drawdown Money" value={money(props.summary?.maxDrawdownMoney,false,props.currency)}/>
          </section>
          <section className={styles.reportPanel}>
            <h3><ScenovaIcon name="orders" size={14}/>Trades</h3>
            <ReportRow label="Total Trades" value={String(props.summary?.trades??0)}/>
            <ReportRow label="Total Deals" value={String(stats.total)}/>
            <ReportRow label="Profit Trades" value={String(props.summary?.wins??0)}/>
            <ReportRow label="Loss Trades" value={String(props.summary?.losses??0)}/>
            <ReportRow label="Win Rate" value={percent(props.summary?.winRate)}/>
            <ReportRow label="Loss Rate" value={percent(Number(props.summary?.trades||0)>0?Number(props.summary?.losses||0)/Number(props.summary?.trades||1)*100:0)}/>
          </section>
        </div>

        <div className={styles.reportRightStack}>
          <section className={styles.reportPanel}>
            <h3><ScenovaIcon name="spread" size={14}/>Trade Direction</h3>
            <ReportRow label="Long Trades (won %)" value={stats.long.count+" ("+percent(stats.long.winRate)+")"}/>
            <ReportRow label="Short Trades (won %)" value={stats.short.count+" ("+percent(stats.short.winRate)+")"}/>
          </section>
          <section className={styles.reportPanel}>
            <h3><ScenovaIcon name="pnl" size={14}/>Trade Statistics</h3>
            <ReportRow label="Largest profit trade" value={money(stats.largestProfit,false,props.currency)}/>
            <ReportRow label="Largest loss trade" value={money(stats.largestLoss,false,props.currency)} toneClass={styles.bad}/>
            <ReportRow label="Average profit trade" value={money(stats.averageProfit,false,props.currency)}/>
            <ReportRow label="Average loss trade" value={money(stats.averageLoss,false,props.currency)} toneClass={styles.bad}/>
          </section>
          <section className={styles.reportPanel}>
            <h3><ScenovaIcon name="target" size={14}/>Streaks</h3>
            <ReportRow label="Maximum consecutive wins" value={stats.maxWinStreak+" ("+money(stats.maxWinMoney,false,props.currency)+")"}/>
            <ReportRow label="Maximum consecutive losses" value={stats.maxLossStreak+" ("+money(stats.maxLossMoney,false,props.currency)+")"} toneClass={styles.bad}/>
            <ReportRow label="Average consecutive wins" value={number(stats.averageWinStreak,1)}/>
            <ReportRow label="Average consecutive losses" value={number(stats.averageLossStreak,1)}/>
          </section>
        </div>
      </div>

      <section className={styles.reportChartPanel}>
        <div className={styles.reportChartHead}>
          <div><ScenovaIcon name="trend" size={14}/><b>Balance</b><small>{singleDay?"แกนล่างแสดงเวลา":"แกนล่างแสดงวันที่"}</small></div>
          <strong>End Balance: {money(finalBalance,false,props.currency)}</strong>
        </div>
        <LineChart points={props.curve} from={props.from} to={props.to}/>
      </section>
    </section>
  );
}

function TradeDistribution({ buy, sell, total }:{ buy:number; sell:number; total:number }) {
  const decided = buy + sell;
  const buyPct = decided > 0 ? buy / decided * 100 : 0;
  const sellPct = decided > 0 ? 100 - buyPct : 0;
  return <div className={styles.distribution}><div className={styles.donut} style={{ background:`conic-gradient(#45d69a 0 ${buyPct}%, #ff6678 ${buyPct}% 100%)` }}><div><b>{total}</b><span>Trades</span></div></div><div className={styles.legend}><span><i className={styles.buyDot}/>Buy <b>{buy} ({buyPct.toFixed(1)}%)</b></span><span><i className={styles.sellDot}/>Sell <b>{sell} ({sellPct.toFixed(1)}%)</b></span></div></div>;
}

function StrategySummary({ report, mode, backtest, from, to }:{ report:any; mode:Mode; backtest:any; from:string; to:string }) {
  const rows = mode === "LIVE" ? [
    ["ลูกค้า", report?.account?.userCode || report?.account?.email || "—"],
    ["บัญชี", report?.account?.accountNumber || "—"],
    ["โบรกเกอร์", report?.account?.broker || "—"],
    ["โหมด", `${report?.account?.mode || "—"} · Live`],
    ["สัญลักษณ์", report?.account?.symbol || "—"],
    ["กรอบเวลา", report?.account?.timeframe || "—"],
    ["ช่วงข้อมูล", `${from} → ${to}`],
    ["สกุลเงิน", currencyCode(report?.account?.currency)],
    ["Balance ล่าสุด", money(report?.balance?.current,false,report?.account?.currency)],
    ["Equity ล่าสุด", money(report?.balance?.equity,false,report?.account?.currency)]
  ] : [
    ["ชื่อรายงาน", backtest?.title || "—"], ["Source", backtest?.source || "—"], ["สัญลักษณ์", backtest?.symbol || "—"], ["กรอบเวลา", backtest?.timeframe || "—"], ["สกุลเงิน", currencyCode(backtest?.currency)], ["เงินเริ่มต้น", money(backtest?.initial_deposit,false,backtest?.currency)], ["Lot", String(backtest?.lot ?? "—")]
  ];
  return <div className={styles.summaryRows}>{rows.map(([label,value])=><div key={label}><span>{label}</span><b>{value}</b></div>)}</div>;
}

function TradesTable({ rows, backtest, currency }:{ rows:any[]; backtest:boolean; currency:any }) {
  return <div className={styles.tableWrap}><table><thead><tr><th>#</th><th>Ticket</th><th>Symbol</th><th>Side</th><th>Lot</th><th>Entry</th><th>Exit</th><th>P/L</th><th>Close Time</th></tr></thead><tbody>{(rows || []).slice(0,100).map((row:any,index:number)=>{ const side=String(backtest?row.direction:row.side||"").toUpperCase(); const profit=Number(row.profit||0); const dateValue=backtest?(row.closed_at||row.opened_at):row.closedAt; return <tr key={String(row.ticket||row.trade_index||index)}><td>{index+1}</td><td>{backtest?row.trade_index:row.ticket}</td><td>{backtest?(row.metadata?.symbol||"—"):row.symbol}</td><td><span className={side==="BUY"?styles.buyBadge:styles.sellBadge}>{side||"—"}</span></td><td>{number(backtest?row.volume:row.lot,2)}</td><td>{number(backtest?row.open_price:row.entryPrice,3)}</td><td>{number(backtest?row.close_price:row.exitPrice,3)}</td><td className={tone(profit)}>{money(profit,true,currency)}</td><td>{dateValue?new Date(dateValue).toLocaleString("th-TH"):"—"}</td></tr>;})}{!rows?.length?<tr><td colSpan={9} className={styles.emptyCell}>ยังไม่มีรายการในช่วงเวลาที่เลือก</td></tr>:null}</tbody></table></div>;
}

function SystemOverview({ data, loading, onDrill }:{ data:any; loading:boolean; onDrill:(accountId:string,userId:string)=>void }) {
  const summary = data?.summary || {};
  const currencySummaries = Array.isArray(data?.currencySummaries) ? data.currencySummaries : [];
  const singleCurrency = currencySummaries.length === 1 ? currencySummaries[0] : null;
  const netLabel = singleCurrency
    ? money(singleCurrency.netProfit, true, singleCurrency.currency)
    : currencySummaries.length > 1
      ? "แยก " + currencySummaries.length + " สกุล"
      : "—";
  const netDetail = currencySummaries.length
    ? currencySummaries.map((row:any)=>money(row.netProfit,true,row.currency)).join(" · ")
    : "ยังไม่มี Basket P/L";
  const profitFactorLabel = singleCurrency ? number(singleCurrency.profitFactor,2) : currencySummaries.length > 1 ? "แยกตามสกุล" : "—";

  return <>
    <section className={styles.systemNotice}><div><b>Admin System Performance</b><span>ภาพรวมนี้รวมเฉพาะบัญชีลูกค้า ไม่รวมบัญชี OWNER / ADMIN ภายใน · ค่าเงินแยกตามสกุลบัญชี MT5</span></div><strong>{loading?"กำลังอัปเดต...":"ข้อมูลจริงจาก SCENOVA"}</strong></section>
    <section className={styles.kpis}>
      <Kpi label="Customers" value={String(summary.customers||0)} sub="ลูกค้าที่มีในระบบ"/>
      <Kpi label="MT5 Accounts" value={String(summary.accounts||0)} sub="บัญชีลูกค้าทั้งหมด"/>
      <Kpi label="Online" value={String(summary.onlineAccounts||0)} sub="Heartbeat ≤ 35 วินาที" className={styles.good}/>
      <Kpi label="System Net P/L" value={netLabel} sub={netDetail} className={singleCurrency?tone(singleCurrency.netProfit):""}/>
      <Kpi label="Win Rate" value={percent(summary.winRate)} sub="ทั้งระบบ"/>
      <Kpi label="Profit Factor" value={profitFactorLabel} sub={singleCurrency?"ทั้งระบบ":"ไม่รวมข้ามสกุล"}/>
      <Kpi label="Total Trades" value={String(summary.trades||0)} sub="Basket ที่ปิด"/>
      <Kpi label="Profitable Accounts" value={`${summary.profitableAccounts||0} (${number(summary.profitableAccountRate,1)}%)`} sub="บัญชีที่ P/L เป็นบวก"/>
    </section>
    <div className={styles.systemGrid}>
      <section className={`${styles.card} ${styles.systemCurve}`}>
        <div className={styles.cardTitle}><div><b>System Cumulative P/L</b><small>{singleCurrency?"ผลรวมรายวันของ "+singleCurrency.currency:"หลายสกุลเงินจะแยกยอด ไม่รวมกราฟเป็นตัวเลขเดียว"}</small></div><strong>{netLabel}</strong></div>
        {singleCurrency ? <LineChart points={data?.curve||[]} valueKey="cumulative" secondaryKey="cumulative"/> : <div className={styles.emptyChart}>{netDetail}</div>}
      </section>
      <section className={`${styles.card} ${styles.systemAccounts}`}><div className={styles.cardTitle}><div><b>รายบุคคล / รายบัญชี</b><small>กดดูเพื่อ Drill-down รายละเอียดและสร้าง Share Snapshot</small></div></div><div className={styles.tableWrap}><table><thead><tr><th>ลูกค้า</th><th>MT5</th><th>Mode</th><th>Status</th><th>Trades</th><th>Win Rate</th><th>Net P/L</th><th></th></tr></thead><tbody>{(data?.accounts||[]).map((row:any)=><tr key={row.accountId}><td><b>{row.userCode}</b><small className={styles.tableSub}>{row.email}</small></td><td>{row.accountNumber}</td><td>{row.mode}</td><td><span className={row.online?styles.statusOnline:styles.statusOffline}>{row.online?"ONLINE":"OFFLINE"}</span></td><td>{row.trades}</td><td>{percent(row.winRate)}</td><td className={tone(row.netProfit)}>{money(row.netProfit,true,row.currency)}</td><td><button className={styles.drillButton} onClick={()=>onDrill(row.accountId,row.userId)}>ดูรายบัญชี</button></td></tr>)}</tbody></table></div></section>
    </div>
  </>;
}
