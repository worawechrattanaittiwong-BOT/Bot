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

function nodeStatus(node:any) {
  if (node.quarantined) return "พักเครื่อง";
  const reason=String(node.capacity_block_reason||"");
  if (reason==="WORKER_OFFLINE") return "ออฟไลน์";
  if (reason==="DISK_LOW") return "Disk เหลือน้อย";
  if (reason==="CPU_HIGH") return "CPU สูง";
  if (reason==="RAM_HIGH") return "RAM สูง";
  if (reason==="TEMPLATE_NOT_READY") return "MT5 ยังไม่พร้อม";
  if (node.capacity_blocked) return "ต้องตรวจสอบ";
  return "ปกติ";
}

function incidentName(category:any) {
  const value=String(category||"");
  if (value==="WORKER_OFFLINE") return "VPS ออฟไลน์";
  if (value==="WORKER_CAPACITY") return "ทรัพยากร VPS";
  if (value==="EA_HEARTBEAT_STALE") return "EA ไม่ตอบสนอง";
  if (value==="RECOVERY_CIRCUIT_OPEN") return "Recovery หยุดชั่วคราว";
  return value || "เหตุการณ์ระบบ";
}

function severityName(value:any) {
  const severity=String(value||"").toUpperCase();
  if (severity==="CRITICAL") return "วิกฤต";
  if (severity==="WARN") return "เตือน";
  return "ข้อมูล";
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
  const blockedNodes=data ? data.nodes.filter(x=>x.capacity_blocked||x.quarantined) : [];
  const recoveryCircuits=data ? data.recoveries.filter(x=>x.cloud_recovery_state==="CIRCUIT_OPEN") : [];
  const activeRecoveries=data ? data.recoveries.filter(x=>String(x.cloud_recovery_state||"IDLE")!=="IDLE") : [];

  return <div className="app-wrap owner-app">
    <OwnerSidebar activeKey="cloud-hardening" onLogout={logout}/>

    <main className={`main app-main owner-main ${s.shellMain}`}>
      <div className={s.root}>
        <div className="mobile-only mobile-app-head">
          <div className="brand-lockup scenova-brand-lockup"><ScenovaBrand className="scenova-brand-logo-mobile"/></div>
          <button className="btn ghost" onClick={logout}>ออก</button>
        </div>
        <OwnerMobileNav activeKey="cloud-hardening"/>

        {!data ? <div className={s.card}>{error||"กำลังโหลด Cloud Protection…"}</div> : <>
          <header className={s.header}>
            <div><h1>Cloud Protection</h1><p>สถานะความปลอดภัยและการควบคุมฉุกเฉินของ Cloud</p></div>
            <div className={s.actions}><Link href="/admin?view=workers" className={s.button}>← Cloud Console</Link><button className={s.button} onClick={load}>↻ รีเฟรช</button></div>
          </header>

          {error&&<div className={`${s.notice} ${s.bad}`}>{error}</div>}
          {notice&&<div className={`${s.notice} ${s.good}`}>{notice}</div>}

          <section className={s.grid}>
            <div className={s.card}><small>ปัญหาที่ต้องจัดการ</small><strong>{openIncidents.length}</strong><p>{openIncidents.length?"มีรายการที่ต้องตรวจสอบ":"ระบบปกติ"}</p></div>
            <div className={s.card}><small>VPS ที่ถูกพัก</small><strong>{blockedNodes.length}</strong><p>{blockedNodes.length?"มีเครื่องที่ถูกบล็อก":"ทุกเครื่องพร้อมใช้งาน"}</p></div>
            <div className={s.card}><small>Recovery ที่หยุด</small><strong>{recoveryCircuits.length}</strong><p>{recoveryCircuits.length?"มีบัญชีรอตรวจสอบ":"Recovery ปกติ"}</p></div>
          </section>

          <section className={s.panel}>
            <div className={s.panelHead}><h2>การควบคุมฉุกเฉิน</h2><div className={s.statusLine}><span>เพิ่มลูกค้า <b>{data.controls?.cloud_provisioning_paused?"พัก":"เปิด"}</b></span><span>Recovery <b>{data.controls?.cloud_recovery_paused?"พัก":"เปิด"}</b></span></div></div>
            <label className={s.field}>หมายเหตุ<input value={reason} onChange={e=>setReason(e.target.value)} maxLength={240} placeholder="ระบุเหตุผลเมื่อพักระบบ"/></label>
            <div className={s.actions}>
              <button disabled={!!busy} className={s.danger} onClick={()=>saveControls(true,true)}>หยุดเพิ่มลูกค้า + Recovery</button>
              <button disabled={!!busy} className={s.button} onClick={()=>saveControls(true,false)}>หยุดเพิ่มลูกค้า</button>
              <button disabled={!!busy} className={s.primary} onClick={()=>saveControls(false,false)}>เปิดระบบกลับ</button>
            </div>
            <p className={s.updated}>อัปเดตล่าสุด {fmt(data.controls?.updated_at)}</p>
          </section>

          <section className={s.panel}><div className={s.panelHead}><h2>สถานะ VPS</h2><span className={s.panelMeta}>{data.nodes.length} เครื่อง</span></div>
            <div className={s.tableWrap}><table><thead><tr><th>VPS</th><th>สถานะ</th><th>ทรัพยากร</th><th>บัญชี</th><th>จัดการ</th></tr></thead><tbody>
              {data.nodes.map(node=><tr key={node.runner_id}><td><b>{node.runner_id}</b><small>{node.region}</small></td><td><span className={node.quarantined||node.capacity_blocked?s.badgeBad:s.badgeGood}>{nodeStatus(node)}</span></td><td>CPU {node.telemetry?.cpuPercent??"—"}% · RAM {node.telemetry?.ramUsedGb??"—"}/{node.telemetry?.ramTotalGb??"—"} GB<small>Disk {node.telemetry?.diskFreeGb??"—"} GB ว่าง</small></td><td>{Math.max(Number(node.occupied||0),Number(node.active_instances||0))} / {node.capacity}</td><td><button disabled={!!busy} className={node.quarantined?s.button:s.danger} onClick={()=>quarantine(node,!node.quarantined)}>{node.quarantined?"เปิดใช้งาน":"พักเครื่อง"}</button></td></tr>)}
            </tbody></table></div>
          </section>

          <section className={s.panel}><div className={s.panelHead}><h2>เหตุการณ์ที่ต้องตรวจสอบ</h2><span className={s.panelMeta}>{openIncidents.length} รายการ</span></div>
            {openIncidents.length===0
              ? <div className={s.emptyState}>✓ ไม่มีปัญหาที่ต้องจัดการ</div>
              : <div className={s.tableWrap}><table><thead><tr><th>ระดับ</th><th>ปัญหา</th><th>เป้าหมาย</th><th>พบล่าสุด</th></tr></thead><tbody>
                  {openIncidents.map(item=><tr key={item.id}><td><span className={item.severity==="CRITICAL"?s.badgeBad:s.badgeWarn}>{severityName(item.severity)}</span></td><td>{incidentName(item.category)}</td><td>{item.runner_id||item.bot_instance_id||"—"}</td><td>{fmt(item.last_seen_at)}</td></tr>)}
                </tbody></table></div>}
          </section>

          <section className={s.panel}><div className={s.panelHead}><h2>Recovery ที่ต้องตรวจสอบ</h2><span className={s.panelMeta}>{activeRecoveries.length} รายการ</span></div>
            {activeRecoveries.length===0
              ? <div className={s.emptyState}>✓ ไม่มีรายการ Recovery ที่ต้องดำเนินการ</div>
              : <div className={s.tableWrap}><table><thead><tr><th>บัญชี</th><th>VPS</th><th>สถานะ</th><th>ครั้ง</th><th>ครั้งถัดไป</th><th>จัดการ</th></tr></thead><tbody>
                  {activeRecoveries.map(item=><tr key={item.id}><td>{item.user_code||"—"}<small>{item.account_number||item.id}</small></td><td>{item.runner_id||"—"}</td><td>{item.cloud_recovery_state}</td><td>{item.cloud_recovery_attempts}</td><td>{fmt(item.cloud_recovery_next_at)}</td><td><button className={s.button} disabled={!!busy} onClick={()=>resetRecovery(item)}>รีเซ็ต Recovery</button></td></tr>)}
                </tbody></table></div>}
          </section>
        </>}
      </div>
    </main>
  </div>;
}
