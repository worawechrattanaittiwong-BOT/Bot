"use client";

import { FormEvent, useEffect, useState } from "react";
import { API_URL } from "../../lib/api";
import { ScenovaBrand } from "../../components/ScenovaBrand";
import { ScenovaIcon } from "../../components/ScenovaIcon";
import styles from "./login.module.css";
import { LOGIN_HERO_DATA_URI } from "./loginHero.generated";

const LOGIN_EMAIL_KEY = "scenova_login_email";
const LOGIN_PAGE_BACKGROUND = {
  backgroundImage: `url("${LOGIN_HERO_DATA_URI}")`,
  backgroundSize: "cover",
  backgroundPosition: "center center",
  backgroundRepeat: "no-repeat"
} as const;

export default function LoginPage() {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"error" | "info">("error");
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRegister(params.get("mode") === "register");

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
      .then((data) => {
        const role = data.user?.role;
        window.location.replace(role === "OWNER" || role === "ADMIN" ? "/admin" : "/dashboard");
      })
      .catch(() => {
        localStorage.removeItem("bot_token");
        setCheckingSession(false);
      });
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");

    try {
      const res = await fetch(API_URL + "/api/auth/" + (register ? "register" : "login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Unable to sign in. Please try again.");

      if (!register && rememberEmail) localStorage.setItem(LOGIN_EMAIL_KEY, email.trim());
      if (!rememberEmail) localStorage.removeItem(LOGIN_EMAIL_KEY);

      localStorage.setItem("bot_token", data.token);
      window.location.href = data.user?.role === "OWNER" || data.user?.role === "ADMIN"
        ? "/admin"
        : "/dashboard";
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
    setShowPassword(false);
    setPassword("");
    window.history.replaceState({}, "", next ? "/login?mode=register" : "/login");
  }

  function showPasswordRecovery() {
    setMessageKind("info");
    setMessage("Password recovery is currently handled by SCENOVA support. Please contact the administrator linked to your account.");
  }

  if (checkingSession) {
    return (
      <main className={styles.page} style={LOGIN_PAGE_BACKGROUND}>
        <section className={styles.sessionCard}>
          <ScenovaBrand className={styles.formLogo} />
          <div className={styles.sessionLoader}><span /> Checking your secure session...</div>
          <p>If your account is still signed in, SCENOVA will take you directly to your Control Center.</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page} style={LOGIN_PAGE_BACKGROUND}>
      <div className={styles.vignette} aria-hidden="true" />
      <a className={styles.skipLink} href="#access-form">Skip to sign in</a>

      <div className={styles.frame}>
        <header className={styles.header}>
          <a href="/" aria-label="SCENOVA home"><ScenovaBrand className={styles.brand} /></a>
          <span>PRECISION IN MOTION.</span>
        </header>

        <section className={styles.layout}>
          <div className={styles.leftPane}>
            <div className={styles.copy}>
              <div className={styles.eyebrow}>INTELLIGENT MT5 AUTOMATION</div>
              <h1>Secure Access to Your<br /><span>Trading Control Center</span></h1>
              <p>Log in to your SCENOVA account and take full control of your MT5 automation. Manage, monitor, and optimize your trading — all in one powerful platform.</p>

              <div className={styles.features}>
                <div className={styles.feature}>
                  <span className={styles.featureIcon}><ScenovaIcon name="strategy" size={22} /></span>
                  <div><b>Automate Trading</b><small>with Smart EA Systems</small></div>
                </div>
                <div className={styles.feature}>
                  <span className={styles.featureIcon}><ScenovaIcon name="clock" size={22} /></span>
                  <div><b>Monitor in Real-Time</b><small>Anytime, Anywhere</small></div>
                </div>
                <div className={styles.feature}>
                  <span className={styles.featureIcon}><ScenovaIcon name="control" size={22} /></span>
                  <div><b>Built for Traders</b><small>Simple. Powerful. Reliable.</small></div>
                </div>
              </div>
            </div>
            <div className={styles.visualFooter}>DESIGNED FOR YOUR TRADING JOURNEY</div>
          </div>

          <div className={styles.formPane}>
            <div className={styles.formCard} id="access-form" aria-labelledby="access-title">
              <a className={styles.formBrand} href="/" aria-label="SCENOVA home"><ScenovaBrand className={styles.formLogo} /></a>

              <div className={styles.formHeading}>
                <div className={styles.cardEyebrow}>{register ? "CREATE ACCOUNT" : "SECURE ACCESS"}</div>
                <h2 id="access-title">{register ? "Create Your Account" : "Welcome Back"}</h2>
                <p className={styles.muted}>
                  {register
                    ? "Create your SCENOVA account, then connect MT5 and request access to your trading workspace."
                    : "Log in to your Control Center to manage your MT5 and automation systems."}
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

                <label className={styles.label} htmlFor="login-password">Password</label>
                <div className={styles.inputWrap}>
                  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>
                  <input id="login-password" className={styles.input} type={showPassword ? "text" : "password"} minLength={8} autoComplete={register ? "new-password" : "current-password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder={register ? "At least 8 characters" : "Enter your password"} required disabled={busy} />
                  <button type="button" className={styles.passwordToggle} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={()=>setShowPassword(value=>!value)}>
                    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{showPassword && <path d="m3 3 18 18"/>}</svg>
                  </button>
                </div>

                {!register && (
                  <div className={styles.formOptions}>
                    <label className={styles.remember}><input type="checkbox" checked={rememberEmail} onChange={e=>setRememberEmail(e.target.checked)} /> <span>Remember me</span></label>
                    <button className={styles.forgot} type="button" onClick={showPasswordRecovery}>Forgot password?</button>
                  </div>
                )}

                {message && <div className={`${styles.message} ${messageKind === "info" ? styles.info : ""}`} role="alert">{message}</div>}

                <button type="submit" className={styles.submit} disabled={busy}>{busy ? "Please wait..." : register ? "Create Account" : "Sign In"}<span aria-hidden="true">→</span></button>
              </form>

              <div className={styles.divider}><span>or</span></div>
              <button type="button" className={styles.switch} disabled={busy} onClick={switchMode}>{register ? "Already have an account? Sign In" : "Create Account"}</button>
              <a className={styles.back} href="/">← Back to Home</a>

              <div className={styles.security}>
                <div><ScenovaIcon name="shield" size={20}/><p>Encrypted<br/>session<small>Your data stays safe</small></p></div>
                <div><ScenovaIcon name="control" size={20}/><p>Fast access<br/>to MT5 & EA dashboard<small>Get started instantly</small></p></div>
                <div><ScenovaIcon name="cloud" size={20}/><p>Cloud + Local<br/>ready<small>Trade anywhere, anytime</small></p></div>
              </div>
            </div>

            <div className={styles.formFooter}><ScenovaIcon name="shield" size={17}/><span>Protected by SCENOVA secure authentication</span></div>
          </div>
        </section>
      </div>
    </main>
  );
}
