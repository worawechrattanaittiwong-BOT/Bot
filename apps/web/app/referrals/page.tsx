"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import {
  CustomerMobileNav,
  CustomerSidebar,
  OwnerMobileNav,
  OwnerSidebar
} from "../../components/OwnerSidebar";
import { ScenovaIcon } from "../../components/ScenovaIcon";
import { useSystemPopup } from "../../components/SystemPopupProvider";
import styles from "./referrals.module.css";

type WithdrawalRecord = {
  id: string;
  amount_satang: number;
  currency: string;
  status: string;
  review_reason: string | null;
  created_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  paid_at: string | null;
  payout_reference: string | null;
  bank_code: string;
  bank_name: string;
  account_name: string;
  account_last4: string;
};

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
    lockedSatang: number;
    paidSatang: number;
    currentBalanceSatang: number;
    lifetimeSatang: number;
    entryCount: number;
    ledgerVerified: boolean;
    withdrawalEnabled: boolean;
    withdrawal: {
      settings: {
        requestsEnabled: boolean;
        minAmountSatang: number;
        maxAmountSatang: number;
        destinationCooldownHours: number;
      };
      destination: null | {
        id: string;
        bankCode: string;
        bankName: string;
        accountName: string;
        maskedAccount: string;
        status: string;
        usableAt: string;
        createdAt: string;
      };
      availableDeltaSatang: number;
      lockedSatang: number;
      paidSatang: number;
      conserved: boolean;
      recent: WithdrawalRecord[];
    };
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

const BANKS = [
  ["KBANK","Kasikornbank"],
  ["SCB","Siam Commercial Bank"],
  ["KTB","Krungthai Bank"],
  ["BBL","Bangkok Bank"],
  ["BAY","Bank of Ayudhya / Krungsri"],
  ["TTB","TMBThanachart Bank"],
  ["GSB","Government Savings Bank"],
  ["BAAC","Bank for Agriculture and Agricultural Cooperatives"],
  ["UOB","UOB Thailand"],
  ["CIMB","CIMB Thai"],
  ["KKP","Kiatnakin Phatra Bank"],
  ["TISCO","TISCO Bank"]
] as const;

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
  if (eventType === "COMMISSION_PAID") return "Legacy paid";
  if (eventType === "COMMISSION_VOID") return "Voided";
  if (eventType === "MIGRATION_SNAPSHOT") return "Wallet opening balance";
  return eventType.replace(/_/g, " ");
}

function makeRequestKey() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return "wd-" + Date.now() + "-" + Math.random().toString(36).slice(2, 14);
}

function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("th-TH") : "—";
}

