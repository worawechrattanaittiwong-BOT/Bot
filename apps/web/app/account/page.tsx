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
      setData(await api("/auth/account"));
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
          <article className={styles.summaryCard}><span>Access</span><b>{accessSummary(data)}</b><small>{data.access.subscription?.expires_at ? `Expires ${formatDate(data.access.subscription.expires_at)}` : "SCENOVA membership status"}</small></article>
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
