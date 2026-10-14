"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, getToken } from "../../lib/api";
import { CustomerMobileNav, CustomerSidebar, OwnerMobileNav, OwnerSidebar } from "../../components/OwnerSidebar";
import styles from "./bot-inspection.module.css";

type Account = {
  id:string;number:string;displayName:string|null;broker:string;server:string;
  mode:string;status:string;runtimeState:string|null;archived:boolean;
  userCode:string|null;lastTradeAt:string|null;
};
type Event = {
  id:string;source:"TRADE"|"COMMAND";recordedAt:string;executedAt:string|null;
  event:string;status:string|null;direction:string|null;volume:number|null;
  price:number|null;pnl:number|null;positionId:string|null;dealTicket:string|null;
  symbol:string|null;currency:string|null;controlMode:string|null;
  deliveredAt:string|null;ackedAt:string|null;
};
type Session = {id:string;startAt:string;startStatus:string;stopRequestedAt:string|null;stopDeliveredAt:string|null;stopAcknowledgedAt:string|null;stopStatus:string|null;endConfirmed:boolean;entries:number;exits:number;pnlByCurrency:Array<{currency:string;pnl:number}>};
type TradeGroup = {id:string;startedAt:string;endedAt:string|null;entries:number;exits:number;grossLots:number;netProfit:number;complete:boolean;currency:string};
type Report = {
  timezone:string;from:string;to:string;account:{id:string;number:string;archived:boolean;status:string;userCode:string|null;server:string};
  summary:Array<{currency:string;entries:number;exits:number;pnl:number}>;
  sessions:Session[];tradeGroups:TradeGroup[];
  findings:Array<{code:string;title:string;detail:string;observedAt:string|null;level:"WARNING"|"INFO"}>;
  limitations:{sessionsIncomplete:boolean;groupsIncomplete:boolean;groupsInferred:boolean;closureReasonAvailable:boolean;historicalCommandsUnavailable:boolean;message:string};
  events:Event[];offset:number;nextOffset:number|null;
};
type Filter = "ALL"|"ACTIVE"|"ARCHIVED"|"REAL"|"DEMO";
type EventFilter = "ALL"|"TRADE"|"COMMAND"|"LOSS";

const offsetMs=7*60*60*1000;
const thInput=(d:Date)=>new Date(d.getTime()+offsetMs).toISOString().slice(0,16);
const toUtc=(d:string)=>{
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(d))return "";
  const parsed=new Date(d+":00+07:00");
  return Number.isFinite(parsed.getTime())?parsed.toISOString():"";
};
const thai=(raw:string|null|undefined,seconds=true)=>{
  if(!raw)return "—";
  const d=new Date(raw);
  if(!Number.isFinite(d.getTime()))return "—";
  return new Intl.DateTimeFormat("th-TH",{
    timeZone:"Asia/Bangkok",calendar:"gregory",numberingSystem:"latn",day:"2-digit",month:"short",
    hour:"2-digit",minute:"2-digit",...(seconds?{second:"2-digit"}:{})
  }).format(d);
};
const amount=(n:number)=>Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const num=(n:unknown)=>Number.isFinite(Number(n))?Number(n):0;
const last4=(n:string)=>"••••"+String(n||"").slice(-4);

