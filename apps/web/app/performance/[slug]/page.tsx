"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../lib/api";
import { ScenovaIcon } from "../../../components/ScenovaIcon";
import { ScenovaBrand } from "../../../components/ScenovaBrand";

function money(value:any,currency:any,signed=false){
  const n=Number(value||0);
  const code=String(currency||"UNKNOWN").trim().toUpperCase()||"UNKNOWN";
  const sign=signed&&n>0?"+":"";
  return sign+n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})+" "+code;
}

export default function PublicPerformancePage() {
  const params = useParams();
  const slug = String(params?.slug || "");
  const [data,setData] = useState<any|null>(null);
  const [error,setError] = useState("");

  useEffect(()=>{
    if(!slug) return;
    api("/performance/"+encodeURIComponent(slug))
      .then(setData)
      .catch((e:any)=>setError(String(e?.message||"ไม่พบรายงาน")));
  },[slug]);

  if(error){
    return <main className="performance-public-shell"><section className="performance-public-error"><b>ไม่พบพอร์ตตัวอย่าง</b><span>{error}</span></section></main>;
  }
  if(!data){
    return <main className="performance-public-shell"><section className="performance-public-error"><span className="dot green"/>กำลังโหลดผลการทดสอบ...</section></main>;
  }

  const summary=data.summary||{};
  const points=Array.isArray(data.equity_curve)?data.equity_curve:[];
  const currency=String(data.currency||"UNKNOWN").trim().toUpperCase()||"UNKNOWN";
  return (
    <main className="performance-public-shell">
      <header className="performance-public-head">
        <div className="performance-brand">
          <ScenovaBrand className="scenova-brand-logo-performance"/>
        </div>
        <span className={"performance-type "+(data.source==="SAMPLE"?"sample":"")}>{data.label}</span>
      </header>

      <section className="performance-public-hero">
        <div>
          <span className="eyebrow">READ-ONLY PERFORMANCE</span>
          <h1>{data.title}</h1>
          <p>{data.symbol+" · "+data.timeframe+" · Lot "+Number(data.lot||0).toFixed(2)+" · เงินเริ่มต้น "+money(data.initial_deposit,currency)}</p>
        </div>
        <div className="performance-public-badge">
          <ScenovaIcon name="shield" size={20}/>
          <div><b>ดูข้อมูลอย่างเดียว</b><small>หน้านี้ไม่มีสิทธิ์เชื่อม MT5 หรือส่งคำสั่งเทรด</small></div>
        </div>
      </section>

      <div className="performance-disclaimer">{data.disclaimer}</div>

      <section className="performance-public-kpis">
        <PublicKpi label="Net P/L" value={money(summary.netProfit,currency,true)} tone={Number(summary.netProfit||0)>=0?"good":"bad"}/>
        <PublicKpi label="Return" value={Number(summary.returnPercent||0).toFixed(2)+"%"} tone={Number(summary.returnPercent||0)>=0?"good":"bad"}/>
        <PublicKpi label="Win Rate" value={Number(summary.winRate||0).toFixed(1)+"%"}/>
        <PublicKpi label="Profit Factor" value={Number(summary.profitFactor||0).toFixed(2)}/>
        <PublicKpi label="Max Drawdown" value={Number(summary.maxDrawdownPercent||0).toFixed(2)+"%"} tone="warn"/>
        <PublicKpi label="Trades" value={String(summary.closedTrades||0)}/>
      </section>

      <section className="performance-public-card">
        <div className="performance-card-head"><div><b>Equity Curve</b><small>Balance หลังรายการที่ปิด</small></div><strong>{money(summary.finalBalance,currency)}</strong></div>
        <PublicEquityChart points={points}/>
      </section>

      <section className="performance-public-card">
        <div className="performance-card-head"><div><b>รายการล่าสุด</b><small>แสดงสูงสุด 20 รายการ</small></div></div>
        <div className="performance-trade-table">
          <div className="performance-trade-row header"><span>#</span><span>ฝั่ง</span><span>Lot</span><span>เปิด</span><span>ปิด</span><span>P/L</span><span>Balance</span></div>
          {(data.trades||[]).map((trade:any)=>(
            <div className="performance-trade-row" key={trade.trade_index}>
              <span>{trade.trade_index}</span>
              <span className={trade.direction==="BUY"?"text-good":"text-bad"}>{trade.direction}</span>
              <span>{Number(trade.volume||0).toFixed(2)}</span>
              <span>{Number(trade.open_price||0).toFixed(3)}</span>
              <span>{Number(trade.close_price||0).toFixed(3)}</span>
              <span className={Number(trade.profit||0)>=0?"text-good":"text-bad"}>{money(trade.profit,currency,true)}</span>
              <span>{money(trade.balance_after,currency)}</span>
            </div>
          ))}
        </div>
      </section>

      <footer className="performance-public-foot">
        <span>SCENOVA · Performance information only</span>
        <span>ผลย้อนหลังและผลจำลองไม่รับประกันผลลัพธ์ในอนาคต</span>
      </footer>
    </main>
  );
}

function PublicKpi(props:{label:string;value:string;tone?:string}){
  return <div className={"performance-public-kpi "+(props.tone||"")}><span>{props.label}</span><b>{props.value}</b></div>;
}

function PublicEquityChart({points}:{points:any[]}){
  if(!points.length) return <div className="backtest-chart-empty">ยังไม่มีข้อมูล Equity</div>;
  const values=points.map((point:any)=>Number(point.balance||0));
  const min=Math.min(...values);
  const max=Math.max(...values);
  const range=Math.max(1,max-min);
  const width=1000,height=260;
  const coords=values.map((value,index)=>{
    const x=values.length<=1?0:index/(values.length-1)*width;
    const y=height-((value-min)/range*(height-24)+12);
    return x.toFixed(1)+","+y.toFixed(1);
  }).join(" ");
  return <svg className="backtest-equity-svg public" viewBox={"0 0 "+width+" "+height} preserveAspectRatio="none"><polyline points={coords} fill="none" vectorEffect="non-scaling-stroke"/></svg>;
}
