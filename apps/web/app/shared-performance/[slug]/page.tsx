"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../lib/api";
import { ScenovaIcon } from "../../../components/ScenovaIcon";
import styles from "../../performance/performance.module.css";

type StrategyMode = "AUTO" | "RACE" | "FLIP_LOCK" | "MANUAL" | "ZERO_GRID";
const STRATEGY_OPTIONS:StrategyMode[]=["AUTO","RACE","FLIP_LOCK","MANUAL","ZERO_GRID"];

function dateInput(value:any) {
  const date=value?new Date(value):null;
  if(!date||!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA",{
    timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"
  }).format(date);
}

function inclusiveDays(from:string,to:string) {
  const start=new Date(from+"T00:00:00+07:00").getTime();
  const end=new Date(to+"T00:00:00+07:00").getTime();
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<start) return 0;
  return Math.floor((end-start)/86400000)+1;
}

function rangeFromDays(endRaw:string,daysRaw:number) {
  const days=Math.max(1,Math.min(730,Math.trunc(daysRaw||1)));
  const end=new Date((endRaw||dateInput(new Date()))+"T12:00:00+07:00");
  const start=new Date(end.getTime()-(days-1)*86400000);
  return {from:dateInput(start),to:dateInput(end)};
}

function money(value:any,currency:string,signed=false) {
  const n=Number(value||0);
  const sign=signed&&n>0?"+":"";
  return sign+n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})+" "+currency;
}

function percent(value:any,signed=false) {
  const n=Number(value||0);
  const sign=signed&&n>0?"+":"";
  return sign+n.toFixed(2)+"%";
}

function fixed(value:any,digits=2) {
  const n=Number(value);
  return Number.isFinite(n)?n.toFixed(digits):"—";
}

function runtimeLabel(value:any) {
  let seconds=Math.max(0,Math.floor(Number(value||0)));
  const days=Math.floor(seconds/86400);
  seconds%=86400;
  const hours=Math.floor(seconds/3600);
  seconds%=3600;
  const minutes=Math.floor(seconds/60);
  const parts:string[]=[];
  if(days) parts.push(days+" วัน");
  if(hours) parts.push(hours+" ชม.");
  if(minutes||parts.length===0) parts.push(minutes+" นาที");
  return parts.join(" ");
}

function durationLabel(value:any) {
  let seconds=Math.max(0,Math.floor(Number(value||0)));
  if(seconds<60) return seconds+" วินาที";
  const hours=Math.floor(seconds/3600);
  const minutes=Math.floor((seconds%3600)/60);
  if(hours>0) return hours+" ชม. "+minutes+" นาที";
  return minutes+" นาที";
}

function growthRatio(value:any) {
  const n=Number(value);
  if(!Number.isFinite(n)||n<=0) return "—";
  return n.toFixed(4)+" ("+((n-1)*100).toFixed(2)+"%)";
}

function strategyLabel(value:StrategyMode|string) {
  const labels:Record<string,string>={
    AUTO:"AUTO",
    RACE:"RACE",
    FLIP_LOCK:"FLIP LOCK",
    MANUAL:"MANUAL",
    ZERO_GRID:"GRID"
  };
  return labels[String(value||"AUTO").toUpperCase()]||String(value||"AUTO");
}

function strategyPortfolioLabel(values:Array<StrategyMode|string>) {
  const normalized=(values||[]).map((value)=>String(value).toUpperCase());
  if(normalized.length===5) return "All Strategies · 5 Selected";
  if(normalized.length===1) return strategyLabel(normalized[0])+" · Single Strategy";
  return normalized.length+" Strategies · "+normalized.map(strategyLabel).join(" + ");
}

function InfoRow({icon,label,value}:{icon:string;label:string;value:string}) {
  return <div className={styles.infoRow}><span className={styles.infoIcon}><ScenovaIcon name={icon} size={15}/></span><span>{label}</span><b>{value}</b></div>;
}

function Metric({icon,label,value,tone=""}:{icon:string;label:string;value:string;tone?:"good"|"bad"|""}) {
  return <div className={styles.metric}><div className={styles.metricHead}><ScenovaIcon name={icon} size={14}/><span>{label}</span></div><b className={tone?styles[tone]:""}>{value}</b></div>;
}

