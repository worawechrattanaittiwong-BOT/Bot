"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { API_URL, api } from "../lib/api";
import { ScenovaIcon } from "./ScenovaIcon";
import { useSystemPopup } from "./SystemPopupProvider";

type ModeGuideVideo = {
  id:string;
  modeKey:string;
  title:string;
  originalName:string|null;
  contentType:string;
  sizeBytes:number;
  width:number;
  height:number;
  durationSeconds:number|null;
  sortOrder:number;
  isActive:boolean;
  createdAt:string;
  updatedAt:string;
};

const MAX_VIDEO_BYTES = 300 * 1024 * 1024;

function videoUrl(id:string) {
  return API_URL + "/api/mode-guide-videos/" + encodeURIComponent(id) + "/content";
}

function fileSizeLabel(bytes:number) {
  const value=Math.max(0,Number(bytes||0));
  if(value>=1024*1024) return (value/(1024*1024)).toFixed(value>=10*1024*1024?0:1)+" MB";
  if(value>=1024) return (value/1024).toFixed(0)+" KB";
  return value+" B";
}

function durationLabel(seconds:number|null) {
  const value=Math.max(0,Math.round(Number(seconds||0)));
  if(!value) return "";
  const minutes=Math.floor(value/60);
  const rest=value%60;
  return minutes+":"+String(rest).padStart(2,"0");
}

async function inspectPortraitVideo(file:File) {
  return new Promise<{width:number;height:number;durationSeconds:number}>((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const element=document.createElement("video");
    let settled=false;
    const cleanup=()=>{
      URL.revokeObjectURL(url);
      element.removeAttribute("src");
      element.load();
    };
    const fail=(message:string)=>{
      if(settled) return;
      settled=true;
      cleanup();
      reject(new Error(message));
    };
    const timer=window.setTimeout(
      ()=>fail("ตรวจสอบไฟล์วิดีโอไม่สำเร็จ กรุณาลองไฟล์อื่น"),
      15_000
    );
    element.preload="metadata";
    element.onloadedmetadata=()=>{
      if(settled) return;
      window.clearTimeout(timer);
      const width=Number(element.videoWidth||0);
      const height=Number(element.videoHeight||0);
      const durationSeconds=Number.isFinite(element.duration)?Number(element.duration):0;
      settled=true;
      cleanup();
      if(width<=0||height<=0){
        reject(new Error("อ่านขนาดวิดีโอไม่ได้"));
        return;
      }
      if(height<=width || width/height>0.85){
        reject(new Error("หน้านี้รองรับวิดีโอแนวตั้งเท่านั้น แนะนำสัดส่วน 9:16"));
        return;
      }
      resolve({width,height,durationSeconds});
    };
    element.onerror=()=>{
      window.clearTimeout(timer);
      fail("เบราว์เซอร์อ่านวิดีโอนี้ไม่ได้ กรุณาใช้ MP4, MOV หรือ WEBM");
    };
    element.src=url;
  });
}

