"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, getToken } from "../../lib/api";
import {
  CustomerMobileNav,
  CustomerSidebar,
  OwnerMobileNav,
  OwnerSidebar
} from "../../components/OwnerSidebar";
import { ScenovaIcon } from "../../components/ScenovaIcon";
import { useSystemPopup } from "../../components/SystemPopupProvider";
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
  price_usd_cents: number;
  estimated_price_satang?: number;
  enabled: boolean;
  updated_at: string;
};

type PaymentAccount = {
  id: number;
  bankCode: string;
  bankName: string;
  bankShortCode: string;
  bankNumber: string;
  nameTh: string;
  nameEn: string;
  type: string;
};

type Catalog = {
  packages: PackageItem[];
  fx?: { usdThb:number; source:string; quotedAt:string };
  capacityAvailable?: boolean;
  paymentMode: string;
  paymentAccounts?: PaymentAccount[];
  checkoutEnabled: boolean;
  salesPaused?: boolean;
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
  purchase_type?: string | null;
  slot_type?: string | null;
  list_price_usd_cents?: number | null;
  final_price_usd_cents?: number | null;
  fx_rate_usd_thb?: number | null;
  fx_source?: string | null;
  fx_quoted_at?: string | null;
};

type PromotionPreview = {
  code:string;
  active:boolean;
  discountPercent:number;
  discountAmountSatang:number;
  finalAmountSatang:number;
  originalUsdCents?:number;
  discountUsdCents?:number;
  finalUsdCents?:number;
  estimatedThbSatang?:number;
  fx?:{ usdThb:number; source:string; quotedAt:string };
};

type BrokerBenefitSummary = {
  partner?: {
    status?: string;
    verified?: boolean;
    benefit?: {
      levelCode?: string;
      levelName?: string;
      discountPercent?: number;
      discountBps?: number;
    } | null;
  } | null;
};


function promoAlnum(value: string) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11);
}

function formatPromoCode(value: string) {
  const clean = promoAlnum(value);
  if (!clean) return "";
  if (clean.length <= 3) return clean;
  if (clean.length <= 7) return clean.slice(0, 3) + "-" + clean.slice(3);
  return clean.slice(0, 3) + "-" + clean.slice(3, 7) + "-" + clean.slice(7, 11);
}

