"use client";

import { FormEvent, useEffect, useState } from "react";
import { API_URL } from "../../lib/api";

export default function LoginPage() {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRegister(params.get("mode") === "register");
  }, []);

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

  function switchMode() {
    const next = !register;
    setRegister(next);
    setMessage("");
    window.history.replaceState({}, "", next ? "/login?mode=register" : "/login");
  }

  return (
    <main className="auth-shell">
      <section className="auth-card auth-card-wide">
        <a className="brand-lockup auth-brand" href="/">
          <span className="brand-mark">◆</span>
          <span><strong>SCENOVA</strong><small>MT5 BOT EA</small></span>
        </a>

        <div className="auth-heading">
          <div className="eyebrow">{register ? "CREATE ACCOUNT" : "SECURE ACCESS"}</div>
          <h1>{register ? "เริ่มใช้งาน SCENOVA" : "ยินดีต้อนรับกลับ"}</h1>
          <p className="muted">
            {register
              ? "สร้างบัญชีเพื่อรับ User ID จากนั้นค่อยเชื่อม MT5 และขอสิทธิ์ใช้งาน"
              : "เข้าสู่ Control Center เพื่อดูสถานะ MT5 และควบคุมบอท"}
          </p>
        </div>

        {register && (
          <div className="mini-steps">
            <span className="active">1 สมัครบัญชี</span>
            <span>2 เชื่อม MT5</span>
            <span>3 ขอสิทธิ์</span>
          </div>
        )}

        <form className="stack" onSubmit={submit}>
          <div className="field">
            <label>อีเมล</label>
            <input className="input" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com" required />
          </div>
          <div className="field">
            <label>รหัสผ่าน</label>
            <input className="input" type="password" minLength={8} autoComplete={register ? "new-password" : "current-password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder="อย่างน้อย 8 ตัวอักษร" required />
          </div>
          {message && <div className="notice bad">{message}</div>}
          <button className="btn primary full btn-lg" disabled={busy}>
            {busy ? "กำลังดำเนินการ..." : register ? "สร้างบัญชี" : "เข้าสู่ระบบ"}
          </button>
        </form>

        <div className="auth-divider"><span>หรือ</span></div>
        <button className="btn ghost full" onClick={switchMode}>
          {register ? "มีบัญชีแล้ว — เข้าสู่ระบบ" : "ยังไม่มีบัญชี — สร้างบัญชีใหม่"}
        </button>
        <a className="auth-back" href="/">← กลับหน้าแรก</a>
      </section>
    </main>
  );
}
