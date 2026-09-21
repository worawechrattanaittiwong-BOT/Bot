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

function LineChart({ points, valueKey = "balance", secondaryKey = "equity" }:{ points:any[]; valueKey?:string; secondaryKey?:string }) {
  const width = 900;
  const height = 260;
  if (!points?.length) return <div className={styles.emptyChart}>ยังไม่มีข้อมูลในช่วงเวลานี้</div>;
  const primary = points.map((point) => Number(point[valueKey] ?? point.cumulative ?? 0));
  const secondary = points.map((point) => Number(point[secondaryKey] ?? point[valueKey] ?? point.cumulative ?? 0));
  const values = [...primary, ...secondary].filter(Number.isFinite);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const coords = (series:number[]) => series.map((value, index) => {
    const x = series.length <= 1 ? 0 : index / (series.length - 1) * width;
    const y = height - 16 - ((value - min) / range) * (height - 32);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg className={styles.lineChart} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Performance chart">
      <polyline className={styles.lineSecondary} points={coords(secondary)} fill="none" vectorEffect="non-scaling-stroke" />
      <polyline className={styles.linePrimary} points={coords(primary)} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function DrawdownChart({ points }:{ points:any[] }) {
  const normalized = (points || []).map((point) => ({ ...point, dd: -Math.abs(Number(point.drawdownPercent || 0)) }));
  return <LineChart points={normalized} valueKey="dd" secondaryKey="dd"/>;
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
  const [from, setFrom] = useState(isoDate(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)));
  const [to, setTo] = useState(isoDate(today));
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
        <header className={styles.header}>
          <div className={styles.headerTitle}><span className={styles.headerIcon}><ScenovaIcon name="strategy" size={24}/></span><div><h1>Trading Performance & Backtest</h1><p>ใช้ข้อมูลจริงที่ SCENOVA เก็บจากแต่ละบัญชี MT5 พร้อม Drawdown, รายงานย้อนหลัง และลิงก์แชร์แบบ Read-only</p></div></div>
          <div className={styles.headerMeta}><span className={styles.onlineDot}/><div><b>{options?.user?.user_code || "SCENOVA"}</b><small>{elevated ? "Owner / Admin Analytics" : "ข้อมูลเฉพาะบัญชีของคุณ"}</small></div></div>
        </header>

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
                <div><b>แชร์ Performance ให้คนอื่นดู</b><small>ระบบจะสร้าง Snapshot จากข้อมูลจริงในช่วงวันที่เลือก ข้อมูลในลิงก์จะไม่เปลี่ยนตามหลัง</small></div>
                <div className={styles.shareButtons}>
                  <button onClick={createShareSnapshot} disabled={sharing || !Number(summary.trades || 0)}>{sharing ? "กำลังสร้าง..." : "สร้างลิงก์แชร์"}</button>
                  {shareResult?.path ? <><input className={styles.shareLink} readOnly value={`${typeof window !== "undefined" ? window.location.origin : ""}${shareResult.path}`}/><button onClick={copyShareLink}>คัดลอกลิงก์</button><a href={shareResult.path} target="_blank" rel="noreferrer">เปิดหน้าสาธารณะ</a></> : null}
                </div>
              </section>
            ) : null}

            {mode === "BACKTEST" ? (
              <section className={styles.backtestPicker}><div><b>เลือกรายงาน Backtest</b><small>Admin ดูของบัญชีที่เลือกได้ ลูกค้าดูเฉพาะของตัวเอง</small></div><select value={selectedBacktestId} onChange={(e)=>chooseBacktest(e.target.value)}><option value="">เลือกรายงาน</option>{(report?.backtests || []).map((run:any)=><option value={run.id} key={run.id}>{run.title} · {run.symbol} · {run.timeframe}</option>)}</select></section>
            ) : null}

            <section className={styles.kpis}>
              <Kpi label="Initial Balance" value={money(initialBalance,false,activeCurrency)} sub={mode === "LIVE" ? "คำนวณย้อนจาก Balance + Bot P/L" : "เงินเริ่มต้น Backtest"}/>
              <Kpi label="Net Profit" value={money(summary.netProfit,true,activeCurrency)} sub="กำไร/ขาดทุนสุทธิ" className={tone(summary.netProfit)}/>
              <Kpi label="Profit Factor" value={number(summary.profitFactor, 2)} sub="Gross Profit / Gross Loss"/>
              <Kpi label="Win Rate" value={percent(summary.winRate)} sub={`${summary.wins ?? 0} ชนะ · ${summary.losses ?? 0} แพ้`}/>
              <Kpi label="Max Drawdown" value={percent(summary.maxDrawdownPercent)} sub={`${money(summary.maxDrawdownMoney,false,activeCurrency)} · Closed Performance`} className={styles.bad}/>
              <Kpi label="Total Trades" value={String(summary.trades ?? 0)} sub="Basket ที่ปิดแล้ว"/>
              <Kpi label="Recovery Factor" value={number(summary.recoveryFactor, 2)} sub="Net Profit / Max DD"/>
              <Kpi label="Return %" value={percent(summary.returnPercent)} sub="ผลตอบแทนช่วงที่เลือก" className={tone(summary.returnPercent)}/>
            </section>

            <section className={styles.statsStrip}>
              <div><span>Gross Profit</span><b className={styles.good}>{money(summary.grossProfit,false,activeCurrency)}</b></div>
              <div><span>Gross Loss</span><b className={styles.bad}>{money(-Math.abs(Number(summary.grossLoss || 0)),false,activeCurrency)}</b></div>
              <div><span>Sharpe Ratio</span><b>{number(summary.sharpeRatio,2)}</b></div>
              <div><span>Buy Trades</span><b>{String(liveSummary.buyTrades ?? "—")}</b></div>
              <div><span>Sell Trades</span><b>{String(liveSummary.sellTrades ?? "—")}</b></div>
              <div><span>Balance ล่าสุด</span><b>{money(report?.balance?.current,false,activeCurrency)}</b></div>
              <div><span>Equity ล่าสุด</span><b>{money(report?.balance?.equity,false,activeCurrency)}</b></div>
            </section>

            <div className={styles.analyticsGrid}>
              <section className={`${styles.card} ${styles.equityCard}`}>
                <div className={styles.cardTitle}><div><b>{mode === "LIVE" ? "Equity & Balance Curve" : "Backtest Balance Curve"}</b><small>{mode === "LIVE" ? "Balance สร้างจาก Basket ที่ปิดจริง · Equity ล่าสุดจาก Heartbeat" : "ผลตามลำดับรายการใน Backtest"}</small></div><strong className={tone(summary.netProfit)}>{money(summary.netProfit,true,activeCurrency)}</strong></div>
                <LineChart points={curve}/>
              </section>
              <section className={`${styles.card} ${styles.drawdownCard}`}><div className={styles.cardTitle}><div><b>Drawdown</b><small>Closed-performance drawdown จาก Peak Balance</small></div><strong className={styles.bad}>{percent(summary.maxDrawdownPercent)}</strong></div><DrawdownChart points={curve}/></section>
              {mode === "LIVE" ? <QualityCard quality={report?.quality}/> : <section className={`${styles.card} ${styles.qualityCard}`}><div className={styles.cardTitle}><div><b>Backtest Summary</b><small>ค่าจากรายงานที่เลือก</small></div></div><div className={styles.backtestSummary}><span>Initial Balance <b>{money(backSummary.initialDeposit,false,activeCurrency)}</b></span><span>Final Balance <b>{money(backSummary.finalBalance,false,activeCurrency)}</b></span><span>Average Win <b>{money(backSummary.averageWin,false,activeCurrency)}</b></span><span>Average Loss <b>{money(backSummary.averageLoss,false,activeCurrency)}</b></span></div></section>}
              <section className={`${styles.card} ${styles.monthlyCard}`}><div className={styles.cardTitle}><div><b>ผลตอบแทนรายเดือน</b><small>Monthly Returns</small></div></div>{mode === "LIVE" ? <MonthlyBars rows={monthly} currency={activeCurrency}/> : <div className={styles.emptyChart}>Backtest รุ่นปัจจุบันยังไม่เก็บ Monthly Bucket แยก</div>}</section>
              <section className={`${styles.card} ${styles.distributionCard}`}><div className={styles.cardTitle}><div><b>การกระจายการเทรด</b><small>Buy vs Sell</small></div></div><TradeDistribution buy={Number(liveSummary.buyTrades || 0)} sell={Number(liveSummary.sellTrades || 0)} total={Number(summary.trades || 0)}/></section>
              <section className={`${styles.card} ${styles.strategyCard}`}><div className={styles.cardTitle}><div><b>ข้อมูลบัญชีและช่วงรายงาน</b><small>Report Context</small></div></div><StrategySummary report={report} mode={mode} backtest={activeBacktest} from={from} to={to}/></section>
            </div>

            <section className={`${styles.card} ${styles.tradesCard}`}>
              <div className={styles.cardTitle}><div><b>{mode === "LIVE" ? "รายการเทรดที่ปิดแล้ว" : "Backtest Trades"}</b><small>{mode === "LIVE" ? "Closed Trades จาก MT5 Trade Journal" : "รายการจาก Backtest ที่บันทึก"}</small></div><div className={styles.exportActions}>{mode === "LIVE" ? <button onClick={downloadCsv}>ดาวน์โหลด CSV</button> : null}<button onClick={()=>window.print()}>พิมพ์ / PDF</button></div></div>
              <TradesTable rows={mode === "LIVE" ? (report?.closedTrades || []) : (activeBacktest?.trades || [])} backtest={mode === "BACKTEST"} currency={activeCurrency}/>
            </section>
          </>
        )}
      </main>
    </div>
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
