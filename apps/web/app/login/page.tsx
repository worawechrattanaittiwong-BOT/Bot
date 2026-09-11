"use client";

import { FormEvent, useEffect, useState } from "react";
import { API_URL } from "../../lib/api";
import { ScenovaBrand } from "../../components/ScenovaBrand";
import { ScenovaIcon } from "../../components/ScenovaIcon";
import styles from "./login.module.css";

export default function LoginPage() {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [motionPaused, setMotionPaused] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRegister(params.get("mode") === "register");

    const token = localStorage.getItem("bot_token");
    if (!token) {
      setCheckingSession(false);
      return;
    }

    fetch(API_URL + "/api/auth/session", {
      headers: { Authorization: "Bearer " + token }
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("invalid session");
        return res.json();
      })
      .then((data) => {
        const role = data.user?.role;
        window.location.replace(role === "OWNER" || role === "ADMIN" ? "/admin" : "/dashboard");
      })
      .catch(() => {
        localStorage.removeItem("bot_token");
        setCheckingSession(false);
      });
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
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
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "ไม่สามารถเข้าสู่ระบบได้ กรุณาลองอีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  function switchMode() {
    if (busy) return;
    const next = !register;
    setRegister(next);
    setMessage("");
    setShowPassword(false);
    window.history.replaceState({}, "", next ? "/login?mode=register" : "/login");
  }

  if (checkingSession) {
    return (
      <main className={styles.shell}>
        <section className={styles.sessionCard}>
          <div className="brand-lockup auth-brand scenova-brand-lockup">
            <ScenovaBrand className={styles.formLogo}/>
          </div>
          <div className="session-loader"><span className="dot green"/> กำลังตรวจสอบการเข้าสู่ระบบ...</div>
          <p className="muted">ถ้าบัญชีของคุณยังอยู่ในระบบ เราจะพาไป Control Center โดยอัตโนมัติ</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <a className={styles.skipLink} href="#access-form">ไปยังฟอร์มเข้าสู่ระบบ</a>
      <div className={styles.grid} aria-hidden="true" />
      <header className={styles.header}>
        <a href="/" aria-label="SCENOVA หน้าแรก"><ScenovaBrand className={styles.brand} /></a>
        <span>PRECISION IN MOTION.</span>
      </header>
      <section className={styles.layout}>
        <div className={styles.visual}>
          <div className={styles.copy}>
            <div className={styles.eyebrow}>INTELLIGENT MT5 AUTOMATION</div>
            <h1>Secure Access to Your<br /><span>Trading Control Center</span></h1>
            <p>เข้าสู่ระบบ SCENOVA เพื่อควบคุม ดูสถานะ และจัดการระบบเทรดอัตโนมัติของคุณได้จากพื้นที่เดียว</p>
            <div className={styles.features}>
              {[['strategy','Automate Trading','with Smart EA Systems'],['clock','Monitor in Real-Time','Anytime, Anywhere'],['control','Built for Traders','Your trading. Your control.']].map(([icon,title,detail])=><div className={styles.feature} key={title}><span className={styles.featureIcon}><ScenovaIcon name={icon} size={22}/></span><div><b>{title}</b><small>{detail}</small></div></div>)}
            </div>
          </div>
          <div className={styles.hologram} aria-hidden="true"><b>MT5</b><div className={styles.holoContent}><p>CONNECT<br/>AUTOMATE<br/>MONITOR</p><div className={styles.bars}><i/><i/><i/><i/><i/><i/></div></div></div>
          <div className={styles.mascotStage}>
            <div className={styles.orb} aria-hidden="true" />
            <img className={`${styles.mascot} ${motionPaused ? styles.motionPaused : ''}`} src="/assets/scenova-login-panther-v1.webp" width={1254} height={1254} alt="NOVA มาสคอตเสือจักรกล SCENOVA เกราะสีดำและแสงสีฟ้า" fetchPriority="high" />
          </div>
          <div className={styles.visualFooter}><span>SCENOVA / INTELLIGENT AUTOMATION</span><button type="button" className={styles.motionToggle} aria-pressed={motionPaused} onClick={()=>setMotionPaused(value=>!value)}>{motionPaused ? 'เล่นแอนิเมชัน ▷' : 'หยุดแอนิเมชัน Ⅱ'}</button></div>
        </div>
        <div className={styles.formPane}>
          <div className={styles.formCard} id="access-form" aria-labelledby="access-title">
            <a className={styles.formBrand} href="/" aria-label="SCENOVA หน้าแรก"><ScenovaBrand className={styles.formLogo} /></a>
            <div className={styles.formHeading}>
              <div className={styles.eyebrow}>{register ? "CREATE ACCOUNT" : "SECURE ACCESS"}</div>
              <h2 id="access-title">{register ? "Create Your Account" : "Welcome Back"}</h2>
              <p className={styles.muted}>
            {register
              ? "สร้างบัญชีเพื่อรับ User ID จากนั้นค่อยเชื่อม MT5 และขอสิทธิ์ใช้งาน"
              : "เข้าสู่ Control Center เพื่อดูสถานะ MT5 และควบคุมบอท"}
              </p>
            </div>

          {register && <div className={styles.steps}>
            <span className={styles.active}>1 · Account</span><span>2 · Connect MT5</span><span>3 · Access</span>
          </div>
          }

        <form className={styles.form} onSubmit={submit} aria-busy={busy}>
          <label className={styles.label} htmlFor="login-email">Email Address <span>อีเมล</span></label>
          <div className={styles.inputWrap}>
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/></svg>
            <input id="login-email" className={styles.input} type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com" required disabled={busy} />
          </div>
          <label className={styles.label} htmlFor="login-password">Password <span>รหัสผ่าน</span></label>
          <div className={styles.inputWrap}>
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>
            <input id="login-password" className={styles.input} type={showPassword ? "text" : "password"} minLength={8} autoComplete={register ? "new-password" : "current-password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder={register ? "อย่างน้อย 8 ตัวอักษร" : "กรอกรหัสผ่านของคุณ"} required disabled={busy} />
            <button type="button" className={styles.passwordToggle} aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"} aria-pressed={showPassword} onClick={()=>setShowPassword(value=>!value)}><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{showPassword && <path d="m3 3 18 18"/>}</svg></button>
          </div>
          {message && <div className={styles.error} role="alert">{message}</div>}
          <button type="submit" className={styles.submit} disabled={busy}>{busy ? "กำลังดำเนินการ..." : register ? "Create Account" : "Sign In"}<span aria-hidden="true">→</span></button>
        </form>
        <div className={styles.divider}><span>or</span></div>
        <button type="button" className={styles.switch} disabled={busy} onClick={switchMode}>{register ? "Already have an account? Sign In" : "Create Account"}</button>
        <a className={styles.back} href="/">← Back to Home</a>
        <div className={styles.security}>
          <div><ScenovaIcon name="shield" size={20}/><p>Account access<span>บัญชี SCENOVA</span></p></div>
          <div><ScenovaIcon name="control" size={20}/><p>Control Center<span>MT5 & EA Dashboard</span></p></div>
          <div><ScenovaIcon name="cloud" size={20}/><p>Cloud + Local<span>เลือกการเชื่อมต่อได้</span></p></div>
        </div>
          </div>
          <div className={styles.formFooter}><ScenovaIcon name="shield" size={17}/><span>YOUR ACCOUNT. YOUR CONTROL.</span></div>
        </div>
      </section>
    </main>
  );
}
