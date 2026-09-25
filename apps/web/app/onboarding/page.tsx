"use client";

import { useEffect, useMemo, useState } from "react";
import { api, getToken } from "../../lib/api";
import { ScenovaBrand } from "../../components/ScenovaBrand";
import { ScenovaIcon } from "../../components/ScenovaIcon";
import styles from "./onboarding.module.css";

type SetupDashboard = {
  user: any;
  selectedSlot: any;
  account: any;
  instance: any;
  entitlement: any;
  trialRequest: any;
};

function accessLabel(data: SetupDashboard | null) {
  if (!data) return "กำลังตรวจสอบ";
  if (data.entitlement?.allowed) {
    const source = String(data.entitlement?.source || "").toUpperCase();
    if (source === "TRIAL" || source === "TRIAL_READY") return "Trial พร้อมใช้งาน";
    if (source === "SUBSCRIPTION") return "Subscription Active";
    if (source === "OWNER") return "Owner Access";
    return "Access Active";
  }
  if (String(data.trialRequest?.status || "").toUpperCase() === "PENDING") {
    return "รออนุมัติ Trial";
  }
  return "ยังไม่มีสิทธิ์ใช้งาน";
}

export default function OnboardingPage() {
  const [data, setData] = useState<SetupDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      if (!getToken()) {
        window.location.replace("/login");
        return;
      }
      const dashboard = await api("/bot/dashboard?light=1");
      setData(dashboard);
    } catch (e: any) {
      setError(e?.message || "ไม่สามารถตรวจสอบสถานะบัญชีได้");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const accountLinked = Boolean(
    data?.account?.id ||
    data?.selectedSlot?.mt5_account_id ||
    data?.instance?.mt5_account_id
  );
  const accessAllowed = Boolean(data?.entitlement?.allowed);
  const trialPending = String(data?.trialRequest?.status || "").toUpperCase() === "PENDING";
  const currentStep = accessAllowed ? 3 : accountLinked ? 2 : 1;

  const primaryAction = useMemo(() => {
    if (!accountLinked) {
      return { label: "เชื่อมบัญชี MT5", href: "/dashboard?view=account&welcome=1" };
    }
    if (!accessAllowed) {
      return {
        label: trialPending ? "ดูสถานะ Trial" : "ขอ Trial / เปิดสิทธิ์",
        href: "/dashboard?view=account&welcome=1"
      };
    }
    return { label: "เข้าสู่ Control Center", href: "/dashboard?view=overview" };
  }, [accountLinked, accessAllowed, trialPending]);

  function logout() {
    localStorage.removeItem("bot_token");
    window.location.replace("/login");
  }

  return (
    <main className={styles.page}>
      <div className={styles.glowOne} aria-hidden="true" />
      <div className={styles.glowTwo} aria-hidden="true" />

      <header className={styles.header}>
        <a href="/website" aria-label="SCENOVA website">
          <ScenovaBrand className={styles.brand} />
        </a>
        <div className={styles.headerActions}>
          <span className={styles.secureBadge}><ScenovaIcon name="shield" size={15}/> Secure Setup</span>
          <button type="button" onClick={logout}>Sign out</button>
        </div>
      </header>

      <section className={styles.shell}>
        <div className={styles.hero}>
          <div className={styles.eyebrow}>ACCOUNT ONBOARDING</div>
          <h1>ตั้งค่าบัญชีให้พร้อม<br/><span>ก่อนเริ่มใช้งาน MT5</span></h1>
          <p>ขั้นตอนนี้จัดระเบียบการเริ่มใช้งานเท่านั้น ไม่เปลี่ยนการตั้งค่า EA และไม่แก้ Logic ของโหมดเทรดใด ๆ</p>

          <div className={styles.identity}>
            <div>
              <small>SCENOVA USER</small>
              <b>{data?.user?.user_code || data?.user?.userCode || "—"}</b>
            </div>
            <div>
              <small>EMAIL</small>
              <b>{data?.user?.email || "—"}</b>
            </div>
            <div>
              <small>ACCESS</small>
              <b>{accessLabel(data)}</b>
            </div>
          </div>
        </div>

        <div className={styles.progress} aria-label="Setup progress">
          {[
            { n:1, title:"Account", sub:"สร้างบัญชี SCENOVA" },
            { n:2, title:"Connect MT5", sub:"เลือก Cloud หรือ Local" },
            { n:3, title:"Access", sub:"Trial หรือ Subscription" }
          ].map(step => {
            const complete =
              step.n === 1 ||
              (step.n === 2 && accountLinked) ||
              (step.n === 3 && accessAllowed);
            const active = step.n === currentStep && !complete;
            return (
              <div key={step.n} className={styles.progressItem + (complete ? " " + styles.complete : "") + (active ? " " + styles.active : "")}>
                <span>{complete ? "✓" : step.n}</span>
                <div><b>{step.title}</b><small>{step.sub}</small></div>
              </div>
            );
          })}
        </div>

        {error && (
          <div className={styles.errorBox}>
            <span>{error}</span>
            <button type="button" onClick={()=>void load()}>ลองใหม่</button>
          </div>
        )}

        <div className={styles.cards}>
          <article className={styles.card + " " + styles.cardDone}>
            <div className={styles.cardTop}>
              <span className={styles.icon}><ScenovaIcon name="shield" size={22}/></span>
              <span className={styles.stateGood}>READY</span>
            </div>
            <h2>1. SCENOVA Account</h2>
            <p>บัญชีและ Secure Session พร้อมแล้ว ใช้บัญชีนี้สำหรับเข้า Control Center และจัดการสิทธิ์ทั้งหมด</p>
            <div className={styles.cardFoot}>ไม่เก็บ MT5 Password ในขั้นตอน Login</div>
          </article>

          <article className={styles.card + (accountLinked ? " " + styles.cardDone : "")}>
            <div className={styles.cardTop}>
              <span className={styles.icon}><ScenovaIcon name="control" size={22}/></span>
              <span className={accountLinked ? styles.stateGood : styles.stateWait}>{accountLinked ? "CONNECTED" : "NEXT"}</span>
            </div>
            <h2>2. Connect MT5</h2>
            <p>
              {accountLinked
                ? "เชื่อม MT5 แล้ว · " + String(data?.account?.account_number || "บัญชีพร้อมใช้งาน")
                : "เลือก Cloud MT5 สำหรับใช้งานผ่าน Server หรือ Local MT5 สำหรับเครื่องของคุณ"}
            </p>
            <div className={styles.modeRow}>
              <span><ScenovaIcon name="cloud" size={16}/> Cloud</span>
              <span><ScenovaIcon name="strategy" size={16}/> Local</span>
            </div>
          </article>

          <article className={styles.card + (accessAllowed ? " " + styles.cardDone : "")}>
            <div className={styles.cardTop}>
              <span className={styles.icon}><ScenovaIcon name="clock" size={22}/></span>
              <span className={accessAllowed ? styles.stateGood : trialPending ? styles.statePending : styles.stateWait}>
                {accessAllowed ? "ACTIVE" : trialPending ? "PENDING" : "LOCKED"}
              </span>
            </div>
            <h2>3. Trial / Subscription</h2>
            <p>
              {accessAllowed
                ? "สิทธิ์พร้อมใช้งาน สามารถเข้าสู่ Control Center และเริ่มขั้นตอนเปิดบอทได้"
                : trialPending
                  ? "ส่งคำขอ Trial แล้ว อยู่ระหว่างรอผู้ดูแลอนุมัติ"
                  : "หลังเชื่อม MT5 ให้ขอ Trial หรือเปิด Subscription ตามสิทธิ์ของบัญชี"}
            </p>
            <div className={styles.cardFoot}>Trial และสมาชิกยังใช้กติกาเดิมของระบบ</div>
          </article>
        </div>

        <section className={styles.actionPanel}>
          <div>
            <small>RECOMMENDED NEXT STEP</small>
            <h3>{loading ? "กำลังตรวจสอบสถานะ..." : primaryAction.label}</h3>
            <p>หน้า MT5 และหน้าตั้งค่าบอทเดิมยังคงทำงานเหมือนเดิมทุกประการ</p>
          </div>
          <div className={styles.actions}>
            <a className={styles.primary} href={loading ? "#" : primaryAction.href} aria-disabled={loading}>ดำเนินการต่อ <span>→</span></a>
            <a className={styles.secondary} href="/dashboard?view=overview">ไป Dashboard</a>
          </div>
        </section>

        <div className={styles.securityStrip}>
          <div><ScenovaIcon name="shield" size={18}/><span><b>Secure Session</b><small>ใช้ Token เดิมของระบบ</small></span></div>
          <div><ScenovaIcon name="control" size={18}/><span><b>MT5 Isolated</b><small>ไม่เปลี่ยน MT5 settings</small></span></div>
          <div><ScenovaIcon name="strategy" size={18}/><span><b>Trading Logic Safe</b><small>ไม่แตะ AUTO / RACE / FLIP / ZERO / MANUAL</small></span></div>
        </div>
      </section>
    </main>
  );
}
