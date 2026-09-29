"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, getToken } from "../../lib/api";
import { CustomerSidebar, OwnerSidebar } from "../../components/OwnerSidebar";
import { ScenovaIcon } from "../../components/ScenovaIcon";
import { useSystemPopup } from "../../components/SystemPopupProvider";
import styles from "./performance.module.css";

type Mode = "LIVE" | "BACKTEST";
type StrategyMode = "AUTO" | "RACE" | "FLIP_LOCK" | "MANUAL" | "ZERO_GRID";
const STRATEGY_OPTIONS:StrategyMode[]=["AUTO","RACE","FLIP_LOCK","MANUAL","ZERO_GRID"];
type Options = {
  user: { id:string; user_code:string; email:string; role:string } | null;
  elevated: boolean;
  accounts: Array<any>;
};

function dateInput(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone:"Asia/Bangkok", year:"numeric", month:"2-digit", day:"2-digit"
  }).format(date);
}

function accountCurrentScore(account:any) {
  const lastSeen=account?.lastSeenAt?new Date(account.lastSeenAt).getTime():0;
  const created=account?.createdAt?new Date(account.createdAt).getTime():0;
  const online=lastSeen>0&&Date.now()-lastSeen<=90_000?1:0;
  const active=String(account?.status||"").toUpperCase()==="ACTIVE"?1:0;
  return {online,active,lastSeen,created};
}

function compareCurrentAccounts(a:any,b:any) {
  const aa=accountCurrentScore(a);
  const bb=accountCurrentScore(b);
  return bb.online-aa.online ||
    bb.active-aa.active ||
    bb.lastSeen-aa.lastSeen ||
    bb.created-aa.created ||
    String(b?.accountNumber||"").localeCompare(String(a?.accountNumber||""));
}

function currentRealDemoAccounts(accounts:any[]) {
  const sorted=[...(accounts||[])].sort(compareCurrentAccounts);
  const real=sorted.find((account:any)=>String(account.accountType||"REAL").toUpperCase()==="REAL")||null;
  const demo=sorted.find((account:any)=>String(account.accountType||"REAL").toUpperCase()!=="REAL")||null;
  return [real,demo].filter(Boolean);
}

function inclusiveDays(from:string,to:string) {
  const start = new Date(from + "T00:00:00+07:00").getTime();
  const end = new Date(to + "T00:00:00+07:00").getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
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
      {items.map((row:any)=> {
        const pct=Math.max(0,Math.min(100,Number(row.percent||0)));
        return (
          <div className={styles.lotRow} key={String(row.lot)}>
            <div className={styles.lotRowHead}>
              <b>{fixed(row.lot,3)} Lot</b>
              <span>{Number(row.count||0)} Positions · {percent(pct)}</span>
            </div>
            <div className={styles.lotTrack}><i style={{width:Math.max(2,pct)+"%"}}/></div>
          </div>
        );
      })}
      <div className={styles.lotTotal}>Total {total.toLocaleString("en-US")} Positions</div>
    </div>
  );
}

function SummaryChart({points}:{points:any[]}) {
  const validPoints=(points||[]).filter((point:any)=>Number.isFinite(Number(point?.balance)));
  if(!validPoints.length) return <div className={styles.emptyChart}>ยังไม่มีข้อมูลกราฟในช่วงเวลานี้</div>;
  const width=1000,height=220,left=52,right=18,top=18,bottom=42;
  const values=validPoints.map((point:any)=>Number(point.balance));
  const min=Math.min(...values),max=Math.max(...values),pad=Math.max(1,(max-min)*.09);
  const low=min-pad,high=max+pad,range=Math.max(1,high-low);
  const plotWidth=width-left-right,plotHeight=height-top-bottom;
  const coords=values.map((value,index)=>{
    const x=left+(values.length<=1?0:index/(values.length-1)*plotWidth);
    const y=top+(high-value)/range*plotHeight;
    return {x,y};
  });
  const singlePoint=coords.length===1;
  const line=singlePoint
    ? "M "+left+" "+coords[0].y.toFixed(1)+" L "+(width-right)+" "+coords[0].y.toFixed(1)
    : coords.map((point,index)=>(index?"L ":"M ")+point.x.toFixed(1)+" "+point.y.toFixed(1)).join(" ");
  const area=singlePoint
    ? line+" L "+(width-right)+" "+(top+plotHeight)+" L "+left+" "+(top+plotHeight)+" Z"
    : line+" L "+coords[coords.length-1].x.toFixed(1)+" "+(top+plotHeight)+" L "+coords[0].x.toFixed(1)+" "+(top+plotHeight)+" Z";
  const ticks=Array.from({length:Math.min(7,Math.max(2,validPoints.length))},(_,i)=>Math.round(i*(validPoints.length-1)/Math.max(1,Math.min(7,Math.max(2,validPoints.length))-1)))
    .filter((value,index,array)=>index===0||value!==array[index-1]);
  const last=singlePoint?{...coords[0],x:width-right}:coords[coords.length-1];
  return (
    <svg className={styles.chart} viewBox={"0 0 "+width+" "+height} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Balance curve">
      <defs>
        <linearGradient id="perf-line" x1="0" x2="1"><stop offset="0%" stopColor="#61d9ff"/><stop offset="48%" stopColor="#8c78ff"/><stop offset="100%" stopColor="#bd69ff"/></linearGradient>
        <linearGradient id="perf-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#8068ff" stopOpacity=".48"/><stop offset="100%" stopColor="#8068ff" stopOpacity=".02"/></linearGradient>
        <filter id="perf-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      {Array.from({length:5},(_,i)=>{
        const ratio=i/4;
        const y=top+ratio*plotHeight;
        const value=high-ratio*range;
        return <g key={"h"+i}><line x1={left} x2={width-right} y1={y} y2={y} className={styles.gridLine}/><text x="4" y={y+4} className={styles.chartLabel}>{value.toFixed(0)}</text></g>;
      })}
      {ticks.map((index)=>{
        const x=left+(validPoints.length<=1?0:index/(validPoints.length-1)*plotWidth);
        return <g key={"v"+index}><line x1={x} x2={x} y1={top} y2={top+plotHeight} className={styles.gridLine}/><text x={x} y={height-16} textAnchor="middle" className={styles.chartLabel}>{String(Number(validPoints[index]?.tradeNumber ?? index))}</text></g>;
      })}
      <path d={area} fill="url(#perf-area)"/>
      <path d={line} fill="none" stroke="url(#perf-line)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={last.x} cy={last.y} r="4" className={styles.endDot}/>
      <text x={width/2} y={height-5} textAnchor="middle" className={styles.chartLabel}>Closed Positions</text>
    </svg>
  );
}

