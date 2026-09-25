"use client";

import { useMemo, useState } from "react";
import { ScenovaIcon } from "./ScenovaIcon";

type DashboardShape = {
  account?: any;
  instance?: any;
  settings?: any;
  runSummary?: any;
};

const SUMMARY_STYLE = [
  ".bps-launcher{position:fixed;right:22px;bottom:22px;z-index:7600;display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(139,112,255,.55);background:linear-gradient(145deg,rgba(55,37,135,.96),rgba(26,20,74,.98));box-shadow:0 16px 38px rgba(42,25,113,.38),inset 0 1px rgba(255,255,255,.08);color:#fff;border-radius:15px;padding:11px 15px;font-weight:900;font-size:12px;cursor:pointer}",
  ".bps-launcher:hover{transform:translateY(-1px);border-color:rgba(171,148,255,.82)}",
  ".bps-backdrop{position:fixed;inset:0;z-index:9000;background:rgba(2,4,14,.84);backdrop-filter:blur(8px);overflow:auto;padding:8px}",
  ".bps-modal{position:relative;width:min(1320px,calc(100vw - 16px));max-height:calc(100vh - 16px);overflow:auto;margin:0 auto;border:1px solid rgba(130,104,255,.46);border-radius:21px;background:radial-gradient(circle at 50% 0,rgba(94,64,205,.18),transparent 25%),linear-gradient(180deg,#0d1430,#080e22 68%,#07101c);box-shadow:0 30px 90px rgba(0,0,0,.62);color:#eef1ff;padding:12px}",
  ".bps-close{position:absolute;right:12px;top:12px;width:36px;height:36px;display:grid;place-items:center;border-radius:12px;border:1px solid rgba(160,170,220,.2);background:rgba(255,255,255,.035);color:#d8dcff;cursor:pointer}",
  ".bps-title{text-align:center;padding:1px 52px 10px}.bps-title-mark{display:flex;justify-content:center;align-items:center;gap:10px;color:#9e8cff}.bps-title h2{font-size:clamp(24px,2.7vw,38px);line-height:1;margin:0;font-weight:950;letter-spacing:.035em;text-shadow:0 0 20px rgba(137,112,255,.5)}.bps-title p{margin:4px 0 0;color:#baa8ff;font-size:12px;font-weight:800}",
  ".bps-card{border:1px solid rgba(112,97,235,.34);background:linear-gradient(180deg,rgba(15,23,54,.93),rgba(7,13,31,.94));border-radius:15px;box-shadow:inset 0 1px rgba(255,255,255,.035)}",
  ".bps-info{display:grid;grid-template-columns:repeat(3,1fr);padding:9px 14px;gap:12px}.bps-info-col{padding-right:12px;border-right:1px solid rgba(154,145,255,.16)}.bps-info-col:last-child{border:0}.bps-info-row{display:grid;grid-template-columns:22px minmax(75px,1fr) auto;align-items:center;gap:7px;padding:4px 0;color:#aeb7da;font-size:11px}.bps-info-icon{display:grid;place-items:center;color:#9c86ff}.bps-info-row b{color:#f5f6ff;text-align:right;font-size:11px;white-space:nowrap}",
  ".bps-metrics{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;margin-top:8px;padding:7px}.bps-metric{min-width:0;padding:9px 9px;border-radius:12px;background:rgba(255,255,255,.022);border:1px solid rgba(160,170,220,.08)}.bps-metric-head{display:flex;align-items:center;gap:6px;color:#9ea8ca;font-size:9px;white-space:nowrap}.bps-metric-head svg{color:#927dff;flex:none}.bps-metric b{display:block;margin-top:4px;font-size:clamp(14px,1.35vw,20px);line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bps-metric b.good,.bps-row b.good{color:#6cf2b7}.bps-metric b.bad,.bps-row b.bad{color:#ff6f7b}",
  ".bps-section-label{display:flex;align-items:center;gap:7px;margin:10px 3px 6px;font-size:12px;font-weight:900;color:#e9eaff}.bps-section-label svg{color:#9b85ff}",
  ".bps-grid{display:grid;grid-template-columns:1.08fr 1.08fr 1fr;gap:8px}.bps-stack{display:grid;gap:8px}.bps-panel{padding:9px 11px}.bps-panel-title{display:flex;align-items:center;gap:7px;margin:0 0 6px;color:#c7b6ff;font-size:11px}.bps-panel-title svg{color:#a38fff}.bps-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:3px 0;color:#aeb7da;font-size:10px;line-height:1.35}.bps-row b{color:#f1f3ff;text-align:right;white-space:nowrap}",
  ".bps-chart-card{margin-top:8px;padding:8px 11px 4px}.bps-chart-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.bps-chart-title{display:flex;align-items:center;gap:7px;margin:0;color:#ececff;font-size:11px;font-weight:900}.bps-chart-title svg{color:#9b86ff}.bps-chart-head span{border:1px solid rgba(143,116,255,.42);background:rgba(78,54,167,.16);border-radius:999px;padding:5px 9px;color:#d9d4ff;font-size:9px}.bps-chart{width:100%;height:150px;display:block}.bps-grid-line,.bps-grid-v{stroke:rgba(160,170,220,.13);stroke-dasharray:3 5}.bps-chart-label{fill:#98a2c4;font-size:10px}.bps-end-dot{fill:#b36cff;stroke:#f0dcff;stroke-width:2;filter:url(#bps-glow)}",
  ".bps-empty{padding:34px 20px;text-align:center;color:#aeb7da}.bps-empty b{display:block;color:#e7e9ff;font-size:17px;margin-bottom:6px}",
  "@media(max-width:1100px){.bps-modal{width:min(980px,calc(100vw - 12px))}.bps-metrics{grid-template-columns:repeat(4,1fr)}.bps-chart{height:145px}}",
  "@media(max-width:820px){.bps-backdrop{padding:5px}.bps-modal{max-height:none}.bps-info,.bps-grid{grid-template-columns:1fr}.bps-metrics{grid-template-columns:repeat(2,1fr)}.bps-info-col{border:0;padding:0}.bps-launcher{position:static;width:100%;justify-content:center;margin:0 0 10px;min-height:44px}.bps-title h2{font-size:25px}.bps-chart{height:180px}.bps-row{font-size:11px}}"
].join("");

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

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="bps-info-row">
      <span className="bps-info-icon"><ScenovaIcon name={icon} size={15} /></span>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  tone = ""
}: {
  icon: string;
  label: string;
  value: string;
  tone?: "good" | "bad" | "";
}) {
  return (
    <div className="bps-metric">
      <div className="bps-metric-head"><ScenovaIcon name={icon} size={14} /><span>{label}</span></div>
      <b className={tone}>{value}</b>
    </div>
  );
}

