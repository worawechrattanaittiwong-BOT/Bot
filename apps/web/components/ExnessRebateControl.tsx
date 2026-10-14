"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi } from "../lib/api";
import css from "./ExnessRebateControl.module.css";

type Section = "groups" | "clients" | "rebates" | "payments" | "history";
type Entry = Record<string,string|number|boolean|null>;
type Report = {source:string;kind:Section;limit:number;offset:number;count:number;total:number|null;rows:Entry[]};
const sections:{name:Section;label:string;hint:string}[] = [
  {name:"clients",label:"บัญชีลูกค้า",hint:"ตั้งค่าเปอร์เซ็นต์และบัญชีรับ Rebate"},
  {name:"groups",label:"กลุ่มเงินคืน",hint:"ดูเปอร์เซ็นต์และกลุ่มจาก Exness"},
  {name:"rebates",label:"รายการอนุมัติ",hint:"เริ่มกระบวนการยืนยันกับ Exness"},
  {name:"payments",label:"สถานะการจ่าย",hint:"ตรวจยอดจ่ายจริงจาก Exness เท่านั้น"},
  {name:"history",label:"ประวัติ",hint:"รายการ Rebate ในระบบ Exness"}
];
const names:Record<string,string> = {
  partner_account:"บัญชีพาร์ตเนอร์",client_account:"บัญชีลูกค้า",destination_client_account:"บัญชีรับเงินคืน",
  rebate_group_title:"กลุ่ม",rebate_group_id:"กลุ่ม ID",rebate_percent:"เงินคืน %",processed_rebate_usd:"คืนแล้ว USD",
  reward_usd:"ค่าคอมมิชชัน USD",rebate_usd:"เงินคืน USD",rebate:"เงินคืน",status:"สถานะ",
  error_code:"รหัสข้อผิดพลาด",processed_date:"วันที่ประมวลผล",created_at:"วันที่สร้าง",updated_at:"แก้ไขล่าสุด",
  id:"ID",rebate_id:"Rebate ID",rebate_row_id:"Row ID",title:"ชื่อกลุ่ม",name:"ชื่อกลุ่ม",
  payment_id:"Payment ID",clients_count:"จำนวนลูกค้า",is_active:"ใช้งาน",group_id:"กลุ่ม ID"
};
function safeCell(value:unknown) {
  if(value===null||value===undefined||value==="")return "—";
  return typeof value==="boolean"?(value?"ใช่":"ไม่"):String(value);
}
export function ExnessRebateControl() {
  const [section,setSection]=useState<Section>("clients");
  const [reports,setReports]=useState<Partial<Record<Section,Report>>>({});
  const [offsets,setOffsets]=useState<Record<Section,number>>({clients:0,groups:0,rebates:0,payments:0,history:0});
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [account,setAccount]=useState("");
  const [destination,setDestination]=useState("");
  const [percent,setPercent]=useState("30");
  const [selectedIds,setSelectedIds]=useState<string[]>([]);
  const [attemptId,setAttemptId]=useState("");
  const [token,setToken]=useState("");

  const load=useCallback(async (name:Section,offset=0)=>{
    setBusy("load:"+name);setError("");
    try {
      const result=await adminApi("/admin/brokers/exness/rebate-control/"+name+"?limit=40&offset="+offset) as Report;
      setReports(prev=>({...prev,[name]:result}));setOffsets(prev=>({...prev,[name]:offset}));
    }catch(e:unknown){setError(e instanceof Error?e.message:"ไม่สามารถอ่านข้อมูลจาก Exness ได้");}
    finally{setBusy("");}
  },[]);
  useEffect(()=>{void load(section);},[section,load]);
  const report=reports[section];
  const pickClient=(row:Entry)=>{
    setAccount(String(row.client_account||""));
    setDestination(String(row.destination_client_account||row.client_account||""));
    setPercent(String(row.rebate_percent??30));
    setMessage("เลือกบัญชีแล้ว กรุณาตรวจสอบเปอร์เซ็นต์และบัญชีปลายทางก่อนบันทึกไป Exness");
  };
  async function changePercent() {
    const value=Number(percent);
    if(!/^\d{5,20}$/.test(account)||!/^\d{5,20}$/.test(destination)||!Number.isFinite(value)||value<0||value>100){setError("กรอกเลขบัญชีลูกค้า บัญชีปลายทาง และเปอร์เซ็นต์ 0-100 ให้ถูกต้อง");return;}
    if(!window.confirm(`ส่งคำสั่งตั้งเงินคืน ${value}% ให้บัญชี Exness ${account} ไปยังบัญชีรับเงิน ${destination} จริงหรือไม่? การเปลี่ยนแปลงนี้มีผลใน Exness Partners`))return;
    setBusy("change");setError("");setMessage("");
    try{
      await adminApi("/admin/brokers/exness/rebate-control/client",{method:"PUT",body:JSON.stringify({clientAccount:account,destinationClientAccount:destination,percent:value})});
      setMessage("Exness รับการเปลี่ยนแปลงแล้ว · กรุณาอ่านรายการจาก Exness อีกครั้งเพื่อตรวจค่าจริง");
      await load("clients",0);
    }catch(e:unknown){setError(e instanceof Error?e.message:"Exness ปฏิเสธการเปลี่ยนเปอร์เซ็นต์");}
    finally{setBusy("");}
  }
  function toggleId(id:string) {setSelectedIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):prev.length>=20?prev:[...prev,id]);}
  async function startApproval() {
    if(!selectedIds.length){setError("กรุณาเลือก Rebate ID จากรายการอย่างน้อยหนึ่งรายการ");return;}
    if(!window.confirm(`ส่งคำขอเริ่มอนุมัติ Rebate จำนวน ${selectedIds.length} รายการไป Exness จริงหรือไม่? จะต้องยืนยันกับ Exness เพิ่มเติม`))return;
    setBusy("start");setError("");setMessage("");
    try{
      const out=await adminApi("/admin/brokers/exness/rebate-control/approve/start",{method:"POST",body:JSON.stringify({rebates:selectedIds})});
      setAttemptId(out.attemptId);setSelectedIds([]);
      setMessage("Exness เริ่มกระบวนการยืนยันแล้ว · ต้องได้รับ verification_token ผ่านช่องทางยืนยันที่ Exness กำหนดก่อนจบขั้นตอน");
    }catch(e:unknown){setError(e instanceof Error?e.message:"เริ่มกระบวนการยืนยันไม่สำเร็จ");}
    finally{setBusy("");}
  }
  async function finishApproval() {
    if(!attemptId||!token.trim())return;
    if(!window.confirm("ยืนยันส่ง Verification Token ไป Exness เพื่อจบการอนุมัติรายการเงินจริงหรือไม่?"))return;
    setBusy("complete");setError("");setMessage("");
    try{
      await adminApi("/admin/brokers/exness/rebate-control/approve/complete",{method:"POST",body:JSON.stringify({attemptId,verificationToken:token.trim()})});
      setToken("");setAttemptId("");
      setMessage("Exness รับการยืนยันแล้ว · ยังไม่ถือว่าจ่ายสำเร็จ กรุณาตรวจที่สถานะการจ่าย");
      setSection("payments");
    }catch(e:unknown){setError(e instanceof Error?e.message:"Exness ไม่ยอมรับการยืนยัน");}
    finally{setBusy("");}
  }
  return <section className={css.wrap} aria-label="ศูนย์ควบคุม Rebate จาก Exness">
    <div className={css.heading}><div><small>EXNESS PARTNERS · REBATE CONTROL</small><h2>ควบคุมเงินคืนผ่าน Exness</h2><p>SCENOVA เป็นเพียงแผงควบคุม · Exness เป็นผู้กำหนดยอดและจ่ายเงินเข้าบัญชีลูกค้า</p></div><a href="https://my.exnessaffiliates.com/" target="_blank" rel="noopener noreferrer">เปิด Exness Partners ↗</a></div>
    <div className={css.notice}>ไม่มี Rebate Wallet หรือการจ่ายเงินผ่าน SCENOVA · ตัวเลขและสถานะทั้งหมดอ่านจาก Exness API · การเปลี่ยนเปอร์เซ็นต์หรือเริ่มอนุมัติต้องยืนยันโดยผู้ดูแล</div>
    <nav className={css.tabs} aria-label="เมนู Rebate">
      {sections.map(item=><button key={item.name} type="button" aria-current={section===item.name?"page":undefined} className={section===item.name?css.active:""} onClick={()=>{setSection(item.name);setError("");setMessage("");}}>{item.label}</button>)}
    </nav>
    <div className={css.toolbar}><div><b>{sections.find(x=>x.name===section)?.label}</b><span>{sections.find(x=>x.name===section)?.hint}</span></div><button type="button" disabled={Boolean(busy)} onClick={()=>void load(section,offsets[section])}>{busy.startsWith("load:")?"กำลังโหลด...":"↻ อ่านข้อมูลจาก Exness"}</button></div>
    {error&&<p className={css.error} role="alert">{error}</p>}
    {message&&<p className={css.success} role="status">{message}</p>}
    {section==="clients"&&<div className={css.editor}>
      <h3>ตั้งค่าเปอร์เซ็นต์และบัญชีรับ Rebate</h3>
      <p>เลือกบัญชีจากรายการด้านล่าง หรือกรอกเลขบัญชี Exness ที่ตรวจสอบแล้วด้วยตนเอง เปอร์เซ็นต์นี้เป็นกฎของ Exness ไม่ใช่การคำนวณยอดจ่ายโดย SCENOVA</p>
      <div className={css.fields}><label>เลขบัญชี Exness<input inputMode="numeric" value={account} onChange={e=>setAccount(e.target.value)} placeholder="เลขบัญชีลูกค้า" /></label><label>บัญชีปลายทางรับเงิน<input inputMode="numeric" value={destination} onChange={e=>setDestination(e.target.value)} placeholder="เลขบัญชีปลายทาง" /></label><label>Rebate (%)<input type="number" step="0.01" min="0" max="100" value={percent} onChange={e=>setPercent(e.target.value)}/></label></div>
      <button type="button" className={css.primary} disabled={Boolean(busy)||!account||!destination} onClick={()=>void changePercent()}>ตรวจสอบและบันทึกไป Exness</button>
    </div>}
    {section==="rebates"&&<div className={css.editor}>
      <h3>อนุมัติผ่าน Exness (2 ขั้นตอน)</h3>
      <p>เลือก Rebate ID จากรายงานด้านล่าง แล้วกดเริ่มอนุมัติ หลังจากยืนยันผ่านช่องทาง Exness ให้ใส่ Verification Token เฉพาะในหน้านี้</p>
      <div className={css.actions}><button className={css.primary} disabled={Boolean(busy)||selectedIds.length===0||Boolean(attemptId)} type="button" onClick={()=>void startApproval()}>เริ่มอนุมัติที่ Exness ({selectedIds.length})</button></div>
      {attemptId&&<div className={css.verification}><b>รอการยืนยันจาก Exness</b><span>อย่าเผยแพร่โทเคนหรือรหัสยืนยันให้บุคคลอื่น · การยืนยันรายการเดิมมีเวลา 15 นาที</span><input type="password" autoComplete="off" placeholder="verification_token จาก Exness" value={token} onChange={e=>setToken(e.target.value)}/><button className={css.primary} type="button" disabled={Boolean(busy)||token.trim().length<6} onClick={()=>void finishApproval()}>ส่งการยืนยันให้ Exness</button></div>}
    </div>}
    <div className={css.tableScroll}><table className={css.table}><thead><tr>{section==="clients"&&<th>เลือก</th>}{section==="rebates"&&<th>เลือก</th>}{(report?.rows?.length?Array.from(new Set(report.rows.flatMap(row=>Object.keys(row)))).slice(0,11):["ข้อมูลจาก Exness"]).map(k=><th key={k}>{names[k]||k}</th>)}</tr></thead><tbody>
      {report?.rows?.length ? report.rows.map((row,index)=>{const keys=Array.from(new Set(report.rows.flatMap(r=>Object.keys(r)))).slice(0,11);const id=String(row.rebate_id??row.id??"");return <tr key={index}>{section==="clients"&&<td><button className={css.selectButton} type="button" onClick={()=>pickClient(row)}>ตั้งค่า</button></td>}{section==="rebates"&&<td><input aria-label={"เลือก Rebate "+id} type="checkbox" disabled={!/^\d{1,18}$/.test(id)||Boolean(attemptId)} checked={selectedIds.includes(id)} onChange={()=>toggleId(id)}/></td>}{keys.map(key=><td key={key}>{safeCell(row[key])}</td>)}</tr>;}) : <tr><td colSpan={12}>{busy.startsWith("load:")?"กำลังอ่านข้อมูลจาก Exness...":"ยังไม่พบข้อมูลในรายงาน หรือกดอ่านข้อมูลจาก Exness"}</td></tr>}
    </tbody></table></div>
    <div className={css.pager}><span>แสดง {report?.count??0} รายการ · แหล่งข้อมูล Exness Partners</span><div><button type="button" disabled={Boolean(busy)||offsets[section]===0} onClick={()=>void load(section,Math.max(0,offsets[section]-40))}>ก่อนหน้า</button><span>หน้า {Math.floor(offsets[section]/40)+1}</span><button type="button" disabled={Boolean(busy)||!report||report.count<40} onClick={()=>void load(section,offsets[section]+40)}>ถัดไป</button></div></div>
  </section>;
}
