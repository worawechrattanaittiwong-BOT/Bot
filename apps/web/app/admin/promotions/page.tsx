"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
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

type EditorSchedule = {
  slotCode:"MORNING"|"MIDDAY"|"EVENING";
  label:string;
  enabled:boolean;
  start:string;
  end:string;
};

type EditorState = {
  id?:string;
  code:string;
  title:string;
  targetUrl:string;
  ctaLabel:string;
  status:"ACTIVE"|"PAUSED"|"ARCHIVED";
  priority:number;
  startsAt:string;
  endsAt:string;
  maxImpressionsPerDay:number;
  delaySeconds:number;
  audienceRoles:string[];
  allAuthenticatedPages:boolean;
  selectedPages:string[];
  excludedPaths:string;
  schedules:EditorSchedule[];
  imageUrl:string;
  mobileImageUrl:string;
  desktopDataUrl:string;
  mobileDataUrl:string;
  removeDesktop:boolean;
  removeMobile:boolean;
};

const PAGE_OPTIONS = [
  { key:"dashboard", label:"Control Center / MT5 & EA", path:"/dashboard", kind:"prefix" },
  { key:"performance", label:"Backtest & Performance", path:"/performance", kind:"exact" },
  { key:"packages", label:"Packages", path:"/packages", kind:"prefix" },
  { key:"account", label:"My Account", path:"/account", kind:"prefix" },
  { key:"referrals", label:"Invite & Earn", path:"/referrals", kind:"prefix" },
  { key:"partner", label:"Partner Dashboard", path:"/partner", kind:"prefix" }
] as const;

const ROLE_OPTIONS = [
  { key:"CUSTOMER", label:"Customer" },
  { key:"OWNER", label:"Owner" },
  { key:"ADMIN", label:"Admin" }
] as const;

function pad(value:number) {
  return String(value).padStart(2,"0");
}

function minuteLabel(value:number) {
  const minute=Math.max(0,Math.min(1439,Number(value)||0));
  return pad(Math.floor(minute/60))+":"+pad(minute%60);
}

function minuteFromTime(value:string) {
  const [hour,minute]=String(value||"00:00").split(":").map(Number);
  return Math.max(0,Math.min(1439,(Number(hour)||0)*60+(Number(minute)||0)));
}

function dateLabel(value?:string|null) {
  if (!value) return "ไม่จำกัด";
  const date=new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("th-TH",{dateStyle:"medium",timeStyle:"short"})
    : "—";
}

function toLocalInput(value?:string|null) {
  if (!value) return "";
  const date=new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth()+1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes())
  ].join("");
}

function scheduleDefaults():EditorSchedule[] {
  return [
    {slotCode:"MORNING",label:"เช้า",enabled:true,start:"07:00",end:"10:59"},
    {slotCode:"MIDDAY",label:"เที่ยง",enabled:true,start:"11:00",end:"14:59"},
    {slotCode:"EVENING",label:"เย็น",enabled:true,start:"17:00",end:"21:59"}
  ];
}

