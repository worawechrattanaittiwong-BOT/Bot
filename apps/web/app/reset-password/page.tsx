"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { ScenovaBrand } from "../../components/ScenovaBrand";
import styles from "./reset-password.module.css";

export default function ResetPasswordPage() {
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
    if (!token) return setMessage("ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้อง");
    if (password.length < 8) return setMessage("รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร");
    if (password !== confirmPassword) return setMessage("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
    setBusy(true);
    setMessage("");
    try {
      await api("/auth/reset-password", {
        method:"POST",
        body:JSON.stringify({ token, password })
      });
      setDone(true);
    } catch(e:any) {
      setMessage(e?.message || "ตั้งรหัสผ่านใหม่ไม่สำเร็จ");
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
            <h1>ตั้งรหัสผ่านใหม่แล้ว</h1>
            <p>คุณสามารถเข้าสู่ระบบ SCENOVA ด้วยรหัสผ่านใหม่ได้ทันที</p>
            <Link href="/login">ไปหน้าเข้าสู่ระบบ</Link>
          </div>
        ) : (
          <>
            <div className={styles.kicker}>SCENOVA ACCOUNT SECURITY</div>
            <h1>Set New Password</h1>
            <p className={styles.lead}>สร้างรหัสผ่านใหม่สำหรับบัญชีของคุณ ลิงก์นี้ใช้ได้ครั้งเดียวและมีเวลาจำกัด</p>
            <form onSubmit={submit} className={styles.form}>
              <label>New Password<input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required placeholder="อย่างน้อย 8 ตัวอักษร"/></label>
              <label>Confirm Password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} minLength={8} required placeholder="พิมพ์รหัสผ่านอีกครั้ง"/></label>
              {message && <div className={styles.message}>{message}</div>}
              <button disabled={busy||!token}>{busy?"กำลังบันทึก...":"Update Password"}</button>
            </form>
            <p className={styles.help}>หากลิงก์หมดอายุ กรุณาติดต่อผู้ดูแลเพื่อส่งลิงก์ใหม่</p>
          </>
        )}
      </section>
    </main>
  );
}
