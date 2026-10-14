"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { CustomerMobileNav, CustomerSidebar } from "./OwnerSidebar";
import { ExnessSignupCard } from "./ExnessSignupCard";
import styles from "../app/broker/customer.module.css";

type CustomerBrokerSummary = {
  provider?:{ active:boolean;registrationAvailable:boolean;partnerCode:string;benefitMessage:string};
  connectedAccounts?:Array<{id:string;accountLast4:string;server:string;mode:string;status:string}>;
  partner?:{status:string;verified:boolean;verifiedAt:string|null;benefit?:{levelName:string;discountPercent:number}|null};
};
type TransferSummary = {
  status:"PREPARED"|"CUSTOMER_SUBMITTED"|"PARTNER_VISIBLE";
  accountLast4:string;newAccountLast4:string|null;createdAt:string;
};
const statusLabels:Record<string,string>={
  VERIFIED:"ยืนยันการเชื่อมกับ SCENOVA แล้ว",
  PENDING:"รอตรวจสอบการเชื่อม",
  NOT_LINKED:"ยังไม่พบการเชื่อมกับพาร์ตเนอร์",
  SUSPENDED:"สิทธิ์การเชื่อมถูกระงับ",
  NOT_CHECKED:"ยังไม่ได้ตรวจสอบ"
};
const requestLabels:Record<TransferSummary["status"],string>={
  PREPARED:"เตรียมข้อมูลแล้ว · ยังไม่ได้ยื่นที่ Exness",
  CUSTOMER_SUBMITTED:"คุณแจ้งว่ายื่นคำขอแล้ว · โปรดตรวจผลที่ Exness",
  PARTNER_VISIBLE:"พบบัญชีเทรดใหม่ของคุณแล้ว"
};

function logout() {
  localStorage.removeItem("bot_token");
  sessionStorage.removeItem("scenova_2fa_challenge");
  sessionStorage.removeItem("scenova_2fa_email");
  window.location.replace("/login");
}

