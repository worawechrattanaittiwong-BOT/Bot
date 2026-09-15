"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { adminApi } from "../../../lib/api";
import s from "./cloud-test.module.css";

type Node = {
  runner_id:string; region:string; hostname:string|null; capacity:number; occupied:number; active_instances:number;
  accepting_jobs:boolean; health:string; last_seen_at:string|null;
  telemetry?:{ templateReady?:boolean; version?:string; cpuPercent?:number; ramUsedGb?:number; ramTotalGb?:number };
};
type State = {
  selectedRunnerId:string;
  nodes:Node[];
  test:any|null;
  checks:Record<string,boolean>;
  warning:string;
};

const labels:Record<string,string> = {
  nodeSelected:"เลือก VPS แล้ว",
  nodeOnline:"Worker Online",
  templateReady:"MT5 Template ผ่านการตรวจ",
  capacityAvailable:"มี Capacity สำหรับทดสอบ",
  testPrepared:"เตรียม Demo MT5 แล้ว",
  assignedToWorker:"ผูก Test Instance กับ Worker แล้ว",
  provisioningHealthy:"Provisioning ไม่มี Error",
  eaOnline:"EA Heartbeat Online"
};

export default function CloudTestPage() {
  const [data,setData]=useState<State|null>(null);
  const [runnerId,setRunnerId]=useState("");
  const runnerRef=useRef("");
  const [accountNumber,setAccountNumber]=useState("");
  const [broker,setBroker]=useState("Demo MT5");
  const [brokerServer,setBrokerServer]=useState("");
  const [tradingPassword,setTradingPassword]=useState("");
  const [confirmDemo,setConfirmDemo]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  async function load(preferredRunner?:string) {
    try {
      const selected=preferredRunner ?? runnerRef.current;
      const result=await adminApi("/admin/cloud-test"+(selected?"?runnerId="+encodeURIComponent(selected):""));
      setData(result);
      setRunnerId(prev=>{
        const next=prev || result.selectedRunnerId || "";
        runnerRef.current=next;
        return next;
      });
      setError("");
    } catch(e:any) { setError(e.message); }
  }

  useEffect(()=>{
    if (!localStorage.getItem("bot_token")) { window.location.href="/login"; return; }
    load();
    const timer=window.setInterval(()=>{ if(!document.hidden) load(runnerRef.current); },5000);
    return()=>window.clearInterval(timer);
  },[]);

  const selectedNode=useMemo(()=>data?.nodes.find(n=>n.runner_id===runnerId)||null,[data,runnerId]);

  async function prepare(e:FormEvent) {
    e.preventDefault();
    if (!confirmDemo) return setError("กรุณายืนยันว่าใช้บัญชี Demo เท่านั้น");
    setBusy(true);setError("");setMessage("");
    try {
      const result=await adminApi("/admin/cloud-test/prepare",{
        method:"POST",
        body:JSON.stringify({runnerId,accountNumber,broker,brokerServer,tradingPassword,confirmDemo:true})
      });
      setTradingPassword("");
      setMessage("ส่ง Demo Provisioning แล้ว · สถานะเริ่มต้น STOPPED และยังไม่ได้สั่งเทรด");
      runnerRef.current=result.runnerId;
      await load(result.runnerId);
    } catch(e:any) { setError(e.message); }
    finally { setBusy(false); }
  }

  return <main className={s.root}>
    <div className={s.topbar}><Link href="/admin?view=workers">← Cloud Console</Link><span>OWNER TEST MODE</span></div>
    <section className={s.hero}>
      <div><span className={s.kicker}>PHASE 1 · CLOUD VPS TEST READY</span><h1>ทดสอบ Cloud VPS แบบไม่แตะระบบลูกค้า</h1><p>หน้านี้สร้าง Test Slot ของ Owner แยกจาก Payment และ Local Mode ใช้สำหรับ Demo MT5 เท่านั้น และจะ Provision ในสถานะ <b>STOPPED</b> เสมอ</p></div>
      <div className={s.warning}>⚠ ใช้บัญชี MT5 Demo เท่านั้น · หน้านี้ไม่ส่งคำสั่ง START</div>
    </section>

    {error&&<div className={`${s.notice} ${s.bad}`}>{error}</div>}
    {message&&<div className={`${s.notice} ${s.good}`}>{message}</div>}

    <div className={s.grid}>
      <section className={s.card}>
        <div className={s.cardHead}><div><span className={s.kicker}>WORKER HEALTH</span><h2>VPS / Worker</h2></div><button onClick={()=>load(runnerRef.current)} disabled={busy}>รีเฟรช</button></div>
        <label className={s.field}>เลือก Runner
          <select value={runnerId} onChange={e=>{const value=e.target.value;setRunnerId(value);runnerRef.current=value;load(value)}}>
            <option value="">เลือก VPS</option>
            {data?.nodes.map(n=><option key={n.runner_id} value={n.runner_id}>{n.runner_id} · {n.region} · {n.health}</option>)}
          </select>
        </label>
        {selectedNode?<div className={s.nodeBox}>
          <div><b>{selectedNode.runner_id}</b><span className={selectedNode.health==="ONLINE"?s.ok:s.off}>{selectedNode.health}</span></div>
          <p>{selectedNode.hostname||"ยังไม่รายงาน Hostname"} · {Math.max(Number(selectedNode.occupied||0),Number(selectedNode.active_instances||0))}/{selectedNode.capacity} MT5</p>
          <p>Template: <b>{selectedNode.telemetry?.templateReady?"READY":"NOT READY"}</b> · Worker v{selectedNode.telemetry?.version||"—"}</p>
          <p>CPU {selectedNode.telemetry?.cpuPercent??"—"}% · RAM {selectedNode.telemetry?.ramUsedGb??"—"}/{selectedNode.telemetry?.ramTotalGb??"—"} GB</p>
        </div>:<p className={s.muted}>ยังไม่มี Worker ให้เลือก</p>}
        <div className={s.checks}>{Object.entries(labels).map(([key,label])=><div key={key} className={data?.checks?.[key]?s.checkOk:s.checkWait}><span>{data?.checks?.[key]?"✓":"○"}</span><div><b>{label}</b><small>{key==="eaOnline"?"สำเร็จเมื่อ EA จาก Demo MT5 ส่ง Heartbeat กลับมา":""}</small></div></div>)}</div>
      </section>

      <section className={s.card}>
        <div className={s.cardHead}><div><span className={s.kicker}>DEMO PROVISIONING</span><h2>เตรียม Owner Test Instance</h2></div></div>
        {data?.test?.instance_id?<div className={s.current}>
          <b>Test Instance มีอยู่แล้ว</b>
          <span>Slot: {data.test.slot_id}</span><span>MT5: {data.test.account_number||"—"} / {data.test.broker_server||"—"}</span>
          <span>Runner: {data.test.runner_id||"ยังไม่ผูก"}</span><span>State: {data.test.actual_state} / {data.test.desired_state}</span>
          {data.test.provisioning_error&&<strong>Provision error: {data.test.provisioning_error}</strong>}
          <Link className={s.actionLink} href={"/dashboard?slotId="+encodeURIComponent(data.test.slot_id)}>เปิด Control Center →</Link>
        </div>:<form onSubmit={prepare} className={s.form}>
          <label className={s.field}>Demo MT5 Login<input value={accountNumber} onChange={e=>setAccountNumber(e.target.value)} inputMode="numeric" required placeholder="123456789"/></label>
          <label className={s.field}>Broker<input value={broker} onChange={e=>setBroker(e.target.value)} maxLength={80} placeholder="Exness Demo"/></label>
          <label className={s.field}>Broker Server<input value={brokerServer} onChange={e=>setBrokerServer(e.target.value)} required maxLength={160} placeholder="Exness-MT5Trial..."/></label>
          <label className={s.field}>Trading Password<input type="password" value={tradingPassword} onChange={e=>setTradingPassword(e.target.value)} required autoComplete="off"/></label>
          <label className={s.confirm}><input type="checkbox" checked={confirmDemo} onChange={e=>setConfirmDemo(e.target.checked)}/><span>ยืนยันว่าเป็นบัญชี <b>Demo</b> และยอมให้ระบบสร้าง MT5 portable test instance บน VPS ที่เลือก</span></label>
          <button className={s.primary} disabled={busy||!runnerId||!confirmDemo}>{busy?"กำลังเตรียม...":"Provision Demo แบบ STOPPED"}</button>
          <p className={s.muted}>ปุ่มนี้ไม่เปิดขายแพ็กเกจ ไม่สร้าง Payment และไม่เปลี่ยน Local Slot ใด ๆ</p>
        </form>}
      </section>
    </div>
  </main>;
}
