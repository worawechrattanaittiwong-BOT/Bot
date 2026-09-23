"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import {
  CustomerMobileNav,
  CustomerSidebar,
  OwnerMobileNav,
  OwnerSidebar
} from "../../components/OwnerSidebar";
import { ScenovaIcon } from "../../components/ScenovaIcon";
import styles from "./referrals.module.css";

type ReferralData = {
  user: { userCode: string; role: string; referralCode: string; joinedAt: string };
  sponsor: { userCode: string; referralCode: string } | null;
  program: {
    levels: Array<{ level: number; rateBps: number; ratePercent: number }>;
    maximumNetworkRatePercent: number;
    holdDays: number;
    payoutMode: string;
    eligibleSourceTypes: string[];
  };
  network: {
    directInvites: number;
    total: number;
    byLevel: Array<{ level: number; ratePercent: number; count: number }>;
    recent: Array<{ id: string; user_code: string; created_at: string; level: number }>;
  };
  earnings: {
    pendingSatang: number;
    availableSatang: number;
    paidSatang: number;
    lifetimeSatang: number;
    commissionCount: number;
    recent: Array<{
      id: string;
      level: number;
      rate_bps: number;
      gross_amount_satang: number;
      commission_amount_satang: number;
      currency: string;
      status: string;
      available_at: string;
      paid_at: string | null;
      created_at: string;
      source_type: string;
      source_user_code: string;
    }>;
  };
};

