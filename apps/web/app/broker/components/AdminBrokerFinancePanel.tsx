"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { adminApi } from "../../../lib/api";
import styles from "../page.module.css";

type Policy = {
  levelCode: string;
  levelName: string;
  discountPercent: number;
  rebateBps: number;
  rebatePercent: number;
  active: boolean;
};

type Client = {
  partnerClientId: string;
  userId: string;
  userCode: string;
  email: string;
  benefitLevel: string | null;
  discountPercent: number;
  rebatePercent: number;
};

type FinanceEvent = {
  id: string;
  externalEventId: string;
  symbol: string | null;
  volumeLots: number | null;
  grossCommissionMinor: number;
  currency: string;
  status: string;
  occurredAt: string;
  userCode: string;
  email: string;
  benefitLevel: string | null;
  rebateEntryId: string | null;
  rebatePercent: number;
  rebateAmountMinor: number;
  rebateStatus: string | null;
  payoutReference: string | null;
};

type FinanceData = {
  policies: Policy[];
  clients: Client[];
  events: FinanceEvent[];
  totals: Array<{
    currency: string;
    confirmedCommissionMinor: number;
    activeRebateMinor: number;
    paidRebateMinor: number;
    commissionCount: number;
  }>;
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

function localDateTimeInput(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0,16);
}

