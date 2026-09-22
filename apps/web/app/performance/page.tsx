"use client";

import { useEffect, useMemo, useState } from "react";
import { api, getToken } from "../../lib/api";
import { CustomerSidebar, OwnerSidebar } from "../../components/OwnerSidebar";
import { ScenovaIcon } from "../../components/ScenovaIcon";
import styles from "./performance.module.css";

type Mode = "LIVE" | "BACKTEST";
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

function SummaryChart({points}:{points:any[]}) {
  if(!points?.length) return <div className={styles.emptyChart}>ยังไม่มีข้อมูลกราฟในช่วงเวลานี้</div>;
  const width=1200,height=190,left=34,right=18,top=13,bottom=30;
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
  const ticks=Array.from({length:Math.min(7,Math.max(2,points.length))},(_,i)=>Math.round(i*(points.length-1)/Math.max(1,Math.min(7,Math.max(2,points.length))-1)))
    .filter((value,index,array)=>index===0||value!==array[index-1]);
  const last=coords[coords.length-1];
  return (
    <svg className={styles.chart} viewBox={"0 0 "+width+" "+height} role="img" aria-label="Balance curve">
      <defs>
        <linearGradient id="perf-line" x1="0" x2="1"><stop offset="0%" stopColor="#61d9ff"/><stop offset="48%" stopColor="#8c78ff"/><stop offset="100%" stopColor="#bd69ff"/></linearGradient>
        <linearGradient id="perf-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#8068ff" stopOpacity=".48"/><stop offset="100%" stopColor="#8068ff" stopOpacity=".02"/></linearGradient>
        <filter id="perf-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      {Array.from({length:5},(_,i)=>{
        const ratio=i/4;
        const y=top+ratio*plotHeight;
        const value=high-ratio*range;
        return <g key={"h"+i}><line x1={left} x2={width-right} y1={y} y2={y} className={styles.gridLine}/><text x="3" y={y+3} className={styles.chartLabel}>{value.toFixed(0)}</text></g>;
      })}
      {ticks.map((index)=>{
        const x=left+(points.length<=1?0:index/(points.length-1)*plotWidth);
        return <g key={"v"+index}><line x1={x} x2={x} y1={top} y2={top+plotHeight} className={styles.gridLine}/><text x={x} y={height-7} textAnchor="middle" className={styles.chartLabel}>{String(Number(points[index]?.tradeNumber ?? index))}</text></g>;
      })}
      <path d={area} fill="url(#perf-area)"/>
      <path d={line} fill="none" stroke="url(#perf-line)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={last.x} cy={last.y} r="4" className={styles.endDot}/>
      <text x={width/2} y={height-1} textAnchor="middle" className={styles.chartLabel}>จำนวนไม้</text>
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
  return {
    totalDeals:total,wins,losses,
    lossRate:total?losses/total*100:0,
    grossProfit,grossLoss,
    expectedPayoff:total?profits.reduce((a:number,b:number)=>a+b,0)/total:0,
    largestProfitTrade:positive.length?Math.max(...positive):0,
    largestLossTrade:negative.length?Math.min(...negative):0,
    averageProfitTrade:positive.length?grossProfit/positive.length:0,
    averageLossTrade:negative.length?negative.reduce((a:number,b:number)=>a+b,0)/negative.length:0,
    buyTrades:long.length,sellTrades:short.length,
    buyWinRate:long.length?longWins/long.length*100:0,
    sellWinRate:short.length?shortWins/short.length*100:0
  };
}

