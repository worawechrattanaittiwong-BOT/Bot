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

type TrialAccessData = {
  smsConfigured: boolean;
  trialDays: number;
  eligibility: {
    allowed: boolean;
    reason: string;
    message: string;
  };
  phone: {
    countryCode: string;
    masked: string;
    verified: boolean;
    verifiedAt: string | null;
  } | null;
  authorization: any;
  trial: any;
  latestCode: any;
};

const PHONE_COUNTRIES = [
  ["TH", "ไทย", "+66"], ["US", "สหรัฐฯ/แคนาดา", "+1"], ["GB", "สหราชอาณาจักร", "+44"],
  ["AU", "ออสเตรเลีย", "+61"], ["SG", "สิงคโปร์", "+65"], ["MY", "มาเลเซีย", "+60"],
  ["ID", "อินโดนีเซีย", "+62"], ["PH", "ฟิลิปปินส์", "+63"], ["VN", "เวียดนาม", "+84"],
  ["JP", "ญี่ปุ่น", "+81"], ["KR", "เกาหลีใต้", "+82"], ["CN", "จีน", "+86"],
  ["HK", "ฮ่องกง", "+852"], ["TW", "ไต้หวัน", "+886"], ["IN", "อินเดีย", "+91"],
  ["AE", "UAE", "+971"], ["SA", "ซาอุดีอาระเบีย", "+966"], ["DE", "เยอรมนี", "+49"],
  ["FR", "ฝรั่งเศส", "+33"], ["IT", "อิตาลี", "+39"]
] as const;

type TwoFactorSetup = {
  secret: string;
  otpauthUri: string;
  digits: number;
  period: number;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
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
    return `${subscription.code || "Subscription"} · ${subscription.mode || "Access"}`;
  }
  if (data.access.trial?.status) return `Trial · ${data.access.trial.status}`;
  return "No active membership";
}

