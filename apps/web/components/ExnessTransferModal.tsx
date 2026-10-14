"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import styles from "./ExnessSignupCard.module.css";

type TransferRequest = {
  id:string; accountNumber:string; accountLast4:string; partnerCode:string;
  newAccountNumber:string|null;newAccountLast4:string|null;
  status:"PREPARED"|"CUSTOMER_SUBMITTED"|"PARTNER_VISIBLE";
  customerSubmittedAt:string|null;partnerVisibleAt:string|null;lastCheckedAt:string|null;
};
type TransferInfo = {
  partnerCode:string;partnerActive:boolean;contactEmail:string;
  accounts:Array<{id:string;accountNumber:string;server:string}>;
  requests:TransferRequest[];exnessSubmissionSupported:boolean;note:string;
};

// A change link is a 7-day, per-account Exness credential. It is never sent to our API,
// persisted in SCENOVA, inserted into logs, or embedded in the public website.
function validOfficialExnessLink(raw:string):string {
  try {
    const link=new URL(raw.trim());
    if(link.origin!=="https://my.exness.com"||link.pathname!=="/pa/cp_redirect"||
      link.username||link.password||link.hash||!link.searchParams.get("token")||
      [...link.searchParams.keys()].some(key=>key!=="token"))return "";
    return link.href;
  } catch {return "";}
}

