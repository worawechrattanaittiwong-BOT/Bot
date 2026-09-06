"use client";

import { FormEvent, useState } from "react";
import { API_URL } from "../../lib/api";

export default function LoginPage() {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(API_URL + "/api/auth/" + (register ? "register" : "login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "ไม่สามารถเข้าสู่ระบบได้");
      localStorage.setItem("bot_token", data.token);
      window.location.href = data.user?.role === "OWNER" || data.user?.role === "ADMIN"
        ? "/admin"
        : "/dashboard";
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="eyebrow">BOT // SECURE ACCESS</div>
        <h1>{register ? "สร้างบัญชี" : "เข้าสู่ระบบ"}</h1>
        <p className="muted">
          {register
            ? "สมัครแล้วระบบจะสร้าง User ID สำหรับแจ้งผู้ดูแลเพื่อรับ Trial หรือเปิดสมาชิก"
            : "เข้าสู่ Control Center เพื่อควบคุม MT5 Bot"}
        </p>
        <form className="stack" onSubmit={submit}>
          <div className="field">
            <label>อีเมล</label>
            <input className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>รหัสผ่าน</label>
            <input className="input" type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required />
            <div className="help">อย่างน้อย 8 ตัวอักษร</div>
          </div>
          {message && <div className="notice bad">{message}</div>}
          <button className="btn primary full" disabled={busy}>
            {busy ? "กำลังดำเนินการ..." : register ? "สมัครบัญชี" : "เข้าสู่ระบบ"}
          </button>
        </form>
        <button className="btn ghost full" style={{marginTop:10}} onClick={()=>setRegister(!register)}>
          {register ? "มีบัญชีแล้ว — เข้าสู่ระบบ" : "ยังไม่มีบัญชี — สมัครใช้งาน"}
        </button>
        <a className="btn ghost full" href="/" style={{marginTop:4}}>← กลับหน้าแรก</a>
      </section>
    </main>
  );
}
