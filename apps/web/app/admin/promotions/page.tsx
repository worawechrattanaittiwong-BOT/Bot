"use client";

import { useEffect, useMemo, useState } from "react";
import { OwnerMobileNav, OwnerSidebar } from "../../../components/OwnerSidebar";
import { ScenovaBrand } from "../../../components/ScenovaBrand";
import { adminApi } from "../../../lib/api";
import s from "./page.module.css";

type CampaignSchedule = {
  slotCode:string;
  startMinute:number;
  endMinute:number;
  enabled:boolean;
};

type Campaign = {
  id:string;
  code:string;
  title:string;
  image_url?:string|null;
  mobile_image_url?:string|null;
  target_url:string;
  cta_label:string;
  status:"ACTIVE"|"PAUSED"|"ARCHIVED";
  priority:number;
  starts_at:string;
  ends_at?:string|null;
  settings?:Record<string,any>;
  schedules:CampaignSchedule[];
  metrics?:{
    views?:number;
    clicks?:number;
    closes?:number;
    hideToday?:number;
  };
};

function minuteLabel(value:number) {
  const minute=Math.max(0,Math.min(1439,Number(value)||0));
  const hour=Math.floor(minute/60);
  const mins=minute%60;
  return String(hour).padStart(2,"0")+":"+String(mins).padStart(2,"0");
}

function dateLabel(value?:string|null) {
  if (!value) return "ไม่จำกัด";
  const date=new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("th-TH",{dateStyle:"medium",timeStyle:"short"})
    : "—";
}