function backtestStats(backtest:any) {
  const trades=Array.isArray(backtest?.trades)?backtest.trades:[];
  const profits=trades.map((row:any)=>Number(row.profit||0));
  const positive=profits.filter((value:number)=>value>0);
  const negative=profits.filter((value:number)=>value<0);
  const wins=positive.length,losses=negative.length,total=profits.length;
  const grossProfit=positive.reduce((a:number,b:number)=>a+b,0);
  const grossLoss=Math.abs(negative.reduce((a:number,b:number)=>a+b,0));
  const long=trades.filter((row:any)=>String(row.direction).toUpperCase()==="BUY");
  const short=trades.filter((row:any)=>String(row.direction).toUpperCase()==="SELL");
  const longWins=long.filter((row:any)=>Number(row.profit||0)>0).length;
  const shortWins=short.filter((row:any)=>Number(row.profit||0)>0).length;
  const volumes=trades.map((row:any)=>Number(row.volume||0)).filter((value:number)=>Number.isFinite(value)&&value>0);
  const durations=trades.map((row:any)=>{
    const opened=new Date(row.opened_at||0).getTime();
    const closed=new Date(row.closed_at||0).getTime();
    return Number.isFinite(opened)&&Number.isFinite(closed)&&closed>=opened?Math.floor((closed-opened)/1000):0;
  }).filter((value:number)=>value>=0);
  const byDay=new Map<string,number>();
  for(const row of trades){
    const key=row.closed_at?dateInput(row.closed_at):"";
    if(key) byDay.set(key,(byDay.get(key)||0)+Number(row.profit||0));
  }
  const days=Array.from(byDay.values());
  const lotMap=new Map<number,number>();
  for(const volume of volumes){
    const lot=Number(volume.toFixed(4));
    lotMap.set(lot,(lotMap.get(lot)||0)+1);
  }
  const lotDistribution=Array.from(lotMap.entries()).map(([lot,count])=>({
    lot,count,percent:total?count/total*100:0
  })).sort((a,b)=>a.lot-b.lot);
  const primaryLot=[...lotDistribution].sort((a,b)=>b.count-a.count||a.lot-b.lot)[0]||{lot:0,count:0,percent:0};
  return {
    totalDeals:total,totalPositions:total,wins,losses,
    profitPositions:wins,lossPositions:losses,breakevenPositions:Math.max(0,total-wins-losses),
    positionWinRate:total?wins/total*100:0,
    lossRate:total?losses/total*100:0,
    grossProfit,grossLoss,
    expectedPayoff:total?profits.reduce((a:number,b:number)=>a+b,0)/total:0,
    largestProfitTrade:positive.length?Math.max(...positive):0,
    largestLossTrade:negative.length?Math.min(...negative):0,
    averageProfitTrade:positive.length?grossProfit/positive.length:0,
    averageLossTrade:negative.length?negative.reduce((a:number,b:number)=>a+b,0)/negative.length:0,
    averageLot:volumes.length?volumes.reduce((a:number,b:number)=>a+b,0)/volumes.length:0,
    maxLot:volumes.length?Math.max(...volumes):0,
    primaryLot:primaryLot.lot,
    primaryLotCount:primaryLot.count,
    primaryLotPercent:primaryLot.percent,
    lotSizeCount:lotDistribution.length,
    lotDistribution,
    averageTradeDurationSeconds:durations.length?durations.reduce((a:number,b:number)=>a+b,0)/durations.length:0,
    maxTradeDurationSeconds:durations.length?Math.max(...durations):0,
    minTradeDurationSeconds:durations.length?Math.min(...durations):0,
    tradingDays:days.length,
    profitableDays:days.filter((value:number)=>value>0).length,
    losingDays:days.filter((value:number)=>value<0).length,
    bestDayProfit:days.length?Math.max(...days):0,
    worstDayProfit:days.length?Math.min(...days):0,
    averageDailyProfit:days.length?days.reduce((a:number,b:number)=>a+b,0)/days.length:0,
    buyTrades:long.length,sellTrades:short.length,
    buyWinRate:long.length?longWins/long.length*100:0,
    sellWinRate:short.length?shortWins/short.length*100:0
  };
}

