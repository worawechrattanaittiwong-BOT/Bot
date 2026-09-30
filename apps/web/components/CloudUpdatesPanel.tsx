"use client";

import { useEffect, useMemo, useState } from "react";
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

type RunnerUiState =
  | "READY"
  | "CREATING"
  | "WAITING_SAFE"
  | "DELIVERING"
  | "VERIFYING"
  | "CURRENT"
  | "UNKNOWN"
  | "EMPTY"
  | "OFFLINE";

function jobTone(job:UpdateJob) {
  if(job.failed>0 || job.state==="FAILED") return "bad";
  if(job.state==="COMPLETED") return "good";
  if(job.state==="RUNNING") return "warn";
  return "";
}

function jobLabel(job:UpdateJob) {
  if(job.failed>0 || job.state==="FAILED") return "ล้มเหลว";
  if(job.state==="COMPLETED") return "เสร็จแล้ว";
  if(job.verifying>0) return "กำลัง Verify";
  if(job.waiting_safe>0) return "รอ Safe Stop";
  if(job.delivered>0) return "กำลังติดตั้ง";
  if(job.state==="RUNNING") return job.action==="ROLLBACK" ? "กำลัง Rollback" : "กำลังอัปเดต";
  return job.state;
}

function runnerStateLabel(state:RunnerUiState,activeJob?:UpdateJob) {
  switch(state) {
    case "READY": return "พร้อมปล่อย";
    case "CREATING": return "กำลังปล่อย";
    case "WAITING_SAFE": return "รอ Safe Stop";
    case "DELIVERING": return activeJob?.action==="ROLLBACK" ? "กำลัง Rollback" : "กำลังติดตั้ง";
    case "VERIFYING": return "กำลัง Verify";
    case "CURRENT": return "EA ล่าสุดแล้ว";
    case "UNKNOWN": return "รอตรวจสอบ EA";
    case "EMPTY": return "ไม่มี Cloud MT5";
    case "OFFLINE": return "Server Offline";
  }
}

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

  const activeByRunner=useMemo(()=>{
    const map=new Map<string,UpdateJob>();
    for(const job of data?.jobs||[]) {
      if(job.state!=="RUNNING" || map.has(job.runner_id)) continue;
      map.set(job.runner_id,job);
    }
    return map;
  },[data?.jobs]);

  async function start(runnerId:string) {
    const release=data?.currentRelease;
    const activeJob=activeByRunner.get(runnerId);
    const canSupersede=Boolean(
      release &&
      activeJob &&
      activeJob.action==="UPDATE" &&
      activeJob.target_version &&
      activeJob.target_version!==release.version &&
      activeJob.delivered===0 &&
      activeJob.verifying===0 &&
      activeJob.waiting_safe>0
    );
    if(busy || (activeJob && !canSupersede)) return;

    setBusy(runnerId);
    setError("");
    setNotice("");
    try{
      const ok=await confirmPopup({
        title:canSupersede
          ? "แทนคิวเก่าด้วย EA v"+release?.version
          : "ปล่อย EA Update ให้ลูกค้า",
        tone:"warning",
        message:canSupersede
          ? "ยกเลิกเฉพาะคิว "+activeJob?.target_version+" ที่ยังรอ Safe Stop และแทนด้วย v"+release?.version+"? บัญชีที่กำลังเทรดจะไม่ถูกหยุด และเมื่อกด Stop จะอัปเดตตรงเป็นเวอร์ชันล่าสุด"
          : "เตรียม EA เวอร์ชันล่าสุดบน "+runnerId+"? บัญชีที่กำลังเทรดจะไม่ถูกหยุด ระบบจะรอให้ลูกค้าแต่ละบัญชีกด Stop และ Position เป็น 0 แล้วอัปเดตบัญชีนั้นอัตโนมัติ",
        confirmLabel:canSupersede ? "แทนด้วยเวอร์ชันล่าสุด" : "ปล่อยอัปเดต"
      });
      if(!ok)return;

      await adminApi("/admin/cloud-updates",{
        method:"POST",
        body:JSON.stringify({runnerId})
      });
      setNotice(
        canSupersede
          ? "แทนคิวเก่าบน "+runnerId+" ด้วย EA v"+release?.version+" แล้ว · บัญชีที่หยุดภายหลังจะอัปเดตตรงเป็นเวอร์ชันล่าสุด"
          : "ปล่อย EA Update บน "+runnerId+" แล้ว · ระบบจะดำเนินการทีละบัญชีเมื่อเข้าสู่ Safe State"
      );
      await load();
    }catch(e:any){
      setError(e.message);
      await load();
    }finally{
      setBusy("");
    }
  }

  async function rollback(job:UpdateJob) {
    if(busy || activeByRunner.has(job.runner_id)) return;

    setBusy(job.id);
    setError("");
    setNotice("");
    try{
      const ok=await confirmPopup({
        title:"Rollback EA",
        tone:"warning",
        message:"ย้อน EA ของ "+job.runner_id+" กลับจาก Backup ของงานนี้? บัญชีที่กำลังรันจะไม่ถูกหยุด และจะ Rollback เฉพาะเมื่อผู้ใช้กด Stop จนบัญชีนั้นปลอด Position",
        confirmLabel:"เริ่ม Rollback"
      });
      if(!ok)return;

      await adminApi("/admin/cloud-updates/"+encodeURIComponent(job.id)+"/rollback",{
        method:"POST",
        body:JSON.stringify({})
      });
      setNotice("เริ่ม Rollback บน "+job.runner_id+" แล้ว");
      await load();
    }catch(e:any){
      setError(e.message);
      await load();
    }finally{
      setBusy("");
    }
  }

  const release=data?.currentRelease;
  const runningJobs=(data?.jobs||[]).filter(job=>job.state==="RUNNING").length;
  const updateTargets=Object.values(data?.runnerStatus||{}).reduce(
    (sum,status)=>sum+Math.max(0,status.outdated||0),
    0
  );

  return <div className={s.updateWorkspace}>
    <section className={s.updateLeft}>
      <div className={s.updateSummaryCard}>
        <div className={s.updateSummaryHead}>
          <div>
            <span className={s.eyebrow}>PHASE 6 / FLEET UPDATE</span>
            <h3>Production EA</h3>
          </div>
          <Badge tone={release?"good":"warn"}>{release?"v"+release.version:"Artifact ไม่พร้อม"}</Badge>
        </div>

        {error&&<div role="alert" className={s.notice+" "+s.error}>{error}</div>}
        {notice&&<div role="status" className={s.notice+" "+s.success}>{notice}</div>}

        {release ? <>
          <div className={s.releaseFacts}>
            <div><span>SHA256</span><code>{release.sha256.slice(0,16)}…</code></div>
            <div><span>Runtime</span><b>{release.runtimeContract}</b></div>
          </div>
          <div className={s.updateMiniStats}>
            <div><span>Servers</span><b>{nodes.length}</b></div>
            <div><span>Outdated</span><b>{updateTargets}</b></div>
            <div><span>Active Jobs</span><b>{runningJobs}</b></div>
          </div>
          <p className={s.updatePolicy}>
            Deferred Update ไม่ตัดการเทรดที่กำลังทำงาน ระบบจะรอ Stop และ Position = 0
            ก่อนอัปเดตเฉพาะ MT5 บัญชีนั้น
          </p>
        </> : <p className={s.muted}>Backend ยังไม่พบ EA production artifact จึงยังเริ่ม Fleet Update ไม่ได้</p>}
      </div>

      <div className={s.updateServerList}>
        {nodes.map(n=>{
          const runnerId=String(n.runner_id||"");
          const status=data?.runnerStatus?.[runnerId];
          const activeJob=activeByRunner.get(runnerId);
          const creating=busy===runnerId;
          const online=n.health==="ONLINE";
          const hasRealUpdate=Boolean(release&&status?.updateAvailable);
          const waitingVersion=Boolean(release&&status&&status.total>0&&status.outdated===0&&status.unknown>0);
          const canSupersede=Boolean(
            release &&
            hasRealUpdate &&
            activeJob &&
            activeJob.action==="UPDATE" &&
            activeJob.target_version &&
            activeJob.target_version!==release.version &&
            activeJob.delivered===0 &&
            activeJob.verifying===0 &&
            activeJob.waiting_safe>0
          );

          let state:RunnerUiState="EMPTY";
          if(!online) state="OFFLINE";
          else if(creating) state="CREATING";
          else if(activeJob?.verifying) state="VERIFYING";
          else if(activeJob?.waiting_safe) state="WAITING_SAFE";
          else if(activeJob) state="DELIVERING";
          else if(waitingVersion) state="UNKNOWN";
          else if(hasRealUpdate) state="READY";
          else if(release&&status&&status.total>0) state="CURRENT";

          const canRelease=(state==="READY" || canSupersede) && !busy;
          const progressTotal=Math.max(0,activeJob?.total||0);
          const progressDone=Math.max(0,activeJob?.completed||0);
          const progressPercent=progressTotal>0
            ? Math.max(0,Math.min(100,Math.round(progressDone/progressTotal*100)))
            : 0;

          return <section key={runnerId} className={s.updateServerCard}>
            <div className={s.updateServerTop}>
              <div className={s.updateServerIdentity}>
                <span className={s.updateServerIcon}>▤</span>
                <div>
                  <h3>{runnerId}</h3>
                  <span>Worker {n.telemetry?.version||"—"}</span>
                </div>
              </div>
              <Badge tone={online?"good":"warn"}>{n.health}</Badge>
            </div>

            <div className={s.updateStateRow}>
              <div>
                <span className={s.updateStateLabel}>สถานะการอัปเดต</span>
                <b className={
                  state==="CURRENT" ? s.updateStateGood :
                  state==="OFFLINE" ? s.updateStateBad :
                  state==="READY" ? s.updateStateReady :
                  s.updateStateWorking
                }>{runnerStateLabel(state,activeJob)}</b>
              </div>
              {release&&<span className={s.updateTarget}>Target v{release.version}</span>}
            </div>

            {activeJob&&<>
              <div className={s.updateProgressTrack} aria-label={"Update progress "+progressPercent+"%"}>
                <span style={{width:progressPercent+"%"}}/>
              </div>
              <div className={s.updateProgressMeta}>
                <span>{progressDone}/{progressTotal} เสร็จแล้ว</span>
                <span>Safe {activeJob.waiting_safe} · Verify {activeJob.verifying} · Fail {activeJob.failed}</span>
              </div>
            </>}

            {state==="UNKNOWN"&&
              <p className={s.updateServerHint}>ยังไม่มีข้อมูลเวอร์ชันจาก {status?.unknown||0} บัญชี ระบบจึงไม่สร้างคิวซ้ำ</p>}
            {state==="CURRENT"&&
              <p className={s.updateServerHint}>ทุกบัญชีบน Server นี้ใช้ Production EA ล่าสุดแล้ว</p>}
            {state==="EMPTY"&&
              <p className={s.updateServerHint}>ยังไม่มี Cloud MT5 ที่ต้องอัปเดตบน Server นี้</p>}
            {activeJob&&
              <p className={s.updateServerHint}>
                {canSupersede
                  ? "มี Production EA ใหม่กว่า · คิวที่ยังรอ Safe Stop สามารถข้ามเวอร์ชันเก่าไปเวอร์ชันล่าสุดได้"
                  : "งานนี้ล็อกการปล่อยซ้ำจนกว่าจะจบ เพื่อป้องกันคิวอัปเดตซ้อนกัน"}
              </p>}

            <button
              className={s.updateReleaseButton+(canRelease?" "+s.updateReleaseReady:"")}
              disabled={!canRelease}
              onClick={()=>start(runnerId)}
            >
              {canSupersede ? "ปล่อย v"+release?.version+" แทน "+activeJob?.target_version :
               state==="READY" ? "ปล่อย EA Update" :
               state==="CREATING" ? "กำลังปล่อย..." :
               state==="WAITING_SAFE" ? "รอ Safe Stop" :
               state==="VERIFYING" ? "กำลัง Verify..." :
               state==="DELIVERING" ? (activeJob?.action==="ROLLBACK"?"กำลัง Rollback...":"กำลังอัปเดต...") :
               state==="CURRENT" ? "EA ล่าสุดแล้ว" :
               state==="UNKNOWN" ? "รอตรวจสอบ EA" :
               state==="OFFLINE" ? "Server Offline" :
               "ไม่มีรายการอัปเดต"}
            </button>
          </section>;
        })}

        {!nodes.length&&
          <div className={s.updateEmptyServer}>
            <b>ยังไม่มี Cloud Server</b>
            <span>เพิ่ม VPS ก่อนจึงจะสามารถปล่อย Fleet Update ได้</span>
          </div>}
      </div>
    </section>

    <section className={s.updateHistoryCard}>
      <div className={s.updateHistoryHead}>
        <div>
          <span className={s.eyebrow}>UPDATE HISTORY</span>
          <h3>งานอัปเดตล่าสุด</h3>
        </div>
        <button className={s.updateRefreshButton} onClick={load} disabled={Boolean(busy)} aria-label="รีเฟรชงานอัปเดต">↻</button>
      </div>

      <div className={s.updateHistoryList}>
        {(data?.jobs||[]).map(job=>{
          const progressTotal=Math.max(0,job.total||0);
          const progressDone=Math.max(0,job.completed||0);
          const progressPercent=progressTotal>0
            ? Math.max(0,Math.min(100,Math.round(progressDone/progressTotal*100)))
            : 0;
          const rollbackAllowed=
            job.action==="UPDATE" &&
            job.completed>0 &&
            job.state!=="RUNNING" &&
            !activeByRunner.has(job.runner_id);

          return <article key={job.id} className={s.updateHistoryRow}>
            <div className={s.updateHistoryMain}>
              <div className={s.updateHistoryIdentity}>
                <b>{job.runner_id}</b>
                <span>{job.action}{job.target_version?" → v"+job.target_version:""}</span>
              </div>
              <Badge tone={jobTone(job)}>{jobLabel(job)}</Badge>
            </div>

            <div className={s.updateHistoryProgress}>
              <div className={s.updateProgressTrack}>
                <span style={{width:progressPercent+"%"}}/>
              </div>
              <div className={s.updateProgressMeta}>
                <span>{progressDone}/{progressTotal}</span>
                <span>Safe {job.waiting_safe} · Verify {job.verifying} · Fail {job.failed}</span>
              </div>
            </div>

            <div className={s.updateHistoryFooter}>
              <time>{date(job.created_at)}</time>
              {rollbackAllowed
                ?<button
                  className={s.updateRollbackButton}
                  disabled={Boolean(busy)}
                  onClick={()=>rollback(job)}
                >Rollback</button>
                :<span className={s.updateHistoryNoAction}>{job.state==="RUNNING"?"กำลังทำงาน":"—"}</span>}
            </div>
          </article>;
        })}

        {!data?.jobs?.length&&
          <div className={s.empty}>
            <b>ยังไม่มี Fleet Update</b>
            <p>เมื่อมี Production EA ใหม่ งานที่ปล่อยจะปรากฏที่นี่พร้อมสถานะและความคืบหน้า</p>
          </div>}
      </div>
    </section>
  </div>;
}
