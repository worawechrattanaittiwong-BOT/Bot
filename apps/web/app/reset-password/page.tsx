"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { ScenovaBrand } from "../../components/ScenovaBrand";
import styles from "./reset-password.module.css";
import {useCustomerLanguage} from "../../lib/i18n/provider";

export default function ResetPasswordPage() {
  const {lang}=useCustomerLanguage();
  const tx=(th:string,en:string)=>lang==="th"?th:en;
  const token = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("token") || "";
  }, []);
  const [password,setPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [done,setDone]=useState(false);

  async function submit(event:FormEvent) {
    event.preventDefault();
    if (!token) return setMessage(tx("ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้อง","Invalid password reset link"));
    if (password.length < 8) return setMessage(tx("รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร","The new password must be at least 8 characters"));
    if (password !== confirmPassword) return setMessage(tx("รหัสผ่านทั้งสองช่องไม่ตรงกัน","The passwords do not match"));
    setBusy(true);
    setMessage("");
    try {
      await api("/auth/reset-password", {
        method:"POST",
        body:JSON.stringify({ token, password })
      });
      setDone(true);
    } catch(e:any) {
      setMessage(e?.message || tx("ตั้งรหัสผ่านใหม่ไม่สำเร็จ","Unable to reset your password"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <ScenovaBrand className={styles.brand}/>
        {done ? (
          <div className={styles.success}>
            <span>✓</span>
            <h1>{tx("ตั้งรหัสผ่านใหม่แล้ว","Password updated")}</h1>
            <p>{tx("คุณสามารถเข้าสู่ระบบ SCENOVA ด้วยรหัสผ่านใหม่ได้ทันที","You can now sign in to SCENOVA using your new password.")}</p>
            <Link href="/login">{tx("ไปหน้าเข้าสู่ระบบ","Go to Sign In")}</Link>
          </div>
        ) : (
          <>
            <div className={styles.kicker}>SCENOVA ACCOUNT SECURITY</div>
            <h1>{tx("ตั้งรหัสผ่านใหม่","Set New Password")}</h1>
            <p className={styles.lead}>{tx("สร้างรหัสผ่านใหม่สำหรับบัญชีของคุณ ลิงก์นี้ใช้ได้ครั้งเดียวและมีเวลาจำกัด","Create a new password for your account. This link is time-limited and can only be used once.")}</p>
            <form onSubmit={submit} className={styles.form}>
              <label>{tx("รหัสผ่านใหม่","New Password")}<input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required placeholder={tx("อย่างน้อย 8 ตัวอักษร","At least 8 characters")}/></label>
              <label>{tx("ยืนยันรหัสผ่าน","Confirm Password")}<input type="password" autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} minLength={8} required placeholder={tx("พิมพ์รหัสผ่านอีกครั้ง","Re-enter password")}/></label>
              {message && <div className={styles.message}>{message}</div>}
              <button disabled={busy||!token}>{busy?tx("กำลังบันทึก...","Saving..."):tx("อัปเดตรหัสผ่าน","Update Password")}</button>
            </form>
            <p className={styles.help}>{tx("หากลิงก์หมดอายุ กรุณาติดต่อผู้ดูแลเพื่อส่งลิงก์ใหม่","If the link expired, contact support to request a new one.")}</p>
          </>
        )}
      </section>
    </main>
  );
}
