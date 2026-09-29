"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import s from "./runtime-migration.module.css";

type Slot = {
  id:string; mode:"LOCAL"|"CLOUD"; status:string; label?:string|null; slot_number:number;
  instance_id?:string|null; instance_mode?:string|null; desired_state?:string|null; actual_state?:string|null;
  last_seen_at?:string|null; agent_last_seen_at?:string|null; agent_version?:string|null; device_status?:string|null;
  runner_id?:string|null; execution_generation?:number|null; runtime_stop_state?:string|null; positions?:number|null;
  pending_orders?:number|null;
  account_number?:string|null; broker?:string|null; broker_server?:string|null;
};
type Migration = {
  id:string; state:string; source_slot_id:string; target_slot_id:string;
  source_mode:"LOCAL"|"CLOUD"; target_mode:"LOCAL"|"CLOUD";
  execution_generation:number; source_runner_id?:string|null; target_runner_id?:string|null;
  error_code?:string|null; error_detail?:string|null; created_at:string; updated_at:string;
};
type Snapshot = { localAgentMinVersion:string; slots:Slot[]; migrations:Migration[] };

const terminalStates = new Set(["COMPLETED","FAILED","CANCELLED"]);
const stateLabels:Record<string,string> = {
  REQUESTED:"รับคำขอย้ายแล้ว",
  STOPPING_LOCAL:"กำลังยืนยันว่า Local MT5 หยุดจริง",
  STOPPING_CLOUD:"กำลังยืนยันว่า Cloud MT5 หยุดจริง",
  SOURCE_STOP_CONFIRMED:"ยืนยัน Source หยุดแล้ว",
  TARGET_PROVISIONING:"กำลังสร้าง Runtime บน Cloud VPS",
  WAITING_LOCAL_INSTALL:"รอติดตั้ง Local Agent บนคอมพิวเตอร์",
  COMPLETED:"ย้าย Runtime สำเร็จ",
  FAILED:"การย้ายหยุดเพื่อความปลอดภัย",
  CANCELLED:"ยกเลิกแล้ว"
};

