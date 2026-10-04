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
import styles from "./fleet-monitor.module.css";

type CurrencyTotal = {
  currency: string;
  accounts: number;
  balance: number;
  equity: number;
  floatingProfit: number;
  todayClosedProfit: number;
  netProfit: number;
  netProfit30d: number;
};

type FleetSlot = {
  slotId: string;
  slotNumber: number;
  slotLabel?: string | null;
  slotMode: string;
  slotType: string;
  slotStatus: string;
  ownerUserCode?: string | null;
  assignedUserCode?: string | null;
  assignedEmail?: string | null;
  subscription: {
    status?: string | null;
    startsAt?: string | null;
    expiresAt?: string | null;
    planCode?: string | null;
    planName?: string | null;
  };
  account: null | {
    id: string;
    userCode?: string | null;
    email?: string | null;
    number?: string | null;
    broker?: string | null;
    server?: string | null;
    mode?: string | null;
    status?: string | null;
  };
  runtime: {
    instanceId?: string | null;
    actualState?: string | null;
    desiredState?: string | null;
    heartbeatOnline: boolean;
    heartbeatAgeSeconds?: number | null;
    runnerOnline: boolean;
    runnerAgeSeconds?: number | null;
    runnerRegion?: string | null;
    runnerHostname?: string | null;
    lastSeenAt?: string | null;
    symbol?: string | null;
    currency: string;
    engineMode?: string | null;
    executionStatus?: string | null;
    marketRegime?: string | null;
    signalConfidence: number;
    spreadPoints: number;
    brokerPingMs: number;
    adaptiveLot: number;
    positions: number;
    pendingOrders: number;
    consecutiveLosses: number;
  };
  money: {
    balance: number;
    equity: number;
    floatingProfit: number;
    todayClosedProfit: number;
    todayNetProfitJournal: number;
    netProfit: number;
    netProfit30d: number;
    grossProfit: number;
    grossLoss: number;
    averageWin: number;
    averageLoss: number;
    derivedStartCapital: number;
    returnPercent: number;
    maxDrawdownMoney: number;
    maxDrawdownPercent: number;
  };
  performance: {
    closedBaskets: number;
    wins: number;
    losses: number;
    winRate: number;
    profitFactor: number;
    todayBaskets: number;
    todayWins: number;
    todayLosses: number;
    baskets30d: number;
    entries: number;
    entriesToday: number;
    totalEntryLots: number;
    latestBasketAt?: string | null;
    latestEntryAt?: string | null;
  };
};

type FleetResponse = {
  user: {
    id: string;
    user_code: string;
    email: string;
    role: string;
    status: string;
  } | null;
  elevated: boolean;
  scope: "ALL_SLOTS" | "OWN_ASSIGNED_SLOTS";
  generatedAt: string;
  period: {
    from?: string | null;
    to?: string | null;
    timezone: string;
  };
  source: {
    live: string;
    performance: string;
    fundingHistory: string;
  };
  summary: {
    totalSlots: number;
    connectedAccounts: number;
    online: number;
    running: number;
    stopped: number;
    offline: number;
    empty: number;
    totalPositions: number;
    totalPendingOrders: number;
    totalClosedBaskets: number;
    totalWins: number;
    winRate: number;
    highestMaxDrawdownPercent: number;
    currencyTotals: CurrencyTotal[];
  };
  slots: FleetSlot[];
};

