"use client";

import { FormEvent, useEffect, useState } from "react";
import { adminApi } from "../../lib/api";

export default function AdminPage() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [days, setDays] = useState(30);
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [plan, setPlan] = useState("CLOUD_30D");
  const [system, setSystem] = useState<any>(null);
  const [activeMenu, setActiveMenu] = useState<"overview"|"users"|"subscriptions"|"workers">("overview");
  const [loading, setLoading] = useState(false);

  async function search(e?: FormEvent) {
    e?.preventDefault();
    setLoading(true);
    try {
      const [userRows, systemStatus] = await Promise.all([
        adminApi("/admin/users?q=" + encodeURIComponent(query)),
        adminApi("/admin/system")
      ]);
      setUsers(userRows);
      setSystem(systemStatus);
      setMessage("");
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem("bot_token")) {
      window.location.href = "/login";
      return;
    }
    search();
  }, []);

  function logout() {
    localStorage.removeItem("bot_token");
    window.location.href = "/login";
  }

  async function grantTrial(user: any) {
    if (!user.mt5_account_id) return setMessage("User ยังไม่ได้เชื่อม MT5");
    try {
      await adminApi("/admin/trials/grant", {
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
      await adminApi("/admin/subscriptions/activate", {
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
      await adminApi("/admin/subscriptions/extend", {
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
      await adminApi("/admin/users/reactivate", {
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
      await adminApi("/admin/users/suspend", {
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
        <div className="side-brand brand"><b>◆</b> SCENOVA // OWNER</div>
        <nav className="side-nav">
          <button
            type="button"
            className={"side-link " + (activeMenu === "overview" ? "active" : "")}
            style={{width:"100%",textAlign:"left"}}
            onClick={()=>setActiveMenu("overview")}
          >
            ภาพรวมระบบ
          </button>
          <button
            type="button"
            className={"side-link " + (activeMenu === "users" ? "active" : "")}
            style={{width:"100%",textAlign:"left"}}
            onClick={()=>setActiveMenu("users")}
          >
            ลูกค้าและสิทธิ์
          </button>
          <button
            type="button"
            className={"side-link " + (activeMenu === "subscriptions" ? "active" : "")}
            style={{width:"100%",textAlign:"left"}}
            onClick={()=>setActiveMenu("subscriptions")}
          >
            สมาชิกและแพ็กเกจ
          </button>
          <button
            type="button"
            className={"side-link " + (activeMenu === "workers" ? "active" : "")}
            style={{width:"100%",textAlign:"left"}}
            onClick={()=>setActiveMenu("workers")}
          >
            Cloud Workers
          </button>
        </nav>
        <button
          type="button"
          className="btn ghost full"
          style={{marginTop:"auto"}}
          onClick={logout}
        >
          ออกจากระบบ
        </button>
      </aside>
      <main className="main">
        <header className="page-head">
          <div>
            <div className="eyebrow">SCENOVA // SYSTEM OWNER</div>
            <h2 style={{marginTop:7}}>ศูนย์ควบคุมเจ้าของระบบ</h2>
          </div>
          <span className="badge"><span className="dot green"/> OWNER</span>
        </header>


        {message && <div className="notice" style={{marginBottom:14}}>{message}</div>}

        {activeMenu === "overview" && (
          <>
            <section className="kpi-grid">
              <div className="kpi">
                <div className="label">ผู้ใช้ทั้งหมด</div>
                <div className="value">{system?.users?.total ?? "—"}</div>
              </div>
              <div className="kpi">
                <div className="label">ผู้ใช้ Active</div>
                <div className="value green">{system?.users?.active ?? "—"}</div>
              </div>
              <div className="kpi">
                <div className="label">Bots Running</div>
                <div className="value green">{system?.bots?.running ?? "—"}</div>
              </div>
              <div className="kpi">
                <div className="label">Bots Offline</div>
                <div className="value">{system?.bots?.offline ?? "—"}</div>
              </div>
            </section>

            <section className="panel" style={{marginTop:16}}>
              <div className="panel-head">
                <div>
                  <div className="eyebrow">SCENOVA // OWNER OVERVIEW</div>
                  <h2 style={{marginTop:7}}>สถานะระบบปัจจุบัน</h2>
                </div>
                <button className="btn" onClick={()=>search()} disabled={loading}>
                  {loading ? "กำลังโหลด..." : "รีเฟรช"}
                </button>
              </div>
              <div className="grid2">
                <div className="flow-node">
                  <b>Cloud Workers Online</b>
                  <small>{system?.workers?.filter((w:any)=>w.health==="ONLINE").length || 0} Node</small>
                </div>
                <div className="flow-node purple">
                  <b>Bot Instances</b>
                  <small>{system?.bots?.total || 0} Instances</small>
                </div>
              </div>
            </section>
          </>
        )}

        {activeMenu === "users" && (
          <>
            <section className="panel purple">
              <div className="panel-head">
                <div>
                  <div className="eyebrow">USERS & ACCESS</div>
                  <h2 style={{marginTop:7}}>ค้นหาและจัดการลูกค้า</h2>
                </div>
              </div>
              <form className="field" onSubmit={search}>
                <label>ค้นหาลูกค้า — User ID / Email / MT5</label>
                <div style={{display:"flex",gap:8}}>
                  <input
                    className="input"
                    value={query}
                    onChange={e=>setQuery(e.target.value)}
                    placeholder="BOT-..., email, MT5"
                  />
                  <button className="btn primary" disabled={loading}>
                    {loading ? "กำลังค้นหา..." : "ค้นหา"}
                  </button>
                </div>
              </form>
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
                            {user.status === "SUSPENDED"
                              ? <button className="btn primary" onClick={()=>reactivate(user)}>Reactivate</button>
                              : <button className="btn danger" onClick={()=>suspend(user)}>Suspend</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!users.length && <tr><td colSpan={6} className="muted">ยังไม่พบผู้ใช้</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {activeMenu === "subscriptions" && (
          <>
            <section className="panel">
              <div className="panel-head">
                <div>
                  <div className="eyebrow">MEMBERSHIP CONTROL</div>
                  <h2 style={{marginTop:7}}>เปิดสมาชิกและต่ออายุ</h2>
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
                  <label>จำนวนวัน</label>
                  <input className="input" type="number" min={1} value={days} onChange={e=>setDays(Number(e.target.value))}/>
                </div>
                <div className="field">
                  <label>หรือกำหนดวันหมดอายุเอง</label>
                  <input className="input" type="datetime-local" value={expiresAt} onChange={e=>setExpiresAt(e.target.value)}/>
                  <div className="help">ถ้ากรอกช่องนี้ ระบบจะใช้วันหมดอายุนี้แทนจำนวนวัน</div>
                </div>
              </div>
            </section>

            <section className="panel purple" style={{marginTop:16}}>
              <form className="field" onSubmit={search}>
                <label>ค้นหาลูกค้าที่ต้องการเปิดสมาชิก</label>
                <div style={{display:"flex",gap:8}}>
                  <input
                    className="input"
                    value={query}
                    onChange={e=>setQuery(e.target.value)}
                    placeholder="BOT-..., email, MT5"
                  />
                  <button className="btn primary" disabled={loading}>
                    {loading ? "กำลังค้นหา..." : "ค้นหา"}
                  </button>
                </div>
              </form>
            </section>

            <section className="panel" style={{marginTop:16}}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>USER</th><th>MT5</th><th>ปัจจุบัน</th><th>หมดอายุ</th><th>ACTIONS</th></tr>
                  </thead>
                  <tbody>
                    {users.map(user=>(
                      <tr key={user.id}>
                        <td><b>{user.user_code}</b><br/><span className="muted">{user.email}</span></td>
                        <td>{user.account_number || "—"}<br/><span className="muted">{user.mode || ""}</span></td>
                        <td>{user.plan_code || "ยังไม่มีสมาชิก"}</td>
                        <td>{user.subscription_expires_at ? new Date(user.subscription_expires_at).toLocaleString("th-TH") : "—"}</td>
                        <td>
                          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                            <button className="btn primary" onClick={()=>activate(user)}>Activate</button>
                            <button className="btn" onClick={()=>extend(user,7)}>+7 วัน</button>
                            <button className="btn" onClick={()=>extend(user,30)}>+30 วัน</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!users.length && <tr><td colSpan={5} className="muted">ยังไม่พบผู้ใช้</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {activeMenu === "workers" && (
          <section className="panel purple">
            <div className="panel-head">
              <div>
                <div className="eyebrow">CLOUD INFRASTRUCTURE</div>
                <h2 style={{marginTop:7}}>Windows Trading Nodes</h2>
              </div>
              <button className="btn" onClick={()=>search()} disabled={loading}>
                {loading ? "กำลังโหลด..." : "รีเฟรช"}
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>RUNNER</th><th>REGION</th><th>LOAD</th><th>HEALTH</th><th>LAST SEEN</th></tr></thead>
                <tbody>
                  {(system?.workers || []).map((worker:any)=>(
                    <tr key={worker.runner_id}>
                      <td>{worker.runner_id}<br/><span className="muted">{worker.hostname || "—"}</span></td>
                      <td>{worker.region}</td>
                      <td>{worker.active_instances} / {worker.capacity}</td>
                      <td><span className="badge"><span className={"dot " + (worker.health==="ONLINE"?"green":"red")}/>{worker.health}</span></td>
                      <td>{worker.last_seen_at ? new Date(worker.last_seen_at).toLocaleString("th-TH") : "—"}</td>
                    </tr>
                  ))}
                  {!system?.workers?.length && <tr><td colSpan={5} className="muted">ยังไม่มี Cloud Worker เชื่อมต่อ</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
