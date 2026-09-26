"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, getToken } from "../../lib/api";
import {
  CustomerMobileNav,
  CustomerSidebar,
  OwnerMobileNav,
  OwnerSidebar
} from "../../components/OwnerSidebar";
import { ScenovaIcon } from "../../components/ScenovaIcon";
import styles from "./packages.module.css";
import legacy from "../../components/cloud.module.css";

type Account = {
  user: {
    userCode: string;
    email: string;
    role: string;
    phone: { masked: string; verified: boolean } | null;
  };
  access: {
    subscription: any;
    trial: any;
    partner: any;
  };
};

type TrialStatus = {
  emailConfigured: boolean;
  smsConfigured: boolean;
  verificationConfigured: boolean;
  defaultDelivery: "EMAIL" | "SMS";
  email: { masked: string; verified: boolean } | null;
  trialDays: number;
  eligibility: { allowed: boolean; reason: string; message: string };
  phone: { masked: string; verified: boolean } | null;
  authorization: any;
  trial: any;
  latestCode: {
    delivery_channel?: "EMAIL" | "SMS";
    email_masked?: string | null;
    phone_last4?: string | null;
    status?: string;
  } | null;
  otp?: {
    codeLength: number;
    expiresInMinutes: number;
    resendSeconds: number;
    resendAfterSeconds: number;
    resendAvailableAt: string | null;
    maxSendsPerDay: number;
    sendsUsedToday: number;
    sendsRemaining: number;
  };
};

type PackageItem = {
  months: number;
  price_satang: number;
  enabled: boolean;
  updated_at: string;
};

type Catalog = {
  packages: PackageItem[];
  paymentMode: string;
  checkoutEnabled: boolean;
  available?: number;
  provisioningPaused?: boolean;
};

type Order = {
  id: string;
  months: number;
  amount: number;
  status: string;
  qr_url: string | null;
  expires_at: string | null;
  created_at: string;
  paid_at: string | null;
  slot_id: string | null;
  subscription_id?: string | null;
  subscription_expires_at: string | null;
  original_amount?: number | null;
  discount_amount?: number | null;
  promotion_code?: string | null;
  account_number?: string | null;
  actual_state?: string | null;
  last_seen_at?: string | null;
};

