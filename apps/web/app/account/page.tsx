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
      notify("bad", error instanceof Error ? error.message : "โหลดข้อมูลบัญชีไม่สำเร็จ");
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

  function notify(kind: "good" | "bad" | "info", text: string) {
    setMessageKind(kind);
    setMessage(text);
  }

  function logout() {
    localStorage.removeItem("bot_token");
    sessionStorage.removeItem("scenova_2fa_challenge");
    sessionStorage.removeItem("scenova_2fa_email");
    window.location.replace("/login");
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
    if (trialBusy || !trialAccess?.phone) return;
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
    (trialAccess.eligibility.allowed || !!trialAccess.authorization || !!trialAccess.trial);

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
            <div>
              <div className={styles.eyebrow}>ACCOUNT SETTINGS</div>
              <h1>My Account</h1>
              <span>{data.user.email}</span>
            </div>
            <div className={styles.userCode}>{data.user.userCode}</div>
          </header>

          {message && (
            <div className={`${styles.message} ${messageKind === "good" ? styles.good : messageKind === "bad" ? styles.bad : ""}`}>
              {message}
            </div>
          )}

          <section className={styles.cardGrid}>
            <section id="phone-settings" className={styles.accountCard}>
              <CardHeader
                icon="account"
                title="เบอร์โทร"
                subtitle={data.user.phone ? data.user.phone.masked : "ยังไม่ได้ผูกเบอร์"}
                badge={data.user.phone ? (data.user.phone.verified ? "VERIFIED" : "SAVED") : "REQUIRED"}
                badgeKind={data.user.phone?.verified ? "good" : "neutral"}
              />

              <div className={styles.cardBody}>
                {data.user.phone && !phoneEditing ? (
                  <div className={styles.savedRow}>
                    <div>
                      <strong>{data.user.phone.masked}</strong>
                      <span>{data.user.phone.verified ? "ยืนยันแล้ว" : "บันทึกแล้ว"}</span>
                    </div>
                    {!data.user.phone.verified && !trialAccess?.authorization && !trialAccess?.trial && (
                      <button type="button" className={styles.secondaryButton} onClick={() => setPhoneEditing(true)}>
                        เปลี่ยนเบอร์
                      </button>
                    )}
                  </div>
                ) : (
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

                    <label className={styles.phoneNumberField}>
                      <span>เบอร์โทร</span>
                      <input
                        type="tel"
                        inputMode="tel"
                        name="scenova_phone_manual"
                        autoComplete="off"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        aria-label="เบอร์โทร"
                        value={phoneInput}
                        onChange={e => setPhoneInput(e.target.value.slice(0,24))}
                        disabled={phoneBusy}
                      />
                    </label>

                    <div className={styles.formActions}>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={savePhone}
                        disabled={!phoneCountry || !phoneInput.trim() || phoneBusy}
                      >
                        {phoneBusy ? "กำลังบันทึก..." : "บันทึก"}
                      </button>
                      {data.user.phone && (
                        <button type="button" className={styles.textButton} onClick={() => setPhoneEditing(false)} disabled={phoneBusy}>
                          ยกเลิก
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {trialVisible && (
              <section className={styles.accountCard}>
                <CardHeader
                  icon="wallet"
                  title="Trial"
                  subtitle={trialAccess?.trial ? trialAccess.trial.status : "สิทธิ์ทดลองใช้งาน"}
                  badge={trialAccess?.trial ? "ACTIVE" : trialAccess?.authorization ? "READY" : "AVAILABLE"}
                  badgeKind={trialAccess?.trial || trialAccess?.authorization ? "good" : "neutral"}
                />

                <div className={styles.cardBody}>
                  {!trialOpen && !trialAccess?.trial && !trialAccess?.authorization ? (
                    <div className={styles.trialLanding}>
                      <span>ยืนยันเบอร์ด้วย OTP เพื่อเปิดสิทธิ์</span>
                      <button type="button" className={styles.primaryButton} onClick={openTrial}>
                        รับสิทธิ์ทดลอง
                      </button>
                    </div>
                  ) : (
                    <div id="trial-access">
                      {trialAccess?.trial ? (
                        <div className={styles.successState}>เปิดสิทธิ์แล้ว</div>
                      ) : trialAccess?.authorization ? (
                        <div className={styles.successState}>Trial พร้อมใช้งาน</div>
                      ) : !trialAccess?.phone ? (
                        <div className={styles.trialLanding}>
                          <span>ต้องผูกเบอร์โทรก่อน</span>
                          <button type="button" className={styles.secondaryButton} onClick={() => goTo("phone-settings")}>
                            ไปที่เบอร์โทร
                          </button>
                        </div>
                      ) : (
                        <div className={styles.otpBox}>
                          <div className={styles.otpTarget}>
                            <span>ส่ง OTP ไปที่</span>
                            <strong>{trialAccess.phone.masked}</strong>
                          </div>
                          <div className={styles.otpActions}>
                            <button type="button" className={styles.secondaryButton} onClick={requestTrialCode} disabled={trialBusy}>
                              {trialBusy ? "กำลังส่ง..." : "ส่ง OTP"}
                            </button>
                            <input
                              type="text"
                              inputMode="numeric"
                              name="scenova_trial_otp"
                              autoComplete="one-time-code"
                              data-lpignore="true"
                              aria-label="OTP"
                              maxLength={6}
                              value={trialCode}
                              onChange={e => setTrialCode(e.target.value.replace(/\D/g,"").slice(0,6))}
                              disabled={trialBusy}
                            />
                            <button type="button" className={styles.primaryButton} onClick={redeemTrialCode} disabled={trialBusy || trialCode.length !== 6}>
                              ยืนยัน
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            )}

            <section className={styles.accountCard}>
              <CardHeader icon="shield" title="เปลี่ยนรหัสผ่าน" subtitle="อัปเดตรหัสผ่านบัญชี" />
              <form className={styles.cardBody} onSubmit={changePassword} autoComplete="off">
                <div className={styles.passwordGrid}>
                  <label>
                    <span>รหัสผ่านปัจจุบัน</span>
                    <input
                      type="password"
                      name="scenova_current_password"
                      autoComplete="off"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      value={currentPassword}
                      onChange={e=>setCurrentPassword(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <label>
                    <span>รหัสผ่านใหม่</span>
                    <input
                      type="password"
                      name="scenova_new_password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={e=>setNewPassword(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <label>
                    <span>ยืนยันรหัสผ่านใหม่</span>
                    <input
                      type="password"
                      name="scenova_confirm_password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={e=>setConfirmPassword(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                  {data.security.twoFactorEnabled && (
                    <label>
                      <span>รหัส 2FA</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        name="scenova_password_2fa"
                        autoComplete="one-time-code"
                        data-lpignore="true"
                        value={password2fa}
                        onChange={e=>setPassword2fa(e.target.value)}
                        disabled={busy}
                      />
                    </label>
                  )}
                </div>
                <div className={styles.cardFooter}>
                  <div className={styles.passwordMeter} aria-hidden="true">
                    {[1,2,3,4].map(level => <span key={level} className={passwordStrength >= level ? styles.meterOn : ""}/>)}
                  </div>
                  <button type="submit" className={styles.primaryButton} disabled={!passwordReady || busy}>
                    บันทึกรหัสผ่าน
                  </button>
                </div>
              </form>
            </section>

            <section className={styles.accountCard}>
              <CardHeader
                icon="shield"
                title="2FA"
                subtitle="Authenticator"
                badge={data.security.twoFactorEnabled ? "ON" : "OFF"}
                badgeKind={data.security.twoFactorEnabled ? "good" : "neutral"}
              />

              <div className={styles.cardBody}>
                {!data.security.twoFactorEnabled && !twoFactorSetup && (
                  <div className={styles.twoFactorForm}>
                    <label>
                      <span>รหัสผ่านปัจจุบัน</span>
                      <input
                        type="password"
                        name="scenova_2fa_setup_password"
                        autoComplete="off"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        value={twoFactorPassword}
                        onChange={e=>setTwoFactorPassword(e.target.value)}
                        disabled={busy}
                      />
                    </label>
                    <button type="button" className={styles.primaryButton} onClick={startTwoFactor} disabled={!twoFactorPassword || busy}>
                      เปิด 2FA
                    </button>
                  </div>
                )}

                {!data.security.twoFactorEnabled && twoFactorSetup && (
                  <div className={styles.setupBox}>
                    <div className={styles.secretLine}>
                      <code>{twoFactorSetup.secret}</code>
                      <button type="button" className={styles.secondaryButton} onClick={()=>copyText(twoFactorSetup.secret)}>คัดลอก</button>
                      <a className={styles.secondaryButton} href={twoFactorSetup.otpauthUri}>เปิดแอป</a>
                    </div>
                    <div className={styles.twoFactorForm}>
                      <label>
                        <span>รหัส 6 หลัก</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          name="scenova_2fa_verify_code"
                          autoComplete="one-time-code"
                          maxLength={6}
                          value={twoFactorCode}
                          onChange={e=>setTwoFactorCode(e.target.value.replace(/\D/g,"").slice(0,6))}
                          disabled={busy}
                        />
                      </label>
                      <button type="button" className={styles.primaryButton} onClick={enableTwoFactor} disabled={twoFactorCode.length !== 6 || busy}>
                        ยืนยัน
                      </button>
                    </div>
                  </div>
                )}

                {data.security.twoFactorEnabled && (
                  <form className={styles.disableForm} onSubmit={disableTwoFactor} autoComplete="off">
                    <label>
                      <span>รหัสผ่านปัจจุบัน</span>
                      <input
                        type="password"
                        name="scenova_2fa_disable_password"
                        autoComplete="off"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        value={disablePassword}
                        onChange={e=>setDisablePassword(e.target.value)}
                        disabled={busy}
                      />
                    </label>
                    <label>
                      <span>2FA / Recovery Code</span>
                      <input
                        type="text"
                        name="scenova_2fa_disable_code"
                        autoComplete="one-time-code"
                        value={disableCode}
                        onChange={e=>setDisableCode(e.target.value)}
                        disabled={busy}
                      />
                    </label>
                    <button type="submit" className={styles.secondaryButton} disabled={!disablePassword || !disableCode || busy}>
                      ปิด 2FA
                    </button>
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
          </section>
        </div>
      </main>
    </div>
  );
}

function CardHeader({
  icon,
  title,
  subtitle,
  badge,
  badgeKind = "neutral"
}:{
  icon:string;
  title:string;
  subtitle:string;
  badge?:string;
  badgeKind?:"good"|"neutral";
}) {
  return (
    <div className={styles.cardHeader}>
      <div className={styles.cardTitle}>
        <span className={styles.icon}><ScenovaIcon name={icon} size={18}/></span>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      {badge && <span className={`${styles.badge} ${badgeKind === "good" ? styles.badgeGood : ""}`}>{badge}</span>}
    </div>
  );
}
