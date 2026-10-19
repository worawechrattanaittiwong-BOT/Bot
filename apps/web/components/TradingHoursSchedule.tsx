"use client";

import { useEffect, useMemo, useState } from "react";
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
          <details className={styles.dropdown}>
            <summary className={styles.trigger} aria-label="เลือกชั่วโมงทำงาน RACE">
              {hours.length===24?"ตลอด 24 ชั่วโมง":hours.length===0?"ยังไม่ได้เลือกเวลา":"เลือก "+hours.length+" ชั่วโมง"}
              <span className={styles.chevron} aria-hidden="true">⌄</span>
            </summary>
            <div className={styles.menu}>
              <div className={styles.hours}>
                {hours24.map(h=>(
                  <label key={h} className={styles.hour+" "+(selected.has(h)?styles.selected:"")}>
                    <input type="checkbox" disabled={!enabled} checked={selected.has(h)}
                      onChange={e=>setHours(prev=>e.target.checked?[...prev,h].sort((a,b)=>a-b):prev.filter(v=>v!==h))}/>
                    {time(h)}
                  </label>
                ))}
              </div>
              <div className={styles.quick}>
                <button type="button" disabled={!enabled} onClick={()=>setHours([...hours24])}>เลือกทั้งหมด</button>
                <button type="button" disabled={!enabled} onClick={()=>setHours([])}>ล้าง</button>
              </div>
            </div>
          </details>
        </div>
      </div>
      {(dirty || armed || notice) && <div className={styles.actions}>
        {notice && <span className={styles.notice} role="status">{notice}</span>}
        {dirty && <button type="button" className={styles.save} disabled={!slotId||saving||(enabled&&!hours.length)} onClick={()=>void save()}>{saving?"กำลังบันทึก...":"บันทึกตารางเวลา"}</button>}
        {armed && <button type="button" className={styles.pause} disabled={pausing} onClick={()=>void pause()}>{pausing?"กำลังหยุด...":"ยกเลิก Auto Resume"}</button>}
      </div>}
    </div>
  );
}
