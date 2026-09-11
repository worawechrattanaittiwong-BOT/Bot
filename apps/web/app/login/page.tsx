"use client";

import { FormEvent, useEffect, useState } from "react";
import { API_URL } from "../../lib/api";
import { ScenovaBrand } from "../../components/ScenovaBrand";
import { ScenovaIcon } from "../../components/ScenovaIcon";
import styles from "./login.module.css";

const LOGIN_EMAIL_KEY = "scenova_login_email";

export default function LoginPage() {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(true);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"error" | "info">("error");
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

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
    } catch (err: any) {
      setMessageKind("error");
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  function switchMode() {
    const next = !register;
    setRegister(next);
    setPassword("");
    setMessage("");
    window.history.replaceState({}, "", next ? "/login?mode=register" : "/login");
  }

  function showPasswordRecovery() {
    setMessageKind("info");
    setMessage("Password recovery is currently handled by SCENOVA support. Please contact the administrator linked to your account.");
  }

  if (checkingSession) {
    return (
      <main className={styles.sessionPage}>
        <section className={styles.sessionCard}>
          <ScenovaBrand className={styles.sessionBrand} />
          <div className={styles.sessionLoader}><span className={styles.pulse} /> Checking your secure session...</div>
          <p>If your account is still signed in, SCENOVA will take you directly to your Control Center.</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.backdropGrid} aria-hidden="true" />
      <div className={styles.scanline} aria-hidden="true" />

      <div className={styles.shell}>
        <section className={styles.hero} aria-label="SCENOVA secure access">
          <a className={styles.heroBrandLink} href="/" aria-label="SCENOVA home">
            <ScenovaBrand className={styles.heroBrand} />
          </a>

          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}>INTELLIGENT MT5 AUTOMATION</div>
            <h1>
              Secure Access to Your
              <span>Trading Control Center</span>
            </h1>
            <p className={styles.heroLead}>
              Log in to your SCENOVA account and take full control of your MT5 automation.
              Manage, monitor, and optimize your trading — all in one powerful platform.
            </p>

            <div className={styles.featureList}>
              <div className={styles.feature}>
                <span className={styles.featureIcon}><ScenovaIcon name="trend" size={21} /></span>
                <div><b>Automate Trading</b><small>with Smart EA Systems</small></div>
              </div>
              <div className={styles.feature}>
                <span className={styles.featureIcon}><ScenovaIcon name="clock" size={21} /></span>
                <div><b>Monitor in Real-Time</b><small>Anytime, Anywhere</small></div>
              </div>
              <div className={styles.feature}>
                <span className={styles.featureIcon}><ScenovaIcon name="spark" size={21} /></span>
                <div><b>Built for Traders</b><small>Simple. Powerful. Reliable.</small></div>
              </div>
            </div>
          </div>

          <div className={styles.artScene} aria-hidden="true">
            <div className={styles.marketColumns} />
            <div className={styles.orbitA} />
            <div className={styles.orbitB} />
            <div className={styles.horizonGlow} />

            <div className={styles.hudCard}>
              <div className={styles.hudTitle}><strong>MT5</strong><i /></div>
              <div className={styles.hudBody}>
                <span>CONNECT</span><span>AUTOMATE</span><span>MONITOR</span><span>PROFIT</span>
              </div>
              <div className={styles.hudChart}><i /><i /><i /><i /><i /><i /></div>
            </div>

            <div className={styles.city}>
              <i /><i /><i /><i /><i /><i /><i /><i /><i /><i />
            </div>
            <div className={styles.mountains}><i /><i /><i /></div>

            <img
              className={styles.mascot}
              src="/assets/scenova-nova-mascot-v1.webp"
              width={1536}
              height={1024}
              alt=""
              fetchPriority="high"
            />

            <div className={styles.partnerPlaque}>
              <small>SCENOVA</small>
              <strong>YOUR INTELLIGENT<br />TRADING PARTNER</strong>
              <span />
            </div>

            <div className={styles.verticalTag}>TRADING<br />AUTOMATION<br />A BRIGHTER<br />TOMORROW</div>
          </div>

          <div className={styles.heroFoot}>DESIGNED FOR YOUR TRADING JOURNEY</div>
        </section>

        <section className={styles.panelWrap} aria-label="SCENOVA authentication">
          <div className={styles.precision}>PRECISION IN MOTION.</div>

          <div className={styles.card}>
            <a href="/" aria-label="SCENOVA home">
              <ScenovaBrand className={styles.cardBrand} />
            </a>

            <div className={styles.cardEyebrow}>{register ? "CREATE ACCOUNT" : "SECURE ACCESS"}</div>
            <h2>{register ? "Create Your Account" : "Welcome Back"}</h2>
            <p className={styles.subtitle}>
              {register
                ? "Create your SCENOVA account, then connect MT5 and request access to your trading workspace."
                : "Log in to your Control Center to manage your MT5 and automation systems."}
            </p>

            {register && (
              <div className={styles.registerSteps}>
                <span className={styles.active}>1 · Account</span>
                <span>2 · Connect MT5</span>
                <span>3 · Access</span>
              </div>
            )}

            <form className={styles.form} onSubmit={submit}>
              <div className={styles.field}>
                <label htmlFor="scenova-email">Email Address</label>
                <div className={styles.inputWrap}>
                  <span className={styles.inputIcon}><ScenovaIcon name="account" size={18} /></span>
                  <input
                    id="scenova-email"
                    className={styles.input}
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="scenova-password">Password</label>
                <div className={styles.inputWrap}>
                  <span className={styles.inputIcon}><ScenovaIcon name="shield" size={18} /></span>
                  <input
                    id="scenova-password"
                    className={styles.input}
                    type={showPassword ? "text" : "password"}
                    minLength={8}
                    autoComplete={register ? "new-password" : "current-password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={register ? "At least 8 characters" : "Enter your password"}
                    required
                  />
                  <button
                    className={styles.visibility}
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    <span className={`${styles.eyeIcon} ${showPassword ? styles.eyeOpen : ""}`} aria-hidden="true" />
                  </button>
                </div>
              </div>

              {!register && (
                <div className={styles.formOptions}>
                  <label className={styles.remember}>
                    <input type="checkbox" checked={rememberEmail} onChange={e => setRememberEmail(e.target.checked)} />
                    Remember me
                  </label>
                  <button className={styles.textAction} type="button" onClick={showPasswordRecovery}>Forgot password?</button>
                </div>
              )}

              {message && <p className={`${styles.message} ${messageKind === "info" ? styles.messageInfo : ""}`}>{message}</p>}

              <button className={styles.primary} disabled={busy}>
                {busy ? "Please wait..." : register ? "Create Account  →" : "Sign In  →"}
              </button>

              <div className={styles.divider}>or</div>

              <button className={styles.secondary} type="button" onClick={switchMode}>
                {register ? "Already have an account? Sign In" : "Create Account"}
              </button>

              <a className={styles.back} href="/">←&nbsp;&nbsp; Back to Home</a>
            </form>

            <div className={styles.trustGrid}>
              <div className={styles.trustItem}>
                <span className={styles.trustIcon}><ScenovaIcon name="shield" size={17} /></span>
                <div><b>Encrypted<br />session</b><small>Your data stays safe</small></div>
              </div>
              <div className={styles.trustItem}>
                <span className={styles.trustIcon}><ScenovaIcon name="spark" size={17} /></span>
                <div><b>Fast access<br />to MT5 & EA dashboard</b><small>Get started in seconds</small></div>
              </div>
              <div className={styles.trustItem}>
                <span className={styles.trustIcon}><ScenovaIcon name="cloud" size={17} /></span>
                <div><b>Cloud + Local<br />ready</b><small>Trade anywhere</small></div>
              </div>
            </div>
          </div>

          <div className={styles.securityLine}>
            <ScenovaIcon name="shield" size={17} />
            <div>
              <span>Protected by SCENOVA secure authentication</span>
              <small>YOUR DATA. OUR PRIORITY.</small>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
