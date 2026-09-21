"use client";

import { useMemo, useState } from "react";

type DashboardShape = {
  account?: any;
  instance?: any;
  settings?: any;
  runSummary?: any;
};

function money(value: unknown, currency: string, signed = false) {
  const amount = Number(value || 0);
  const prefix = signed && amount > 0 ? "+" : "";
  return prefix + amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + " " + currency;
}

function percent(value: unknown, signed = false) {
  const amount = Number(value || 0);
  const prefix = signed && amount > 0 ? "+" : "";
  return prefix + amount.toFixed(2) + "%";
}

function when(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "medium"
  });
}

function runtimeLabel(value: unknown) {
  let seconds = Math.max(0, Math.floor(Number(value || 0)));
  const days = Math.floor(seconds / 86400);
  seconds %= 86400;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  const parts = [];
  if (days) parts.push(days + " วัน");
  if (hours || days) parts.push(hours + " ชม.");
  parts.push(minutes + " นาที");
  return parts.join(" ");
}

function StatRow({
  label,
  value,
  tone = ""
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "";
}) {
  return (
    <div className="bps-row">
      <span>{label}</span>
      <b className={tone}>{value}</b>
    </div>
  );
}

function BalanceChart({ values }: { values: number[] }) {
  const chart = useMemo(() => {
    const source = values.length > 1 ? values : [0, 0];
    const width = 1200;
    const height = 250;
    const left = 22;
    const right = 18;
    const top = 18;
    const bottom = 28;
    const min = Math.min(...source);
    const max = Math.max(...source);
    const pad = Math.max(1, (max - min) * 0.08);
    const low = min - pad;
    const high = max + pad;
    const range = Math.max(1, high - low);
    const points = source.map((value, index) => {
      const x = left + index / Math.max(1, source.length - 1) * (width - left - right);
      const y = top + (high - value) / range * (height - top - bottom);
      return { x, y };
    });
    const path = points.map((point, index) =>
      (index ? "L " : "M ") + point.x.toFixed(1) + " " + point.y.toFixed(1)
    ).join(" ");
    const area = path + " L " + points[points.length - 1].x.toFixed(1) + " " + (height - bottom) +
      " L " + points[0].x.toFixed(1) + " " + (height - bottom) + " Z";
    const ticks = Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4;
      return {
        y: top + ratio * (height - top - bottom),
        value: high - ratio * range
      };
    });
    return { path, area, ticks };
  }, [values]);

  return (
    <svg className="bps-chart" viewBox="0 0 1200 250" role="img" aria-label="Balance">
      <defs>
        <linearGradient id="bps-line" x1="0" x2="1">
          <stop offset="0%" stopColor="#61d9ff" />
          <stop offset="50%" stopColor="#8c78ff" />
          <stop offset="100%" stopColor="#bd69ff" />
        </linearGradient>
        <linearGradient id="bps-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#8068ff" stopOpacity=".5" />
          <stop offset="100%" stopColor="#8068ff" stopOpacity=".02" />
        </linearGradient>
      </defs>
      {chart.ticks.map((tick, index) => (
        <g key={index}>
          <line x1="22" x2="1182" y1={tick.y} y2={tick.y} className="bps-grid-line" />
          <text x="4" y={tick.y + 4} className="bps-chart-label">{tick.value.toFixed(0)}</text>
        </g>
      ))}
      <path d={chart.area} fill="url(#bps-area)" />
      <path d={chart.path} fill="none" stroke="url(#bps-line)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <text x="600" y="246" textAnchor="middle" className="bps-chart-label">Trade Number</text>
    </svg>
  );
}