export function TradingModeGuideVideos({
  modeKey,
  isAdmin
}:{
  modeKey:string;
  isAdmin:boolean;
}) {
  const { confirmPopup }=useSystemPopup();
  const fileRef=useRef<HTMLInputElement|null>(null);
  const [videos,setVideos]=useState<ModeGuideVideo[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [title,setTitle]=useState("");
  const [file,setFile]=useState<File|null>(null);
  const [playingId,setPlayingId]=useState("");

  async function load(silent=false) {
    if(!silent) setLoading(true);
    try{
      const result=await api(isAdmin?"/admin/mode-guide-videos":"/mode-guide-videos");
      setVideos(Array.isArray(result?.videos)?result.videos:[]);
      setError("");
    }catch(e:any){
      setError(String(e?.message||"โหลดวิดีโอไม่สำเร็จ"));
    }finally{
      if(!silent) setLoading(false);
    }
  }

  useEffect(()=>{
    void load(false);
  },[isAdmin]);

  useEffect(()=>{
    setPlayingId("");
    setError("");
    setNotice("");
    setTitle("");
    setFile(null);
    if(fileRef.current) fileRef.current.value="";
  },[modeKey]);

  const modeVideos=useMemo(
    ()=>videos
      .filter(video=>String(video.modeKey||"").toUpperCase()===modeKey)
      .sort((a,b)=>Number(a.sortOrder||0)-Number(b.sortOrder||0) || String(a.createdAt||"").localeCompare(String(b.createdAt||""))),
    [videos,modeKey]
  );
  const playableVideos=modeVideos.filter(video=>video.isActive);
  const playingVideo=
    playableVideos.find(video=>video.id===playingId) ||
    playableVideos[0] ||
    null;

  async function upload() {
    if(!isAdmin || busy) return;
    if(!file){
      setError("เลือกวิดีโอจากมือถือก่อน");
      return;
    }
    if(file.size<=0 || file.size>MAX_VIDEO_BYTES){
      setError("วิดีโอต้องมีขนาดไม่เกิน 300 MB");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try{
      const metadata=await inspectPortraitVideo(file);
      const form=new FormData();
      form.append("video",file,file.name);
      form.append("modeKey",modeKey);
      form.append("title",title.trim()||("วิดีโอแนะนำ "+modeKey.replace("_"," ")));
      form.append("width",String(metadata.width));
      form.append("height",String(metadata.height));
      form.append("durationSeconds",String(metadata.durationSeconds||0));

      await api("/admin/mode-guide-videos/upload",{
        method:"POST",
        body:form
      });
      setTitle("");
      setFile(null);
      if(fileRef.current) fileRef.current.value="";
      setNotice("อัปโหลดวิดีโอแนวตั้งสำหรับ "+modeKey.replace("_"," ")+" สำเร็จแล้ว");
      await load(true);
    }catch(e:any){
      setError(String(e?.message||"อัปโหลดวิดีโอไม่สำเร็จ"));
    }finally{
      setBusy(false);
    }
  }

  async function toggle(video:ModeGuideVideo) {
    if(!isAdmin || busy) return;
    setBusy(true);
    setError("");
    try{
      await api("/admin/mode-guide-videos/"+encodeURIComponent(video.id),{
        method:"POST",
        body:JSON.stringify({isActive:!video.isActive})
      });
      await load(true);
    }catch(e:any){
      setError(String(e?.message||"เปลี่ยนสถานะวิดีโอไม่สำเร็จ"));
    }finally{
      setBusy(false);
    }
  }

  async function remove(video:ModeGuideVideo) {
    if(!isAdmin || busy) return;
    const confirmed=await confirmPopup({
      title:"ลบวิดีโอ "+modeKey.replace("_"," "),
      tone:"warning",
      message:"ลบ “"+video.title+"” ออกจากคู่มือโหมดนี้? ไฟล์วิดีโอจะถูกลบออกจาก Server ด้วย",
      confirmLabel:"ลบวิดีโอ"
    });
    if(!confirmed) return;

    setBusy(true);
    setError("");
    try{
      await api("/admin/mode-guide-videos/"+encodeURIComponent(video.id)+"/delete",{
        method:"POST",
        body:JSON.stringify({})
      });
      if(playingId===video.id) setPlayingId("");
      setNotice("ลบวิดีโอแล้ว");
      await load(true);
    }catch(e:any){
      setError(String(e?.message||"ลบวิดีโอไม่สำเร็จ"));
    }finally{
      setBusy(false);
    }
  }

  return <>
    <section className="cc-mode-guide-video-zone" aria-label="วิดีโอแนะนำโหมด">
      <div className="cc-mode-guide-video-zone-copy">
        <span className="cc-mode-guide-video-icon"><ScenovaIcon name="play" size={18}/></span>
        <div>
          <small>VIDEO GUIDE · 9:16</small>
          <b>ดูตัวอย่างการใช้งาน {modeKey.replace("_"," ")}</b>
          <span>วิดีโอแนวตั้งสำหรับดูบนมือถือ</span>
        </div>
      </div>
      {loading
        ? <button type="button" disabled>กำลังโหลด...</button>
        : playableVideos.length
          ? <button
              type="button"
              className="cc-mode-guide-watch"
              onClick={()=>setPlayingId(playableVideos[0].id)}
            ><ScenovaIcon name="play" size={16}/>ดูวิดีโอ{playableVideos.length>1?" ("+playableVideos.length+")":""}</button>
          : <span className="cc-mode-guide-video-empty">ยังไม่มีวิดีโอ</span>}
    </section>

    {isAdmin&&<section className="cc-mode-guide-video-admin" aria-label="จัดการวิดีโอคู่มือโหมด">
      <header>
        <div>
          <small>ADMIN · VIDEO MANAGER</small>
          <b>แนบวิดีโอจากหน้านี้</b>
        </div>
        <span>แนวตั้ง · แนะนำ 9:16 · สูงสุด 300 MB</span>
      </header>

      <div className="cc-mode-guide-video-upload">
        <label>
          <span>ชื่อวิดีโอ</span>
          <input
            type="text"
            maxLength={180}
            placeholder={"เช่น วิธีใช้ "+modeKey.replace("_"," ")}
            value={title}
            onChange={event=>setTitle(event.target.value)}
            disabled={busy}
          />
        </label>
        <label className="cc-mode-guide-video-file">
          <span>ไฟล์จากมือถือ</span>
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/*"
            disabled={busy}
            onChange={event=>{
              const next=event.target.files?.[0]||null;
              setFile(next);
              setError("");
              setNotice("");
            }}
          />
          <small>{file?file.name+" · "+fileSizeLabel(file.size):"เลือก MP4 / MOV / WEBM แนวตั้ง"}</small>
        </label>
        <button
          type="button"
          className="cc-mode-guide-video-upload-button"
          disabled={busy||!file}
          onClick={upload}
        >{busy?"กำลังอัปโหลด...":"อัปโหลดวิดีโอ"}</button>
      </div>

      {error&&<div className="cc-mode-guide-video-message error" role="alert">{error}</div>}
      {notice&&<div className="cc-mode-guide-video-message success" role="status">{notice}</div>}

      {modeVideos.length>0&&<div className="cc-mode-guide-video-admin-list">
        {modeVideos.map(video=><div key={video.id} className={"cc-mode-guide-video-admin-row "+(video.isActive?"active":"inactive")}>
          <button
            type="button"
            className="preview"
            onClick={()=>setPlayingId(video.id)}
            disabled={!video.isActive}
            aria-label={"ดู "+video.title}
          ><ScenovaIcon name="play" size={15}/></button>
          <div>
            <b>{video.title}</b>
            <small>{video.width}×{video.height} · {fileSizeLabel(video.sizeBytes)}{durationLabel(video.durationSeconds)?" · "+durationLabel(video.durationSeconds):""}</small>
          </div>
          <button type="button" className="toggle" onClick={()=>toggle(video)} disabled={busy}>
            {video.isActive?"แสดงอยู่":"ซ่อนอยู่"}
          </button>
          <button type="button" className="remove" onClick={()=>remove(video)} disabled={busy}>ลบ</button>
        </div>)}
      </div>}
    </section>}

    {playingId&&playingVideo&&<div
      className="cc-mode-guide-video-backdrop"
      role="presentation"
      onMouseDown={event=>{
        if(event.target===event.currentTarget) setPlayingId("");
      }}
    >
      <section className="cc-mode-guide-video-player" role="dialog" aria-modal="true" aria-label={playingVideo.title}>
        <header>
          <div>
            <small>{playingVideo.modeKey.replace("_"," ")} · VIDEO GUIDE</small>
            <b>{playingVideo.title}</b>
          </div>
          <button type="button" onClick={()=>setPlayingId("")} aria-label="ปิดวิดีโอ">×</button>
        </header>
        <div className="cc-mode-guide-video-frame">
          <video
            key={playingVideo.id}
            src={videoUrl(playingVideo.id)}
            controls
            autoPlay
            playsInline
            preload="metadata"
          />
        </div>
        {playableVideos.length>1&&<nav className="cc-mode-guide-video-playlist" aria-label="เลือกวิดีโอ">
          {playableVideos.map((video,index)=><button
            type="button"
            key={video.id}
            className={video.id===playingVideo.id?"active":""}
            onClick={()=>setPlayingId(video.id)}
          >{index+1}. {video.title}</button>)}
        </nav>}
      </section>
    </div>}
  </>;
}