export default function AccountPage() {
  const [data, setData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"good" | "bad" | "info">("info");
  const [trialAccess, setTrialAccess] = useState<TrialAccessData | null>(null);
  const [phoneCountry, setPhoneCountry] = useState("+66");
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneEditing, setPhoneEditing] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [trialCode, setTrialCode] = useState("");
  const [trialBusy, setTrialBusy] = useState(false);

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
      if (account.user?.phone?.countryCode) setPhoneCountry(account.user.phone.countryCode);
      if (!account.user?.phone) setPhoneEditing(true);
      try {
        setTrialAccess(await api("/trial-access/status"));
      } catch {
        setTrialAccess(null);
      }
    } catch (error: unknown) {
      setMessageKind("bad");
      setMessage(error instanceof Error ? error.message : "Unable to load account details");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const elevated = ["OWNER", "ADMIN"].includes(String(data?.user.role || "").toUpperCase());
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

  function logout() {
    localStorage.removeItem("bot_token");
    sessionStorage.removeItem("scenova_2fa_challenge");
    sessionStorage.removeItem("scenova_2fa_email");
    window.location.replace("/login");
  }

  function notify(kind: "good" | "bad" | "info", text: string) {
    setMessageKind(kind);
    setMessage(text);
  }

  function goToAccountSection(id: "phone-settings" | "trial-access") {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function savePhone() {
    if (!phoneInput.trim() || phoneBusy) return;
    setPhoneBusy(true);
    try {
      await api("/auth/account/phone", {
        method: "POST",
        body: JSON.stringify({ countryCode: phoneCountry, phone: phoneInput })
      });
      setPhoneInput("");
      setPhoneEditing(false);
      notify("good", "ผูกเบอร์โทรกับบัญชีแล้ว");
      await load();
    } catch (error: unknown) {
      notify("bad", error instanceof Error ? error.message : "บันทึกเบอร์โทรไม่สำเร็จ");
    } finally {
      setPhoneBusy(false);
    }
  }

  async function requestTrialCode() {
    if (trialBusy || !trialAccess?.smsConfigured || !trialAccess?.phone) return;
    setTrialBusy(true);
    try {
      const result = await api("/trial-access/request-code", { method: "POST" });
      notify("good", "ส่ง OTP ไปที่ " + result.phoneMasked + " แล้ว · รหัสมีอายุ 10 นาที");
      setTrialCode("");
      const status = await api("/trial-access/status");
      setTrialAccess(status);
    } catch (error: unknown) {
      notify("bad", error instanceof Error ? error.message : "ส่ง OTP ไม่สำเร็จ");
    } finally {
      setTrialBusy(false);
    }
  }

  async function redeemTrialCode() {
    if (!trialAccess?.phone || trialCode.length !== 6 || trialBusy) return;
    setTrialBusy(true);
    try {
      const result = await api("/trial-access/redeem", {
        method: "POST",
        body: JSON.stringify({ code: trialCode })
      });
      notify("good", result.message || "เปิดสิทธิ์ทดลองสำเร็จ");
      setTrialCode("");
      await load();
    } catch (error: unknown) {
      notify("bad", error instanceof Error ? error.message : "เปิดสิทธิ์ทดลองไม่สำเร็จ");
    } finally {
      setTrialBusy(false);
    }
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify("good", label);
    } catch {
      notify("bad", "Copy failed. Please select and copy the value manually.");
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (!passwordReady || busy) return;
    setBusy(true);
    setMessage("");
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
      notify("good", "Password changed successfully.");
      await load();
    } catch (error: unknown) {
      notify("bad", error instanceof Error ? error.message : "Unable to change password");
    } finally {
      setBusy(false);
    }
  }

  async function startTwoFactor() {
    if (!twoFactorPassword || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api("/auth/2fa/setup", {
        method: "POST",
        body: JSON.stringify({ currentPassword: twoFactorPassword })
      });
      setTwoFactorSetup(result);
      setTwoFactorCode("");
      setRecoveryCodes([]);
      notify("info", "Authenticator setup created. Add the key to your app, then enter its current 6-digit code.");
    } catch (error: unknown) {
      notify("bad", error instanceof Error ? error.message : "Unable to start two-factor setup");
    } finally {
      setBusy(false);
    }
  }

  async function enableTwoFactor() {
    if (!twoFactorSetup || twoFactorCode.length !== 6 || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api("/auth/2fa/enable", {
        method: "POST",
        body: JSON.stringify({ code: twoFactorCode })
      });
      setRecoveryCodes(Array.isArray(result.recoveryCodes) ? result.recoveryCodes : []);
      setTwoFactorSetup(null);
      setTwoFactorCode("");
      setTwoFactorPassword("");
      notify("good", "Two-factor authentication is enabled. Save the recovery codes before leaving this page.");
      await load();
    } catch (error: unknown) {
      notify("bad", error instanceof Error ? error.message : "Unable to enable two-factor authentication");
    } finally {
      setBusy(false);
    }
  }

  async function disableTwoFactor(event: FormEvent) {
    event.preventDefault();
    if (!disablePassword || !disableCode || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await api("/auth/2fa/disable", {
        method: "POST",
        body: JSON.stringify({ currentPassword: disablePassword, code: disableCode })
      });
      setDisablePassword("");
      setDisableCode("");
      setRecoveryCodes([]);
      notify("good", "Two-factor authentication has been disabled.");
      await load();
    } catch (error: unknown) {
      notify("bad", error instanceof Error ? error.message : "Unable to disable two-factor authentication");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <main className={styles.loadingPage}><div className={styles.loadingCard}><ScenovaIcon name="shield" size={24}/><div><b>Loading My Account</b><span>Checking your secure session and account details...</span></div></div></main>;
  }

  if (!data) {
    return <main className={styles.loadingPage}><div className={styles.loadingCard}><ScenovaIcon name="info" size={24}/><div><b>Account unavailable</b><span>{message || "Please sign in again."}</span></div><button type="button" onClick={logout}>Back to Sign In</button></div></main>;
  }

  return (
    <div className="app-wrap">
      {elevated
        ? <OwnerSidebar activeKey="my-account" onLogout={logout} role={data.user.role}/>
        : <CustomerSidebar activeKey="my-account" onLogout={logout} userCode={data.user.userCode} partner={partnerSummary}/>}
      <main className={`main app-main ${styles.main}`}>
        {elevated
          ? <OwnerMobileNav activeKey="my-account"/>
          : <CustomerMobileNav activeKey="my-account" partner={partnerSummary}/>}

        <header className={styles.header}>
          <div className={styles.headerIcon}><ScenovaIcon name="account" size={24}/></div>
          <div><div className={styles.eyebrow}>SCENOVA ACCOUNT</div><h1>My Account</h1><p>Manage your profile, password, two-factor authentication and account access details.</p></div>
          <div className={styles.statusPill}><span className="dot green"/> {data.user.status}</div>
        </header>

        {message && <div className={`${styles.message} ${messageKind === "good" ? styles.good : messageKind === "bad" ? styles.bad : styles.info}`} role="status"><ScenovaIcon name={messageKind === "bad" ? "info" : "status"} size={17}/><span>{message}</span></div>}

        <section className={styles.summaryGrid}>
          <article className={styles.summaryCard}><span>SCENOVA User ID</span><b className={styles.mono}>{data.user.userCode}</b><small>Permanent account identifier</small></article>
          <article className={styles.summaryCard}><span>Email Verification</span><b>{data.user.emailVerified ? "Verified" : "Not Verified"}</b><small>{formatDate(data.user.emailVerifiedAt)}</small></article>
          <article className={styles.summaryCard}><span>Two-Factor Authentication</span><b className={data.security.twoFactorEnabled ? styles.goodText : styles.warnText}>{data.security.twoFactorEnabled ? "Enabled" : "Not Enabled"}</b><small>{data.security.twoFactorEnabled ? `${data.security.recoveryCodesRemaining} recovery codes remaining` : "Authenticator app ready"}</small></article>
          <article className={styles.summaryCard}>
            <span>Access</span>
            <b>{accessSummary(data)}</b>
            <small>{data.access.subscription?.expires_at ? `Expires ${formatDate(data.access.subscription.expires_at)}` : "SCENOVA membership status"}</small>
            {trialAccess?.eligibility.allowed && (
              <button
                type="button"
                className={styles.summaryAction}
                onClick={()=>goToAccountSection(data.user.phone ? "trial-access" : "phone-settings")}
              >
                {data.user.phone ? "รับ Trial →" : "เพิ่มเบอร์เพื่อรับ Trial →"}
              </button>
            )}
          </article>
        </section>

        <div className={styles.contentGrid}>
          <section className={styles.panel}>
            <PanelTitle icon="account" title="Account Overview" copy="Your SCENOVA identity and account status."/>
            <div className={styles.detailList}>
              <Detail label="Email Address" value={data.user.email}/>
              <Detail label="Account Role" value={data.user.role}/>
              <Detail label="Account Status" value={data.user.status} good/>
              <Detail label="Member Since" value={formatDate(data.user.createdAt)}/>
              <Detail label="Last Sign In" value={formatDate(data.user.lastSignInAt)}/>
              <Detail label="SCENOVA Account ID" value={data.user.id} mono/>
            </div>
          </section>
          <section className={styles.panel}>
            <PanelTitle icon="shield" title="Security Status" copy="Security controls currently protecting this account."/>
            <div className={styles.securityRows}>
              <SecurityRow icon="status" label="Email verification" value={data.user.emailVerified ? "Verified" : "Pending"} good={data.user.emailVerified}/>
              <SecurityRow icon="shield" label="Two-factor authentication" value={data.security.twoFactorEnabled ? "On" : "Off"} good={data.security.twoFactorEnabled}/>
              <SecurityRow icon="clock" label="Password last changed" value={formatDate(data.security.passwordChangedAt)}/>
              <SecurityRow icon="account" label="Current session" value="Active" good/>
            </div>
          </section>
        </div>

        {!elevated && trialAccess && (
          <div className={styles.accountActionsGrid}>
            <section id="phone-settings" className={`${styles.panel} ${styles.compactPanel}`}>
              <div className={styles.panelHead}>
                <div>
                  <span className={styles.panelIcon}><ScenovaIcon name="account" size={19}/></span>
                  <div><h2>Phone Number</h2><p>ผูกเบอร์โทรก่อนใช้งาน OTP และสิทธิ์ทดลอง</p></div>
                </div>
                <span className={`${styles.stateBadge} ${data.user.phone ? styles.stateOn : ""}`}>
                  {data.user.phone ? (data.user.phone.verified ? "VERIFIED" : "BOUND") : "REQUIRED"}
                </span>
              </div>

              {data.user.phone && !phoneEditing ? (
                <div className={styles.phoneSummary}>
                  <div>
                    <b>{data.user.phone.masked}</b>
                    <span>{data.user.phone.verified ? "ยืนยันด้วย OTP แล้ว" : "ผูกกับบัญชีแล้ว · ยังไม่ยืนยัน"}</span>
                  </div>
                  {!data.user.phone.verified && !trialAccess.authorization && !trialAccess.trial && (
                    <button type="button" className={styles.secondaryButton} onClick={()=>setPhoneEditing(true)}>เปลี่ยนเบอร์</button>
                  )}
                </div>
              ) : (
                <>
                  <div className={styles.phoneForm}>
                    <select value={phoneCountry} onChange={e=>setPhoneCountry(e.target.value)} disabled={phoneBusy}>
                      {PHONE_COUNTRIES.map(([iso,name,code])=><option key={iso} value={code}>{name} {code}</option>)}
                    </select>
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="เช่น 0812345678"
                      value={phoneInput}
                      onChange={e=>setPhoneInput(e.target.value.slice(0,24))}
                      disabled={phoneBusy}
                    />
                    <button type="button" className={styles.primaryButton} onClick={savePhone} disabled={!phoneInput.trim() || phoneBusy}>
                      {phoneBusy ? "กำลังบันทึก..." : "ผูกเบอร์โทร"}
                    </button>
                    {data.user.phone && <button type="button" className={styles.linkButton} onClick={()=>setPhoneEditing(false)} disabled={phoneBusy}>ยกเลิก</button>}
                  </div>
                  <div className={styles.compactHint}>รองรับหมายเลขต่างประเทศแบบ E.164 · เลือกรหัสประเทศแล้วกรอกเบอร์มือถือ</div>
                </>
              )}
            </section>

            <section id="trial-access" className={`${styles.panel} ${styles.compactPanel} ${styles.trialPanel}`}>
              <div className={styles.panelHead}>
                <div>
                  <span className={styles.panelIcon}><ScenovaIcon name="wallet" size={19}/></span>
                  <div><h2>Trial Access</h2><p>เฉพาะบัญชีที่ผ่านเงื่อนไข · ยืนยันผ่าน OTP</p></div>
                </div>
                <span className={`${styles.stateBadge} ${(trialAccess.trial || trialAccess.authorization?.status === "PENDING_BIND" || trialAccess.authorization?.status === "CLAIMED") ? styles.stateOn : ""}`}>
                  {trialAccess.trial?.status || (trialAccess.authorization?.status === "PENDING_BIND" ? "TRIAL READY" : trialAccess.authorization?.status === "CLAIMED" ? "READY" : trialAccess.eligibility.allowed ? "AVAILABLE" : "UNAVAILABLE")}
                </span>
              </div>

              {trialAccess.trial ? (
                <div className={styles.trialResult}>
                  <b>Trial {Math.max(1, Math.ceil(Number(trialAccess.trial.duration_minutes || 1440) / 1440))} วัน</b>
                  <span>{trialAccess.trial.status === "ACTIVE" ? "กำลังใช้งาน" : "พร้อมเริ่มเมื่อกด Start Bot ครั้งแรก"}</span>
                  <small>{trialAccess.trial.expires_at ? "หมดอายุ " + formatDate(trialAccess.trial.expires_at) : "เวลายังไม่เริ่มนับ"}</small>
                </div>
              ) : trialAccess.authorization?.status === "PENDING_BIND" ? (
                <div className={styles.trialResult}><b>TRIAL READY · รอ MT5</b><span>ผูก MT5 แรกแล้วกด Start เพื่อเริ่มนับเวลา</span></div>
              ) : trialAccess.authorization?.status === "CLAIMED" ? (
                <div className={styles.trialResult}><b>Trial พร้อมใช้งาน</b><span>กด Start Bot เพื่อเริ่มนับเวลา</span></div>
              ) : !trialAccess.eligibility.allowed ? (
                <div className={`${styles.compactHint} ${styles.trialHintBlocked}`}>{trialAccess.eligibility.message}</div>
              ) : !trialAccess.phone ? (
                <div className={styles.phoneRequired}>
                  <div><b>ต้องผูกเบอร์โทรก่อน</b><span>OTP จะส่งเฉพาะเบอร์ที่บันทึกไว้ในบัญชีนี้</span></div>
                  <button type="button" className={styles.secondaryButton} onClick={()=>goToAccountSection("phone-settings")}>เพิ่มเบอร์โทร →</button>
                </div>
              ) : (
                <>
                  <div className={styles.otpTarget}><span>OTP จะส่งไปที่</span><b>{trialAccess.phone.masked}</b></div>
                  <div className={styles.otpRow}>
                    <button type="button" className={styles.secondaryButton} onClick={requestTrialCode} disabled={trialBusy || !trialAccess.smsConfigured}>
                      {trialBusy ? "กำลังส่ง..." : "ส่ง OTP"}
                    </button>
                    <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="OTP 6 หลัก" value={trialCode} onChange={e=>setTrialCode(e.target.value.replace(/\D/g,"").slice(0,6))} disabled={trialBusy}/>
                    <button type="button" className={styles.primaryButton} onClick={redeemTrialCode} disabled={trialBusy || trialCode.length !== 6}>ยืนยัน & เปิด Trial</button>
                  </div>
                  <div className={styles.compactHint}>
                    {!trialAccess.smsConfigured ? "ระบบ SMS ยังไม่พร้อมใช้งาน" : `Trial ${trialAccess.trialDays} วัน · ตรวจบัญชี เบอร์โทร MT5 และอุปกรณ์ก่อนอนุมัติ`}
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        <section className={`${styles.panel} ${styles.securityPanel}`}>
          <PanelTitle icon="shield" title="Password" copy="Use your current password to create a new secure password."/>
          <form className={styles.formGrid} onSubmit={changePassword}>
            <label>Current Password<input type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} disabled={busy}/></label>
            <label>New Password<input type="password" autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} disabled={busy}/></label>
            <label>Confirm New Password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} disabled={busy}/></label>
            {data.security.twoFactorEnabled && <label>2FA or Recovery Code<input type="text" autoComplete="one-time-code" value={password2fa} onChange={e=>setPassword2fa(e.target.value)} placeholder="000000 or recovery code" disabled={busy}/></label>}
            <div className={styles.passwordMeterRow}><div className={styles.passwordMeter} aria-hidden="true">{[1,2,3,4].map(level=><span key={level} className={passwordStrength>=level ? styles.meterOn : ""}/>)}</div><small>8+ characters · use upper/lowercase, numbers or symbols</small></div>
            <button type="submit" className={styles.primaryButton} disabled={!passwordReady || busy}>Change Password <span>→</span></button>
          </form>
        </section>

        <section className={`${styles.panel} ${styles.twoFactorPanel}`}>
          <div className={styles.panelHead}>
            <div><span className={styles.panelIcon}><ScenovaIcon name="shield" size={19}/></span><div><h2>Two-Factor Authentication</h2><p>Add an authenticator-app code after your password when signing in.</p></div></div>
            <span className={`${styles.stateBadge} ${data.security.twoFactorEnabled ? styles.stateOn : ""}`}>{data.security.twoFactorEnabled ? "ENABLED" : "OFF"}</span>
          </div>

          {!data.security.twoFactorEnabled && !twoFactorSetup && <div className={styles.twoFactorIntro}><div><b>Authenticator App (TOTP)</b><p>Works with Google Authenticator, Microsoft Authenticator, 1Password and compatible TOTP apps. Existing accounts stay unchanged until you enable this feature.</p></div><div className={styles.inlineAction}><input type="password" autoComplete="current-password" placeholder="Current password" value={twoFactorPassword} onChange={e=>setTwoFactorPassword(e.target.value)} disabled={busy}/><button type="button" onClick={startTwoFactor} disabled={!twoFactorPassword || busy}>Enable 2FA</button></div></div>}

          {!data.security.twoFactorEnabled && twoFactorSetup && <div className={styles.setupBox}>
            <div className={styles.setupStep}><span>1</span><div><b>Add SCENOVA to your authenticator</b><p>Open the authenticator link on mobile or enter the setup key manually.</p></div></div>
            <div className={styles.secretRow}><code>{twoFactorSetup.secret}</code><button type="button" onClick={()=>copyText(twoFactorSetup.secret,"Setup key copied")}>Copy Key</button><a href={twoFactorSetup.otpauthUri}>Open Authenticator</a></div>
            <div className={styles.setupStep}><span>2</span><div><b>Verify the current 6-digit code</b><p>This confirms the authenticator is connected before protection is activated.</p></div></div>
            <div className={styles.inlineAction}><input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={twoFactorCode} onChange={e=>setTwoFactorCode(e.target.value.replace(/\D/g,"").slice(0,6))} disabled={busy}/><button type="button" onClick={enableTwoFactor} disabled={twoFactorCode.length!==6 || busy}>Activate 2FA</button></div>
          </div>}

          {data.security.twoFactorEnabled && <form className={styles.disableBox} onSubmit={disableTwoFactor}><div><b>2FA is protecting this account</b><p>Disabling it requires your current password and a valid authenticator or recovery code.</p></div><input type="password" autoComplete="current-password" placeholder="Current password" value={disablePassword} onChange={e=>setDisablePassword(e.target.value)} disabled={busy}/><input type="text" autoComplete="one-time-code" placeholder="2FA or recovery code" value={disableCode} onChange={e=>setDisableCode(e.target.value)} disabled={busy}/><button type="submit" className={styles.secondaryButton} disabled={!disablePassword || !disableCode || busy}>Disable 2FA</button></form>}

          {recoveryCodes.length > 0 && <div className={styles.recoveryBox}><div className={styles.recoveryHead}><div><b>Save your recovery codes now</b><p>Each code can be used once if your authenticator is unavailable. They will not be shown again.</p></div><button type="button" onClick={()=>copyText(recoveryCodes.join("\n"),"Recovery codes copied")}>Copy All</button></div><div className={styles.recoveryGrid}>{recoveryCodes.map(code=><code key={code}>{code}</code>)}</div></div>}
        </section>

        <div className={styles.contentGrid}>
          <section className={styles.panel}>
            <PanelTitle icon="wallet" title="Access Details" copy="Membership, trial and partner access linked to this SCENOVA account."/>
            <div className={styles.detailList}>
              <Detail label="Subscription" value={data.access.subscription?.status || "—"}/>
              <Detail label="Plan" value={data.access.subscription?.code || "—"}/>
              <Detail label="Mode" value={data.access.subscription?.mode || "—"}/>
              <Detail label="Subscription Expires" value={formatDate(data.access.subscription?.expires_at)}/>
              <Detail label="Trial" value={data.access.trial?.status || "—"}/>
              <Detail label="Partner Status" value={data.access.partner?.status || "—"}/>
            </div>
          </section>
          <section className={styles.panel}>
            <PanelTitle icon="status" title="Sessions & Devices" copy="Current secure browser session. More session controls can be added without changing MT5."/>
            <div className={styles.sessionCard}><div className={styles.sessionIcon}><ScenovaIcon name="account" size={20}/></div><div><b>Current Session</b><span>{data.session.userAgent}</span><small>Network: {data.session.ip}</small></div><em>ACTIVE</em></div>
            <div className={styles.futureNote}><ScenovaIcon name="info" size={16}/><span>Server-side session history, revoke-all-devices and passkeys can be added here later. This release does not alter MT5 or EA sessions.</span></div>
          </section>
        </div>
      </main>
    </div>
  );
}

function PanelTitle({icon,title,copy}:{icon:string;title:string;copy:string}) {
  return <div className={styles.panelHead}><div><span className={styles.panelIcon}><ScenovaIcon name={icon} size={19}/></span><div><h2>{title}</h2><p>{copy}</p></div></div></div>;
}

function Detail({label,value,good=false,mono=false}:{label:string;value:string;good?:boolean;mono?:boolean}) {
  return <div><span>{label}</span><b className={good ? styles.goodText : mono ? styles.monoSmall : ""}>{value}</b></div>;
}

function SecurityRow({icon,label,value,good=false}:{icon:string;label:string;value:string;good?:boolean}) {
  return <div><span><ScenovaIcon name={icon} size={17}/> {label}</span><b className={good ? styles.goodText : undefined}>{value}</b></div>;
}
