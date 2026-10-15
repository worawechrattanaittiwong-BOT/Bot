"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { API_URL } from "../../lib/api";
import { ScenovaBrand } from "../../components/ScenovaBrand";
import { ScenovaIcon } from "../../components/ScenovaIcon";
import styles from "./verify-email.module.css";
import {useCustomerLanguage} from "../../lib/i18n/provider";

function maskEmail(email: string) {
  const parts = email.split("@");
  if (parts.length !== 2) return email;
  const local = parts[0];
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return visible + "••••@" + parts[1];
}

export default function VerifyEmailPage() {
  const {lang}=useCustomerLanguage();
  const tx=(th:string,en:string)=>lang==="en"?en:th;
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"error" | "success" | "info">("info");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryEmail = String(params.get("email") || "").trim().toLowerCase();
    if (!queryEmail) {
      window.location.replace("/login?mode=register");
      return;
    }
    setEmail(queryEmail);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown(value => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const maskedEmail = useMemo(() => maskEmail(email), [email]);

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (busy || code.length !== 6 || !email) return;

    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(API_URL + "/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || tx("ไม่สามารถยืนยัน OTP ได้","Unable to verify OTP"));

      if (!data.token) throw new Error(tx("ยืนยันอีเมลสำเร็จแต่ยังไม่ได้รับ Secure Session","Email verified but no secure session was received"));
      localStorage.setItem("bot_token", data.token);
      localStorage.setItem("scenova_login_email", email);
      setMessageKind("success");
      setMessage(tx("ยืนยันอีเมลสำเร็จ กำลังเข้าสู่ขั้นตอนตั้งค่าบัญชี...","Email verified. Opening account setup..."));
      window.setTimeout(() => {
        window.location.replace("/onboarding?verified=1");
      }, 650);
    } catch (err: unknown) {
      setMessageKind("error");
      setMessage(err instanceof Error ? err.message : tx("ไม่สามารถยืนยัน OTP ได้","Unable to verify OTP"));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (resending || cooldown > 0 || !email) return;

    setResending(true);
    setMessage("");
    try {
      const res = await fetch(API_URL + "/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (Number(data.retryAfterSeconds || 0) > 0) {
          setCooldown(Number(data.retryAfterSeconds));
        }
        throw new Error(data.message || tx("ยังไม่สามารถส่ง OTP ใหม่ได้","Unable to resend OTP yet"));
      }

      if (data.verified) {
        setMessageKind("info");
        setMessage(tx("อีเมลนี้ยืนยันแล้ว กรุณากลับไปเข้าสู่ระบบ","This email is already verified. Please sign in."));
        return;
      }

      setCooldown(Number(data.retryAfterSeconds || 60));
      setMessageKind("success");
      setMessage(tx("ส่ง OTP ใหม่แล้ว กรุณาตรวจสอบ Inbox และ Spam","A new OTP was sent. Check your inbox and spam folder."));
    } catch (err: unknown) {
      setMessageKind("error");
      setMessage(err instanceof Error ? err.message : tx("ยังไม่สามารถส่ง OTP ใหม่ได้","Unable to resend OTP yet"));
    } finally {
      setResending(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.glowOne} aria-hidden="true" />
      <div className={styles.glowTwo} aria-hidden="true" />

      <header className={styles.header}>
        <a href="/website" aria-label="SCENOVA website">
          <ScenovaBrand className={styles.brand} />
        </a>
        <span><ScenovaIcon name="shield" size={16}/> SECURE EMAIL VERIFICATION</span>
      </header>

      <section className={styles.shell}>
        <div className={styles.card}>
          <div className={styles.icon}>
            <ScenovaIcon name="shield" size={28}/>
          </div>
          <div className={styles.eyebrow}>STEP 2 · VERIFY EMAIL</div>
          <h1>{tx("ยืนยันอีเมลของคุณ","Verify your email")}</h1>
          <p className={styles.lead}>
            {tx("เราส่งรหัส OTP 6 หลักไปที่","We sent a 6-digit OTP to")} <b>{maskedEmail || tx("อีเมลของคุณ","your email")}</b>
            <br/>{tx("รหัสมีอายุ 10 นาที และใช้ได้เพียงครั้งเดียว","The code expires in 10 minutes and can only be used once.")}
          </p>

          <form onSubmit={verify} className={styles.form}>
            <label htmlFor="otp-code">{tx("รหัสยืนยัน","Verification Code")}</label>
            <input
              id="otp-code"
              className={styles.otp}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              autoFocus
              disabled={busy}
            />

            <div className={styles.hint}>
              <span>{tx("อย่าแชร์ OTP ให้บุคคลอื่น","Do not share your OTP with anyone")}</span>
              <span>{code.length}/6</span>
            </div>

            {message && (
              <div className={
                styles.message +
                (messageKind === "error" ? " " + styles.error :
                  messageKind === "success" ? " " + styles.success : "")
              } role="status">
                {message}
              </div>
            )}

            <button className={styles.primary} type="submit" disabled={busy || code.length !== 6}>
              {busy ? tx("กำลังยืนยัน...","Verifying...") : "Verify Email"}
              <span aria-hidden="true">→</span>
            </button>
          </form>

          <div className={styles.resendRow}>
            <span>{tx("ยังไม่ได้รับอีเมล?","Didn't get the email?")}</span>
            <button type="button" onClick={resend} disabled={resending || cooldown > 0}>
              {resending
                ? tx("กำลังส่ง...","Sending...")
                : cooldown > 0
                  ? tx("ส่งใหม่ได้ใน ","Resend in ") + cooldown + "s"
                  : tx("ส่ง OTP ใหม่","Resend OTP")}
            </button>
          </div>

          <div className={styles.security}>
            <ScenovaIcon name="shield" size={18}/>
            <div>
              <b>SCENOVA Security</b>
              <small>{tx("OTP ถูกเก็บในระบบแบบ Hash และมีการจำกัดการส่ง/จำนวนครั้งที่กรอกผิด","OTPs are stored as hashes and both resends and failed attempts are rate-limited.")}</small>
            </div>
          </div>

          <a className={styles.back} href="/login">{tx("← กลับไปหน้าเข้าสู่ระบบ","← Back to sign in")}</a>
        </div>
      </section>
    </main>
  );
}