export function CustomerBrokerCenter({userCode}:{userCode:string}) {
  const [summary,setSummary]=useState<CustomerBrokerSummary|null>(null);
  const [transfers,setTransfers]=useState<TransferSummary[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [requestError,setRequestError]=useState("");

  useEffect(()=>{
    let mounted=true;
    Promise.allSettled([api("/brokers/exness"),api("/brokers/exness/transfer")]).then(([broker,requests])=>{
      if(!mounted)return;
      if(broker.status==="fulfilled")setSummary(broker.value as CustomerBrokerSummary);
      else setError("ยังโหลดสถานะพาร์ตเนอร์ไม่ได้ ลองเปิดหน้าใหม่อีกครั้ง");
      if(requests.status==="fulfilled")setTransfers((requests.value?.requests||[]) as TransferSummary[]);
      else setRequestError("ยังโหลดรายการคำขอย้ายไม่ได้ ลองเปิดหน้าใหม่อีกครั้ง");
      setLoading(false);
    });
    return()=>{mounted=false;};
  },[]);
  const connected=summary?.connectedAccounts||[];
  const requests=transfers.slice(0,5);
  const partner=summary?.partner;
  function reloadRequests() {
    void api("/brokers/exness/transfer")
      .then(result=>{setTransfers((result?.requests||[]) as TransferSummary[]);setRequestError("");})
      .catch(()=>setRequestError("อัปเดตรายการคำขอย้ายไม่สำเร็จ โปรดลองเปิดหน้าใหม่"));
  }
  return <div className="app-wrap">
    <CustomerSidebar activeKey="broker-center" onLogout={logout} userCode={userCode}/>
    <main className={`main app-main ${styles.main}`}>
      <CustomerMobileNav activeKey="broker-center" onLogout={logout}/>
      <div className={styles.shell}>
        <header className={styles.heading}>
          <div><span>SCENOVA · EXNESS</span><h1>Broker</h1><p>สมัคร Exness · ย้ายพาร์ตเนอร์ · ติดตามสถานะบัญชีของคุณ</p></div>
          <span className={styles.customerTag}>บัญชีลูกค้า</span>
        </header>

        <section className={styles.section} aria-label="สมัคร Exness และขอย้ายพาร์ตเนอร์">
          <div className={styles.sectionHeading}><div><small>เริ่มต้นใช้งาน</small><h2>สมัครหรือย้ายพาร์ตเนอร์ Exness</h2></div></div>
          <p>เลือกสมัคร Exness หรือย้ายพาร์ตเนอร์ไปยัง SCENOVA ได้จากปุ่มด้านล่าง</p>
          <ExnessSignupCard hasMt5Account={connected.length>0} onTransferClosed={reloadRequests}/>
          {!summary?.provider?.active&&!loading&&<p className={styles.note}>ขณะนี้จุดสมัครหรือย้ายพาร์ตเนอร์ยังไม่เปิดใช้งาน กรุณาติดต่อฝ่ายสนับสนุน SCENOVA</p>}
          <div className={styles.callout}><b>การย้ายพาร์ตเนอร์</b><span>หลังคลิกดำเนินการต่อที่ Exness ให้ติดต่อฝ่ายช่วยเหลือเพื่อรับลิงก์สำหรับบัญชีของคุณ แล้วส่งคำขอและยืนยันตัวตนกับ Exness</span></div>
        </section>

        <div className={styles.cols}>
          <section className={styles.section}>
            <div className={styles.sectionHeading}><div><small>สถานะของฉัน</small><h2>สถานะการเชื่อมพาร์ตเนอร์</h2></div></div>
            {loading?<p>กำลังโหลดสถานะ...</p>:<>
              {error&&<p className={styles.warning}>{error}</p>}
              <p className={styles.status}>{statusLabels[partner?.status||"NOT_CHECKED"]||"ยังไม่ตรวจสอบ"}</p>
              <p>หากยื่นคำขอย้ายแล้ว ให้ตรวจผลการพิจารณาที่ Exness</p>
              {partner?.benefit&&<p className={styles.note}>สิทธิประโยชน์ SCENOVA: {partner.benefit.levelName} (ส่วนลด {partner.benefit.discountPercent}%)</p>}
            </>}
          </section>
          <section className={styles.section}>
            <div className={styles.sectionHeading}><div><small>บัญชีเทรด</small><h2>บัญชี Exness ที่เชื่อมกับ SCENOVA</h2></div></div>
            {loading?<p>กำลังโหลดบัญชี...</p>:connected.length?<div className={styles.accountList}>
              {connected.map(a=><div className={styles.accountRow} key={a.id}><div><b>MT5 ••••{a.accountLast4}</b><small>{a.server||"Exness"} · {a.mode||"MT5"}</small></div><span>{a.status||"—"}</span></div>)}
            </div>:<p>ยังไม่พบบัญชี Exness ที่เชื่อมไว้ สามารถเชื่อมบัญชี MT5 ได้จากหน้า MT5 & EA</p>}
            <Link className={styles.textLink} href="/dashboard?view=account">ไปหน้าเชื่อม MT5 & EA ↗</Link>
            <p className={styles.note}>หากต้องการยืนยันว่าอยู่กับ SCENOVA แล้ว กรุณาตรวจสถานะพาร์ตเนอร์ด้านบน</p>
          </section>
        </div>

        <section className={styles.section}>
          <div className={styles.sectionHeading}><div><small>ติดตามการดำเนินการ</small><h2>คำขอย้ายพาร์ตเนอร์ของฉัน</h2></div></div>
          {requestError&&<p className={styles.warning}>{requestError}</p>}
          {loading?<p>กำลังโหลดคำขอ...</p>:requests.length?<div className={styles.accountList}>{requests.map((r,i)=><div className={styles.requestRow} key={i}><div><b>บัญชีเดิม ••••{r.accountLast4}</b><small>{requestLabels[r.status]}{r.newAccountLast4?" · บัญชีใหม่ ••••"+r.newAccountLast4:""}</small></div><small>{new Date(r.createdAt).toLocaleDateString("th-TH")}</small></div>)}</div>:<p>ยังไม่มีประวัติเตรียมคำขอย้ายพาร์ตเนอร์ เมื่อเริ่มย้ายจากปุ่มด้านบน รายการจะปรากฏที่นี่</p>}
          <p className={styles.note}>Exness พิจารณาคำขอประมาณ 3 วันทำการ ตรวจผลผ่านลิงก์ที่ได้รับจาก Exness</p>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}><div><small>สิทธิประโยชน์</small><h2>Exness Rebate (เงินคืน)</h2></div></div>
          <p>เงินคืนคำนวณและจ่ายเข้าบัญชี Exness ของคุณโดย Exness โดยตรง</p>
          <p className={styles.note}>ตรวจรายละเอียดเงินคืนได้จาก Exness</p>
          <a className={styles.textLink} href="https://my.exness.com/" target="_blank" rel="noopener noreferrer">เปิดพื้นที่ส่วนบุคคล Exness ↗</a>
        </section>
      </div>
    </main>
  </div>;
}
