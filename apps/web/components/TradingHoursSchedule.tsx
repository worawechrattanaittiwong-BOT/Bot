"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";
import styles from "./TradingHoursSchedule.module.css";
import { useSystemPopup } from "./SystemPopupProvider";

type Props = {slotId:string;settings:any;onSaved:()=>Promise<any>};

const hours24 = Array.from({length:24},(_,h)=>h);
function time(hour:number) {return String(hour).padStart(2,"0")+":00";}

export function TradingHoursSchedule({slotId,settings,onSaved}:Props) {
  const {confirmPopup}=useSystemPopup();
  const [enabled,setEnabled]=useState(true);
  const [hours,setHours]=useState<number[]>(hours24);
  const [saving,setSaving]=useState(false);
  const [pausing,setPausing]=useState(false);
  const [notice,setNotice]=useState("");
  const [listOpen,setListOpen]=useState(false);
  const triggerRef=useRef<HTMLButtonElement>(null);
  const menuRef=useRef<HTMLDivElement>(null);
  const [menuPosition,setMenuPosition]=useState<{top:number;left:number;width:number;maxHeight:number}>({
    top:0,left:0,width:240,maxHeight:360
  });
  useEffect(()=>{
    if(!listOpen) return;
    function reposition() {
      const trigger=triggerRef.current;
      if(!trigger) return;
      const rect=trigger.getBoundingClientRect();
      const margin=8;
      const wantedHeight=390;
      const availableBelow=window.innerHeight-rect.bottom-12;
      const availableAbove=rect.top-12;
      const placeAbove=availableBelow<220 && availableAbove>availableBelow;
      const maxHeight=Math.max(100,Math.min(wantedHeight,placeAbove?availableAbove:availableBelow));
      const width=Math.min(Math.max(225,rect.width),window.innerWidth-16);
      const left=Math.max(margin,Math.min(rect.right-width,window.innerWidth-width-margin));
      const top=placeAbove?Math.max(margin,rect.top-maxHeight-6):Math.min(window.innerHeight-margin,rect.bottom+6);
      setMenuPosition({top,left,width,maxHeight});
    }
    reposition();
    function outside(event:PointerEvent) {
      if(triggerRef.current?.contains(event.target as Node) ||
         menuRef.current?.contains(event.target as Node)) return;
      setListOpen(false);
    }
    function escape(event:KeyboardEvent) {
      if(event.key==="Escape") {setListOpen(false);triggerRef.current?.focus();}
    }
    window.addEventListener("resize",reposition);
    window.addEventListener("scroll",reposition,true);
    document.addEventListener("pointerdown",outside);
    document.addEventListener("keydown",escape);
    return ()=>{
      window.removeEventListener("resize",reposition);
      window.removeEventListener("scroll",reposition,true);
      document.removeEventListener("pointerdown",outside);
      document.removeEventListener("keydown",escape);
    };
  },[listOpen]);

  // Unconfigured RACE slots retain their legacy all-day trading behavior.
  const configured=typeof settings?.tradingScheduleEnabled === "boolean";
  const storedEnabled=configured ? settings.tradingScheduleEnabled === true : true;
  const storedHours=Array.isArray(settings?.tradingScheduleHours)
    ? settings.tradingScheduleHours.filter((h:any)=>Number.isInteger(h) && h>=0 && h<=23).sort((a:number,b:number)=>a-b)
    : hours24;
  const hourKey=storedHours.join(",");
  useEffect(()=>{
    setEnabled(storedEnabled);
    setHours(storedHours);
    setNotice("");
    setListOpen(false);
  },[slotId,storedEnabled,hourKey]);
  const selected=useMemo(()=>new Set(hours),[hours]);
  const dirty=enabled!==storedEnabled || hours.join(",")!==hourKey;
  const armed=settings?.tradingScheduleArmed===true;

  async function save() {
    if(!slotId || saving || (enabled && hours.length===0)) return;
    setSaving(true);setNotice("");
    try {
      await api("/bot/schedule?slotId="+encodeURIComponent(slotId),{
        method:"PUT",body:JSON.stringify({enabled,hours})
      });
      setNotice("บันทึกตารางเวลาสำเร็จ");
      await onSaved();
    } catch(e:any) {setNotice("บันทึกไม่สำเร็จ: "+String(e?.message||e));}
    finally {setSaving(false);}
  }
  async function pause() {
    if(!slotId || pausing || !armed) return;
    const confirmed=await confirmPopup({
      title:"ยืนยันยกเลิก Auto Resume",
      tone:"warning",
      message:"ยกเลิกการเริ่มอัตโนมัติ และสั่ง Safe Stop หากบอทกำลังทำงาน?",
      confirmLabel:"ยกเลิก Auto Resume",
      cancelLabel:"กลับไปตั้งค่า"
    });
    if(!confirmed) return;
    setPausing(true);setNotice("");
    try {
      await api("/bot/schedule/pause?slotId="+encodeURIComponent(slotId),{method:"POST"});
      setNotice("ยกเลิก Auto Resume แล้ว · ต้องกด Start เองหากต้องการเทรดใหม่");
      await onSaved();
    }catch(e:any){setNotice("หยุดไม่สำเร็จ: "+String(e?.message||e));}
    finally {setPausing(false);}
  }

  return (
    <div className={"cc-race-hours-schedule "+styles.inline} aria-label="ตารางเวลาทำงานโหมด RACE">
      <div className={styles.field}>
        <div className={styles.fieldLabel}>
          <b>เวลาทำงาน RACE</b>
          <small>เวลาไทย (UTC+7)</small>
        </div>
        <div className={styles.right}>
          <label className={styles.enable}><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>เปิดใช้</label>
          <button
            ref={triggerRef}
            type="button"
            className={styles.trigger}
            aria-label="เลือกชั่วโมงทำงาน RACE"
            aria-expanded={listOpen}
            aria-haspopup="dialog"
            onClick={()=>setListOpen(open=>!open)}
          >
            <span className={styles.triggerText}>
              {hours.length===24?"ตลอด 24 ชั่วโมง":hours.length===0?"ยังไม่ได้เลือกเวลา":"เลือก "+hours.length+" ชั่วโมง"}
            </span>
            <span className={styles.chevron+(listOpen?" "+styles.chevronOpen:"")} aria-hidden="true">⌄</span>
          </button>
        </div>
      </div>
      {listOpen && typeof document!=="undefined" && createPortal(
        <div
          ref={menuRef}
          className={styles.floatingMenu}
          style={{position:"fixed",top:menuPosition.top,left:menuPosition.left,width:menuPosition.width,maxHeight:menuPosition.maxHeight}}
          role="dialog"
          aria-label="เลือกชั่วโมงทำงาน RACE"
        >
          <div className={styles.hours}>
            {hours24.map(h=>(
              <label key={h} className={styles.hour+(selected.has(h)?" "+styles.selected:"")}>
                <span>{time(h)}</span>
                <input
                  type="checkbox"
                  disabled={!enabled}
                  checked={selected.has(h)}
                  onChange={e=>setHours(prev=>e.target.checked?[...prev,h].sort((a,b)=>a-b):prev.filter(v=>v!==h))}
                />
              </label>
            ))}
          </div>
          <div className={styles.quick}>
            <button type="button" disabled={!enabled} onClick={()=>setHours([...hours24])}>เลือกทั้งหมด</button>
            <button type="button" disabled={!enabled} onClick={()=>setHours([])}>ล้าง</button>
          </div>
        </div>,
        document.body
      )}
      {(dirty || armed || notice) && <div className={styles.actions}>
        {notice && <span className={styles.notice} role="status">{notice}</span>}
        {dirty && <button type="button" className={styles.save} disabled={!slotId||saving||(enabled&&!hours.length)} onClick={()=>void save()}>{saving?"กำลังบันทึก...":"บันทึกตารางเวลา"}</button>}
        {armed && <button type="button" className={styles.pause} disabled={pausing} onClick={()=>void pause()}>{pausing?"กำลังหยุด...":"ยกเลิก Auto Resume"}</button>}
      </div>}
    </div>
  );
}