function PanelTitle({icon,children}:{icon:string;children:string}) {
  return <h3 className={styles.panelTitle}><ScenovaIcon name={icon} size={14}/><span>{children}</span></h3>;
}

function StatRow({label,value,tone=""}:{label:string;value:string;tone?:"good"|"bad"|""}) {
  return <div className={styles.statRow}><span>{label}</span><b className={tone?styles[tone]:""}>{value}</b></div>;
}

function LotDistributionChart({rows,total}:{rows:any[];total:number}) {
  const items=[...(rows||[])].sort((a,b)=>Number(b.count||0)-Number(a.count||0)||Number(a.lot||0)-Number(b.lot||0));
  if(!items.length) return <div className={styles.emptyLotChart}>ยังไม่มีข้อมูล Lot ในช่วงเวลานี้</div>;
  return (
    <div className={styles.lotChart} role="img" aria-label="Lot allocation by closed positions">
      {items.map((row:any)=>{
        const pct=Math.max(0,Math.min(100,Number(row.percent||0)));
        return (
          <div className={styles.lotRow} key={String(row.lot)}>
            <div className={styles.lotRowHead}>
              <b>{fixed(row.lot,3)} Lot</b>
              <span>{Number(row.count||0)} ไม้ · {percent(pct)}</span>
            </div>
            <div className={styles.lotTrack}><i style={{width:Math.max(2,pct)+"%"}}/></div>
          </div>
        );
      })}
      <div className={styles.lotTotal}>รวม {total.toLocaleString("en-US")} Position</div>
    </div>
  );
}

function SummaryChart({points}:{points:any[]}) {
  if(!points?.length) return <div className={styles.emptyChart}>ยังไม่มีข้อมูลกราฟในช่วงเวลานี้</div>;
  const width=1500,height=148,left=40,right=12,top=10,bottom=31;
  const values=points.map((point)=>Number(point.balance??0));
  const min=Math.min(...values),max=Math.max(...values),pad=Math.max(1,(max-min)*.09);
  const low=min-pad,high=max+pad,range=Math.max(1,high-low);
  const plotWidth=width-left-right,plotHeight=height-top-bottom;
  const coords=values.map((value,index)=>{
    const x=left+(values.length<=1?0:index/(values.length-1)*plotWidth);
    const y=top+(high-value)/range*plotHeight;
    return {x,y};
  });
  const line=coords.map((p,i)=>(i?"L ":"M ")+p.x.toFixed(1)+" "+p.y.toFixed(1)).join(" ");
  const area=line+" L "+coords[coords.length-1].x.toFixed(1)+" "+(top+plotHeight)+" L "+coords[0].x.toFixed(1)+" "+(top+plotHeight)+" Z";
  const tickCount=Math.min(7,Math.max(2,points.length));
  const ticks=Array.from({length:tickCount},(_,i)=>Math.round(i*(points.length-1)/Math.max(1,tickCount-1)))
    .filter((value,index,array)=>index===0||value!==array[index-1]);
  const last=coords[coords.length-1];
  return (
    <svg className={styles.chart} viewBox={"0 0 "+width+" "+height} role="img" aria-label="Balance curve">
      <defs>
        <linearGradient id="share-perf-line" x1="0" x2="1"><stop offset="0%" stopColor="#61d9ff"/><stop offset="48%" stopColor="#8c78ff"/><stop offset="100%" stopColor="#bd69ff"/></linearGradient>
        <linearGradient id="share-perf-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#8068ff" stopOpacity=".48"/><stop offset="100%" stopColor="#8068ff" stopOpacity=".02"/></linearGradient>
      </defs>
      {Array.from({length:5},(_,i)=>{
        const ratio=i/4;
        const y=top+ratio*plotHeight;
        const value=high-ratio*range;
        return <g key={"h"+i}><line x1={left} x2={width-right} y1={y} y2={y} className={styles.gridLine}/><text x="3" y={y+3} className={styles.chartLabel}>{value.toFixed(0)}</text></g>;
      })}
      {ticks.map((index)=>{
        const x=left+(points.length<=1?0:index/(points.length-1)*plotWidth);
        return <g key={"v"+index}><line x1={x} x2={x} y1={top} y2={top+plotHeight} className={styles.gridLine}/><text x={x} y={height-16} textAnchor="middle" className={styles.chartLabel}>{String(Number(points[index]?.tradeNumber??index))}</text></g>;
      })}
      <path d={area} fill="url(#share-perf-area)"/>
      <path d={line} fill="none" stroke="url(#share-perf-line)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={last.x} cy={last.y} r="4" fill="#b36cff" stroke="#f0dcff" strokeWidth="2"/>
      <text x={width/2} y={height-2} textAnchor="middle" className={styles.chartLabel}>จำนวนไม้</text>
    </svg>
  );
}

