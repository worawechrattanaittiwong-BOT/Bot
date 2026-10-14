"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import styles from "./ExnessSignupCard.module.css";

type TransferRequest = {
  id:string; accountNumber:string; accountLast4:string; partnerCode:string;
  status:"PREPARED"|"CUSTOMER_SUBMITTED"|"PARTNER_VISIBLE";
  customerSubmittedAt:string|null;partnerVisibleAt:string|null;lastCheckedAt:string|null;
};
type TransferInfo = {
  partnerCode:string;partnerActive:boolean;contactEmail:string;
  accounts:Array<{id:string;accountNumber:string;server:string}>;
  requests:TransferRequest[];exnessSubmissionSupported:boolean;note:string;
};

export function ExnessTransferModal({onClose}:{onClose:()=>void}) {
  const [info,setInfo]=useState<TransferInfo|null>(null);
  const [selected,setSelected]=useState("");
  const [manual,setManual]=useState("");
  const [consent,setConsent]=useState(false);
  const [current,setCurrent]=useState<TransferRequest|null>(null);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  useEffect(()=>{
    let mounted=true;
    api("/brokers/exness/transfer")
      .then((result:TransferInfo)=>{if(mounted){setInfo(result);
        const latest=result.requests[0] || null;
        const matched=result.accounts.find(a=>a.accountNumber===latest?.accountNumber);
        setCurrent(latest);
        setSelected(latest ? (matched?.id||"") : (result.accounts[0]?.id||""));
        setManual(latest && !matched ? latest.accountNumber : "");}})
      .catch((e:unknown)=>{if(mounted)setError(e instanceof Error?e.message:"โหลดข้อมูล Exness ไม่สำเร็จ");});
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose();};
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    window.addEventListener("keydown",onKey);
    return ()=>{mounted=false;document.body.style.overflow=previous;window.removeEventListener("keydown",onKey);};
  },[onClose]);

  async function prepare() {
    setBusy("prepare");setError("");setNotice("");
    try {
      const row=await api("/brokers/exness/transfer",{method:"POST",body:JSON.stringify({
        accountId:selected || undefined,
        accountNumber:selected ? undefined:manual.trim(),
        consent
      })});
      setCurrent(row);
      setNotice("เตรียมข้อความคำขอแล้ว · ยังไม่ได้ส่งไป Exness");
    } catch(e:unknown){setError(e instanceof Error?e.message:"เตรียมคำขอไม่สำเร็จ");}
    finally{setBusy("");}
  }

  async function act(kind:"submitted"|"check") {
    if(!current)return;
    setBusy(kind);setError("");setNotice("");
    try {
      const result=await api("/brokers/exness/transfer/"+encodeURIComponent(current.id)+"/"+kind,{method:"POST"});
      setCurrent(result);
      setNotice(kind==="submitted"?"บันทึกแล้วว่าคุณส่งคำขอไป Exness เอง · ยังไม่ใช่ผลอนุมัติ":result.matched?"พบเลขบัญชีนี้ในรายงาน Partner API ของ SCENOVA แล้ว":"ยังไม่พบบัญชีในรายงาน Partner API · ไม่ได้หมายความว่า Exness ปฏิเสธคำขอ");
    } catch(e:unknown){setError(e instanceof Error?e.message:"ตรวจสอบไม่สำเร็จ กรุณาลองใหม่ภายหลัง");}
    finally{setBusy("");}
  }

  const requestText=current && info ? `Dear Exness Support,\nI would like to request a partner change for my Exness trading account ${current.accountNumber}.\nNew partner code: ${current.partnerCode} (SCENOVA).\nMy contact email: ${info.contactEmail}.\nPlease advise the required identity verification and whether this transfer is permitted. I understand that Exness makes the final decision.\nThank you.` : "";
  async function copyRequest() {
    if(!requestText)return;
    try { await navigator.clipboard.writeText(requestText); setNotice("คัดลอกข้อความคำขอแล้ว นำไปส่งให้ Exness Support ด้วยตนเอง"); }
    catch {setError("คัดลอกไม่สำเร็จ กรุณาเลือกข้อความในช่องแล้วคัดลอกเอง");}
  }
  const status=current?.status==="PARTNER_VISIBLE"?"พบบัญชีในรายงานพาร์ตเนอร์แล้ว":current?.status==="CUSTOMER_SUBMITTED"?"ลูกค้าแจ้งว่าส่งคำขอแล้ว · รอ Exness":"เตรียมคำขอแล้ว · ยังไม่ได้ส่ง Exness";
  return <div className={styles.backdrop} role="presentation" onMouseDown={onClose}>
    <section className={`${styles.modal} ${styles.transferModal}`} role="dialog" aria-modal="true" aria-labelledby="exness-transfer-title" onMouseDown={event=>event.stopPropagation()}>
      <button type="button" className={styles.close} aria-label="ปิด" onClick={onClose}>×</button>
      <div className={styles.modalHead}><div className={styles.exnessMark}>E</div><div><span>SCENOVA · EXNESS</span><h2 id="exness-transfer-title">ขอย้ายพาร์ตเนอร์</h2></div></div>
      <p className={styles.transferExplanation}>SCENOVA จะช่วยเตรียมข้อมูลให้ แต่ Exness เป็นผู้รับคำขอ ตรวจสอบตัวตน และตัดสินอนุมัติเอง ไม่มีการส่งรหัสผ่านหรือ OTP ของคุณ</p>
      {error&&<p className={styles.error} role="alert">{error}</p>}
      {notice&&<p className={styles.transferNotice} role="status">{notice}</p>}
      {!info ? <p className={styles.transferExplanation}>กำลังโหลดบัญชี Exness...</p> : <>
        <div className={styles.partnerCode}><span>Partner Code ของ SCENOVA</span><b>{info.partnerCode || "ยังไม่ตั้งค่า"}</b></div>
        {!info.partnerActive&&<p className={styles.error}>ยังไม่เปิดใช้งานลิงก์พาร์ตเนอร์ กรุณาติดต่อผู้ดูแล SCENOVA</p>}
        <div className={styles.transferField}><span>บัญชี Exness ที่ต้องการย้าย</span>
          {info.accounts.length ? <select value={selected} onChange={e=>{setSelected(e.target.value);setCurrent(info.requests.find(x=>x.accountNumber===info.accounts.find(a=>a.id===e.target.value)?.accountNumber)||null);}}>
            {info.accounts.map(a=><option key={a.id} value={a.id}>{a.accountNumber} · {a.server||"Exness MT5"}</option>)}<option value="">กรอกเลขบัญชีเอง</option>
          </select> : <span className={styles.transferHint}>ยังไม่ได้เชื่อม Exness MT5 ใน SCENOVA กรอกเลขบัญชีของคุณได้</span>}
          {!selected&&<input inputMode="numeric" placeholder="เลขบัญชีเทรด Exness (ไม่ใช่รหัสผ่าน)" value={manual} onChange={e=>{setManual(e.target.value);setCurrent(info.requests.find(x=>x.accountNumber===e.target.value)||null);}} maxLength={20}/>}
        </div>
        <div className={styles.transferField}><span>อีเมลติดต่อใน SCENOVA</span><div className={styles.transferReadOnly}>{info.contactEmail||"ไม่ระบุ"}</div><small>หากอีเมล Exness ต่างกัน ให้แก้ในข้อความคำขอที่ส่ง Exness เอง</small></div>
        {!current && <><label className={styles.transferConsent}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>ฉันเป็นเจ้าของบัญชีนี้และยินยอมให้ SCENOVA จัดเก็บเลขบัญชีเพื่อตรวจสอบกับรายงานพาร์ตเนอร์ Exness</span></label><button className={styles.primary} type="button" disabled={!consent||!info.partnerActive||Boolean(busy)||(!selected&&!/^[0-9]{5,20}$/.test(manual))} onClick={()=>void prepare()}>{busy==="prepare"?"กำลังเตรียม...":"1. เตรียมคำขอย้ายพาร์ตเนอร์"}</button></>}
        {current&&<>
          <div className={styles.transferStatus}><b>สถานะ: {status}</b><span>บัญชีลงท้าย {current.accountNumber.slice(-4)} · การเห็นบัญชีในรายงานไม่ใช่หลักฐานอนุมัติคำขอย้าย</span></div>
          <label className={styles.transferField}><span>2. ข้อความที่ระบบเตรียมไว้</span><textarea readOnly rows={7} value={requestText}/></label>
          <div className={styles.transferActions}><button type="button" onClick={()=>void copyRequest()}>คัดลอกข้อความ</button><a href="https://my.exness.com/" target="_blank" rel="noopener noreferrer">เปิด Exness ↗</a></div>
          <p className={styles.transferExplanation}>เข้าสู่ Exness ด้วยบัญชีของคุณ ติดต่อฝ่ายสนับสนุน ส่งข้อความที่คัดลอกและยืนยันตัวตนตามที่ Exness ขอ ไม่มีการย้ายผ่าน API โดยตรงในขั้นตอนนี้</p>
          {current.status==="PREPARED"&&<button type="button" className={styles.primary} disabled={Boolean(busy)} onClick={()=>void act("submitted")}>3. ฉันส่งคำขอให้ Exness แล้ว</button>}
          {current.status!=="PREPARED"&&<button type="button" className={styles.primary} disabled={Boolean(busy)||current.status==="PARTNER_VISIBLE"} onClick={()=>void act("check")}>{busy==="check"?"กำลังตรวจรายงาน Exness...":"ตรวจสอบบัญชีกับ Exness API"}</button>}
        </>}
        {!!info.requests.length&&<div className={styles.transferHistory}><b>คำขอก่อนหน้า</b>{info.requests.slice(0,4).map(r=><button type="button" key={r.id} onClick={()=>{setCurrent(r);const match=info.accounts.find(a=>a.accountNumber===r.accountNumber);setSelected(match?.id||"");setManual(match?"":r.accountNumber);}}>{r.accountLast4} · {r.status==="PARTNER_VISIBLE"?"ปรากฏในรายงาน":r.status==="CUSTOMER_SUBMITTED"?"รอตรวจ Exness":"เตรียมไว้"}</button>)}</div>}
      </>}
    </section>
  </div>;
}