type StatusFilter = "ALL" | "RUNNING" | "ONLINE" | "STOPPED" | "OFFLINE";
type SortMode = "SLOT" | "BALANCE" | "PROFIT" | "WIN_RATE" | "DRAWDOWN";
type RangeMode = "ALL" | "TODAY" | "7D" | "30D" | "CUSTOM";

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fixed(value: unknown, digits = 2) {
  return num(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function money(value: unknown, currency: string, signed = false) {
  const amount = num(value);
  const sign = signed && amount > 0 ? "+" : "";
  return sign + fixed(amount, 2) + " " + (currency || "USD");
}

function percent(value: unknown, signed = false) {
  const amount = num(value);
  const sign = signed && amount > 0 ? "+" : "";
  return sign + amount.toFixed(2) + "%";
}

function freshness(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || !Number.isFinite(Number(seconds))) return "ยังไม่มี Heartbeat";
  const value = Math.max(0, Math.round(Number(seconds)));
  if (value < 60) return value + " วินาที";
  if (value < 3600) return Math.floor(value / 60) + " นาที";
  return Math.floor(value / 3600) + " ชม.";
}

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

function bangkokLocalNowValue() {
  return new Date(Date.now() + BANGKOK_OFFSET_MS).toISOString().slice(0, 16);
}

function bangkokStartTodayValue() {
  return new Date(Date.now() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10) + "T00:00";
}

function bangkokLocalToIso(value: string) {
  const text = String(value || "").trim();
  if (!text) return "";
  const normalized = text.length === 16 ? text + ":00" : text;
  const parsed = new Date(normalized + "+07:00");
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}

function fleetPeriodQuery(mode: RangeMode, customFrom: string, customTo: string) {
  const params = new URLSearchParams();
  if (mode === "TODAY") {
    params.set("from", bangkokLocalToIso(bangkokStartTodayValue()));
  } else if (mode === "7D") {
    params.set("from", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
  } else if (mode === "30D") {
    params.set("from", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
  } else if (mode === "CUSTOM") {
    const from = bangkokLocalToIso(customFrom);
    const to = bangkokLocalToIso(customTo);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
  }
  const query = params.toString();
  return query ? "?" + query : "";
}

function rangeLabel(mode: RangeMode, customFrom: string, customTo: string) {
  if (mode === "TODAY") return "วันนี้";
  if (mode === "7D") return "7 วันที่ผ่านมา";
  if (mode === "30D") return "30 วันที่ผ่านมา";
  if (mode === "CUSTOM") {
    const from = customFrom ? customFrom.replace("T", " ") : "—";
    const to = customTo ? customTo.replace("T", " ") : "—";
    return from + " → " + to;
  }
  return "ทั้งหมด";
}

function expiryLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    year: "2-digit"
  });
}

function cardStatus(slot: FleetSlot) {
  if (!slot.account) return "EMPTY";
  if (!slot.runtime.heartbeatOnline) return "OFFLINE";
  const actual = String(slot.runtime.actualState || "").toUpperCase();
  if (actual === "RUNNING") return "RUNNING";
  if (actual === "SAFE_STOP") return "SAFE_STOP";
  return actual || "ONLINE";
}

function statusTone(status: string) {
  if (status === "RUNNING" || status === "ONLINE") return "good";
  if (status === "SAFE_STOP" || status === "STOPPED") return "warn";
  if (status === "EMPTY") return "neutral";
  return "bad";
}

function Metric({
  label,
  value,
  tone = ""
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "warn" | "";
}) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <b className={tone ? styles[tone] : ""}>{value}</b>
    </div>
  );
}

