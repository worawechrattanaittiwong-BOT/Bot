"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { API_URL } from "../../lib/api";
import { ScenovaBrand } from "../../components/ScenovaBrand";
import { ScenovaIcon } from "../../components/ScenovaIcon";
import styles from "./login.module.css";

const LOGIN_EMAIL_KEY = "scenova_login_email";
const LOGIN_BACKGROUND_DESKTOP_URL = "/assets/scenova-login-globe-desktop-v1.webp";
const LOGIN_BACKGROUND_MOBILE_URL = "/assets/scenova-login-globe-mobile-v1.webp";

type PublicExnessSignupInfo = {
  active: boolean;
  broker: string;
  platform: "WEB" | "MOBILE";
  benefitMessage: string;
  url: string;
};

function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const touchMac = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || touchMac;
}

function LoginBackground() {
  return (
    <>
      <picture className={styles.background} aria-hidden="true">
        <source media="(max-width: 900px)" srcSet={LOGIN_BACKGROUND_MOBILE_URL} />
        <img
          className={styles.backgroundImage}
          src={LOGIN_BACKGROUND_DESKTOP_URL}
          alt=""
          decoding="async"
          fetchPriority="high"
        />
      </picture>
      <div className={styles.vignette} aria-hidden="true" />
    </>
  );
}