function money(satang: number) {
  return (Number(satang || 0) / 100).toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function date(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function logout() {
  localStorage.removeItem("bot_token");
  sessionStorage.removeItem("scenova_2fa_challenge");
  sessionStorage.removeItem("scenova_2fa_email");
  window.location.replace("/login");
}

export default function PackagesPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [trial, setTrial] = useState<TrialStatus | null>(null);
  const [localCatalog, setLocalCatalog] = useState<Catalog | null>(null);
  const [cloudCatalog, setCloudCatalog] = useState<Catalog | null>(null);
  const [localOrders, setLocalOrders] = useState<Order[]>([]);
  const [cloudOrders, setCloudOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"good" | "bad" | "info">("info");
  const [otp, setOtp] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [activeSystem, setActiveSystem] = useState<"LOCAL" | "CLOUD">("CLOUD");
  const [trialOpen, setTrialOpen] = useState(true);
  const [checkoutPack, setCheckoutPack] = useState<PackageItem | null>(null);
  const checkoutDialog = useRef<HTMLDialogElement>(null);
  const [promoCode, setPromoCode] = useState("");
  const polling = useRef(false);

  const elevated = ["OWNER", "ADMIN"].includes(String(account?.user.role || "").toUpperCase());
  const partnerSummary = account?.access.partner ? {
    usedSeats: Number(account.access.partner.used_seats || 0),
    seat_limit: Number(account.access.partner.seat_limit || 0),
    status: String(account.access.partner.status || "ACTIVE")
  } : null;

  async function load() {
    const [a, t, lc, lo, cc, co] = await Promise.all([
      api("/auth/account"),
      api("/trial-access/status").catch(() => null),
      api("/packages/local/catalog"),
      api("/packages/local/orders"),
      api("/cloud/catalog"),
      api("/cloud/orders")
    ]);
    setAccount(a);
    setTrial(t);
    setLocalCatalog(lc);
    setLocalOrders(Array.isArray(lo) ? lo : []);
    setCloudCatalog(cc);
    setCloudOrders(Array.isArray(co) ? co : []);
    if (t?.otp?.resendAfterSeconds != null) {
      setCooldown(Number(t.otp.resendAfterSeconds || 0));
    }
  }

  useEffect(() => {
    if (!getToken()) {
      window.location.replace("/login");
      return;
    }
    load()
      .catch((error: unknown) => {
        setMessageKind("bad");
        setMessage(error instanceof Error ? error.message : "โหลดแพ็กเกจไม่สำเร็จ");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => {
      setCooldown(current => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldown > 0]);

  const pendingLocal = localOrders.find(order => ["CREATING", "PENDING", "REVIEW"].includes(order.status));
  const pendingCloud = cloudOrders.find(order => ["CREATING", "PENDING", "REVIEW"].includes(order.status));

  useEffect(() => {
    if (!pendingLocal && !pendingCloud) return;
    const id = window.setInterval(async () => {
      if (document.hidden || polling.current) return;
      polling.current = true;
      try {
        if (pendingLocal?.status === "PENDING") {
          await api(`/packages/local/orders/${pendingLocal.id}/refresh`, { method: "POST" });
        }
        if (pendingCloud?.status === "PENDING") {
          await api(`/cloud/orders/${pendingCloud.id}/refresh`, { method: "POST" });
        }
        await load();
      } catch {
        // Keep the payment card visible; manual refresh remains available.
      } finally {
        polling.current = false;
      }
    }, 20000);
    return () => window.clearInterval(id);
  }, [pendingLocal?.id, pendingLocal?.status, pendingCloud?.id, pendingCloud?.status]);

  const activeLocal = useMemo(
    () => localOrders.find(order =>
      order.status === "PAID" &&
      order.subscription_expires_at &&
      new Date(order.subscription_expires_at).getTime() > Date.now()
    ),
    [localOrders]
  );

  const activeCloud = useMemo(
    () => cloudOrders.find(order =>
      order.status === "PAID" &&
      order.subscription_expires_at &&
      new Date(order.subscription_expires_at).getTime() > Date.now()
    ),
    [cloudOrders]
  );

  function notify(kind: "good" | "bad" | "info", text: string) {
    setMessageKind(kind);
    setMessage(text);
  }

  async function requestOtp() {
    if (busy || cooldown > 0 || !trial?.verificationConfigured) return;
    setBusy("otp-send");
    setMessage("");
    try {
      const result = await api("/trial-access/request-code", { method: "POST" });
      setCooldown(Number(result.resendAfterSeconds || 60));
      setOtp("");
      const channel = result.deliveryChannel === "SMS" ? "SMS" : "อีเมล";
      notify(
        "good",
        `ส่ง OTP ทาง${channel} ไปที่ ${result.deliveryMasked} แล้ว${result.fallbackUsed ? " · ระบบใช้งาน SMS สำรองเนื่องจากส่งอีเมลไม่สำเร็จ" : ""}`
      );
      await load();
    } catch (error: unknown) {
      notify("bad", error instanceof Error ? error.message : "ส่ง OTP ไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  async function verifyOtp() {
    if (busy || otp.length !== 6) return;
    setBusy("otp-verify");
    setMessage("");
    try {
      const result = await api("/trial-access/redeem", {
        method: "POST",
        body: JSON.stringify({ code: otp })
      });
      setOtp("");
      notify("good", result.message || "เปิดสิทธิ์ทดลองแล้ว");
      await load();
    } catch (error: unknown) {
      notify("bad", error instanceof Error ? error.message : "ยืนยัน OTP ไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  async function checkoutLocal(months: number) {
    if (busy) return;
    setBusy("local-" + months);
    setMessage("");
    try {
      const result = await api("/packages/local/checkout", {
        method: "POST",
        body: JSON.stringify({ months, promoCode: promoCode.trim().toUpperCase() })
      });
      await load();
      notify(result?.free ? "good" : "info", result?.free ? "ใช้โปรโมชั่น 100% และเปิดสิทธิ์ Local แล้ว" : "สร้าง QR สำหรับแพ็กเกจ Local แล้ว");
    } catch (error: unknown) {
      notify("bad", error instanceof Error ? error.message : "สร้างรายการ Local ไม่สำเร็จ");
      await load().catch(() => {});
    } finally {
      setBusy("");
    }
  }

  async function checkoutCloud(months: number) {
    if (busy) return;
    setBusy("cloud-" + months);
    setMessage("");
    try {
      const result = await api("/cloud/checkout", {
        method: "POST",
        body: JSON.stringify({ months, promoCode: promoCode.trim().toUpperCase() })
      });
      await load();
      notify(result?.free ? "good" : "info", result?.free ? "ใช้โปรโมชั่น 100% และเปิดสิทธิ์ Cloud แล้ว" : "สร้าง QR สำหรับแพ็กเกจ Cloud แล้ว");
    } catch (error: unknown) {
      notify("bad", error instanceof Error ? error.message : "สร้างรายการ Cloud ไม่สำเร็จ");
      await load().catch(() => {});
    } finally {
      setBusy("");
    }
  }

  async function refreshOrder(type: "local" | "cloud", id: string) {
    if (busy) return;
    setBusy("refresh-" + type);
    try {
      await api(
        type === "local"
          ? `/packages/local/orders/${id}/refresh`
          : `/cloud/orders/${id}/refresh`,
        { method: "POST" }
      );
      await load();
      notify("good", "ตรวจสอบสถานะการชำระเงินแล้ว");
    } catch (error: unknown) {
      notify("bad", error instanceof Error ? error.message : "ตรวจสอบรายการไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return <main className={styles.loading}>กำลังโหลดแพ็กเกจ...</main>;
  }

  if (!account) {
    return <main className={styles.loading}>{message || "ไม่พบบัญชี"}</main>;
  }

  const trialReady = Boolean(trial?.authorization || trial?.trial);
  const trialEligible = Boolean(trial?.eligibility?.allowed);
  const sendsRemaining = Number(trial?.otp?.sendsRemaining ?? 0);
  const isLocalSystem = activeSystem === "LOCAL";
  const activeCatalog = isLocalSystem ? localCatalog : cloudCatalog;
  const activeOrders = isLocalSystem ? localOrders : cloudOrders;
  const activePending = isLocalSystem ? pendingLocal : pendingCloud;
  const activeMembership = isLocalSystem ? activeLocal : activeCloud;

  return (
    <div className="app-wrap">
      {elevated
        ? <OwnerSidebar activeKey="packages" onLogout={logout} role={account.user.role}/>
        : <CustomerSidebar activeKey="packages" onLogout={logout} userCode={account.user.userCode} partner={partnerSummary}/>}
      <main className={`main app-main ${styles.main}`}>
        {elevated
          ? <OwnerMobileNav activeKey="packages"/>
          : <CustomerMobileNav activeKey="packages" partner={partnerSummary}/>}

        <div className={styles.shell}>
          <header className={styles.header}>
            <div>
              <div className={styles.breadcrumb}>Membership <span>/</span> Packages</div>
              <span className={styles.eyebrow}>SCENOVA MEMBERSHIP</span>
              <h1>สิทธิ์ที่ใช่ สำหรับคุณ</h1>
              <p>เลือกแพ็กเกจที่เหมาะกับการใช้งานของคุณ</p>
            </div>
            <div className={styles.currentAccess}>
              <span>สิทธิ์ปัจจุบัน</span>
              <b>{account.access.subscription?.code || account.access.trial?.status || "ยังไม่มีแพ็กเกจ"}</b>
            </div>
          </header>

          {message && (
            <div className={`${styles.message} ${messageKind === "good" ? styles.good : messageKind === "bad" ? styles.bad : ""}`}>
              {message}
            </div>
          )}

          <section className={styles.trialPanel}>
            <div className={styles.trialHead}>
              <div className={styles.titleWithIcon}>
                <span className={styles.icon}><ScenovaIcon name="status" size={19}/></span>
                <div>
                  <span className={styles.eyebrow}>START HERE</span>
                  <h2>ทดลองใช้งาน</h2>
                  <p>ขอรหัสยืนยันได้ทันที ระบบส่งไปยังอีเมลที่ลงทะเบียนเป็นช่องทางหลัก และใช้ SMS สำรองเมื่อส่งอีเมลไม่สำเร็จ</p>
                </div>
              </div>
              <div className={styles.trialHeaderActions}>
                <span className={`${styles.badge} ${trialReady ? styles.badgeGood : ""}`}>
                  {trial?.trial ? "ACTIVE" : trial?.authorization ? "READY" : trialEligible ? "AVAILABLE" : "UNAVAILABLE"}
                </span>
                <button
                  type="button"
                  className={styles.trialToggle}
                  onClick={() => setTrialOpen(value => !value)}
                  aria-expanded={trialOpen}
                >
                  {trialOpen ? "ซ่อน" : trialReady ? "ดูสถานะ Trial" : "จัดการ Trial"}
                </button>
              </div>
            </div>

            {trialOpen && <div className={styles.trialBody}>
              <div className={styles.trialSteps}>
                <TrialStep
                  number="1"
                  title="ช่องทางหลัก"
                  value={trial?.email?.masked || "อีเมลที่ลงทะเบียน"}
                  done={Boolean(trial?.email?.verified)}
                />
                <TrialStep
                  number="2"
                  title="ยืนยัน OTP"
                  value={
                    trial?.latestCode
                      ? trial.latestCode.delivery_channel === "SMS"
                        ? "ส่งทาง SMS แล้ว"
                        : "ส่งทางอีเมลแล้ว"
                      : "พร้อมขอรหัส"
                  }
                  done={trialReady}
                />
                <TrialStep
                  number="3"
                  title="สิทธิ์ทดลอง"
                  value={trialReady ? "พร้อมใช้งาน" : `${trial?.trialDays || 1} วัน`}
                  done={trialReady}
                />
              </div>

              {trialReady ? (
                <div className={styles.trialSuccess}>
                  <span className={styles.successIcon}>✓</span>
                  <div>
                    <b>{trial?.trial ? "Trial เปิดใช้งานแล้ว" : "Trial พร้อมใช้งาน"}</b>
                    <span>{trial?.eligibility?.message || "เชื่อม MT5 แล้วเริ่มใช้งานได้"}</span>
                  </div>
                </div>
              ) : !trialEligible ? (
                <div className={styles.trialUnavailable}>
                  <b>ไม่สามารถรับ Trial เพิ่มได้</b>
                  <span>{trial?.eligibility?.message || "บัญชีนี้ไม่มีสิทธิ์ Trial"}</span>
                </div>
              ) : (
                <div className={styles.otpPanel}>
                  <div className={styles.deliveryNote}>
                    <div>
                      <b>รับรหัสทางอีเมลเป็นค่าเริ่มต้น</b>
                      <span>
                        เมื่อกดขอรหัส ระบบจะส่ง OTP ไปยัง {trial?.email?.masked || "อีเมลที่ลงทะเบียน"} ก่อน
                        {trial?.phone?.masked
                          ? ` หากผู้ให้บริการอีเมลส่งไม่สำเร็จ ระบบจะลองส่ง SMS ไปที่ ${trial.phone.masked} ให้อัตโนมัติ`
                          : " หากส่งอีเมลไม่สำเร็จและยังไม่มีเบอร์มือถือสำรอง ระบบจะแจ้งให้เพิ่มเบอร์ใน My Account"}
                      </span>
                    </div>
                  </div>
                  <div className={styles.otpMeta}>
                    <div>
                      <span>ช่องทางหลัก</span>
                      <strong>{trial?.email?.masked || account.user.email}</strong>
                    </div>
                    <div>
                      <span>ช่องทางสำรอง</span>
                      <strong>{trial?.phone?.masked || "ยังไม่ผูกเบอร์มือถือ"}</strong>
                    </div>
                    <div>
                      <span>อายุรหัส / สิทธิ์ขอวันนี้</span>
                      <strong>{trial.otp?.expiresInMinutes || 10} นาที · เหลือ {sendsRemaining} ครั้ง</strong>
                    </div>
                  </div>

                  <div className={styles.otpActions}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={requestOtp}
                      disabled={
                        Boolean(busy) ||
                        cooldown > 0 ||
                        sendsRemaining <= 0 ||
                        !trial.verificationConfigured
                      }
                    >
                      {busy === "otp-send"
                        ? "กำลังส่ง..."
                        : cooldown > 0
                          ? `ส่งใหม่ได้ใน ${cooldown}s`
                          : trial.latestCode
                            ? "ส่ง OTP ใหม่"
                            : "ส่ง OTP"}
                    </button>

                    <label className={styles.otpInput}>
                      <span>รหัส OTP 6 หลัก</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        name="scenova_package_trial_otp"
                        maxLength={6}
                        value={otp}
                        onChange={event => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                        disabled={Boolean(busy)}
                      />
                    </label>

                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={verifyOtp}
                      disabled={Boolean(busy) || otp.length !== 6}
                    >
                      {busy === "otp-verify" ? "กำลังตรวจสอบ..." : "ยืนยัน OTP"}
                    </button>
                  </div>

                  {!trial.emailConfigured && trial.smsConfigured && (
                    <div className={styles.smsWarning}>ระบบอีเมลยังไม่พร้อมใช้งานในขณะนี้ คำขอ OTP จะใช้ SMS เป็นช่องทางหลักชั่วคราว</div>
                  )}
                  {!trial.verificationConfigured && (
                    <div className={styles.smsWarning}>ระบบส่ง OTP ยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ</div>
                  )}
                </div>
              )}
            </div>}
          </section>

          {activePending && (
            <section className={styles.paymentPanel}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>PAYMENT IN PROGRESS</span>
                  <h2>รายการรอชำระ</h2>
                </div>
              </div>
              <div className={styles.pendingGrid}>
                <PaymentCard
                  type={isLocalSystem ? "LOCAL" : "CLOUD"}
                  order={activePending}
                  busy={Boolean(busy)}
                  onRefresh={() => refreshOrder(isLocalSystem ? "local" : "cloud", activePending.id)}
                />
              </div>
            </section>
          )}

          <section className={styles.accessCenter}>
            <div className={styles.centerTop}>
              <div>
                <span className={styles.eyebrow}>SCENOVA ACCESS CENTER</span>
                <h2>เลือกระบบที่ต้องการใช้งาน</h2>
                <p>เลือกใช้งานบนเครื่องของคุณ หรือทำงานต่อเนื่องบน Cloud</p>
              </div>
              <div className={styles.systemSwitcher} role="tablist" aria-label="เลือกระบบแพ็กเกจ">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeSystem === "CLOUD"}
                  className={`${styles.systemTab} ${activeSystem === "CLOUD" ? styles.systemTabActive : ""}`}
                  onClick={() => setActiveSystem("CLOUD")}
                >
                  <span className={styles.tabIcon}><ScenovaIcon name="cloud" size={22}/></span>
                  <span><b>VPS / Cloud MT5</b><small>รันต่อเนื่องบนเซิร์ฟเวอร์ 24/7</small></span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeSystem === "LOCAL"}
                  className={`${styles.systemTab} ${activeSystem === "LOCAL" ? styles.systemTabActive : ""}`}
                  onClick={() => setActiveSystem("LOCAL")}
                >
                  <span className={styles.tabIcon}><ScenovaIcon name="account" size={22}/></span>
                  <span><b>Local MT5</b><small>รันบนคอมพิวเตอร์ของคุณ</small></span>
                </button>
              </div>
            </div>

            <div className={styles.systemPanel}>
              <div className={styles.systemHeader}>
                <div className={styles.systemName}>
                  <span className={styles.systemIcon}>
                    <ScenovaIcon name={isLocalSystem ? "account" : "cloud"} size={24}/>
                  </span>
                  <div>
                    <span className={styles.eyebrow}>{isLocalSystem ? "LOCAL SYSTEM" : "VPS SYSTEM"}</span>
                    <h2>{isLocalSystem ? "Local MT5" : "VPS / Cloud MT5"}</h2>
                    <p>
                      {isLocalSystem
                        ? "ติดตั้ง EA บน MT5 ในคอมพิวเตอร์ของคุณเอง และควบคุมสิทธิ์ผ่าน SCENOVA"
                        : "MT5 และ EA ทำงานบน VPS ของ SCENOVA ปิดมือถือหรือคอมของคุณได้หลังจาก Start"}
                    </p>
                  </div>
                </div>
                <div className={styles.systemStatus}>
                  <span>{activeMembership ? "ACTIVE" : isLocalSystem ? "LOCAL" : "VPS"}</span>
                  <b>
                    {activeMembership
                      ? `ใช้ได้ถึง ${date(activeMembership.subscription_expires_at)}`
                      : isLocalSystem
                        ? "พร้อมเลือกแพ็กเกจ"
                        : activeCatalog
                          ? `${Number(activeCatalog.available || 0)} Slot พร้อม`
                          : "กำลังตรวจสอบ"}
                  </b>
                </div>
              </div>

              <div className={styles.systemFeatures}>
                {(isLocalSystem
                  ? [
                      "ใช้ MT5 บนเครื่องของคุณ",
                      "1 แพ็กเกจ / 1 บัญชี MT5",
                      "EA ทำงานเมื่อเครื่องและ MT5 เปิดอยู่",
                      "ต่ออายุเพิ่มจากเวลาที่เหลือ"
                    ]
                  : [
                      "รันบอทบน VPS 24/7",
                      "1 แพ็กเกจ / 1 Cloud MT5",
                      "Start / Stop จากมือถือ",
                      "Capacity Guard ก่อนเปิดขาย"
                    ]
                ).map(item => <span key={item}>{item}</span>)}
              </div>

              <div className={styles.promoBox}>
                <div>
                  <span className={styles.eyebrow}>PROMOTION CODE</span>
                  <b>มีรหัสส่วนลด?</b>
                  <small>ใส่รหัส SNV-XXXX-XXXX ระบบจะตรวจสิทธิ์และคำนวณราคาจาก Server ตอนสร้างรายการ</small>
                </div>
                <input
                  value={promoCode}
                  onChange={event => setPromoCode(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 13))}
                  placeholder="SNV-XXXX-XXXX"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
              </div>

              <div className={`${legacy.root} ${styles.legacyPackageScope}`}>
                <div className={styles.packageGrid}>
                  {(activeCatalog?.packages || []).map(pack => (
                    <PackageCard
                      key={pack.months}
                      system={activeSystem}
                      pack={pack}
                      checkoutEnabled={Boolean(activeCatalog?.checkoutEnabled)}
                      paymentMode={activeCatalog?.paymentMode || "UNCONFIGURED"}
                      busy={Boolean(busy)}
                      pending={Boolean(activePending)}
                      capacityAvailable={isLocalSystem || Number(cloudCatalog?.available || 0) > 0}
                      onBuy={() => {
                        setCheckoutPack(pack);
                        checkoutDialog.current?.showModal();
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>

          {activeCatalog?.paymentMode === "TEST" && (
            <div className={styles.testNotice}>
              Payment Gateway อยู่ในโหมดทดสอบ รายการนี้ยังไม่ใช่การรับชำระเงินจริง
            </div>
          )}

          <section className={styles.historyPanel}>
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.eyebrow}>MEMBERSHIP HISTORY</span>
                <h2>รายการล่าสุด · {isLocalSystem ? "Local MT5" : "VPS / Cloud MT5"}</h2>
              </div>
            </div>
            <div className={styles.historyGridSingle}>
              <OrderHistory title={isLocalSystem ? "Local MT5" : "VPS / Cloud MT5"} orders={activeOrders}/>
            </div>
          </section>
        </div>
        <dialog
          ref={checkoutDialog}
          className={styles.checkoutDialog}
          aria-labelledby="checkout-title"
          onCancel={event => { if (busy) event.preventDefault(); }}
        >
          {checkoutPack && <>
            <div className={styles.checkoutHeading}>
              <div><span className={styles.eyebrow}>SCENOVA CHECKOUT</span><h2 id="checkout-title">ยืนยันแพ็กเกจ</h2><p>ตรวจสอบรายละเอียดก่อนชำระเงิน</p></div>
              <button type="button" className={styles.closeDialog} aria-label="ปิดหน้าต่างชำระเงิน" disabled={Boolean(busy)} onClick={() => checkoutDialog.current?.close()}>×</button>
            </div>
            <div className={styles.checkoutColumns}>
              <aside className={styles.checkoutPlan}>
                <ScenovaIcon name={isLocalSystem ? "account" : "cloud"} size={32}/>
                <span className={styles.eyebrow}>{isLocalSystem ? "LOCAL MT5" : "VPS / CLOUD MT5"}</span>
                <h3>{checkoutPack.months} เดือน</h3>
                <strong className={styles.checkoutPrice}>฿{money(checkoutPack.price_satang)}</strong>
                <p>เฉลี่ย ฿{money(Math.round(checkoutPack.price_satang / checkoutPack.months))} / เดือน</p>
                <ul><li>สำหรับ 1 บัญชี MT5</li><li>{isLocalSystem ? "ใช้งานบนคอมพิวเตอร์ของคุณ" : "Start / Stop ผ่านมือถือ"}</li><li>ต่ออายุเพิ่มจากเวลาที่เหลือ</li></ul>
                <div className={styles.planFootnote}>SCENOVA<br/><span>ACCESS & MEMBERSHIP</span></div>
              </aside>
              <div className={styles.checkoutSummary}>
                <h3>สรุปการชำระเงิน</h3>
                <div className={styles.summaryRow}><span>แพ็กเกจ {checkoutPack.months} เดือน</span><b>฿{money(checkoutPack.price_satang)}</b></div>
                <label className={styles.promoField} htmlFor="package-promo">รหัสโปรโมชั่น</label>
                <div className={styles.promoInput}><input id="package-promo" placeholder="กรอกรหัสโปรโมชั่น" value={promoCode} onChange={event => setPromoCode(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 13))} autoCapitalize="characters" spellCheck={false}/><button type="button" onClick={() => setPromoCode(value => value.trim().toUpperCase())}>ใช้รหัส</button></div>
                <small className={styles.checkoutHint}>ระบบจะตรวจสอบสิทธิ์และคำนวณส่วนลดจาก Server ตอนสร้างรายการ</small>
                <div className={`${styles.summaryRow} ${styles.summaryTotal}`}><span>ยอดที่ต้องชำระ</span><strong>฿{money(checkoutPack.price_satang)}</strong></div>
                <p className={styles.checkoutHint}>ชำระครั้งเดียว · ไม่มีการต่ออายุอัตโนมัติ</p>
                <div className={styles.paymentMethod}><ScenovaIcon name="wallet" size={23}/><div><b>พร้อมเพย์ / QR Payment</b><p>สร้าง QR แล้วสแกนด้วยแอปธนาคารของคุณ</p></div></div>
                <p className={styles.checkoutHint}>สิทธิ์จะเปิดใช้งานเมื่อยืนยันการชำระเงินสำเร็จ ติดตามสถานะได้ที่รายการรอชำระ</p>
                {activeCatalog?.paymentMode === "TEST" && <div className={styles.testNotice}>โหมดทดสอบ · ยังไม่ใช่การรับชำระเงินจริง</div>}
                <button type="button" className={styles.confirmCheckout} disabled={Boolean(busy)} onClick={() => {
                  checkoutDialog.current?.close();
                  void (isLocalSystem ? checkoutLocal(checkoutPack.months) : checkoutCloud(checkoutPack.months));
                }}>สร้าง QR ชำระเงิน ฿{money(checkoutPack.price_satang)}</button>
                <button type="button" className={styles.cancelCheckout} disabled={Boolean(busy)} onClick={() => checkoutDialog.current?.close()}>ยกเลิก</button>
              </div>
            </div>
          </>}
        </dialog>
      </main>
    </div>
  );
}

function TrialStep({
  number,
  title,
  value,
  done
}:{
  number:string;
  title:string;
  value:string;
  done:boolean;
}) {
  return (
    <div className={`${styles.trialStep} ${done ? styles.trialStepDone : ""}`}>
      <span className={styles.stepNumber}>{done ? "✓" : number}</span>
      <div>
        <b>{title}</b>
        <span>{value}</span>
      </div>
    </div>
  );
}

function PackageCard({
  system,
  pack,
  checkoutEnabled,
  paymentMode,
  busy,
  pending,
  capacityAvailable = true,
  onBuy
}:{
  system:"LOCAL"|"CLOUD";
  pack:PackageItem;
  checkoutEnabled:boolean;
  paymentMode:string;
  busy:boolean;
  pending:boolean;
  capacityAvailable?:boolean;
  onBuy:()=>void;
}) {
  const available =
    pack.enabled &&
    pack.price_satang > 0 &&
    checkoutEnabled &&
    capacityAvailable &&
    !pending;

  const featured = pack.months === 3;
  const label =
    !pack.enabled || pack.price_satang <= 0
      ? "ยังไม่เปิดขาย"
      : !checkoutEnabled || paymentMode === "UNCONFIGURED"
        ? "ระบบชำระเงินยังไม่เปิด"
        : !capacityAvailable
          ? "VPS เต็มชั่วคราว"
          : pending
            ? "มีรายการรอชำระ"
            : "เลือกแพ็กเกจ";

  const features = system === "LOCAL"
    ? [
        "Local สำหรับ 1 บัญชี MT5",
        "ใช้ EA บนคอมพิวเตอร์ของคุณ",
        "ควบคุมสิทธิ์ผ่าน SCENOVA",
        "ต่ออายุรักษาเวลาที่เหลือ"
      ]
    : [
        "Cloud สำหรับ 1 บัญชี MT5",
        "Start / Stop ผ่านมือถือ",
        "ดูสถานะบอทได้ตลอด",
        "ต่ออายุรักษาเวลาที่เหลือ"
      ];

  return (
    <article className={`${legacy.package} ${styles.planCard} ${featured ? styles.planFeatured : ""}`}>
      {featured && <span className={styles.recommended}>แนะนำ</span>}
      <span className={legacy.eyebrow}>{system === "LOCAL" ? "LOCAL MT5" : "VPS / CLOUD MT5"}</span>
      <h3>{pack.months} เดือน</h3>
      <div className={legacy.price}>
        {pack.price_satang > 0 ? `฿${money(pack.price_satang)}` : "รอประกาศราคา"}
        <small>
          {pack.price_satang > 0
            ? `เฉลี่ย ฿${money(Math.round(pack.price_satang / pack.months))} / เดือน`
            : "ราคาจะแสดงเมื่อพร้อมเปิดขาย"}
        </small>
      </div>
      <div className={legacy.features}>
        {features.map(feature => <span key={feature}>{feature}</span>)}
      </div>
      <button
        type="button"
        className={`${legacy.button} ${featured ? legacy.primary : ""}`}
        disabled={busy || !available}
        onClick={onBuy}
      >
        {busy ? "กำลังดำเนินการ…" : label}
      </button>
      <small className={legacy.muted}>ชำระครั้งเดียว ไม่ตัดเงินต่ออายุอัตโนมัติ</small>
    </article>
  );
}

function PaymentCard({
  type,
  order,
  busy,
  onRefresh
}:{
  type:"LOCAL"|"CLOUD";
  order:Order;
  busy:boolean;
  onRefresh:()=>void;
}) {
  return (
    <article className={styles.paymentCard}>
      <div className={styles.paymentQr}>
        {order.qr_url && /^https:\/\//.test(order.qr_url) && order.status === "PENDING" ? (
          <img src={order.qr_url} alt={`QR PromptPay ${type} ${order.months} เดือน`} referrerPolicy="no-referrer"/>
        ) : (
          <div className={styles.qrPlaceholder}><ScenovaIcon name="wallet" size={28}/></div>
        )}
      </div>
      <div className={styles.paymentInfo}>
        <span className={styles.eyebrow}>{type} / {order.id.slice(0,8)}</span>
        <h3>{order.months} เดือน · ฿{money(order.amount)}</h3>
        {Number(order.discount_amount || 0) > 0 && (
          <div className={styles.promoApplied}>
            <span>{order.promotion_code}</span>
            <b>ลด ฿{money(Number(order.discount_amount || 0))}</b>
          </div>
        )}
        <p>
          {order.status === "REVIEW"
            ? "กำลังตรวจสอบรายการกับ Payment Gateway"
            : "สแกน QR ผ่านแอปธนาคาร ระบบจะเปิดสิทธิ์อัตโนมัติหลังยืนยันยอด"}
        </p>
        <small>QR หมดอายุ: {date(order.expires_at)}</small>
        <button type="button" className={styles.secondaryButton} onClick={onRefresh} disabled={busy}>
          ตรวจสอบการชำระเงิน
        </button>
      </div>
    </article>
  );
}

function OrderHistory({title,orders}:{title:string;orders:Order[]}) {
  return (
    <div className={styles.historyCard}>
      <h3>{title}</h3>
      {orders.length ? (
        <div className={styles.orderList}>
          {orders.slice(0,5).map(order => (
            <div className={styles.orderRow} key={order.id}>
              <div>
                <b>{order.months} เดือน</b>
                <span>{date(order.created_at)}</span>
              </div>
              <strong>฿{money(order.amount)}</strong>
              <em className={order.status === "PAID" ? styles.orderPaid : order.status === "FAILED" ? styles.orderFailed : ""}>
                {order.status}
              </em>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.empty}>ยังไม่มีรายการ</p>
      )}
    </div>
  );
}
