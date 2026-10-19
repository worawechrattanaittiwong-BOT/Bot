"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import styles from "./TradingHoursSchedule.module.css";

type Props = {slotId:string;settings:any;onSaved:()=>Promise<any>};

const hours24 = Array.from({length:24},(_,h)=>h);
function time(hour:number) {return String(hour).padStart(2,"0")+":00";}
function todayHour() {
  return Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Bangkok",hour:"2-digit",hourCycle:"h23"}).format(new Date()));
}

export function TradingHoursSchedule({slotId,settings,onSaved}:Props) {
  const [enabled,setEnabled]=useState(true);
  const [hours,setHours]=useState<number[]>(hours24);
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState("");
  const [now,setNow]=useState(todayHour);
  // Unsaved RACE slots have always traded 24/7. Preserve that exact default
  // while showing all 24 hours checked until the customer narrows the window.
  const configured = typeof settings?.tradingScheduleEnabled === "boolean";
  const storedEnabled=configured ? settings.tradingScheduleEnabled === true : true;
  const storedHours=Array.isArray(settings?.tradingScheduleHours)
    ? settings.tradingScheduleHours.filter((h:any)=>Number.isInteger(h) && h>=0 && h<=23).sort((a:number,b:number)=>a-b)
    : hours24;
  const hourKey=storedHours.join(",");
  useEffect(()=>{
    setEnabled(storedEnabled);
    setHours(storedHours);
    setNotice("");
    // Reload on slot change or successful server refresh, not on every poll.
  },[slotId,storedEnabled,hourKey]);
  useEffect(()=>{
    const t=window.setInterval(()=>setNow(todayHour()),30_000);
    return()=>window.clearInterval(t);
  },[]);
  const selected=useMemo(()=>new Set(hours),[hours]);
  const dirty=enabled!==storedEnabled || hours.join(",")!==hourKey;
  const armed=settings?.tradingScheduleArmed===true;
  const waiting=settings?.tradingScheduleResumePending===true;
  const within=!storedEnabled || storedHours.includes(now);
  const [pausing,setPausing]=useState(false);
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
    if(!window.confirm("ยกเลิกการเริ่มอัตโนมัติ และสั่ง Safe Stop หากบอทกำลังทำงาน?")) return;
    setPausing(true);setNotice("");
    try {
      await api("/bot/schedule/pause?slotId="+encodeURIComponent(slotId),{method:"POST"});
      setNotice("ยกเลิก Auto Resume แล้ว · ต้องกด Start เองหากต้องการเทรดใหม่");
      await onSaved();
    }catch(e:any){setNotice("หยุดไม่สำเร็จ: "+String(e?.message||e));}
    finally {setPausing(false);}
  }
  return (
    <section className={styles.card} aria-label="ตารางเวลาทำงานโหมด RACE">
      <div className={styles.header}>
        <div>
          <h3>ตารางเวลาทำงาน RACE</h3>
          <p>ติ๊กชั่วโมงที่อนุญาตให้เปิดรอบเทรดใหม่ · เวลาไทย (UTC+7)</p>
        </div>
        <label className={styles.enable}><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/><span>เปิดใช้ตาราง</span></label>
      </div>
      <div className={styles.hours}>
        {hours24.map(h=>(
          <label key={h} className={styles.hour+" "+(selected.has(h)?styles.selected:"")}>
            <input type="checkbox" disabled={!enabled} checked={selected.has(h)}
              onChange={e=>setHours(prev=>e.target.checked?[...prev,h].sort((a,b)=>a-b):prev.filter(v=>v!==h))}/>
            <span>{time(h)}</span>
          </label>
        ))}
      </div>
      <div className={styles.controls}>
        <span>เลือกแล้ว {hours.length}/24 ชั่วโมง</span>
        <button type="button" onClick={()=>setHours([...hours24])} disabled={!enabled}>เลือกทั้งหมด</button>
        <button type="button" onClick={()=>setHours([])} disabled={!enabled}>ล้าง</button>
      </div>
      <div className={styles.status}>
        <b>สถานะ:</b>{" "}
        {!configured?"ค่าเริ่มต้น 24 ชั่วโมง · ปรับเลือกเวลาได้ภายหลัง":!storedEnabled?"ยังไม่เปิดใช้ตาราง":!armed?"รอกด Start ด้วยตัวเอง":!within?"นอกเวลาทำงาน · Safe Stop":waiting?"รอรอบเก่าปิดครบเพื่อเริ่มอัตโนมัติ":"อนุญาตให้เทรดตามตาราง"}
        {" · "}เวลาไทยปัจจุบัน {time(now)}
      </div>
      <p className={styles.help}>เมื่อพ้นเวลาที่ติ๊ก ระบบใช้ Safe Stop ไม่ใช่ Close All · เมื่อกลับเข้าชั่วโมงที่เลือก จะเริ่มเองเฉพาะเมื่อไม่มี Position/Pending Order ค้างและผ่านการตรวจสิทธิ์/ความเสี่ยง · ถ้ากดหยุดเองจะไม่เริ่มใหม่</p>
      {notice&&<p className={styles.notice} role="status">{notice}</p>}
      <div className={styles.actions}>
        <button type="button" className={styles.save} disabled={!slotId||!dirty||saving||(enabled&&!hours.length)} onClick={()=>void save()}>{saving?"กำลังบันทึก...":"บันทึกตารางเวลา"}</button>
        {armed&&<button type="button" className={styles.pause} disabled={pausing} onClick={()=>void pause()}>{pausing?"กำลังหยุด...":"ยกเลิก Auto Resume / หยุดเอง"}</button>}
      </div>
    </section>
  );
}
