import { ScenovaIcon } from "../../components/ScenovaIcon";

const kpis = [
  ["Account Balance","$24,532.18","+2.45%"],
  ["Equity","$25,118.76","+2.91%"],
  ["Daily P&L","+$711.20","+3.02%"],
  ["Win Rate","68.4%","247 trades"],
  ["Max Drawdown","12.6%","Normal"],
  ["Signal Confidence","87%","High"]
];

export default function UiPreviewPage() {
  return (
    <main className="scenova-ui-preview">
      <aside className="preview-sidebar">
        <div className="preview-logo">SCENOVA-<b>EA</b><span className="preview-sub">EVOLVE. TRADE. OUTPERFORM.</span></div>
        <nav className="preview-nav">
          <span className="active">Dashboard</span><span>Live Trading</span><span>Strategies</span>
          <span>AI Optimizer</span><span>MT5 Accounts</span><span>Backtesting</span>
          <span>Analytics</span><span>Risk Control</span><span>Reports</span><span>Settings</span>
        </nav>
      </aside>

      <section className="preview-main">
        <div className="preview-top">
          <div className="preview-search">Search symbols, strategies, or accounts...</div>
          <div className="preview-user"><b>John Trader</b>Pro Plan</div>
        </div>

        <section className="preview-hero">
          <div className="preview-hero-copy">
            <div className="preview-kicker">WELCOME TO · SCENOVA-EA</div>
            <h1><b>AI-driven</b> & Genetic Algorithm<br/>Trading Platform</h1>
            <p>Premium black and red control workspace for Cloud MT5 EA and Local MT5 EA.</p>
            <div className="preview-actions">
              <button className="run"><ScenovaIcon name="play" size={14}/> Start</button>
              <button>Settings</button>
              <button className="stop"><ScenovaIcon name="stop" size={14}/> Safe Stop</button>
            </div>
          </div>
        </section>

        <section className="preview-kpis">
          {kpis.map(([label,value,meta]) => (
            <article className="preview-kpi" key={label}><small>{label}</small><b>{value}</b><em>{meta}</em></article>
          ))}
        </section>

        <section className="preview-grid">
          <article className="preview-card">
            <div className="preview-card-head"><b>EURUSD · Live Performance</b><span className="preview-status">● MARKET ONLINE</span></div>
            <div className="preview-chart">
              <svg viewBox="0 0 800 220" preserveAspectRatio="none">
                <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff2438" stopOpacity=".34"/><stop offset="1" stopColor="#ff2438" stopOpacity="0"/></linearGradient></defs>
                <path d="M0 165 C55 152,78 170,124 142 S210 120,248 135 S332 114,370 98 S454 128,506 91 S596 108,646 73 S724 84,800 48 L800 220 L0 220 Z" fill="url(#area)"/>
                <path d="M0 165 C55 152,78 170,124 142 S210 120,248 135 S332 114,370 98 S454 128,506 91 S596 108,646 73 S724 84,800 48" fill="none" stroke="#ff3047" strokeWidth="2.4"/>
              </svg>
            </div>
          </article>

          <div className="preview-side-stack">
            <article className="preview-card">
              <div className="preview-card-head"><b>AI Engine Status</b><span className="preview-status">● ONLINE</span></div>
              <div className="preview-metric-list">
                <div><span>Signals Analyzed</span><b>1,248</b></div>
                <div><span>Avg Confidence</span><b>87%</b></div>
                <div><span>Market Regime</span><b>Trending Up</b></div>
              </div>
            </article>
            <article className="preview-card">
              <div className="preview-card-head"><b>Deployment & Risk</b><span className="preview-status">● HEALTHY</span></div>
              <div className="preview-metric-list">
                <div><span>MT5 Accounts</span><b>3 / 5</b></div>
                <div><span>Running Bots</span><b>3</b></div>
                <div><span>Safe Stop</span><b>Ready</b></div>
                <div><span>Last Sync</span><b>12s ago</b></div>
              </div>
            </article>
          </div>

          <article className="preview-card preview-table-card">
            <div className="preview-card-head"><b>Recent Executions</b><span className="preview-status">Snapshot mode · low server load</span></div>
            <table className="preview-table">
              <thead><tr><th>Time</th><th>Symbol</th><th>Type</th><th>Volume</th><th>Entry</th><th>P&L</th><th>Status</th></tr></thead>
              <tbody>
                <tr><td>14:27</td><td>XAUUSD</td><td className="buy">BUY</td><td>0.50</td><td>2,328.14</td><td className="buy">+$103.50</td><td>Closed</td></tr>
                <tr><td>14:12</td><td>EURUSD</td><td className="sell">SELL</td><td>1.00</td><td>1.0724</td><td className="buy">+$130.00</td><td>Closed</td></tr>
                <tr><td>13:58</td><td>GBPUSD</td><td className="buy">BUY</td><td>0.50</td><td>1.2487</td><td className="buy">+$60.00</td><td>Closed</td></tr>
              </tbody>
            </table>
            <div className="preview-note">Visual preview of the UI branch. Trading and EA behavior remain unchanged.</div>
          </article>
        </section>
      </section>
    </main>
  );
}