function money(satang: number) {
  return (Number(satang || 0) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + " THB";
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function ReferralsPage() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [account, setAccount] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem("bot_token")) {
      window.location.replace("/login");
      return;
    }
    Promise.all([api("/referrals"), api("/auth/account")])
      .then(([referrals, accountData]) => {
        setData(referrals);
        setAccount(accountData);
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "Unable to load referral dashboard");
      })
      .finally(() => setLoading(false));
  }, []);

  const inviteLink = useMemo(() => {
    if (!data || typeof window === "undefined") return "";
    return window.location.origin + "/login?mode=register&ref=" +
      encodeURIComponent(data.user.referralCode);
  }, [data]);

  const elevated = ["OWNER", "ADMIN"].includes(
    String(account?.user?.role || data?.user?.role || "").toUpperCase()
  );
  const partnerSummary = account?.access?.partner ? {
    usedSeats: Number(account.access.partner.used_seats || 0),
    seat_limit: Number(account.access.partner.seat_limit || 0),
    status: String(account.access.partner.status || "ACTIVE")
  } : null;

  function logout() {
    localStorage.removeItem("bot_token");
    window.location.replace("/login");
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(label);
    } catch {
      setMessage("Copy failed. Please select and copy the value manually.");
    }
  }

  if (loading) {
    return <main className={styles.loading}><div><ScenovaIcon name="users" size={24}/><b>Loading Invite & Earn</b><span>Preparing your referral network...</span></div></main>;
  }

  if (!data) {
    return <main className={styles.loading}><div><ScenovaIcon name="info" size={24}/><b>Referral dashboard unavailable</b><span>{message || "Please sign in again."}</span></div></main>;
  }

  return (
    <div className="app-wrap">
      {elevated
        ? <OwnerSidebar activeKey="referrals" onLogout={logout} role={account?.user?.role || data.user.role}/>
        : <CustomerSidebar activeKey="referrals" onLogout={logout} userCode={account?.user?.userCode || data.user.userCode} partner={partnerSummary}/>}
      <main className={`main app-main ${styles.main}`}>
        {elevated
          ? <OwnerMobileNav activeKey="referrals"/>
          : <CustomerMobileNav activeKey="referrals" partner={partnerSummary}/>}

        <header className={styles.header}>
          <div className={styles.headerIcon}><ScenovaIcon name="users" size={25}/></div>
          <div>
            <div className={styles.eyebrow}>SCENOVA REFERRAL NETWORK</div>
            <h1>Invite & Earn</h1>
            <p>Share SCENOVA with people you know. Eligible paid purchases can reward up to four referral levels.</p>
          </div>
          <span className={styles.maxRate}>UP TO {data.program.maximumNetworkRatePercent}% NETWORK</span>
        </header>

        {message && <div className={styles.notice}><ScenovaIcon name="info" size={16}/><span>{message}</span></div>}

        <section className={styles.inviteCard}>
          <div>
            <span className={styles.eyebrow}>YOUR INVITE LINK</span>
            <h2>Invite people to SCENOVA</h2>
            <p>Your sponsor relationship is attached when a new account is created with your invite code.</p>
          </div>
          <div className={styles.inviteActions}>
            <div className={styles.codeBox}><small>Invite Code</small><b>{data.user.referralCode}</b><button type="button" onClick={()=>copy(data.user.referralCode,"Invite code copied.")}><ScenovaIcon name="copy" size={16}/> Copy</button></div>
            <div className={styles.linkBox}><span>{inviteLink}</span><button type="button" onClick={()=>copy(inviteLink,"Invite link copied.")}><ScenovaIcon name="copy" size={16}/> Copy Link</button></div>
          </div>
        </section>

        <section className={styles.levelGrid}>
          {data.network.byLevel.map(level => (
            <article key={level.level} className={styles.levelCard}>
              <span>LEVEL {level.level}</span>
              <b>{level.ratePercent}%</b>
              <small>{level.level === 1 ? "Direct invite" : `Level ${level.level} network`}</small>
              <em>{level.count} member{level.count === 1 ? "" : "s"}</em>
            </article>
          ))}
        </section>

        <section className={styles.statsGrid}>
          <article><span>Direct Invites</span><b>{data.network.directInvites}</b><small>Level 1 accounts</small></article>
          <article><span>4-Level Network</span><b>{data.network.total}</b><small>Total linked accounts</small></article>
          <article><span>Pending</span><b>{money(data.earnings.pendingSatang)}</b><small>{data.program.holdDays}-day review hold</small></article>
          <article><span>Available</span><b>{money(data.earnings.availableSatang)}</b><small>Ready for manual payout</small></article>
          <article><span>Paid</span><b>{money(data.earnings.paidSatang)}</b><small>Recorded payouts</small></article>
          <article><span>Lifetime Earnings</span><b>{money(data.earnings.lifetimeSatang)}</b><small>{data.earnings.commissionCount} commission entries</small></article>
        </section>

        <div className={styles.twoColumn}>
          <section className={styles.panel}>
            <div className={styles.panelHead}><div><span className={styles.eyebrow}>NETWORK</span><h2>Recent Members</h2><p>Accounts connected to you across four levels.</p></div><ScenovaIcon name="users" size={20}/></div>
            <div className={styles.list}>
              {data.network.recent.map(member => (
                <div className={styles.row} key={member.id}>
                  <span className={styles.levelPill}>L{member.level}</span>
                  <div><b>{member.user_code}</b><small>Joined {dateLabel(member.created_at)}</small></div>
                  <em>{data.program.levels.find(x=>x.level===member.level)?.ratePercent || 0}%</em>
                </div>
              ))}
              {!data.network.recent.length && <div className={styles.empty}>No invited accounts yet. Share your invite link to start your network.</div>}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}><div><span className={styles.eyebrow}>EARNINGS</span><h2>Commission Activity</h2><p>Commission is calculated from eligible recorded paid amounts.</p></div><ScenovaIcon name="wallet" size={20}/></div>
            <div className={styles.list}>
              {data.earnings.recent.map(entry => (
                <div className={styles.earningRow} key={entry.id}>
                  <span className={styles.levelPill}>L{entry.level}</span>
                  <div><b>+{money(entry.commission_amount_satang)}</b><small>{entry.source_user_code} · {(entry.rate_bps/100).toFixed(0)}% of {money(entry.gross_amount_satang)}</small></div>
                  <div className={styles.earningState}><em data-state={entry.status}>{entry.status}</em><small>{entry.status === "PENDING" ? `Available ${dateLabel(entry.available_at)}` : dateLabel(entry.created_at)}</small></div>
                </div>
              ))}
              {!data.earnings.recent.length && <div className={styles.empty}>No commission activity yet. Commission starts after an eligible paid purchase is recorded.</div>}
            </div>
          </section>
        </div>

        <section className={styles.rules}>
          <div className={styles.ruleIcon}><ScenovaIcon name="shield" size={22}/></div>
          <div>
            <h2>Program Rules</h2>
            <p>The four levels are fixed at <b>7% → 5% → 3% → 1%</b>. The maximum combined network commission is 16% of an eligible sale when all four uplines exist and are active.</p>
            <p>Trial access and Partner Seat allocations do not create referral commission. Cloud checkout is the first eligible automated payment source. Commissions enter a {data.program.holdDays}-day review period before becoming available. Refunds, reversals, duplicate or abusive accounts can be voided before payout.</p>
            <p>The sponsor is locked at account creation. A user cannot refer themselves. Payout remains manual until SCENOVA connects a verified payout workflow.</p>
          </div>
          <div className={styles.sponsorBox}><small>Your Sponsor</small><b>{data.sponsor?.userCode || "Direct / No Sponsor"}</b></div>
        </section>
      </main>
    </div>
  );
}
