"use client";

import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { ScenovaIcon } from "../../../components/ScenovaIcon";
import styles from "../page.module.css";

type Wallet = {
  currency: string;
  pendingMinor: number;
  availableMinor: number;
  paidMinor: number;
  entryCount: number;
};

type RebateItem = {
  id: string;
  rebatePercent: number;
  rebateAmountMinor: number;
  currency: string;
  status: string;
  externalEventId: string;
  symbol: string | null;
  volumeLots: number | null;
  grossCommissionMinor: number;
  occurredAt: string;
};

type RebateSummary = {
  partner: {
    status: string;
    verified: boolean;
    benefit: null | {
      levelCode: string;
      levelName: string;
      discountPercent: number;
    };
  };
  wallets: Wallet[];
  recent: RebateItem[];
};

function money(minor: number, currency: string) {
  const value = Number(minor || 0) / 100;
  try {
    return new Intl.NumberFormat("th-TH", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  } catch {
    return value.toLocaleString("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + " " + currency;
  }
}

function statusLabel(status: string) {
  const value = String(status || "").toUpperCase();
  if (value === "PENDING") return "Pending";
  if (value === "AVAILABLE") return "Available";
  if (value === "PAID") return "Paid";
  if (value === "REVERSED") return "Reversed";
  return status || "—";
}

function dateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })
    : "—";
}

export function RebatePanel() {
  const [data, setData] = useState<RebateSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api("/brokers/exness/rebates")
      .then(result => {
        if (active) setData(result);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : "โหลด Rebate ไม่สำเร็จ");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <section className={styles.rebatePanel}>
        <div className={styles.rebatePanelHead}>
          <div>
            <span className={styles.eyebrow}>EXNESS REBATE</span>
            <h2>Rebate</h2>
          </div>
        </div>
        <div className={styles.rebateUnavailable}>
          ระบบ Rebate ใช้งานไม่ได้ชั่วคราว · Trading Bot และสิทธิ์สมาชิกเดิมไม่กระทบ
        </div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className={styles.rebatePanel}>
        <div className={styles.rebateLoading}>กำลังโหลด Rebate...</div>
      </section>
    );
  }

  const verified = Boolean(data.partner?.verified);

  return (
    <section className={styles.rebatePanel}>
      <div className={styles.rebatePanelHead}>
        <div>
          <span className={styles.eyebrow}>EXNESS REBATE · PHASE 3</span>
          <h2>Commission & Rebate</h2>
          <p>
            Rebate คำนวณจาก Commission ที่ยืนยันแล้วเท่านั้น
            และแยกจาก Invite & Earn Wallet โดยสิ้นเชิง
          </p>
        </div>
        <span className={verified ? styles.rebateVerified : styles.rebateNotVerified}>
          <i/>
          {verified ? "Partner Verified" : "Partner Not Verified"}
        </span>
      </div>

      {!verified ? (
        <div className={styles.rebateUnavailable}>
          ต้องได้รับการยืนยัน Exness Partner ก่อน จึงจะมีสิทธิ์ Rebate
          แต่ยังใช้ SCENOVA Bot ได้ตามสมาชิกเดิม
        </div>
      ) : data.wallets.length === 0 ? (
        <div className={styles.rebateEmpty}>
          <ScenovaIcon name="wallet" size={22}/>
          <div>
            <b>ยังไม่มีรายการ Rebate</b>
            <span>ยอดจะปรากฏเมื่อ Owner/Admin บันทึก Commission ที่ Exness ยืนยันแล้ว</span>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.rebateWalletGrid}>
            {data.wallets.map(wallet => (
              <div key={wallet.currency} className={styles.rebateWalletCard}>
                <span>{wallet.currency}</span>
                <div>
                  <small>Pending</small>
                  <b>{money(wallet.pendingMinor, wallet.currency)}</b>
                </div>
                <div>
                  <small>Available</small>
                  <b>{money(wallet.availableMinor, wallet.currency)}</b>
                </div>
                <div>
                  <small>Paid</small>
                  <b>{money(wallet.paidMinor, wallet.currency)}</b>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.rebateHistory}>
            <div className={styles.rebateHistoryHead}>
              <b>ประวัติ Rebate</b>
              <span>ล่าสุด {data.recent.length} รายการ</span>
            </div>
            {data.recent.length ? data.recent.map(item => (
              <div key={item.id} className={styles.rebateHistoryRow}>
                <div>
                  <b>{item.symbol || "Exness Commission"}</b>
                  <span>{dateTime(item.occurredAt)} · {item.externalEventId}</span>
                </div>
                <div>
                  <small>IB Commission</small>
                  <b>{money(item.grossCommissionMinor, item.currency)}</b>
                </div>
                <div>
                  <small>Rebate {item.rebatePercent}%</small>
                  <b>{money(item.rebateAmountMinor, item.currency)}</b>
                </div>
                <span className={styles.rebateStatus}>{statusLabel(item.status)}</span>
              </div>
            )) : (
              <div className={styles.rebateEmptyText}>ยังไม่มีประวัติ</div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