function campaignToEditor(campaign:Campaign):EditorState {
  const settings=campaign.settings||{};
  const exact=Array.isArray(settings.exactPaths)?settings.exactPaths.map(String):[];
  const prefixes=Array.isArray(settings.allowedPathPrefixes)?settings.allowedPathPrefixes.map(String):[];
  const selectedPages=PAGE_OPTIONS
    .filter(item=>item.kind==="exact"?exact.includes(item.path):prefixes.includes(item.path))
    .map(item=>item.key);
  const knownPaths=new Set(PAGE_OPTIONS.map(item=>item.path));
  const hasUnknownPaths=[
    ...exact.filter((value:string)=>!knownPaths.has(value as any)),
    ...prefixes.filter((value:string)=>!knownPaths.has(value as any))
  ].length>0;
  const mappedSchedules=scheduleDefaults().map(defaultRow=>{
    const saved=(campaign.schedules||[]).find(item=>String(item.slotCode).toUpperCase()===defaultRow.slotCode);
    return saved?{
      ...defaultRow,
      enabled:saved.enabled!==false,
      start:minuteLabel(saved.startMinute),
      end:minuteLabel(saved.endMinute)
    }:defaultRow;
  });
  return {
    id:campaign.id,
    code:campaign.code,
    title:campaign.title,
    targetUrl:campaign.target_url,
    ctaLabel:campaign.cta_label,
    status:campaign.status,
    priority:Number(campaign.priority||0),
    startsAt:toLocalInput(campaign.starts_at),
    endsAt:toLocalInput(campaign.ends_at),
    maxImpressionsPerDay:Math.max(1,Number(settings.maxImpressionsPerDay||3)),
    delaySeconds:Math.max(0,Number(settings.delayMs||2500)/1000),
    audienceRoles:Array.isArray(settings.audienceRoles)?settings.audienceRoles.map((x:any)=>String(x).toUpperCase()):[],
    allAuthenticatedPages:!exact.length&&!prefixes.length,
    selectedPages:hasUnknownPaths?[]:selectedPages,
    excludedPaths:Array.isArray(settings.excludedPathPrefixes)?settings.excludedPathPrefixes.join("\n"):"",
    schedules:mappedSchedules,
    imageUrl:campaign.image_url||"",
    mobileImageUrl:campaign.mobile_image_url||"",
    desktopDataUrl:"",
    mobileDataUrl:"",
    removeDesktop:false,
    removeMobile:false
  };
}

function newEditor():EditorState {
  const now=new Date();
  now.setMinutes(now.getMinutes()-now.getTimezoneOffset());
  return {
    code:"PROMO_"+Date.now().toString(36).toUpperCase(),
    title:"",
    targetUrl:"/dashboard",
    ctaLabel:"ดูรายละเอียด",
    status:"PAUSED",
    priority:100,
    startsAt:now.toISOString().slice(0,16),
    endsAt:"",
    maxImpressionsPerDay:3,
    delaySeconds:2.5,
    audienceRoles:["CUSTOMER"],
    allAuthenticatedPages:true,
    selectedPages:[],
    excludedPaths:"",
    schedules:scheduleDefaults(),
    imageUrl:"",
    mobileImageUrl:"",
    desktopDataUrl:"",
    mobileDataUrl:"",
    removeDesktop:false,
    removeMobile:false
  };
}