export default function PerformanceDashboardPage() {
  const today=useMemo(()=>dateInput(new Date()),[]);
  const [options,setOptions]=useState<Options|null>(null);
  const [accountId,setAccountId]=useState("");
  const [mode,setMode]=useState<Mode>("LIVE");
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

  async function refresh(nextAccountId=accountId,nextMode=mode){
    if(!nextAccountId) return;
    setLoading(true);
    try{
      const next=await api(`/performance-analytics/report?accountId=${encodeURIComponent(nextAccountId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      setReport(next);
      if(nextMode==="BACKTEST"){
        const candidate=selectedBacktestId||next.backtests?.[0]?.id||"";
        setSelectedBacktestId(candidate);
        setBacktest(candidate?await api(`/performance-analytics/backtest?id=${encodeURIComponent(candidate)}`):null);
      }else{
        setBacktest(null);
      }
      setError("");
    }catch(e:any){setError(String(e?.message||"โหลดข้อมูลไม่สำเร็จ"));}
    finally{setLoading(false);}
  }

  useEffect(()=>{if(!getToken()){window.location.href="/login";return;}void loadOptions().finally(()=>setLoading(false));},[]);
  useEffect(()=>{
    if(currentAccounts.length&&!currentAccounts.some((account:any)=>account.id===accountId)){
      setAccountId(currentAccounts[0]?.id||"");
      return;
    }
    if(accountId){setShareResult(null);void refresh(accountId,mode);}
  },[accountId,mode,from,to,currentAccounts]);

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
      const result=await api("/performance-actions/share-live",{method:"POST",body:JSON.stringify({accountId,from,to})});
      setShareResult(result);setError("");
    }catch(e:any){setError(String(e?.message||"สร้างลิงก์แชร์ไม่สำเร็จ"));}
    finally{setSharing(false);}
  }

  async function copyShare(){
    if(!shareResult?.path) return;
    await navigator.clipboard.writeText(window.location.origin+shareResult.path);
  }

  async function clearOwnPerformanceData(){
    const token=window.prompt(
      "คำสั่งนี้จะล้าง Trade Journal, Backtest และลิงก์ Performance ของบัญชีผู้ใช้ของคุณทั้งหมด\n\nบัญชี MT5, Settings และ Subscription จะไม่ถูกลบ\n\nพิมพ์ CLEAR เพื่อยืนยัน"
    );
    if(token!=="CLEAR") return;
    if(!window.confirm("ยืนยันล้างข้อมูล Performance ของคุณทั้งหมดตอนนี้หรือไม่?")) return;
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
      window.alert(
        "ล้างข้อมูลของคุณสำเร็จ\nTrade Journal: "+String(result?.deleted?.tradeJournal||0)+
        "\nBacktest: "+String(result?.deleted?.backtestRuns||0)+
        "\nShare links: "+String(result?.deleted?.performanceShares||0)
      );
    }catch(e:any){
      setError(String(e?.message||"ล้างข้อมูลของคุณไม่สำเร็จ"));
    }finally{
      setLoading(false);
    }
  }

  async function clearAllPerformanceData(){
    if(!options?.elevated) return;
    const token=window.prompt(
      "คำสั่งนี้จะล้าง Trade Journal, Backtest และลิงก์ Performance ของผู้ใช้ทุกคนทั้งระบบ\n\nบัญชี MT5, Settings และ Subscription จะไม่ถูกลบ\n\nพิมพ์ RESET เพื่อยืนยัน"
    );
    if(token!=="RESET") return;
    if(!window.confirm("ยืนยันล้างข้อมูล Performance ทั้งระบบตอนนี้หรือไม่?")) return;
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
      window.alert(
        "ล้างข้อมูลสำเร็จ\nTrade Journal: "+String(result?.deleted?.tradeJournal||0)+
        "\nBacktest: "+String(result?.deleted?.backtestRuns||0)+
        "\nShare links: "+String(result?.deleted?.performanceShares||0)
      );
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
    ? backSummary.finalBalance??backCurve[backCurve.length-1]?.balance??startCapital
    : report?.balance?.rangeEnd??liveEnd||startCapital+Number(summary.netProfit||0));
  const totalDeals=mode==="BACKTEST"?backExtra.totalDeals:Number(report?.closedTrades?.length||0);
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
              <label><span>บัญชีของฉัน</span><select value={accountId} onChange={(e)=>setAccountId(e.target.value)}>
                {realAccounts.length?<optgroup label="บัญชีจริง (REAL)">{realAccounts.map((account:any)=><option key={account.id} value={account.id}>REAL · {account.accountNumber} · {account.broker}</option>)}</optgroup>:null}
                {demoAccounts.length?<optgroup label="บัญชีทดลอง (DEMO)">{demoAccounts.map((account:any)=><option key={account.id} value={account.id}>DEMO · {account.accountNumber} · {account.broker}</option>)}</optgroup>:null}
              </select></label>
              <label><span>โหมดข้อมูล</span><select value={mode} onChange={(e)=>setMode(e.target.value as Mode)}><option value="LIVE">Live Performance</option><option value="BACKTEST">Backtest</option></select></label>
              <label><span>ตั้งแต่วันที่</span><input type="date" value={from} onChange={(e)=>setFrom(e.target.value)}/></label>
              <label><span>ถึงวันที่</span><input type="date" value={to} onChange={(e)=>setTo(e.target.value)}/></label>
              <button className={styles.refreshButton} onClick={()=>refresh()} disabled={loading||!accountId}><ScenovaIcon name="refresh" size={15}/>{loading?"กำลังโหลด...":"Refresh"}</button>
            </div>

            <div className={styles.drawerFooter}>
              <div className={styles.presets}><button onClick={()=>applyDays(1)}>วันนี้</button><button onClick={()=>applyDays(7)}>7 วัน</button><button onClick={()=>applyDays(30)}>30 วัน</button><button onClick={()=>applyDays(90)}>90 วัน</button></div>
              <strong>{rangeDays} วัน · {from} → {to}</strong>
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
            <p>{mode==="LIVE"?"สรุปผลการเทรดจริงของบัญชีคุณ":"สรุปผล Backtest ของบัญชีคุณ"}</p>
          </header>

          {!report||(mode==="BACKTEST"&&!backtest)?(
            <div className={styles.emptyState}>{mode==="BACKTEST"?"เลือกรายงาน Backtest เพื่อดูสรุป":"ยังไม่มีข้อมูล Performance ในช่วงเวลานี้"}</div>
          ):(
            <>
              <div className={styles.infoCard}>
                <div className={styles.infoCol}><InfoRow icon="account" label="Account" value={String(report?.account?.accountNumber||"—")}/><InfoRow icon="shield" label="Account Type" value={String(selectedAccount?.accountType||"REAL").toUpperCase()}/><InfoRow icon="wallet" label="Currency" value={currency}/></div>
                <div className={styles.infoCol}><InfoRow icon="layers" label="Runtime Mode" value={runtimeMode}/><InfoRow icon="clock" label="From" value={displayFrom}/><InfoRow icon="play" label="Data Mode" value={mode}/></div>
                <div className={styles.infoCol}><InfoRow icon="stop" label="To" value={displayTo}/><InfoRow icon="hourglass" label="Period" value={rangeDays+" วัน"}/><InfoRow icon="orders" label="Closed Baskets" value={String(Number(summary.trades||0))}/></div>
              </div>

              <div className={styles.metricsCard}>
                <Metric icon="wallet" label="Start Capital" value={money(startCapital,currency)}/>
                <Metric icon="equity" label="End Balance" value={money(endBalance,currency)}/>
                <Metric icon="profit" label="Net Profit" value={money(summary.netProfit,currency,true)} tone={Number(summary.netProfit)>=0?"good":"bad"}/>
                <Metric icon="trend" label="Return" value={percent(summary.returnPercent,true)} tone={Number(summary.returnPercent)>=0?"good":"bad"}/>
                <Metric icon="timer" label="Period" value={rangeDays+" วัน"}/>
                <Metric icon="risk" label="Max Drawdown" value={percent(summary.maxDrawdownPercent)}/>
                <Metric icon="target" label="Win Rate" value={percent(summary.winRate)}/>
              </div>

              <div className={styles.resultsLabel}><ScenovaIcon name="report" size={14}/><span>Results</span></div>
              <div className={styles.resultsGrid}>
                <div className={styles.panel}><PanelTitle icon="profit">Performance</PanelTitle>
                  <StatRow label="Total Net Profit" value={money(summary.netProfit,currency,true)} tone={Number(summary.netProfit)>=0?"good":"bad"}/>
                  <StatRow label="Profit (%)" value={percent(summary.returnPercent,true)} tone={Number(summary.returnPercent)>=0?"good":"bad"}/>
                  <StatRow label="Gross Profit" value={money(summary.grossProfit,currency)}/>
                  <StatRow label="Gross Loss" value={"-"+money(Math.abs(Number(summary.grossLoss||0)),currency)} tone="bad"/>
                  <StatRow label="Profit Factor" value={fixed(summary.profitFactor)}/>
                  <StatRow label="Expected Payoff" value={money(summary.expectedPayoff,currency)}/>
                  <StatRow label="Recovery Factor" value={fixed(summary.recoveryFactor)}/>
                  <StatRow label="Sharpe Ratio" value={fixed(summary.sharpeRatio)}/>
                </div>

                <div className={styles.stack}>
                  <div className={styles.panel}><PanelTitle icon="shield">Drawdown</PanelTitle><StatRow label="Max Drawdown" value={percent(summary.maxDrawdownPercent)}/><StatRow label="Drawdown Money" value={money(summary.maxDrawdownMoney,currency)}/></div>
                  <div className={styles.panel}><PanelTitle icon="orders">Trades</PanelTitle>
                    <StatRow label="Total Baskets" value={String(Number(summary.trades||0))}/>
                    <StatRow label="Total Deals" value={String(totalDeals)}/>
                    <StatRow label="Profit Baskets" value={String(Number(summary.wins||0))}/>
                    <StatRow label="Loss Baskets" value={String(Number(summary.losses||0))}/>
                    <StatRow label="Win Rate" value={percent(summary.winRate)}/>
                    <StatRow label="Loss Rate" value={percent(summary.lossRate??(Number(summary.trades)?Number(summary.losses||0)/Number(summary.trades)*100:0))}/>
                  </div>
                </div>

                <div className={styles.stack}>
                  <div className={styles.panel}><PanelTitle icon="spread">Trade Direction</PanelTitle><StatRow label="Long Baskets (won %)" value={String(Number(summary.buyTrades||0))+" ("+percent(summary.buyWinRate||0)+")"}/><StatRow label="Short Baskets (won %)" value={String(Number(summary.sellTrades||0))+" ("+percent(summary.sellWinRate||0)+")"}/></div>
                  <div className={styles.panel}><PanelTitle icon="pnl">Trade Statistics</PanelTitle><StatRow label="Largest profit trade" value={money(summary.largestProfitTrade,currency)}/><StatRow label="Largest loss trade" value={money(summary.largestLossTrade,currency)} tone="bad"/><StatRow label="Average profit trade" value={money(summary.averageProfitTrade,currency)}/><StatRow label="Average loss trade" value={money(summary.averageLossTrade,currency)} tone="bad"/></div>
                  <div className={styles.panel}><PanelTitle icon="target">Streaks</PanelTitle><StatRow label="Maximum consecutive wins" value={String(Number(summary.maxWinStreak||0))+" ("+money(summary.maxWinStreakProfit,currency)+")"}/><StatRow label="Maximum consecutive losses" value={String(Number(summary.maxLossStreak||0))+" ("+money(summary.maxLossStreakLoss,currency)+")"} tone="bad"/><StatRow label="Average consecutive wins" value={fixed(summary.averageWinStreak,1)}/><StatRow label="Average consecutive losses" value={fixed(summary.averageLossStreak,1)}/></div>
                </div>
              </div>

              <div className={styles.chartCard}>
                <div className={styles.chartHead}><div><ScenovaIcon name="trend" size={14}/><b>Balance</b><small>แกน X = จำนวนไม้ที่ปิด</small></div><span>End Balance: {money(endBalance,currency)}</span></div>
                <SummaryChart points={curve}/>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