function thbMoney(satang: number) {
  return (Number(satang || 0) / 100).toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function usdMoney(cents: number) {
  return (Number(cents || 0) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function packageDisplayName(months: number) {
  const names:Record<number,string> = {
    1:"START",
    3:"ACTIVE",
    6:"PRO",
    12:"PRIME"
  };
  return names[Number(months)] || ("SCENOVA " + Number(months) + "M");
}

function packageDisplayLabel(months: number) {
  return packageDisplayName(months) + " · " + Number(months) + " เดือน";
}

function maskedBankNumber(value?: string | null) {
  const digits=String(value||"").replace(/\D/g,"");
  if(!digits) return "";
  if(digits.length<=4) return digits;
  return "•••• "+digits.slice(-4);
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
  const { confirmPopup } = useSystemPopup();
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
  const [trialDelivery, setTrialDelivery] = useState<"SMS" | "EMAIL">("SMS");
  const [cooldown, setCooldown] = useState(0);
  const [activeSystem, setActiveSystem] = useState<"LOCAL" | "CLOUD">("CLOUD");
  const [trialOpen, setTrialOpen] = useState(false);
  const [checkoutPack, setCheckoutPack] = useState<PackageItem | null>(null);
  const checkoutDialog = useRef<HTMLDialogElement>(null);
  const [promoCode, setPromoCode] = useState("");
  const [promoPreview, setPromoPreview] = useState<PromotionPreview | null>(null);
  const [brokerBenefit, setBrokerBenefit] = useState<BrokerBenefitSummary | null>(null);
  const [promoState, setPromoState] = useState<"IDLE"|"CHECKING"|"ACTIVE"|"ERROR">("IDLE");
  const [promoNotice, setPromoNotice] = useState("");
  const [checkoutOrderId, setCheckoutOrderId] = useState("");
  const polling = useRef(false);

  const role = String(account?.user.role || "").toUpperCase();
  const elevated = ["OWNER", "ADMIN"].includes(role);
  const isOwner = role === "OWNER";
  const partnerSummary = account?.access.partner ? {
    usedSeats: Number(account.access.partner.used_seats || 0),
    seat_limit: Number(account.access.partner.seat_limit || 0),
    status: String(account.access.partner.status || "ACTIVE")
  } : null;

  async function load() {
    const [a, t, lc, lo, cc, co, broker] = await Promise.all([
      api("/auth/account"),
      api("/trial-access/status").catch(() => null),
      api("/packages/local/catalog"),
      api("/packages/local/orders"),
      api("/cloud/catalog"),
      api("/cloud/orders"),
      api("/brokers/exness").catch(() => null)
    ]);
    setAccount(a);
    setTrial(t);
    setTrialDelivery(
      t?.defaultDelivery === "SMS" && t?.phone?.masked && t?.smsConfigured
        ? "SMS"
        : "EMAIL"
    );
    setLocalCatalog(lc);
    setLocalOrders(Array.isArray(lo) ? lo : []);
    setCloudCatalog(cc);
    setCloudOrders(Array.isArray(co) ? co : []);
    setBrokerBenefit(broker);
    if (t?.otp?.resendAfterSeconds != null) {
      setCooldown(Number(t.otp.resendAfterSeconds || 0));
    }
    return {
      localOrders: Array.isArray(lo) ? lo : [],
      cloudOrders: Array.isArray(co) ? co : []
    };
  }

  useEffect(() => {
    if (!getToken()) {
      window.location.replace("/login");
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const requestedSystem = String(params.get("system") || "").toUpperCase();
    if (requestedSystem === "LOCAL" || requestedSystem === "CLOUD") {
      setActiveSystem(requestedSystem);
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
  const primaryCloudOrders = useMemo(
    () => cloudOrders.filter(order =>
      String(order.purchase_type || "PACKAGE").toUpperCase() !== "ADDON" &&
      String(order.slot_type || "PERSONAL").toUpperCase() !== "ADDON"
    ),
    [cloudOrders]
  );
  const pendingCloud = primaryCloudOrders.find(order => ["CREATING", "PENDING", "REVIEW"].includes(order.status));

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
    () => primaryCloudOrders.find(order =>
      order.status === "PAID" &&
      order.subscription_expires_at &&
      new Date(order.subscription_expires_at).getTime() > Date.now()
    ),
    [primaryCloudOrders]
  );
  const hasPrimaryCloudSlot = primaryCloudOrders.some(order =>
    order.status === "PAID" && Boolean(order.slot_id)
  );

  function notify(kind: "good" | "bad" | "info", text: string) {
    setMessageKind(kind);
    setMessage(text);
  }

  function clearPromoForm() {
    setPromoCode("");
    setPromoPreview(null);
    setPromoState("IDLE");
    setPromoNotice("");
  }

  async function requestOtp() {
    if (busy || cooldown > 0 || !trial?.verificationConfigured) return;
    setBusy("otp-send");
    setMessage("");
    try {
      const result = await api("/trial-access/request-code", {
        method: "POST",
        body: JSON.stringify({ delivery: trialDelivery })
      });
      setCooldown(Number(result.resendAfterSeconds || 60));
      setOtp("");
      const channel = result.deliveryChannel === "SMS" ? "SMS" : "อีเมล";
      notify(
        "good",
        `ส่งรหัสยืนยันทาง${channel} ไปยัง ${result.deliveryMasked} แล้ว${result.fallbackUsed ? " · ส่งผ่านช่องทางสำรองเรียบร้อยแล้ว" : ""}`
      );
      await load();
    } catch (error: unknown) {
      notify("bad", error instanceof Error ? error.message : "ไม่สามารถส่งรหัสยืนยันได้ กรุณาลองใหม่อีกครั้ง");
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
      notify("good", result.message || "เปิดสิทธิ์ทดลองใช้งานเรียบร้อยแล้ว");
      await load();
    } catch (error: unknown) {
      notify("bad", error instanceof Error ? error.message : "ไม่สามารถยืนยันรหัสได้ กรุณาตรวจสอบแล้วลองใหม่อีกครั้ง");
    } finally {
      setBusy("");
    }
  }

  async function checkoutLocal(months: number) {
    if (busy) return null;
    setBusy("local-" + months);
    setMessage("");
    try {
      const result = await api("/packages/local/checkout", {
        method: "POST",
        body: JSON.stringify({ months, promoCode: formatPromoCode(promoCode) })
      });
      clearPromoForm();
      await load();
      if (result?.free) {
        checkoutDialog.current?.close();
        setCheckoutOrderId("");
        setCheckoutPack(null);
        notify("good", "ใช้โปรโมชั่น 100% และเปิดสิทธิ์ Local แล้ว");
      } else {
        setCheckoutOrderId(String(result?.id || ""));
      }
      return result;
    } catch (error: unknown) {
      notify("bad", error instanceof Error ? error.message : "สร้างรายการ Local ไม่สำเร็จ");
      await load().catch(() => {});
      return null;
    } finally {
      setBusy("");
    }
  }

  async function checkoutCloud(months: number) {
    if (busy) return null;
    setBusy("cloud-" + months);
    setMessage("");
    try {
      const result = await api("/cloud/checkout", {
        method: "POST",
        body: JSON.stringify({ months, promoCode: formatPromoCode(promoCode) })
      });
      clearPromoForm();
      await load();
      if (result?.free) {
        checkoutDialog.current?.close();
        setCheckoutOrderId("");
        setCheckoutPack(null);
        notify("good", "ใช้โปรโมชั่น 100% และเปิด/ต่ออายุแพ็กเกจ VPS หลักแล้ว");
      } else {
        setCheckoutOrderId(String(result?.id || ""));
      }
      return result;
    } catch (error: unknown) {
      notify("bad", error instanceof Error ? error.message : "สร้างรายการแพ็กเกจ VPS หลักไม่สำเร็จ");
      await load().catch(() => {});
      return null;
    } finally {
      setBusy("");
    }
  }

  async function applyPromo() {
    if (!checkoutPack || busy) return;
    const code = formatPromoCode(promoCode);
    if (!/^SNV-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
      setPromoPreview(null);
      setPromoState("ERROR");
      setPromoNotice("รหัสไม่ครบ");
      return;
    }
    setPromoState("CHECKING");
    setPromoNotice("");
    try {
      const result = await api(
        activeSystem === "LOCAL" ? "/packages/local/promotion-preview" : "/cloud/promotion-preview",
        {
          method:"POST",
          body:JSON.stringify({ months:checkoutPack.months, code })
        }
      );
      setPromoCode(promoAlnum(String(result?.code || code)));
      setPromoPreview(result);
      setPromoState("ACTIVE");
    } catch (error:unknown) {
      setPromoPreview(null);
      setPromoState("ERROR");
      setPromoNotice(error instanceof Error ? error.message : "ใช้รหัสนี้ไม่ได้");
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

  async function cancelSlipPayment(type: "local" | "cloud", id: string) {
    if (busy) return false;
    setBusy("cancel-" + type);
    setMessage("");
    try {
      await api(
        type === "local"
          ? `/packages/local/orders/${id}/cancel-slip-payment`
          : `/cloud/orders/${id}/cancel-slip-payment`,
        { method: "POST" }
      );
      await load();
      return true;
    } catch {
      return false;
    } finally {
      setBusy("");
    }
  }

  async function closeCheckoutDialog() {
    if (busy) return;
    if (checkoutOrderId) {
      const cancelled = await cancelSlipPayment(
        activeSystem === "LOCAL" ? "local" : "cloud",
        checkoutOrderId
      );
      if (!cancelled) return;
      setCheckoutOrderId("");
    }
    setCheckoutPack(null);
    setPromoState("IDLE");
    setPromoNotice("");
    checkoutDialog.current?.close();
  }

  async function verifySlip(type: "local" | "cloud", id: string, file: File) {
    if (busy) return null;
    if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type)) {
      notify("bad", "รองรับสลิป JPG, PNG, GIF หรือ WebP เท่านั้น");
      return null;
    }
    if (file.size <= 0 || file.size > 4 * 1024 * 1024) {
      notify("bad", "รูปสลิปต้องมีขนาดไม่เกิน 4 MB");
      return null;
    }

    setBusy("slip-" + type);
    setMessage("");
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("อ่านไฟล์สลิปไม่สำเร็จ"));
        reader.readAsDataURL(file);
      });

      const result = await api(
        type === "local"
          ? `/packages/local/orders/${id}/verify-slip`
          : `/cloud/orders/${id}/verify-slip`,
        {
          method: "POST",
          body: JSON.stringify({ base64 })
        }
      );
      await load();
      notify(
        "good",
        result?.status === "PAID"
          ? "ตรวจสลิปสำเร็จ เปิดสิทธิ์ใช้งานแล้ว"
          : "ตรวจสลิปสำเร็จ"
      );
      return result;
    } catch (error: unknown) {
      notify("bad", error instanceof Error ? error.message : "ตรวจสลิปไม่สำเร็จ");
      return null;
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
  const salesPaused = Boolean(localCatalog?.salesPaused || cloudCatalog?.salesPaused);
  const checkoutOrder = checkoutOrderId
    ? activeOrders.find(order => order.id === checkoutOrderId) || null
    : null;
  const partnerDiscountPercent = brokerBenefit?.partner?.verified
    ? Math.max(0, Math.min(50, Number(brokerBenefit.partner.benefit?.discountPercent || 0)))
    : 0;
  const promoDiscountPercent = promoPreview?.active
    ? Math.max(0, Math.min(100, Number(promoPreview.discountPercent || 0)))
    : 0;
  const checkoutDiscountPercent = Math.max(partnerDiscountPercent, promoDiscountPercent);
  const partnerBenefitWins = partnerDiscountPercent > 0 && partnerDiscountPercent >= promoDiscountPercent;
  const checkoutBaseUsdCents = Number(checkoutPack?.price_usd_cents || 0);
  const checkoutBaseThbSatang = Number(checkoutPack?.estimated_price_satang || 0);
  const checkoutUsdCents = Math.max(
    0,
    checkoutBaseUsdCents - Math.round(checkoutBaseUsdCents * checkoutDiscountPercent / 100)
  );
  const checkoutEstimatedThb = Math.max(
    0,
    checkoutBaseThbSatang - Math.floor(checkoutBaseThbSatang * checkoutDiscountPercent / 100)
  );
  const checkoutDiscountUsdCents = Math.max(0, checkoutBaseUsdCents - checkoutUsdCents);

  async function setGlobalSalesPaused(paused: boolean) {
    if (!isOwner || busy) return;
    if (paused) {
      const confirmed = await confirmPopup({
        title: "ปิดการขายทั้งหมด",
        tone: "warning",
        message:
          "ปิดการขายแพ็กเกจ Local และ Cloud ทั้งหมดชั่วคราว?\n\n" +
          "ลูกค้าจะสร้างรายการชำระเงินใหม่ไม่ได้ แต่รายการที่สร้างไว้แล้วจะไม่ถูกยกเลิก",
        confirmLabel: "ปิดการขายทั้งหมด",
        cancelLabel: "ยกเลิก"
      });
      if (!confirmed) return;
    }

    setBusy("sales-control");
    try {
      await api("/admin/sales-control", {
        method: "POST",
        body: JSON.stringify({ paused })
      });
      checkoutDialog.current?.close();
      setCheckoutPack(null);
      await load();
      notify(
        "good",
        paused
          ? "ปิดการขายแพ็กเกจ Local และ Cloud ทั้งหมดแล้ว"
          : "เปิดการขายแพ็กเกจ Local และ Cloud แล้ว"
      );
    } catch (error: unknown) {
      notify("bad", error instanceof Error ? error.message : "เปลี่ยนสถานะการขายไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

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
          {message && (
            <div role="status" className={`${styles.message} ${messageKind === "good" ? styles.good : messageKind === "bad" ? styles.bad : ""}`}>
              {message}
            </div>
          )}

          <section className={styles.trialPanel}>
            <div className={styles.trialHead}>
              <div className={styles.titleWithIcon}>
                <span className={styles.icon}><ScenovaIcon name="status" size={19}/></span>
                <div>
                  <span className={styles.eyebrow}>LOCAL MT5 TRIAL</span>
                  <h2>ทดลองใช้งาน Local MT5</h2>
                  <p>ทดลอง Local MT5 · ยืนยันผ่าน SMS หรืออีเมล</p>
                </div>
              </div>
              <div className={styles.trialHeaderActions}>
                <span className={`${styles.badge} ${trialReady ? styles.badgeGood : ""}`}>
                  {trial?.trial ? "กำลังใช้งาน" : trial?.authorization ? "พร้อมใช้งาน" : trialEligible ? "พร้อมยืนยัน" : "ไม่สามารถใช้งานได้"}
                </span>
                <button
                  type="button"
                  className={styles.trialToggle}
                  onClick={() => setTrialOpen(value => !value)}
                  aria-expanded={trialOpen}
                >
                  {trialOpen ? "ปิด" : trialReady ? "ดูสิทธิ์" : trialEligible ? "เริ่มทดลอง" : "ดูรายละเอียด"}
                </button>
              </div>
            </div>

            {trialOpen && <div className={styles.trialBody}>
              <div className={styles.localTrialBadge}>LOCAL MT5 TRIAL</div>

              {trialReady ? (
                <div className={styles.trialSuccess}>
                  <span className={styles.successIcon}>✓</span>
                  <div>
                    <b>{trial?.trial ? "สิทธิ์ทดลองใช้งานเปิดแล้ว" : "สิทธิ์ทดลองใช้งานพร้อมแล้ว"}</b>
                    <span>{trial?.eligibility?.message || "เชื่อม MT5 แล้วเริ่มใช้งานได้"}</span>
                  </div>
                </div>
              ) : !trialEligible ? (
                <div className={styles.trialUnavailable}>
                  <b>ไม่สามารถเปิดสิทธิ์ทดลองใช้งานเพิ่มได้</b>
                  <span>{trial?.eligibility?.message || "บัญชีนี้ไม่เข้าเงื่อนไขสิทธิ์ทดลองใช้งาน"}</span>
                </div>
              ) : (
                <div className={styles.otpPanel}>
                  <div className={styles.deliveryNote}>
                    <div>
                      <b>เลือกช่องทางรับรหัสยืนยัน</b>
                      <span>รหัสยืนยันมีอายุ {trial?.otp?.expiresInMinutes || 10} นาที · ส่งได้อีก {sendsRemaining} ครั้งวันนี้</span>
                    </div>
                    <div className={styles.deliveryChoice}>
                      <button
                        type="button"
                        className={trialDelivery === "SMS" ? styles.deliveryActive : ""}
                        disabled={!trial?.smsConfigured || !trial?.phone?.masked}
                        onClick={()=>setTrialDelivery("SMS")}
                      >
                        SMS · {trial?.phone?.masked || "ยังไม่ผูกเบอร์"}
                      </button>
                      <button
                        type="button"
                        className={trialDelivery === "EMAIL" ? styles.deliveryActive : ""}
                        disabled={!trial?.emailConfigured}
                        onClick={()=>setTrialDelivery("EMAIL")}
                      >
                        Email · {trial?.email?.masked || account.user.email}
                      </button>
                    </div>
                  </div>
                  {!trial?.phone?.masked && (
                    <div className={styles.smsWarning}>
                      ต้องการรับรหัสทาง SMS? <a href="/account#phone-settings">เพิ่มและยืนยันเบอร์มือถือใน My Account</a>
                    </div>
                  )}

                  <div className={styles.otpActions}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={requestOtp}
                      disabled={
                        Boolean(busy) ||
                        cooldown > 0 ||
                        sendsRemaining <= 0 ||
                        !trial?.verificationConfigured ||
                        (trialDelivery === "SMS" && (!trial?.smsConfigured || !trial?.phone?.masked)) ||
                        (trialDelivery === "EMAIL" && !trial?.emailConfigured)
                      }
                    >
                      {busy === "otp-send"
                        ? "กำลังส่งรหัส..."
                        : cooldown > 0
                          ? `ส่งรหัสใหม่ได้ใน ${cooldown} วินาที`
                          : trial?.latestCode
                            ? `ส่งรหัสยืนยันทาง ${trialDelivery === "SMS" ? "SMS" : "Email"} ใหม่`
                            : `ส่งรหัสยืนยันทาง ${trialDelivery === "SMS" ? "SMS" : "Email"}`}
                    </button>

                    <label className={styles.otpInput}>
                      <span>รหัสยืนยัน 6 หลัก</span>
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
                      {busy === "otp-verify" ? "กำลังตรวจสอบ..." : "ยืนยันและเปิดสิทธิ์ทดลอง"}
                    </button>
                  </div>

                  {!trial?.smsConfigured && trial?.emailConfigured && (
                    <div className={styles.smsWarning}>บริการ SMS ไม่พร้อมใช้งานชั่วคราว สามารถรับรหัสยืนยันทางอีเมลแทนได้</div>
                  )}
                  {!trial?.verificationConfigured && (
                    <div className={styles.smsWarning}>บริการส่งรหัสยืนยันไม่พร้อมใช้งานในขณะนี้ กรุณาลองใหม่ภายหลัง</div>
                  )}
                </div>
              )}
            </div>}
          </section>

          {activePending && (
            <section className={styles.paymentPanel}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>PAYMENT DETAILS</span>
                  <h2>ดำเนินการชำระเงิน</h2>
                </div>
                <span className={styles.paymentStatus}>รายการรอดำเนินการ</span>
              </div>
              <div className={styles.pendingGrid}>
                <PaymentCard
                  type={isLocalSystem ? "LOCAL" : "CLOUD"}
                  order={activePending}
                  busy={Boolean(busy)}
                  paymentMode={activeCatalog?.paymentMode || "UNCONFIGURED"}
                  paymentAccounts={activeCatalog?.paymentAccounts || []}
                  onRefresh={() => refreshOrder(isLocalSystem ? "local" : "cloud", activePending.id)}
                  onVerifySlip={file => verifySlip(isLocalSystem ? "local" : "cloud", activePending.id, file)}
                  onCancel={() => { void cancelSlipPayment(isLocalSystem ? "local" : "cloud", activePending.id); }}
                />
              </div>
            </section>
          )}

          <section className={styles.accessCenter}>
            <div className={styles.centerTop}>
              <div>
                <span className={styles.eyebrow}>YOUR MEMBERSHIP</span>
                <h2>เลือกแพ็กเกจของคุณ</h2>
                <p>เลือกใช้งานบนเครื่องของคุณ หรือทำงานต่อเนื่องบน Cloud</p>
              </div>
              <div className={styles.centerControls}>
                {isOwner && (
                  <div className={`${styles.ownerSalesControl} ${salesPaused ? styles.ownerSalesPaused : ""}`}>
                    <span className={styles.ownerSalesState}>
                      <i aria-hidden="true"/>
                      {salesPaused ? "ปิดการขายอยู่" : "เปิดขายอยู่"}
                    </span>
                    <button
                      type="button"
                      disabled={busy === "sales-control"}
                      onClick={() => void setGlobalSalesPaused(!salesPaused)}
                    >
                      {busy === "sales-control"
                        ? "กำลังบันทึก..."
                        : salesPaused
                          ? "เปิดการขายทั้งหมด"
                          : "ปิดการขายทั้งหมด"}
                    </button>
                  </div>
                )}
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
            </div>

            {salesPaused && (
              <div className={styles.salesPausedNotice}>
                <ScenovaIcon name="status" size={18}/>
                <div>
                  <b>ปิดรับการขายชั่วคราว</b>
                  <span>ไม่สามารถสร้างรายการชำระเงินใหม่ได้ในขณะนี้ · สิทธิ์เดิมและรายการที่สร้างไว้แล้วไม่ถูกยกเลิก</span>
                </div>
              </div>
            )}

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
                          ? elevated
                            ? `${Number(activeCatalog.available || 0)} Slot พร้อม`
                            : Number(activeCatalog.available || 0) > 0
                              ? "พร้อมเลือกแพ็กเกจ"
                              : "VPS เต็มชั่วคราว"
                          : "กำลังตรวจสอบ"}
                  </b>
                </div>
              </div>

              <div className={styles.systemFeatures}>
                {(isLocalSystem
                  ? [
                      "ติดตั้ง EA บน MT5 ของคุณ",
                      "1 แพ็กเกจสำหรับ 1 บัญชี MT5",
                      "ต้องเปิดคอมพิวเตอร์และ MT5 ขณะใช้งาน",
                      "ต่ออายุเพิ่มจากเวลาคงเหลือ"
                    ]
                  : [
                      "Slot #1 คือแพ็กเกจ VPS หลักสำหรับ 1 บัญชี MT5",
                      "แพ็กเกจหลักต้อง Active จึงจะใช้งาน Slot เสริมได้",
                      "การต่ออายุแพ็กเกจหลักต่อจากเวลาคงเหลือเดิม",
                      "อายุของ Slot เสริมจะไม่ถูกยืดตามแพ็กเกจหลัก"
                    ]
                ).map(item => <span key={item}>{item}</span>)}
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
                      salesPaused={salesPaused}
                      busy={Boolean(busy)}
                      pending={isLocalSystem && Boolean(activePending)}
                      capacityAvailable={isLocalSystem || hasPrimaryCloudSlot || cloudCatalog?.capacityAvailable !== false}
                      renewal={!isLocalSystem && hasPrimaryCloudSlot}
                      onBuy={() => {
                        setCheckoutPack(pack);
                        setCheckoutOrderId("");
                        setPromoCode("");
                        setPromoPreview(null);
                        setPromoState("IDLE");
                        setPromoNotice("");
                        checkoutDialog.current?.showModal();
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className={styles.purchaseNote}><ScenovaIcon name="wallet" size={17}/><span>{activeCatalog?.paymentMode === "EASYSLIP" ? "โอนเงินตามยอดจริงแล้วแนบสลิป · ระบบตรวจและเปิดสิทธิ์อัตโนมัติ" : "ชำระผ่าน QR Payment · เพิ่มรหัสโปรโมชั่นได้ในขั้นตอนยืนยันแพ็กเกจ"}</span></div>
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
          onCancel={event => {
            event.preventDefault();
            if (!busy) void closeCheckoutDialog();
          }}
          onClose={() => {
            if (!checkoutOrderId) {
              setPromoState("IDLE");
              setPromoNotice("");
            }
          }}
        >
          {checkoutPack && <>
            <div className={styles.checkoutHeading}>
              <div>
                <span className={styles.eyebrow}>SCENOVA CHECKOUT</span>
                <h2 id="checkout-title">{checkoutOrder ? "ชำระเงินแพ็กเกจ" : "แพ็กเกจที่คุณเลือก"}</h2>
                <p>{checkoutOrder ? "สแกน QR และแนบสลิปได้ในหน้าต่างนี้" : "ตรวจสอบรายละเอียด แล้วดำเนินการชำระเงิน"}</p>
              </div>
              <button
                type="button"
                className={styles.closeDialog}
                aria-label="ปิดหน้าต่างชำระเงิน"
                disabled={Boolean(busy)}
                onClick={() => void closeCheckoutDialog()}
              >
                ×
              </button>
            </div>

            <div className={styles.checkoutSteps} aria-label="ขั้นตอนการชำระเงิน">
              <span aria-current={!checkoutOrder ? "step" : undefined} className={!checkoutOrder ? styles.checkoutStepActive : styles.checkoutStepDone}>
                <b>01</b> ยืนยันแพ็กเกจ
              </span>
              <i aria-hidden="true"/>
              <span aria-current={checkoutOrder ? "step" : undefined} className={checkoutOrder ? styles.checkoutStepActive : ""}>
                <b>02</b> สแกน + แนบสลิป
              </span>
            </div>

            {!checkoutOrder ? (
              <div className={styles.checkoutColumns}>
                <aside className={styles.checkoutPlan}>
                  <ScenovaIcon name={isLocalSystem ? "account" : "cloud"} size={32}/>
                  <span className={styles.eyebrow}>{isLocalSystem ? "LOCAL MT5" : "VPS / CLOUD MT5"}</span>
                  <h3>{packageDisplayLabel(checkoutPack.months)}</h3>
                  <strong className={styles.checkoutPrice}>${usdMoney(checkoutUsdCents)} USD</strong>
                  <p>เฉลี่ย ${usdMoney(Math.round(checkoutUsdCents / checkoutPack.months))} USD / เดือน</p>
                  <ul>
                    <li>สำหรับ 1 บัญชี MT5</li>
                    <li>{isLocalSystem ? "ใช้งานบนคอมพิวเตอร์ของคุณ" : "Start / Stop ผ่านมือถือ"}</li>
                    <li>ต่ออายุเพิ่มจากเวลาที่เหลือ</li>
                  </ul>
                  <div className={styles.planFootnote}>SCENOVA<br/><span>ACCESS & MEMBERSHIP</span></div>
                </aside>

                <div className={styles.checkoutSummary}>
                  <h3>สรุปการชำระเงิน</h3>
                  <div className={styles.summaryRow}>
                    <span>แพ็กเกจ {packageDisplayLabel(checkoutPack.months)}</span>
                    <b>${usdMoney(checkoutPack.price_usd_cents)} USD</b>
                  </div>

                  {partnerDiscountPercent > 0 && (
                    <div className={styles.partnerBenefitLive}>
                      <div>
                        <span>EXNESS PARTNER BENEFIT</span>
                        <b>{brokerBenefit?.partner?.benefit?.levelCode || "PARTNER"}</b>
                      </div>
                      <strong>ลด {partnerDiscountPercent}% อัตโนมัติ</strong>
                    </div>
                  )}

                  <label className={styles.promoField} htmlFor="package-promo">รหัสโปรโมชั่น</label>
                  <div className={styles.promoInput + " " + (promoState === "ACTIVE" ? styles.promoInputActive : promoState === "ERROR" ? styles.promoInputError : "")}>
                    <input
                      id="package-promo"
                      placeholder="SNV-XXXX-XXXX"
                      value={formatPromoCode(promoCode)}
                      onKeyDown={event => {
                        if (event.key === "-") {
                          event.preventDefault();
                          setPromoNotice("ใช้เฉพาะตัวอักษรและตัวเลข");
                          setPromoState(current => current === "ACTIVE" ? "IDLE" : current);
                        }
                      }}
                      onPaste={event => {
                        const text = event.clipboardData.getData("text");
                        if (text.includes("-")) setPromoNotice("ใช้เฉพาะตัวอักษรและตัวเลข");
                        event.preventDefault();
                        setPromoCode(promoAlnum(text));
                        setPromoPreview(null);
                        setPromoState("IDLE");
                      }}
                      onChange={event => {
                        setPromoCode(promoAlnum(event.target.value));
                        setPromoPreview(null);
                        setPromoState("IDLE");
                        setPromoNotice("");
                      }}
                      autoCapitalize="characters"
                      spellCheck={false}
                      inputMode="text"
                    />
                    <button
                      type="button"
                      className={promoState === "ACTIVE" ? styles.promoActiveButton : ""}
                      disabled={Boolean(busy) || promoState === "CHECKING" || promoState === "ACTIVE"}
                      onClick={() => void applyPromo()}
                    >
                      {promoState === "CHECKING" ? "กำลังเช็ก…" : promoState === "ACTIVE" ? "ACTIVE ✓" : "ใช้รหัส"}
                    </button>
                  </div>
                  {promoNotice && <div className={styles.promoNotice}>{promoNotice}</div>}
                  {promoPreview?.active && (
                    <div className={styles.promoLive}>
                      <span>{promoPreview.code}</span>
                      <b>ลด {promoPreview.discountPercent}% · -${usdMoney(Number(promoPreview.discountUsdCents || 0))}</b>
                    </div>
                  )}

                  {promoPreview?.active && partnerBenefitWins && (
                    <div className={styles.partnerWinsNotice}>
                      Partner Benefit {partnerDiscountPercent}% ดีกว่าหรือเท่ากับโปรโมชั่นนี้ · ระบบจะใช้สิทธิ์ Partner และไม่ใช้รหัสโปรโมชั่น
                    </div>
                  )}

                  {checkoutDiscountPercent > 0 && (
                    <div className={styles.summaryRow}>
                      <span>{partnerBenefitWins ? "ส่วนลด Exness Partner" : "ส่วนลดโปรโมชั่น"}</span>
                      <b>-${usdMoney(checkoutDiscountUsdCents)}</b>
                    </div>
                  )}

                  <div className={styles.summaryRow + " " + styles.summaryTotal}>
                    <span>ยอดชำระ</span>
                    <strong>${usdMoney(checkoutUsdCents)} USD</strong>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>ยอดชำระจริงโดยประมาณ</span>
                    <b>฿{thbMoney(checkoutEstimatedThb)} THB</b>
                  </div>

                  <p className={styles.checkoutHint}>ชำระครั้งเดียว · ไม่มีการต่ออายุอัตโนมัติ</p>
                  <div className={styles.paymentMethod}>
                    <ScenovaIcon name="wallet" size={23}/>
                    <div>
                      <b>{activeCatalog?.paymentMode === "EASYSLIP" ? "QR Payment + แนบสลิป" : "พร้อมเพย์ / QR Payment"}</b>
                      <p>{activeCatalog?.paymentMode === "EASYSLIP" ? "ระบบสร้าง QR ตามยอดจริง และตรวจสลิปอัตโนมัติผ่าน EasySlip" : "สร้าง QR แล้วสแกนด้วยแอปธนาคารของคุณ"}</p>
                    </div>
                  </div>
                  {activeCatalog?.paymentMode === "TEST" && <div className={styles.testNotice}>โหมดทดสอบ · ยังไม่ใช่การรับชำระเงินจริง</div>}

                  <button
                    type="button"
                    className={styles.confirmCheckout}
                    disabled={Boolean(busy)}
                    onClick={() => void (isLocalSystem ? checkoutLocal(checkoutPack.months) : checkoutCloud(checkoutPack.months))}
                  >
                    {busy ? "กำลังสร้างรายการ…" : "สร้างรายการชำระเงิน"} <span aria-hidden="true">→</span>
                  </button>
                  <button type="button" className={styles.cancelCheckout} disabled={Boolean(busy)} onClick={() => void closeCheckoutDialog()}>
                    ยกเลิก
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.checkoutPaymentStage}>
                <PaymentCard
                  type={isLocalSystem ? "LOCAL" : "CLOUD"}
                  order={checkoutOrder}
                  busy={Boolean(busy)}
                  paymentMode={activeCatalog?.paymentMode || "UNCONFIGURED"}
                  paymentAccounts={activeCatalog?.paymentAccounts || []}
                  inline
                  onRefresh={() => void refreshOrder(isLocalSystem ? "local" : "cloud", checkoutOrder.id)}
                  onVerifySlip={async file => {
                    const result = await verifySlip(isLocalSystem ? "local" : "cloud", checkoutOrder.id, file);
                    if (result?.status === "PAID") {
                      setCheckoutOrderId("");
                      setCheckoutPack(null);
                      checkoutDialog.current?.close();
                    }
                  }}
                  onCancel={async () => {
                    const cancelled = await cancelSlipPayment(isLocalSystem ? "local" : "cloud", checkoutOrder.id);
                    if (cancelled) {
                      setCheckoutOrderId("");
                      checkoutDialog.current?.close();
                    }
                  }}
                />
              </div>
            )}
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
  salesPaused,
  busy,
  pending,
  capacityAvailable = true,
  renewal = false,
  onBuy
}:{
  system:"LOCAL"|"CLOUD";
  pack:PackageItem;
  checkoutEnabled:boolean;
  paymentMode:string;
  salesPaused:boolean;
  busy:boolean;
  pending:boolean;
  capacityAvailable?:boolean;
  renewal?:boolean;
  onBuy:()=>void;
}) {
  const available =
    pack.enabled &&
    pack.price_usd_cents > 0 &&
    checkoutEnabled &&
    capacityAvailable &&
    !pending;

  const featured = pack.months === 3;
  const label =
    !pack.enabled || pack.price_usd_cents <= 0
      ? "ยังไม่เปิดขาย"
      : salesPaused
        ? "ปิดรับการขายชั่วคราว"
        : !checkoutEnabled || paymentMode === "UNCONFIGURED"
          ? "ระบบชำระเงินยังไม่เปิด"
        : !capacityAvailable
          ? "VPS เต็มชั่วคราว"
          : pending
            ? "มีรายการรอชำระ"
            : system === "CLOUD" && renewal
              ? "ต่ออายุแพ็กเกจหลัก"
              : "เลือกแพ็กเกจ";

  const features = system === "LOCAL"
    ? [
        "Local สำหรับ 1 บัญชี MT5",
        "ใช้ EA บนคอมพิวเตอร์ของคุณ",
        "ควบคุมสิทธิ์ผ่าน SCENOVA",
        "ต่ออายุรักษาเวลาที่เหลือ"
      ]
    : [
        "แพ็กเกจหลัก Slot #1 สำหรับ 1 บัญชี MT5",
        "เป็นสิทธิ์หลักสำหรับ VPS Slot เสริมทั้งหมด",
        "ต่ออายุจากเวลาคงเหลือเดิม",
        "ไม่ยืดวันหมดอายุของ Slot เสริม"
      ];

  return (
    <article className={`${legacy.package} ${styles.planCard} ${featured ? styles.planFeatured : ""}`}>
      {featured && <span className={styles.recommended}>แนะนำ</span>}
      <span className={styles.planType}><ScenovaIcon name={system === "LOCAL" ? "account" : "cloud"} size={19}/>{system === "LOCAL" ? "LOCAL MT5" : "CLOUD MT5"}</span>
      <h3>{packageDisplayLabel(pack.months)}</h3>
      <div className={`${legacy.price} ${styles.planPrice}`}>
        {pack.price_usd_cents > 0 ? `$${usdMoney(pack.price_usd_cents)} USD` : "รอประกาศราคา"}
        <small>
          {pack.price_usd_cents > 0
            ? `เฉลี่ย $${usdMoney(Math.round(pack.price_usd_cents / pack.months))} USD / เดือน`
            : "ราคาจะแสดงเมื่อพร้อมเปิดขาย"}
        </small>
      </div>
      <div className={`${legacy.features} ${styles.planFeatures}`}>
        {features.map(feature => <span key={feature}>{feature}</span>)}
      </div>
      <button
        type="button"
        className={`${legacy.button} ${featured ? legacy.primary : ""}`}
        disabled={busy || !available}
        onClick={onBuy}
      >
        {busy ? "กำลังดำเนินการ…" : label}<span aria-hidden="true">↗</span>
      </button>
      <small className={legacy.muted}>ชำระครั้งเดียว ไม่ตัดเงินต่ออายุอัตโนมัติ</small>
    </article>
  );
}

function PaymentCard({
  type,
  order,
  busy,
  paymentMode,
  paymentAccounts,
  inline = false,
  onRefresh,
  onVerifySlip,
  onCancel
}:{
  type:"LOCAL"|"CLOUD";
  order:Order;
  busy:boolean;
  paymentMode:string;
  paymentAccounts:PaymentAccount[];
  inline?:boolean;
  onRefresh:()=>void;
  onVerifySlip:(file:File)=>void|Promise<void>;
  onCancel:()=>void|Promise<void>;
}) {
  const [slip, setSlip] = useState<File | null>(null);
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (!slip) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(slip);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [slip]);

  const easySlip = paymentMode === "EASYSLIP";
  const account = paymentAccounts[0] || null;
  const qrSrc = String(order.qr_url || "");
  const hasQr = order.status === "PENDING" && (
    /^https:\/\//.test(qrSrc) ||
    /^data:image\/(?:png|jpeg|webp);base64,/i.test(qrSrc)
  );
  const recipientName = String(account?.nameTh || account?.nameEn || "").trim();
  const recipientBank = String(account?.bankName || account?.bankShortCode || "").trim();
  const recipientNumber = maskedBankNumber(account?.bankNumber);

  async function downloadQr() {
    if(!hasQr || !qrSrc) return;
    const filename="SCENOVA-"+type+"-"+order.months+"M-"+order.id.slice(0,8)+"-QR.png";
    const save=(href:string)=>{
      const link=document.createElement("a");
      link.href=href;
      link.download=filename;
      link.rel="noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    };
    if(qrSrc.startsWith("data:image/")) {
      save(qrSrc);
      return;
    }
    try {
      const response=await fetch(qrSrc,{cache:"no-store"});
      if(!response.ok) throw new Error("QR download failed");
      const blob=await response.blob();
      const objectUrl=URL.createObjectURL(blob);
      save(objectUrl);
      window.setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
    } catch {
      window.open(qrSrc,"_blank","noopener,noreferrer");
    }
  }

  return (
    <article className={styles.paymentCard + " " + (easySlip ? styles.paymentCardEasySlip : "") + " " + (inline ? styles.paymentCardInline : "")}>
      {hasQr ? (
        <div className={styles.paymentQrWrap}>
          <div className={styles.paymentQr}>
            <img
              src={qrSrc}
              alt={"QR ชำระเงิน " + type + " " + order.months + " เดือน"}
              referrerPolicy="no-referrer"
            />
          </div>
          <span>สแกนด้วย Mobile Banking</span>
          <b>฿{thbMoney(order.amount)} THB</b>
          {easySlip && account ? (
            <div className={styles.qrRecipient}>
              <small>ชื่อผู้รับที่ต้องตรวจสอบ</small>
              <strong>{recipientName || "SCENOVA"}</strong>
              <span>{recipientBank || "บัญชีที่ยืนยันกับ EasySlip"}{recipientNumber ? " · "+recipientNumber : ""}</span>
            </div>
          ) : null}
          <button type="button" className={styles.downloadQrButton} onClick={()=>void downloadQr()}>
            <ScenovaIcon name="download" size={15}/>
            <span>ดาวน์โหลด QR</span>
          </button>
        </div>
      ) : easySlip ? (
        <div className={styles.bankTransferCard}>
          <span className={styles.bankTransferIcon}><ScenovaIcon name="wallet" size={30}/></span>
          <small>QR ยังไม่พร้อม · ใช้บัญชีรับเงินสำรอง</small>
          {account ? (
            <>
              <b>{account.nameTh || account.nameEn || "SCENOVA"}</b>
              <strong>{account.bankNumber}</strong>
              <span>{account.bankShortCode || "BANK"} · {account.bankName || "Bank code " + account.bankCode}</span>
            </>
          ) : (
            <>
              <b>ยังไม่พบบัญชีรับเงิน</b>
              <span>ตรวจสอบบัญชีที่ผูกไว้ใน EasySlip</span>
            </>
          )}
        </div>
      ) : (
        <div className={styles.paymentQr}>
          {hasQr ? (
            <img src={qrSrc} alt={"QR PromptPay " + type + " " + order.months + " เดือน"} referrerPolicy="no-referrer"/>
          ) : (
            <div className={styles.qrPlaceholder}><ScenovaIcon name="wallet" size={28}/></div>
          )}
        </div>
      )}

      <div className={styles.paymentInfo}>
        <span className={styles.eyebrow}>{type} / {order.id.slice(0,8)}</span>
        <h3>{packageDisplayLabel(order.months)} · {Number(order.final_price_usd_cents || 0) > 0 ? `${usdMoney(Number(order.final_price_usd_cents || 0))} USD` : `฿${thbMoney(order.amount)} THB`}</h3>
        {Number(order.discount_amount || 0) > 0 && (
          <div className={styles.promoApplied}>
            <span>{order.promotion_code}</span>
            <b>ลด {Number(order.list_price_usd_cents || 0) > 0 ? `$${usdMoney(Math.max(0,Number(order.list_price_usd_cents || 0)-Number(order.final_price_usd_cents || 0)))} USD` : `฿${thbMoney(Number(order.discount_amount || 0))}`}</b>
          </div>
        )}

        {easySlip ? (
          <>
            <p>สแกน QR ตามยอดจริง <b>฿{thbMoney(order.amount)} THB</b> แล้วแนบสลิปด้านล่าง ระบบจะตรวจยอด บัญชีผู้รับ และสลิปซ้ำก่อนเปิดสิทธิ์</p>
            {account ? (
              <div className={styles.recipientCheck}>
                <span>ตรวจสอบก่อนกดยืนยันโอน</span>
                <b>{recipientName || "SCENOVA"}</b>
                <small>{recipientBank || "บัญชีที่ยืนยันกับ EasySlip"}{recipientNumber ? " · "+recipientNumber : ""}</small>
                <p>ชื่อผู้รับในแอปธนาคารต้องตรงกับชื่อนี้ หากชื่อไม่ตรง กรุณาอย่าโอนเงิน</p>
              </div>
            ) : null}
            <small>รายการสร้างเมื่อ: {date(order.created_at)}</small>
            <label className={styles.slipUpload}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                disabled={busy}
                onChange={event => setSlip(event.target.files?.[0] || null)}
              />
              <span>{slip ? slip.name : "แนบรูปสลิป"}</span>
              <small>JPG / PNG / GIF / WebP · สูงสุด 4 MB</small>
            </label>
            {preview && (
              <div className={styles.slipPreview}>
                <img src={preview} alt="ตัวอย่างสลิปที่เลือก"/>
              </div>
            )}
            <div className={styles.slipActions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => slip && void onVerifySlip(slip)}
                disabled={busy || !slip || !account}
              >
                {busy ? "กำลังดำเนินการ…" : "ตรวจสลิปและเปิดสิทธิ์"}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void onCancel()}
                disabled={busy}
              >
                ยกเลิกรายการ
              </button>
            </div>
            {!account && <div className={styles.paymentWarning}>ยังไม่พบบัญชีรับเงินที่ผูกกับ EasySlip จึงยังตรวจสลิปไม่ได้</div>}
          </>
        ) : (
          <>
            <p>
              {order.status === "REVIEW"
                ? "กำลังตรวจสอบรายการกับ Payment Gateway"
                : "สแกน QR ผ่านแอปธนาคาร ระบบจะเปิดสิทธิ์อัตโนมัติหลังยืนยันยอด"}
            </p>
            <small>QR หมดอายุ: {date(order.expires_at)}</small>
            <button type="button" className={styles.secondaryButton} onClick={onRefresh} disabled={busy}>
              ตรวจสอบการชำระเงิน
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function OrderHistory({title,orders}:{title:string;orders:Order[]}) {
  const paidOrders = orders.filter(order => String(order.status || "").toUpperCase() === "PAID");
  return (
    <div className={styles.historyCard}>
      <h3>{title}</h3>
      {paidOrders.length ? (
        <div className={styles.orderList}>
          {paidOrders.slice(0,5).map(order => {
            const purchaseType = String(order.purchase_type || "PACKAGE").toUpperCase();
            const itemName = purchaseType === "ADDON"
              ? "VPS Slot เสริม"
              : purchaseType === "RENEW"
                ? "ต่ออายุ VPS Slot"
                : title;
            return (
              <div className={styles.orderRow} key={order.id}>
                <div>
                  <b>{itemName} · {packageDisplayLabel(order.months)}</b>
                  <span>{date(order.created_at)}</span>
                </div>
                <strong>{Number(order.final_price_usd_cents || 0) > 0 ? `${usdMoney(Number(order.final_price_usd_cents || 0))}` : `฿${thbMoney(order.amount)}`}</strong>
                <em className={styles.orderPaid}>PAID</em>
              </div>
            );
          })}
        </div>
      ) : (
        <p className={styles.empty}>ยังไม่มีรายการ</p>
      )}
    </div>
  );
}
