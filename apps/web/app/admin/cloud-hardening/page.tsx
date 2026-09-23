"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminApi } from "../../../lib/api";
import { OwnerMobileNav, OwnerSidebar } from "../../../components/OwnerSidebar";
import { ScenovaBrand } from "../../../components/ScenovaBrand";
import { useSystemPopup } from "../../../components/SystemPopupProvider";
import s from "./page.module.css";

type Snapshot = {
  controls:any;
  nodes:any[];
  incidents:any[];
  recoveries:any[];
};

function fmt(value:any) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("th-TH") : "—";
}

export default function CloudHardeningPage() {
  const { confirmPopup } = useSystemPopup();
  const [data,setData]=useState<Snapshot|null>(null);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState("");
  const [reason,setReason]=useState("");

  async function load() {
    try {
      setData(await adminApi("/admin/production-hardening"));
      setError("");
    } catch(e:any) { setError(e.message || "โหลดข้อมูลไม่สำเร็จ"); }
  }

  useEffect(()=>{
    if (!localStorage.getItem("bot_token")) { window.location.href="/login"; return; }
    void load();
    const timer=window.setInterval(()=>{ if (!document.hidden) void load(); },15000);
    return()=>window.clearInterval(timer);
  },[]);

  function logout() {
    localStorage.removeItem("bot_token");
    window.location.href="/login";
  }

  async function saveControls(provisioning:boolean,recovery:boolean) {
    setBusy("controls");setError("");setNotice("");
    try {
      const result=await adminApi("/admin/production-hardening/controls",{
        method:"POST",
        body:JSON.stringify({cloudProvisioningPaused:provisioning,cloudRecoveryPaused:recovery,reason})
      });
      setData(result);setNotice("อัปเดต Production Controls แล้ว");
    } catch(e:any) { setError(e.message); }
    finally { setBusy(""); }
  }

  async function quarantine(node:any,next:boolean) {
    const text=next
      ? `Quarantine ${node.runner_id}? ระบบจะหยุดรับงานใหม่และหยุด Auto-Recovery ใหม่บน VPS นี้ แต่จะไม่ kill MT5 ที่กำลังรันอยู่`
      : `ปลด Quarantine ${node.runner_id}? ระบบยังจะไม่เปิดรับลูกค้าใหม่จนกว่าจะเปิดจาก Cloud Console`;
    const confirmed=await confirmPopup({
      title:next ? "ยืนยัน Quarantine VPS" : "ยืนยันปลด Quarantine",
      tone:"warning",
      message:text,
      confirmLabel:next ? "Quarantine" : "ปลด Quarantine"
    });
    if (!confirmed) return;
    setBusy("node:"+node.runner_id);setError("");setNotice("");
    try {
      await adminApi(`/admin/production-hardening/nodes/${encodeURIComponent(node.runner_id)}/quarantine`,{
        method:"POST",body:JSON.stringify({quarantined:next,reason})
      });
      await load();setNotice(next?"Quarantine VPS แล้ว":"ปลด Quarantine แล้ว");
    } catch(e:any) { setError(e.message); }
    finally { setBusy(""); }
  }

  async function resetRecovery(instance:any) {
    const confirmed=await confirmPopup({
      title:"Reset Recovery Circuit",
      tone:"warning",
      message:`Reset recovery circuit ของ ${instance.account_number||instance.id}? คำสั่งนี้ไม่ Start MT5 เอง แต่เปิดให้ Worker ขอ recovery ใหม่ได้`,
      confirmLabel:"Reset circuit"
    });
    if (!confirmed) return;
    setBusy("recovery:"+instance.id);setError("");setNotice("");
    try {
      await adminApi(`/admin/production-hardening/instances/${instance.id}/recovery-reset`,{method:"POST"});
      await load();setNotice("Reset recovery circuit แล้ว");
    } catch(e:any) { setError(e.message); }
    finally { setBusy(""); }
  }

  const openIncidents=data ? data.incidents.filter(x=>x.state==="OPEN") : [];

  return <div className="app-wrap owner-app">
    <OwnerSidebar activeKey="cloud-hardening" onLogout={logout}/>

    <main className={`main app-main owner-main ${s.shellMain}`}>
      <div className={s.root}>
        <div className="mobile-only mobile-app-head">
          <div className="brand-lockup scenova-brand-lockup"><ScenovaBrand className="scenova-brand-logo-mobile"/></div>
          <button className="btn ghost" onClick={logout}>ออก</button>
        </div>
        <OwnerMobileNav activeKey="cloud-hardening"/>

        {!data ? <div className={s.card}>{error||"กำลังโหลด Production Hardening…"}</div> : <>
          <header className={s.header}>
            <div><span className={s.kicker}>SCENOVA CLOUD / PHASE 4</span><h1>Production Hardening</h1><p>Health Guard, bounded Auto-Recovery, incidents และ emergency quarantine</p></div>
            <div className={s.actions}><Link href="/admin?view=workers" className={s.button}>← Cloud Console</Link><button className={s.button} onClick={load}>↻ Refresh</button></div>
          </header>

          {error&&<div className={`${s.notice} ${s.bad}`}>{error}</div>}
          {notice&&<div className={`${s.notice} ${s.good}`}>{notice}</div>}

          <section className={s.grid}>
            <div className={s.card}><small>OPEN INCIDENTS</small><strong>{openIncidents.length}</strong><p>Critical/Warn ที่ยังไม่ resolved</p></div>
            <div className={s.card}><small>VPS BLOCKED</small><strong>{data.nodes.filter(x=>x.capacity_blocked||x.quarantined).length}</strong><p>Health Guard หรือ Quarantine</p></div>
            <div className={s.card}><small>RECOVERY CIRCUITS</small><strong>{data.recoveries.filter(x=>x.cloud_recovery_state==="CIRCUIT_OPEN").length}</strong><p>Instance ที่หยุด auto-retry ชั่วคราว</p></div>
          </section>

          <section className={s.panel}>
            <div className={s.panelHead}><div><span className={s.kicker}>GLOBAL CONTROLS</span><h2>Emergency Controls</h2></div></div>
            <p className={s.muted}>Pause จะไม่ kill terminal ที่กำลังทำงานอยู่ และไม่เปลี่ยน Execution Generation</p>
            <label className={s.field}>เหตุผล / Incident note<input value={reason} onChange={e=>setReason(e.target.value)} maxLength={240} placeholder="เช่น VPS provider incident / disk maintenance"/></label>
            <div className={s.actions}>
              <button disabled={!!busy} className={s.danger} onClick={()=>saveControls(true,true)}>Pause Provisioning + Recovery</button>
              <button disabled={!!busy} className={s.button} onClick={()=>saveControls(true,false)}>Pause Provisioning เท่านั้น</button>
              <button disabled={!!busy} className={s.primary} onClick={()=>saveControls(false,false)}>Resume Controls</button>
            </div>
            <p className={s.muted}>Provisioning: {data.controls?.cloud_provisioning_paused?"PAUSED":"ACTIVE"} · Recovery: {data.controls?.cloud_recovery_paused?"PAUSED":"ACTIVE"} · Updated {fmt(data.controls?.updated_at)}</p>
          </section>

          <section className={s.panel}><div className={s.panelHead}><div><span className={s.kicker}>VPS FLEET</span><h2>Capacity & Quarantine</h2></div></div>
            <div className={s.tableWrap}><table><thead><tr><th>Runner</th><th>Health</th><th>CPU / RAM / Disk</th><th>MT5</th><th>Action</th></tr></thead><tbody>
              {data.nodes.map(node=><tr key={node.runner_id}><td><b>{node.runner_id}</b><small>{node.region}</small></td><td><span className={node.quarantined||node.capacity_blocked?s.badgeBad:s.badgeGood}>{node.quarantined?"QUARANTINED":node.capacity_blocked?(node.capacity_block_reason||"BLOCKED"):(node.health_state||"UNKNOWN")}</span></td><td>{node.telemetry?.cpuPercent??"—"}% · {node.telemetry?.ramUsedGb??"—"}/{node.telemetry?.ramTotalGb??"—"} GB<small>Disk free {node.telemetry?.diskFreeGb??"—"} GB</small></td><td>{Math.max(Number(node.occupied||0),Number(node.active_instances||0))} / {node.capacity}</td><td><button disabled={!!busy} className={node.quarantined?s.button:s.danger} onClick={()=>quarantine(node,!node.quarantined)}>{node.quarantined?"ปลด Quarantine":"Quarantine"}</button></td></tr>)}
            </tbody></table></div>
          </section>

          <section className={s.panel}><div className={s.panelHead}><div><span className={s.kicker}>INCIDENT LEDGER</span><h2>Runtime Incidents</h2></div></div>
            <div className={s.tableWrap}><table><thead><tr><th>State</th><th>Severity</th><th>Category</th><th>Target</th><th>Last seen</th></tr></thead><tbody>
              {data.incidents.map(item=><tr key={item.id}><td>{item.state}</td><td>{item.severity}</td><td>{item.category}</td><td>{item.runner_id||item.bot_instance_id||"—"}</td><td>{fmt(item.last_seen_at)}</td></tr>)}
            </tbody></table></div>
          </section>

          <section className={s.panel}><div className={s.panelHead}><div><span className={s.kicker}>AUTO RECOVERY</span><h2>Recovery Circuits</h2></div></div>
            <div className={s.tableWrap}><table><thead><tr><th>Account</th><th>Runner</th><th>State</th><th>Attempts</th><th>Next</th><th>Action</th></tr></thead><tbody>
              {data.recoveries.map(item=><tr key={item.id}><td>{item.user_code||"—"}<small>{item.account_number||item.id}</small></td><td>{item.runner_id||"—"}</td><td>{item.cloud_recovery_state}</td><td>{item.cloud_recovery_attempts}</td><td>{fmt(item.cloud_recovery_next_at)}</td><td><button className={s.button} disabled={!!busy||item.cloud_recovery_state==="IDLE"} onClick={()=>resetRecovery(item)}>Reset circuit</button></td></tr>)}
            </tbody></table></div>
          </section>
        </>}
      </div>
    </main>
  </div>;
}