function PanelTitle({ icon, children }: { icon: string; children: string }) {
  return (
    <h3 className="bps-panel-title">
      <ScenovaIcon name={icon} size={14} />
      <span>{children}</span>
    </h3>
  );
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
    const height = 184;
    const left = 30;
    const right = 18;
    const top = 13;
    const bottom = 24;
    const min = Math.min(...source);
    const max = Math.max(...source);
    const pad = Math.max(1, (max - min) * 0.1);
    const low = min - pad;
    const high = max + pad;
    const range = Math.max(1, high - low);
    const points = source.map((value, index) => {
      const x = left + index / Math.max(1, source.length - 1) * (width - left - right);
      const y = top + (high - value) / range * (height - top - bottom);
      return { x, y, value };
    });
    const path = points.map((point, index) =>
      (index ? "L " : "M ") + point.x.toFixed(1) + " " + point.y.toFixed(1)
    ).join(" ");
    const area = path + " L " + points[points.length - 1].x.toFixed(1) + " " + (height - bottom) +
      " L " + points[0].x.toFixed(1) + " " + (height - bottom) + " Z";
    const horizontalTicks = Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4;
      return {
        y: top + ratio * (height - top - bottom),
        value: high - ratio * range
      };
    });
    const tickIndexes = Array.from(
      { length: Math.min(8, Math.max(2, source.length)) },
      (_, index) => Math.round(index * (source.length - 1) / Math.max(1, Math.min(8, Math.max(2, source.length)) - 1))
    ).filter((value,index,array)=>index===0||value!==array[index-1]);
    const verticalTicks = tickIndexes.map((pointIndex) => ({
      pointIndex,
      x: points[pointIndex]?.x ?? left
    }));
    return { path, area, horizontalTicks, verticalTicks, points };
  }, [values]);

  const last = chart.points[chart.points.length - 1];

  return (
    <svg className="bps-chart" viewBox="0 0 1200 184" role="img" aria-label="Balance">
      <defs>
        <linearGradient id="bps-line" x1="0" x2="1">
          <stop offset="0%" stopColor="#61d9ff" />
          <stop offset="48%" stopColor="#8c78ff" />
          <stop offset="100%" stopColor="#bd69ff" />
        </linearGradient>
        <linearGradient id="bps-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#8068ff" stopOpacity=".48" />
          <stop offset="100%" stopColor="#8068ff" stopOpacity=".02" />
        </linearGradient>
        <filter id="bps-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {chart.horizontalTicks.map((tick, index) => (
        <g key={"h-" + index}>
          <line x1="30" x2="1182" y1={tick.y} y2={tick.y} className="bps-grid-line" />
          <text x="3" y={tick.y + 3} className="bps-chart-label">{tick.value.toFixed(0)}</text>
        </g>
      ))}
      {chart.verticalTicks.map((tick, index) => (
        <g key={"v-" + index}>
          <line x1={tick.x} x2={tick.x} y1="13" y2="160" className="bps-grid-v" />
          <text x={tick.x} y="174" textAnchor="middle" className="bps-chart-label">{tick.pointIndex}</text>
        </g>
      ))}
      <path d={chart.area} fill="url(#bps-area)" />
      <path d={chart.path} fill="none" stroke="url(#bps-line)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle className="bps-end-dot" cx={last.x} cy={last.y} r="4" />
      <text x="600" y="183" textAnchor="middle" className="bps-chart-label">จำนวนไม้</text>
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
      <style>{SUMMARY_STYLE}</style>

      <button type="button" className="bps-launcher" onClick={() => setOpen(true)}>
        <ScenovaIcon name="report" size={16} />
        <span>สรุปผลบอท</span>
      </button>

      {open && (
        <div className="bps-backdrop" onClick={() => setOpen(false)}>
          <section className="bps-modal" onClick={event => event.stopPropagation()}>
            <button className="bps-close" type="button" onClick={() => setOpen(false)} aria-label="ปิด">
              <ScenovaIcon name="close" size={18} />
            </button>

            <header className="bps-title">
              <div className="bps-title-mark">
                <ScenovaIcon name="pnl" size={25} />
                <h2>BOT PERFORMANCE SUMMARY</h2>
                <ScenovaIcon name="pnl" size={25} />
              </div>
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
                    <InfoRow icon="account" label="Account" value={String(dashboard.account?.account_number || "—")} />
                    <InfoRow icon="strategy" label="Symbol" value={symbol} />
                    <InfoRow icon="wallet" label="Currency" value={currency} />
                  </div>
                  <div className="bps-info-col">
                    <InfoRow icon="layers" label="Runtime Mode" value={mode} />
                    <InfoRow icon="clock" label="Start Time" value={when(summary.startAt)} />
                    <InfoRow icon={summary.running ? "play" : "stop"} label="Status" value={summary.running ? "กำลังรัน" : "หยุดแล้ว"} />
                  </div>
                  <div className="bps-info-col">
                    <InfoRow icon="stop" label="Stop Time" value={summary.running ? "—" : when(summary.stopAt)} />
                    <InfoRow icon="hourglass" label="Runtime" value={runtimeLabel(summary.runtimeSeconds)} />
                    <InfoRow icon="orders" label="Closed Baskets" value={String(Number(summary.closedBaskets || 0))} />
                  </div>
                </div>

                <div className="bps-card bps-metrics">
                  <Metric icon="wallet" label="Start Capital" value={money(summary.startCapital, currency)} />
                  <Metric icon="equity" label="End Balance" value={money(summary.endBalance, currency)} />
                  <Metric icon="profit" label="Net Profit" value={money(summary.netProfit, currency, true)} tone={Number(summary.netProfit)>=0?"good":"bad"} />
                  <Metric icon="trend" label="Return" value={percent(summary.returnPercent, true)} tone={Number(summary.returnPercent)>=0?"good":"bad"} />
                  <Metric icon="timer" label="Runtime" value={runtimeLabel(summary.runtimeSeconds)} />
                  <Metric icon="risk" label="Max Drawdown" value={percent(summary.maxDrawdownPercent)} />
                  <Metric icon="target" label="Win Rate" value={percent(summary.winRate)} />
                </div>

                <div className="bps-section-label">
                  <ScenovaIcon name="report" size={14} />
                  <span>Results</span>
                </div>

                <div className="bps-grid">
                  <div className="bps-card bps-panel">
                    <PanelTitle icon="profit">Performance</PanelTitle>
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
                      <PanelTitle icon="shield">Drawdown</PanelTitle>
                      <StatRow label="Max Drawdown" value={percent(summary.maxDrawdownPercent)} />
                      <StatRow label="Drawdown Money" value={money(summary.maxDrawdownMoney,currency)} />
                    </div>
                    <div className="bps-card bps-panel">
                      <PanelTitle icon="orders">Trades</PanelTitle>
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
                      <PanelTitle icon="spread">Trade Direction</PanelTitle>
                      <StatRow label="Long Baskets (won %)" value={String(summary.long?.trades || 0)+" ("+percent(summary.long?.winRate)+")"} />
                      <StatRow label="Short Baskets (won %)" value={String(summary.short?.trades || 0)+" ("+percent(summary.short?.winRate)+")"} />
                    </div>
                    <div className="bps-card bps-panel">
                      <PanelTitle icon="pnl">Trade Statistics</PanelTitle>
                      <StatRow label="Largest profit trade" value={money(summary.largestProfitTrade,currency)} />
                      <StatRow label="Largest loss trade" value={money(summary.largestLossTrade,currency)} tone="bad" />
                      <StatRow label="Average profit trade" value={money(summary.averageProfitTrade,currency)} />
                      <StatRow label="Average loss trade" value={money(summary.averageLossTrade,currency)} tone="bad" />
                    </div>
                    <div className="bps-card bps-panel">
                      <PanelTitle icon="target">Streaks</PanelTitle>
                      <StatRow label="Maximum consecutive wins" value={String(summary.maxWinStreak||0)+" ("+money(summary.maxWinStreakProfit,currency)+")"} />
                      <StatRow label="Maximum consecutive losses" value={String(summary.maxLossStreak||0)+" ("+money(summary.maxLossStreakLoss,currency)+")"} tone="bad" />
                      <StatRow label="Average consecutive wins" value={Number(summary.averageWinStreak||0).toFixed(1)} />
                      <StatRow label="Average consecutive losses" value={Number(summary.averageLossStreak||0).toFixed(1)} />
                    </div>
                  </div>
                </div>

                <div className="bps-card bps-chart-card">
                  <div className="bps-chart-head">
                    <div className="bps-chart-title"><ScenovaIcon name="trend" size={14} /><span>Balance</span></div>
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
