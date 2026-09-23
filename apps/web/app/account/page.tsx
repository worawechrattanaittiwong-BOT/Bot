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
    phone: {
      countryCode: string;
      masked: string;
      verified: boolean;
      verifiedAt: string | null;
    } | null;
  };
  security: {
    twoFactorEnabled: boolean;
    recoveryCodesRemaining: number;
  };
  access: {
    subscription: any;
    trial: any;
    partner: any;
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
};

type TwoFactorSetup = {
  secret: string;
  otpauthUri: string;
  digits: number;
  period: number;
};

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

export default function AccountPage() {
  const [data, setData] = useState<AccountData | null>(null);
  const [trialAccess, setTrialAccess] = useState<TrialAccessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"good" | "bad" | "info">("info");

  const [phoneCountry, setPhoneCountry] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneEditing, setPhoneEditing] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);

  const [trialOpen, setTrialOpen] = useState(false);
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
      setPhoneCountry(account.user?.phone?.countryCode || "");
      setPhoneEditing(!account.user?.phone);
      try {
        setTrialAccess(await api("/trial-access/status"));
      } catch {
        setTrialAccess(null);
      }
    } catch (error: unknown) {
      setMessageKind("bad");
      setMessage(error instanceof Error ? error.message : "โหลดข้อมูลบัญชีไม่สำเร็จ");
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

  function goTo(id: string) {
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 20);
  }

  function openTrial() {
    setTrialOpen(true);
    goTo("trial-access");
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
      setPhoneEditing(false);
      notify("good", "บันทึกเบอร์โทรแล้ว");
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
      notify("good", "ส่ง OTP ไปที่ " + result.phoneMasked + " แล้ว");
      setTrialCode("");
      setTrialAccess(await api("/trial-access/status"));
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
      notify("good", result.message || "เปิดสิทธิ์ทดลองแล้ว");
      setTrialCode("");
      await load();
    } catch (error: unknown) {
      notify("bad", error instanceof Error ? error.message : "เปิดสิทธิ์ทดลองไม่สำเร็จ");
    } finally {
      setTrialBusy(false);
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
      notify("good", "เปลี่ยนรหัสผ่านแล้ว");
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

  const trialVisible =
    !elevated &&
    !!trialAccess &&
    (
      trialAccess.eligibility.allowed ||
      !!trialAccess.authorization ||
      !!trialAccess.trial
    );

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
          <div>
            <h1>My Account</h1>
            <span>{data.user.email}</span>
          </div>
          <b>{data.user.userCode}</b>
        </header>

        {message && (
          <div className={`${styles.message} ${messageKind === "good" ? styles.good : messageKind === "bad" ? styles.bad : ""}`}>
            {message}
          </div>
        )}

        <section className={styles.stack}>
          <div id="phone-settings" className={styles.rowCard}>
            <div className={styles.rowTitle}>
              <span className={styles.icon}><ScenovaIcon name="account" size={18}/></span>
              <div>
                <b>เบอร์โทร</b>
                {data.user.phone && <small>{data.user.phone.masked}</small>}
              </div>
            </div>

            {data.user.phone && !phoneEditing ? (
              <div className={styles.rowActions}>
                <span className={data.user.phone.verified ? styles.ok : styles.muted}>
                  {data.user.phone.verified ? "ยืนยันแล้ว" : "บันทึกแล้ว"}
                </span>
                {!data.user.phone.verified && !trialAccess?.authorization && !trialAccess?.trial && (
                  <button type="button" className={styles.secondaryButton} onClick={() => setPhoneEditing(true)}>เปลี่ยน</button>
                )}
              </div>
            ) : (
              <div className={styles.phoneInline}>
                <select value={phoneCountry} onChange={e => setPhoneCountry(e.target.value)} disabled={phoneBusy}>
                  <option value="" disabled>รหัสประเทศ</option>
                  {PHONE_COUNTRIES.map(([iso,name,code]) => <option key={iso} value={code}>{name} {code}</option>)}
                </select>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  aria-label="เบอร์โทร"
                  value={phoneInput}
                  onChange={e => setPhoneInput(e.target.value.slice(0,24))}
                  disabled={phoneBusy}
                />
                <button type="button" className={styles.primaryButton} onClick={savePhone} disabled={!phoneCountry || !phoneInput.trim() || phoneBusy}>
                  บันทึก
                </button>
                {data.user.phone && (
                  <button type="button" className={styles.textButton} onClick={() => setPhoneEditing(false)} disabled={phoneBusy}>
                    ยกเลิก
                  </button>
                )}
              </div>
            )}
          </div>

          {trialVisible && (
            <div className={styles.rowCard}>
              <div className={styles.rowTitle}>
                <span className={styles.icon}><ScenovaIcon name="wallet" size={18}/></span>
                <div>
                  <b>Trial</b>
                  {trialAccess?.trial && <small>{trialAccess.trial.status}</small>}
                </div>
              </div>

              {!trialOpen && !trialAccess?.trial && !trialAccess?.authorization ? (
                <button type="button" className={styles.primaryButton} onClick={openTrial}>รับสิทธิ์ทดลอง</button>
              ) : (
                <div id="trial-access" className={styles.trialInline}>
                  {trialAccess?.trial ? (
                    <span className={styles.ok}>เปิดสิทธิ์แล้ว</span>
                  ) : trialAccess?.authorization ? (
                    <span className={styles.ok}>Trial พร้อมใช้งาน</span>
                  ) : !trialAccess?.phone ? (
                    <>
                      <span className={styles.muted}>เพิ่มเบอร์โทรก่อน</span>
                      <button type="button" className={styles.secondaryButton} onClick={() => goTo("phone-settings")}>ไปที่เบอร์โทร</button>
                    </>
                  ) : (
                    <>
                      <span className={styles.phoneTarget}>{trialAccess.phone.masked}</span>
                      <button type="button" className={styles.secondaryButton} onClick={requestTrialCode} disabled={trialBusy || !trialAccess.smsConfigured}>
                        ส่ง OTP
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        aria-label="OTP"
                        maxLength={6}
                        value={trialCode}
                        onChange={e => setTrialCode(e.target.value.replace(/\D/g,"").slice(0,6))}
                        disabled={trialBusy}
                      />
                      <button type="button" className={styles.primaryButton} onClick={redeemTrialCode} disabled={trialBusy || trialCode.length !== 6}>
                        ยืนยัน
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className={styles.rowCard}>
            <div className={styles.rowTitle}>
              <span className={styles.icon}><ScenovaIcon name="shield" size={18}/></span>
              <b>เปลี่ยนรหัสผ่าน</b>
            </div>
            <form className={styles.passwordInline} onSubmit={changePassword}>
              <input type="password" autoComplete="current-password" aria-label="รหัสผ่านปัจจุบัน" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} disabled={busy}/>
              <input type="password" autoComplete="new-password" aria-label="รหัสผ่านใหม่" value={newPassword} onChange={e=>setNewPassword(e.target.value)} disabled={busy}/>
              <input type="password" autoComplete="new-password" aria-label="ยืนยันรหัสผ่านใหม่" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} disabled={busy}/>
              {data.security.twoFactorEnabled && (
                <input type="text" autoComplete="one-time-code" aria-label="รหัส 2FA" value={password2fa} onChange={e=>setPassword2fa(e.target.value)} disabled={busy}/>
              )}
              <button type="submit" className={styles.primaryButton} disabled={!passwordReady || busy}>บันทึก</button>
            </form>
          </div>

          <div className={styles.rowCard}>
            <div className={styles.rowTitle}>
              <span className={styles.icon}><ScenovaIcon name="shield" size={18}/></span>
              <div>
                <b>2FA</b>
                <small className={data.security.twoFactorEnabled ? styles.ok : styles.muted}>
                  {data.security.twoFactorEnabled ? "เปิดอยู่" : "ปิดอยู่"}
                </small>
              </div>
            </div>

            {!data.security.twoFactorEnabled && !twoFactorSetup && (
              <div className={styles.simpleInline}>
                <input type="password" autoComplete="current-password" aria-label="รหัสผ่านปัจจุบันสำหรับเปิด 2FA" value={twoFactorPassword} onChange={e=>setTwoFactorPassword(e.target.value)} disabled={busy}/>
                <button type="button" className={styles.primaryButton} onClick={startTwoFactor} disabled={!twoFactorPassword || busy}>เปิด 2FA</button>
              </div>
            )}

            {!data.security.twoFactorEnabled && twoFactorSetup && (
              <div className={styles.setupBox}>
                <div className={styles.secretLine}>
                  <code>{twoFactorSetup.secret}</code>
                  <button type="button" className={styles.secondaryButton} onClick={()=>copyText(twoFactorSetup.secret)}>คัดลอก</button>
                  <a className={styles.secondaryButton} href={twoFactorSetup.otpauthUri}>เปิดแอป</a>
                </div>
                <div className={styles.simpleInline}>
                  <input type="text" inputMode="numeric" autoComplete="one-time-code" aria-label="รหัส 2FA 6 หลัก" maxLength={6} value={twoFactorCode} onChange={e=>setTwoFactorCode(e.target.value.replace(/\D/g,"").slice(0,6))} disabled={busy}/>
                  <button type="button" className={styles.primaryButton} onClick={enableTwoFactor} disabled={twoFactorCode.length !== 6 || busy}>ยืนยัน</button>
                </div>
              </div>
            )}

            {data.security.twoFactorEnabled && (
              <form className={styles.simpleInline} onSubmit={disableTwoFactor}>
                <input type="password" autoComplete="current-password" aria-label="รหัสผ่านปัจจุบันสำหรับปิด 2FA" value={disablePassword} onChange={e=>setDisablePassword(e.target.value)} disabled={busy}/>
                <input type="text" autoComplete="one-time-code" aria-label="รหัส 2FA หรือ Recovery Code" value={disableCode} onChange={e=>setDisableCode(e.target.value)} disabled={busy}/>
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
        </section>
      </main>
    </div>
  );
}
