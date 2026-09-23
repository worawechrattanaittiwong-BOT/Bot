"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { API_URL } from "../../lib/api";
import { ScenovaBrand } from "../../components/ScenovaBrand";
import { ScenovaIcon } from "../../components/ScenovaIcon";
import styles from "./verify-email.module.css";

function maskEmail(email: string) {
  const parts = email.split("@");
  if (parts.length !== 2) return email;
  const local = parts[0];
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return visible + "••••@" + parts[1];
}

export default function VerifyEmailPage() {
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
      if (!res.ok) throw new Error(data.message || "ไม่สามารถยืนยัน OTP ได้");

      if (!data.token) throw new Error("ยืนยันอีเมลสำเร็จแต่ยังไม่ได้รับ Secure Session");
      localStorage.setItem("bot_token", data.token);
      localStorage.setItem("scenova_login_email", email);
      setMessageKind("success");
      setMessage("ยืนยันอีเมลสำเร็จ กำลังเข้าสู่ขั้นตอนตั้งค่าบัญชี...");
      window.setTimeout(() => {
        window.location.replace("/onboarding?verified=1");
      }, 650);
    } catch (err: unknown) {
      setMessageKind("error");
      setMessage(err instanceof Error ? err.message : "ไม่สามารถยืนยัน OTP ได้");
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
        throw new Error(data.message || "ยังไม่สามารถส่ง OTP ใหม่ได้");
      }

      if (data.verified) {
        setMessageKind("info");
        setMessage("อีเมลนี้ยืนยันแล้ว กรุณากลับไปเข้าสู่ระบบ");
        return;
      }

      setCooldown(Number(data.retryAfterSeconds || 60));
      setMessageKind("success");
      setMessage("ส่ง OTP ใหม่แล้ว กรุณาตรวจสอบ Inbox และ Spam");
    } catch (err: unknown) {
      setMessageKind("error");
      setMessage(err instanceof Error ? err.message : "ยังไม่สามารถส่ง OTP ใหม่ได้");
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
          <h1>ยืนยันอีเมลของคุณ</h1>
          <p className={styles.lead}>
            เราส่งรหัส OTP 6 หลักไปที่ <b>{maskedEmail || "อีเมลของคุณ"}</b>
            <br/>รหัสมีอายุ 10 นาที และใช้ได้เพียงครั้งเดียว
          </p>

          <form onSubmit={verify} className={styles.form}>
            <label htmlFor="otp-code">Verification Code</label>
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
              <span>อย่าแชร์ OTP ให้บุคคลอื่น</span>
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
              {busy ? "กำลังยืนยัน..." : "Verify Email"}
              <span aria-hidden="true">→</span>
            </button>
          </form>

          <div className={styles.resendRow}>
            <span>ยังไม่ได้รับอีเมล?</span>
            <button type="button" onClick={resend} disabled={resending || cooldown > 0}>
              {resending
                ? "กำลังส่ง..."
                : cooldown > 0
                  ? "ส่งใหม่ได้ใน " + cooldown + "s"
                  : "ส่ง OTP ใหม่"}
            </button>
          </div>

          <div className={styles.security}>
            <ScenovaIcon name="shield" size={18}/>
            <div>
              <b>SCENOVA Security</b>
              <small>OTP ถูกเก็บในระบบแบบ Hash และมีการจำกัดการส่ง/จำนวนครั้งที่กรอกผิด</small>
            </div>
          </div>

          <a className={styles.back} href="/login">← กลับไปหน้าเข้าสู่ระบบ</a>
        </div>
      </section>
    </main>
  );
}