export default function BotInspectionPage(){
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [role,setRole]=useState("USER");
  const [userCode,setUserCode]=useState("");
  const [accountId,setAccountId]=useState("");
  const [filter,setFilter]=useState<Filter>("ALL");
  const [query,setQuery]=useState("");
  const [listLoading,setListLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [report,setReport]=useState<Report|null>(null);
  const [timeline,setTimeline]=useState<Event[]>([]);
  const [from,setFrom]=useState(()=>thInput(new Date(Date.now()-24*60*60*1000)));
  const [to,setTo]=useState(()=>thInput(new Date()));
  const [sessionId,setSessionId]=useState("");
  const [groupId,setGroupId]=useState("");
  const [detailTab,setDetailTab]=useState<"SESSIONS"|"GROUPS"|"EVENTS">("SESSIONS");
  const [eventFilter,setEventFilter]=useState<EventFilter>("ALL");
  const [nextOffset,setNextOffset]=useState<number|null>(null);
  const requestVersion=useRef(0);
  const elevated=role==="OWNER"||role==="ADMIN";

  useEffect(()=>{
    if(!getToken()){window.location.assign("/login");return;}
    let alive=true;
    api("/bot-inspection/accounts").then(data=>{
      if(!alive)return;
      const rows=Array.isArray(data.accounts)?data.accounts as Account[]:[];
      setAccounts(rows);setRole(String(data.role||"USER"));setUserCode(String(data.userCode||""));
      const initial=new URLSearchParams(window.location.search).get("accountId");
      setAccountId(rows.find(a=>a.id===initial)?.id||rows[0]?.id||"");
    }).catch(e=>{if(alive)setError(String(e?.message||"โหลดบัญชีไม่สำเร็จ"));})
      .finally(()=>{if(alive)setListLoading(false);});
    return()=>{alive=false;};
  },[]);

  const selected=accounts.find(a=>a.id===accountId);
  const visible=useMemo(()=>accounts.filter(a=>{
    const type=String(a.server||"").toUpperCase().includes("TRIAL")||String(a.server||"").toUpperCase().includes("DEMO")?"DEMO":"REAL";
    if(filter==="ACTIVE"&&a.archived)return false;
    if(filter==="ARCHIVED"&&!a.archived)return false;
    if((filter==="REAL"||filter==="DEMO")&&type!==filter)return false;
    const haystack=[a.number,a.displayName,a.broker,a.server,a.userCode].join(" ").toLowerCase();
    return !query.trim()||haystack.includes(query.trim().toLowerCase());
  }),[accounts,filter,query]);

  function chooseFilter(value:Filter){
    setFilter(value);
    const filtered=accounts.filter(a=>{
      const server=String(a.server||"").toUpperCase();
      const type=server.includes("TRIAL")||server.includes("DEMO")?"DEMO":"REAL";
      return value==="ALL"||(value==="ACTIVE"&&!a.archived)||(value==="ARCHIVED"&&a.archived)||((value==="REAL"||value==="DEMO")&&type===value);
    });
    if(!filtered.some(a=>a.id===accountId)){requestVersion.current++;setAccountId(filtered[0]?.id||"");setReport(null);setTimeline([]);}
  }

  async function inspect(){
    if(!accountId)return;
    const f=toUtc(from),t=toUtc(to);
    if(!f||!t||new Date(f)>=new Date(t)){
      setError("เลือกวันและเวลาเริ่ม/สิ้นสุดให้ถูกต้อง");return;
    }
    if(new Date(t).getTime()-new Date(f).getTime()>90*86400000){
      setError("ตรวจสอบครั้งละไม่เกิน 90 วัน");return;
    }
    const ticket=++requestVersion.current;
    setBusy(true);setError("");setReport(null);setTimeline([]);setNextOffset(null);
    try{
      const params=new URLSearchParams({accountId,from:f,to:t});
      const data=await api("/bot-inspection/report?"+params.toString()) as Report;
      if(ticket!==requestVersion.current)return;
      setReport(data);setTimeline(data.events);setNextOffset(data.nextOffset);
      setSessionId("");setGroupId("");setDetailTab("SESSIONS");
    }catch(e:any){if(ticket===requestVersion.current)setError(String(e?.message||"ตรวจสอบบัญชีไม่สำเร็จ"));}
    finally{if(ticket===requestVersion.current)setBusy(false);}
  }

  async function loadMore(){
    if(!report||nextOffset===null)return;
    const ticket=requestVersion.current;
    setBusy(true);
    try{
      const params=new URLSearchParams({accountId:report.account.id,from:report.from,to:report.to,offset:String(nextOffset)});
      const data=await api("/bot-inspection/report?"+params.toString()) as Report;
      if(ticket!==requestVersion.current||data.account.id!==report.account.id)return;
      setTimeline(prev=>[...prev,...data.events]);setNextOffset(data.nextOffset);
    }catch(e:any){if(ticket===requestVersion.current)setError(String(e?.message||"โหลดเหตุการณ์เพิ่มเติมไม่ได้"));}
    finally{if(ticket===requestVersion.current)setBusy(false);}
  }

  const events=useMemo(()=>timeline.filter(e=>
    eventFilter==="ALL"||eventFilter===e.source||(eventFilter==="LOSS"&&e.source==="TRADE"&&e.event==="EXIT"&&num(e.pnl)<0)
  ),[timeline,eventFilter]);
  const totalEvents=report?.summary.reduce((a,s)=>a+s.entries+s.exits,0)||0;
  function logout(){localStorage.removeItem("bot_token");window.location.href="/login";}
  if(listLoading)return <main className={styles.loading}>กำลังโหลดบัญชี MT5...</main>;
  return (
    <div className={styles.shell}>
      {elevated?<OwnerSidebar activeKey="bot-inspection" onLogout={logout} role={role}/>:<CustomerSidebar activeKey="bot-inspection" onLogout={logout} userCode={userCode}/>}
      <main className={styles.main}>
        <div className={styles.mobileNav}>
          {elevated?<OwnerMobileNav activeKey="bot-inspection" onLogout={logout}/>:<CustomerMobileNav activeKey="bot-inspection" onLogout={logout}/>}
        </div>
        <div className={styles.content}>
          <header className={styles.head}>
            <div><small>SCENOVA / READ ONLY</small><h1>Bot Logs</h1></div>
            <span className={styles.timezone}>เวลาไทย UTC+7</span>
          </header>
          <section className={styles.panel}>
            <div className={styles.toolbar}>
              <label className={styles.field}><span>เลือกบัญชี MT5</span>
                <select value={accountId} onChange={e=>{requestVersion.current++;setAccountId(e.target.value);setReport(null);setTimeline([]);setBusy(false);}} aria-label="เลือกบัญชี MT5">
                  {visible.length===0&&!selected?<option value="">ไม่มีบัญชีตามตัวกรอง</option>:(selected&&!visible.some(a=>a.id===selected.id)?[selected,...visible]:visible).map(a=>
                    <option key={a.id} value={a.id}>{last4(a.number)} · {a.userCode?a.userCode+" · ":""}{a.broker} · {a.archived?"ถอดออก":"ใช้งาน"}</option>
                  )}
                </select>
              </label>
              <label className={styles.field}><span>ค้นหาบัญชี</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="เลข MT5 / ลูกค้า / Broker"/></label>
            </div>
            <div className={styles.filters} role="group" aria-label="ประเภทบัญชี">
              {([{k:"ALL",l:"ทั้งหมด"},{k:"ACTIVE",l:"ใช้งาน"},{k:"ARCHIVED",l:"ถอดออก"},{k:"REAL",l:"Real"},{k:"DEMO",l:"Demo"}] as const).map(f=>
                <button key={f.k} className={filter===f.k?styles.selected:""} onClick={()=>chooseFilter(f.k)} type="button">{f.l}</button>
              )}
              <span className={styles.count}>{visible.length} / {accounts.length}</span>
            </div>
            {query||filter!=="ALL"?<div className={styles.matches}>
              {visible.slice(0,14).map(a=><button key={a.id} type="button" className={a.id===accountId?styles.matchSelected:""} onClick={()=>{requestVersion.current++;setAccountId(a.id);setReport(null);setTimeline([]);setBusy(false);}}>
                {last4(a.number)} <span>{a.userCode||a.broker} · {a.archived?"ถอดออก":"ใช้งาน"}</span>
              </button>)}
              {!visible.length&&<p>ไม่พบบัญชีตามตัวกรอง</p>}
            </div>:null}
            {selected&&<div className={styles.accountInfo}><b>MT5 {last4(selected.number)}</b><span>{selected.server} · {selected.mode}</span><em className={selected.archived?styles.archived:styles.active}>{selected.archived?"ถอดออก / ตรวจย้อนหลัง":"ใช้งาน"}</em></div>}
            <div className={styles.dateBar}>
              <label className={styles.field}><span>เริ่ม (ไทย)</span><input type="datetime-local" value={from} onChange={e=>{requestVersion.current++;setFrom(e.target.value);setReport(null);setTimeline([]);setBusy(false);}}/></label>
              <label className={styles.field}><span>ถึง (ไทย)</span><input type="datetime-local" value={to} onChange={e=>{requestVersion.current++;setTo(e.target.value);setReport(null);setTimeline([]);setBusy(false);}}/></label>
              <button className={styles.inspect} onClick={()=>void inspect()} disabled={busy||!accountId}>{busy?"กำลังตรวจ...":"ตรวจสอบ"}</button>
            </div>
            {error&&<p className={styles.error} role="alert">{error}</p>}
          </section>

          {report&&<>
            <section className={styles.totals}>
              <div><span>รอบ START</span><b>{report.sessions.length}{report.limitations.sessionsIncomplete?"+":""}</b></div>
              <div><span>รายการเทรด</span><b>{totalEvents.toLocaleString("en-US")}</b></div>
              <div className={styles.pnlTotal}><span>P/L จาก Journal</span><b>{report.summary.length===1?
                (report.summary[0].pnl>0?"+":"")+amount(report.summary[0].pnl)+" "+report.summary[0].currency:
                report.summary.length===0?"—":report.summary.map(s=>amount(s.pnl)+" "+s.currency).join(" / ")}</b></div>
            </section>
            <section className={styles.panel}>
              {report.findings.length>0&&<details className={styles.findings}>
                <summary>ผลตรวจเบื้องต้น · {report.findings.filter(f=>f.level==="WARNING").length} จุดเสี่ยง / {report.findings.length} ข้อค้นพบ</summary>
                <div className={styles.findingList}>{report.findings.map((f,i)=><div key={f.code+i}>
                  <b className={f.level==="WARNING"?styles.loss:""}>{f.title}</b>
                  <span>{f.detail} · {thai(f.observedAt)}</span>
                </div>)}</div>
                <p>ประเมินจากเวลาที่ระบบบันทึกเท่านั้น ยังไม่ใช่ข้อยืนยันสาเหตุพอร์ตแตก</p>
              </details>}
              <div className={styles.segment} role="group" aria-label="รูปแบบผลตรวจ">
                <button type="button" className={detailTab==="SESSIONS"?styles.selected:""} onClick={()=>setDetailTab("SESSIONS")}>รอบบอท ({report.sessions.length})</button>
                <button type="button" className={detailTab==="GROUPS"?styles.selected:""} onClick={()=>setDetailTab("GROUPS")}>กลุ่มดีล ({report.tradeGroups.length})</button>
                <button type="button" className={detailTab==="EVENTS"?styles.selected:""} onClick={()=>setDetailTab("EVENTS")}>เหตุการณ์</button>
              </div>
              {detailTab==="SESSIONS"&&<div className={styles.list}>
                {report.sessions.length===0?<p className={styles.empty}>{report.limitations.historicalCommandsUnavailable?"พบดีลเก่า แต่บัญชีถูกถอดออกแล้ว จึงไม่มีข้อมูล START/STOP ที่ยืนยันผูกกับบัญชีนี้ · เปิดแท็บกลุ่มดีลเพื่อตรวจย้อนหลัง":"ไม่พบคำสั่ง START ที่ยืนยันผูกกับบัญชีในช่วงที่เลือก (รอบอาจเริ่มก่อนช่วงนี้)"}</p>:
                  report.sessions.map((s,i)=><details key={s.id} className={styles.item} open={sessionId===s.id} onToggle={e=>{if(e.currentTarget.open)setSessionId(s.id);}}>
                    <summary><b>รอบ {report.sessions.length-i}</b><span>{thai(s.startAt)}</span><small>{s.entries} ไม้ · {s.pnlByCurrency.map(p=>(p.pnl>0?"+":"")+amount(p.pnl)+" "+p.currency).join(" / ")||"ไม่มีดีล"}</small><i>⌄</i></summary>
                    {sessionId===s.id&&<div className={styles.itemBody}>
                      <div>เริ่ม <b>{thai(s.startAt)}</b></div>
                      <div>กดหยุด <b>{thai(s.stopRequestedAt)}</b></div>
                      <div>ส่งถึง EA <b>{thai(s.stopDeliveredAt)}</b></div>
                      <div>รับทราบ (ACK) <b>{thai(s.stopAcknowledgedAt)}</b></div>
                      <div>เปิด / ปิด <b>{s.entries} / {s.exits} ดีล</b></div>
                      <div>ผลสุทธิ <b>{s.pnlByCurrency.map(p=>amount(p.pnl)+" "+p.currency).join(" / ")||"—"}</b></div>
                      <p>จัดกลุ่มดีลจาก START ถึง START ถัดไป · ACK ไม่ใช่หลักฐานว่าหยุดเทรดสมบูรณ์{report.limitations.groupsIncomplete?" · รายการดีลบางส่วนอาจไม่ครบ":""}</p>
                    </div>}
                  </details>)}
              </div>}
              {detailTab==="GROUPS"&&<div className={styles.list}>
                <p className={styles.note}>กลุ่มดีลอนุมานจาก Entry/Exit ที่ระบบได้รับ ไม่ใช่ Cycle ID จริงของ ZERO GRID</p>
                {report.tradeGroups.length===0?<p className={styles.empty}>ไม่พบรายการดีลในช่วงนี้</p>:
                  report.tradeGroups.map((g,i)=><details key={g.id} className={styles.item} open={groupId===g.id} onToggle={e=>{if(e.currentTarget.open)setGroupId(g.id);}}>
                    <summary><b>กลุ่ม {report.tradeGroups.length-i}</b><span>{thai(g.startedAt)}</span><small className={g.netProfit<0?styles.loss:styles.gain}>{g.netProfit>0?"+":""}{amount(g.netProfit)} {g.currency} · {g.entries} ไม้</small><i>⌄</i></summary>
                    {groupId===g.id&&<div className={styles.itemBody}>
                      <div>เริ่ม <b>{thai(g.startedAt)}</b></div>
                      <div>ปิดล่าสุด <b>{thai(g.endedAt)}</b></div>
                      <div>เปิด / ปิด <b>{g.entries} / {g.exits} ดีล</b></div>
                      <div>Lot เปิดรวม <b>{g.grossLots}</b></div>
                      <div>สกุลเงิน <b>{g.currency}</b></div>
                      <div>สถานะ <b>{g.complete?"ปิดครบตามดีลที่พบ":"ข้อมูลยังไม่ครบ"}</b></div>
                    </div>}
                  </details>)}
              </div>}
              {detailTab==="EVENTS"&&<div className={styles.list}>
                <div className={styles.filters}>
                  {([{k:"ALL",l:"ทั้งหมด"},{k:"TRADE",l:"เทรด"},{k:"COMMAND",l:"คำสั่ง"},{k:"LOSS",l:"ขาดทุน"}] as const).map(f=>
                    <button key={f.k} type="button" onClick={()=>setEventFilter(f.k)} className={eventFilter===f.k?styles.selected:""}>{f.l}</button>)}
                </div>
                {events.length===0?<p className={styles.empty}>ไม่พบเหตุการณ์ตามตัวกรอง</p>:
                  events.map(e=><details key={e.source+e.id} className={styles.item}>
                    <summary><b className={e.pnl!==null&&e.pnl<0?styles.loss:""}>{e.source==="COMMAND"?e.event:
                      e.event+" "+(e.direction||"")+(e.volume!==null?" "+e.volume:"")+" Lot"}</b>
                      <span>{thai(e.executedAt||e.recordedAt)}</span>
                      <small className={e.pnl!==null&&e.pnl<0?styles.loss:e.pnl!==null&&e.pnl>0?styles.gain:""}>{e.source==="COMMAND"?e.status:e.pnl===null?"":amount(e.pnl)+" "+(e.currency||"")}</small><i>⌄</i>
                    </summary>
                    <div className={styles.itemBody}>
                      <div>บันทึกเข้า SCENOVA <b>{thai(e.recordedAt)}</b></div>
                      {e.executedAt&&<div>เวลาทำดีล MT5 <b>{thai(e.executedAt)}</b></div>}
                      {e.source==="COMMAND"?<>
                        <div>ส่งถึง EA <b>{thai(e.deliveredAt)}</b></div>
                        <div>ยืนยัน (ACK) <b>{thai(e.ackedAt)}</b></div>
                      </>:<>
                        <div>ราคา <b>{e.price??"—"}</b></div>
                        <div>Position <b>{e.positionId||"—"}</b></div>
                        <div>Deal Ticket <b>{e.dealTicket||"—"}</b></div>
                        <div>โหมด <b>{e.controlMode||"—"}</b></div>
                      </>}
                    </div>
                  </details>)}
                {nextOffset!==null&&<button type="button" className={styles.more} disabled={busy} onClick={()=>void loadMore()}>{busy?"กำลังโหลด...":"แสดงเหตุการณ์เพิ่มอีก 100 รายการ"}</button>}
              </div>}
              <details className={styles.explain}>
                <summary>ข้อจำกัดของผลตรวจ / หลักฐาน</summary>
                <p>{report.limitations.message}</p>
                {report.limitations.historicalCommandsUnavailable&&<p>บัญชีที่ถอดออกไม่มี Runtime ผูกไว้แล้ว ประวัติ START/STOP บางช่วงจึงไม่สามารถอ้างอิงได้อย่างแน่นอน</p>}
                {report.limitations.sessionsIncomplete&&<p>รอบบอทมีข้อมูลเกินขีดจำกัดการแสดง อาจขาดบางรอบ</p>}
                {report.limitations.groupsIncomplete&&<p>มีดีลจำนวนมาก ระบบแสดงเฉพาะส่วนล่าสุด กลุ่มดีลอาจไม่ครบ</p>}
                <p>บัญชีที่ถอดออกไม่ได้แปลว่าพอร์ตแตกเสมอ ต้องตรวจบัญชีและเหตุปิดจาก MT5 เพิ่มเติม</p>
                <p>ผลรวมจาก Journal ไม่รวมเหตุการณ์ BASKET ซ้ำ และอาจไม่ตรงยอดสุทธิ MT5 เมื่อมีข้อมูลที่ไม่ถูกส่งเข้า SCENOVA</p>
              </details>
            </section>
          </>}
          {!report&&!busy&&!error&&<p className={styles.idle}>เลือกบัญชีและช่วงเวลา แล้วกด “ตรวจสอบ” · ไม่กระทบการเทรด</p>}
        </div>
      </main>
    </div>
  );
}