export default function FleetMonitorPage() {
  const [data, setData] = useState<FleetResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [modeFilter, setModeFilter] = useState("ALL");
  const [brokerFilter, setBrokerFilter] = useState("ALL");
  const [sortMode, setSortMode] = useState<SortMode>("SLOT");
  const [rangeMode, setRangeMode] = useState<RangeMode>("ALL");
  const [customFrom, setCustomFrom] = useState(() => bangkokStartTodayValue());
  const [customTo, setCustomTo] = useState(() => bangkokLocalNowValue());

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      const next = await api("/fleet-monitor" + fleetPeriodQuery(rangeMode, customFrom, customTo));
      setData(next);
      setError("");
    } catch (e: any) {
      setError(String(e?.message || "โหลด Trading Fleet Monitor ไม่สำเร็จ"));
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true), 15_000);
    return () => window.clearInterval(timer);
  }, [rangeMode, customFrom, customTo]);

  function logout() {
    window.localStorage.removeItem("bot_token");
    window.location.href = "/login";
  }

  const brokers = useMemo(() => {
    const values = new Set(
      (data?.slots || [])
        .map((slot) => String(slot.account?.broker || "").trim())
        .filter(Boolean)
    );
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [data]);

  const visibleSlots = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = (data?.slots || []).filter((slot) => {
      const status = cardStatus(slot);
      const mode = String(slot.account?.mode || slot.slotMode || "").toUpperCase();
      const broker = String(slot.account?.broker || "");
      const haystack = [
        slot.slotNumber,
        slot.slotLabel,
        slot.assignedUserCode,
        slot.assignedEmail,
        slot.account?.userCode,
        slot.account?.email,
        slot.account?.number,
        slot.account?.broker,
        slot.account?.server,
        slot.runtime.symbol,
        slot.runtime.engineMode
      ].join(" ").toLowerCase();

      const statusOk =
        statusFilter === "ALL" ||
        (statusFilter === "ONLINE" && slot.runtime.heartbeatOnline) ||
        (statusFilter === "STOPPED" && slot.runtime.heartbeatOnline && status !== "RUNNING") ||
        status === statusFilter;
      const modeOk = modeFilter === "ALL" || mode === modeFilter;
      const brokerOk = brokerFilter === "ALL" || broker === brokerFilter;
      const searchOk = !query || haystack.includes(query);
      return statusOk && modeOk && brokerOk && searchOk;
    });

    rows.sort((a, b) => {
      if (sortMode === "BALANCE") return num(b.money.balance) - num(a.money.balance);
      if (sortMode === "PROFIT") return num(b.money.netProfit) - num(a.money.netProfit);
      if (sortMode === "WIN_RATE") return num(b.performance.winRate) - num(a.performance.winRate);
      if (sortMode === "DRAWDOWN") return num(b.money.maxDrawdownPercent) - num(a.money.maxDrawdownPercent);
      const userCompare = String(a.account?.userCode || a.assignedUserCode || "")
        .localeCompare(String(b.account?.userCode || b.assignedUserCode || ""));
      return userCompare || num(a.slotNumber) - num(b.slotNumber);
    });
    return rows;
  }, [data, search, statusFilter, modeFilter, brokerFilter, sortMode]);

  if (!data && loading) {
    return (
      <main className={styles.loading}>
        <span className={styles.loadingDot}/>
        กำลังเปิด Trading Fleet Monitor...
      </main>
    );
  }

  if (!data) {
    return <main className={styles.loading}>{error || "ไม่พบข้อมูล Fleet Monitor"}</main>;
  }

  const primaryCurrency = [...data.summary.currencyTotals].sort((a,b)=>b.accounts-a.accounts)[0] || null;
  const selectedRangeLabel = rangeLabel(rangeMode, customFrom, customTo);
  const periodProfitLabel = rangeMode === "ALL" ? "Net P/L" : "P/L ช่วง";

  return (
    <div className={styles.shell}>
      {data.elevated ? (
        <OwnerSidebar
          activeKey="trading-fleet-monitor"
          onLogout={logout}
          role={String(data.user?.role || "OWNER")}
        />
      ) : (
        <CustomerSidebar
          activeKey="trading-fleet-monitor"
          onLogout={logout}
          userCode={data.user?.user_code}
        />
      )}

      <main className={styles.main}>
        <div className={styles.mobileHead}>
          {data.elevated ? (
            <OwnerMobileNav activeKey="trading-fleet-monitor" onLogout={logout}/>
          ) : (
            <CustomerMobileNav activeKey="trading-fleet-monitor" onLogout={logout}/>
          )}
        </div>

        <header className={styles.pageHead}>
          <div>
            <div className={styles.eyebrow}>SCENOVA · REAL-TIME ACCOUNT FLEET</div>
            <h1>Trading Fleet Monitor</h1>
            <p>
              {data.elevated
                ? "เฉพาะบัญชี MT5 ที่ยังเชื่อมอยู่จริงในระบบแบบ Read-only"
                : "เฉพาะบัญชี MT5 ของคุณที่ยังเชื่อมอยู่แบบ Read-only"}
            </p>
          </div>
          <div className={styles.headActions}>
            <span className={styles.scopeBadge}>
              <ScenovaIcon name={data.elevated ? "shield" : "account"} size={15}/>
              {data.elevated ? "ADMIN · ALL SLOTS" : "MY SLOTS ONLY"}
            </span>
            <span className={styles.refreshState}><i/>Auto refresh 15s</span>
            <button type="button" onClick={() => load()} disabled={loading}>
              <ScenovaIcon name="refresh" size={15}/>
              {loading ? "กำลังโหลด..." : "รีเฟรช"}
            </button>
          </div>
        </header>

        {error ? <div className={styles.error}>{error}</div> : null}

        <section className={styles.summaryGrid}>
          <div><span>บัญชีที่เชื่อมต่อ</span><b>{data.summary.connectedAccounts}</b><small>{data.summary.online} Online · {data.summary.offline} Offline</small></div>
          <div><span>กำลัง RUNNING</span><b className={styles.good}>{data.summary.running}</b><small>{data.summary.online} Online</small></div>
          <div><span>Offline</span><b className={styles.bad}>{data.summary.offline}</b><small>{data.summary.stopped} Stopped / Safe Stop</small></div>
          <div><span>Win Rate · {selectedRangeLabel}</span><b>{percent(data.summary.winRate)}</b><small>{data.summary.totalClosedBaskets.toLocaleString("en-US")} baskets</small></div>
          <div><span>Max Drawdown · {selectedRangeLabel}</span><b className={styles.warn}>{percent(data.summary.highestMaxDrawdownPercent)}</b><small>จาก Trade Journal</small></div>
          <div><span>Open Positions · Live</span><b>{data.summary.totalPositions}</b><small>{data.summary.totalPendingOrders} Pending</small></div>
          <div><span>{primaryCurrency ? primaryCurrency.currency + " Balance · Live" : "Balance · Live"}</span><b>{primaryCurrency ? money(primaryCurrency.balance, primaryCurrency.currency) : "—"}</b><small>{data.summary.currencyTotals.length} currency · ไม่รวมข้ามสกุล</small></div>
          <div><span>{primaryCurrency ? primaryCurrency.currency + " P/L · " + selectedRangeLabel : "P/L · " + selectedRangeLabel}</span><b className={num(primaryCurrency?.netProfit) >= 0 ? styles.good : styles.bad}>{primaryCurrency ? money(primaryCurrency.netProfit, primaryCurrency.currency, true) : "—"}</b><small>Trade Journal ตามช่วงที่เลือก</small></div>
        </section>

        <section className={styles.currencyPeriodRow}>
          <div className={styles.currencyStrip}>
            {data.summary.currencyTotals.map((item) => (
              <article key={item.currency}>
                <header><b>{item.currency}</b><span>{item.accounts} บัญชี</span></header>
                <div><span>Balance · Live</span><b>{fixed(item.balance)}</b></div>
                <div><span>Equity · Live</span><b>{fixed(item.equity)}</b></div>
                <div><span>Floating · Live</span><b className={item.floatingProfit >= 0 ? styles.good : styles.bad}>{fixed(item.floatingProfit)}</b></div>
                <div><span>วันนี้</span><b className={item.todayClosedProfit >= 0 ? styles.good : styles.bad}>{fixed(item.todayClosedProfit)}</b></div>
                <div><span>P/L · {selectedRangeLabel}</span><b className={item.netProfit >= 0 ? styles.good : styles.bad}>{fixed(item.netProfit)}</b></div>
              </article>
            ))}
          </div>

          <div className={styles.periodBar}>
            <div className={styles.periodIntro}>
              <ScenovaIcon name="report" size={16}/>
              <span><b>ช่วงเวลาผลงาน</b><small>เวลาไทย (Asia/Bangkok) · ใช้กับ P/L, Win Rate, Baskets, Entries และ Drawdown</small></span>
            </div>
            <select value={rangeMode} onChange={(event) => setRangeMode(event.target.value as RangeMode)}>
              <option value="ALL">ทั้งหมด</option>
              <option value="TODAY">วันนี้</option>
              <option value="7D">7 วันที่ผ่านมา</option>
              <option value="30D">30 วันที่ผ่านมา</option>
              <option value="CUSTOM">กำหนดวัน/เวลาเอง</option>
            </select>
            {rangeMode === "CUSTOM" ? (
              <>
                <label className={styles.dateField}>
                  <span>เริ่ม</span>
                  <input type="datetime-local" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)}/>
                </label>
                <label className={styles.dateField}>
                  <span>สิ้นสุด</span>
                  <input type="datetime-local" value={customTo} onChange={(event) => setCustomTo(event.target.value)}/>
                </label>
              </>
            ) : null}
            <span className={styles.periodApplied}>กำลังแสดง: <b>{selectedRangeLabel}</b></span>
          </div>
        </section>

        <section className={styles.toolbar}>
          <label className={styles.searchBox}>
            <ScenovaIcon name="report" size={15}/>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={data.elevated ? "ค้นหา User / Slot / MT5 / Broker / Server..." : "ค้นหา Slot / MT5 / Broker / Server..."}
            />
          </label>

          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            <option value="ALL">ทุกสถานะ</option>
            <option value="RUNNING">RUNNING</option>
            <option value="ONLINE">ONLINE</option>
            <option value="STOPPED">STOPPED / SAFE STOP</option>
            <option value="OFFLINE">OFFLINE</option>
          </select>

          <select value={modeFilter} onChange={(event) => setModeFilter(event.target.value)}>
            <option value="ALL">ทุก Runtime</option>
            <option value="CLOUD">Cloud / VPS</option>
            <option value="LOCAL">Local MT5</option>
          </select>

          <select value={brokerFilter} onChange={(event) => setBrokerFilter(event.target.value)}>
            <option value="ALL">ทุก Broker</option>
            {brokers.map((broker) => <option key={broker} value={broker}>{broker}</option>)}
          </select>

          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
            <option value="SLOT">เรียงตาม Slot</option>
            <option value="BALANCE">Balance สูง → ต่ำ</option>
            <option value="PROFIT">Net Profit สูง → ต่ำ</option>
            <option value="WIN_RATE">Win Rate สูง → ต่ำ</option>
            <option value="DRAWDOWN">Drawdown สูง → ต่ำ</option>
          </select>

          <span className={styles.resultCount}>แสดง {visibleSlots.length} / {data.slots.length} บัญชีที่เชื่อมต่อ</span>
        </section>

        <section className={styles.cards}>
          {visibleSlots.map((slot) => {
            const status = cardStatus(slot);
            const tone = statusTone(status);
            const currency = slot.runtime.currency || "USD";
            const accountName = slot.account?.userCode || slot.assignedUserCode || "SCENOVA";
            const displayName = slot.slotLabel || "MT5 Account";
            const syncText = freshness(slot.runtime.heartbeatAgeSeconds);
            const stateDetail = slot.runtime.executionStatus || slot.runtime.actualState || slot.slotStatus || "—";
            return (
              <article className={styles.slotCard + " " + styles["tone_" + tone]} key={slot.slotId}>
                <header className={styles.cardHead}>
                  <div className={styles.slotNumber}>{String(slot.slotNumber || 0).padStart(2, "0")}</div>
                  <div className={styles.cardIdentity}>
                    <b>{displayName}</b>
                    <span>{data.elevated ? accountName + " · " : ""}MT5 {slot.account?.number || "—"}</span>
                  </div>
                  <span className={styles.status + " " + styles["status_" + tone]}><i/>{status}</span>
                </header>

                <div className={styles.accountLine}>
                  <span><ScenovaIcon name="cloud" size={13}/>{slot.account?.broker || "No Broker"}</span>
                  <span>{slot.account?.server || "No Server"}</span>
                  <span>{String(slot.account?.mode || slot.slotMode || "—").toUpperCase()}</span>
                </div>

                <div className={styles.primaryMetrics}>
                  <Metric label="Balance" value={money(slot.money.balance, currency)}/>
                  <Metric label="Equity" value={money(slot.money.equity, currency)}/>
                  <Metric label="Floating" value={money(slot.money.floatingProfit, currency, true)} tone={slot.money.floatingProfit >= 0 ? "good" : "bad"}/>
                  <Metric label={periodProfitLabel} value={money(slot.money.netProfit, currency, true)} tone={slot.money.netProfit >= 0 ? "good" : "bad"}/>
                  <Metric label="Today P/L · Live" value={money(slot.money.todayClosedProfit, currency, true)} tone={slot.money.todayClosedProfit >= 0 ? "good" : "bad"}/>
                  <Metric label="Return ช่วง" value={percent(slot.money.returnPercent, true)} tone={slot.money.returnPercent >= 0 ? "good" : "bad"}/>
                </div>

                <div className={styles.statGrid}>
                  <Metric label="Win Rate" value={percent(slot.performance.winRate)} tone={slot.performance.winRate >= 60 ? "good" : slot.performance.closedBaskets ? "warn" : ""}/>
                  <Metric label="Profit Factor" value={slot.performance.profitFactor >= 999 ? "∞" : fixed(slot.performance.profitFactor, 2)} tone={slot.performance.profitFactor >= 1.2 ? "good" : slot.performance.closedBaskets ? "warn" : ""}/>
                  <Metric label="Max DD" value={percent(slot.money.maxDrawdownPercent)} tone={slot.money.maxDrawdownPercent >= 10 ? "bad" : slot.money.maxDrawdownPercent >= 6 ? "warn" : ""}/>
                  <Metric label="Baskets ช่วง" value={slot.performance.closedBaskets.toLocaleString("en-US")}/>
                  <Metric label="W / L ช่วง" value={slot.performance.wins + " / " + slot.performance.losses}/>
                  <Metric label="Entries ช่วง" value={slot.performance.entries.toLocaleString("en-US")}/>
                  <Metric label="Positions" value={String(slot.runtime.positions)} tone={slot.runtime.positions > 0 ? "warn" : ""}/>
                  <Metric label="Pending" value={String(slot.runtime.pendingOrders)} tone={slot.runtime.pendingOrders > 0 ? "warn" : ""}/>
                  <Metric label="Total Lots ช่วง" value={fixed(slot.performance.totalEntryLots, 2)}/>
                  <Metric label="Signal" value={fixed(slot.runtime.signalConfidence, 0) + "%"}/>
                  <Metric label="Spread" value={fixed(slot.runtime.spreadPoints, 1) + " pt"}/>
                  <Metric label="Ping" value={fixed(slot.runtime.brokerPingMs, 0) + " ms"}/>
                </div>

                <footer className={styles.cardFoot}>
                  <div>
                    <span>{slot.runtime.symbol || "No Symbol"}</span>
                    <b>{String(slot.runtime.engineMode || "—").replace(/_/g, " ")}</b>
                  </div>
                  <div>
                    <span>EA / Runtime</span>
                    <b>{stateDetail}</b>
                  </div>
                  <div>
                    <span>Sync</span>
                    <b className={slot.runtime.heartbeatOnline ? styles.good : styles.bad}>{syncText}</b>
                  </div>
                  <div>
                    <span>Expire</span>
                    <b>{expiryLabel(slot.subscription.expiresAt)}</b>
                  </div>
                </footer>
              </article>
            );
          })}
        </section>

        {!visibleSlots.length ? (
          <div className={styles.emptyState}>
            <ScenovaIcon name="report" size={28}/>
            <b>ไม่พบบัญชี MT5 ที่ยังเชื่อมอยู่ตามตัวกรองนี้</b>
            <span>ลองเปลี่ยนช่วงเวลา, สถานะ, Runtime, Broker หรือคำค้นหา</span>
          </div>
        ) : null}

        <div className={styles.dataNote}>
          <ScenovaIcon name="shield" size={14}/>
          <span>
            หน้านี้แสดงเฉพาะบัญชี MT5 ที่ยัง ACTIVE และยังผูกกับระบบอยู่ · Balance, Equity, Floating, Position, Spread และ Ping เป็นค่า Live ปัจจุบัน ·
            P/L, Win Rate, Baskets, Entries และ Drawdown ใช้ช่วงวัน/เวลาที่เลือกจาก Trade Journal · ระบบยังไม่แสดง Deposit/Withdraw เพราะ EA ปัจจุบันไม่ได้ส่ง Funding History
          </span>
        </div>
      </main>
    </div>
  );
}
