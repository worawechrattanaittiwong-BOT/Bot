"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import styles from "./ExnessSignupCard.module.css";

type TransferRequest = {
  id:string; accountNumber:string|null; accountLast4:string|null; partnerCode:string; customerSubmittedAt:string|null;
  newAccountNumber:string|null;newAccountLast4:string|null;
  status:"PREPARED"|"CUSTOMER_SUBMITTED"|"PARTNER_VISIBLE";
};
type TransferInfo = {
  partnerCode:string;partnerActive:boolean;
  accounts:Array<{id:string;accountNumber:string;server:string;linkedAt:string|null}>;
  requests:TransferRequest[];
};

// The official customer-specific link is issued by Exness, not by the partner API.
// This UI never sends an Exness ticket, impersonates the customer or stores OTP/tokens.
const EXNESS_PERSONAL_AREA = "https://my.exness.com/";

export function ExnessTransferModal({onClose}:{onClose:()=>void}) {
  const [info,setInfo]=useState<TransferInfo|null>(null);
  const [consent,setConsent]=useState(false);
  const [current,setCurrent]=useState<TransferRequest|null>(null);
  const [newAccountId,setNewAccountId]=useState("");
  const [confirmedApproved,setConfirmedApproved]=useState(false);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [codeCopied,setCodeCopied]=useState(false);
  const [chatCopied,setChatCopied]=useState(false);

  useEffect(()=>{
    let mounted=true;
    api("/brokers/exness/transfer")
      .then((result:TransferInfo)=>{if(mounted){
        setInfo(result);
        setCurrent(result.requests.find(r=>r.accountNumber===null)||null);
      }})
      .catch((e:unknown)=>{if(mounted)setError(e instanceof Error?e.message:"โหลดบัญชี Exness ไม่สำเร็จ");});
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose();};
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    window.addEventListener("keydown",onKey);
    return()=>{mounted=false;document.body.style.overflow=previous;window.removeEventListener("keydown",onKey);};
  },[onClose]);

  async function continueToExness() {
    if(!info?.partnerActive)return;
    setBusy("continue");setError("");setNotice("");
    try {
      if(!current){
        if(!consent)throw new Error("กรุณายืนยันว่าคุณเป็นเจ้าของบัญชี Exness");
        const row=await api("/brokers/exness/transfer",{
          method:"POST",
          body:JSON.stringify({consent})
        }) as TransferRequest;
        setCurrent(row);
      }
      // Only prepare the request via SCENOVA's authenticated API. Exness accepts
      // an actual transfer request only after the customer authenticates there.
      window.location.assign(EXNESS_PERSONAL_AREA);
    }catch(e:unknown){setError(e instanceof Error?e.message:"เริ่มดำเนินการไม่สำเร็จ");setBusy("");}
  }

  async function act(kind:"submitted"|"check") {
    if(!current)return;
    setBusy(kind);setError("");setNotice("");
    try {
      const row=await api("/brokers/exness/transfer/"+encodeURIComponent(current.id)+"/"+kind,{method:"POST"}) as TransferRequest&{matched?:boolean};
      setCurrent(row);
      setNotice(kind==="submitted"?"บันทึกแล้ว · รอผลการพิจารณาจาก Exness":row.matched?"พบบัญชีใหม่ภายใต้พาร์ตเนอร์ SCENOVA แล้ว":"ยังไม่พบบัญชีใหม่ กรุณาลองตรวจอีกครั้งภายหลัง");
    }catch(e:unknown){setError(e instanceof Error?e.message:"ดำเนินการไม่สำเร็จ");}
    finally{setBusy("");}
  }

  async function refreshAccounts() {
    setBusy("refresh");setError("");
    try{
      const result=await api("/brokers/exness/transfer") as TransferInfo;
      setInfo(result);
      const updated=result.requests.find(r=>r.id===current?.id);
      if(updated)setCurrent(updated);
      setNotice("อัปเดตรายการบัญชีแล้ว");
    }catch(e:unknown){setError(e instanceof Error?e.message:"โหลดบัญชีไม่สำเร็จ");}
    finally{setBusy("");}
  }

  async function registerNewAccount() {
    if(!current||!newAccountId||!confirmedApproved)return;
    setBusy("newAccount");setError("");setNotice("");
    try{
      const row=await api("/brokers/exness/transfer/"+encodeURIComponent(current.id)+"/new-account",{
        method:"POST",body:JSON.stringify({accountId:newAccountId,confirmedApproved:true})
      }) as TransferRequest;
      setCurrent(row);
      setNotice("บันทึกบัญชีเทรดใหม่แล้ว กดตรวจสอบว่าบัญชีนี้อยู่ภายใต้พาร์ตเนอร์ SCENOVA หรือไม่");
    }catch(e:unknown){setError(e instanceof Error?e.message:"บันทึกบัญชีใหม่ไม่สำเร็จ");}
    finally{setBusy("");}
  }

  async function copyPartnerCode() {
    const partnerCode=info?.partnerCode?.trim();
    if(!partnerCode)return;
    try {
      await navigator.clipboard.writeText(partnerCode);
      setCodeCopied(true);
      setError("");
    } catch {
      setCodeCopied(false);
      setError("ไม่สามารถคัดลอกรหัสได้ กรุณาเลือกข้อความแล้วคัดลอกด้วยตนเอง");
    }
  }

  async function copyChatMessage() {
    if(!chatMessage)return;
    try {
      await navigator.clipboard.writeText(chatMessage);
      setChatCopied(true);
      setError("");
    } catch {
      setChatCopied(false);
      setError("คัดลอกไม่สำเร็จ กรุณาเลือกข้อความในช่องแล้วคัดลอกด้วยตนเอง");
    }
  }

  const newAccounts=(info?.accounts||[]).filter(a=>!current?.customerSubmittedAt||(!!a.linkedAt&&new Date(a.linkedAt).getTime()>new Date(current.customerSubmittedAt).getTime()));
  const status=current?.status==="PARTNER_VISIBLE"?"พบบัญชีเทรดใหม่ภายใต้ SCENOVA แล้ว":current?.status==="CUSTOMER_SUBMITTED"?"คุณแจ้งว่าส่งคำขอแล้ว · รอ Exness พิจารณา":"ยังไม่ได้แจ้งว่าส่งคำขอที่ Exness";
  const chatMessage=info?.partnerCode?[
    "สวัสดีทีมงาน Exness",
    "ฉันต้องการขอเปลี่ยนพาร์ตเนอร์ของบัญชี Exness (Personal Area) ไปยัง SCENOVA",
    "พาร์ตเนอร์ใหม่: SCENOVA",
    "รหัสพาร์ตเนอร์ใหม่: " + info.partnerCode,
    "รบกวนส่งลิงก์คำขอเปลี่ยนพาร์ตเนอร์เฉพาะบัญชี Exness ของฉัน และแจ้งขั้นตอนยืนยันตัวตนให้ด้วย",
    "ขอบคุณครับ/ค่ะ"
  ].join("\n"):"";

  return <div className={styles.backdrop} role="presentation" onMouseDown={onClose}>
    <section className={`${styles.modal} ${styles.transferModal} ${styles.transferSimple}`} role="dialog" aria-modal="true" aria-labelledby="exness-transfer-title" onMouseDown={event=>event.stopPropagation()}>
      <button type="button" className={styles.close} aria-label="ปิด" onClick={onClose}>×</button>
      <div className={styles.modalHead}><div className={styles.exnessMark}>E</div><div><span>SCENOVA · EXNESS</span><h2 id="exness-transfer-title">ย้ายพาร์ตเนอร์ Exness</h2></div></div>
      <p className={styles.transferExplanation}>การขอเปลี่ยนพาร์ตเนอร์ทำผ่านบัญชี Exness (Personal Area) ไม่ต้องเลือกบัญชีเทรด MT5 เดิม</p>
      {error&&<p className={styles.error} role="alert">{error}</p>}
      {notice&&<p className={styles.transferNotice} role="status">{notice}</p>}
      {!info?<p className={styles.transferExplanation}>กำลังโหลดบัญชี...</p>:<>
        <div className={styles.transferDestination}>
          <div className={styles.transferDestinationName}>
            <span>ย้ายไปยัง</span>
            <strong>SCENOVA</strong>
          </div>
          <div className={styles.transferCodeCard}>
            <span>รหัสพาร์ตเนอร์</span>
            <div className={styles.transferCodeRow}>
              <strong className={styles.transferCodeText}>{info.partnerCode||"ยังไม่ได้กำหนด"}</strong>
              <button className={styles.transferCopyButton} type="button" disabled={!info.partnerCode} onClick={()=>void copyPartnerCode()} aria-label="คัดลอกรหัสพาร์ตเนอร์">{codeCopied?"คัดลอกแล้ว ✓":"คัดลอก"}</button>
            </div>
          </div>
        </div>
        {!info.partnerActive&&<p className={styles.error}>ขณะนี้ยังไม่เปิดให้ย้ายพาร์ตเนอร์ กรุณาติดต่อ SCENOVA</p>}
        <p className={styles.transferExplanation}>เมื่อ Exness อนุมัติแล้ว บัญชีเทรดเดิมจะยังคงอยู่กับพาร์ตเนอร์เดิม กรุณาสร้างบัญชีเทรดใหม่ใน Exness เพื่อใช้พาร์ตเนอร์ SCENOVA</p>
        {current&&<div className={styles.transferStatus}><b>{status}</b><span>คำขอเปลี่ยนพาร์ตเนอร์บัญชี Exness</span></div>}
        <section className={styles.transferGuide} aria-label="ขั้นตอนการย้ายพาร์ตเนอร์">
          <h3>ขั้นตอนการย้ายพาร์ตเนอร์</h3>
          <ol>
            <li><b>ขอเปลี่ยนพาร์ตเนอร์บัญชี Exness</b><span>ใช้บัญชี Exness (Personal Area) ของคุณและรหัสพาร์ตเนอร์ SCENOVA ไม่ต้องเลือกบัญชี MT5</span></li>
            <li><b>ส่งข้อความหา Exness</b><span>กดคัดลอกข้อความด้านล่าง แล้วนำไปส่งในแชตฝ่ายช่วยเหลือ Exness</span></li>
            <li><b>ยืนยันคำขอบน Exness</b><span>รับลิงก์เฉพาะบัญชี (ใช้ได้ 7 วัน) กรอกส่วนที่ 1–2 แล้วกดส่ง ยืนยันรหัสความปลอดภัย และกดดำเนินการต่อ</span></li>
            <li><b>รอ Exness พิจารณา</b><span>ประมาณ 3 วันทำการ ตรวจผลผ่านลิงก์เดิม เมื่ออนุมัติแล้วให้สร้างบัญชีเทรดใหม่และกลับมาตรวจบัญชีใหม่ใน SCENOVA</span></li>
          </ol>
        </section>
        <section className={styles.transferChatCard} aria-label="ข้อความสำหรับส่งในแชต Exness">
          <div className={styles.transferChatHeading}><b>ข้อความส่งให้เจ้าหน้าที่ Exness</b><span>ใช้รหัสพาร์ตเนอร์ SCENOVA</span></div>
          <textarea className={styles.transferChatMessage} readOnly rows={6} value={chatMessage} placeholder="ข้อความขอเปลี่ยนพาร์ตเนอร์บัญชี Exness" aria-label="ข้อความขอย้ายพาร์ตเนอร์สำหรับส่งในแชต Exness" />
          <button type="button" className={styles.transferChatCopyButton} disabled={!chatMessage} onClick={()=>void copyChatMessage()}>{chatCopied?"คัดลอกข้อความแล้ว ✓":"คัดลอกข้อความส่งแชต Exness"}</button>
        </section>
        {!current&&<label className={styles.transferConsent}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>ฉันเป็นเจ้าของบัญชี Exness ที่จะใช้ยื่นคำขอ และยินยอมให้ SCENOVA บันทึกสถานะคำขอ</span></label>}
        <button className={styles.primary} type="button" disabled={!info.partnerActive||Boolean(busy)||(!current&&!consent)} onClick={()=>void continueToExness()}>{busy==="continue"?"กำลังดำเนินการ...":"ดำเนินการต่อที่ Exness ↗"}</button>
        <p className={styles.transferMicrocopy}>หลังคัดลอกข้อความ ให้กดเปิด Exness แล้วส่งข้อความในแชตฝ่ายช่วยเหลือด้วยตนเอง</p>
        {current?.status==="PREPARED"&&<button type="button" className={styles.transferQuietButton} disabled={Boolean(busy)} onClick={()=>void act("submitted")}>ฉันส่งคำขอที่ Exness แล้ว</button>}
        {current?.status!==undefined&&current.status!=="PREPARED"&&<div className={styles.transferFollowup}>
          <b>ขั้นตอนหลัง Exness ยืนยันว่าอนุมัติแล้ว</b>
          <p>เมื่อ Exness ยืนยันอนุมัติ ให้สร้างบัญชีเทรดใหม่ใน Exness และเชื่อมบัญชีใหม่นั้นกับ SCENOVA บัญชีเทรดเดิมยังอยู่กับ IB เดิม การกดตรวจสอบเป็นการตรวจบัญชีเทรดใหม่ ไม่ใช่ตรวจสถานะอนุมัติคำขอ</p>
          <a href="/dashboard?view=account">ไปหน้าเชื่อมบัญชี MT5 ใหม่ ↗</a>
          <button type="button" className={styles.transferQuietButton} disabled={Boolean(busy)} onClick={()=>void refreshAccounts()}>{busy==="refresh"?"กำลังโหลด...":"รีเฟรชบัญชีที่เชื่อมไว้"}</button>
          <label className={styles.transferField}><span>บัญชีเทรด Exness ใหม่ (ที่เชื่อมหลังส่งคำขอ)</span><select value={newAccountId} onChange={e=>setNewAccountId(e.target.value)}><option value="">เลือกบัญชีใหม่</option>{newAccounts.map(a=><option key={a.id} value={a.id}>{a.accountNumber} · {a.server||"Exness"}</option>)}</select></label>
          <label className={styles.transferConsent}><input type="checkbox" checked={confirmedApproved} onChange={e=>setConfirmedApproved(e.target.checked)}/><span>Exness อนุมัติคำขอแล้ว และบัญชีเทรดที่เลือกถูกสร้างใหม่หลังการอนุมัติ</span></label>
          <button type="button" className={styles.primary} disabled={!newAccountId||!confirmedApproved||Boolean(busy)} onClick={()=>void registerNewAccount()}>บันทึกบัญชีเทรดใหม่</button>
          {current.newAccountNumber&&<button type="button" className={styles.transferQuietButton} disabled={Boolean(busy)||current.status==="PARTNER_VISIBLE"} onClick={()=>void act("check")}>{busy==="check"?"กำลังตรวจสอบ...":"ตรวจสอบบัญชีใหม่ ••••"+current.newAccountLast4}</button>}
        </div>}
      </>}
    </section>
  </div>;
}
