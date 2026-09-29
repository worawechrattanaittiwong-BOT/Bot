"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import {
  CustomerMobileNav,
  CustomerSidebar,
  OwnerMobileNav,
  OwnerSidebar
} from "../../components/OwnerSidebar";
import { ScenovaIcon } from "../../components/ScenovaIcon";
import styles from "./account.module.css";

type AccountData = {
  user: {
    id: string;
    userCode: string;
    email: string;
    role: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    emailVerified: boolean;
    emailVerifiedAt: string | null;
    lastSignInAt: string | null;
    phone: {
      countryCode: string;
      masked: string;
      verified: boolean;
      verifiedAt: string | null;
    } | null;
  };
  security: {
    twoFactorEnabled: boolean;
    twoFactorEnabledAt: string | null;
    passwordChangedAt: string | null;
    recoveryCodesRemaining: number;
  };
  phoneVerification: {
    smsAvailable: boolean;
    resendAfterSeconds: number;
    codeExpiresInMinutes: number;
  };
  access: {
    subscription: any;
    trial: any;
    partner: any;
  };
  session: {
    current: boolean;
    ip: string;
    userAgent: string;
  };
};

type TwoFactorSetup = {
  secret: string;
  otpauthUri: string;
  digits: number;
  period: number;
  resumed?: boolean;
};

type PanelKey = "phone" | "password" | "twoFactor" | "session";

const PHONE_COUNTRIES = [
  ["TH","ไทย","+66"], ["US","สหรัฐฯ / แคนาดา","+1"], ["GB","สหราชอาณาจักร","+44"],
  ["AU","ออสเตรเลีย","+61"], ["NZ","นิวซีแลนด์","+64"], ["SG","สิงคโปร์","+65"],
  ["MY","มาเลเซีย","+60"], ["ID","อินโดนีเซีย","+62"], ["PH","ฟิลิปปินส์","+63"],
  ["VN","เวียดนาม","+84"], ["LA","ลาว","+856"], ["KH","กัมพูชา","+855"],
  ["MM","เมียนมา","+95"], ["JP","ญี่ปุ่น","+81"], ["KR","เกาหลีใต้","+82"],
  ["CN","จีน","+86"], ["HK","ฮ่องกง","+852"], ["TW","ไต้หวัน","+886"],
  ["IN","อินเดีย","+91"], ["AE","UAE","+971"], ["SA","ซาอุดีอาระเบีย","+966"],
  ["DE","เยอรมนี","+49"], ["FR","ฝรั่งเศส","+33"], ["IT","อิตาลี","+39"],
  ["ES","สเปน","+34"], ["NL","เนเธอร์แลนด์","+31"], ["BE","เบลเยียม","+32"],
  ["CH","สวิตเซอร์แลนด์","+41"], ["SE","สวีเดน","+46"], ["NO","นอร์เวย์","+47"],
  ["DK","เดนมาร์ก","+45"], ["FI","ฟินแลนด์","+358"], ["PL","โปแลนด์","+48"],
  ["PT","โปรตุเกส","+351"], ["IE","ไอร์แลนด์","+353"], ["AT","ออสเตรีย","+43"],
  ["CZ","เช็ก","+420"], ["HU","ฮังการี","+36"], ["GR","กรีซ","+30"],
  ["TR","ตุรกี","+90"], ["IL","อิสราเอล","+972"], ["QA","กาตาร์","+974"],
  ["KW","คูเวต","+965"], ["BH","บาห์เรน","+973"], ["OM","โอมาน","+968"],
  ["ZA","แอฟริกาใต้","+27"], ["BR","บราซิล","+55"], ["MX","เม็กซิโก","+52"]
] as const;