async function fileToDataUrl(file:File) {
  const allowed=["image/png","image/jpeg","image/webp"];
  if (!allowed.includes(file.type)) throw new Error("รองรับเฉพาะ PNG, JPEG และ WEBP");
  if (file.size>4*1024*1024) throw new Error("ไฟล์รูปต้องไม่เกิน 4 MB");
  return new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||""));
    reader.onerror=()=>reject(new Error("อ่านไฟล์รูปไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
}

export default function PromotionCenterPage() {
  const [campaigns,setCampaigns]=useState<Campaign[]>([]);
  const [loading,setLoading]=useState(true);
  const [busyId,setBusyId]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [editor,setEditor]=useState<EditorState|null>(null);
  const [previewCampaign,setPreviewCampaign]=useState<Campaign|null>(null);
  const [archiveConfirm,setArchiveConfirm]=useState(false);

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

  async function setStatus(campaign:Campaign,status:"ACTIVE"|"PAUSED"|"ARCHIVED") {
    setBusyId(campaign.id);
    try {
      await adminApi("/admin/in-app-campaigns/"+encodeURIComponent(campaign.id)+"/status",{
        method:"POST",
        body:JSON.stringify({status})
      });
      setCampaigns(current=>current.map(item=>item.id===campaign.id?{...item,status}:item));
      setNotice(status==="ACTIVE"?"เปิด Campaign แล้ว":status==="PAUSED"?"พัก Campaign แล้ว":"เก็บ Campaign แล้ว");
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

  function setEditorField<K extends keyof EditorState>(key:K,value:EditorState[K]) {
    setEditor(current=>current?{...current,[key]:value}:current);
  }

  function togglePage(key:string) {
    setEditor(current=>{
      if(!current) return current;
      const selected=current.selectedPages.includes(key)
        ? current.selectedPages.filter(item=>item!==key)
        : [...current.selectedPages,key];
      return {...current,selectedPages:selected};
    });
  }

  function toggleRole(role:string) {
    setEditor(current=>{
      if(!current) return current;
      const roles=current.audienceRoles.includes(role)
        ? current.audienceRoles.filter(item=>item!==role)
        : [...current.audienceRoles,role];
      return {...current,audienceRoles:roles};
    });
  }

  function updateSchedule(slotCode:string,patch:Partial<EditorSchedule>) {
    setEditor(current=>current?{
      ...current,
      schedules:current.schedules.map(row=>row.slotCode===slotCode?{...row,...patch}:row)
    }:current);
  }

  async function chooseImage(event:ChangeEvent<HTMLInputElement>,kind:"DESKTOP"|"MOBILE") {
    const file=event.target.files?.[0];
    event.target.value="";
    if(!file) return;
    try {
      const dataUrl=await fileToDataUrl(file);
      setEditor(current=>current?kind==="DESKTOP"
        ? {...current,desktopDataUrl:dataUrl,removeDesktop:false}
        : {...current,mobileDataUrl:dataUrl,removeMobile:false}
        : current
      );
      setError("");
    } catch(e:any) {
      setError(String(e?.message||"เลือกรูปไม่สำเร็จ"));
    }
  }

  async function saveEditor() {
    if(!editor) return;
    if(!editor.title.trim()) {
      setError("กรุณาใส่ชื่อ Campaign");
      return;
    }
    if(!editor.targetUrl.trim()) {
      setError("กรุณาใส่ลิงก์ปลายทาง");
      return;
    }
    const selectedOptions=PAGE_OPTIONS.filter(item=>editor.selectedPages.includes(item.key));
    const exactPaths=editor.allAuthenticatedPages?[]:selectedOptions.filter(item=>item.kind==="exact").map(item=>item.path);
    const allowedPathPrefixes=editor.allAuthenticatedPages?[]:selectedOptions.filter(item=>item.kind==="prefix").map(item=>item.path);
    if(!editor.allAuthenticatedPages&&!exactPaths.length&&!allowedPathPrefixes.length) {
      setError("เลือกอย่างน้อย 1 หน้าที่จะแสดง หรือเลือกทุกหน้าหลัง Login");
      return;
    }
    const schedules=editor.schedules.map(row=>({
      slotCode:row.slotCode,
      startMinute:minuteFromTime(row.start),
      endMinute:minuteFromTime(row.end),
      enabled:row.enabled
    }));
    for(const row of schedules) {
      if(row.enabled&&row.endMinute<row.startMinute) {
        setError("เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม");
        return;
      }
    }
    const payload={
      code:editor.code,
      title:editor.title.trim(),
      targetUrl:editor.targetUrl.trim(),
      ctaLabel:editor.ctaLabel.trim()||"ดูรายละเอียด",
      status:editor.status,
      priority:Number(editor.priority||0),
      startsAt:editor.startsAt?new Date(editor.startsAt).toISOString():new Date().toISOString(),
      endsAt:editor.endsAt?new Date(editor.endsAt).toISOString():null,
      settings:{
        maxImpressionsPerDay:Number(editor.maxImpressionsPerDay||3),
        oncePerSlot:true,
        delayMs:Math.round(Number(editor.delaySeconds||0)*1000),
        exactPaths,
        allowedPathPrefixes,
        excludedPathPrefixes:editor.excludedPaths
          .split(/[\n,]+/)
          .map(value=>value.trim())
          .filter(Boolean),
        audienceRoles:editor.audienceRoles
      },
      schedules
    };

    setBusyId(editor.id||"NEW");
    let persistedCampaignId=editor.id||"";
    try {
      const saved=editor.id
        ? await adminApi("/admin/in-app-campaigns/"+encodeURIComponent(editor.id),{
            method:"POST",
            body:JSON.stringify(payload)
          })
        : await adminApi("/admin/in-app-campaigns",{
            method:"POST",
            body:JSON.stringify(payload)
          });
      const campaignId=editor.id||String(saved?.id||"");
      if(!campaignId) throw new Error("ไม่พบ Campaign ID หลังบันทึก");
      persistedCampaignId=campaignId;

      if(editor.removeDesktop) {
        await adminApi("/admin/in-app-campaigns/"+encodeURIComponent(campaignId)+"/asset/remove",{
          method:"POST",
          body:JSON.stringify({assetKind:"DESKTOP"})
        });
      } else if(editor.desktopDataUrl) {
        await adminApi("/admin/in-app-campaigns/"+encodeURIComponent(campaignId)+"/asset",{
          method:"POST",
          body:JSON.stringify({assetKind:"DESKTOP",dataUrl:editor.desktopDataUrl})
        });
      }

      if(editor.removeMobile) {
        await adminApi("/admin/in-app-campaigns/"+encodeURIComponent(campaignId)+"/asset/remove",{
          method:"POST",
          body:JSON.stringify({assetKind:"MOBILE"})
        });
      } else if(editor.mobileDataUrl) {
        await adminApi("/admin/in-app-campaigns/"+encodeURIComponent(campaignId)+"/asset",{
          method:"POST",
          body:JSON.stringify({assetKind:"MOBILE",dataUrl:editor.mobileDataUrl})
        });
      }

      setEditor(null);
      setNotice(editor.id?"บันทึกการแก้ไข Campaign แล้ว":"สร้าง Campaign ใหม่แล้ว");
      setError("");
      await load();
    } catch(e:any) {
      if(!editor.id&&persistedCampaignId) {
        setEditor(current=>current?{...current,id:persistedCampaignId}:current);
      }
      setError(String(e?.message||"บันทึก Campaign ไม่สำเร็จ"));
    } finally {
      setBusyId("");
    }
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
              <h1>Promotion Center</h1>
            </div>
            <div className={s.headerActions}>
              <button className={s.createButton} onClick={()=>{setArchiveConfirm(false);setEditor(newEditor());}}>+ สร้าง Campaign</button>
              <button className={s.refresh} onClick={()=>void load()} disabled={loading}>รีเฟรช</button>
            </div>
          </header>

          {error?<div className={s.error}>{error}</div>:null}
          {notice?<div className={s.success}>{notice}</div>:null}

          <section className={s.summary}>
            <div><span>Campaigns</span><b>{campaigns.length}</b></div>
            <div><span>Active</span><b>{totals.active}</b></div>
            <div><span>Views</span><b>{totals.views.toLocaleString()}</b></div>
            <div><span>Clicks</span><b>{totals.clicks.toLocaleString()}</b></div>
          </section>

          {loading?(
            <div className={s.empty}>กำลังโหลด Campaign…</div>
          ):campaigns.length===0?(
            <div className={s.empty}>
              <b>ยังไม่มี Campaign</b>
            </div>
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
                        <div className={s.noPreview}>ยังไม่มีรูป Desktop</div>
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
                        <button type="button" className={s.previewButton} onClick={()=>setPreviewCampaign(campaign)}>
                          Preview Popup
                        </button>
                        <button type="button" className={s.editButton} onClick={()=>{setArchiveConfirm(false);setEditor(campaignToEditor(campaign));}}>
                          แก้ไข Campaign
                        </button>
                        {campaign.status==="ACTIVE"?(
                          <button
                            type="button"
                            className={s.pauseButton}
                            disabled={busyId===campaign.id}
                            onClick={()=>void setStatus(campaign,"PAUSED")}
                          >
                            Pause
                          </button>
                        ):campaign.status!=="ARCHIVED"?(
                          <button
                            type="button"
                            className={s.activeButton}
                            disabled={busyId===campaign.id}
                            onClick={()=>void setStatus(campaign,"ACTIVE")}
                          >
                            Activate
                          </button>
                        ):null}
                        <a className={s.openButton} href={campaign.target_url} target="_blank" rel="noreferrer">เปิดหน้าปลายทาง</a>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          )}
        </div>
      </main>

      {previewCampaign?(
        <div className={s.previewLayer} role="presentation" onMouseDown={event=>{
          if(event.target===event.currentTarget) setPreviewCampaign(null);
        }}>
          <section className={s.popupPreview} role="dialog" aria-modal="true" aria-label={"Preview "+previewCampaign.title}>
            <button type="button" className={s.popupClose} aria-label="ปิด Preview" onClick={()=>setPreviewCampaign(null)}>×</button>
            {previewCampaign.image_url?(
              <picture>
                {previewCampaign.mobile_image_url?<source media="(max-width: 720px)" srcSet={previewCampaign.mobile_image_url}/>:null}
                <img src={previewCampaign.image_url} alt={previewCampaign.title}/>
              </picture>
            ):(
              <div className={s.popupFallback}><b>{previewCampaign.title}</b><span>ยังไม่มีรูปโฆษณา</span></div>
            )}
            <footer className={s.popupFooter}>
              <label><input type="checkbox" disabled/><span>ไม่แสดงโฆษณานี้อีกในวันนี้</span></label>
              <a href={previewCampaign.target_url} target="_blank" rel="noreferrer">
                {previewCampaign.cta_label||"ดูรายละเอียด"} <span>›</span>
              </a>
            </footer>
          </section>
        </div>
      ):null}

      {editor?(
        <div className={s.editorLayer} role="presentation" onMouseDown={event=>{
          if(event.target===event.currentTarget&&busyId==="") setEditor(null);
        }}>
          <section className={s.editorPanel} role="dialog" aria-modal="true" aria-label="แก้ไข Campaign">
            <header className={s.editorHead}>
              <div>
                <h2>{editor.id?"แก้ไข Campaign":"สร้าง Campaign ใหม่"}</h2>
              </div>
              <button type="button" aria-label="ปิด" onClick={()=>setEditor(null)} disabled={Boolean(busyId)}>×</button>
            </header>

            <div className={s.editorBody}>
              <section className={s.editorSection}>
                <div className={s.sectionTitle}>
                  <b>1. เนื้อหาและลิงก์</b>
                </div>
                <div className={s.formGrid}>
                  <label>
                    <span>Campaign Code</span>
                    <input value={editor.code} disabled={Boolean(editor.id)} onChange={event=>setEditorField("code",event.target.value.toUpperCase())}/>
                  </label>
                  <label>
                    <span>Priority</span>
                    <input type="number" min="-9999" max="9999" value={editor.priority} onChange={event=>setEditorField("priority",Number(event.target.value))}/>
                  </label>
                  <label className={s.wideField}>
                    <span>ชื่อ Campaign</span>
                    <input value={editor.title} onChange={event=>setEditorField("title",event.target.value)} placeholder="เช่น แนะนำเพื่อน รับค่าคอมมิชชั่น"/>
                  </label>
                  <label className={s.wideField}>
                    <span>Target URL</span>
                    <input value={editor.targetUrl} onChange={event=>setEditorField("targetUrl",event.target.value)} placeholder="/referrals/details หรือ https://..."/>
                  </label>
                  <label className={s.wideField}>
                    <span>ข้อความปุ่ม CTA</span>
                    <input value={editor.ctaLabel} onChange={event=>setEditorField("ctaLabel",event.target.value)} placeholder="ดูรายละเอียด"/>
                  </label>
                </div>
              </section>

              <section className={s.editorSection}>
                <div className={s.sectionTitle}>
                  <b>2. รูปโฆษณา</b>
                </div>
                <div className={s.assetGrid}>
                  <div className={s.assetCard}>
                    <div className={s.assetHead}><b>Desktop</b></div>
                    <div className={s.assetPreview}>
                      {(editor.desktopDataUrl||(!editor.removeDesktop&&editor.imageUrl))?(
                        <img src={editor.desktopDataUrl||editor.imageUrl} alt="Desktop preview"/>
                      ):<span>ยังไม่มีรูป</span>}
                    </div>
                    <div className={s.assetActions}>
                      <label className={s.fileButton}>
                        เลือกรูป Desktop
                        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>void chooseImage(event,"DESKTOP")}/>
                      </label>
                      {(editor.desktopDataUrl||editor.imageUrl)?(
                        <button type="button" className={s.removeButton} onClick={()=>setEditor(current=>current?{
                          ...current,desktopDataUrl:"",removeDesktop:Boolean(current.id)
                        }:current)}>ลบรูป</button>
                      ):null}
                    </div>
                  </div>

                  <div className={s.assetCard}>
                    <div className={s.assetHead}><b>Mobile</b></div>
                    <div className={s.assetPreview}>
                      {(editor.mobileDataUrl||(!editor.removeMobile&&editor.mobileImageUrl))?(
                        <img src={editor.mobileDataUrl||editor.mobileImageUrl} alt="Mobile preview"/>
                      ):<span>ใช้รูป Desktop</span>}
                    </div>
                    <div className={s.assetActions}>
                      <label className={s.fileButton}>
                        เลือกรูป Mobile
                        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>void chooseImage(event,"MOBILE")}/>
                      </label>
                      {(editor.mobileDataUrl||editor.mobileImageUrl)?(
                        <button type="button" className={s.removeButton} onClick={()=>setEditor(current=>current?{
                          ...current,mobileDataUrl:"",removeMobile:Boolean(current.id)
                        }:current)}>ลบรูป</button>
                      ):null}
                    </div>
                  </div>
                </div>
              </section>

              <section className={s.editorSection}>
                <div className={s.sectionTitle}>
                  <b>3. สถานะและช่วงวันที่</b>
                </div>
                <div className={s.formGrid}>
                  <label>
                    <span>Status</span>
                    <select value={editor.status} onChange={event=>setEditorField("status",event.target.value as EditorState["status"])}>
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="PAUSED">PAUSED</option>
                      <option value="ARCHIVED">ARCHIVED</option>
                    </select>
                  </label>
                  <label>
                    <span>แสดงสูงสุด / วัน</span>
                    <input type="number" min="1" max="12" value={editor.maxImpressionsPerDay} onChange={event=>setEditorField("maxImpressionsPerDay",Number(event.target.value))}/>
                  </label>
                  <label>
                    <span>เริ่ม Campaign</span>
                    <input type="datetime-local" value={editor.startsAt} onChange={event=>setEditorField("startsAt",event.target.value)}/>
                  </label>
                  <label>
                    <span>สิ้นสุด Campaign</span>
                    <input type="datetime-local" value={editor.endsAt} onChange={event=>setEditorField("endsAt",event.target.value)}/>
                  </label>
                  <label>
                    <span>หน่วงก่อนแสดง (วินาที)</span>
                    <input type="number" min="0" max="15" step="0.5" value={editor.delaySeconds} onChange={event=>setEditorField("delaySeconds",Number(event.target.value))}/>
                  </label>
                  <div className={s.fixedRule}>
                    <b>ช่วงเวลา</b>
                    <span>เช้า / เที่ยง / เย็น</span>
                  </div>
                </div>
              </section>

              <section className={s.editorSection}>
                <div className={s.sectionTitle}>
                  <b>4. เวลาแสดง</b>
                </div>
                <div className={s.slotGrid}>
                  {editor.schedules.map(row=>(
                    <div className={s.slotCard} key={row.slotCode}>
                      <label className={s.slotToggle}>
                        <input type="checkbox" checked={row.enabled} onChange={event=>updateSchedule(row.slotCode,{enabled:event.target.checked})}/>
                        <b>{row.label}</b>
                        <span>{row.slotCode}</span>
                      </label>
                      <div className={s.slotTimes}>
                        <label><span>จาก</span><input type="time" value={row.start} onChange={event=>updateSchedule(row.slotCode,{start:event.target.value})}/></label>
                        <label><span>ถึง</span><input type="time" value={row.end} onChange={event=>updateSchedule(row.slotCode,{end:event.target.value})}/></label>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className={s.editorSection}>
                <div className={s.sectionTitle}>
                  <b>5. กลุ่มผู้ใช้และหน้าที่แสดง</b>
                </div>
                <div className={s.roles}>
                  {ROLE_OPTIONS.map(role=>(
                    <label key={role.key} className={s.choice}>
                      <input type="checkbox" checked={editor.audienceRoles.includes(role.key)} onChange={()=>toggleRole(role.key)}/>
                      <span>{role.label}</span>
                    </label>
                  ))}
                </div>

                <label className={s.allPages}>
                  <input type="checkbox" checked={editor.allAuthenticatedPages} onChange={event=>setEditorField("allAuthenticatedPages",event.target.checked)}/>
                  <span><b>ทุกหน้าหลัง Login</b></span>
                </label>

                {!editor.allAuthenticatedPages?(
                  <div className={s.pageChoices}>
                    {PAGE_OPTIONS.map(page=>(
                      <label key={page.key} className={s.choice}>
                        <input type="checkbox" checked={editor.selectedPages.includes(page.key)} onChange={()=>togglePage(page.key)}/>
                        <span>{page.label}</span>
                      </label>
                    ))}
                  </div>
                ):null}

                <label className={s.excludedField}>
                  <span>ยกเว้น Path เพิ่มเติม</span>
                  <textarea
                    rows={3}
                    value={editor.excludedPaths}
                    onChange={event=>setEditorField("excludedPaths",event.target.value)}
                    placeholder={"/checkout\n/security"}
                  />
                  
                </label>
              </section>
            </div>

            {archiveConfirm&&editor.id?(
              <div className={s.archiveConfirm}>
                <div>
                  <b>ยืนยัน Archive Campaign?</b>
                </div>
                <div>
                  <button type="button" className={s.cancelButton} onClick={()=>setArchiveConfirm(false)} disabled={Boolean(busyId)}>ยกเลิก</button>
                  <button
                    type="button"
                    className={s.archiveButton}
                    disabled={Boolean(busyId)}
                    onClick={async()=>{
                      const campaign=campaigns.find(item=>item.id===editor.id);
                      if(!campaign) return;
                      await setStatus(campaign,"ARCHIVED");
                      setArchiveConfirm(false);
                      setEditor(null);
                    }}
                  >
                    ยืนยัน Archive
                  </button>
                </div>
              </div>
            ):null}

            <footer className={s.editorFooter}>
              {editor.id&&editor.status!=="ARCHIVED"?(
                <button
                  type="button"
                  className={s.archiveButton}
                  disabled={Boolean(busyId)}
                  onClick={()=>setArchiveConfirm(true)}
                >
                  Archive
                </button>
              ):<span/>}
              <div>
                <button type="button" className={s.cancelButton} onClick={()=>{setArchiveConfirm(false);setEditor(null);}} disabled={Boolean(busyId)}>ยกเลิก</button>
                <button type="button" className={s.saveButton} onClick={()=>void saveEditor()} disabled={Boolean(busyId)}>
                  {busyId?"กำลังบันทึก…":"บันทึก Campaign"}
                </button>
              </div>
            </footer>
          </section>
        </div>
      ):null}
    </div>
  );
}