function deriveTradeAnalytics(trades:any[],baseSummary:any,startBalance:number) {
  const ordered=[...(trades||[])].sort((a,b)=>new Date(a.closedAt||0).getTime()-new Date(b.closedAt||0).getTime());
  const profits=ordered.map((row:any)=>Number(row.profit||0));
  const positive=profits.filter((value)=>value>0);
  const negative=profits.filter((value)=>value<0);
  const volumes=ordered.map((row:any)=>Number(row.lot||0)).filter((value)=>Number.isFinite(value)&&value>0);
  const durations=ordered.map((row:any)=>{
    const opened=new Date(row.openedAt||0).getTime();
    const closed=new Date(row.closedAt||0).getTime();
    return Number.isFinite(opened)&&Number.isFinite(closed)&&closed>=opened?Math.floor((closed-opened)/1000):0;
  }).filter((value)=>Number.isFinite(value)&&value>=0);
  const longs=ordered.filter((row:any)=>String(row.side||"").toUpperCase()==="BUY");
  const shorts=ordered.filter((row:any)=>String(row.side||"").toUpperCase()==="SELL");
  const byDay=new Map<string,number>();
  for(const row of ordered){
    const key=row.closedAt?dateInput(row.closedAt):"";
    if(key) byDay.set(key,(byDay.get(key)||0)+Number(row.profit||0));
  }
  const dailyProfits=Array.from(byDay.values());
  let maxWinStreak=0,maxLossStreak=0,currentWin=0,currentLoss=0;
  let maxWinProfit=0,maxLossProfit=0,currentWinProfit=0,currentLossProfit=0;
  let winRuns=0,lossRuns=0,totalWins=0,totalLosses=0;
  for(const profit of profits){
    if(profit>0){
      if(currentWin===0) winRuns++;
      currentWin++;totalWins++;currentWinProfit+=profit;
      currentLoss=0;currentLossProfit=0;
      if(currentWin>maxWinStreak){maxWinStreak=currentWin;maxWinProfit=currentWinProfit;}
      else if(currentWin===maxWinStreak) maxWinProfit=Math.max(maxWinProfit,currentWinProfit);
    }else if(profit<0){
      if(currentLoss===0) lossRuns++;
      currentLoss++;totalLosses++;currentLossProfit+=profit;
      currentWin=0;currentWinProfit=0;
      if(currentLoss>maxLossStreak){maxLossStreak=currentLoss;maxLossProfit=currentLossProfit;}
      else if(currentLoss===maxLossStreak) maxLossProfit=Math.min(maxLossProfit,currentLossProfit);
    }else{
      currentWin=0;currentLoss=0;currentWinProfit=0;currentLossProfit=0;
    }
  }
  let ahpr:null|number=null,ghpr:null|number=null;
  if(startBalance>0&&profits.length){
    let rolling=startBalance;
    const factors:number[]=[];
    for(const profit of profits){
      if(rolling>0){
        const factor=(rolling+profit)/rolling;
        if(Number.isFinite(factor)&&factor>0) factors.push(factor);
      }
      rolling+=profit;
    }
    if(factors.length){
      ahpr=factors.reduce((sum,value)=>sum+value,0)/factors.length;
      ghpr=Math.exp(factors.reduce((sum,value)=>sum+Math.log(value),0)/factors.length);
    }
  }
  let sharpeRatio:null|number=null;
  if(startBalance>0&&dailyProfits.length>=2){
    const returns=dailyProfits.map((profit)=>profit/startBalance);
    const mean=returns.reduce((sum,value)=>sum+value,0)/returns.length;
    const variance=returns.reduce((sum,value)=>sum+Math.pow(value-mean,2),0)/Math.max(1,returns.length-1);
    const sd=Math.sqrt(variance);
    sharpeRatio=sd>0?mean/sd*Math.sqrt(252):null;
  }
  return {
    totalPositions:ordered.length,
    profitPositions:positive.length,
    lossPositions:negative.length,
    breakevenPositions:Math.max(0,ordered.length-positive.length-negative.length),
    positionWinRate:ordered.length?positive.length/ordered.length*100:0,
    largestProfitTrade:positive.length?Math.max(...positive):0,
    largestLossTrade:negative.length?Math.min(...negative):0,
    averageProfitTrade:positive.length?positive.reduce((a,b)=>a+b,0)/positive.length:0,
    averageLossTrade:negative.length?negative.reduce((a,b)=>a+b,0)/negative.length:0,
    averageLot:volumes.length?volumes.reduce((a,b)=>a+b,0)/volumes.length:0,
    maxLot:volumes.length?Math.max(...volumes):0,
    averageTradeDurationSeconds:durations.length?durations.reduce((a,b)=>a+b,0)/durations.length:0,
    maxTradeDurationSeconds:durations.length?Math.max(...durations):0,
    minTradeDurationSeconds:durations.length?Math.min(...durations):0,
    tradingDays:dailyProfits.length,
    profitableDays:dailyProfits.filter((value)=>value>0).length,
    losingDays:dailyProfits.filter((value)=>value<0).length,
    bestDayProfit:dailyProfits.length?Math.max(...dailyProfits):0,
    worstDayProfit:dailyProfits.length?Math.min(...dailyProfits):0,
    averageDailyProfit:dailyProfits.length?dailyProfits.reduce((a,b)=>a+b,0)/dailyProfits.length:0,
    buyTrades:longs.length,
    sellTrades:shorts.length,
    buyWinRate:longs.length?longs.filter((row:any)=>Number(row.profit||0)>0).length/longs.length*100:0,
    sellWinRate:shorts.length?shorts.filter((row:any)=>Number(row.profit||0)>0).length/shorts.length*100:0,
    maxWinStreak,
    maxLossStreak,
    maxWinStreakProfit:maxWinProfit,
    maxLossStreakLoss:maxLossProfit,
    averageWinStreak:winRuns?totalWins/winRuns:0,
    averageLossStreak:lossRuns?totalLosses/lossRuns:0,
    expectedPayoff:ordered.length?Number(baseSummary?.netProfit||0)/ordered.length:0,
    sharpeRatio,
    ahpr,
    ghpr
  };
}

