"use client";

import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {api} from "../lib/api";
import styles from "./BulkVpsSlots.module.css";

type BulkCatalog = {
  packages:Array<{months:number;priceUsdCents:number;enabled:boolean}>;
  tiers:Array<{quantity:number;discountPercent:number}>;
  manualOnly:boolean;
};
type Contact = {id:string;type:string;label:string;url:string};
type Customer = {userCode:string;email:string;status:string;primaryActive:boolean};
const packages = [5,10,20];
const periods = [1,3,6,12];
const money = (cents:number) => "$"+(cents/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const total = (unit:number,quantity:number,discount:number) => Math.round(unit*quantity*(100-discount)/100);

export function BulkVpsSlots({owner,onGranted}:{owner:boolean;onGranted?:()=>void}) {
  const [open,setOpen] = useState(false);
  const [catalog,setCatalog] = useState<BulkCatalog|null>(null);
  const [contacts,setContacts] = useState<Contact[]>([]);
  const [quantity,setQuantity] = useState(5);
  const [months,setMonths] = useState(1);
  const [prices,setPrices] = useState<Record<number,string>>({});
  const [userCode,setUserCode] = useState("");
  const [customer,setCustomer] = useState<Customer|null>(null);
  const [confirmed,setConfirmed] = useState(false);
  const [working,setWorking] = useState(false);
  const [error,setError] = useState("");
  const [success,setSuccess] = useState("");
  const requestRef = useRef("");
  const refresh = useCallback(async()=>{
    const result = await api("/cloud-bulk/catalog") as BulkCatalog;
    setCatalog(result);
    setPrices(Object.fromEntries(result.tiers.map(t=>[t.quantity,String(t.discountPercent)])));
  },[]);
  useEffect(()=>{
    if(!open) return;
    let active = true;
    void refresh().catch(e=>{if(active)setError(String(e?.message||"ไม่สามารถโหลดราคาได้"));});
    void api("/ai-assistant/bootstrap").then((result:{contacts?:Contact[]})=>{
      if(active)setContacts((result?.contacts||[]).filter(c=>/^https:\/\//i.test(String(c.url||""))));
    }).catch(()=>{if(active)setContacts([]);});
    return ()=>{active=false;};
  },[open,refresh]);

  const selectedPack = catalog?.packages.find(p=>p.months===months && p.enabled && p.priceUsdCents>0);
  const selectedTier = catalog?.tiers.find(t=>t.quantity===quantity);
  const discount = selectedTier?.discountPercent??0;
  const unit = Number(selectedPack?.priceUsdCents||0);
  const selectedTotal = total(unit,quantity,discount);
  const developerContact = useMemo(()=>contacts.find(c=>String(c.type).toUpperCase()==="LINE") || contacts[0],[contacts]);
  const requestMessage = `สวัสดีครับ/ค่ะ ขอซื้อ VPS Slot หลายบัญชี SCENOVA\nแพ็ก ${quantity} Slot · ${months} เดือน\nส่วนลด ${discount}% · ยอดอ้างอิง ${money(selectedTotal)} USD\nกรุณายืนยันราคาและช่องทางชำระเงิน`;

  async function saveDiscounts(){
    if(!catalog || working)return;
    const tiers = packages.map(n=>({quantity:n,discountPercent:Number(prices[n])}));
    if(tiers.some(t=>!Number.isFinite(t.discountPercent)||t.discountPercent<0||t.discountPercent>90)){
      setError("ส่วนลดต้องอยู่ระหว่าง 0–90%"); return;
    }
    setWorking(true);setError("");setSuccess("");
    try {
      await api("/cloud-bulk/owner/discounts",{method:"POST",body:JSON.stringify({tiers})});
      await refresh();
      setSuccess("บันทึกเปอร์เซ็นต์ส่วนลดแล้ว");
    }catch(e:any){setError(String(e?.message||"บันทึกส่วนลดไม่สำเร็จ"));}
    finally{setWorking(false);}
  }

  async function lookup(){
    setCustomer(null);setConfirmed(false);setSuccess("");setError("");requestRef.current="";
    if(!userCode.trim()){setError("กรุณาระบุ User ID ลูกค้า");return;}
    setWorking(true);
    try{
      const found = await api("/cloud-bulk/owner/customer?userCode="+encodeURIComponent(userCode.trim()));
      setCustomer(found);
    }catch(e:any){setError(String(e?.message||"ค้นหาลูกค้าไม่สำเร็จ"));}
    finally{setWorking(false);}
  }

  async function grant(){
    if(working||!customer||!confirmed||!selectedPack)return;
    if(!requestRef.current) requestRef.current = crypto.randomUUID();
    setWorking(true);setError("");setSuccess("");
    try {
      const result = await api("/cloud-bulk/owner/grant",{method:"POST",body:JSON.stringify({
        userCode:customer.userCode,quantity,months,paymentConfirmed:true,requestId:requestRef.current
      })});
      setSuccess(`เพิ่ม ${result.quantity} VPS Slot ให้ ${result.userCode} สำเร็จ · ${result.replayed?"ตรวจพบรายการเดิม ไม่เพิ่มซ้ำ":"เพิ่มสิทธิ์ใหม่ครบแล้ว"}`);
      setConfirmed(false);setCustomer(null);requestRef.current="";
      onGranted?.();
    }catch(e:any){setError(String(e?.message||"เพิ่ม Slot ไม่สำเร็จ"));}
    finally{setWorking(false);}
  }
  const changePack=(value:number)=>{setQuantity(value);setConfirmed(false);requestRef.current="";setSuccess("");};
  const changeMonths=(value:number)=>{setMonths(value);setConfirmed(false);requestRef.current="";setSuccess("");};

  return <section className={styles.entry}>
    <div className={styles.entryCopy}>
      <strong>ซื้อหลาย Slot · ยิ่งซื้อเยอะ ยิ่งคุ้ม</strong>
      <span>แพ็ก 5 / 10 / 20 VPS Slot · แสดงราคาหลังส่วนลด · ติดต่อผู้พัฒนาเพื่อสั่งซื้อ</span>
    </div>
    <button type="button" className={styles.primary} onClick={()=>{setOpen(!open);setError("");setSuccess("");}}>{open?"ปิดรายละเอียด":"ดูแพ็กซื้อหลาย Slot"}</button>
    {open&&<div className={styles.details}>
      <div className={styles.top}><strong>เลือกแพ็กซื้อ Slot ใหม่</strong><span>ซื้อผ่านการติดต่อผู้พัฒนาเท่านั้น · ไม่หักเงินในเว็บไซต์</span></div>
      <label className={styles.field}>ระยะเวลา
        <select value={months} onChange={e=>changeMonths(Number(e.target.value))}>
          {periods.map(m=><option key={m} value={m}>{m} เดือน</option>)}
        </select>
      </label>
      <div className={styles.packs}>
        {packages.map(n=>{
          const off = catalog?.tiers.find(t=>t.quantity===n)?.discountPercent||0;
          const amount = total(unit,n,off);
          return <button type="button" key={n} onClick={()=>changePack(n)} className={styles.pack+(quantity===n?" "+styles.selected:"")}>
            <strong>{n} VPS Slot</strong>
            <span className={styles.discount}>ลด {off}%</span>
            {selectedPack?<><small>เต็ม {money(unit*n)}</small><b>{money(amount)}</b></>:<small>ยังไม่เปิดขายช่วงเวลานี้</small>}
          </button>;
        })}
      </div>
      <div className={styles.total}>
        <span>{quantity} Slot · {months} เดือน · ส่วนลด {discount}%</span>
        <strong>{selectedPack?money(selectedTotal):"ยังไม่เปิดขาย"}</strong>
      </div>
      {!owner&&<div className={styles.contact}>
        <b>ติดต่อผู้พัฒนาเพื่อขอซื้อ {quantity} Slot</b>
        <p>กดคัดลอกรายละเอียด แล้วติดต่อผู้พัฒนาผ่านช่องทางที่ตั้งไว้ เมื่อชำระเงินเรียบร้อย Owner จะเพิ่ม Slot ให้</p>
        <div className={styles.actions}>
          <button type="button" onClick={()=>void navigator.clipboard.writeText(requestMessage).then(()=>setSuccess("คัดลอกข้อความขอซื้อแล้ว")).catch(()=>setError("คัดลอกไม่สำเร็จ กรุณาจดรายละเอียดแพ็ก"))}>คัดลอกรายละเอียด</button>
          {developerContact?<a className={styles.primary} target="_blank" rel="noopener noreferrer" href={developerContact.url}>ติดต่อผู้พัฒนา · {developerContact.type}</a>:<span className={styles.warning}>ยังไม่มีช่องทางติดต่อที่เปิดใช้งาน กรุณาเปิดเมนูผู้ช่วย SCENOVA หรือติดต่อแอดมิน</span>}
        </div>
      </div>}
      {owner&&<div className={styles.owner}>
        <h3>Owner · ตั้งส่วนลดแพ็กซื้อหลาย Slot</h3>
        <p>กำหนดเปอร์เซ็นต์ได้เองทุกแพ็ก โดยต้องให้จำนวนมากลดไม่น้อยกว่าจำนวนน้อย</p>
        <div className={styles.discounts}>{packages.map(n=><label key={n}>{n} Slot (%)<input type="number" inputMode="decimal" min="0" max="90" step="0.01" value={prices[n]??""} onChange={e=>setPrices(curr=>({...curr,[n]:e.target.value}))}/></label>)}</div>
        <button className={styles.primary} type="button" disabled={working||!catalog} onClick={()=>void saveDiscounts()}>บันทึกเปอร์เซ็นต์ส่วนลด</button>
        <h3>Owner · เพิ่ม Slot ให้ลูกค้าหลังรับชำระเงิน</h3>
        <p>ตรวจ User ID ให้ตรงลูกค้า · ลูกค้าต้องมี Slot #1 ยังไม่หมดอายุ · ระบบตรวจความจุ VPS ก่อนเพิ่มทั้งหมดในรายการเดียว</p>
        <div className={styles.lookup}><input value={userCode} placeholder="User ID ลูกค้า" onChange={e=>{setUserCode(e.target.value);setCustomer(null);setConfirmed(false);requestRef.current="";}}/><button type="button" disabled={working} onClick={()=>void lookup()}>ตรวจลูกค้า</button></div>
        {customer&&<div className={styles.customer}>
          <b>{customer.userCode}</b> · {customer.email}
          <span>{customer.status==="ACTIVE"&&customer.primaryActive?"พร้อมเพิ่ม Slot เสริม":"ยังไม่พร้อม: ลูกค้าต้อง ACTIVE และแพ็กเกจหลักยังไม่หมดอายุ"}</span>
        </div>}
        <label className={styles.confirm}><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} disabled={!customer||customer.status!=="ACTIVE"||!customer.primaryActive}/><span>ยืนยันว่าได้รับชำระเงินจากลูกค้านอกรวมระบบแล้ว และตรวจ User ID / จำนวน / ระยะเวลาถูกต้อง</span></label>
        <button className={styles.primary} type="button" disabled={working||!customer||!customer.primaryActive||!confirmed||!selectedPack} onClick={()=>void grant()}>{working?"กำลังดำเนินการ...":`ยืนยันเพิ่ม ${quantity} Slot ให้ลูกค้า`}</button>
        <p className={styles.warning}>ข้อจำกัด: ต้องมีความจุ VPS ว่างเพียงพอตามจำนวนที่เพิ่ม มิฉะนั้นระบบจะไม่เพิ่มแม้แต่ Slot เดียว</p>
      </div>}
      {error&&<p role="alert" className={styles.error}>{error}</p>}
      {success&&<p role="status" className={styles.success}>{success}</p>}
    </div>}
  </section>;
}
