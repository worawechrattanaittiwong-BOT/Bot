"use client";

import { useEffect, useState } from "react";
import { adminApi } from "../lib/api";
import { useSystemPopup } from "./SystemPopupProvider";
import { Badge, date } from "./CloudConsole";
import s from "./cloud.module.css";

type UpdateJob = {
  id:string;
  runner_id:string;
  action:"UPDATE"|"ROLLBACK";
  source_job_id:string|null;
  state:string;
  target_version:string|null;
  target_sha256:string|null;
  total:number;
  waiting_safe:number;
  delivered:number;
  verifying:number;
  completed:number;
  failed:number;
  created_at:string;
  completed_at:string|null;
};

type RunnerUpdateStatus = {
  total:number;
  current:number;
  outdated:number;
  unknown:number;
  ahead:number;
  updateAvailable:boolean;
};

type UpdateSnapshot = {
  currentRelease:{version:string;sha256:string;runtimeContract:string}|null;
  runnerStatus:Record<string,RunnerUpdateStatus>;
  jobs:UpdateJob[];
};

export function CloudUpdatesPanel({nodes}:{nodes:any[]}) {
  const { confirmPopup } = useSystemPopup();
  const [data,setData]=useState<UpdateSnapshot|null>(null);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  async function load() {
    try {
      const result=await adminApi("/admin/cloud-updates");
      setData(result);
      setError("");
    } catch(e:any) {
      setError(e.message);
    }
  }

  useEffect(()=>{
    load();
    const timer=setInterval(()=>{if(!document.hidden)load();},10000);
    return()=>clearInterval(timer);
  },[]);

  async function start(runnerId:string) {
    const ok=await confirmPopup({
      title:"ปล่อย EA Update ให้ลูกค้า",
      tone:"warning",
      message:"เตรียม EA เวอร์ชันล่าสุดบน "+runnerId+"? บัญชีที่กำลังเทรดจะไม่ถูกหยุด ระบบจะรอให้ลูกค้าแต่ละบัญชีกด Stop และ Position เป็น 0 แล้วอัปเดตบัญชีนั้นอัตโนมัติ",
      confirmLabel:"สร้างคิวอัปเดต"
    });
    if(!ok)return;

    setBusy(runnerId);setError("");setNotice("");
    try{
      await adminApi("/admin/cloud-updates",{
        method:"POST",
        body:JSON.stringify({runnerId})
      });
      setNotice("สร้างคิว EA Update บน "+runnerId+" แล้ว · บัญชีที่กำลังรันจะอัปเดตเมื่อผู้ใช้กด Stop");
      await load();
    }catch(e:any){setError(e.message);}
    finally{setBusy("");}
  }

  async function rollback(job:UpdateJob) {
    const ok=await confirmPopup({
      title:"Rollback EA",
      tone:"warning",
      message:"ย้อน EA ของ "+job.runner_id+" กลับจาก Backup ของงานนี้? บัญชีที่กำลังรันจะไม่ถูกหยุด และจะ Rollback เฉพาะเมื่อผู้ใช้กด Stop จนบัญชีนั้นปลอด Position",
      confirmLabel:"เริ่ม Rollback"
    });
    if(!ok)return;

    setBusy(job.id);setError("");setNotice("");
    try{
      await adminApi("/admin/cloud-updates/"+encodeURIComponent(job.id)+"/rollback",{
        method:"POST",
        body:JSON.stringify({})
      });
      setNotice("เริ่ม Rollback บน "+job.runner_id+" แล้ว");
      await load();
    }catch(e:any){setError(e.message);}
    finally{setBusy("");}
  }

  const release=data?.currentRelease;
  return <div className={s.split}>
    <section className={s.panel}>
      <div className={s.panelHead}>
        <div><span className={s.eyebrow}>PHASE 6 / FLEET UPDATE</span><h3>Production EA</h3></div>
        <Badge tone={release?"good":"warn"}>{release?"v"+release.version:"Artifact ไม่พร้อม"}</Badge>
      </div>
      <div className={s.panelBody+" "+s.form}>
        {error&&<div role="alert" className={s.notice+" "+s.error}>{error}</div>}
        {notice&&<div role="status" className={s.notice+" "+s.success}>{notice}</div>}
        {release?<>
          <p className={s.muted}>SHA256 <code>{release.sha256.slice(0,16)}…</code><br/>Runtime Contract: {release.runtimeContract}</p>
          <p className={s.muted}>Deferred Update ไม่รบกวนบัญชีที่กำลังเทรด ลูกค้าจะเห็นแจ้งเตือนบน Control Center และเมื่อกด Stop จน Position เป็น 0 ระบบจะอัปเดตเฉพาะ MT5 บัญชีนั้น จากนั้นคงสถานะหยุดไว้จนลูกค้ากด Start เอง</p>
        </>:<p className={s.muted}>Backend ยังไม่พบ EA production artifact จึงยังเริ่ม Fleet Update ไม่ได้</p>}
        <div className={s.nodes}>
          {nodes.map(n=>{
            const status=data?.runnerStatus?.[n.runner_id];
            const hasRealUpdate=Boolean(release&&status?.updateAvailable);
            const waitingVersion=Boolean(release&&status&&status.total>0&&status.outdated===0&&status.unknown>0);
            return <section key={n.runner_id} className={s.nodeCard}>
              <div className={s.nodeHead}><div><h3>▤ {n.runner_id}</h3><span className={s.nodeMeta}>Worker {n.telemetry?.version||"—"}</span></div><Badge tone={n.health==="ONLINE"?"good":"warn"}>{n.health}</Badge></div>
              {hasRealUpdate
                ?<button
                  className={s.button+" "+s.primary}
                  disabled={n.health!=="ONLINE"||Boolean(busy)}
                  onClick={()=>start(n.runner_id)}
                >{busy===n.runner_id?"กำลังสร้างคิว…":"ปล่อย EA Update"}</button>
                :waitingVersion
                  ?<><Badge tone="warn">รอตรวจสอบเวอร์ชัน EA</Badge><span className={s.nodeMeta}>ยังไม่มีข้อมูลเวอร์ชันจาก {status?.unknown||0} บัญชี จึงไม่สร้างคิวซ้ำ</span></>
                  :release&&status&&status.total>0
                    ?<><Badge tone="good">EA ล่าสุดแล้ว</Badge><span className={s.nodeMeta}>ไม่มีอัปเดตใหม่สำหรับ Server นี้</span></>
                    :release
                      ?<span className={s.nodeMeta}>ยังไม่มี Cloud MT5 ที่ต้องอัปเดต</span>
                      :null}
            </section>;
          })}
        </div>
      </div>
    </section>

    <section className={s.panel}>
      <div className={s.panelHead}><div><span className={s.eyebrow}>UPDATE HISTORY</span><h3>งานอัปเดตล่าสุด</h3></div><button className={s.button} onClick={load} disabled={Boolean(busy)}>↻</button></div>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead><tr><th>SERVER / ACTION</th><th>PROGRESS</th><th>STATUS</th><th>เวลา</th><th></th></tr></thead>
          <tbody>
            {(data?.jobs||[]).map(job=><tr key={job.id}>
              <td><b>{job.runner_id}</b><small>{job.action+(job.target_version?" → v"+job.target_version:"")}</small></td>
              <td>{job.completed} / {job.total}<small>รอ Safe {job.waiting_safe} · Verify {job.verifying} · Fail {job.failed}</small></td>
              <td><Badge tone={job.state==="COMPLETED"?"good":job.state==="RUNNING"?"warn":job.failed>0?"bad":""}>{job.state}</Badge></td>
              <td>{date(job.created_at)}</td>
              <td>{job.action==="UPDATE"&&job.completed>0&&job.state!=="RUNNING"
                ?<button className={s.button} disabled={Boolean(busy)} onClick={()=>rollback(job)}>Rollback</button>
                :"—"}</td>
            </tr>)}
          </tbody>
        </table>
        {!data?.jobs?.length&&<div className={s.empty}><b>ยังไม่มี Fleet Update</b><p>เลือก Server แล้วเริ่ม Safe Update เมื่อพร้อม</p></div>}
      </div>
    </section>
  </div>;
}