export default function LoginPage() {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"error" | "info">("error");
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(true);
  const [inviteCode, setInviteCode] = useState("");
  const [exnessInfo, setExnessInfo] = useState<PublicExnessSignupInfo | null>(null);
  const [exnessBusy, setExnessBusy] = useState(false);

  const passwordChecks = useMemo(() => ({
    length: password.length >= 8,
    mixedCase: /[a-z]/.test(password) && /[A-Z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password)
  }), [password]);
  const passwordStrength = Object.values(passwordChecks).filter(Boolean).length;
  const passwordStrengthLabel =
    passwordStrength >= 4 ? "Strong"
      : passwordStrength >= 3 ? "Good"
      : passwordStrength >= 2 ? "Fair"
      : "Weak";
  const registerReady =
    acceptedTerms &&
    passwordChecks.length &&
    passwordStrength >= 3 &&
    confirmPassword.length >= 8 &&
    password === confirmPassword;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const incomingInvite = String(params.get("ref") || "").trim().toUpperCase();
    setRegister(params.get("mode") === "register" || Boolean(incomingInvite));
    if (incomingInvite) setInviteCode(incomingInvite);

    if (params.get("reason") === "session-expired") {
      setMessageKind("info");
      setMessage("เซสชันหมดอายุเพื่อความปลอดภัย กรุณาเข้าสู่ระบบอีกครั้ง");
    }

    const rememberedEmail = localStorage.getItem(LOGIN_EMAIL_KEY);
    if (rememberedEmail) setEmail(rememberedEmail);

    const token = localStorage.getItem("bot_token");
    if (!token) {
      setCheckingSession(false);
      return;
    }

    fetch(API_URL + "/api/auth/session", {
      headers: { Authorization: "Bearer " + token }
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("invalid session");
        return res.json();
      })
      .then(() => {
        window.location.replace("/dashboard?view=overview");
      })
      .catch(() => {
        localStorage.removeItem("bot_token");
        setCheckingSession(false);
      });
  }, []);

  useEffect(() => {
    let mounted = true;
    const platform = isMobileDevice() ? "MOBILE" : "WEB";
    fetch(
      API_URL + "/api/public/brokers/exness/signup?platform=" + encodeURIComponent(platform),
      { cache: "no-store" }
    )
      .then(async response => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload) throw new Error("Exness signup unavailable");
        return payload as PublicExnessSignupInfo;
      })
      .then(payload => {
        if (mounted && payload.active && /^https:\/\//i.test(String(payload.url || ""))) {
          setExnessInfo(payload);
        }
      })
      .catch(() => {
        if (mounted) setExnessInfo(null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setMessage("");

    try {
      if (register) {
        if (password !== confirmPassword) {
          throw new Error("รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน");
        }
        if (!passwordChecks.length || passwordStrength < 3) {
          throw new Error("กรุณาใช้รหัสผ่านอย่างน้อย 8 ตัว และผสมตัวพิมพ์ใหญ่/เล็ก ตัวเลข หรือสัญลักษณ์ให้แข็งแรงขึ้น");
        }
        if (!acceptedTerms) {
          throw new Error("กรุณายอมรับเงื่อนไขการใช้งานและคำเตือนความเสี่ยงก่อนสร้างบัญชี");
        }
      }

      const res = await fetch(API_URL + "/api/auth/" + (register ? "register" : "login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          referralCode: register ? (inviteCode.trim() || undefined) : undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Unable to sign in. Please try again.");

      if (rememberEmail) localStorage.setItem(LOGIN_EMAIL_KEY, email.trim());
      else localStorage.removeItem(LOGIN_EMAIL_KEY);

      if (data.requiresEmailVerification) {
        localStorage.removeItem("bot_token");
        const verificationEmail = String(data.email || email).trim().toLowerCase();
        window.location.href = "/verify-email?email=" + encodeURIComponent(verificationEmail);
        return;
      }

      if (data.requiresTwoFactor) {
        localStorage.removeItem("bot_token");
        const challenge = String(data.twoFactorChallenge || "").trim();
        if (!challenge) throw new Error("Two-factor challenge was not issued. Please try again.");
        sessionStorage.setItem("scenova_2fa_challenge", challenge);
        sessionStorage.setItem(
          "scenova_2fa_email",
          String(data.email || email).trim().toLowerCase()
        );
        window.location.href = "/verify-2fa";
        return;
      }

      sessionStorage.removeItem("scenova_2fa_challenge");
      sessionStorage.removeItem("scenova_2fa_email");
      if (!data.token) throw new Error("Secure session was not issued. Please try again.");
      localStorage.setItem("bot_token", data.token);
      window.location.href = register ? "/onboarding?new=1" : "/dashboard?view=overview";
    } catch (err: unknown) {
      setMessageKind("error");
      setMessage(err instanceof Error ? err.message : "Unable to sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function switchMode() {
    if (busy) return;
    const next = !register;
    setRegister(next);
    setMessage("");
    setMessageKind("error");
    setShowPassword(false);
    setPassword("");
    setConfirmPassword("");
    setAcceptedTerms(false);
    const ref = inviteCode.trim();
    window.history.replaceState(
      {},
      "",
      next ? "/login?mode=register" + (ref ? "&ref=" + encodeURIComponent(ref) : "") : "/login" + (ref ? "?ref=" + encodeURIComponent(ref) : "")
    );
  }

  function showPasswordRecovery() {
    setMessageKind("info");
    setMessage("การกู้รหัสผ่านยังดำเนินการผ่านผู้ดูแล SCENOVA กรุณาติดต่อผู้ดูแลที่ผูกกับบัญชีของคุณ");
  }

  function openExnessSignup() {
    const url = String(exnessInfo?.url || "");
    if (!/^https:\/\//i.test(url)) return;
    setExnessBusy(true);
    window.location.assign(url);
  }

  if (checkingSession) {
    return (
      <main className={styles.page}>
        <LoginBackground />
        <section className={styles.sessionCard}>
          <ScenovaBrand className={styles.formLogo} />
          <div className={styles.sessionLoader}><span /> Checking your secure session...</div>
          <p>หากเซสชันยังใช้งานได้ ระบบจะพาคุณเข้าสู่ Control Center โดยอัตโนมัติ</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <LoginBackground />
      <a className={styles.skipLink} href="#access-form">Skip to sign in</a>

      <div className={styles.frame}>
        <header className={styles.header}>
          <a href="/website" aria-label="SCENOVA website"><ScenovaBrand className={styles.brand} /></a>
          <span>PRECISION IN MOTION.</span>
        </header>

        <section className={styles.layout}>
          <div className={styles.leftPane}>
            <div className={styles.copy}>
              <div className={styles.eyebrow}>SCENOVA SECURE ACCESS</div>
              <h1>One Account for Your<br /><span>Trading Control Center</span></h1>
              <p>เข้าสู่ระบบเพื่อจัดการ MT5, สิทธิ์ใช้งาน และระบบอัตโนมัติจาก Control Center เดียว โดยแยกขั้นตอนบัญชีออกจากข้อมูล MT5 อย่างชัดเจน</p>

              <div className={styles.features}>
                <div className={styles.feature}>
                  <span className={styles.featureIcon}><ScenovaIcon name="strategy" size={22} /></span>
                  <div><b>Automate Trading</b><small>Smart EA Systems</small></div>
                </div>
                <div className={styles.feature}>
                  <span className={styles.featureIcon}><ScenovaIcon name="clock" size={22} /></span>
                  <div><b>Monitor in Real-Time</b><small>Anytime, Anywhere</small></div>
                </div>
                <div className={styles.feature}>
                  <span className={styles.featureIcon}><ScenovaIcon name="control" size={22} /></span>
                  <div><b>Guided Setup</b><small>Account → MT5 → Access</small></div>
                </div>
              </div>
            </div>

            {exnessInfo?.active && (
              <aside className={styles.partnerCard} aria-label="สมัคร Exness ผ่าน Partner SCENOVA">
                <div className={styles.partnerMark} aria-hidden="true">E</div>
                <div className={styles.partnerCopy}>
                  <small>PARTNER SCENOVA · EXNESS</small>
                  <b>เปิดบัญชี Exness ผ่าน Partner SCENOVA</b>
                  <span>{exnessInfo.benefitMessage || "สมัครผ่านลิงก์ Partner ของ SCENOVA แล้วกลับมาเชื่อม MT5 ได้ภายหลัง"}</span>
                </div>
                <button
                  type="button"
                  className={styles.partnerButton}
                  onClick={openExnessSignup}
                  disabled={exnessBusy}
                >
                  {exnessBusy ? "กำลังเปิด..." : "สมัคร Exness"} <span aria-hidden="true">↗</span>
                </button>
                <div className={styles.partnerTrust}>
                  <ScenovaIcon name="shield" size={15}/>
                  <span>Official Partner Link · ใช้ลิงก์สำหรับ {exnessInfo.platform === "MOBILE" ? "มือถือ" : "คอมพิวเตอร์"}</span>
                </div>
              </aside>
            )}

            <div className={styles.visualFooter}>DESIGNED FOR YOUR TRADING JOURNEY</div>
          </div>

          <div className={styles.formPane}>
            <div className={styles.formCard} id="access-form" aria-labelledby="access-title">
              <a className={styles.formBrand} href="/website" aria-label="SCENOVA website"><ScenovaBrand className={styles.formLogo} /></a>

              <div className={styles.formHeading}>
                <div className={styles.cardEyebrow}>{register ? "CREATE ACCOUNT" : "SECURE ACCESS"}</div>
                <h2 id="access-title">{register ? "Create Your Account" : "Welcome Back"}</h2>
                <p className={styles.muted}>
                  {register
                    ? "สร้างบัญชีก่อน จากนั้นระบบจะพาไปเชื่อม MT5 และตรวจสอบ Trial / Subscription เป็นขั้นตอน"
                    : "เข้าสู่ Control Center เพื่อจัดการ MT5 และระบบอัตโนมัติของคุณ"}
                </p>
              </div>

              {register && (
                <div className={styles.steps}>
                  <span className={styles.active}>1 · Account</span><span>2 · Connect MT5</span><span>3 · Access</span>
                </div>
              )}

              <form className={styles.form} onSubmit={submit} aria-busy={busy}>
                <label className={styles.label} htmlFor="login-email">Email Address</label>
                <div className={styles.inputWrap}>
                  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/></svg>
                  <input id="login-email" className={styles.input} type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@email.com" required disabled={busy} />
                </div>

                {register && (
                  <>
                    <label className={styles.label} htmlFor="invite-code">Invite Code <span className={styles.optional}>(optional)</span></label>
                    <div className={styles.inputWrap}>
                      <ScenovaIcon name="users" size={19}/>
                      <input
                        id="invite-code"
                        className={styles.input}
                        type="text"
                        autoCapitalize="characters"
                        spellCheck={false}
                        value={inviteCode}
                        onChange={e=>setInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g,"").slice(0,40))}
                        placeholder="SCN-XXXXXX"
                        disabled={busy}
                      />
                    </div>
                  </>
                )}

                <label className={styles.label} htmlFor="login-password">Password</label>
                <div className={styles.inputWrap}>
                  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>
                  <input id="login-password" className={styles.input} type={showPassword ? "text" : "password"} minLength={8} autoComplete={register ? "new-password" : "current-password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder={register ? "อย่างน้อย 8 ตัวอักษร" : "Enter your password"} required disabled={busy} />
                  <button type="button" className={styles.passwordToggle} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={()=>setShowPassword(value=>!value)}>
                    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{showPassword && <path d="m3 3 18 18"/>}</svg>
                  </button>
                </div>

                {register && (
                  <>
                    <div className={styles.passwordHealth} aria-live="polite">
                      <div className={styles.passwordMeter} aria-hidden="true">
                        {[1,2,3,4].map(level => <span key={level} className={passwordStrength >= level ? styles.meterActive : ""} />)}
                      </div>
                      <div className={styles.passwordMeta}>
                        <span>ความแข็งแรงของรหัสผ่าน</span>
                        <b>{password ? passwordStrengthLabel : "—"}</b>
                      </div>
                      <div className={styles.passwordRules}>
                        <span className={passwordChecks.length ? styles.ruleOk : ""}>8+ ตัว</span>
                        <span className={passwordChecks.mixedCase ? styles.ruleOk : ""}>A/a</span>
                        <span className={passwordChecks.number ? styles.ruleOk : ""}>0–9</span>
                        <span className={passwordChecks.symbol ? styles.ruleOk : ""}>สัญลักษณ์</span>
                      </div>
                    </div>

                    <label className={styles.label} htmlFor="confirm-password">Confirm Password</label>
                    <div className={styles.inputWrap + (confirmPassword && confirmPassword !== password ? " " + styles.inputError : "")}>
                      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m5 12 4 4L19 6"/><rect x="3" y="3" width="18" height="18" rx="4"/></svg>
                      <input id="confirm-password" className={styles.input} type={showPassword ? "text" : "password"} minLength={8} autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="ยืนยันรหัสผ่านอีกครั้ง" required disabled={busy} />
                    </div>

                    <label className={styles.terms}>
                      <input type="checkbox" checked={acceptedTerms} onChange={e=>setAcceptedTerms(e.target.checked)} disabled={busy} />
                      <span>ฉันยอมรับเงื่อนไขการใช้งานและรับทราบคำเตือนความเสี่ยงในการใช้ระบบอัตโนมัติ</span>
                    </label>

                    <div className={styles.registrationSafety}>
                      <ScenovaIcon name="shield" size={18}/>
                      <span>ขั้นตอนสมัครนี้ไม่ขอรหัส MT5 หรือ Trading Password ข้อมูล MT5 จะอยู่ในขั้นตอนเชื่อมต่อแยกต่างหาก</span>
                    </div>
                  </>
                )}

                {!register && (
                  <div className={styles.formOptions}>
                    <label className={styles.remember}><input type="checkbox" checked={rememberEmail} onChange={e=>setRememberEmail(e.target.checked)} /> <span>Remember me</span></label>
                    <button className={styles.forgot} type="button" onClick={showPasswordRecovery}>Forgot password?</button>
                  </div>
                )}

                {message && <div className={styles.message + (messageKind === "info" ? " " + styles.info : "")} role="alert">{message}</div>}

                <button type="submit" className={styles.submit} disabled={busy || (register && !registerReady)}>
                  {busy ? "Please wait..." : register ? "Create Account Securely" : "Sign In"}<span aria-hidden="true">→</span>
                </button>
              </form>

              <div className={styles.divider}><span>or</span></div>
              <button type="button" className={styles.switch} disabled={busy} onClick={switchMode}>{register ? "Already have an account? Sign In" : "Create Account"}</button>
              <a className={styles.back} href="/website">← Back to Website</a>

              <div className={styles.security}>
                <div><ScenovaIcon name="shield" size={20}/><p>Encrypted<br/>session<small>บัญชีและ Token แยกจาก MT5</small></p></div>
                <div><ScenovaIcon name="control" size={20}/><p>Guided<br/>onboarding<small>Account → MT5 → Access</small></p></div>
                <div><ScenovaIcon name="cloud" size={20}/><p>Cloud + Local<br/>ready<small>เลือกภายหลังได้</small></p></div>
              </div>
            </div>

            <div className={styles.formFooter}><ScenovaIcon name="shield" size={17}/><span>Protected by SCENOVA secure authentication</span></div>
          </div>
        </section>
      </div>
    </main>
  );
}
