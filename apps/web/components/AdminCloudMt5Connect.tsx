"use client";
import { FormEvent, useState } from "react";
import { adminApi } from "../lib/api";

type Props = {
  userId: string;
  userCode: string;
  slotId: string;
  slotNumber: number;
  onLinked: () => Promise<void>;
  onMessage: (message: string) => void;
};

// Owner-only UI. The API independently enforces owner role, Cloud slot ownership,
// entitlement, duplicate identity, safe stop and encrypted credential storage.
export function AdminCloudMt5Connect({ userId, userCode, slotId, slotNumber, onLinked, onMessage }: Props) {
  const [accountNumber, setAccountNumber] = useState("");
  const [broker, setBroker] = useState("");
  const [brokerServer, setBrokerServer] = useState("");
  const [tradingPassword, setTradingPassword] = useState("");
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{3,20}$/.test(accountNumber.trim())) return onMessage("MT5 Login ต้องมีเลข 3–20 หลัก");
    if (!brokerServer.trim() || !tradingPassword || !approved) return onMessage("กรอก Server รหัสผ่าน และยืนยันว่าลูกค้าอนุญาต");
    setBusy(true);
    try {
      const result = await adminApi("/bot/mt5/admin-connect", {
        method: "POST",
        body: JSON.stringify({
          userId, slotId, accountNumber: accountNumber.trim(),
          broker: broker.trim() || "Other", brokerServer: brokerServer.trim(), tradingPassword
        })
      });
      setTradingPassword("");
      onMessage(result?.message || "บันทึกแล้ว กำลังรอ Cloud Worker เชื่อม MT5");
      await onLinked();
    } catch (err: any) {
      setTradingPassword("");
      onMessage(err?.message || "ไม่สามารถเชื่อม MT5 ได้");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details style={{border:"1px solid #26496b",borderRadius:10,padding:"10px 12px",background:"#0b1625"}}>
      <summary style={{cursor:"pointer",color:"#93c6ff",fontWeight:600}}>
        เชื่อม MT5 ให้ลูกค้า · Cloud VPS Slot #{slotNumber}
      </summary>
      <form onSubmit={submit} style={{display:"grid",gap:12,paddingTop:14}}>
        <small style={{color:"#b9c7d9"}}>ลูกค้า: {userCode} · ต้องได้รับอนุญาตจากเจ้าของบัญชี ใช้ Trading Password (ไม่ใช่ Investor Password) ระบบไม่ Start บอทอัตโนมัติ</small>
        <label>MT5 Login
          <input className="input" required inputMode="numeric" pattern="[0-9]{3,20}" maxLength={20} autoComplete="off"
            value={accountNumber} onChange={e=>setAccountNumber(e.target.value)} placeholder="เลขบัญชี MT5"/>
        </label>
        <label>โบรกเกอร์
          <input className="input" maxLength={160} autoComplete="off" value={broker}
            onChange={e=>setBroker(e.target.value)} placeholder="เช่น Exness"/>
        </label>
        <label>MT5 Server
          <input className="input" required maxLength={160} autoComplete="off" value={brokerServer}
            onChange={e=>setBrokerServer(e.target.value)} placeholder="ชื่อ Server ตามโบรกเกอร์"/>
        </label>
        <label>Trading Password
          <input className="input" required type="password" autoComplete="new-password" maxLength={512}
            value={tradingPassword} onChange={e=>setTradingPassword(e.target.value)}/>
        </label>
        <label style={{display:"flex",gap:8,alignItems:"center",fontSize:13}}>
          <input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/>
          ลูกค้าอนุญาตให้เชื่อมบัญชี MT5 นี้แล้ว
        </label>
        <button type="submit" className="btn primary" disabled={busy || !approved}>
          {busy ? "กำลังบันทึก..." : "บันทึกและเชื่อมต่อ Cloud MT5"}
        </button>
        <small style={{color:"#9fb1ca"}}>หลังบันทึก ระบบจะรายงานสถานะ OFFLINE จนกว่า Cloud Worker จะเชื่อมสำเร็จ</small>
      </form>
    </details>
  );
}
