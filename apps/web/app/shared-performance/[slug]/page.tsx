"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../lib/api";
import { ScenovaBrand } from "../../../components/ScenovaBrand";
import { ScenovaIcon } from "../../../components/ScenovaIcon";
import styles from "./shared-performance.module.css";

function dateInput(value:any) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"
  }).format(date);
}

function inclusiveDays(from:string,to:string) {
  const start = new Date(from + "T00:00:00+07:00").getTime();
  const end = new Date(to + "T00:00:00+07:00").getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end-start)/86400000)+1;
}

function rangeFromDays(endRaw:string,daysRaw:number) {
  const days = Math.max(1,Math.min(730,Math.trunc(daysRaw||1)));
  const end = new Date((endRaw || dateInput(new Date())) + "T12:00:00+07:00");
  const start = new Date(end.getTime()-(days-1)*86400000);
  return { from:dateInput(start), to:dateInput(end) };
}

function money(value: any, signed = false, currency: any = "UNKNOWN") {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const code = String(currency || "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
  const sign = signed && n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}${Math.abs(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} ${code}`;
}

function percent(value:any) {
  const n=Number(value);
  return Number.isFinite(n)?`${n.toFixed(2)}%`:"—";
}

function number(value:any,digits=2) {
  const n=Number(value);
  return Number.isFinite(n)?n.toFixed(digits):"—";
}

function axisLabel(value:any,singleDay:boolean) {
  const date=value?new Date(value):null;
  if(!date||!Number.isFinite(date.getTime())) return "";
  return singleDay
    ? date.toLocaleTimeString("th-TH",{timeZone:"Asia/Bangkok",hour:"2-digit",minute:"2-digit",hour12:false})
    : date.toLocaleDateString("th-TH",{timeZone:"Asia/Bangkok",day:"2-digit",month:"2-digit"});
}

function EquityChart({points,from,to}:{points:any[];from:string;to:string}) {
  if(!points?.length) return <div className={styles.empty}>ยังไม่มีข้อมูลกราฟในช่วงนี้</div>;
  const width=1000,height=286,left=32,right=12,top=12,bottom=38;
  const values=points.map((point)=>Number(point.balance||0));
  const min=Math.min(...values),max=Math.max(...values),pad=Math.max(1,(max-min)*.06);
  const low=min-pad,high=max+pad,range=Math.max(1,high-low);
  const plotWidth=width-left-right,plotHeight=height-top-bottom;
  const coords=values.map((value,index)=>{
    const x=left+(values.length<=1?0:index/(values.length-1)*plotWidth);
    const y=top+(high-value)/range*plotHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const ticks=Array.from({length:Math.min(7,Math.max(2,points.length))},(_,i)=>Math.round(i*(points.length-1)/Math.max(1,Math.min(7,Math.max(2,points.length))-1)))
    .filter((v,i,a)=>i===0||v!==a[i-1]);
  const singleDay=from===to;
  return <svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
    {ticks.map((index)=>{
      const x=left+(points.length<=1?0:index/(points.length-1)*plotWidth);
      return <g key={index}><line className={styles.tickLine} x1={x} x2={x} y1={top} y2={top+plotHeight}/><text className={styles.tickLabel} x={x} y={height-9} textAnchor="middle">{axisLabel(points[index]?.time,singleDay)}</text></g>;
    })}
    <polyline points={coords} fill="none" vectorEffect="non-scaling-stroke"/>
  </svg>;
}

function DrawdownChart({points,from,to}:{points:any[];from:string;to:string}) {
  if(!points?.length) return <div className={styles.empty}>ยังไม่มีข้อมูล Drawdown ในช่วงนี้</div>;
  const mapped=points.map((point)=>({...point,balance:-Math.abs(Number(point.drawdownPercent||0))}));
  return <EquityChart points={mapped} from={from} to={to}/>;
}

export default function SharedPerformancePage() {
  const params=useParams();
  const slug=String(params?.slug||"");
  const [data,setData]=useState<any>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [from,setFrom]=useState("");
  const [to,setTo]=useState("");
  const [customDays,setCustomDays]=useState("30");

  async function load(nextFrom?:string,nextTo?:string,initialize=false) {
    if(!slug) return;
    setLoading(true);
    try {
      const query=nextFrom&&nextTo?`?from=${encodeURIComponent(nextFrom)}&to=${encodeURIComponent(nextTo)}`:"";
      const next=await api(`/shared-performance/${encodeURIComponent(slug)}${query}`);
      setData(next);
      const range=next?.snapshot?.range||next?.defaultRange||{};
      if(initialize||!from||!to){
        setFrom(dateInput(range.from));
        setTo(dateInput(range.to));
      }
      setError("");
    } catch(e:any) {
      setError(String(e?.message||"ไม่พบรายงาน"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(()=>{ void load(undefined,undefined,true); },[slug]);

  function applyDays(days:number) {
    const range=rangeFromDays(to||dateInput(new Date()),days);
    setFrom(range.from);setTo(range.to);setCustomDays(String(days));
    void load(range.from,range.to);
  }

  const snapshot=data?.snapshot||{};
  const summary=snapshot?.summary||{};
  const account=snapshot?.account||{};
  const currency=String(account.currency||"UNKNOWN").trim().toUpperCase()||"UNKNOWN";
  const curve=Array.isArray(snapshot?.curve)?snapshot.curve:[];
  const trades=Array.isArray(snapshot?.closedTrades)?snapshot.closedTrades:[];
  const rangeLabel=useMemo(()=>{
    if(!from||!to) return "—";
    return `${new Date(from+"T12:00:00+07:00").toLocaleDateString("th-TH")} – ${new Date(to+"T12:00:00+07:00").toLocaleDateString("th-TH")}`;
  },[from,to]);

  if(error) return <main className={styles.shell}><section className={styles.state}><b>ไม่พบรายงาน</b><span>{error}</span></section></main>;
  if(!data) return <main className={styles.shell}><section className={styles.state}>กำลังโหลดรายงาน...</section></main>;

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <ScenovaBrand className={styles.brand}/>
        <div className={styles.badges}><span className={styles.verified}>LIVE READ ONLY</span><span>DATE SELECTABLE</span></div>
      </header>

      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>SCENOVA TRADING PERFORMANCE</span>
          <h1>{data.title}</h1>
          <p>{account.userCode||"SCENOVA Trader"} · {account.accountNumber||"—"} · {account.broker||"—"} · {account.symbol||"—"} · {account.timeframe||"—"}</p>
        </div>
        <div className={styles.heroMeta}><span>ช่วงข้อมูล</span><b>{rangeLabel}</b><small>{data.dynamic?"ผู้ชมเลือกช่วงเวลาได้ · Read only":"Snapshot แบบเดิม"}</small></div>
      </section>

      <section className={styles.rangeBar}>
        <div className={styles.rangeDates}>
          <label><span>ตั้งแต่วันที่</span><input type="date" value={from} onChange={(e)=>setFrom(e.target.value)}/></label>
          <label><span>ถึงวันที่</span><input type="date" value={to} onChange={(e)=>setTo(e.target.value)}/></label>
          <button type="button" onClick={()=>load(from,to)} disabled={loading||!from||!to}><ScenovaIcon name="refresh" size={15}/>{loading?"กำลังโหลด...":"ดูช่วงนี้"}</button>
        </div>
        <div className={styles.presets}>
          <button onClick={()=>applyDays(1)}>วันนี้</button>
          <button onClick={()=>applyDays(7)}>7 วัน</button>
          <button onClick={()=>applyDays(30)}>30 วัน</button>
          <button onClick={()=>applyDays(90)}>90 วัน</button>
          <div className={styles.customDays}><input type="number" min="1" max="730" value={customDays} onChange={(e)=>setCustomDays(e.target.value.replace(/\D/g,"").slice(0,3))}/><span>วัน</span><button onClick={()=>applyDays(Number(customDays||1))}>ใช้</button></div>
          <strong>{inclusiveDays(from,to)} วัน</strong>
        </div>
      </section>

      <section className={styles.kpis}>
        <Kpi label="Initial Balance" value={money(summary.initialDeposit,false,currency)}/>
        <Kpi label="Net Profit" value={money(summary.netProfit,true,currency)} tone={Number(summary.netProfit||0)>=0?"good":"bad"}/>
        <Kpi label="Profit Factor" value={number(summary.profitFactor)}/>
        <Kpi label="Win Rate" value={percent(summary.winRate)}/>
        <Kpi label="Max Drawdown" value={percent(summary.maxDrawdownPercent)} tone="bad"/>
        <Kpi label="Total Trades" value={String(summary.trades??0)}/>
        <Kpi label="Recovery Factor" value={number(summary.recoveryFactor)}/>
        <Kpi label="Return" value={percent(summary.returnPercent)} tone={Number(summary.returnPercent||0)>=0?"good":"bad"}/>
      </section>

      <div className={styles.grid}>
        <section className={`${styles.card} ${styles.equityCard}`}><div className={styles.cardHead}><div><b>Equity / Balance Curve</b><small>{from===to?"แกนล่างแสดงเวลา":"แกนล่างแสดงวันที่"} · EXIT ที่บอทปิดจริง</small></div><strong>{money(summary.finalBalance,false,currency)}</strong></div><EquityChart points={curve} from={from} to={to}/></section>
        <section className={`${styles.card} ${styles.drawdownCard}`}><div className={styles.cardHead}><div><b>Drawdown</b><small>Closed-performance drawdown</small></div><strong className={styles.badText}>{percent(summary.maxDrawdownPercent)}</strong></div><DrawdownChart points={curve} from={from} to={to}/></section>
      </div>

      <section className={styles.card}>
        <div className={styles.cardHead}><div><b>สถิติผลการเทรด</b><small>ข้อมูลจะคำนวณใหม่ตามวันที่ที่ผู้ชมเลือก โดยเป็น Read-only เท่านั้น</small></div></div>
        <div className={styles.stats}>
          <Stat label="Gross Profit" value={money(summary.grossProfit,false,currency)}/><Stat label="Gross Loss" value={money(-Math.abs(Number(summary.grossLoss||0)),false,currency)}/><Stat label="Wins" value={String(summary.wins??0)}/><Stat label="Losses" value={String(summary.losses??0)}/><Stat label="Breakeven" value={String(summary.breakeven??0)}/><Stat label={"Max DD ("+currency+")"} value={money(summary.maxDrawdownMoney,false,currency)}/>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}><div><b>รายการเทรดล่าสุด</b><small>แสดงสูงสุด 100 รายการในช่วงวันที่ที่เลือก</small></div></div>
        <div className={styles.tableWrap}><table><thead><tr><th>#</th><th>Ticket</th><th>Symbol</th><th>Side</th><th>Lot</th><th>Entry</th><th>Exit</th><th>P/L</th><th>Closed</th></tr></thead><tbody>{trades.slice(0,100).map((row:any,index:number)=><tr key={`${row.ticket}-${index}`}><td>{index+1}</td><td>{row.ticket}</td><td>{row.symbol}</td><td>{row.side}</td><td>{number(row.lot)}</td><td>{number(row.entryPrice,3)}</td><td>{number(row.exitPrice,3)}</td><td className={Number(row.profit||0)>=0?styles.goodText:styles.badText}>{money(row.profit,true,currency)}</td><td>{row.closedAt?new Date(row.closedAt).toLocaleString("th-TH",{timeZone:"Asia/Bangkok"}):"—"}</td></tr>)}{!trades.length?<tr><td colSpan={9} className={styles.emptyCell}>ไม่มีรายการ EXIT ในช่วงวันที่ที่เลือก</td></tr>:null}</tbody></table></div>
      </section>

      <section className={styles.disclaimer}><b>คำเตือนความเสี่ยง</b><p>หน้านี้เป็นลิงก์สาธารณะแบบ Read-only ผู้ชมสามารถเลือกช่วงวันที่เพื่อดูผลย้อนหลังได้ แต่ไม่มีสิทธิ์เชื่อม MT5 เปลี่ยนการตั้งค่า หรือส่งคำสั่งเทรด ผลย้อนหลังไม่รับประกันผลลัพธ์ในอนาคต</p></section>
      <footer className={styles.footer}>SCENOVA · Trading Performance · Public Read Only</footer>
    </main>
  );
}

function Kpi({label,value,tone}:{label:string;value:string;tone?:"good"|"bad"}) {
  return <div className={styles.kpi}><span>{label}</span><b className={tone==="good"?styles.goodText:tone==="bad"?styles.badText:""}>{value}</b></div>;
}
function Stat({label,value}:{label:string;value:string}) {
  return <div className={styles.stat}><span>{label}</span><b>{value}</b></div>;
}