function deriveLotDistribution(trades:any[]) {
  const volumes=(trades||[]).map((row:any)=>Number(row.lot||0)).filter((value:number)=>Number.isFinite(value)&&value>0);
  const map=new Map<number,number>();
  for(const volume of volumes){
    const lot=Number(volume.toFixed(4));
    map.set(lot,(map.get(lot)||0)+1);
  }
  return Array.from(map.entries()).map(([lot,count])=>({
    lot,count,percent:volumes.length?count/volumes.length*100:0
  })).sort((a,b)=>a.lot-b.lot);
}

export default function SharedPerformancePage() {
  const params=useParams();
  const slug=String(params?.slug||"");
  const [data,setData]=useState<any>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [from,setFrom]=useState("");
  const [to,setTo]=useState("");
  const [controlsOpen,setControlsOpen]=useState(false);

  async function load(nextFrom?:string,nextTo?:string,initialize=false) {
    if(!slug) return;
    setLoading(true);
    try{
      const query=nextFrom&&nextTo?"?from="+encodeURIComponent(nextFrom)+"&to="+encodeURIComponent(nextTo):"";
      const next=await api("/shared-performance/"+encodeURIComponent(slug)+query);
      setData(next);
      const range=next?.snapshot?.range||next?.defaultRange||{};
      if(initialize||!from||!to){
        setFrom(dateInput(range.from));
        setTo(dateInput(range.to));
      }
      setError("");
    }catch(e:any){
      setError(String(e?.message||"ไม่พบรายงาน"));
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{void load(undefined,undefined,true);},[slug]);

  function applyDays(days:number){
    const range=rangeFromDays(to||dateInput(new Date()),days);
    setFrom(range.from);setTo(range.to);
    void load(range.from,range.to);
  }

  const snapshot=data?.snapshot||{};
  const account=snapshot?.account||{};
  const baseSummary=snapshot?.summary||{};
  const trades=Array.isArray(snapshot?.closedTrades)?snapshot.closedTrades:[];
  const currency=String(account.currency||"USD").trim().toUpperCase()||"USD";
  const startCapital=Number(snapshot?.balance?.derivedStart??baseSummary.initialDeposit??0);
  const supplemental=deriveTradeAnalytics(trades,baseSummary,startCapital);
  const summary={...supplemental,...baseSummary};
  const curve=Array.isArray(snapshot?.curve)?snapshot.curve:[];
  const totalPositions=Number((summary.totalPositions??trades.length) || 0);
  const totalDeals=Number((summary.totalDeals??trades.length) || 0);
  const lotDistribution=Array.isArray(snapshot?.lotDistribution)&&snapshot.lotDistribution.length
    ? snapshot.lotDistribution
    : deriveLotDistribution(trades);
  const primaryLotRow=[...lotDistribution].sort((a:any,b:any)=>Number(b.count||0)-Number(a.count||0)||Number(a.lot||0)-Number(b.lot||0))[0]||{lot:0,count:0,percent:0};
  const primaryLot=Number(summary.primaryLot??primaryLotRow.lot??0);
  const primaryLotCount=Number(summary.primaryLotCount??primaryLotRow.count??0);
  const primaryLotPercent=Number(summary.primaryLotPercent??primaryLotRow.percent??0);
  const selectedStrategyModes:StrategyMode[]=Array.isArray(snapshot?.filter?.strategyModes)&&snapshot.filter.strategyModes.length
    ? snapshot.filter.strategyModes
    : [...STRATEGY_OPTIONS];
  const strategyScopeLabel=strategyPortfolioLabel(selectedStrategyModes);
  const accountType=String(account.accountType||"REAL").toUpperCase()==="DEMO"?"DEMO":"REAL";
  const runtimeMode=String(account.mode||"LIVE").toUpperCase();
  const displayFrom=from||dateInput(snapshot?.range?.from);
  const displayTo=to||dateInput(snapshot?.range?.to);
  const rangeDays=inclusiveDays(displayFrom,displayTo);
  const endBalance=Number(snapshot?.balance?.rangeEnd??baseSummary.finalBalance??(startCapital+Number(summary.netProfit||0)));
  const modeBreakdown=Array.isArray(snapshot?.modeBreakdown)?snapshot.modeBreakdown:[];
  const symbol=String(account.symbol||"—");

  if(error){
    return <div className={styles.shell}><main className={styles.main+" "+styles.mainOwner}><section className={styles.summaryShell}><div className={styles.emptyState}><b>ไม่พบรายงาน</b><br/>{error}</div></section></main></div>;
  }

  if(!data){
    return <div className={styles.shell}><main className={styles.main+" "+styles.mainOwner}><section className={styles.summaryShell}><div className={styles.emptyState}>กำลังโหลดรายงาน...</div></section></main></div>;
  }

  return (
    <div className={styles.shell}>
      <main className={styles.main+" "+styles.mainOwner}>
        <section className={styles.summaryShell}>
          <button
            type="button"
            className={styles.optionsButton+" "+(controlsOpen?styles.optionsButtonOpen:"")}
            onClick={()=>setControlsOpen((value)=>!value)}
            aria-expanded={controlsOpen}
          >
            <ScenovaIcon name="control" size={15}/>
            <span>ตัวเลือก</span>
            <span className={styles.optionsChevron}>▾</span>
          </button>

          <div className={styles.optionsDrawer+" "+(controlsOpen?styles.optionsDrawerOpen:"")}>
            <div className={styles.drawerTop}>
              <div className={styles.toolbarIdentity}>
                <span className={accountType==="DEMO"?styles.demoBadge:styles.realBadge}>{accountType}</span>
                <div className={styles.ownerBadge}><ScenovaIcon name="share" size={15}/><div><b>PUBLIC PERFORMANCE</b><span>Read-only shared report</span></div></div>
              </div>
            </div>

            <div className={styles.drawerControls}>
              <label><span>Trading Account</span><input value={String(account.accountNumber||"—")} readOnly/></label>
              <label><span>Report Source</span><input value="Live Performance" readOnly/></label>
              <label><span>Start Date</span><input type="date" value={from} onChange={(e)=>setFrom(e.target.value)}/></label>
              <label><span>End Date</span><input type="date" value={to} onChange={(e)=>setTo(e.target.value)}/></label>
              <button className={styles.refreshButton} onClick={()=>load(from,to)} disabled={loading||!from||!to}><ScenovaIcon name="refresh" size={15}/>{loading?"กำลังโหลด...":"Refresh Report"}</button>
            </div>

            <div className={styles.strategyPortfolio}>
              <div className={styles.strategyPortfolioHead}>
                <div><ScenovaIcon name="strategy" size={16}/><span><b>Strategy Portfolio</b><small>พอร์ตกลยุทธ์ที่เจ้าของรายงานเลือกไว้สำหรับลิงก์นี้</small></span></div>
                <strong>{strategyScopeLabel}</strong>
              </div>
              <div className={styles.strategyChips}>
                {STRATEGY_OPTIONS.map((strategy)=>(
                  <button
                    type="button"
                    key={strategy}
                    className={selectedStrategyModes.includes(strategy)?styles.strategyChipActive:styles.strategyChip}
                    disabled
                  >
                    <span>{strategyLabel(strategy)}</span>
                    <small>{selectedStrategyModes.includes(strategy)?"Included":"Excluded"}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.drawerFooter}>
              <div className={styles.presets}>
                <button onClick={()=>applyDays(1)}>วันนี้</button>
                <button onClick={()=>applyDays(7)}>7 วัน</button>
                <button onClick={()=>applyDays(30)}>30 วัน</button>
                <button onClick={()=>applyDays(90)}>90 วัน</button>
              </div>
              <strong>{rangeDays} วัน · {displayFrom} → {displayTo} · {strategyScopeLabel}</strong>
            </div>
          </div>

          <header className={styles.summaryTitle}>
            <div className={styles.titleMark}><ScenovaIcon name="pnl" size={24}/><h2>BOT PERFORMANCE SUMMARY</h2><ScenovaIcon name="pnl" size={24}/></div>
            <p>Live portfolio performance · {strategyScopeLabel}</p>
          </header>

          <div className={styles.infoCard}>
            <div className={styles.infoCol}>
              <InfoRow icon="account" label="Account" value={String(account.accountNumber||"—")}/>
              <InfoRow icon="shield" label="Account Type" value={accountType}/>
              <InfoRow icon="wallet" label="Currency" value={currency}/>
            </div>
            <div className={styles.infoCol}>
              <InfoRow icon="layers" label="Runtime Mode" value={runtimeMode}/>
              <InfoRow icon="strategy" label="Symbol" value={symbol}/>
              <InfoRow icon="control" label="Strategy Portfolio" value={strategyScopeLabel}/>
            </div>
            <div className={styles.infoCol}>
              <InfoRow icon="clock" label="From" value={displayFrom}/>
              <InfoRow icon="stop" label="To" value={displayTo}/>
              <InfoRow icon="hourglass" label="Period" value={rangeDays+" วัน"}/>
            </div>
            <div className={styles.infoCol}>
              <InfoRow icon="play" label="Data Mode" value="LIVE"/>
              <InfoRow icon="orders" label="Closed Baskets" value={String(Number(summary.trades||0))}/>
              <InfoRow icon="orders" label="Closed Positions" value={String(totalPositions)}/>
            </div>
          </div>

          <div className={styles.metricsCard}>
            <Metric icon="wallet" label="Start Capital" value={money(startCapital,currency)}/>
            <Metric icon="equity" label="End Balance" value={money(endBalance,currency)}/>
            <Metric icon="profit" label="Net Profit" value={money(summary.netProfit,currency,true)} tone={Number(summary.netProfit)>=0?"good":"bad"}/>
            <Metric icon="trend" label="Return" value={percent(summary.returnPercent,true)} tone={Number(summary.returnPercent)>=0?"good":"bad"}/>
            <Metric icon="risk" label="Max Drawdown" value={percent(summary.maxDrawdownPercent)}/>
            <Metric icon="target" label="Win Rate" value={percent(summary.winRate)}/>
            <Metric icon="report" label="Profit Factor" value={fixed(summary.profitFactor)}/>
            <Metric icon="orders" label="Closed Positions" value={totalPositions.toLocaleString("en-US")}/>
            <Metric icon="pnl" label="Average Lot" value={fixed(summary.averageLot,3)}/>
            <Metric icon="strategy" label="Primary Lot" value={fixed(primaryLot,3)+" · "+primaryLotCount+" ไม้ · "+percent(primaryLotPercent)}/>
          </div>

          <div className={styles.resultsLabel}><ScenovaIcon name="report" size={15}/><span>Performance Breakdown · MT5 Analytics</span></div>

          <div className={styles.resultsGrid}>
            <div className={styles.panel}>
              <PanelTitle icon="profit">Performance</PanelTitle>
              <StatRow label="Total Net Profit" value={money(summary.netProfit,currency,true)} tone={Number(summary.netProfit)>=0?"good":"bad"}/>
              <StatRow label="Gross Profit" value={money(summary.grossProfit,currency)}/>
              <StatRow label="Gross Loss" value={"-"+money(Math.abs(Number(summary.grossLoss||0)),currency)} tone="bad"/>
              <StatRow label="Profit Factor" value={fixed(summary.profitFactor)}/>
              <StatRow label="Expected Payoff" value={money(summary.expectedPayoff,currency)}/>
              <StatRow label="Recovery Factor" value={fixed(summary.recoveryFactor)}/>
              <StatRow label="Sharpe Ratio" value={fixed(summary.sharpeRatio)}/>
              <StatRow label="AHPR" value={growthRatio(summary.ahpr)}/>
              <StatRow label="GHPR" value={growthRatio(summary.ghpr)}/>
            </div>

            <div className={styles.panel}>
              <PanelTitle icon="shield">Drawdown & Risk</PanelTitle>
              <StatRow label="Max Drawdown" value={percent(summary.maxDrawdownPercent)}/>
              <StatRow label="Drawdown Money" value={money(summary.maxDrawdownMoney,currency)}/>
              <StatRow label="Return" value={percent(summary.returnPercent,true)} tone={Number(summary.returnPercent)>=0?"good":"bad"}/>
              <StatRow label="Trading Days" value={String(Number(summary.tradingDays||0))}/>
              <StatRow label="Profitable Days" value={String(Number(summary.profitableDays||0))}/>
              <StatRow label="Losing Days" value={String(Number(summary.losingDays||0))}/>
              <StatRow label="Best Day" value={money(summary.bestDayProfit,currency,true)} tone={Number(summary.bestDayProfit)>=0?"good":"bad"}/>
              <StatRow label="Worst Day" value={money(summary.worstDayProfit,currency,true)} tone={Number(summary.worstDayProfit)>=0?"good":"bad"}/>
              <StatRow label="Average / Day" value={money(summary.averageDailyProfit,currency,true)} tone={Number(summary.averageDailyProfit)>=0?"good":"bad"}/>
            </div>

            <div className={styles.panel}>
              <PanelTitle icon="orders">Trades & Positions</PanelTitle>
              <StatRow label="Total Baskets" value={String(Number(summary.trades||0))}/>
              <StatRow label="Total Positions" value={String(totalPositions)}/>
              <StatRow label="Total Deals" value={String(totalDeals)}/>
              <StatRow label="Profit Baskets" value={String(Number(summary.wins||0))}/>
              <StatRow label="Loss Baskets" value={String(Number(summary.losses||0))}/>
              <StatRow label="Basket Win Rate" value={percent(summary.winRate)}/>
              <StatRow label="Profit Positions" value={String(Number(summary.profitPositions||0))}/>
              <StatRow label="Loss Positions" value={String(Number(summary.lossPositions||0))}/>
              <StatRow label="Position Win Rate" value={percent(summary.positionWinRate||0)}/>
            </div>

            <div className={styles.panel}>
              <PanelTitle icon="spread">Directional Analytics</PanelTitle>
              <StatRow label="Long Trades (won %)" value={String(Number(summary.buyTrades||0))+" ("+percent(summary.buyWinRate||0)+")"}/>
              <StatRow label="Short Trades (won %)" value={String(Number(summary.sellTrades||0))+" ("+percent(summary.sellWinRate||0)+")"}/>
              <StatRow label="Loss Rate" value={percent(summary.lossRate??(Number(summary.trades)?Number(summary.losses||0)/Number(summary.trades)*100:0))}/>
              <StatRow label="Breakeven Baskets" value={String(Number(summary.breakeven||0))}/>
              <StatRow label="Breakeven Positions" value={String(Number(summary.breakevenPositions||0))}/>
              {modeBreakdown.map((row:any)=>(
                <StatRow key={row.mode} label={strategyLabel(row.mode)+" Baskets"} value={String(Number(row.baskets||0))+" · "+percent(row.winRate||0)}/>
              ))}
            </div>

            <div className={styles.panel}>
              <PanelTitle icon="pnl">Execution Analytics</PanelTitle>
              <StatRow label="Largest profit trade" value={money(summary.largestProfitTrade,currency)}/>
              <StatRow label="Largest loss trade" value={money(summary.largestLossTrade,currency)} tone="bad"/>
              <StatRow label="Average profit trade" value={money(summary.averageProfitTrade,currency)}/>
              <StatRow label="Average loss trade" value={money(summary.averageLossTrade,currency)} tone="bad"/>
              <StatRow label="Average Lot" value={fixed(summary.averageLot,3)}/>
              <StatRow label="Maximum Lot" value={fixed(summary.maxLot,3)}/>
            </div>

            <div className={styles.panel}>
              <PanelTitle icon="target">Streaks</PanelTitle>
              <StatRow label="Maximum consecutive wins" value={String(Number(summary.maxWinStreak||0))+" ("+money(summary.maxWinStreakProfit,currency)+")"}/>
              <StatRow label="Maximum consecutive losses" value={String(Number(summary.maxLossStreak||0))+" ("+money(summary.maxLossStreakLoss,currency)+")"} tone="bad"/>
              <StatRow label="Average consecutive wins" value={fixed(summary.averageWinStreak,1)}/>
              <StatRow label="Average consecutive losses" value={fixed(summary.averageLossStreak,1)}/>
            </div>

            <div className={styles.panel}>
              <PanelTitle icon="timer">Timing</PanelTitle>
              <StatRow label="Bot Runtime" value={runtimeLabel(summary.runtimeSeconds)}/>
              <StatRow label="Average Trade Time" value={durationLabel(summary.averageTradeDurationSeconds)}/>
              <StatRow label="Longest Trade" value={durationLabel(summary.maxTradeDurationSeconds)}/>
              <StatRow label="Shortest Trade" value={durationLabel(summary.minTradeDurationSeconds)}/>
            </div>

            <div className={styles.panel}>
              <PanelTitle icon="strategy">Portfolio Scope</PanelTitle>
              <StatRow label="Selected Portfolio" value={strategyScopeLabel}/>
              <StatRow label="Strategies Included" value={String(selectedStrategyModes.length)}/>
              <StatRow label="Lot Sizes Used" value={String(Number(summary.lotSizeCount||lotDistribution.length||0))}/>
              <StatRow label="From" value={displayFrom}/>
              <StatRow label="To" value={displayTo}/>
              <StatRow label="Symbol" value={symbol}/>
            </div>
          </div>

          <div className={styles.analyticsCharts}>
            <div className={styles.lotCard}>
              <div className={styles.chartHead}>
                <div><ScenovaIcon name="pnl" size={15}/><b>Lot Allocation</b><small>Lot Size · จำนวนไม้ · สัดส่วน</small></div>
                <span>{Number(summary.lotSizeCount||lotDistribution.length||0)} Sizes</span>
              </div>
              <div className={styles.lotHighlights}>
                <div><span>Primary Lot</span><b>{fixed(primaryLot,3)}</b></div>
                <div><span>Positions</span><b>{primaryLotCount}</b></div>
                <div><span>Share</span><b>{percent(primaryLotPercent)}</b></div>
              </div>
              <LotDistributionChart rows={lotDistribution} total={totalPositions}/>
            </div>
            <div className={styles.chartCard}>
              <div className={styles.chartHead}><div><ScenovaIcon name="trend" size={15}/><b>Capital Growth</b><small>Balance progression · X = Closed Positions</small></div><span>End Balance: {money(endBalance,currency)}</span></div>
              <SummaryChart points={curve}/>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
