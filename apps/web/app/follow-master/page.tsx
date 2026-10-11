"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, getToken } from "../../lib/api";
import { CustomerMobileNav, CustomerSidebar, OwnerMobileNav, OwnerSidebar } from "../../components/OwnerSidebar";
import { ScenovaIcon } from "../../components/ScenovaIcon";
import styles from "./page.module.css";

// UI shell only. No follow subscriptions, trade controls or setting changes are sent from this page.
type AccountIdentity = {
  user: { role: string; userCode?: string; user_code?: string };
  access?: { partner?: { used_seats?: number; seat_limit?: number; status?: string } | null };
};

export default function FollowMasterPage() {
  const [account, setAccount] = useState<AccountIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    if (!getToken()) {
      window.location.replace("/login");
      return;
    }
    api("/auth/account").then((result: AccountIdentity) => {
      if (mounted) setAccount(result);
    }).catch((err: unknown) => {
      if (mounted) setError(err instanceof Error ? err.message : "ไม่สามารถตรวจสอบบัญชีได้");
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  function logout() {
    localStorage.removeItem("bot_token");
    sessionStorage.removeItem("scenova_2fa_challenge");
    sessionStorage.removeItem("scenova_2fa_email");
    window.location.replace("/login");
  }

  if (loading) {
    return <main className={styles.loading}>กำลังเตรียมหน้า Follow Master...</main>;
  }
  if (!account) {
    return <main className={styles.loading} role="alert">{error || "ไม่สามารถโหลดข้อมูลบัญชีได้"} <Link href="/dashboard">กลับหน้า Dashboard</Link></main>;
  }

  const role = String(account.user.role || "").toUpperCase();
  const elevated = role === "OWNER" || role === "ADMIN";
  const partner = account.access?.partner ? {
    usedSeats: Number(account.access.partner.used_seats || 0),
    seat_limit: Number(account.access.partner.seat_limit || 0),
    status: String(account.access.partner.status || "ACTIVE")
  } : null;

  return (
    <div className="app-wrap">
      {elevated
        ? <OwnerSidebar activeKey="follow-master" onLogout={logout} role={role}/>
        : <CustomerSidebar activeKey="follow-master" onLogout={logout} userCode={account.user.userCode || account.user.user_code} partner={partner}/>}
      <main className={`main app-main ${styles.main}`}>
        {elevated
          ? <OwnerMobileNav activeKey="follow-master"/>
          : <CustomerMobileNav activeKey="follow-master" partner={partner}/>}
        <div className={styles.shell}>
          <header className={styles.header}>
            <div className={styles.heading}>
              <span className={styles.headingIcon}><ScenovaIcon name="copy" size={20}/></span>
              <div>
                <div className={styles.eyebrow}>SCENOVA / AUTO FOLLOW</div>
                <h1>Follow Master</h1>
                <p>ให้ Master เลือกจังหวะเริ่มและหยุดบอท ส่วนแต่ละบัญชีเทรดด้วยตัวเอง</p>
              </div>
            </div>
            <span className={styles.draftBadge}><span/> ยังไม่เปิดใช้งาน</span>
          </header>

          <div className={styles.notice} role="status">
            <ScenovaIcon name="info" size={17}/>
            <span>หน้านี้เป็นโครงสร้างเตรียมไว้เท่านั้น ยังไม่เชื่อมคำสั่ง START / STOP หรือเปลี่ยนโหมดจริง</span>
          </div>

          <section className={styles.panel} aria-labelledby="follow-settings-title">
            <div className={styles.panelHead}>
              <div>
                <h2 id="follow-settings-title"><ScenovaIcon name="users" size={17}/> ติดตาม Master</h2>
                <p>เลือกบัญชีและ Master ที่ต้องการติดตาม</p>
              </div>
              <span className={styles.stateMuted}>รอเปิดระบบ</span>
            </div>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>บัญชี MT5 ของฉัน</span>
                <select disabled value="pending" aria-label="บัญชี MT5 ของฉัน">
                  <option value="pending">รอเชื่อมข้อมูลบัญชี</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Master ที่ต้องการติดตาม</span>
                <select disabled value="pending" aria-label="Master ที่ต้องการติดตาม">
                  <option value="pending">ยังไม่มีรายการ Master</option>
                </select>
              </label>
            </div>

            <div className={styles.followRow}>
              <div className={styles.followCopy}>
                <span className={styles.followIcon}><ScenovaIcon name="refresh" size={18}/></span>
                <span><strong>Auto Follow</strong><small>เริ่ม / Safe Stop และเปลี่ยนโหมดตาม Master อัตโนมัติ</small></span>
              </div>
              <div className={styles.followAction}>
                <span className={styles.offText}>OFF</span>
                <button type="button" className={styles.switch} disabled aria-label="เปิด Auto Follow (ยังไม่เปิดใช้งาน)" aria-checked={false} role="switch"><span/></button>
              </div>
            </div>

            <div className={styles.statusStrip} aria-label="สถานะติดตาม">
              <div><small>โหมด Master</small><strong>—</strong></div>
              <div><small>โหมดของฉัน</small><strong>—</strong></div>
              <div><small>สถานะติดตาม</small><strong className={styles.statusPending}>ยังไม่พร้อม</strong></div>
            </div>
          </section>

          <section className={styles.panel} aria-labelledby="master-title">
            <div className={styles.panelHead}>
              <div>
                <h2 id="master-title"><ScenovaIcon name="bot" size={17}/> สำหรับ Master</h2>
                <p>เปิดให้ลูกค้าติดตามได้เมื่อผ่านการอนุมัติ</p>
              </div>
              <span className={styles.stateMuted}>รอเปิดระบบ</span>
            </div>
            <div className={styles.masterEmpty}>
              <ScenovaIcon name="lock" size={17}/>
              <span>ยังไม่มีการเปิดบัญชี Master หรือส่งคำสั่งให้ผู้ติดตามจากหน้านี้</span>
            </div>
          </section>

          <div className={styles.rules}>
            <div><ScenovaIcon name="check" size={15}/><span><b>โหมด</b> ปรับตาม Master เมื่อบัญชีปลอดภัย</span></div>
            <div><ScenovaIcon name="lot" size={15}/><span><b>Lot</b> ใช้ค่าของลูกค้าเองเสมอ</span></div>
            <div><ScenovaIcon name="shield" size={15}/><span><b>STOP</b> ใช้ Safe Stop ไม่บังคับปิดออเดอร์</span></div>
          </div>
          <div className={styles.backLink}><Link href="/dashboard?view=overview">← กลับหน้า Control Center</Link></div>
        </div>
      </main>
    </div>
  );
}