function phoneInputGuide() {
  return { placeholder: "กรอกหมายเลขโทรศัพท์" };
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function accessSummary(data: AccountData) {
  const subscription = data.access.subscription;
  if (subscription?.status === "ACTIVE") {
    return subscription.code || "สมาชิกใช้งานอยู่";
  }
  if (data.access.trial?.status) return `Trial · ${data.access.trial.status}`;
  return "ยังไม่มีสมาชิก";
}

export default function AccountPage() {
  const [data, setData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"good" | "bad" | "info">("info");
  const [open, setOpen] = useState<Record<PanelKey, boolean>>({
    phone: false,
    password: false,
    twoFactor: false,
    session: false
  });

  const [phoneCountry, setPhoneCountry] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneOtpBusy, setPhoneOtpBusy] = useState<"" | "send" | "verify">("");
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneOtpCooldown, setPhoneOtpCooldown] = useState(0);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [password2fa, setPassword2fa] = useState("");

  const [twoFactorPassword, setTwoFactorPassword] = useState("");
  const [twoFactorSetup, setTwoFactorSetup] = useState<TwoFactorSetup | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  async function load() {
    try {
      const account = await api("/auth/account");
      setData(account);
      setPhoneCountry(account.user?.phone?.countryCode || "");
    } catch (error: unknown) {
      notify("bad", error instanceof Error ? error.message : "โหลดข้อมูลบัญชีไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (phoneOtpCooldown <= 0) return;
    const id = window.setInterval(() => {
      setPhoneOtpCooldown(current => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [phoneOtpCooldown > 0]);

  const accountRole = String(data?.user.role || "").toUpperCase();
  const isOwner = accountRole === "OWNER";
  const elevated = ["OWNER", "ADMIN"].includes(accountRole);
  const partnerSummary = data?.access.partner ? {
    usedSeats: Number(data.access.partner.used_seats || 0),
    seat_limit: Number(data.access.partner.seat_limit || 0),
    status: String(data.access.partner.status || "ACTIVE")
  } : null;

  const passwordChecks = useMemo(() => ({
    length: newPassword.length >= 8,
    mixedCase: /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword),
    number: /\d/.test(newPassword),
    symbol: /[^A-Za-z0-9]/.test(newPassword)
  }), [newPassword]);

  const passwordStrength = Object.values(passwordChecks).filter(Boolean).length;
  const passwordReady =
    passwordStrength >= 3 &&
    newPassword === confirmPassword &&
    confirmPassword.length >= 8 &&
    currentPassword.length > 0 &&
    (!data?.security.twoFactorEnabled || password2fa.trim().length > 0);

  const phoneGuide = phoneInputGuide();
  const phoneSmsAvailable = data?.phoneVerification?.smsAvailable !== false;

  function notify(kind: "good" | "bad" | "info", text: string) {
    setMessageKind(kind);
    setMessage(text);
  }

  function toggle(key: PanelKey, force?: boolean) {
    setOpen(prev => ({ ...prev, [key]: force ?? !prev[key] }));
  }

  function logout() {
    localStorage.removeItem("bot_token");
    sessionStorage.removeItem("scenova_2fa_challenge");
    sessionStorage.removeItem("scenova_2fa_email");
    window.location.replace("/login");
  }

  async function savePhone() {
    if (!phoneCountry || !phoneInput.trim() || phoneBusy) return;
    setPhoneBusy(true);
    try {
      await api("/auth/account/phone", {
        method: "POST",
        body: JSON.stringify({ countryCode: phoneCountry, phone: phoneInput })
      });
      setPhoneInput("");
      setPhoneOtp("");
      setPhoneOtpSent(false);
      setPhoneOtpCooldown(0);
      toggle("phone", false);
      notify(
        "good",
        "บันทึกเบอร์มือถือแล้ว กรุณาส่งรหัสยืนยันเพื่อยืนยันหมายเลขนี้"
      );
      await load();
    } catch (error: unknown) {
      notify("bad", error instanceof Error ? error.message : "บันทึกเบอร์โทรไม่สำเร็จ");
    } finally {
      setPhoneBusy(false);
    }
  }

  async function requestPhoneOtp() {
    if (
      !data?.user.phone ||
      data.user.phone.verified ||
      phoneOtpBusy ||
      phoneOtpCooldown > 0 ||
      !phoneSmsAvailable
    ) return;
    setPhoneOtpBusy("send");
    try {
      const result = await api("/auth/account/phone/request-otp", { method: "POST" });
      setPhoneOtp("");
      setPhoneOtpSent(true);
      setPhoneOtpCooldown(Math.max(0, Number(result?.resendAfterSeconds || 60)));
      notify(
        "good",
        `ส่งรหัสยืนยันไปยัง ${result.phoneMasked || data.user.phone.masked} แล้ว กรุณากรอก OTP ภายใน ${Number(result?.expiresInMinutes || 10)} นาที`
      );
    } catch (error: unknown) {
      notify(
        "bad",
        error instanceof Error
          ? error.message
          : "ไม่สามารถส่งรหัสยืนยันได้ กรุณาลองใหม่อีกครั้ง"
      );
    } finally {
      setPhoneOtpBusy("");
    }
  }

  async function verifyPhoneOtp() {
    if (!data?.user.phone || data.user.phone.verified || phoneOtp.length !== 6 || phoneOtpBusy) return;
    setPhoneOtpBusy("verify");
    try {
      await api("/auth/account/phone/verify-otp", {
        method: "POST",
        body: JSON.stringify({ code: phoneOtp })
      });
      setPhoneOtp("");
      setPhoneOtpSent(false);
      setPhoneOtpCooldown(0);
      notify("good", "ยืนยันเบอร์มือถือเรียบร้อยแล้ว");
      await load();
    } catch (error: unknown) {
      notify(
        "bad",
        error instanceof Error
          ? error.message
          : "ไม่สามารถยืนยันรหัสได้ กรุณาตรวจสอบ OTP แล้วลองใหม่อีกครั้ง"
      );
    } finally {
      setPhoneOtpBusy("");
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (!passwordReady || busy) return;
    setBusy(true);
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword,
          newPassword,
          twoFactorCode: password2fa || undefined
        })
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPassword2fa("");
      toggle("password", false);
      notify("good", "เปลี่ยนรหัสผ่านแล้ว");
      await load();
    } catch (error: unknown) {
      notify("bad", error instanceof Error ? error.message : "เปลี่ยนรหัสผ่านไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function startTwoFactor() {
    if (!twoFactorPassword || busy) return;
    setBusy(true);
    try {
      const result = await api("/auth/2fa/setup", {
        method: "POST",
        body: JSON.stringify({ currentPassword: twoFactorPassword })
      });
      setTwoFactorSetup(result);
      setTwoFactorCode("");
      setRecoveryCodes([]);
    } catch (error: unknown) {
      notify("bad", error instanceof Error ? error.message : "ตั้งค่า 2FA ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function enableTwoFactor() {
    if (!twoFactorSetup || twoFactorCode.length !== 6 || busy) return;
    setBusy(true);
    try {
      const result = await api("/auth/2fa/enable", {
        method: "POST",
        body: JSON.stringify({ code: twoFactorCode })
      });
      setRecoveryCodes(Array.isArray(result.recoveryCodes) ? result.recoveryCodes : []);
      setTwoFactorSetup(null);
      setTwoFactorCode("");
      setTwoFactorPassword("");
      notify("good", "เปิด 2FA แล้ว");
      await load();
    } catch (error: unknown) {
      notify("bad", error instanceof Error ? error.message : "เปิด 2FA ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function disableTwoFactor(event: FormEvent) {
    event.preventDefault();
    if (!disablePassword || !disableCode || busy) return;
    setBusy(true);
    try {
      await api("/auth/2fa/disable", {
        method: "POST",
        body: JSON.stringify({ currentPassword: disablePassword, code: disableCode })
      });
      setDisablePassword("");
      setDisableCode("");
      setRecoveryCodes([]);
      notify("good", "ปิด 2FA แล้ว");
      await load();
    } catch (error: unknown) {
      notify("bad", error instanceof Error ? error.message : "ปิด 2FA ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify("good", "คัดลอกแล้ว");
    } catch {
      notify("bad", "คัดลอกไม่สำเร็จ");
    }
  }

  if (loading) {
    return <main className={styles.loadingPage}><div className={styles.loadingCard}>กำลังโหลดบัญชี...</div></main>;
  }

  if (!data) {
    return <main className={styles.loadingPage}><div className={styles.loadingCard}>{message || "ไม่พบบัญชี"}</div></main>;
  }

  const phoneLocked = !isOwner && Boolean(data.user.phone?.verified);

  return (
    <div className="app-wrap">
      {elevated
        ? <OwnerSidebar activeKey="my-account" onLogout={logout} role={data.user.role}/>
        : <CustomerSidebar activeKey="my-account" onLogout={logout} userCode={data.user.userCode} partner={partnerSummary}/>}
      <main className={`main app-main ${styles.main}`}>
        {elevated
          ? <OwnerMobileNav activeKey="my-account"/>
          : <CustomerMobileNav activeKey="my-account" partner={partnerSummary}/>}

        <div className={styles.accountShell}>
          <header className={styles.header}>
            <div className={styles.headerTitle}>
              <span className={styles.headerIcon}><ScenovaIcon name="account" size={22}/></span>
              <div>
                <div className={styles.eyebrow}>SCENOVA ACCOUNT</div>
                <h1>My Account</h1>
                              </div>
            </div>
            <span className={styles.accountStatus}><i/> {data.user.status}</span>
          </header>

          {message && (
            <div className={`${styles.message} ${messageKind === "good" ? styles.good : messageKind === "bad" ? styles.bad : ""}`} role="status">
              {message}
            </div>
          )}

          <section className={styles.summaryBar}>
            <Summary label="User ID" value={data.user.userCode} mono/>
            <Summary label="Email" value={data.user.emailVerified ? "Verified" : "Pending"} good={data.user.emailVerified}/>
            <Summary label="Mobile" value={data.user.phone ? data.user.phone.masked : "Not linked"} good={Boolean(data.user.phone?.verified)}/>
            <Summary label="2FA" value={data.security.twoFactorEnabled ? "Enabled" : "Off"} good={data.security.twoFactorEnabled}/>
            <Summary label="Access" value={accessSummary(data)}/>
          </section>

          <div className={styles.sectionStack}>
            <InfoSection icon="account" title="Account Overview">
              <div className={styles.detailGrid}>
                <Detail label="Email Address" value={data.user.email}/>
                <Detail label="Account Role" value={data.user.role}/>
                <Detail label="Account Status" value={data.user.status} good/>
                <Detail label="Mobile Number" value={data.user.phone ? data.user.phone.masked : "ยังไม่ได้ผูกเบอร์"}/>
                <Detail label="Member Since" value={formatDate(data.user.createdAt)}/>
                <Detail label="Last Sign In" value={formatDate(data.user.lastSignInAt)}/>
                <Detail label="SCENOVA Account ID" value={data.user.id} mono/>
              </div>
            </InfoSection>

            <section id="phone-settings" className={styles.sectionCard}>
              <SectionHeader
                icon="account"
                title="เบอร์มือถือ"
                subtitle={data.user.phone ? data.user.phone.masked : "ยังไม่ได้ผูกเบอร์มือถือ"}
                badge={data.user.phone ? (data.user.phone.verified ? "VERIFIED" : "SAVED") : "NOT LINKED"}
                good={Boolean(data.user.phone?.verified)}
                action={!phoneLocked ? (data.user.phone ? "แก้ไขเบอร์" : "ผูกเบอร์มือถือ") : undefined}
                expanded={open.phone}
                onAction={() => toggle("phone")}
              />
              {open.phone && !phoneLocked && (
                <div className={styles.commandBody}>
                  <div className={styles.phoneForm}>
                    <label>
                      <span>ประเทศ</span>
                      <select
                        name="scenova_country_manual"
                        autoComplete="off"
                        value={phoneCountry}
                        onChange={e => setPhoneCountry(e.target.value)}
                        disabled={phoneBusy}
                      >
                        <option value="" disabled>เลือกรหัสประเทศ</option>
                        {PHONE_COUNTRIES.map(([iso,name,code]) => (
                          <option key={iso} value={code}>{name} {code}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>หมายเลขโทรศัพท์</span>
                      <input
                        type="tel"
                        inputMode="tel"
                        name="scenova_phone_manual"
                        autoComplete="off"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        aria-label="เบอร์โทร"
                        placeholder={phoneGuide.placeholder}
                        value={phoneInput}
                        onChange={e => setPhoneInput(e.target.value.slice(0,24))}
                        disabled={phoneBusy}
                      />
                    </label>
                    <div className={styles.actionLine}>
                      <button type="button" className={styles.secondaryButton} onClick={() => toggle("phone", false)} disabled={phoneBusy}>ยกเลิก</button>
                      <button type="button" className={styles.primaryButton} onClick={savePhone} disabled={!phoneCountry || !phoneInput.trim() || phoneBusy}>
                        {phoneBusy ? "กำลังบันทึก..." : "บันทึกเบอร์มือถือ"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {data.user.phone && !data.user.phone.verified && !open.phone && (
                <div className={styles.commandBody}>
                  <div className={styles.otpRow}>
                    <div>
                      <span>ยืนยันเบอร์มือถือ</span>
                      <strong>{data.user.phone.masked}</strong>
                    </div>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={requestPhoneOtp}
                      disabled={Boolean(phoneOtpBusy) || phoneOtpCooldown > 0 || !phoneSmsAvailable}
                    >
                      {phoneOtpBusy === "send"
                        ? "กำลังส่งรหัส..."
                        : phoneOtpCooldown > 0
                          ? `ส่งรหัสใหม่ได้ใน ${phoneOtpCooldown} วินาที`
                          : phoneOtpSent
                            ? "ส่งรหัสใหม่"
                            : "ส่งรหัสยืนยัน"}
                    </button>
                    <div>
                      <span>รหัส OTP 6 หลัก</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        name="scenova_phone_otp"
                        maxLength={6}
                        value={phoneOtp}
                        onChange={event => setPhoneOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                        disabled={Boolean(phoneOtpBusy)}
                        aria-label="รหัส OTP 6 หลัก"
                      />
                    </div>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={verifyPhoneOtp}
                      disabled={Boolean(phoneOtpBusy) || phoneOtp.length !== 6}
                    >
                      {phoneOtpBusy === "verify" ? "กำลังยืนยัน..." : "ยืนยันเบอร์มือถือ"}
                    </button>
                  </div>
                </div>
              )}
              {!phoneSmsAvailable && data.user.phone && !data.user.phone.verified && !open.phone && (
                <div className={styles.lockNote}>บริการยืนยันเบอร์ผ่าน SMS ไม่พร้อมใช้งานในขณะนี้ กรุณาลองใหม่ภายหลัง</div>
              )}
            </section>

            <section className={styles.sectionCard}>
              <SectionHeader
                icon="wallet"
                title="Trial & Packages"
                action="เปิดหน้า Packages"
                onAction={() => window.location.assign("/packages")}
              />
            </section>

            <InfoSection icon="shield" title="Security Status">
              <div className={styles.statusGrid}>
                <StatusItem label="Email Verification" value={data.user.emailVerified ? "Verified" : "Pending"} good={data.user.emailVerified}/>
                <StatusItem label="Mobile Number" value={data.user.phone ? (data.user.phone.verified ? "Verified" : "รอยืนยัน OTP") : "Not linked"} good={Boolean(data.user.phone?.verified)}/>
                <StatusItem label="Two-Factor Authentication" value={data.security.twoFactorEnabled ? "On" : "Off"} good={data.security.twoFactorEnabled}/>
                <StatusItem label="Password Last Changed" value={formatDate(data.security.passwordChangedAt)}/>
                <StatusItem label="Current Session" value={data.session.current ? "Active" : "Unknown"} good={data.session.current}/>
              </div>
            </InfoSection>

            <section className={styles.sectionCard}>
              <SectionHeader
                icon="shield"
                title="Password"
                subtitle={data.security.passwordChangedAt ? `เปลี่ยนล่าสุด ${formatDate(data.security.passwordChangedAt)}` : "ตั้งค่ารหัสผ่านบัญชี"}
                action={open.password ? "ปิด" : "เปลี่ยนรหัสผ่าน"}
                expanded={open.password}
                onAction={() => toggle("password")}
              />
              {open.password && (
                <form className={styles.commandBody} onSubmit={changePassword} autoComplete="off">
                  <div className={styles.passwordGrid}>
                    <label>
                      <span>รหัสผ่านปัจจุบัน</span>
                      <input type="password" name="scenova_current_password" autoComplete="off" data-lpignore="true" data-1p-ignore="true" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} disabled={busy}/>
                    </label>
                    <label>
                      <span>รหัสผ่านใหม่</span>
                      <input type="password" name="scenova_new_password" autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} disabled={busy}/>
                    </label>
                    <label>
                      <span>ยืนยันรหัสผ่านใหม่</span>
                      <input type="password" name="scenova_confirm_password" autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} disabled={busy}/>
                    </label>
                    {data.security.twoFactorEnabled && (
                      <label>
                        <span>2FA / Recovery Code</span>
                        <input type="text" name="scenova_password_2fa" autoComplete="one-time-code" value={password2fa} onChange={e=>setPassword2fa(e.target.value)} disabled={busy}/>
                      </label>
                    )}
                  </div>
                  <div className={styles.commandFooter}>
                    <div className={styles.passwordMeter}>{[1,2,3,4].map(level=><span key={level} className={passwordStrength>=level ? styles.meterOn : ""}/>)}</div>
                    <button type="submit" className={styles.primaryButton} disabled={!passwordReady || busy}>บันทึกรหัสผ่าน</button>
                  </div>
                </form>
              )}
            </section>

            <section className={styles.sectionCard}>
              <SectionHeader
                icon="shield"
                title="Two-Factor Authentication"
                subtitle={data.security.twoFactorEnabled ? `${data.security.recoveryCodesRemaining} recovery codes remaining` : "Authenticator App"}
                badge={data.security.twoFactorEnabled ? "ENABLED" : "OFF"}
                good={data.security.twoFactorEnabled}
                action={open.twoFactor ? "ปิด" : "จัดการ 2FA"}
                expanded={open.twoFactor}
                onAction={() => toggle("twoFactor")}
              />
              {open.twoFactor && (
                <div className={styles.commandBody}>
                  {!data.security.twoFactorEnabled && !twoFactorSetup && (
                    <div className={styles.twoFactorRow}>
                      <label>
                        <span>รหัสผ่านปัจจุบัน</span>
                        <input type="password" name="scenova_2fa_setup_password" autoComplete="off" data-lpignore="true" data-1p-ignore="true" value={twoFactorPassword} onChange={e=>setTwoFactorPassword(e.target.value)} disabled={busy}/>
                      </label>
                      <button type="button" className={styles.primaryButton} onClick={startTwoFactor} disabled={!twoFactorPassword || busy}>เริ่มตั้งค่า 2FA</button>
                    </div>
                  )}

                  {!data.security.twoFactorEnabled && twoFactorSetup && (
                    <div className={styles.setupBox}>
                      <div className={styles.lockNote}>
                        {twoFactorSetup.resumed
                          ? "ดำเนินการตั้งค่า 2FA ต่อจากเดิม"
                          : "เพิ่ม SCENOVA ในแอป Authenticator แล้วกรอกรหัส 6 หลัก"}
                      </div>
                      <div className={styles.secretLine}>
                        <code>{twoFactorSetup.secret}</code>
                        <button type="button" className={styles.secondaryButton} onClick={()=>copyText(twoFactorSetup.secret)}>คัดลอก Key</button>
                        <a className={styles.secondaryButton} href={twoFactorSetup.otpauthUri}>เปิด Authenticator</a>
                      </div>
                      <div className={styles.twoFactorRow}>
                        <label>
                          <span>รหัส 6 หลัก</span>
                          <input type="text" inputMode="numeric" name="scenova_2fa_verify_code" autoComplete="one-time-code" maxLength={6} value={twoFactorCode} onChange={e=>setTwoFactorCode(e.target.value.replace(/\D/g,"").slice(0,6))} disabled={busy}/>
                        </label>
                        <button type="button" className={styles.primaryButton} onClick={enableTwoFactor} disabled={twoFactorCode.length !== 6 || busy}>เปิด 2FA</button>
                      </div>
                    </div>
                  )}

                  {data.security.twoFactorEnabled && (
                    <form className={styles.disableGrid} onSubmit={disableTwoFactor} autoComplete="off">
                      <label>
                        <span>รหัสผ่านปัจจุบัน</span>
                        <input type="password" name="scenova_2fa_disable_password" autoComplete="off" data-lpignore="true" data-1p-ignore="true" value={disablePassword} onChange={e=>setDisablePassword(e.target.value)} disabled={busy}/>
                      </label>
                      <label>
                        <span>2FA / Recovery Code</span>
                        <input type="text" name="scenova_2fa_disable_code" autoComplete="one-time-code" value={disableCode} onChange={e=>setDisableCode(e.target.value)} disabled={busy}/>
                      </label>
                      <button type="submit" className={styles.secondaryButton} disabled={!disablePassword || !disableCode || busy}>ปิด 2FA</button>
                    </form>
                  )}

                  {recoveryCodes.length > 0 && (
                    <div className={styles.recoveryBox}>
                      <div className={styles.recoveryHead}>
                        <b>Recovery Codes</b>
                        <button type="button" className={styles.textButton} onClick={()=>copyText(recoveryCodes.join("\n"))}>คัดลอกทั้งหมด</button>
                      </div>
                      <div className={styles.recoveryGrid}>{recoveryCodes.map(code=><code key={code}>{code}</code>)}</div>
                    </div>
                  )}
                </div>
              )}
            </section>

            <InfoSection icon="wallet" title="Access Details" subtitle="สิทธิ์สมาชิก Trial และ Partner">
              <div className={styles.detailGrid}>
                <Detail label="Subscription" value={data.access.subscription?.status || "—"}/>
                <Detail label="Plan" value={data.access.subscription?.code || "—"}/>
                <Detail label="Mode" value={data.access.subscription?.mode || "—"}/>
                <Detail label="Subscription Expires" value={formatDate(data.access.subscription?.expires_at)}/>
                <Detail label="Trial" value={data.access.trial?.status || "—"}/>
                <Detail label="Partner Status" value={data.access.partner?.status || "—"}/>
              </div>
            </InfoSection>

            <section className={styles.sectionCard}>
              <SectionHeader
                icon="status"
                title="Sessions & Devices"
                subtitle="เซสชันที่กำลังใช้งาน"
                badge={data.session.current ? "ACTIVE" : "UNKNOWN"}
                good={data.session.current}
                action={open.session ? "ซ่อนรายละเอียด" : "ดูรายละเอียด"}
                expanded={open.session}
                onAction={() => toggle("session")}
              />
              {open.session && (
                <div className={styles.commandBody}>
                  <div className={styles.sessionCard}>
                    <span className={styles.sessionIcon}><ScenovaIcon name="account" size={18}/></span>
                    <div>
                      <b>Current Session</b>
                      <span>{data.session.userAgent || "—"}</span>
                      <small>Network: {data.session.ip || "—"}</small>
                    </div>
                    <em>{data.session.current ? "ACTIVE" : "UNKNOWN"}</em>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function Summary({label,value,good=false,mono=false}:{label:string;value:string;good?:boolean;mono?:boolean}) {
  return (
    <div className={styles.summaryItem}>
      <span>{label}</span>
      <b className={`${good ? styles.goodText : ""} ${mono ? styles.mono : ""}`}>{value}</b>
    </div>
  );
}

function InfoSection({icon,title,subtitle,children}:{icon:string;title:string;subtitle?:string;children:React.ReactNode}) {
  return (
    <section className={styles.sectionCard}>
      <SectionHeader icon={icon} title={title} subtitle={subtitle}/>
      <div className={styles.infoBody}>{children}</div>
    </section>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
  badge,
  good=false,
  action,
  expanded=false,
  onAction
}:{
  icon:string;
  title:string;
  subtitle?:string;
  badge?:string;
  good?:boolean;
  action?:string;
  expanded?:boolean;
  onAction?:()=>void;
}) {
  return (
    <div className={styles.sectionHeader}>
      <div className={styles.sectionTitle}>
        <span className={styles.icon}><ScenovaIcon name={icon} size={18}/></span>
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      <div className={styles.sectionControls}>
        {badge && <span className={`${styles.badge} ${good ? styles.badgeGood : ""}`}>{badge}</span>}
        {action && onAction && (
          <button type="button" className={styles.disclosureButton} onClick={onAction} aria-expanded={expanded}>
            {action}<span>{expanded ? "−" : "+"}</span>
          </button>
        )}
      </div>
    </div>
  );
}

function Detail({label,value,good=false,mono=false}:{label:string;value:string;good?:boolean;mono?:boolean}) {
  return (
    <div className={styles.detailItem}>
      <span>{label}</span>
      <b className={`${good ? styles.goodText : ""} ${mono ? styles.monoSmall : ""}`}>{value}</b>
    </div>
  );
}

function StatusItem({label,value,good=false}:{label:string;value:string;good?:boolean}) {
  return (
    <div className={styles.statusItem}>
      <span>{label}</span>
      <b className={good ? styles.goodText : ""}>{value}</b>
    </div>
  );
}