export function AdminBrokerFinancePanel() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [policyDrafts, setPolicyDrafts] = useState<Record<string,string>>({});
  const [commission, setCommission] = useState({
    partnerClientId: "",
    externalEventId: "",
    symbol: "",
    volumeLots: "",
    grossAmount: "",
    currency: "USD",
    occurredAt: localDateTimeInput(),
    rawReference: ""
  });
  const [payoutReference, setPayoutReference] = useState<Record<string,string>>({});

  const verifiedClients = useMemo(() => data?.clients || [], [data]);

  async function load(nextQuery = query) {
    const result = await adminApi(
      "/admin/brokers/exness/finance?q=" + encodeURIComponent(nextQuery.trim())
    );
    setData(result);
    const drafts: Record<string,string> = {};
    for (const policy of result?.policies || []) {
      drafts[policy.levelCode] = String(policy.rebatePercent ?? 0);
    }
    setPolicyDrafts(drafts);
    if (!commission.partnerClientId && result?.clients?.[0]?.partnerClientId) {
      setCommission(current => ({
        ...current,
        partnerClientId: String(result.clients[0].partnerClientId)
      }));
    }
  }

  useEffect(() => {
    void load("").catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "โหลด Broker Finance ไม่สำเร็จ");
    });
  }, []);

  async function search(event: FormEvent) {
    event.preventDefault();
    setBusy("search");
    setError("");
    try {
      await load(query);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "ค้นหาไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  async function savePolicy(policy: Policy) {
    const percent = Number(policyDrafts[policy.levelCode] || 0);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setError("Rebate ต้องอยู่ระหว่าง 0-100%");
      return;
    }
    setBusy("policy-" + policy.levelCode);
    setError("");
    setMessage("");
    try {
      await adminApi(
        "/admin/brokers/exness/finance/rebate-policies/" + encodeURIComponent(policy.levelCode),
        {
          method: "PUT",
          body: JSON.stringify({
            rebateBps: Math.round(percent * 100),
            active: true
          })
        }
      );
      await load(query);
      setMessage("บันทึก Rebate Policy แล้ว");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "บันทึก Rebate Policy ไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  async function recordCommission(event: FormEvent) {
    event.preventDefault();
    const grossCommissionMinor = Math.round(Number(commission.grossAmount || 0) * 100);
    if (!commission.partnerClientId) {
      setError("กรุณาเลือก Partner Client");
      return;
    }
    if (!Number.isFinite(grossCommissionMinor) || grossCommissionMinor <= 0) {
      setError("Commission amount ไม่ถูกต้อง");
      return;
    }

    setBusy("commission");
    setError("");
    setMessage("");
    try {
      await adminApi("/admin/brokers/exness/finance/commissions", {
        method: "POST",
        body: JSON.stringify({
          partnerClientId: commission.partnerClientId,
          externalEventId: commission.externalEventId,
          symbol: commission.symbol || undefined,
          volumeLots: commission.volumeLots ? Number(commission.volumeLots) : undefined,
          grossCommissionMinor,
          currency: commission.currency.toUpperCase(),
          occurredAt: new Date(commission.occurredAt).toISOString(),
          rawReference: commission.rawReference || undefined
        })
      });
      setCommission(current => ({
        ...current,
        externalEventId: "",
        symbol: "",
        volumeLots: "",
        grossAmount: "",
        occurredAt: localDateTimeInput(),
        rawReference: ""
      }));
      await load(query);
      setMessage("บันทึก Confirmed Commission และคำนวณ Rebate แล้ว");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "บันทึก Commission ไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  async function releaseRebate(id: string) {
    setBusy("rebate-" + id);
    setError("");
    setMessage("");
    try {
      await adminApi("/admin/brokers/exness/finance/rebates/" + id + "/release", {
        method: "POST"
      });
      await load(query);
      setMessage("ย้าย Rebate เป็น Available แล้ว");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "ปล่อย Rebate ไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  async function markPaid(id: string) {
    const reference = String(payoutReference[id] || "").trim();
    if (reference.length < 3) {
      setError("กรุณาใส่ Payout Reference ก่อน Mark Paid");
      return;
    }
    setBusy("rebate-" + id);
    setError("");
    setMessage("");
    try {
      await adminApi("/admin/brokers/exness/finance/rebates/" + id + "/paid", {
        method: "POST",
        body: JSON.stringify({ payoutReference: reference })
      });
      setPayoutReference(current => ({ ...current, [id]: "" }));
      await load(query);
      setMessage("บันทึก Rebate เป็น Paid แล้ว");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Mark Paid ไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  async function reverseCommission(id: string) {
    const reason = window.prompt("เหตุผลที่ Reverse Commission");
    if (!reason) return;

    setBusy("commission-" + id);
    setError("");
    setMessage("");
    try {
      await adminApi("/admin/brokers/exness/finance/commissions/" + id + "/reverse", {
        method: "POST",
        body: JSON.stringify({ reason })
      });
      await load(query);
      setMessage("Reverse Commission แล้ว");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Reverse Commission ไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className={styles.adminPanel}>
      <div className={styles.adminHead}>
        <div>
          <span className={styles.eyebrow}>PHASE 3 · BROKER FINANCE</span>
          <h2>Commission & Rebate</h2>
          <p>
            บันทึกเฉพาะ Commission ที่ยืนยันแล้ว · Rebate แยก Ledger จาก Invite & Earn
          </p>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {message && <div className={styles.success}>{message}</div>}

      {!data ? (
        <div className={styles.rebateLoading}>กำลังโหลด Broker Finance...</div>
      ) : (
        <>
          <div className={styles.financeTotals}>
            {data.totals.length ? data.totals.map(total => (
              <div key={total.currency}>
                <span>{total.currency}</span>
                <small>Confirmed IB</small>
                <b>{money(total.confirmedCommissionMinor, total.currency)}</b>
                <small>Rebate</small>
                <strong>{money(total.activeRebateMinor, total.currency)}</strong>
              </div>
            )) : (
              <div>
                <span>NO DATA</span>
                <small>Confirmed IB</small>
                <b>—</b>
                <small>Rebate</small>
                <strong>—</strong>
              </div>
            )}
          </div>

          <div className={styles.financeSection}>
            <div className={styles.financeSectionHead}>
              <div>
                <b>Rebate Policy</b>
                <span>กำหนดแยกจากส่วนลด SCENOVA 10/20/30%</span>
              </div>
            </div>
            <div className={styles.policyGrid}>
              {data.policies.map(policy => (
                <div key={policy.levelCode} className={styles.policyCard}>
                  <div>
                    <b>{policy.levelCode}</b>
                    <span>SCENOVA Discount {policy.discountPercent}%</span>
                  </div>
                  <label>
                    <span>Rebate %</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={policyDrafts[policy.levelCode] ?? String(policy.rebatePercent)}
                      onChange={event => setPolicyDrafts(current => ({
                        ...current,
                        [policy.levelCode]: event.target.value
                      }))}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy === "policy-" + policy.levelCode}
                    onClick={() => void savePolicy(policy)}
                  >
                    {busy === "policy-" + policy.levelCode ? "กำลังบันทึก..." : "บันทึก"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.financeSection}>
            <div className={styles.financeSectionHead}>
              <div>
                <b>Record Confirmed Commission</b>
                <span>Phase 3 เป็น Manual ก่อนเชื่อม Exness API ใน Phase 4</span>
              </div>
            </div>

            <form className={styles.commissionForm} onSubmit={recordCommission}>
              <label>
                <span>Partner Client</span>
                <select
                  value={commission.partnerClientId}
                  onChange={event => setCommission(current => ({
                    ...current,
                    partnerClientId: event.target.value
                  }))}
                >
                  <option value="">เลือกลูกค้า</option>
                  {verifiedClients.map(client => (
                    <option key={client.partnerClientId} value={client.partnerClientId}>
                      {client.userCode} · {client.email} · {client.benefitLevel || "—"} · Rebate {client.rebatePercent}%
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>External Event ID</span>
                <input
                  value={commission.externalEventId}
                  onChange={event => setCommission(current => ({ ...current, externalEventId: event.target.value }))}
                  placeholder="Exness report / unique reference"
                  required
                />
              </label>

              <label>
                <span>Commission Amount</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={commission.grossAmount}
                  onChange={event => setCommission(current => ({ ...current, grossAmount: event.target.value }))}
                  placeholder="0.00"
                  required
                />
              </label>

              <label>
                <span>Currency</span>
                <input
                  value={commission.currency}
                  maxLength={8}
                  onChange={event => setCommission(current => ({ ...current, currency: event.target.value.toUpperCase() }))}
                />
              </label>

              <label>
                <span>Symbol</span>
                <input
                  value={commission.symbol}
                  onChange={event => setCommission(current => ({ ...current, symbol: event.target.value.toUpperCase() }))}
                  placeholder="XAUUSD"
                />
              </label>

              <label>
                <span>Volume Lots</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={commission.volumeLots}
                  onChange={event => setCommission(current => ({ ...current, volumeLots: event.target.value }))}
                  placeholder="Optional"
                />
              </label>

              <label>
                <span>Occurred At</span>
                <input
                  type="datetime-local"
                  value={commission.occurredAt}
                  onChange={event => setCommission(current => ({ ...current, occurredAt: event.target.value }))}
                  required
                />
              </label>

              <label>
                <span>Reference / Note</span>
                <input
                  value={commission.rawReference}
                  onChange={event => setCommission(current => ({ ...current, rawReference: event.target.value }))}
                  placeholder="Optional"
                />
              </label>

              <button
                type="submit"
                className={styles.financePrimaryButton}
                disabled={busy === "commission" || !verifiedClients.length}
              >
                {busy === "commission" ? "กำลังบันทึก..." : "บันทึก Confirmed Commission"}
              </button>
            </form>
          </div>

          <div className={styles.financeSection}>
            <div className={styles.financeSectionHead}>
              <div>
                <b>Commission / Rebate Ledger</b>
                <span>Pending → Available → Paid</span>
              </div>
              <form className={styles.financeSearch} onSubmit={search}>
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="User / Email / Event ID"
                />
                <button type="submit" disabled={busy === "search"}>ค้นหา</button>
              </form>
            </div>

            <div className={styles.financeEventList}>
              {data.events.length ? data.events.map(item => (
                <div key={item.id} className={styles.financeEvent}>
                  <div className={styles.financeEventMain}>
                    <b>{item.userCode}</b>
                    <span>{item.externalEventId} · {item.symbol || "Commission"}</span>
                    <small>
                      IB {money(item.grossCommissionMinor, item.currency)}
                      {item.rebateEntryId
                        ? ` · Rebate ${item.rebatePercent}% = ${money(item.rebateAmountMinor, item.currency)}`
                        : " · Rebate 0% / ไม่สร้างรายการ"}
                    </small>
                  </div>

                  <div className={styles.financeEventState}>
                    <span>Commission: {item.status}</span>
                    <b>Rebate: {item.rebateStatus || "NONE"}</b>
                  </div>

                  <div className={styles.financeEventActions}>
                    {item.rebateEntryId && item.rebateStatus === "PENDING" && (
                      <button
                        type="button"
                        disabled={busy === "rebate-" + item.rebateEntryId}
                        onClick={() => void releaseRebate(item.rebateEntryId!)}
                      >
                        Release
                      </button>
                    )}

                    {item.rebateEntryId && item.rebateStatus === "AVAILABLE" && (
                      <>
                        <input
                          value={payoutReference[item.rebateEntryId!] || ""}
                          onChange={event => setPayoutReference(current => ({
                            ...current,
                            [item.rebateEntryId!]: event.target.value
                          }))}
                          placeholder="Payout reference"
                        />
                        <button
                          type="button"
                          disabled={busy === "rebate-" + item.rebateEntryId}
                          onClick={() => void markPaid(item.rebateEntryId!)}
                        >
                          Mark Paid
                        </button>
                      </>
                    )}

                    {item.status === "CONFIRMED" && item.rebateStatus !== "PAID" && (
                      <button
                        type="button"
                        className={styles.financeDangerButton}
                        disabled={busy === "commission-" + item.id}
                        onClick={() => void reverseCommission(item.id)}
                      >
                        Reverse
                      </button>
                    )}
                  </div>
                </div>
              )) : (
                <div className={styles.emptyClients}>ยังไม่มี Commission Event</div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