export default function RuntimeMigrationPage() {
  const [data,setData]=useState<Snapshot|null>(null);
  const [sourceSlotId,setSourceSlotId]=useState("");
  const [targetSlotId,setTargetSlotId]=useState("");
  const [tradingPassword,setTradingPassword]=useState("");
  const [runnerId,setRunnerId]=useState("");
  const [confirmFlat,setConfirmFlat]=useState(false);
  const [confirmSwitch,setConfirmSwitch]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  async function load() {
    try {
      const result=await api("/runtime-migration/status");
      setData(result);
      setError("");
    } catch(e:any) { setError(String(e?.message||"โหลดสถานะ Runtime ไม่สำเร็จ")); }
  }

  useEffect(()=>{
    if (!localStorage.getItem("bot_token")) { window.location.href="/login"; return; }
    void load();
    const id=window.setInterval(()=>{ if(document.visibilityState==="visible") void load(); },5000);
    return()=>window.clearInterval(id);
  },[]);

  const sourceSlots=useMemo(()=>data?.slots.filter(x=>Boolean(x.instance_id))||[],[data]);
  const source=useMemo(()=>sourceSlots.find(x=>x.id===sourceSlotId)||null,[sourceSlots,sourceSlotId]);
  const targetSlots=useMemo(()=>data?.slots.filter(x=>!x.instance_id && (!source || x.mode!==source.mode))||[],[data,source]);
  const target=useMemo(()=>targetSlots.find(x=>x.id===targetSlotId)||null,[targetSlots,targetSlotId]);
  const activeMigration=useMemo(()=>data?.migrations.find(x=>!terminalStates.has(x.state))||null,[data]);
  const recentMigration=data?.migrations?.[0]||null;
  const requiredAgent=data?.localAgentMinVersion||"1.0.9";
  const sourceFlat=
    Number(source?.positions||0)===0 &&
    Number(source?.pending_orders||0)===0 &&
    source?.desired_state!=="RUNNING" &&
    source?.actual_state==="STOPPED";
  const sourceHeartbeatFresh=source?.mode!=="LOCAL" || Boolean(
    source?.last_seen_at &&
    Date.now()-new Date(String(source.last_seen_at)).getTime()>=0 &&
    Date.now()-new Date(String(source.last_seen_at)).getTime()<=15000
  );

  useEffect(()=>{
    if(source && targetSlotId && !targetSlots.some(x=>x.id===targetSlotId)) setTargetSlotId("");
  },[source,targetSlotId,targetSlots]);

  async function downloadInstaller(slotId:string) {
    if (!slotId) return;
    setBusy(true);setError("");setMessage("");
    try {
      const result=await api("/bot/installers/windows",{method:"POST",body:JSON.stringify({slotId})});
      const code=String(result?.code||"");
      const version=String(result?.installerVersion||requiredAgent);
      if(!code||!version) throw new Error("ยังสร้าง SCENOVA Windows Installer ไม่สำเร็จ");
      const form=document.createElement("form"); form.method="POST"; form.action="/installer-download"; form.style.display="none";
      for(const [name,value] of [["code",code],["version",version]]){
        const input=document.createElement("input"); input.type="hidden"; input.name=name; input.value=value; form.appendChild(input);
      }
      document.body.appendChild(form); form.submit(); window.setTimeout(()=>form.remove(),1000);
      setMessage(`ดาวน์โหลด SCENOVA Windows Agent ${version} แล้ว กรุณาเปิดไฟล์ติดตั้งและรอ Agent Online`);
    } catch(e:any){ setError(String(e?.message||"ดาวน์โหลด Agent ไม่สำเร็จ")); }
    finally{ setBusy(false); }
  }

  async function submit(e:FormEvent) {
    e.preventDefault();
    if(!source||!target) return setError("กรุณาเลือก Source และ Target Runtime");
    if(!sourceFlat) return setError("ต้อง Stop Bot และให้ Position / Pending Order เป็น 0 ก่อน");
    if(!sourceHeartbeatFresh) return setError("รอ MT5 heartbeat ล่าสุดยืนยันสถานะ STOPPED และ Flat ก่อนย้าย");
    setBusy(true);setError("");setMessage("");
    try {
      const result=await api("/runtime-migration/request",{
        method:"POST",
        body:JSON.stringify({
          sourceSlotId:source.id,
          targetSlotId:target.id,
          tradingPassword:target.mode==="CLOUD"?tradingPassword:undefined,
          runnerId:runnerId||undefined,
          confirmFlat,confirmSwitch
        })
      });
      setTradingPassword("");
      setMessage(`เริ่ม Runtime Migration แล้ว · ${stateLabels[result.state]||result.state}`);
      await load();
    } catch(e:any){ setError(String(e?.message||"เริ่ม Runtime Migration ไม่สำเร็จ")); }
    finally{ setBusy(false); }
  }

  return <main className={s.root}>
    <div className={s.topbar}><Link href="/dashboard">← Control Center</Link><span>RUNTIME MIGRATION · PHASE 3</span></div>
    <section className={s.hero}>
      <div><span className={s.kicker}>LOCAL ↔ CLOUD · ZERO DUAL-RUNTIME</span><h1>ย้าย Runtime อย่างปลอดภัย</h1><p>ระบบจะย้าย Bot Instance เดิม ไม่สร้าง Bot ซ้ำ และจะออก Execution Lease ใหม่หลัง Source Runtime หยุดและยืนยันแล้วเท่านั้น</p></div>
      <div className={s.guard}>🛡 ระหว่าง Migration ระบบบล็อก START ที่ฐานข้อมูล จึงไม่สามารถเปิด Local และ Cloud พร้อมกันได้</div>
    </section>

    {error&&<div className={`${s.notice} ${s.bad}`}>{error}</div>}
    {message&&<div className={`${s.notice} ${s.good}`}>{message}</div>}

    {activeMigration?<section className={s.card}>
      <span className={s.kicker}>MIGRATION IN PROGRESS</span>
      <h2>{stateLabels[activeMigration.state]||activeMigration.state}</h2>
      <div className={s.flow}><b>{activeMigration.source_mode}</b><span>→</span><b>{activeMigration.target_mode}</b></div>
      <p>Generation: {activeMigration.execution_generation} · Migration ID: {activeMigration.id}</p>
      {activeMigration.error_detail&&<p className={s.errorText}>{activeMigration.error_detail}</p>}
      {activeMigration.state==="WAITING_LOCAL_INSTALL"&&<div className={s.actionBox}>
        <p>Cloud Runtime ถูกหยุดและ Lease เดิมถูกเพิกถอนแล้ว ขั้นต่อไปคือติดตั้ง Local Agent ใหม่บนเครื่องที่จะใช้งาน</p>
        <button onClick={()=>downloadInstaller(activeMigration.target_slot_id)} disabled={busy}>ดาวน์โหลด Local Agent {requiredAgent}</button>
      </div>}
      {activeMigration.state==="TARGET_PROVISIONING"&&<p className={s.muted}>Worker กำลัง Provision MT5 แบบ STOPPED เมื่อ EA Heartbeat กลับมา ระบบจะปิด Migration อัตโนมัติ</p>}
      <button className={s.secondary} onClick={()=>load()} disabled={busy}>รีเฟรชสถานะ</button>
    </section>:<form className={s.grid} onSubmit={submit}>
      <section className={s.card}>
        <span className={s.kicker}>1 · SOURCE</span><h2>Runtime ปัจจุบัน</h2>
        <label className={s.field}>เลือก Bot Runtime
          <select value={sourceSlotId} onChange={e=>{setSourceSlotId(e.target.value);setTargetSlotId("")}} required>
            <option value="">เลือก Source</option>
            {sourceSlots.map(x=><option key={x.id} value={x.id}>{x.mode} · Slot {x.slot_number} · MT5 {x.account_number||"ยังไม่ผูก"}</option>)}
          </select>
        </label>
        {source&&<div className={s.detail}>
          <p><b>{source.mode}</b> · {source.broker_server||"—"}</p>
          <p>Bot: {source.actual_state||"—"} / {source.desired_state||"—"} · Positions: <b>{Number(source.positions||0)}</b> · Pending: <b>{Number(source.pending_orders||0)}</b></p>
          <p>Generation: {source.execution_generation||1}</p>
          {source.mode==="LOCAL"&&<p>Agent: {source.agent_version||"ไม่พบ"} · เวอร์ชัน Agent ไม่บล็อกการย้ายไป VPS; ระบบยืนยันจาก EA heartbeat ที่ STOPPED/Flat</p>}
          {source.mode==="CLOUD"&&<p>Runner: {source.runner_id||"—"} · Stop state: {source.runtime_stop_state||"NONE"}</p>}
        </div>}
      </section>

      <section className={s.card}>
        <span className={s.kicker}>2 · TARGET</span><h2>Runtime ปลายทาง</h2>
        <label className={s.field}>เลือก Slot ปลายทาง
          <select value={targetSlotId} onChange={e=>setTargetSlotId(e.target.value)} required disabled={!source}>
            <option value="">เลือก Target</option>
            {targetSlots.map(x=><option key={x.id} value={x.id}>{x.mode} · Slot {x.slot_number} · {x.label||x.status}</option>)}
          </select>
        </label>
        {target?.mode==="CLOUD"&&<>
          <label className={s.field}>MT5 Trading Password<input type="password" value={tradingPassword} onChange={e=>setTradingPassword(e.target.value)} required autoComplete="off"/></label>
          <label className={s.field}>Runner ID <small>Owner/Admin test เท่านั้น; ลูกค้าปกติใช้ VPS ที่จองจาก Cloud package</small><input value={runnerId} onChange={e=>setRunnerId(e.target.value)} placeholder="เว้นว่างสำหรับลูกค้าปกติ"/></label>
        </>}
        {target?.mode==="LOCAL"&&<p className={s.muted}>หลัง Cloud Worker ยืนยันการหยุด ระบบจะ revoke Cloud Lease และให้ดาวน์โหลด Local Agent ใหม่สำหรับ Slot นี้</p>}
      </section>

      <section className={`${s.card} ${s.confirmCard}`}>
        <span className={s.kicker}>3 · SAFETY CONFIRMATION</span><h2>ยืนยันก่อน Handoff</h2>
        <label className={s.confirm}><input type="checkbox" checked={confirmFlat} onChange={e=>setConfirmFlat(e.target.checked)}/><span>Bot อยู่ในสถานะ Stop และ Position = 0</span></label>
        <label className={s.confirm}><input type="checkbox" checked={confirmSwitch} onChange={e=>setConfirmSwitch(e.target.checked)}/><span>เข้าใจว่า Runtime เดิมจะถูกปิดและ Execution Lease เดิมจะถูกเพิกถอนก่อนเปิดปลายทาง</span></label>
        <button className={s.primary} disabled={busy||!source||!target||!sourceFlat||!sourceAgentReady||!confirmFlat||!confirmSwitch}>{busy?"กำลังตรวจสอบ...":`ย้าย ${source?.mode||"Runtime"} → ${target?.mode||"Target"}`}</button>
        {!sourceFlat&&source&&<p className={s.errorText}>ยังย้ายไม่ได้: Bot ต้องไม่ RUNNING และ Position ต้องเป็น 0</p>}
      </section>
    </form>}

    {recentMigration&&terminalStates.has(recentMigration.state)&&<section className={s.history}>
      <b>ล่าสุด: {stateLabels[recentMigration.state]||recentMigration.state}</b><span>{recentMigration.source_mode} → {recentMigration.target_mode}</span>
      {recentMigration.error_detail&&<small>{recentMigration.error_detail}</small>}
    </section>}
  </main>;
}
