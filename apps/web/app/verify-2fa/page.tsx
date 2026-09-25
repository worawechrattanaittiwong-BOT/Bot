"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { API_URL } from "../../lib/api";
import { ScenovaBrand } from "../../components/ScenovaBrand";
import { ScenovaIcon } from "../../components/ScenovaIcon";
import styles from "./verify-2fa.module.css";

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return local.slice(0, Math.min(2, local.length)) + "••••@" + domain;
}

export default function VerifyTwoFactorPage() {
  const [challenge, setChallenge] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const storedChallenge = sessionStorage.getItem("scenova_2fa_challenge") || "";
    const storedEmail = sessionStorage.getItem("scenova_2fa_email") || "";
    if (!storedChallenge) {
      window.location.replace("/login");
      return;
    }
    setChallenge(storedChallenge);
    setEmail(storedEmail);
  }, []);

  const maskedEmail = useMemo(() => maskEmail(email), [email]);
  const codeReady = code.trim().length >= 6;

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!challenge || !codeReady || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(API_URL + "/api/auth/verify-2fa-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge, code: code.trim() })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Unable to verify authentication code");
      if (!data.token) throw new Error("Secure session was not issued. Please sign in again.");

      localStorage.setItem("bot_token", data.token);
      sessionStorage.removeItem("scenova_2fa_challenge");
      sessionStorage.removeItem("scenova_2fa_email");
      window.location.replace("/dashboard?view=overview");
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Unable to verify authentication code");
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    sessionStorage.removeItem("scenova_2fa_challenge");
    sessionStorage.removeItem("scenova_2fa_email");
    window.location.replace("/login");
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a href="/website" aria-label="SCENOVA website"><ScenovaBrand className={styles.brand}/></a>
        <span><ScenovaIcon name="shield" size={16}/> TWO-FACTOR AUTHENTICATION</span>
      </header>

      <section className={styles.shell}>
        <div className={styles.card}>
          <div className={styles.icon}><ScenovaIcon name="shield" size={28}/></div>
          <div className={styles.eyebrow}>SECURE SIGN IN</div>
          <h1>Verify it&apos;s you</h1>
          <p className={styles.lead}>Enter the 6-digit code from your authenticator app for <b>{maskedEmail || "your SCENOVA account"}</b>. You can also use one recovery code.</p>

          <form className={styles.form} onSubmit={verify}>
            <label htmlFor="two-factor-code">Authenticator or Recovery Code</label>
            <input
              id="two-factor-code"
              type="text"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              value={code}
              onChange={event=>setCode(event.target.value.slice(0, 16))}
              placeholder="000000"
              autoFocus
              disabled={busy}
            />
            {message && <div className={styles.error} role="alert">{message}</div>}
            <button type="submit" className={styles.primary} disabled={!codeReady || busy}>{busy ? "Verifying..." : "Verify & Sign In"}<span>→</span></button>
          </form>

          <div className={styles.help}><ScenovaIcon name="info" size={16}/><span>Lost access to your authenticator? Use one of the recovery codes saved when you enabled 2FA.</span></div>
          <button type="button" className={styles.cancel} onClick={cancel} disabled={busy}>← Back to Sign In</button>
        </div>
      </section>
    </main>
  );
}