export default function PerformanceDashboardPage() {
  const { showPopup, confirmPopup, promptPopup } = useSystemPopup();
  const today=useMemo(()=>dateInput(new Date()),[]);
  const [options,setOptions]=useState<Options|null>(null);
  const [accountId,setAccountId]=useState("");
  const [mode,setMode]=useState<Mode>("LIVE");
  const [selectedStrategies,setSelectedStrategies]=useState<StrategyMode[]>([...STRATEGY_OPTIONS]);
  const [from,setFrom]=useState(today);
  const [to,setTo]=useState(today);
  const [report,setReport]=useState<any>(null);
  const [selectedBacktestId,setSelectedBacktestId]=useState("");
  const [backtest,setBacktest]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [sharing,setSharing]=useState(false);
  const [shareResult,setShareResult]=useState<any>(null);
  const [error,setError]=useState("");
  const [controlsOpen,setControlsOpen]=useState(false);
  const refreshSequence=useRef(0);

  const ownAccounts=useMemo(
    ()=>(options?.accounts||[]).filter((account:any)=>account.userId===options?.user?.id),
    [options]
  );
  const currentAccounts=useMemo(
    ()=>currentRealDemoAccounts(ownAccounts),
    [ownAccounts]
  );
  const realAccounts=useMemo(
    ()=>currentAccounts.filter((account:any)=>String(account.accountType||"REAL").toUpperCase()==="REAL").slice(0,1),
    [currentAccounts]
  );
  const demoAccounts=useMemo(
    ()=>currentAccounts.filter((account:any)=>String(account.accountType||"REAL").toUpperCase()!=="REAL").slice(0,1),
    [currentAccounts]
  );
  const selectedAccount=useMemo(
    ()=>currentAccounts.find((account:any)=>account.id===accountId)||null,
    [currentAccounts,accountId]
  );

  function logout(){localStorage.removeItem("bot_token");window.location.href="/login";}

  async function loadOptions(){
    try{
      const next=await api("/performance-analytics/options");
      setOptions(next);
      const own=(next.accounts||[]).filter((account:any)=>account.userId===next.user?.id);
      const current=currentRealDemoAccounts(own).sort(compareCurrentAccounts);
      const first=current[0];
      setAccountId(first?.id||"");
      if(!first) setError("ยังไม่พบบัญชี MT5 ของคุณสำหรับดู Performance");
      else setError("");
    }catch(e:any){setError(String(e?.message||"โหลดข้อมูลไม่สำเร็จ"));}
  }

  async function refresh(nextAccountId=accountId,nextMode=mode,silent=false){
    if(!nextAccountId) return;
    const requestId=++refreshSequence.current;
    if(!silent) setLoading(true);
    try{
      const strategyQuery=nextMode==="LIVE"
        ? `&strategyModes=${encodeURIComponent(selectedStrategies.join(","))}`
        : "";
      const next=await api(`/performance-analytics/report?accountId=${encodeURIComponent(nextAccountId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${strategyQuery}`);
      if(requestId!==refreshSequence.current) return;
      setReport(next);
      if(nextMode==="BACKTEST"){
        const candidate=selectedBacktestId||next.backtests?.[0]?.id||"";
        setSelectedBacktestId(candidate);
        const nextBacktest=candidate
          ? await api(`/performance-analytics/backtest?id=${encodeURIComponent(candidate)}`)
          : null;
        if(requestId!==refreshSequence.current) return;
        setBacktest(nextBacktest);
      }else{
        setBacktest(null);
      }
      setError("");
    }catch(e:any){
      if(requestId===refreshSequence.current)
        setError(String(e?.message||"โหลดข้อมูลไม่สำเร็จ"));
    }finally{
      if(requestId===refreshSequence.current) setLoading(false);
    }
  }

  useEffect(()=>{if(!getToken()){window.location.href="/login";return;}void loadOptions().finally(()=>setLoading(false));},[]);
  useEffect(()=>{
    if(currentAccounts.length&&!currentAccounts.some((account:any)=>account.id===accountId)){
      setAccountId(currentAccounts[0]?.id||"");
      return;
    }
    if(accountId){setShareResult(null);void refresh(accountId,mode);}
  },[accountId,mode,selectedStrategies,from,to,currentAccounts]);

  useEffect(()=>{
    if(
      mode!=="LIVE" ||
      !accountId ||
      report?.dataQuality?.detailStatus!=="JOURNAL_RECOVERING"
    ) return;

    let cancelled=false;
    let timer:number|undefined;
    const poll=async()=>{
      if(cancelled) return;
      await refresh(accountId,mode,true);
      if(!cancelled) timer=window.setTimeout(()=>{void poll();},2500);
    };
    timer=window.setTimeout(()=>{void poll();},2500);

    return ()=>{
      cancelled=true;
      if(timer!==undefined) window.clearTimeout(timer);
    };
  },[accountId,mode,report?.dataQuality?.detailStatus,selectedStrategies,from,to]);

  function toggleStrategy(strategy:StrategyMode){
    setSelectedStrategies((current)=>{
      if(current.includes(strategy)){
        if(current.length===1) return current;
        return current.filter((item)=>item!==strategy);
      }
      return STRATEGY_OPTIONS.filter((item)=>current.includes(item)||item===strategy);
    });
  }

  function selectStrategyPortfolio(preset:"ALL"|"CORE"|"GRID"){
    if(preset==="ALL") setSelectedStrategies([...STRATEGY_OPTIONS]);
    else if(preset==="CORE") setSelectedStrategies(["AUTO","RACE","FLIP_LOCK","MANUAL"]);
    else setSelectedStrategies(["ZERO_GRID"]);
  }

  function applyDays(days:number){
    const range=rangeFromDays(to||today,days);
    setFrom(range.from);setTo(range.to);
  }

  async function chooseBacktest(id:string){
    setSelectedBacktestId(id);
    if(!id){setBacktest(null);return;}
    try{setBacktest(await api(`/performance-analytics/backtest?id=${encodeURIComponent(id)}`));}
    catch(e:any){setError(String(e?.message||"โหลด Backtest ไม่สำเร็จ"));}
  }

  async function createShare(){
    if(!accountId||mode!=="LIVE") return;
    setSharing(true);
    try{
      const result=await api("/performance-actions/share-live",{method:"POST",body:JSON.stringify({accountId,from,to,strategyModes:selectedStrategies})});
      setShareResult(result);setError("");
    }catch(e:any){setError(String(e?.message||"สร้างลิงก์แชร์ไม่สำเร็จ"));}
    finally{setSharing(false);}
  }

  async function copyShare(){
    if(!shareResult?.path) return;
    await navigator.clipboard.writeText(window.location.origin+shareResult.path);
  }

  async function clearOwnPerformanceData(){
    const token=await promptPopup({
      title:"ล้างข้อมูล Performance ของคุณ",
      tone:"warning",
      message:"คำสั่งนี้จะล้าง Trade Journal, Backtest และลิงก์ Performance ของบัญชีคุณทั้งหมด\n\nบัญชี MT5, Settings และ Subscription จะไม่ถูกลบ",
      requiredText:"CLEAR",
      placeholder:"พิมพ์ CLEAR",
      copyLabel:"คัดลอก CLEAR",
      confirmLabel:"ตรวจสอบต่อ"
    });
    if(token!=="CLEAR") return;
    const confirmed=await confirmPopup({
      title:"ยืนยันล้างข้อมูลของคุณ",
      tone:"warning",
      message:"Trade Journal, Backtest และลิงก์ Performance ของบัญชีนี้จะถูกล้างทันที โดยไม่ลบบัญชี MT5, Settings หรือ Subscription",
      confirmLabel:"ล้างข้อมูล"
    });
    if(!confirmed) return;
    setLoading(true);
    try{
      const result=await api("/performance-actions/clear-own-data",{
        method:"POST",
        body:JSON.stringify({confirm:"CLEAR"})
      });
      setReport(null);
      setBacktest(null);
      setSelectedBacktestId("");
      setShareResult(null);
      setError("");
      setFrom(today);
      setTo(today);
      await loadOptions();
      showPopup({
        tone:"success",
        title:"ล้างข้อมูลสำเร็จ",
        message:
          "Trade Journal: "+String(result?.deleted?.tradeJournal||0)+
          "\nBacktest: "+String(result?.deleted?.backtestRuns||0)+
          "\nShare links: "+String(result?.deleted?.performanceShares||0),
        duration:4200
      });
    }catch(e:any){
      setError(String(e?.message||"ล้างข้อมูลของคุณไม่สำเร็จ"));
    }finally{
      setLoading(false);
    }
  }

  async function clearAllPerformanceData(){
    if(!options?.elevated) return;
    const token=await promptPopup({
      title:"ล้างข้อมูล Performance ทั้งระบบ",
      tone:"warning",
      message:"คำสั่งนี้จะล้าง Trade Journal, Backtest และลิงก์ Performance ของผู้ใช้ทุกคนทั้งระบบ\n\nบัญชี MT5, Settings และ Subscription จะไม่ถูกลบ",
      requiredText:"RESET",
      placeholder:"พิมพ์ RESET",
      copyLabel:"คัดลอก RESET",
      confirmLabel:"ตรวจสอบต่อ"
    });
    if(token!=="RESET") return;
    const confirmed=await confirmPopup({
      title:"ยืนยันล้างข้อมูลทั้งระบบ",
      tone:"warning",
      message:"ข้อมูล Performance ของผู้ใช้ทุกคนจะถูกล้างทันที การดำเนินการนี้ไม่ลบบัญชี MT5, Settings หรือ Subscription",
      confirmLabel:"ล้างทั้งระบบ"
    });
    if(!confirmed) return;
    setLoading(true);
    try{
      const result=await api("/performance-actions/reset-test-data",{
        method:"POST",
        body:JSON.stringify({confirm:"RESET"})
      });
      setReport(null);
      setBacktest(null);
      setSelectedBacktestId("");
      setShareResult(null);
      setError("");
      setFrom(today);
      setTo(today);
      await loadOptions();
      showPopup({
        tone:"success",
        title:"ล้างข้อมูลทั้งระบบสำเร็จ",
        message:
          "Trade Journal: "+String(result?.deleted?.tradeJournal||0)+
          "\nBacktest: "+String(result?.deleted?.backtestRuns||0)+
          "\nShare links: "+String(result?.deleted?.performanceShares||0),
        duration:4200
      });
    }catch(e:any){
      setError(String(e?.message||"ล้างข้อมูลไม่สำเร็จ"));
    }finally{
      setLoading(false);
    }
  }

  const liveSummary=report?.summary||{};
  const backSummary=backtest?.summary||{};
  const backExtra=backtestStats(backtest);
  const summary=mode==="BACKTEST"?{...backSummary,...backExtra}:liveSummary;
  const detailedStatsReliable =
    mode==="BACKTEST" || report?.dataQuality?.detailedStatsReliable !== false;
  const journalRecovering =
    mode==="LIVE" && report?.dataQuality?.detailStatus==="JOURNAL_RECOVERING";
  const detailValue=(value:string)=>detailedStatsReliable?value:"—";
  const currency=String(mode==="BACKTEST"?backtest?.currency:report?.account?.currency||"USD").trim().toUpperCase()||"USD";
  const symbol=String(mode==="BACKTEST"?backtest?.symbol:report?.account?.symbol||"—");
  const runtimeMode=String(mode==="BACKTEST"?"BACKTEST":report?.account?.mode||"LIVE").toUpperCase();
  const startCapital=Number(mode==="BACKTEST"?backtest?.initial_deposit:report?.balance?.derivedStart||0);
  const liveEnd=Number(report?.balance?.current||0);
  const backTradePoints=Array.isArray(backtest?.trades)&&backtest.trades.length
    ? backtest.trades.map((row:any,index:number)=>({
        time:row.closed_at||row.opened_at,
        tradeNumber:index+1,
        balance:Number(row.balance_after||0)
      }))
    : Array.isArray(backtest?.equity_curve)?backtest.equity_curve.map((row:any,index:number)=>({
        time:row.time||row.closed_at||null,
        tradeNumber:index+1,
        balance:Number(row.balance||row.value||0)
      })):[];
  const backCurve=mode==="BACKTEST"&&startCapital>0
    ? [{time:backtest?.started_at||null,tradeNumber:0,balance:startCapital},...backTradePoints]
    : backTradePoints;
  const curve=mode==="BACKTEST"?backCurve:(report?.curve||[]);
  const endBalance=Number(mode==="BACKTEST"
    ? (backSummary.finalBalance??backCurve[backCurve.length-1]?.balance??startCapital)
    : (report?.balance?.rangeEnd??(liveEnd||startCapital+Number(summary.netProfit||0))));
  const totalDeals=mode==="BACKTEST"
    ? backExtra.totalDeals
    : Number(summary.totalDeals??report?.closedTrades?.length??0);
  const totalPositions=Number((summary.totalPositions??(mode==="BACKTEST"?backExtra.totalDeals:report?.closedTrades?.length))||0);
  const selectedStrategyModes:StrategyMode[]=mode==="LIVE"
    ? ((Array.isArray(report?.filter?.strategyModes)&&report.filter.strategyModes.length
        ? report.filter.strategyModes
        : selectedStrategies) as StrategyMode[])
    : [];
  const strategyScopeLabel=mode==="LIVE"?strategyPortfolioLabel(selectedStrategyModes):"BACKTEST";
  const lotDistribution=mode==="BACKTEST"
    ? (backExtra.lotDistribution||[])
    : (report?.lotDistribution||[]);
  const reliableLotDistribution=detailedStatsReliable?lotDistribution:[];
  const reliableCurve=detailedStatsReliable?curve:[];
  const primaryLot=Number(summary.primaryLot||0);
  const primaryLotCount=Number(summary.primaryLotCount||0);
  const primaryLotPercent=Number(summary.primaryLotPercent||0);
  const liveDisplayFrom=report?.range?.effectiveFrom?dateInput(report.range.effectiveFrom):from;
  const displayFrom=mode==="BACKTEST"&&backtest?.started_at?dateInput(backtest.started_at):liveDisplayFrom;
  const displayTo=mode==="BACKTEST"&&backtest?.ended_at?dateInput(backtest.ended_at):to;
  const rangeDays=inclusiveDays(displayFrom,displayTo);

  return (
    <div className={styles.shell}>
      {options?.elevated
        ? <OwnerSidebar activeKey="trading-backtest" onLogout={logout} role={String(options?.user?.role || "OWNER")}/>
        : <CustomerSidebar activeKey="trading-backtest" onLogout={logout} userCode={options?.user?.user_code}/>} 
      <main className={`${styles.main} ${options?.elevated ? styles.mainOwner : styles.mainCustomer}`}>
        {error?<div className={styles.error}>{error}</div>:null}

        <section className={styles.summaryShell}>
          <button
            type="button"
            className={`${styles.optionsButton} ${controlsOpen?styles.optionsButtonOpen:""}`}
            onClick={()=>setControlsOpen((value)=>!value)}
            aria-expanded={controlsOpen}
          >
            <ScenovaIcon name="control" size={15}/>
            <span>ตัวเลือก</span>
            <span className={styles.optionsChevron}>▾</span>
          </button>

          <div className={`${styles.optionsDrawer} ${controlsOpen?styles.optionsDrawerOpen:""}`}>
            <div className={styles.drawerTop}>
              <div className={styles.toolbarIdentity}>
                {selectedAccount?<span className={String(selectedAccount.accountType).toUpperCase()==="DEMO"?styles.demoBadge:styles.realBadge}>{String(selectedAccount.accountType||"REAL").toUpperCase()}</span>:null}
                <div className={styles.ownerBadge}><ScenovaIcon name="account" size={15}/><div><b>{options?.user?.user_code||"SCENOVA"}</b><span>My Performance Only</span></div></div>
              </div>
              <div className={styles.toolbarActions}>
                {mode==="LIVE"?<button type="button" className={styles.shareButton} onClick={createShare} disabled={sharing||!Number(summary.trades||0)}><ScenovaIcon name="share" size={14}/>{sharing?"กำลังสร้าง...":"แชร์ Read-only"}</button>:null}
                {shareResult?.path&&mode==="LIVE"?<><input className={styles.shareInput} readOnly value={window.location.origin+shareResult.path}/><button type="button" className={styles.minorButton} onClick={copyShare}>คัดลอก</button><a className={styles.minorButton} href={shareResult.path} target="_blank" rel="noreferrer">เปิด</a></>:null}
                <button type="button" className={styles.clearOwnButton} onClick={clearOwnPerformanceData} disabled={loading}><ScenovaIcon name="delete" size={14}/>ล้างข้อมูลของฉัน</button>
                {options?.elevated?<button type="button" className={styles.clearButton} onClick={clearAllPerformanceData} disabled={loading}><ScenovaIcon name="delete" size={14}/>ล้างข้อมูลทั้งระบบ</button>:null}
              </div>
            </div>

            <div className={styles.drawerControls}>
              <label className={styles.drawerField}>
                <span>Trading Account</span>
                <select value={accountId} onChange={(e)=>setAccountId(e.target.value)}>
                  {realAccounts.length?<optgroup label="Live Accounts (REAL)">{realAccounts.map((account:any)=><option key={account.id} value={account.id}>REAL · {account.accountNumber} · {account.broker}</option>)}</optgroup>:null}
                  {demoAccounts.length?<optgroup label="Demo Accounts">{demoAccounts.map((account:any)=><option key={account.id} value={account.id}>DEMO · {account.accountNumber} · {account.broker}</option>)}</optgroup>:null}
                </select>
              </label>

              <div className={styles.modeField}>
                <span className={styles.drawerLabel}>Report Source</span>
                <div className={styles.modeBoxes}>
                  <button
                    type="button"
                    aria-pressed={mode==="LIVE"}
                    className={mode==="LIVE"?styles.modeBoxActive:styles.modeBox}
                    onClick={()=>setMode("LIVE")}
                  >
                    <span className={styles.modeCheck}>{mode==="LIVE"?"✓":""}</span>
                    <span><b>Live</b><small>Live Performance</small></span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={mode==="BACKTEST"}
                    className={mode==="BACKTEST"?styles.modeBoxActive:styles.modeBox}
                    onClick={()=>setMode("BACKTEST")}
                  >
                    <span className={styles.modeCheck}>{mode==="BACKTEST"?"✓":""}</span>
                    <span><b>Backtest</b><small>Backtest Analysis</small></span>
                  </button>
                </div>
              </div>

              <div className={styles.datePair}>
                <label><span>Start Date</span><input type="date" value={from} onChange={(e)=>setFrom(e.target.value)}/></label>
                <label><span>End Date</span><input type="date" value={to} onChange={(e)=>setTo(e.target.value)}/></label>
              </div>

              <button className={styles.refreshButton} onClick={()=>refresh()} disabled={loading||!accountId}>
                <ScenovaIcon name="refresh" size={15}/>{loading?"กำลังโหลด...":"Refresh Report"}
              </button>
            </div>

            {mode==="LIVE"?(
              <div className={styles.strategyPortfolio}>
                <div className={styles.strategyPortfolioHead}>
                  <div><ScenovaIcon name="strategy" size={16}/><span><b>Strategy Portfolio</b><small>ติ๊กเลือกโหมดที่ต้องการนำมาคำนวณในรายงาน</small></span></div>
                  <strong>{strategyPortfolioLabel(selectedStrategies)}</strong>
                </div>
                <div className={styles.strategyChips}>
                  {STRATEGY_OPTIONS.map((strategy)=>{
                    const selected=selectedStrategies.includes(strategy);
                    return (
                      <button
                        type="button"
                        key={strategy}
                        aria-pressed={selected}
                        className={selected?styles.strategyChipActive:styles.strategyChip}
                        onClick={()=>toggleStrategy(strategy)}
                      >
                        <span className={styles.strategyCheck}>{selected?"✓":""}</span>
                        <span className={styles.strategyCopy}>
                          <b>{strategyLabel(strategy)}</b>
                          <small>{selected?"Selected":"Not selected"}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className={styles.strategyPresets}>
                  <span>Portfolio Presets</span>
                  <button type="button" onClick={()=>selectStrategyPortfolio("ALL")}>All Strategies</button>
                  <button type="button" onClick={()=>selectStrategyPortfolio("CORE")}>Core 4</button>
                  <button type="button" onClick={()=>selectStrategyPortfolio("GRID")}>Grid Only</button>
                </div>
              </div>
            ):null}

            <div className={styles.drawerFooter}>
              <div className={styles.presets}><button onClick={()=>applyDays(1)}>วันนี้</button><button onClick={()=>applyDays(7)}>7 วัน</button><button onClick={()=>applyDays(30)}>30 วัน</button><button onClick={()=>applyDays(90)}>90 วัน</button></div>
              <strong>{rangeDays} วัน · {from} → {to} · {mode==="LIVE"?strategyPortfolioLabel(selectedStrategies):"BACKTEST"}</strong>
            </div>

            {mode==="BACKTEST"?(
              <div className={styles.drawerBacktest}>
                <div><ScenovaIcon name="strategy" size={15}/><span><b>เลือกรายงาน Backtest ของคุณ</b><small>แสดงเฉพาะ Backtest ที่ผูกกับบัญชีของคุณ</small></span></div>
                <select value={selectedBacktestId} onChange={(e)=>chooseBacktest(e.target.value)}><option value="">เลือกรายงาน</option>{(report?.backtests||[]).map((run:any)=><option key={run.id} value={run.id}>{run.title} · {run.symbol} · {run.timeframe}</option>)}</select>
              </div>
            ):null}
          </div>
          <header className={styles.summaryTitle}>
            <div className={styles.titleMark}><ScenovaIcon name="pnl" size={24}/><h2>BOT PERFORMANCE SUMMARY</h2><ScenovaIcon name="pnl" size={24}/></div>
            <p>{mode==="LIVE"?"Live portfolio performance · "+strategyScopeLabel:"Backtest performance analysis"}</p>
          </header>

          {!report||(mode==="BACKTEST"&&!backtest)?(
            <div className={styles.emptyState}>{mode==="BACKTEST"?"เลือกรายงาน Backtest เพื่อดูสรุป":"ยังไม่มีข้อมูล Performance ในช่วงเวลานี้"}</div>
          ):(
            <>
              <div className={styles.infoCard}>
                <div className={styles.infoCol}>
                  <InfoRow icon="account" label="Account" value={String(report?.account?.accountNumber||"—")}/>
                  <InfoRow icon="shield" label="Account Type" value={String(selectedAccount?.accountType||"REAL").toUpperCase()}/>
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
                  <InfoRow icon="play" label="Data Mode" value={mode}/>
                  <InfoRow icon="orders" label="Closed Baskets" value={detailValue(String(Number(summary.trades||0)))}/>
                  <InfoRow icon="orders" label="Closed Positions" value={detailValue(String(totalPositions))}/>
                </div>
              </div>

              {!detailedStatsReliable?(
                <div className={styles.dataQualityNotice}>
                  <ScenovaIcon name="status" size={15}/>
                  <b>{journalRecovering
                    ?"กำลังซิงก์ประวัติ Deal จาก MT5 · ระบบจะอัปเดตสถิติอัตโนมัติ"
                    :"กำลังตรวจสอบความครบถ้วนของประวัติ Deal จาก MT5"}</b>
                </div>
              ):null}

              <div className={styles.metricsCard}>
                <Metric icon="wallet" label="Start Capital" value={money(startCapital,currency)}/>
                <Metric icon="equity" label="End Balance" value={money(endBalance,currency)}/>
                <Metric icon="profit" label="Net Profit" value={money(summary.netProfit,currency,true)} tone={Number(summary.netProfit)>=0?"good":"bad"}/>
                <Metric icon="trend" label="Return" value={percent(summary.returnPercent,true)} tone={Number(summary.returnPercent)>=0?"good":"bad"}/>
                <Metric icon="risk" label="Max Drawdown" value={detailValue(percent(summary.maxDrawdownPercent))}/>
                <Metric icon="target" label="Win Rate" value={detailValue(percent(summary.winRate))}/>
                <Metric icon="report" label="Profit Factor" value={detailValue(fixed(summary.profitFactor))}/>
                <Metric icon="orders" label="Closed Positions" value={detailValue(totalPositions.toLocaleString("en-US"))}/>
                <Metric icon="pnl" label="Average Lot" value={detailValue(fixed(summary.averageLot,3))}/>
                <Metric icon="strategy" label="Primary Lot" value={detailValue(fixed(primaryLot,3)+" · "+primaryLotCount+" Pos. · "+percent(primaryLotPercent))}/>
              </div>

              <div className={styles.resultsLabel}><ScenovaIcon name="report" size={15}/><span>Performance Breakdown · MT5 Analytics</span></div>
              <div className={styles.resultsGrid}>
                <div className={styles.panel}>
                  <PanelTitle icon="profit">Performance</PanelTitle>
                  <StatRow label="Total Net Profit" value={money(summary.netProfit,currency,true)} tone={Number(summary.netProfit)>=0?"good":"bad"}/>
                  <StatRow label="Gross Profit" value={detailValue(money(summary.grossProfit,currency))}/>
                  <StatRow label="Gross Loss" value={detailValue("-"+money(Math.abs(Number(summary.grossLoss||0)),currency))} tone="bad"/>
                  <StatRow label="Profit Factor" value={detailValue(fixed(summary.profitFactor))}/>
                  <StatRow label="Expected Payoff" value={detailValue(money(summary.expectedPayoff,currency))}/>
                  <StatRow label="Recovery Factor" value={detailValue(fixed(summary.recoveryFactor))}/>
                  <StatRow label="Sharpe Ratio" value={detailValue(fixed(summary.sharpeRatio))}/>
                  <StatRow label="AHPR" value={detailValue(growthRatio(summary.ahpr))}/>
                  <StatRow label="GHPR" value={detailValue(growthRatio(summary.ghpr))}/>
                </div>

                <div className={styles.panel}>
                  <PanelTitle icon="shield">Drawdown & Risk</PanelTitle>
                  <StatRow label="Max Drawdown" value={detailValue(percent(summary.maxDrawdownPercent))}/>
                  <StatRow label="Drawdown Money" value={detailValue(money(summary.maxDrawdownMoney,currency))}/>
                  <StatRow label="Return" value={percent(summary.returnPercent,true)} tone={Number(summary.returnPercent)>=0?"good":"bad"}/>
                  <StatRow label="Trading Days" value={detailValue(String(Number(summary.tradingDays||0)))}/>
                  <StatRow label="Profitable Days" value={detailValue(String(Number(summary.profitableDays||0)))}/>
                  <StatRow label="Losing Days" value={detailValue(String(Number(summary.losingDays||0)))}/>
                  <StatRow label="Best Day" value={detailValue(money(summary.bestDayProfit,currency,true))} tone={Number(summary.bestDayProfit)>=0?"good":"bad"}/>
                  <StatRow label="Worst Day" value={detailValue(money(summary.worstDayProfit,currency,true))} tone={Number(summary.worstDayProfit)>=0?"good":"bad"}/>
                  <StatRow label="Average / Day" value={detailValue(money(summary.averageDailyProfit,currency,true))} tone={Number(summary.averageDailyProfit)>=0?"good":"bad"}/>
                </div>

                <div className={styles.panel}>
                  <PanelTitle icon="orders">Trades & Positions</PanelTitle>
                  <StatRow label="Total Baskets" value={detailValue(String(Number(summary.trades||0)))}/>
                  <StatRow label="Total Positions" value={detailValue(String(totalPositions))}/>
                  <StatRow label="Total Deals" value={detailValue(String(totalDeals))}/>
                  <StatRow label="Profit Baskets" value={detailValue(String(Number(summary.wins||0)))}/>
                  <StatRow label="Loss Baskets" value={detailValue(String(Number(summary.losses||0)))}/>
                  <StatRow label="Basket Win Rate" value={detailValue(percent(summary.winRate))}/>
                  <StatRow label="Profit Positions" value={detailValue(String(Number(summary.profitPositions||0)))}/>
                  <StatRow label="Loss Positions" value={detailValue(String(Number(summary.lossPositions||0)))}/>
                  <StatRow label="Position Win Rate" value={detailValue(percent(summary.positionWinRate||0))}/>
                </div>

                <div className={styles.panel}>
                  <PanelTitle icon="spread">Directional Analytics</PanelTitle>
                  <StatRow label="Long Baskets (won %)" value={detailValue(String(Number(summary.buyTrades||0))+" ("+percent(summary.buyWinRate||0)+")")}/>
                  <StatRow label="Short Baskets (won %)" value={detailValue(String(Number(summary.sellTrades||0))+" ("+percent(summary.sellWinRate||0)+")")}/>
                  <StatRow label="Loss Rate" value={detailValue(percent(summary.lossRate??(Number(summary.trades)?Number(summary.losses||0)/Number(summary.trades)*100:0)))}/>
                  <StatRow label="Breakeven Baskets" value={detailValue(String(Number(summary.breakeven||0)))}/>
                  <StatRow label="Breakeven Positions" value={detailValue(String(Number(summary.breakevenPositions||0)))}/>
                  {mode==="LIVE"?(report?.modeBreakdown||[]).map((row:any)=>(
                    <StatRow key={row.mode} label={strategyLabel(row.mode)+" Baskets"} value={detailValue(String(Number(row.baskets||0))+" · "+percent(row.winRate||0))}/>
                  )):null}
                </div>

                <div className={styles.panel}>
                  <PanelTitle icon="pnl">Execution Analytics</PanelTitle>
                  <StatRow label="Largest profit trade" value={detailValue(money(summary.largestProfitTrade,currency))}/>
                  <StatRow label="Largest loss trade" value={detailValue(money(summary.largestLossTrade,currency))} tone="bad"/>
                  <StatRow label="Average profit trade" value={detailValue(money(summary.averageProfitTrade,currency))}/>
                  <StatRow label="Average loss trade" value={detailValue(money(summary.averageLossTrade,currency))} tone="bad"/>
                  <StatRow label="Average Lot" value={detailValue(fixed(summary.averageLot,3))}/>
                  <StatRow label="Maximum Lot" value={detailValue(fixed(summary.maxLot,3))}/>
                </div>

                <div className={styles.panel}>
                  <PanelTitle icon="target">Streaks</PanelTitle>
                  <StatRow label="Maximum consecutive wins" value={detailValue(String(Number(summary.maxWinStreak||0))+" ("+money(summary.maxWinStreakProfit,currency)+")")}/>
                  <StatRow label="Maximum consecutive losses" value={detailValue(String(Number(summary.maxLossStreak||0))+" ("+money(summary.maxLossStreakLoss,currency)+")")} tone="bad"/>
                  <StatRow label="Average consecutive wins" value={detailValue(fixed(summary.averageWinStreak,1))}/>
                  <StatRow label="Average consecutive losses" value={detailValue(fixed(summary.averageLossStreak,1))}/>
                </div>

                <div className={styles.panel}>
                  <PanelTitle icon="timer">Timing</PanelTitle>
                  <StatRow label={mode==="LIVE"?"Bot Runtime":"Report Period"} value={mode==="LIVE"?runtimeLabel(summary.runtimeSeconds):rangeDays+" วัน"}/>
                  <StatRow label="Average Trade Time" value={detailValue(durationLabel(summary.averageTradeDurationSeconds))}/>
                  <StatRow label="Longest Trade" value={detailValue(durationLabel(summary.maxTradeDurationSeconds))}/>
                  <StatRow label="Shortest Trade" value={detailValue(durationLabel(summary.minTradeDurationSeconds))}/>
                </div>

                <div className={styles.panel}>
                  <PanelTitle icon="strategy">Portfolio Scope</PanelTitle>
                  <StatRow label="Selected Portfolio" value={strategyScopeLabel}/>
                  <StatRow label="Strategies Included" value={mode==="LIVE"?String(selectedStrategyModes.length):"—"}/>
                  <StatRow label="Lot Sizes Used" value={detailValue(String(Number(summary.lotSizeCount||lotDistribution.length||0)))}/>
                  <StatRow label="From" value={displayFrom}/>
                  <StatRow label="To" value={displayTo}/>
                  <StatRow label="Symbol" value={symbol}/>
                </div>
              </div>

              <div className={styles.analyticsCharts}>
                <div className={styles.lotCard}>
                  <div className={styles.chartHead}>
                    <div><ScenovaIcon name="pnl" size={15}/><b>Lot Allocation</b></div>
                    <span>{detailedStatsReliable?Number(summary.lotSizeCount||lotDistribution.length||0):"—"} Sizes</span>
                  </div>
                  <div className={styles.lotHighlights}>
                    <div><span>Primary Lot</span><b>{detailValue(fixed(primaryLot,3))}</b></div>
                    <div><span>Positions</span><b>{detailValue(String(primaryLotCount))}</b></div>
                    <div><span>Share</span><b>{detailValue(percent(primaryLotPercent))}</b></div>
                  </div>
                  <LotDistributionChart rows={reliableLotDistribution} total={detailedStatsReliable?totalPositions:0}/>
                </div>
                <div className={styles.chartCard}>
                  <div className={styles.chartHead}><div><ScenovaIcon name="trend" size={15}/><b>Capital Growth</b></div><span>End Balance: {money(endBalance,currency)}</span></div>
                  <SummaryChart points={reliableCurve}/>
                </div>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
