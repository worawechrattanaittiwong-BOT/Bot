"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { ScenovaBrand } from "../../components/ScenovaBrand";

export default function PartnerPage() {
  const [data, setData] = useState<any>(null);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      const result = await api("/partner");
      setData(result);
      setError("");
    } catch (e:any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem("bot_token")) {
      window.location.href = "/login";
      return;
    }
    void load();
  }, []);

  async function activateCustomer(e: FormEvent) {
    e.preventDefault();
    if (!target.trim()) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api("/partner/customers/activate", {
        method: "POST",
        body: JSON.stringify({ target: target.trim() })
      });
      setData(result);
      setTarget("");
      setNotice("เปิดสิทธิ์ให้ลูกค้าแล้ว ลูกค้าได้อายุสมาชิกเต็มตามรอบของตัวเอง");
    } catch (e:any) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  async function renewCustomer(customer:any) {
    if (!confirm(`ต่ออายุ ${customer.user_code} อีก ${data?.account?.customer_duration_days || 30} วันใช่หรือไม่?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api("/partner/customers/renew", {
        method: "POST",
        body: JSON.stringify({ customerUserId: customer.customer_user_id })
      });
      setData(result);
      setNotice("ต่ออายุลูกค้าเรียบร้อยแล้ว");
    } catch (e:any) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  const account = data?.account || null;
  const customers = Array.isArray(data?.customers) ? data.customers : [];
  const activeCustomers = useMemo(
    () => customers.filter((c:any)=>c.status === "ACTIVE" && new Date(c.expires_at) > new Date()),
    [customers]
  );

  if (!data && !error) {
    return <main className="auth-shell"><div className="auth-card loading-card">กำลังเปิด Partner Dashboard...</div></main>;
  }

  return (
    <main className="partner-page">
      <header className="partner-topbar">
        <a href="/dashboard?view=account" aria-label="SCENOVA"><ScenovaBrand className="partner-brand"/></a>
        <div className="partner-top-actions"><a className="btn" href="/dashboard?view=account">กลับ Control Center</a></div>
      </header>

      <section className="partner-hero">
        <div><span className="eyebrow">SCENOVA PARTNER</span><h1>Partner Dashboard</h1><p>บริหารสิทธิ์ลูกค้าของคุณโดยไม่ต้องผูก Slot กับเลข MT5 ลูกค้าเปลี่ยน MT5 เองได้และยังใช้ Seat เดิม</p></div>
        {account && <span className={"owner-state-chip "+(account.canManage?"good":"bad")}>{account.status}</span>}
      </section>

      {error && <div className="notice bad">{error}</div>}
      {notice && <div className="notice good">{notice}</div>}

      {account && (
        <>
          <section className="partner-kpis">
            <div><small>ใช้งาน</small><b>{account.usedSeats} / {account.seat_limit}</b><span>Customer Seats</span></div>
            <div><small>เหลือ</small><b>{account.availableSeats}</b><span>Seats พร้อมเปิด</span></div>
            <div><small>ลูกค้าแต่ละราย</small><b>{account.customer_duration_days} วัน</b><span>เริ่มนับจากวันที่เปิดสิทธิ์</span></div>
            <div><small>Partner หมดอายุ</small><b>{account.expires_at ? new Date(account.expires_at).toLocaleDateString("th-TH") : "—"}</b><span>เริ่มนับทันทีเมื่อ Owner เปิดสิทธิ์</span></div>
          </section>

          <section className="panel purple partner-add-card">
            <div>
              <div className="eyebrow">ADD CUSTOMER</div>
              <h2>เปิดสิทธิ์ให้ลูกค้า</h2>
              <p className="muted">กรอก User ID หรือ Email ของบัญชี SCENOVA ลูกค้า ระบบจะให้สมาชิก LOCAL เต็ม {account.customer_duration_days} วันแยกจากอายุ Partner</p>
            </div>
            <form onSubmit={activateCustomer} className="partner-add-form">
              <input className="input" value={target} onChange={e=>setTarget(e.target.value)} placeholder="BOT-XXXXXX หรือ customer@email.com" disabled={busy || !account.canManage || account.availableSeats<=0}/>
              <button className="btn primary" disabled={busy || !account.canManage || account.availableSeats<=0}>{busy?"กำลังดำเนินการ...":"เปิดสิทธิ์ลูกค้า"}</button>
            </form>
            {account.usedSeats > account.seat_limit && <div className="notice bad">จำนวนลูกค้า Active มากกว่า Seat Limit ใหม่ ลูกค้าเดิมยังใช้ต่อได้ แต่จะเพิ่มลูกค้าใหม่ไม่ได้จนกว่าจำนวน Active จะต่ำกว่าขีดจำกัด</div>}
            <div className="notice">สิทธิ์ Partner รวม EA ของ Partner เอง 1 บัญชี LOCAL โดยไม่กิน Customer Seat และจะหยุดสิทธิ์อัตโนมัติเมื่อ Partner หมดอายุหรือถูกระงับ</div>
          </section>

          <section className="panel partner-customer-card">
            <div className="panel-head">
              <div><div className="eyebrow">CUSTOMERS</div><h2>ลูกค้าของ Partner</h2><p className="muted">Active {activeCustomers.length} ราย · ลูกค้าที่หมดอายุจะคืน Seat อัตโนมัติ</p></div>
              <span className="badge">{account.usedSeats}/{account.seat_limit} SEATS</span>
            </div>
            <div className="partner-customer-list">
              {customers.map((customer:any)=>(
                <div className="partner-customer-row" key={customer.id}>
                  <div><b>{customer.user_code}</b><small>{customer.email}</small></div>
                  <div><span>{customer.status}</span><small>{customer.plan_code}</small></div>
                  <div><span>ถึง {new Date(customer.expires_at).toLocaleDateString("th-TH")}</span><small>เริ่ม {new Date(customer.starts_at).toLocaleDateString("th-TH")}</small></div>
                  <div>
                    {customer.status === "ACTIVE" && account.canManage
                      ? <button className="btn" disabled={busy} onClick={()=>renewCustomer(customer)}>ต่อ +{account.customer_duration_days} วัน</button>
                      : <span className="muted">{customer.status === "DIRECT" ? "ต่อกับ SCENOVA โดยตรงแล้ว" : "ไม่ Active"}</span>}
                  </div>
                </div>
              ))}
              {!customers.length && <div className="partner-empty">ยังไม่มีลูกค้าใน Partner Account นี้</div>}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
