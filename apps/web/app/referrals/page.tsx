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
  wallet: {
    currency: string;
    pendingSatang: number;
    availableSatang: number;
    paidSatang: number;
    currentBalanceSatang: number;
    lifetimeSatang: number;
    entryCount: number;
    ledgerVerified: boolean;
    withdrawalEnabled: boolean;
    recent: Array<{
      id: string;
      event_type: string;
      pending_delta_satang: number;
      available_delta_satang: number;
      paid_delta_satang: number;
      currency: string;
      source_type: string;
      level: number;
      rate_bps: number;
      created_at: string;
      commission_status: string;
      available_at: string;
      commission_amount_satang: number;
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

function ledgerAmount(entry: ReferralData["wallet"]["recent"][number]) {
  const values = [
    Number(entry.pending_delta_satang || 0),
    Number(entry.available_delta_satang || 0),
    Number(entry.paid_delta_satang || 0)
  ];
  const positive = values.find(value => value > 0);
  return positive || Math.abs(values.find(value => value < 0) || 0);
}

function ledgerLabel(eventType: string) {
  if (eventType === "COMMISSION_EARN") return "Commission earned";
  if (eventType === "COMMISSION_RELEASE") return "Released to available";
  if (eventType === "COMMISSION_PAID") return "Marked paid";
  if (eventType === "COMMISSION_VOID") return "Voided";
  if (eventType === "MIGRATION_SNAPSHOT") return "Wallet opening balance";
  return eventType.replace(/_/g, " ");
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

        <section className={styles.walletCard}>
          <div className={styles.walletHead}>
            <div>
              <span className={styles.eyebrow}>COMMISSION WALLET · PHASE 1</span>
              <h2>Commission Wallet</h2>
              <p>ยอดทุกบาทมาจากรายการ Ledger ที่ตรวจสอบย้อนหลังได้ ไม่มีการแก้ Balance ตรง ๆ</p>
            </div>
            <span className={data.wallet.ledgerVerified ? styles.verified : styles.review}>
              <i/> {data.wallet.ledgerVerified ? "LEDGER VERIFIED" : "REVIEW REQUIRED"}
            </span>
          </div>

          <div className={styles.walletBalances}>
            <article>
              <small>Current Wallet</small>
              <b>{money(data.wallet.currentBalanceSatang)}</b>
              <span>Pending + Available</span>
            </article>
            <article>
              <small>Pending</small>
              <b>{money(data.wallet.pendingSatang)}</b>
              <span>รอครบ {data.program.holdDays} วัน</span>
            </article>
            <article>
              <small>Available</small>
              <b>{money(data.wallet.availableSatang)}</b>
              <span>พร้อมสำหรับระบบถอนใน Phase 2</span>
            </article>
            <article>
              <small>Lifetime</small>
              <b>{money(data.wallet.lifetimeSatang)}</b>
              <span>{data.wallet.entryCount} ledger entries</span>
            </article>
          </div>

          <div className={styles.walletStatus}>
            <div>
              <ScenovaIcon name="wallet" size={17}/>
              <span><b>Withdrawal ยังไม่เปิดใน Phase 1</b><small>เฟสนี้เก็บยอดและประวัติเท่านั้น จึงยังไม่มีเส้นทางถอนเงินออกจากระบบ</small></span>
            </div>
            <span className={styles.phaseChip}>CORE WALLET ACTIVE</span>
          </div>

          <div className={styles.ledgerHead}>
            <div>
              <span className={styles.eyebrow}>IMMUTABLE LEDGER</span>
              <h3>รายการล่าสุด</h3>
            </div>
            <span>{data.wallet.recent.length} recent events</span>
          </div>

          <div className={styles.ledgerList}>
            {data.wallet.recent.map(entry => (
              <div className={styles.ledgerRow} key={entry.id}>
                <div className={styles.ledgerEvent}>
                  <span className={
                    entry.event_type === "COMMISSION_RELEASE"
                      ? styles.releaseDot
                      : entry.event_type === "COMMISSION_VOID"
                        ? styles.voidDot
                        : styles.earnDot
                  }/>
                  <div>
                    <b>{ledgerLabel(entry.event_type)}</b>
                    <small>{new Date(entry.created_at).toLocaleString("th-TH")}</small>
                  </div>
                </div>
                <div>
                  <span>Level {entry.level} · {Number(entry.rate_bps || 0) / 100}%</span>
                  <small>จาก {entry.source_user_code || "—"} · {entry.source_type}</small>
                </div>
                <div>
                  <b>{money(ledgerAmount(entry))}</b>
                  <small>{entry.commission_status}</small>
                </div>
              </div>
            ))}
            {!data.wallet.recent.length && (
              <div className={styles.ledgerEmpty}>ยังไม่มี Commission Ledger</div>
            )}
          </div>
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