export function BotPerformanceSummary({ dashboard }: { dashboard: DashboardShape }) {
  const [open, setOpen] = useState(false);
  const summary = dashboard.runSummary;
  if (!dashboard.account) return null;

  const currency = String(
    dashboard.instance?.metrics?.currency || dashboard.settings?.accountCurrency || "USD"
  ).trim().toUpperCase() || "USD";
  const symbol = String(
    dashboard.instance?.metrics?.symbol || dashboard.settings?.symbol || "—"
  );
  const mode = String(dashboard.account?.mode || "LOCAL").toUpperCase();

  return (
    <>
      <style>{`
        .bps-launcher{position:fixed;right:22px;bottom:22px;z-index:7600;border:1px solid rgba(139,112,255,.55);background:linear-gradient(145deg,rgba(55,37,135,.96),rgba(26,20,74,.98));box-shadow:0 16px 38px rgba(42,25,113,.38),inset 0 1px rgba(255,255,255,.08);color:#fff;border-radius:15px;padding:12px 17px;font-weight:900;font-size:12px;cursor:pointer;letter-spacing:.01em}
        .bps-launcher:hover{transform:translateY(-1px);border-color:rgba(171,148,255,.82)}
        .bps-backdrop{position:fixed;inset:0;z-index:9000;background:rgba(2,4,14,.82);backdrop-filter:blur(8px);overflow:auto;padding:22px}
        .bps-modal{position:relative;width:min(1420px,100%);margin:0 auto;border:1px solid rgba(130,104,255,.46);border-radius:24px;background:radial-gradient(circle at 50% 0,rgba(94,64,205,.18),transparent 27%),linear-gradient(180deg,#0d1430,#080e22 68%,#07101c);box-shadow:0 30px 90px rgba(0,0,0,.62);color:#eef1ff;padding:18px}
        .bps-close{position:absolute;right:16px;top:16px;width:42px;height:42px;border-radius:13px;border:1px solid rgba(160,170,220,.2);background:rgba(255,255,255,.035);color:#d8dcff;font-size:26px;cursor:pointer}
        .bps-title{text-align:center;padding:4px 60px 18px}.bps-title h2{font-size:clamp(27px,3.3vw,50px);margin:0;font-weight:950;letter-spacing:.025em;text-shadow:0 0 22px rgba(137,112,255,.5)}.bps-title p{margin:5px 0 0;color:#baa8ff;font-size:16px;font-weight:800}
        .bps-card{border:1px solid rgba(112,97,235,.34);background:linear-gradient(180deg,rgba(15,23,54,.93),rgba(7,13,31,.94));border-radius:18px;box-shadow:inset 0 1px rgba(255,255,255,.035)}
        .bps-info{display:grid;grid-template-columns:repeat(3,1fr);padding:15px 20px;gap:16px}.bps-info-col{padding-right:16px;border-right:1px solid rgba(154,145,255,.16)}.bps-info-col:last-child{border:0}.bps-info-row{display:flex;justify-content:space-between;gap:14px;padding:7px 0;color:#aeb7da}.bps-info-row b{color:#f5f6ff;text-align:right}
        .bps-metrics{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-top:12px;padding:10px}.bps-metric{padding:13px 12px;border-radius:14px;background:rgba(255,255,255,.022);border:1px solid rgba(160,170,220,.08)}.bps-metric span{display:block;color:#9ea8ca;font-size:11px}.bps-metric b{display:block;margin-top:6px;font-size:clamp(17px,1.7vw,27px);white-space:nowrap}.bps-metric b.good,.bps-row b.good{color:#6cf2b7}.bps-metric b.bad,.bps-row b.bad{color:#ff6f7b}
        .bps-section-label{margin:18px 3px 9px;font-weight:900;color:#e9eaff}.bps-grid{display:grid;grid-template-columns:1.08fr 1.08fr 1fr;gap:12px}.bps-stack{display:grid;gap:12px}.bps-panel{padding:14px 16px}.bps-panel h3{margin:0 0 9px;color:#c7b6ff;font-size:14px}.bps-row{display:flex;justify-content:space-between;gap:18px;padding:6px 0;color:#aeb7da;font-size:12px}.bps-row b{color:#f1f3ff;text-align:right}
        .bps-chart-card{margin-top:12px;padding:12px 16px}.bps-chart-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.bps-chart-head h3{margin:0;color:#ececff}.bps-chart-head span{border:1px solid rgba(143,116,255,.42);background:rgba(78,54,167,.16);border-radius:999px;padding:6px 10px;color:#d9d4ff;font-size:10px}.bps-chart{width:100%;height:auto;display:block}.bps-grid-line{stroke:rgba(160,170,220,.13);stroke-dasharray:3 5}.bps-chart-label{fill:#98a2c4;font-size:11px}
        .bps-empty{padding:42px 20px;text-align:center;color:#aeb7da}.bps-empty b{display:block;color:#e7e9ff;font-size:18px;margin-bottom:6px}
        @media(max-width:980px){.bps-backdrop{padding:10px}.bps-info,.bps-grid,.bps-metrics{grid-template-columns:1fr}.bps-info-col{border:0;padding:0}.bps-launcher{right:12px;bottom:72px}.bps-modal{padding:12px}.bps-metric b{font-size:22px}.bps-row{font-size:11px}}
      `}</style>

      <button type="button" className="bps-launcher" onClick={() => setOpen(true)}>
        สรุปผลบอท
      </button>

      {open && (
        <div className="bps-backdrop" onClick={() => setOpen(false)}>
          <section className="bps-modal" onClick={event => event.stopPropagation()}>
            <button className="bps-close" type="button" onClick={() => setOpen(false)} aria-label="ปิด">×</button>
            <header className="bps-title">
              <h2>BOT PERFORMANCE SUMMARY</h2>
              <p>สรุปผลการทำงานของบอทรอบล่าสุด</p>
            </header>

            {!summary ? (
              <div className="bps-card bps-empty">
                <b>ยังไม่มีรอบการทำงานให้สรุป</b>
                <span>เมื่อกด Start บอท ระบบจะเริ่มเก็บสถิติของรอบล่าสุดอัตโนมัติ</span>
              </div>
            ) : (
              <>
                <div className="bps-card bps-info">
                  <div className="bps-info-col">
                    <div className="bps-info-row"><span>Account</span><b>{dashboard.account?.account_number || "—"}</b></div>
                    <div className="bps-info-row"><span>Symbol</span><b>{symbol}</b></div>
                    <div className="bps-info-row"><span>Currency</span><b>{currency}</b></div>
                  </div>
                  <div className="bps-info-col">
                    <div className="bps-info-row"><span>Runtime Mode</span><b>{mode}</b></div>
                    <div className="bps-info-row"><span>Start Time</span><b>{when(summary.startAt)}</b></div>
                    <div className="bps-info-row"><span>Status</span><b>{summary.running ? "กำลังรัน" : "หยุดแล้ว"}</b></div>
                  </div>
                  <div className="bps-info-col">
                    <div className="bps-info-row"><span>Stop Time</span><b>{summary.running ? "—" : when(summary.stopAt)}</b></div>
                    <div className="bps-info-row"><span>Runtime</span><b>{runtimeLabel(summary.runtimeSeconds)}</b></div>
                    <div className="bps-info-row"><span>Closed Baskets</span><b>{Number(summary.closedBaskets || 0)}</b></div>
                  </div>
                </div>

                <div className="bps-card bps-metrics">
                  <div className="bps-metric"><span>Start Capital</span><b>{money(summary.startCapital, currency)}</b></div>
                  <div className="bps-metric"><span>End Balance</span><b>{money(summary.endBalance, currency)}</b></div>
                  <div className="bps-metric"><span>Net Profit</span><b className={Number(summary.netProfit)>=0?"good":"bad"}>{money(summary.netProfit, currency, true)}</b></div>
                  <div className="bps-metric"><span>Return</span><b className={Number(summary.returnPercent)>=0?"good":"bad"}>{percent(summary.returnPercent, true)}</b></div>
                  <div className="bps-metric"><span>Runtime</span><b>{runtimeLabel(summary.runtimeSeconds)}</b></div>
                  <div className="bps-metric"><span>Max Drawdown</span><b>{percent(summary.maxDrawdownPercent)}</b></div>
                  <div className="bps-metric"><span>Win Rate</span><b>{percent(summary.winRate)}</b></div>
                </div>

                <div className="bps-section-label">Results</div>
                <div className="bps-grid">
                  <div className="bps-card bps-panel">
                    <h3>Performance</h3>
                    <StatRow label="Total Net Profit" value={money(summary.netProfit,currency,true)} tone={Number(summary.netProfit)>=0?"good":"bad"} />
                    <StatRow label="Profit (%)" value={percent(summary.returnPercent,true)} tone={Number(summary.returnPercent)>=0?"good":"bad"} />
                    <StatRow label="Gross Profit" value={money(summary.grossProfit,currency)} />
                    <StatRow label="Gross Loss" value={"-"+money(summary.grossLoss,currency)} tone="bad" />
                    <StatRow label="Profit Factor" value={Number(summary.profitFactor||0).toFixed(2)} />
                    <StatRow label="Expected Payoff" value={money(summary.expectedPayoff,currency)} />
                    <StatRow label="Recovery Factor" value={Number(summary.recoveryFactor||0).toFixed(2)} />
                    <StatRow label="Sharpe Ratio" value={Number(summary.sharpeRatio||0).toFixed(2)} />
                  </div>

                  <div className="bps-stack">
                    <div className="bps-card bps-panel">
                      <h3>Drawdown</h3>
                      <StatRow label="Max Drawdown" value={percent(summary.maxDrawdownPercent)} />
                      <StatRow label="Drawdown Money" value={money(summary.maxDrawdownMoney,currency)} />
                    </div>
                    <div className="bps-card bps-panel">
                      <h3>Trades</h3>
                      <StatRow label="Total Trades" value={String(summary.totalTrades || 0)} />
                      <StatRow label="Total Deals" value={String(summary.totalDeals || 0)} />
                      <StatRow label="Profit Baskets" value={String(summary.wins || 0)} />
                      <StatRow label="Loss Baskets" value={String(summary.losses || 0)} />
                      <StatRow label="Win Rate" value={percent(summary.winRate)} />
                      <StatRow label="Loss Rate" value={percent(summary.lossRate)} />
                    </div>
                  </div>

                  <div className="bps-stack">
                    <div className="bps-card bps-panel">
                      <h3>Trade Direction</h3>
                      <StatRow label="Long Baskets (won %)" value={String(summary.long?.trades || 0)+" ("+percent(summary.long?.winRate)+")"} />
                      <StatRow label="Short Baskets (won %)" value={String(summary.short?.trades || 0)+" ("+percent(summary.short?.winRate)+")"} />
                    </div>
                    <div className="bps-card bps-panel">
                      <h3>Trade Statistics</h3>
                      <StatRow label="Largest profit trade" value={money(summary.largestProfitTrade,currency)} />
                      <StatRow label="Largest loss trade" value={money(summary.largestLossTrade,currency)} tone="bad" />
                      <StatRow label="Average profit trade" value={money(summary.averageProfitTrade,currency)} />
                      <StatRow label="Average loss trade" value={money(summary.averageLossTrade,currency)} tone="bad" />
                    </div>
                    <div className="bps-card bps-panel">
                      <h3>Streaks</h3>
                      <StatRow label="Maximum consecutive wins" value={String(summary.maxWinStreak||0)+" ("+money(summary.maxWinStreakProfit,currency)+")"} />
                      <StatRow label="Maximum consecutive losses" value={String(summary.maxLossStreak||0)+" ("+money(summary.maxLossStreakLoss,currency)+")"} tone="bad" />
                      <StatRow label="Average consecutive wins" value={Number(summary.averageWinStreak||0).toFixed(1)} />
                      <StatRow label="Average consecutive losses" value={Number(summary.averageLossStreak||0).toFixed(1)} />
                    </div>
                  </div>
                </div>

                <div className="bps-card bps-chart-card">
                  <div className="bps-chart-head">
                    <h3>Balance</h3>
                    <span>End Balance: {money(summary.endBalance,currency)}</span>
                  </div>
                  <BalanceChart values={Array.isArray(summary.balanceSeries) ? summary.balanceSeries.map(Number) : []} />
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
