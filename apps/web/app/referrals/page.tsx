"use client";

import Link from "next/link";
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
  user: { userCode: string; role: string; referralCode: string };
  program: {
    maximumNetworkRatePercent: number;
    holdDays: number;
  };
  network: {
    directInvites: number;
    total: number;
    byLevel: Array<{ level: number; ratePercent: number; count: number }>;
  };
  earnings: {
    pendingSatang: number;
    availableSatang: number;
    paidSatang: number;
  };
};

function money(satang: number) {
  return (Number(satang || 0) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + " THB";
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
        setMessage(error instanceof Error ? error.message : "Unable to load Invite & Earn");
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
    return (
      <main className={styles.loading}>
        <div>
          <ScenovaIcon name="users" size={24}/>
          <b>Loading Invite & Earn</b>
          <span>Preparing your invite link and rewards...</span>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className={styles.loading}>
        <div>
          <ScenovaIcon name="info" size={24}/>
          <b>Invite & Earn unavailable</b>
          <span>{message || "Please sign in again."}</span>
        </div>
      </main>
    );
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
          <div className={styles.headerIcon}><ScenovaIcon name="users" size={24}/></div>
          <div className={styles.headerCopy}>
            <div className={styles.eyebrow}>SCENOVA REFERRAL NETWORK</div>
            <h1>Invite & Earn</h1>
            <p>Share your invite link and earn rewards from eligible paid purchases in your network.</p>
          </div>
          <div className={styles.headerActions}>
            <span className={styles.maxRate}>UP TO {data.program.maximumNetworkRatePercent}%</span>
            <Link className={styles.detailsButton} href="/referrals/details">
              View Details <span>→</span>
            </Link>
          </div>
        </header>

        {message && (
          <div className={styles.notice}>
            <ScenovaIcon name="info" size={16}/>
            <span>{message}</span>
          </div>
        )}

        <section className={styles.inviteCard}>
          <div className={styles.inviteIntro}>
            <span className={styles.eyebrow}>YOUR INVITE LINK</span>
            <h2>Invite people to SCENOVA</h2>
            <p>Share your personal code or link. New members who register through it become part of your referral network.</p>
          </div>

          <div className={styles.inviteActions}>
            <div className={styles.codeBox}>
              <div><small>Invite Code</small><b>{data.user.referralCode}</b></div>
              <button type="button" onClick={()=>copy(data.user.referralCode,"Invite code copied.")}>
                <ScenovaIcon name="copy" size={16}/> Copy
              </button>
            </div>
            <div className={styles.linkBox}>
              <span>{inviteLink}</span>
              <button type="button" onClick={()=>copy(inviteLink,"Invite link copied.")}>
                <ScenovaIcon name="copy" size={16}/> Copy Link
              </button>
            </div>
          </div>
        </section>

        <section className={styles.sectionBlock}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.eyebrow}>REWARD LEVELS</span>
              <h2>Earn from up to 4 levels</h2>
            </div>
            <Link href="/referrals/details">How it works →</Link>
          </div>

          <div className={styles.levelGrid}>
            {data.network.byLevel.map(level => (
              <article key={level.level} className={styles.levelCard}>
                <span>LEVEL {level.level}</span>
                <b>{level.ratePercent}%</b>
                <small>
                  {level.level === 1
                    ? "Direct invite"
                    : level.level === 2
                      ? "Your Level 1's invite"
                      : level.level === 3
                        ? "Your Level 2's invite"
                        : "Your Level 3's invite"}
                </small>
                <em>{level.count} member{level.count === 1 ? "" : "s"}</em>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.summaryGrid}>
          <article>
            <span>Direct Invites</span>
            <b>{data.network.directInvites}</b>
            <small>{data.network.total} members across 4 levels</small>
          </article>
          <article>
            <span>Pending</span>
            <b>{money(data.earnings.pendingSatang)}</b>
            <small>{data.program.holdDays}-day review period</small>
          </article>
          <article>
            <span>Available</span>
            <b>{money(data.earnings.availableSatang)}</b>
            <small>Ready for payout</small>
          </article>
          <article>
            <span>Paid</span>
            <b>{money(data.earnings.paidSatang)}</b>
            <small>Rewards already paid</small>
          </article>
        </section>

        <section className={styles.learnCard}>
          <div className={styles.learnIcon}><ScenovaIcon name="book" size={22}/></div>
          <div>
            <h2>Want to understand the full flow?</h2>
            <p>See the 4-level pyramid, a 1,000 THB example, and how commissions are shared when your network grows.</p>
          </div>
          <Link className={styles.detailsButton} href="/referrals/details">
            View Details <span>→</span>
          </Link>
        </section>
      </main>
    </div>
  );
}
