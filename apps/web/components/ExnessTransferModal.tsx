"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import styles from "./ExnessSignupCard.module.css";

type TransferRequest = {
  id:string; accountNumber:string; accountLast4:string; partnerCode:string;
  newAccountNumber:string|null;newAccountLast4:string|null;
  status:"PREPARED"|"CUSTOMER_SUBMITTED"|"PARTNER_VISIBLE";
};
type TransferInfo = {
  partnerCode:string;partnerActive:boolean;
  accounts:Array<{id:string;accountNumber:string;server:string}>;
  requests:TransferRequest[];
};

// The official customer-specific link is issued by Exness, not by the partner API.
// This UI never sends an Exness ticket, impersonates the customer or stores OTP/tokens.
const EXNESS_PERSONAL_AREA = "https://my.exness.com/";

export function ExnessTransferModal({onClose}:{onClose:()=>void}) {
  const [info,setInfo]=useState<TransferInfo|null>(null);
  const [selected,setSelected]=useState("");
  const [manual,setManual]=useState("");
  const [consent,setConsent]=useState(false);
  const [current,setCurrent]=useState<TransferRequest|null>(null);
  const [newAccountId,setNewAccountId]=useState("");
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  useEffect(()=>{
    let mounted=true;
    api("/brokers/exness/transfer")
      .then((result:TransferInfo)=>{if(mounted){
        setInfo(result);
        const latest=result.requests[0]||null;
        const matched=result.accounts.find(a=>a.accountNumber===latest?.accountNumber);
        setCurrent(latest);
        setSelected(latest?(matched?.id||""):(result.accounts[0]?.id||""));
        setManual(latest&&!matched?latest.accountNumber:"");
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
        if(!consent)throw new Error("กรุณายืนยันว่าคุณเป็นเจ้าของบัญชีนี้");
        const row=await api("/brokers/exness/transfer",{
          method:"POST",
          body:JSON.stringify({accountId:selected||undefined,accountNumber:selected?undefined:manual.trim(),consent})
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
    if(!current||!newAccountId)return;
    setBusy("newAccount");setError("");setNotice("");
    try{
      const row=await api("/brokers/exness/transfer/"+encodeURIComponent(current.id)+"/new-account",{
        method:"POST",body:JSON.stringify({accountId:newAccountId})
      }) as TransferRequest;
      setCurrent(row);
      setNotice("บันทึกบัญชีใหม่แล้ว กดตรวจสอบสถานะได้เลย");
    }catch(e:unknown){setError(e instanceof Error?e.message:"บันทึกบัญชีใหม่ไม่สำเร็จ");}
    finally{setBusy("");}
  }

  function selectAccount(accountId:string){
    setSelected(accountId);setNewAccountId("");setNotice("");
    const account=info?.accounts.find(a=>a.id===accountId);
    if(account)setManual("");
    setCurrent(info?.requests.find(r=>r.accountNumber===(account?.accountNumber||manual.trim()))||null);
  }
  const newAccounts=(info?.accounts||[]).filter(a=>a.accountNumber!==current?.accountNumber);
  const validAccount=Boolean(selected||/^[0-9]{5,20}$/.test(manual.trim()));
  const status=current?.status==="PARTNER_VISIBLE"?"พบบัญชีใหม่แล้ว":current?.status==="CUSTOMER_SUBMITTED"?"รอผลจาก Exness":"ยังไม่ได้ยื่นคำขอที่ Exness";

  return <div className={styles.backdrop} role="presentation" onMouseDown={onClose}>
    <section className={`${styles.modal} ${styles.transferModal} ${styles.transferSimple}`} role="dialog" aria-modal="true" aria-labelledby="exness-transfer-title" onMouseDown={event=>event.stopPropagation()}>
      <button type="button" className={styles.close} aria-label="ปิด" onClick={onClose}>×</button>
      <div className={styles.modalHead}><div className={styles.exnessMark}>E</div><div><span>SCENOVA · EXNESS</span><h2 id="exness-transfer-title">ย้ายพาร์ตเนอร์ Exness</h2></div></div>
      <p className={styles.transferExplanation}>เลือกบัญชีของคุณ แล้วดำเนินการต่อที่ Exness</p>
      {error&&<p className={styles.error} role="alert">{error}</p>}
      {notice&&<p className={styles.transferNotice} role="status">{notice}</p>}
      {!info?<p className={styles.transferExplanation}>กำลังโหลดบัญชี...</p>:<>
        <div className={styles.transferDestination}><span>ย้ายไปยัง</span><b>SCENOVA</b><small>{info.partnerCode||""}</small></div>
        {!info.partnerActive&&<p className={styles.error}>ขณะนี้ยังไม่เปิดให้ย้ายพาร์ตเนอร์ กรุณาติดต่อ SCENOVA</p>}
        <label className={styles.transferField}><span>เลือกบัญชี Exness เดิม</span>
          {info.accounts.length>0?<select value={selected} onChange={e=>selectAccount(e.target.value)}>
            {info.accounts.map(a=><option key={a.id} value={a.id}>{a.accountNumber} · {a.server||"Exness"}</option>)}
            <option value="">กรอกเลขบัญชีเอง</option>
          </select>:<span className={styles.transferHint}>กรอกเลขบัญชี Exness ที่ต้องการย้าย</span>}
          {!selected&&<input inputMode="numeric" placeholder="เลขบัญชี Exness" value={manual} maxLength={20} onChange={e=>{setManual(e.target.value);setCurrent(info.requests.find(r=>r.accountNumber===e.target.value.trim())||null);}}/>}
        </label>
        {current&&<div className={styles.transferStatus}><b>{status}</b><span>บัญชีเดิม ••••{current.accountLast4}</span></div>}
        {!current&&<label className={styles.transferConsent}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>ฉันเป็นเจ้าของบัญชีนี้และยินยอมให้บันทึกข้อมูลคำขอ</span></label>}
        <button className={styles.primary} type="button" disabled={!info.partnerActive||Boolean(busy)||!validAccount||(!current&&!consent)} onClick={()=>void continueToExness()}>{busy==="continue"?"กำลังดำเนินการ...":"ดำเนินการต่อที่ Exness ↗"}</button>
        <p className={styles.transferMicrocopy}>เข้าสู่ระบบ Exness แล้วขอลิงก์ย้ายพาร์ตเนอร์เฉพาะบัญชีจากฝ่ายช่วยเหลือ จากนั้นยืนยันคำขอบน Exness</p>
        {current?.status==="PREPARED"&&<button type="button" className={styles.transferQuietButton} disabled={Boolean(busy)} onClick={()=>void act("submitted")}>ฉันส่งคำขอที่ Exness แล้ว</button>}
        {current?.status!==undefined&&current.status!=="PREPARED"&&<div className={styles.transferFollowup}>
          <b>หลัง Exness อนุมัติ</b>
          <p>สร้างบัญชีเทรดใหม่ใน Exness แล้วเชื่อมบัญชีนั้นกับ SCENOVA บัญชีเดิมจะยังอยู่กับพาร์ตเนอร์เดิม</p>
          <button type="button" className={styles.transferQuietButton} disabled={Boolean(busy)} onClick={()=>void refreshAccounts()}>{busy==="refresh"?"กำลังโหลด...":"รีเฟรชบัญชีที่เชื่อมไว้"}</button>
          <label className={styles.transferField}><span>บัญชี Exness ใหม่</span><select value={newAccountId} onChange={e=>setNewAccountId(e.target.value)}><option value="">เลือกบัญชีใหม่</option>{newAccounts.map(a=><option key={a.id} value={a.id}>{a.accountNumber} · {a.server||"Exness"}</option>)}</select></label>
          <button type="button" className={styles.primary} disabled={!newAccountId||Boolean(busy)} onClick={()=>void registerNewAccount()}>บันทึกบัญชีใหม่</button>
          {current.newAccountNumber&&<button type="button" className={styles.transferQuietButton} disabled={Boolean(busy)||current.status==="PARTNER_VISIBLE"} onClick={()=>void act("check")}>{busy==="check"?"กำลังตรวจสอบ...":"ตรวจสอบบัญชีใหม่ ••••"+current.newAccountLast4}</button>}
        </div>}
      </>}
    </section>
  </div>;
}
