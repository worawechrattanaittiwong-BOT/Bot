"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
import { adminApi } from "../../../lib/api";
import { OwnerSidebar, OwnerMobileNav } from "../../../components/OwnerSidebar";
import { ScenovaBrand } from "../../../components/ScenovaBrand";
import css from "./page.module.css";

type ModeRow={mode:string;enabled:boolean;configured:number;running:number;draining:number;exposed:number;offline:number;reason:string|null};
const names:Record<string,string>={AUTO:"AUTO · VECTOR EDGE",RACE:"RACE",COUNTER:"COUNTER",FLIP_LOCK:"FLIP LOCK",ZERO_GRID:"ZERO GRID",MANUAL:"MANUAL"};
export default function TradingModeControlsPage(){
  const [rows,setRows]=useState<ModeRow[]>([]);
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [selected,setSelected]=useState<string|null>(null),[reason,setReason]=useState("");
  const [agreed,setAgreed]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  async function load(){
    setLoading(true);
    try{const result=await adminApi("/admin/trading-modes");setRows(result.modes||[]);setError("");}
    catch(e:any){setError(String(e.message||"โหลดสถานะไม่สำเร็จ"));}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);
  function logout(){localStorage.removeItem("bot_token");window.location.assign("/login");}
  const pending=rows.find(row=>row.mode===selected);
  async function confirmChange(){
    if(!pending||!agreed||busy||(pending.enabled&&!reason.trim()))return;
    setBusy(true);setError("");setNotice("");
    try{
      const response=await adminApi("/admin/trading-modes",{
        method:"POST",body:JSON.stringify({mode:pending.mode,enabled:!pending.enabled,
        reason:reason.trim()||"OWNER_REOPEN"})
      });
      setNotice(names[pending.mode]+(response.enabled?" เปิดใช้งานแล้ว":" ปิดและส่ง Safe Stop แล้ว")+
        " · ได้รับผลกระทบ "+Number(response.affected||0)+" บอท · ไม่มีการ Start อัตโนมัติ");
      setSelected(null);setAgreed(false);setReason("");
      await load();
    }catch(e:any){setError(String(e.message||"บันทึกไม่สำเร็จ"));}
    finally{setBusy(false);}
  }
  return <div className="app-wrap owner-app">
    <OwnerSidebar activeKey="trading-modes" onLogout={logout}/>
    <main className={"main app-main owner-main "+css.main}>
      <div className="mobile-only mobile-app-head">
        <div className="brand-lockup scenova-brand-lockup"><ScenovaBrand className="scenova-brand-logo-mobile"/></div>
        <button className="btn ghost" onClick={logout}>ออก</button>
      </div>
      <OwnerMobileNav activeKey="trading-modes"/>
      <div className={css.page}>
        <header className={css.header}>
          <div><small>SCENOVA / OWNER / TRADING SAFETY</small>
            <h1>จัดการโหมดการเทรด</h1>
            <p>ควบคุม AUTO, RACE, COUNTER, FLIP LOCK, ZERO GRID และ MANUAL รายโหมด ทั้ง Cloud และ Local</p>
          </div>
          <div className={css.actions}><Link href="/admin?view=overview" className={css.secondary}>← กลับหน้าแอดมิน</Link>
            <button type="button" className={css.secondary} onClick={()=>void load()} disabled={loading||busy}>↻ รีเฟรช</button>
          </div>
        </header>
        <section className={css.info}>
          <b>Safe Stop คืออะไร?</b>
          <p>ปิดโหมดแล้วไม่ให้ Start หรือเปลี่ยนเข้าโหมดนี้อีก บอทที่ RUNNING จะรับคำสั่ง Safe Stop เพื่อจัดการออเดอร์เดิมก่อนหยุด ไม่ใช้ Close All หรือปิด MT5</p>
          <p><b>ZERO GRID:</b> Safe Stop จากแอดมินจะยกเลิก Pending Orders ที่ยังไม่ถูกกระตุ้นเมื่อใช้ EA 1.1.31 ขึ้นไป ถ้ามี EA เก่าที่ยังทำงานอยู่ ระบบจะปฏิเสธการปิดโหมดนี้เพื่อความปลอดภัย</p>
          <p>ถ้า EA ขาดการเชื่อมต่อ ต้องรอ Heartbeat และยืนยันว่า Position/Pending เป็น 0 ก่อนถือว่าหยุดสำเร็จ การเปิดกลับไม่ทำให้บอทเริ่มเทรดเอง</p>
        </section>
        {error&&<div className={css.error} role="alert">{error}</div>}
        {notice&&<div className={css.notice} role="status">{notice}</div>}
        {loading?<p>กำลังโหลดสถานะ…</p>:
          <section className={css.grid}>
            {rows.map(mode=><article className={css.card} key={mode.mode}>
              <div className={css.row}><h2>{names[mode.mode]||mode.mode}</h2>
                <span className={mode.enabled?css.enabled:css.disabled}>{mode.enabled?"เปิดใช้งาน":"ปิดชั่วคราว"}</span>
              </div>
              <div className={css.stats}>
                <span>ตั้งค่าโหมดนี้ <b>{mode.configured}</b></span>
                <span>กำลังทำงาน/รอ Start <b>{mode.running}</b></span>
                <span>กำลัง Safe Stop <b>{mode.draining}</b></span>
                <span>มีออเดอร์จากรายงานล่าสุด <b>{mode.exposed}</b></span>
                <span>Heartbeat ไม่สด <b>{mode.offline}</b></span>
              </div>
              {!mode.enabled&&mode.reason&&<p className={css.explanation}>เหตุผล: {mode.reason}</p>}
              <button type="button" disabled={busy||Boolean(selected)}
                className={mode.enabled?css.danger:css.primary}
                onClick={()=>{setSelected(mode.mode);setReason("");setAgreed(false);setError("");setNotice("");}}>
                {mode.enabled?"ปิดโหมดแบบ Safe Stop":"เปิดโหมดกลับ"}
              </button>
            </article>)}
          </section>}
        {pending&&<section className={css.confirm}>
          <h2>{pending.enabled?"ยืนยันปิดโหมด":"ยืนยันเปิดโหมด"} {names[pending.mode]}</h2>
          <p>{pending.enabled?"บล็อก Start/การเลือกใหม่ และสั่ง Safe Stop ให้บอทที่กำลังทำงาน · ไม่บังคับปิด Position ทันที":
            "อนุญาตให้เลือกและ Start ใหม่ได้ โดยไม่สั่ง Start ให้ลูกค้าอัตโนมัติ"}</p>
          {pending.enabled&&<label className={css.field}>เหตุผลการปิด (บังคับกรอก)
            <textarea rows={2} maxLength={240} value={reason} onChange={e=>setReason(e.target.value)}
              placeholder="เช่น พักกลยุทธ์ระหว่างตรวจสอบความปลอดภัย"/>
          </label>}
          <label className={css.ack}><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)}/>
            รับทราบผลกระทบต่อลูกค้าและยืนยันการเปลี่ยนแปลงนี้</label>
          <div className={css.actions}>
            <button className={css.secondary} onClick={()=>setSelected(null)} disabled={busy}>ยกเลิก</button>
            <button className={pending.enabled?css.danger:css.primary} onClick={()=>void confirmChange()}
              disabled={!agreed||busy||(pending.enabled&&!reason.trim())}>
              {busy?"กำลังบันทึก…":pending.enabled?"ยืนยันปิดและ Safe Stop":"ยืนยันเปิดโหมด"}
            </button>
          </div>
        </section>}
        <p className={css.foot}>การตั้งค่านี้บังคับใช้จาก Backend/EA ไม่ได้ซ่อนเฉพาะปุ่ม · ค่าเริ่มต้นทุกโหมดเปิดอยู่</p>
      </div>
    </main>
  </div>;
}