export function ExnessTransferModal({onClose}:{onClose:()=>void}) {
  const [info,setInfo]=useState<TransferInfo|null>(null);
  const [selected,setSelected]=useState("");
  const [manual,setManual]=useState("");
  const [consent,setConsent]=useState(false);
  const [current,setCurrent]=useState<TransferRequest|null>(null);
  const [newAccountId,setNewAccountId]=useState("");
  const [officialLink,setOfficialLink]=useState("");
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
      setCurrent(row);setOfficialLink("");
      setNotice("เตรียมข้อมูลแล้ว · ยังไม่ได้ส่งคำขอไป Exness กรุณารับลิงก์ส่วนตัวจาก Exness");
    } catch(e:unknown){setError(e instanceof Error?e.message:"เตรียมคำขอไม่สำเร็จ");}
    finally{setBusy("");}
  }

  async function act(kind:"submitted"|"check") {
    if(!current)return;
    setBusy(kind);setError("");setNotice("");
    try {
      const result=await api("/brokers/exness/transfer/"+encodeURIComponent(current.id)+"/"+kind,{method:"POST"});
      setCurrent(result);
      setNotice(kind==="submitted"
        ? "บันทึกว่าคุณแจ้งว่าส่งคำขอให้ Exness แล้ว · ยังไม่ใช่การยืนยันอนุมัติจาก Exness"
        : result.matched
          ? "พบเลขบัญชีเทรดใหม่ในรายงาน Partner API ของ SCENOVA แล้ว · ไม่ใช่หลักฐานอนุมัติ Ticket อย่างเป็นทางการ"
          : "ยังไม่พบบัญชีเทรดใหม่ในรายงาน Partner API · ไม่ได้หมายความว่า Exness ปฏิเสธคำขอ");
    } catch(e:unknown){setError(e instanceof Error?e.message:"ตรวจสอบไม่สำเร็จ กรุณาลองใหม่ภายหลัง");}
    finally{setBusy("");}
  }

  async function refreshAccounts() {
    setBusy("refresh");setError("");
    try{
      const result=await api("/brokers/exness/transfer") as TransferInfo;
      setInfo(result);
      const updated=result.requests.find(r=>r.id===current?.id);
      if(updated)setCurrent(updated);
      setNotice("อัปเดตรายการบัญชี Exness ที่เชื่อม SCENOVA แล้ว");
    }catch(e:unknown){setError(e instanceof Error?e.message:"โหลดรายการบัญชี Exness ไม่สำเร็จ");}
    finally{setBusy("");}
  }

  async function registerNewAccount() {
    if(!current||!newAccountId)return;
    setBusy("newAccount");setError("");setNotice("");
    try{
      const result=await api("/brokers/exness/transfer/"+encodeURIComponent(current.id)+"/new-account",{
        method:"POST",body:JSON.stringify({accountId:newAccountId})
      }) as TransferRequest;
      setCurrent(result);
      setNotice("บันทึกบัญชีเทรดใหม่แล้ว · กดตรวจสอบกับ Exness API เพื่อยืนยันว่าอยู่ใต้พาร์ตเนอร์ SCENOVA");
    }catch(e:unknown){setError(e instanceof Error?e.message:"บันทึกบัญชีใหม่ไม่สำเร็จ");}
    finally{setBusy("");}
  }

  const requestText=current && info ? `Dear Exness Support,\nI own Exness trading account ${current.accountNumber}. I want to request a partner change to SCENOVA.\nNew partner code: ${current.partnerCode}.\nPlease provide the official, account-specific partner change request link and the identity verification instructions. I understand that approval is at Exness's discretion, and that I must create a new trading account after approval; existing accounts stay under the old partner.\nThank you.` : "";
  async function copyRequest() {
    if(!requestText)return;
    try { await navigator.clipboard.writeText(requestText); setNotice("คัดลอกข้อความแล้ว · ส่งให้เจ้าหน้าที่ Exness เพื่อขอลิงก์เฉพาะบัญชีของคุณ"); }
    catch {setError("คัดลอกไม่สำเร็จ กรุณาเลือกข้อความในช่องแล้วคัดลอกเอง");}
  }
  const status=current?.status==="PARTNER_VISIBLE"?"พบบัญชีเทรดใหม่ในรายงาน SCENOVA แล้ว":current?.status==="CUSTOMER_SUBMITTED"?"ลูกค้าแจ้งว่าส่งคำขอแล้ว · รอผล Exness":"เตรียมคำขอแล้ว · ยังไม่ได้ส่ง Exness";
  const newAccountOptions=(info?.accounts||[]).filter(a=>a.accountNumber!==current?.accountNumber);
  const linkValid=Boolean(validOfficialExnessLink(officialLink));

  return <div className={styles.backdrop} role="presentation" onMouseDown={onClose}>
    <section className={`${styles.modal} ${styles.transferModal}`} role="dialog" aria-modal="true" aria-labelledby="exness-transfer-title" onMouseDown={event=>event.stopPropagation()}>
      <button type="button" className={styles.close} aria-label="ปิด" onClick={onClose}>×</button>
      <div className={styles.modalHead}><div className={styles.exnessMark}>E</div><div><span>SCENOVA · EXNESS</span><h2 id="exness-transfer-title">ขอย้ายพาร์ตเนอร์ Exness</h2></div></div>
      <p className={styles.transferExplanation}>Exness เป็นผู้รับคำขอและอนุมัติเอง · ลิงก์ขอย้ายออกให้เฉพาะแต่ละบัญชีและมีอายุ 7 วัน · SCENOVA ไม่รับรหัสผ่าน รหัสยืนยัน หรือโทเคนผ่านเซิร์ฟเวอร์</p>
      <p className={styles.transferWarning}><b>สำคัญ:</b> เมื่อ Exness อนุมัติ ให้ล้างแคชและคุกกี้ของเบราว์เซอร์แล้วสร้างบัญชีเทรด <b>ใหม่</b> ในพื้นที่ส่วนบุคคล Exness เพราะบัญชีเก่าจะยังอยู่กับพาร์ตเนอร์เดิม</p>
      {error&&<p className={styles.error} role="alert">{error}</p>}
      {notice&&<p className={styles.transferNotice} role="status">{notice}</p>}
      {!info ? <p className={styles.transferExplanation}>กำลังโหลดบัญชี Exness...</p> : <>
        <div className={styles.partnerCode}><span>รหัสพาร์ตเนอร์ SCENOVA</span><b>{info.partnerCode || "ยังไม่ตั้งค่า"}</b></div>
        {!info.partnerActive&&<p className={styles.error}>ยังไม่เปิดรับคำขอย้ายพาร์ตเนอร์ใน SCENOVA กรุณาติดต่อผู้ดูแล</p>}
        <div className={styles.transferField}><span>บัญชี Exness เดิมที่ต้องการยื่นคำขอ</span>
          {info.accounts.length ? <select value={selected} onChange={e=>{setSelected(e.target.value);setCurrent(info.requests.find(x=>x.accountNumber===info.accounts.find(a=>a.id===e.target.value)?.accountNumber)||null);setOfficialLink("");setNewAccountId("");}}>
            {info.accounts.map(a=><option key={a.id} value={a.id}>{a.accountNumber} · {a.server||"Exness MT5"}</option>)}<option value="">กรอกเลขบัญชีเอง</option>
          </select> : <span className={styles.transferHint}>หากยังไม่ได้เชื่อมบัญชี Exness MT5 ใน SCENOVA สามารถกรอกเลขบัญชีเดิมได้</span>}
          {!selected&&<input inputMode="numeric" placeholder="เลขบัญชีเทรด Exness เดิม (ไม่ใช่รหัสผ่าน)" value={manual} onChange={e=>{setManual(e.target.value);setCurrent(info.requests.find(x=>x.accountNumber===e.target.value)||null);setOfficialLink("");}} maxLength={20}/>}
        </div>
        <div className={styles.transferField}><span>อีเมลติดต่อใน SCENOVA</span><div className={styles.transferReadOnly}>{info.contactEmail||"ไม่ระบุ"}</div><small>ใช้บัญชีและอีเมล Exness ที่เป็นเจ้าของจริงเมื่อส่งคำขอ</small></div>
        {!current && <><label className={styles.transferConsent}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>ฉันเป็นเจ้าของบัญชีนี้ ยินยอมให้ SCENOVA เก็บเลขบัญชีเพื่อช่วยติดตาม และเข้าใจว่า Exness จะพิจารณาคำขอเอง</span></label><button className={styles.primary} type="button" disabled={!consent||!info.partnerActive||Boolean(busy)||(!selected&&!/^[0-9]{5,20}$/.test(manual))} onClick={()=>void prepare()}>{busy==="prepare"?"กำลังเตรียม...":"1. เตรียมคำขอสำหรับบัญชีนี้"}</button></>}
        {current&&<>
          <div className={styles.transferStatus}><b>สถานะ: {status}</b><span>บัญชีเดิมลงท้าย {current.accountLast4} · SCENOVA ไม่มีข้อมูลยืนยันสถานะ Ticket จาก Exness</span></div>
          <div className={styles.transferStep}><b>2. รับลิงก์ส่วนตัวจาก Exness และส่งคำขอ</b><p>ขอลิงก์ขอย้ายพาร์ตเนอร์สำหรับบัญชีนี้จากฝ่ายสนับสนุน Exness (ไม่ใช้ลิงก์ของบุคคลอื่น) แล้วกรอกเฉพาะบนหน้า Exness: ส่วนที่ 1 และ 2 จำเป็น ส่วนที่ 3 และ 4 ไม่บังคับ กดส่งคำขอ → ยืนยันด้วยรหัสที่ Exness ส่งให้ → กดดำเนินการต่อ</p>
            <label className={styles.transferField}><span>ลิงก์ส่วนตัวที่ Exness ออกให้บัญชีของคุณ (ไม่บันทึกใน SCENOVA)</span><input type="password" autoComplete="off" spellCheck={false} placeholder="https://my.exness.com/pa/cp_redirect?token=..." value={officialLink} onChange={e=>setOfficialLink(e.target.value)}/></label>
            {officialLink&&!linkValid&&<small className={styles.transferHint}>ต้องเป็นลิงก์เฉพาะบัญชีจาก my.exness.com/pa/cp_redirect เท่านั้น</small>}
            {linkValid&&<a href={validOfficialExnessLink(officialLink)} target="_blank" rel="noreferrer noopener" className={styles.transferOfficialButton} onClick={()=>setOfficialLink("")}>เปิดแบบฟอร์มขอย้ายที่ Exness ↗</a>}
            <p>ลิงก์ใช้ได้ 7 วันและเป็นข้อมูลส่วนตัว เปิดในบัญชี Exness ที่ถูกต้อง ห้ามแชร์ให้คนอื่น Exness จะพิจารณาประมาณ 3 วันทำการ และสามารถตรวจสถานะผ่านลิงก์เดิม</p>
          </div>
          <details className={styles.transferHelp}><summary>ยังไม่ได้รับลิงก์? คัดลอกข้อความขอลิงก์ส่งเจ้าหน้าที่ Exness</summary><textarea readOnly rows={6} value={requestText} className={styles.transferHelpText}/><div className={styles.transferActions}><button type="button" onClick={()=>void copyRequest()}>คัดลอกข้อความขอลิงก์</button><a href="https://my.exness.com/" target="_blank" rel="noopener noreferrer">เข้าสู่ Exness ↗</a></div></details>
          {current.status==="PREPARED"&&<button type="button" className={styles.primary} disabled={Boolean(busy)} onClick={()=>void act("submitted")}>3. ฉันยืนยันและส่งคำขอใน Exness แล้ว</button>}
          {current.status!=="PREPARED"&&<div className={styles.transferStep}>
            <b>4. หลัง Exness อนุมัติ ให้สร้างบัญชีเทรดใหม่</b><p>รอผลจาก Exness ก่อน (โดยทั่วไปภายใน 3 วันทำการ) แล้วล้างแคช/คุกกี้ สร้างบัญชีเทรดใหม่จากพื้นที่ส่วนบุคคล Exness และเชื่อมบัญชีใหม่นี้เข้ากับ SCENOVA บัญชีเก่าจะไม่ย้ายตาม</p>
            <div className={styles.transferActions}><button type="button" disabled={Boolean(busy)} onClick={()=>void refreshAccounts()}>{busy==="refresh"?"กำลังอัปเดต...":"อัปเดตบัญชีที่เชื่อม SCENOVA"}</button></div>
            <label className={styles.transferField}><span>เลือกบัญชีเทรดใหม่ (ไม่ใช่บัญชีเดิม)</span><select value={newAccountId} onChange={e=>setNewAccountId(e.target.value)}><option value="">เลือกบัญชี Exness ใหม่ที่เชื่อมไว้</option>{newAccountOptions.map(a=><option key={a.id} value={a.id}>{a.accountNumber} · {a.server||"Exness MT5"}</option>)}</select></label>
            {!newAccountOptions.length&&<p>ยังไม่มีบัญชีใหม่เชื่อมกับ SCENOVA กรุณาเชื่อมบัญชี Exness ใหม่ในหน้าเชื่อม MT5 ก่อน</p>}
            <button type="button" className={styles.primary} disabled={!newAccountId||Boolean(busy)} onClick={()=>void registerNewAccount()}>บันทึกเลขบัญชีใหม่สำหรับตรวจสอบ</button>
            {current.newAccountNumber&&<><p>กำลังตรวจบัญชีเทรดใหม่ลงท้าย <b>{current.newAccountLast4}</b> (ไม่ใช่บัญชีเก่า)</p><button type="button" className={styles.primary} disabled={Boolean(busy)||current.status==="PARTNER_VISIBLE"} onClick={()=>void act("check")}>{busy==="check"?"กำลังตรวจรายงาน Exness...":"5. ตรวจบัญชีใหม่กับ Exness API"}</button></>}
          </div>}
        </>}
        {!!info.requests.length&&<div className={styles.transferHistory}><b>คำขอก่อนหน้า</b>{info.requests.slice(0,4).map(r=><button type="button" key={r.id} onClick={()=>{setCurrent(r);const match=info.accounts.find(a=>a.accountNumber===r.accountNumber);setSelected(match?.id||"");setManual(match?"":r.accountNumber);setOfficialLink("");setNewAccountId("");}}>{r.accountLast4} · {r.status==="PARTNER_VISIBLE"?"พบบัญชีใหม่ในรายงาน":r.status==="CUSTOMER_SUBMITTED"?"แจ้งว่าส่งคำขอแล้ว":"เตรียมไว้"}</button>)}</div>}
      </>}
    </section>
  </div>;
}