export default function PromotionCenterPage() {
  const [campaigns,setCampaigns]=useState<Campaign[]>([]);
  const [loading,setLoading]=useState(true);
  const [busyId,setBusyId]=useState("");
  const [error,setError]=useState("");

  async function load() {
    setLoading(true);
    try {
      const result=await adminApi("/admin/in-app-campaigns");
      setCampaigns(Array.isArray(result?.campaigns)?result.campaigns:[]);
      setError("");
    } catch(e:any) {
      setError(String(e?.message||"โหลด Campaign ไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(()=>{
    if (!localStorage.getItem("bot_token")) {
      window.location.href="/login";
      return;
    }
    void load();
  },[]);

  async function setStatus(campaign:Campaign,status:"ACTIVE"|"PAUSED") {
    setBusyId(campaign.id);
    try {
      await adminApi("/admin/in-app-campaigns/"+encodeURIComponent(campaign.id)+"/status",{
        method:"POST",
        body:JSON.stringify({status})
      });
      setCampaigns(current=>current.map(item=>item.id===campaign.id?{...item,status}:item));
      setError("");
    } catch(e:any) {
      setError(String(e?.message||"เปลี่ยนสถานะไม่สำเร็จ"));
    } finally {
      setBusyId("");
    }
  }

  function logout() {
    localStorage.removeItem("bot_token");
    window.location.href="/login";
  }

  const totals=useMemo(()=>campaigns.reduce((acc,item)=>{
    acc.views+=Number(item.metrics?.views||0);
    acc.clicks+=Number(item.metrics?.clicks||0);
    acc.active+=item.status==="ACTIVE"?1:0;
    return acc;
  },{views:0,clicks:0,active:0}),[campaigns]);

  return (
    <div className="app-wrap owner-app">
      <OwnerSidebar activeKey="promotion-center" onLogout={logout}/>

      <main className={"main app-main owner-main "+s.main}>
        <div className={s.root}>
          <div className="mobile-only mobile-app-head">
            <div className="brand-lockup scenova-brand-lockup">
              <ScenovaBrand className="scenova-brand-logo-mobile"/>
            </div>
            <button className="btn ghost" onClick={logout}>ออก</button>
          </div>
          <OwnerMobileNav activeKey="promotion-center"/>

          <header className={s.header}>
            <div>
              <span className={s.kicker}>SCENOVA / PROMOTION CENTER</span>
              <h1>Promotion Center</h1>
              <p>จัดการ Campaign ที่แสดงเฉพาะในระบบหลัง Login โดยไม่แสดงหน้า Login หรือเว็บไซต์สาธารณะ</p>
            </div>
            <button className={s.refresh} onClick={()=>void load()} disabled={loading}>รีเฟรช</button>
          </header>

          {error?<div className={s.error}>{error}</div>:null}

          <section className={s.summary}>
            <div><span>Campaigns</span><b>{campaigns.length}</b></div>
            <div><span>Active</span><b>{totals.active}</b></div>
            <div><span>Views</span><b>{totals.views.toLocaleString()}</b></div>
            <div><span>Clicks</span><b>{totals.clicks.toLocaleString()}</b></div>
          </section>

          <section className={s.notice}>
            <b>Display Scope</b>
            <span>แสดงเฉพาะ Authenticated App · หน้า Login / Website / Public Share ถูกตัดออกจากระบบโฆษณา</span>
          </section>

          {loading?(
            <div className={s.empty}>กำลังโหลด Campaign…</div>
          ):campaigns.length===0?(
            <div className={s.empty}>ยังไม่มี Campaign</div>
          ):(
            <section className={s.grid}>
              {campaigns.map(campaign=>{
                const metrics=campaign.metrics||{};
                const ctr=Number(metrics.views||0)>0
                  ? (Number(metrics.clicks||0)/Number(metrics.views||0)*100).toFixed(2)
                  : "0.00";
                return (
                  <article className={s.card} key={campaign.id}>
                    <div className={s.preview}>
                      {campaign.image_url?(
                        <img src={campaign.image_url} alt={campaign.title}/>
                      ):(
                        <div className={s.noPreview}>No Creative</div>
                      )}
                      <span className={campaign.status==="ACTIVE"?s.active:s.paused}>{campaign.status}</span>
                    </div>

                    <div className={s.body}>
                      <div className={s.head}>
                        <div>
                          <small>{campaign.code}</small>
                          <h2>{campaign.title}</h2>
                        </div>
                        <span className={s.priority}>Priority {campaign.priority}</span>
                      </div>

                      <div className={s.stats}>
                        <div><span>Views</span><b>{Number(metrics.views||0).toLocaleString()}</b></div>
                        <div><span>Clicks</span><b>{Number(metrics.clicks||0).toLocaleString()}</b></div>
                        <div><span>CTR</span><b>{ctr}%</b></div>
                        <div><span>Hide Today</span><b>{Number(metrics.hideToday||0).toLocaleString()}</b></div>
                      </div>

                      <div className={s.meta}>
                        <div><span>CTA</span><b>{campaign.cta_label}</b></div>
                        <div><span>Target</span><b>{campaign.target_url}</b></div>
                        <div><span>Start</span><b>{dateLabel(campaign.starts_at)}</b></div>
                        <div><span>End</span><b>{dateLabel(campaign.ends_at)}</b></div>
                      </div>

                      <div className={s.schedule}>
                        <span>Schedule</span>
                        <div>
                          {(campaign.schedules||[]).filter(item=>item.enabled).map(item=>(
                            <b key={item.slotCode}>
                              {item.slotCode} · {minuteLabel(item.startMinute)}–{minuteLabel(item.endMinute)}
                            </b>
                          ))}
                        </div>
                      </div>

                      <div className={s.actions}>
                        {campaign.status==="ACTIVE"?(
                          <button
                            type="button"
                            className={s.pauseButton}
                            disabled={busyId===campaign.id}
                            onClick={()=>void setStatus(campaign,"PAUSED")}
                          >
                            {busyId===campaign.id?"กำลังบันทึก…":"Pause Campaign"}
                          </button>
                        ):(
                          <button
                            type="button"
                            className={s.activeButton}
                            disabled={busyId===campaign.id||campaign.status==="ARCHIVED"}
                            onClick={()=>void setStatus(campaign,"ACTIVE")}
                          >
                            {busyId===campaign.id?"กำลังบันทึก…":"Activate Campaign"}
                          </button>
                        )}
                        <a className={s.openButton} href={campaign.target_url}>เปิดหน้าปลายทาง</a>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
