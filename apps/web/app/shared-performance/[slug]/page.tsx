"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../lib/api";
import { ScenovaBrand } from "../../../components/ScenovaBrand";
import styles from "./shared-performance.module.css";

function money(value: any, signed = false, currency: any = "UNKNOWN") {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const code = String(currency || "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
  const sign = signed && n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${code}`;
}

function percent(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : "—";
}

function number(value: any, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

function EquityChart({ points }:{ points:any[] }) {
  if (!points?.length) return <div className={styles.empty}>ยังไม่มีข้อมูลกราฟในช่วงนี้</div>;
  const width = 1000;
  const height = 270;
  const values = points.map((point) => Number(point.balance || 0));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const coords = values.map((value, index) => {
    const x = values.length <= 1 ? 0 : index / (values.length - 1) * width;
    const y = height - 16 - ((value - min) / range) * (height - 32);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return <svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"><polyline points={coords} fill="none" vectorEffect="non-scaling-stroke"/></svg>;
}

function DrawdownChart({ points }:{ points:any[] }) {
  if (!points?.length) return <div className={styles.empty}>ยังไม่มีข้อมูล Drawdown ในช่วงนี้</div>;
  const width = 1000;
  const height = 230;
  const values = points.map((point) => -Math.abs(Number(point.drawdownPercent || 0)));
  const min = Math.min(...values, -1);
  const max = 0;
  const range = Math.max(1, max - min);
  const coords = values.map((value, index) => {
    const x = values.length <= 1 ? 0 : index / (values.length - 1) * width;
    const y = height - 16 - ((value - min) / range) * (height - 32);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return <svg className={`${styles.chart} ${styles.drawdown}`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"><polyline points={coords} fill="none" vectorEffect="non-scaling-stroke"/></svg>;
}

export default function SharedPerformancePage() {
  const params = useParams();
  const slug = String(params?.slug || "");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;
    api(`/shared-performance/${encodeURIComponent(slug)}`)
      .then(setData)
      .catch((e:any) => setError(String(e?.message || "ไม่พบรายงาน")));
  }, [slug]);

  const snapshot = data?.snapshot || {};
  const summary = snapshot?.summary || {};
  const account = snapshot?.account || {};
  const currency = String(account.currency || "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
  const curve = Array.isArray(snapshot?.curve) ? snapshot.curve : [];
  const trades = Array.isArray(snapshot?.closedTrades) ? snapshot.closedTrades : [];
  const rangeLabel = useMemo(() => {
    if (!snapshot?.range?.from || !snapshot?.range?.to) return "—";
    return `${new Date(snapshot.range.from).toLocaleDateString("th-TH")} – ${new Date(snapshot.range.to).toLocaleDateString("th-TH")}`;
  }, [snapshot?.range?.from, snapshot?.range?.to]);

  if (error) return <main className={styles.shell}><section className={styles.state}><b>ไม่พบรายงาน</b><span>{error}</span></section></main>;
  if (!data) return <main className={styles.shell}><section className={styles.state}>กำลังโหลดรายงาน...</section></main>;

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <ScenovaBrand className={styles.brand}/>
        <div className={styles.badges}><span className={styles.verified}>LIVE SNAPSHOT</span><span>READ ONLY</span></div>
      </header>

      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>SCENOVA TRADING PERFORMANCE</span>
          <h1>{data.title}</h1>
          <p>{account.userCode || "SCENOVA Trader"} · {account.accountNumber || "—"} · {account.broker || "—"} · {account.symbol || "—"} · {account.timeframe || "—"}</p>
        </div>
        <div className={styles.heroMeta}><span>ช่วงข้อมูล</span><b>{rangeLabel}</b><small>Snapshot เมื่อ {new Date(snapshot.frozenAt || data.created_at).toLocaleString("th-TH")}</small></div>
      </section>

      <section className={styles.kpis}>
        <Kpi label="Initial Balance" value={money(summary.initialDeposit,false,currency)} />
        <Kpi label="Net Profit" value={money(summary.netProfit,true,currency)} tone={Number(summary.netProfit || 0) >= 0 ? "good" : "bad"}/>
        <Kpi label="Profit Factor" value={number(summary.profitFactor)} />
        <Kpi label="Win Rate" value={percent(summary.winRate)} />
        <Kpi label="Max Drawdown" value={percent(summary.maxDrawdownPercent)} tone="bad"/>
        <Kpi label="Total Trades" value={String(summary.trades ?? 0)} />
        <Kpi label="Recovery Factor" value={number(summary.recoveryFactor)} />
        <Kpi label="Return" value={percent(summary.returnPercent)} tone={Number(summary.returnPercent || 0) >= 0 ? "good" : "bad"}/>
      </section>

      <div className={styles.grid}>
        <section className={`${styles.card} ${styles.equityCard}`}><div className={styles.cardHead}><div><b>Equity / Balance Curve</b><small>สร้างจากผล Basket ที่ปิดจริงในระบบ SCENOVA</small></div><strong>{money(summary.finalBalance,false,currency)}</strong></div><EquityChart points={curve}/></section>
        <section className={`${styles.card} ${styles.drawdownCard}`}><div className={styles.cardHead}><div><b>Drawdown</b><small>Closed-performance drawdown</small></div><strong className={styles.badText}>{percent(summary.maxDrawdownPercent)}</strong></div><DrawdownChart points={curve}/></section>
      </div>

      <section className={styles.card}>
        <div className={styles.cardHead}><div><b>สถิติผลการเทรด</b><small>ข้อมูลถูก freeze ตอนสร้างลิงก์ จึงไม่เปลี่ยนตามหลัง</small></div></div>
        <div className={styles.stats}>
          <Stat label="Gross Profit" value={money(summary.grossProfit,false,currency)}/><Stat label="Gross Loss" value={money(-Math.abs(Number(summary.grossLoss || 0)),false,currency)}/><Stat label="Wins" value={String(summary.wins ?? 0)}/><Stat label="Losses" value={String(summary.losses ?? 0)}/><Stat label="Breakeven" value={String(summary.breakeven ?? 0)}/><Stat label={"Max DD ("+currency+")"} value={money(summary.maxDrawdownMoney,false,currency)}/>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}><div><b>รายการเทรดล่าสุด</b><small>แสดงสูงสุด 100 รายการจาก Snapshot</small></div></div>
        <div className={styles.tableWrap}><table><thead><tr><th>#</th><th>Ticket</th><th>Symbol</th><th>Side</th><th>Lot</th><th>Entry</th><th>Exit</th><th>P/L</th><th>Closed</th></tr></thead><tbody>{trades.slice(0,100).map((row:any,index:number)=><tr key={`${row.ticket}-${index}`}><td>{index+1}</td><td>{row.ticket}</td><td>{row.symbol}</td><td>{row.side}</td><td>{number(row.lot)}</td><td>{number(row.entryPrice,3)}</td><td>{number(row.exitPrice,3)}</td><td className={Number(row.profit||0)>=0?styles.goodText:styles.badText}>{money(row.profit,true,currency)}</td><td>{row.closedAt?new Date(row.closedAt).toLocaleString("th-TH"):"—"}</td></tr>)}{!trades.length?<tr><td colSpan={9} className={styles.emptyCell}>ไม่มีรายการ EXIT ใน Snapshot นี้</td></tr>:null}</tbody></table></div>
      </section>

      <section className={styles.disclaimer}><b>คำเตือนความเสี่ยง</b><p>ข้อมูลหน้านี้เป็น Snapshot ของผลการเทรดในอดีตจากระบบ SCENOVA และไม่ใช่การรับประกันผลตอบแทนในอนาคต ค่า Drawdown แสดงจากผลกำไร/ขาดทุนที่ปิดแล้ว เว้นแต่ระบบจะมี Equity Snapshot แยกต่างหาก</p></section>
      <footer className={styles.footer}>SCENOVA · Trading Performance Snapshot · Read Only</footer>
    </main>
  );
}

function Kpi({label,value,tone}:{label:string;value:string;tone?:"good"|"bad"}) {
  return <div className={styles.kpi}><span>{label}</span><b className={tone==="good"?styles.goodText:tone==="bad"?styles.badText:""}>{value}</b></div>;
}

function Stat({label,value}:{label:string;value:string}) {
  return <div className={styles.stat}><span>{label}</span><b>{value}</b></div>;
}
