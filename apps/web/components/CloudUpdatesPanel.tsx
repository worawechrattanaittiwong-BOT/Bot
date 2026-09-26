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

type UpdateSnapshot = {
  currentRelease:{version:string;sha256:string;runtimeContract:string}|null;
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
      title:"เริ่ม Safe EA Update",
      tone:"warning",
      message:"อัปเดต EA บน "+runnerId+"? บัญชีที่กำลังเทรดจะเข้า Safe Stop รอ Position เป็น 0 แล้ว Worker จะอัปเดตทีละ MT5 และตรวจเวอร์ชันหลัง Restart",
      confirmLabel:"เริ่ม Safe Update"
    });
    if(!ok)return;

    setBusy(runnerId);setError("");setNotice("");
    try{
      await adminApi("/admin/cloud-updates",{
        method:"POST",
        body:JSON.stringify({runnerId})
      });
      setNotice("เริ่ม Safe Update บน "+runnerId+" แล้ว");
      await load();
    }catch(e:any){setError(e.message);}
    finally{setBusy("");}
  }

  async function rollback(job:UpdateJob) {
    const ok=await confirmPopup({
      title:"Rollback EA",
      tone:"warning",
      message:"ย้อน EA ของ "+job.runner_id+" กลับจาก Backup ของงานนี้? ระบบจะใช้ Safe Stop และทำทีละ MT5 เช่นเดียวกับ Update",
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
          <p className={s.muted}>Safe Update จะหยุดการเปิดรอบใหม่ก่อน รอ Position ของ SCENOVA เป็น 0 แล้วค่อยอัปเดตทีละ MT5 หากลูกค้ากดหยุดเองระหว่าง Update ระบบจะไม่เปิดบอทกลับเอง</p>
        </>:<p className={s.muted}>Backend ยังไม่พบ EA production artifact จึงยังเริ่ม Fleet Update ไม่ได้</p>}
        <div className={s.nodes}>
          {nodes.map(n=><section key={n.runner_id} className={s.nodeCard}>
            <div className={s.nodeHead}><div><h3>▤ {n.runner_id}</h3><span className={s.nodeMeta}>Worker {n.telemetry?.version||"—"}</span></div><Badge tone={n.health==="ONLINE"?"good":"warn"}>{n.health}</Badge></div>
            <button
              className={s.button+" "+s.primary}
              disabled={!release||n.health!=="ONLINE"||Boolean(busy)}
              onClick={()=>start(n.runner_id)}
            >{busy===n.runner_id?"กำลังเริ่ม…":"Safe Update EA"}</button>
          </section>)}
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