export default function ReferralsPage() {
  const { confirmPopup } = useSystemPopup();
  const [data, setData] = useState<ReferralData | null>(null);
  const [account, setAccount] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingDestination, setSavingDestination] = useState(false);
  const [requestingWithdrawal, setRequestingWithdrawal] = useState(false);
  const [cancellingId, setCancellingId] = useState("");
  const [showDestinationForm, setShowDestinationForm] = useState(false);
  const [withdrawRequestKey, setWithdrawRequestKey] = useState(makeRequestKey);
  const [destinationForm, setDestinationForm] = useState({
    bankCode: "KBANK",
    bankName: "Kasikornbank",
    accountName: "",
    accountNumber: "",
    currentPassword: "",
    twoFactorCode: ""
  });
  const [withdrawForm, setWithdrawForm] = useState({
    amountThb: "",
    currentPassword: "",
    twoFactorCode: ""
  });

  useEffect(() => {
    if (!localStorage.getItem("bot_token")) {
      window.location.replace("/login");
      return;
    }
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [referrals, accountData] = await Promise.all([
        api("/referrals"),
        api("/auth/account")
      ]);
      setData(referrals);
      setAccount(accountData);
      setMessage("");
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Unable to load Invite & Earn");
    } finally {
      setLoading(false);
    }
  }

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
  const twoFactorEnabled = Boolean(account?.security?.twoFactorEnabled);
  const destination = data?.wallet?.withdrawal?.destination || null;
  const settings = data?.wallet?.withdrawal?.settings;
  const destinationReady = Boolean(
    destination &&
    new Date(destination.usableAt).getTime() <= Date.now()
  );
  const openWithdrawal = data?.wallet?.withdrawal?.recent?.find(item =>
    ["REQUESTED","HOLD","APPROVED"].includes(item.status)
  ) || null;

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

  function selectBank(code: string) {
    const bank = BANKS.find(item => item[0] === code);
    setDestinationForm(current => ({
      ...current,
      bankCode: code,
      bankName: bank?.[1] || code
    }));
  }

  async function saveDestination(event: FormEvent) {
    event.preventDefault();
    if (savingDestination) return;
    setSavingDestination(true);
    setMessage("");
    try {
      await api("/commission-wallet/destination", {
        method: "POST",
        body: JSON.stringify(destinationForm)
      });
      setDestinationForm(current => ({
        ...current,
        accountName: "",
        accountNumber: "",
        currentPassword: "",
        twoFactorCode: ""
      }));
      setShowDestinationForm(false);
      setMessage("บันทึกบัญชีรับเงินแล้ว ระบบเริ่ม Cooling Period เพื่อความปลอดภัย");
      await load();
    } catch (error: any) {
      setMessage(String(error?.message || "บันทึกบัญชีรับเงินไม่สำเร็จ"));
    } finally {
      setSavingDestination(false);
    }
  }

  async function requestWithdrawal(event: FormEvent) {
    event.preventDefault();
    if (requestingWithdrawal || !destination) return;
    const amountSatang = Math.round(Number(withdrawForm.amountThb || 0) * 100);
    setRequestingWithdrawal(true);
    setMessage("");
    try {
      await api("/commission-wallet/withdrawals", {
        method: "POST",
        body: JSON.stringify({
          destinationId: destination.id,
          amountSatang,
          clientRequestKey: withdrawRequestKey,
          currentPassword: withdrawForm.currentPassword,
          twoFactorCode: withdrawForm.twoFactorCode
        })
      });
      setWithdrawForm({ amountThb: "", currentPassword: "", twoFactorCode: "" });
      setWithdrawRequestKey(makeRequestKey());
      setMessage("ส่งคำขอถอนแล้ว ยอดถูก Lock และรอ Admin ตรวจสอบ");
      await load();
    } catch (error: any) {
      setMessage(String(error?.message || "ขอถอนเงินไม่สำเร็จ"));
    } finally {
      setRequestingWithdrawal(false);
    }
  }

  async function cancelWithdrawal(item: WithdrawalRecord) {
    const confirmed = await confirmPopup({
      title: "ยกเลิกรายการถอน",
      message: `ยกเลิกรายการ ${money(item.amount_satang)} และคืนยอดเข้า Available?`,
      confirmLabel: "ยกเลิกการถอน",
      cancelLabel: "ไม่ยกเลิก",
      tone: "warning"
    });
    if (!confirmed) return;

    setCancellingId(item.id);
    setMessage("");
    try {
      await api("/commission-wallet/withdrawals/" + item.id + "/cancel", {
        method: "POST"
      });
      setMessage("ยกเลิกรายการถอนแล้ว ยอดถูกคืนเข้า Available");
      await load();
    } catch (error: any) {
      setMessage(String(error?.message || "ยกเลิกรายการไม่สำเร็จ"));
    } finally {
      setCancellingId("");
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
            <b>{money(data.wallet.pendingSatang)}</b>
            <small>{data.program.holdDays}-day review period</small>
          </article>
          <article>
            <span>Available</span>
            <b>{money(data.wallet.availableSatang)}</b>
            <small>ถอนได้เมื่อผ่านเงื่อนไข</small>
          </article>
          <article>
            <span>Withdrawn</span>
            <b>{money(data.wallet.paidSatang)}</b>
            <small>ยอดที่จ่ายออกแล้ว</small>
          </article>
        </section>

        <section className={styles.walletCard}>
          <div className={styles.walletHead}>
            <div>
              <span className={styles.eyebrow}>COMMISSION WALLET · PHASE 2</span>
              <h2>Secure Withdrawal Wallet</h2>
              <p>ยอดทุกบาทตรวจสอบจาก Ledger และยอดถอนจะถูก Lock ก่อน Admin ตรวจเสมอ</p>
            </div>
            <span className={data.wallet.ledgerVerified ? styles.verified : styles.review}>
              <i/> {data.wallet.ledgerVerified ? "LEDGER VERIFIED" : "WITHDRAWAL PAUSED"}
            </span>
          </div>

          <div className={styles.walletBalances}>
            <article>
              <small>Current Wallet</small>
              <b>{money(data.wallet.currentBalanceSatang)}</b>
              <span>Pending + Available + Locked</span>
            </article>
            <article>
              <small>Pending</small>
              <b>{money(data.wallet.pendingSatang)}</b>
              <span>รอครบ {data.program.holdDays} วัน</span>
            </article>
            <article>
              <small>Available</small>
              <b>{money(data.wallet.availableSatang)}</b>
              <span>ยอดที่ขอถอนได้</span>
            </article>
            <article>
              <small>Locked</small>
              <b>{money(data.wallet.lockedSatang)}</b>
              <span>กำลังดำเนินการถอน</span>
            </article>
            <article>
              <small>Withdrawn</small>
              <b>{money(data.wallet.paidSatang)}</b>
              <span>จ่ายออกแล้ว</span>
            </article>
          </div>

          <div className={styles.walletStatus}>
            <div>
              <ScenovaIcon name="wallet" size={17}/>
              <span>
                <b>{data.wallet.withdrawalEnabled ? "Secure Withdrawal เปิดใช้งาน" : "Withdrawal ถูก Pause"}</b>
                <small>Password + 2FA · Cooling Period · Balance Lock · Manual Admin Review</small>
              </span>
            </div>
            <span className={styles.phaseChip}>PHASE 2 ACTIVE</span>
          </div>

          {!twoFactorEnabled && (
            <div className={styles.securityWarning}>
              <ScenovaIcon name="info" size={16}/>
              <span>
                <b>ต้องเปิด Two-Factor Authentication ก่อนถอนเงิน</b>
                <small>ไปที่ My Account เพื่อเปิด Authenticator แล้วกลับมาหน้านี้</small>
              </span>
              <Link href="/account">เปิด 2FA →</Link>
            </div>
          )}

          <div className={styles.withdrawalGrid}>
            <div className={styles.withdrawalPanel}>
              <div className={styles.panelHead}>
                <div>
                  <span className={styles.eyebrow}>PAYOUT DESTINATION</span>
                  <h3>บัญชีรับเงิน</h3>
                </div>
                {destination && (
                  <button type="button" className={styles.textButton} onClick={()=>setShowDestinationForm(value=>!value)}>
                    {showDestinationForm ? "ปิด" : "เปลี่ยนบัญชี"}
                  </button>
                )}
              </div>

              {destination && !showDestinationForm ? (
                <div className={styles.destinationCard}>
                  <div>
                    <b>{destination.bankName}</b>
                    <span>{destination.accountName}</span>
                    <strong>{destination.maskedAccount}</strong>
                  </div>
                  <span className={destinationReady ? styles.readyBadge : styles.coolingBadge}>
                    <i/> {destinationReady ? "READY" : "COOLING"}
                  </span>
                  <small>
                    {destinationReady
                      ? "บัญชีนี้พร้อมรับคำขอถอน"
                      : "ใช้ถอนได้หลัง " + dateTime(destination.usableAt)}
                  </small>
                </div>
              ) : (
                <form className={styles.withdrawForm} onSubmit={saveDestination}>
                  <label>
                    <span>ธนาคาร</span>
                    <select value={destinationForm.bankCode} onChange={event=>selectBank(event.target.value)}>
                      {BANKS.map(bank=><option key={bank[0]} value={bank[0]}>{bank[1]}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>ชื่อบัญชี</span>
                    <input value={destinationForm.accountName} onChange={event=>setDestinationForm(v=>({...v,accountName:event.target.value}))} placeholder="ชื่อเจ้าของบัญชี" required/>
                  </label>
                  <label>
                    <span>เลขบัญชี</span>
                    <input value={destinationForm.accountNumber} onChange={event=>setDestinationForm(v=>({...v,accountNumber:event.target.value}))} placeholder="ตัวเลขเท่านั้น" inputMode="numeric" required/>
                  </label>
                  <label>
                    <span>Current Password</span>
                    <input type="password" value={destinationForm.currentPassword} onChange={event=>setDestinationForm(v=>({...v,currentPassword:event.target.value}))} autoComplete="current-password" required/>
                  </label>
                  <label>
                    <span>2FA Code</span>
                    <input value={destinationForm.twoFactorCode} onChange={event=>setDestinationForm(v=>({...v,twoFactorCode:event.target.value}))} inputMode="numeric" maxLength={6} placeholder="6 digits" required/>
                  </label>
                  <button type="submit" className={styles.primaryAction} disabled={savingDestination || !twoFactorEnabled}>
                    {savingDestination ? "Saving..." : destination ? "ยืนยันบัญชีใหม่" : "บันทึกบัญชีรับเงิน"}
                  </button>
                  <small className={styles.formHint}>
                    การเพิ่มหรือเปลี่ยนบัญชีจะเริ่ม Cooling Period {settings?.destinationCooldownHours || 24} ชั่วโมงใหม่ทุกครั้ง
                  </small>
                </form>
              )}
            </div>

            <div className={styles.withdrawalPanel}>
              <div className={styles.panelHead}>
                <div>
                  <span className={styles.eyebrow}>WITHDRAW</span>
                  <h3>ขอถอนเงิน</h3>
                </div>
                <span className={data.wallet.withdrawalEnabled ? styles.readyBadge : styles.coolingBadge}>
                  <i/> {data.wallet.withdrawalEnabled ? "OPEN" : "PAUSED"}
                </span>
              </div>

              {openWithdrawal ? (
                <div className={styles.openRequest}>
                  <span className={styles.statusBadge}>{openWithdrawal.status}</span>
                  <b>{money(openWithdrawal.amount_satang)}</b>
                  <small>สร้างเมื่อ {dateTime(openWithdrawal.created_at)}</small>
                  <p>ยอดนี้ถูก Lock แล้วและไม่สามารถถูกขอถอนซ้ำได้</p>
                  {openWithdrawal.status === "REQUESTED" && (
                    <button type="button" className={styles.cancelButton} disabled={cancellingId===openWithdrawal.id} onClick={()=>void cancelWithdrawal(openWithdrawal)}>
                      {cancellingId===openWithdrawal.id ? "Cancelling..." : "ยกเลิกรายการและคืนยอด"}
                    </button>
                  )}
                </div>
              ) : (
                <form className={styles.withdrawForm} onSubmit={requestWithdrawal}>
                  <label>
                    <span>จำนวนถอน (THB)</span>
                    <input
                      value={withdrawForm.amountThb}
                      onChange={event=>setWithdrawForm(v=>({...v,amountThb:event.target.value}))}
                      inputMode="decimal"
                      placeholder="0.00"
                      required
                    />
                  </label>
                  <div className={styles.limitLine}>
                    <span>Available {money(data.wallet.availableSatang)}</span>
                    <span>
                      Min {money(settings?.minAmountSatang || 0)} · Max {money(settings?.maxAmountSatang || 0)}
                    </span>
                  </div>
                  <label>
                    <span>Current Password</span>
                    <input type="password" value={withdrawForm.currentPassword} onChange={event=>setWithdrawForm(v=>({...v,currentPassword:event.target.value}))} autoComplete="current-password" required/>
                  </label>
                  <label>
                    <span>2FA Code</span>
                    <input value={withdrawForm.twoFactorCode} onChange={event=>setWithdrawForm(v=>({...v,twoFactorCode:event.target.value}))} inputMode="numeric" maxLength={6} placeholder="6 digits" required/>
                  </label>
                  <button
                    type="submit"
                    className={styles.primaryAction}
                    disabled={
                      requestingWithdrawal ||
                      !twoFactorEnabled ||
                      !data.wallet.withdrawalEnabled ||
                      !data.wallet.ledgerVerified ||
                      !destinationReady
                    }
                  >
                    {requestingWithdrawal ? "Locking balance..." : "ขอถอนและ Lock ยอด"}
                  </button>
                  {!destinationReady && <small className={styles.formHint}>ต้องมีบัญชีรับเงินที่พ้น Cooling Period ก่อน</small>}
                </form>
              )}
            </div>
          </div>

          <div className={styles.ledgerHead}>
            <div>
              <span className={styles.eyebrow}>WITHDRAWAL HISTORY</span>
              <h3>ประวัติการถอน</h3>
            </div>
            <span>{data.wallet.withdrawal.recent.length} recent requests</span>
          </div>

          <div className={styles.withdrawalHistory}>
            {data.wallet.withdrawal.recent.map(item=>(
              <div className={styles.withdrawalRow} key={item.id}>
                <div>
                  <span className={styles.statusBadge}>{item.status}</span>
                  <b>{money(item.amount_satang)}</b>
                </div>
                <div>
                  <span>{item.bank_name}</span>
                  <small>{item.account_name} · ••••{item.account_last4}</small>
                </div>
                <div>
                  <span>{dateTime(item.created_at)}</span>
                  <small>{item.payout_reference ? "Ref: " + item.payout_reference : item.review_reason || "—"}</small>
                </div>
              </div>
            ))}
            {!data.wallet.withdrawal.recent.length && (
              <div className={styles.ledgerEmpty}>ยังไม่มีรายการถอน</div>
            )}
          </div>

          <div className={styles.ledgerHead}>
            <div>
              <span className={styles.eyebrow}>IMMUTABLE COMMISSION LEDGER</span>
              <h3>รายการคอมมิชชั่นล่าสุด</h3>
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
                    <small>{dateTime(entry.created_at)}</small>
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
