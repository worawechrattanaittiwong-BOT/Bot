"use client";

import { FormEvent, useState } from "react";
import { adminApi } from "../../lib/api";

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState("");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [days, setDays] = useState(30);
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [plan, setPlan] = useState("CLOUD_30D");

  async function search(e?: FormEvent) {
    e?.preventDefault();
    try {
      setUsers(await adminApi("/admin/users?q=" + encodeURIComponent(query), adminKey));
      setMessage("");
    } catch (e: any) {
      setMessage(e.message);
    }
  }

  async function grantTrial(user: any) {
    if (!user.mt5_account_id) return setMessage("User ยังไม่ได้เชื่อม MT5");
    try {
      await adminApi("/admin/trials/grant", adminKey, {
        method: "POST",
        body: JSON.stringify({
          mt5AccountId: user.mt5_account_id,
          minutes: 180,
          approvedBy: "ADMIN"
        })
      });
      setMessage("อนุมัติ Trial 3 ชั่วโมงแล้ว: " + user.user_code);
    } catch (e: any) {
      setMessage(e.message);
    }
  }

  async function activate(user: any) {
    try {
      await adminApi("/admin/subscriptions/activate", adminKey, {
        method: "POST",
        body: JSON.stringify({
          userId: user.id,
          planCode: plan,
          durationDays: expiresAt ? undefined : days,
          startsAt: startsAt || undefined,
          expiresAt: expiresAt || undefined,
          activatedBy: "ADMIN"
        })
      });
      setMessage("เปิดสมาชิก " + plan + " ให้ " + user.user_code + " แล้ว");
    } catch (e: any) {
      setMessage(e.message);
    }
  }

  async function extend(user: any, addDays: number) {
    if (!user.subscription_id) return setMessage("User นี้ยังไม่มี subscription ให้ต่ออายุ");
    try {
      await adminApi("/admin/subscriptions/extend", adminKey, {
        method: "POST",
        body: JSON.stringify({ subscriptionId: user.subscription_id, days: addDays })
      });
      setMessage("เพิ่ม " + addDays + " วันให้ " + user.user_code + " แล้ว");
      await search();
    } catch (e: any) {
      setMessage(e.message);
    }
  }

  async function reactivate(user: any) {
    try {
      await adminApi("/admin/users/reactivate", adminKey, {
        method: "POST",
        body: JSON.stringify({ userId: user.id })
      });
      setMessage("เปิด User " + user.user_code + " กลับมาแล้ว");
      await search();
    } catch (e: any) {
      setMessage(e.message);
    }
  }

  async function suspend(user: any) {
    if (!confirm("Suspend " + user.user_code + " และ Safe Stop bot?")) return;
    try {
      await adminApi("/admin/users/suspend", adminKey, {
        method: "POST",
        body: JSON.stringify({ userId: user.id })
      });
      setMessage("Suspend " + user.user_code + " แล้ว");
      await search();
    } catch (e: any) {
      setMessage(e.message);
    }
  }

  return (
    <div className="app-wrap">
      <aside className="sidebar">
        <div className="side-brand brand"><b>◆</b> ADMIN // BOT</div>
        <nav className="side-nav">
          <a className="side-link active" href="/admin">Users & Access</a>
          <a className="side-link" href="/dashboard">Customer Dashboard</a>
          <a className="side-link" href="/">Website</a>
        </nav>
      </aside>
      <main className="main">
        <header className="page-head">
          <div>
            <div className="eyebrow">SYSTEM CONTROL // ADMIN</div>
            <h2 style={{marginTop:7}}>จัดการ Trial และสมาชิก</h2>
          </div>
          <span className="badge"><span className="dot red"/> ADMIN ONLY</span>
        </header>

        <section className="panel purple">
          <div className="form-grid">
            <div className="field">
              <label>Admin Key</label>
              <input className="input" type="password" value={adminKey} onChange={e=>setAdminKey(e.target.value)} placeholder="ADMIN_KEY จาก server env" />
            </div>
            <form className="field" onSubmit={search}>
              <label>ค้นหา User ID / Email / MT5</label>
              <div style={{display:"flex",gap:8}}>
                <input className="input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="BOT-..., email, MT5" />
                <button className="btn primary">ค้นหา</button>
              </div>
            </form>
          </div>
        </section>

        {message && <div className="notice" style={{marginTop:14}}>{message}</div>}

        <section className="panel" style={{marginTop:16}}>
          <div className="panel-head">
            <div>
              <div className="eyebrow">MANUAL ACTIVATION</div>
              <h2 style={{marginTop:7}}>ค่าปลดล็อกสมาชิก</h2>
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label>Plan</label>
              <select className="input" value={plan} onChange={e=>setPlan(e.target.value)}>
                <option value="CLOUD_30D">CLOUD 30D</option>
                <option value="LOCAL_30D">LOCAL 30D</option>
              </select>
            </div>
            <div className="field">
              <label>วันเริ่มสมาชิก (เว้นว่าง = เริ่มทันที)</label>
              <input className="input" type="datetime-local" value={startsAt} onChange={e=>setStartsAt(e.target.value)}/>
            </div>
            <div className="field">
              <label>จำนวนวัน (ใช้เมื่อไม่กำหนดวันหมดอายุเอง)</label>
              <input className="input" type="number" min={1} value={days} onChange={e=>setDays(Number(e.target.value))}/>
            </div>
            <div className="field">
              <label>หรือกำหนดวันหมดอายุเอง</label>
              <input className="input" type="datetime-local" value={expiresAt} onChange={e=>setExpiresAt(e.target.value)}/>
              <div className="help">ถ้ากรอกช่องนี้ ระบบจะใช้วันหมดอายุนี้แทนจำนวนวัน</div>
            </div>
          </div>
        </section>

        <section className="panel" style={{marginTop:16}}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>USER</th><th>EMAIL</th><th>MT5</th><th>MODE</th><th>SUBSCRIPTION</th><th>ACTIONS</th></tr>
              </thead>
              <tbody>
                {users.map(user=>(
                  <tr key={user.id}>
                    <td><b>{user.user_code}</b><br/><span className="muted">{user.status}</span></td>
                    <td>{user.email}</td>
                    <td>{user.account_number || "—"}</td>
                    <td>{user.mode || "—"}<br/><span className="muted">{user.broker_server || ""}</span></td>
                    <td>
                      {user.plan_code || "—"}
                      {user.subscription_expires_at && <><br/><span className="muted">หมด {new Date(user.subscription_expires_at).toLocaleString("th-TH")}</span></>}
                    </td>
                    <td>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        <button className="btn" onClick={()=>grantTrial(user)}>+ Trial 3h</button>
                        <button className="btn primary" onClick={()=>activate(user)}>Activate</button>
                        <button className="btn" onClick={()=>extend(user,7)}>+7 วัน</button>
                        <button className="btn" onClick={()=>extend(user,30)}>+30 วัน</button>
                        {user.status === "SUSPENDED"
                          ? <button className="btn primary" onClick={()=>reactivate(user)}>Reactivate</button>
                          : <button className="btn danger" onClick={()=>suspend(user)}>Suspend</button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {!users.length && <tr><td colSpan={6} className="muted">ค้นหาผู้ใช้เพื่อเริ่มจัดการ</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
