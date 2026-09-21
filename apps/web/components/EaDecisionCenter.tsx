"use client";

import { useEffect, useState } from "react";
import { ScenovaIcon } from "./ScenovaIcon";
import styles from "./EaDecisionCenter.module.css";

type Tone = "good" | "bad" | "warn" | "muted";
type Props = {
  metrics: Record<string, unknown>;
  mode: string;
  symbol: string;
  state: string;
  online: boolean;
  marketClosed: boolean;
  observedAt: string | number | null;
  digits: number;
  lot: unknown;
  maxPositions: number;
  currency: string;
  decisionLabel: string;
  marketRegimeLabel: string;
  spreadLabel: string;
  liveStatus: { tradeReady?: boolean; label?: string; detail?: string };
};
type Observation = { key: string; time: number; title: string; detail: string; tone: Tone };

function numberValue(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function meaningfulCode(value: unknown): string {
  const text = textValue(value);
  return ["", "NONE", "UNKNOWN", "N/A"].includes(text.toUpperCase()) ? "" : text;
}

function timestamp(value: Props["observedAt"]): number | null {
  if (value === null || value === "") return null;
  const time = typeof value === "number"
    ? (value < 100000000000 ? value * 1000 : value)
    : Date.parse(value);
  return Number.isFinite(time) && time > 0 ? time : null;
}

function clockLabel(time: number): string {
  return new Date(time).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour12: false });
}

function CardHeading({ icon, title, detail }: { icon: string; title: string; detail?: string }) {
  return <div className={styles.cardHeading}>
    <ScenovaIcon name={icon} size={17}/>
    <h3>{title}</h3>
    {detail && <small>{detail}</small>}
  </div>;
}

export function EaDecisionCenter(props: Props) {
  const { metrics, online, marketClosed, state, liveStatus } = props;
  const [observations, setObservations] = useState<Observation[]>([]);
  const mode = (textValue(metrics.controlMode) || props.mode).toUpperCase();
  const running = state === "RUNNING";
  const analyzing = online && running && !marketClosed;
  const execution = textValue(metrics.executionStatus).toUpperCase();
  const bias = textValue(metrics.entryBias).toUpperCase();
  const autoActive = mode === "AUTO" && metrics.autoV20Active === true;
  const explicitlyWaiting = /WAIT|BLOCK|COOLDOWN|INITIALIZ|DATA_NOT_READY|NO_SIGNAL/.test(execution);
  const platformReady = liveStatus.tradeReady === true && metrics.tradeReady !== false;
  const signal = !online ? "OFFLINE"
    : !running ? "PAUSED"
    : marketClosed || explicitlyWaiting || !platformReady ? "WAIT"
    : mode === "ZERO_GRID" ? "GRID"
    : mode === "MANUAL" ? "MANUAL"
    : bias === "BUY" || bias === "SELL" ? bias : "WAIT";
  const signalTone: Tone = signal === "BUY" ? "good" : signal === "SELL" ? "bad"
    : signal === "WAIT" ? "warn" : "muted";
  const signalDetail = !online ? "รอการเชื่อมต่อ EA"
    : !running ? "บอทหยุดอยู่ · แสดงสถานะล่าสุด"
    : marketClosed ? "รอเปิดตลาด"
    : signal === "GRID" ? "ติดตามคำสั่งกริดตามโหมดที่ใช้งาน"
    : signal === "MANUAL" ? "ใช้การควบคุมตามโหมด Manual"
    : signal === "BUY" || signal === "SELL" ? "ทิศทางที่ EA รายงานล่าสุด"
    : "EA กำลังติดตามจังหวะเข้า";
  const confidenceValue = analyzing
    ? numberValue(autoActive ? metrics.autoV20Confidence : metrics.signalConfidence) : null;
  const confidence = confidenceValue !== null && confidenceValue >= 0 && confidenceValue <= 100
    ? confidenceValue : null;
  const receivedAt = timestamp(props.observedAt);
  const price = (value: unknown) => {
    const parsed = online ? numberValue(value) : null;
    return parsed !== null && parsed > 0 ? parsed.toFixed(props.digits) : "—";
  };
  const hasAutoPlan = analyzing && autoActive && (numberValue(metrics.autoV20PlannedEntry) ?? 0) > 0;
  const rr = hasAutoPlan ? numberValue(metrics.autoV20RR) : null;
  const configuredLot = numberValue(metrics.configuredLot) ?? numberValue(props.lot);
  const lotLabel = configuredLot !== null && configuredLot > 0
    ? configuredLot.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + " Lot" : "—";
  const planRows = [
    { label: "Entry", value: hasAutoPlan ? price(metrics.autoV20PlannedEntry) : "—", tone: "muted" },
    { label: "Stop Loss", value: hasAutoPlan ? price(metrics.autoV20SlPrice) : "—", tone: "bad" },
    { label: "Take Profit", value: hasAutoPlan ? price(metrics.autoV20TpPrice) : "—", tone: "good" },
    { label: "Net RR", hint: "หลังหัก Spread · ค่าจาก EA", value: rr !== null && rr > 0 ? "1 : " + rr.toFixed(2) : "—", tone: "muted" },
    { label: "Position Size", hint: "Lot ที่ตั้งไว้", value: lotLabel, tone: "muted" }
  ];

  const entryReason = meaningfulCode(metrics.lastEntryReason);
  const blockReason = meaningfulCode(metrics.adaptiveBlockReason);
  const autoReason = autoActive
    ? meaningfulCode(metrics.autoV20RejectReason) || meaningfulCode(metrics.autoV20DecisionReason) : "";
  const decisionReason = autoReason
    || (entryReason || blockReason ? props.decisionLabel : "")
    || liveStatus.detail
    || "รอ EA รายงานเหตุผลการตัดสินใจ";
  const visibleReason = !online ? "รอข้อมูลการตัดสินใจจาก EA"
    : !running || marketClosed ? signalDetail : decisionReason;
  const demandLow = online ? numberValue(metrics.demandZoneLow) : null;
  const demandHigh = online ? numberValue(metrics.demandZoneHigh) : null;
  const supplyLow = online ? numberValue(metrics.supplyZoneLow) : null;
  const supplyHigh = online ? numberValue(metrics.supplyZoneHigh) : null;
  const hasDemand = demandLow !== null && demandHigh !== null && demandLow > 0 && demandHigh >= demandLow;
  const hasSupply = supplyLow !== null && supplyHigh !== null && supplyLow > 0 && supplyHigh >= supplyLow;
  const zoneDetail = [
    hasDemand ? "Demand " + price(demandLow) + "–" + price(demandHigh) : "",
    hasSupply ? "Supply " + price(supplyLow) + "–" + price(supplyHigh) : ""
  ].filter(Boolean).join(" · ") || "รอข้อมูลโซนจาก EA";
  const spreadKnown = online && (numberValue(metrics.spreadPoints) !== null || numberValue(metrics.spreadPrice) !== null);
  const spreadStatus = online ? meaningfulCode(metrics.spreadStatus).toUpperCase() : "";
  const spreadTone: Tone = !spreadKnown ? "muted" : spreadStatus === "NORMAL" ? "good" : "warn";
  const spread = spreadKnown ? props.spreadLabel : "—";
  const reasons = [
    { icon: "brain", title: "สถานะการตัดสินใจ", detail: visibleReason, badge: signal, tone: signalTone },
    { icon: "layers", title: "Supply / Demand", detail: zoneDetail, badge: hasDemand || hasSupply ? "ZONE" : "—", tone: "muted" as Tone },
    { icon: "spread", title: "สภาพ Spread", detail: spreadKnown ? spread : "รอข้อมูล Spread จาก EA", badge: spreadStatus || "—", tone: spreadTone }
  ];
  const timeframes = ["M5", "M15", "M30", "H1"].map(label => {
    const value = online ? numberValue(metrics["trend" + label]) : null;
    const direction = value === null ? "—" : value > 0 ? "BUY" : value < 0 ? "SELL" : "NEUTRAL";
    const tone: Tone = direction === "BUY" ? "good" : direction === "SELL" ? "bad" : "muted";
    return { label, value, direction, tone };
  });
  const knownTimeframes = timeframes.filter(item => item.value !== null).length;
  const buyFrames = timeframes.filter(item => item.direction === "BUY").length;
  const sellFrames = timeframes.filter(item => item.direction === "SELL").length;
  const alignmentLabel = knownTimeframes === 0 ? "รอข้อมูล Timeframe"
    : buyFrames > sellFrames ? buyFrames + "/" + knownTimeframes + " TF สนับสนุน BUY"
    : sellFrames > buyFrames ? sellFrames + "/" + knownTimeframes + " TF สนับสนุน SELL"
    : buyFrames > 0 ? "แนวโน้มหลายกรอบเวลายังต่างกัน" : "แนวโน้มยังเป็นกลาง";
  const regime = online && meaningfulCode(metrics.marketRegime) ? props.marketRegimeLabel : "—";
  const momentum = online ? numberValue(metrics.momentumPoints) : null;
  const positionCount = online ? numberValue(metrics.positions) : null;
  const maxPositions = numberValue(metrics.configuredMaxPositions) ?? props.maxPositions;
  const freeMargin = online ? numberValue(metrics.freeMargin) : null;
  const riskMode = online ? meaningfulCode(metrics.performanceRiskMode).toUpperCase() : "";
  const session = online ? meaningfulCode(metrics.sessionProfile).replace(/_/g, " ") : "";
  const readiness = !online ? "OFFLINE" : !running ? "PAUSED"
    : marketClosed ? "CLOSED" : platformReady ? "READY" : "WAIT";
  const readinessTone: Tone = readiness === "READY" ? "good" : readiness === "WAIT" || readiness === "CLOSED" ? "warn" : "muted";
  const readinessItems = [
    { icon: "spread", label: "Spread", value: spread, tone: spreadTone },
    { icon: "wallet", label: "Free Margin", value: freeMargin !== null ? freeMargin.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " " + props.currency : "—", tone: "muted" as Tone },
    { icon: "layers", label: "Positions", value: positionCount !== null ? positionCount + " / " + maxPositions : "—", tone: "muted" as Tone },
    { icon: "shield", label: "Risk Mode", value: riskMode.replace(/_/g, " ") || "—", tone: (riskMode === "NORMAL" ? "good" : riskMode ? "warn" : "muted") as Tone },
    { icon: "clock", label: "Session", value: marketClosed ? "MARKET CLOSED" : session || "—", tone: (marketClosed ? "warn" : "muted") as Tone }
  ];

  // A bounded history of status changes received by this page, not invented EA events.
  const observationKey = [state, execution, signal, visibleReason, marketClosed].join("|");
  useEffect(() => {
    if (!online || receivedAt === null) return;
    setObservations(previous => {
      const last = previous[previous.length - 1];
      if (last?.key === observationKey || (last && receivedAt <= last.time)) return previous;
      return [...previous, {
        key: observationKey,
        time: receivedAt,
        title: signal,
        detail: visibleReason.replace(/_/g, " "),
        tone: signalTone
      }].slice(-3);
    });
  }, [online, receivedAt, observationKey, signal, visibleReason, signalTone]);

  return <section className={"cc-decision-center " + styles.center} aria-label="SCENOVA AI Trade Decision Center">
    <header className={styles.header}>
      <div className={styles.identity}>
        <span className={styles.brandIcon}><ScenovaIcon name="brain" size={21}/></span>
        <div><h2><span>SCENOVA</span> AI TRADE DECISION CENTER</h2><p>ติดตามสัญญาณ แผนเทรด และเหตุผลจาก EA</p></div>
      </div>
      <div className={styles.headerMeta}>
        <span>{props.symbol} <i/> {mode.replace(/_/g, " ")}</span>
        <span className={styles.badge + " " + styles[online ? "good" : "muted"]}><i/>{online ? "EA ONLINE" : "WAITING EA"}</span>
      </div>
    </header>

    <div className={styles.cards}>
      <article className={styles.card + " " + styles.signalCard}>
        <CardHeading icon="spark" title="CURRENT SIGNAL"/>
        <div className={styles.signalLine}>
          <strong className={styles.signal + " " + styles[signalTone]}>{signal}</strong>
          <span className={styles.badge + " " + styles[analyzing ? "good" : "muted"]}>{analyzing ? "MONITORING" : "STANDBY"}</span>
        </div>
        <p className={styles.signalDetail}>{signalDetail}</p>
        <div className={styles.confidence}>
          <strong>{confidence !== null ? confidence.toFixed(0) + "%" : "—"}</strong>
          <div><b>CONFIDENCE</b><small>คะแนนสัญญาณจาก EA</small></div>
        </div>
        <div className={styles.confidenceTrack} role={confidence !== null ? "meter" : undefined} aria-label="คะแนนสัญญาณ EA" aria-valuemin={confidence !== null ? 0 : undefined} aria-valuemax={confidence !== null ? 100 : undefined} aria-valuenow={confidence ?? undefined}>
          <span style={{ width: (confidence ?? 0) + "%" }}/>
        </div>
        <div className={styles.signalFoot}><ScenovaIcon name="info" size={14}/><span>{receivedAt !== null ? "ข้อมูลล่าสุด " + clockLabel(receivedAt) + " · เวลาไทย" : "รอข้อมูลจาก EA"}</span></div>
      </article>

      <article className={styles.card}>
        <CardHeading icon="report" title="TRADE PLAN" detail={mode}/>
        <dl className={styles.planRows}>
          {planRows.map(row => <div key={row.label} title={row.hint}><dt>{row.label}{row.label === "Net RR" && <small>หลัง Spread</small>}</dt><dd className={row.value === "—" ? styles.muted : styles[row.tone as Tone]}>{row.value}</dd></div>)}
        </dl>
        <p className={styles.planNote}>{hasAutoPlan ? "แผนที่ EA รายงานล่าสุด · Lot แสดงค่าที่ตั้งไว้" : "Entry / SL / TP จะแสดงเมื่อโหมดนี้ส่งแผนมา"}</p>
      </article>

      <article className={styles.card}>
        <CardHeading icon="brain" title="DECISION REASONS"/>
        <div className={styles.reasons}>
          {reasons.map(reason => <div className={styles.reason} key={reason.title}>
            <span className={styles.reasonIcon + " " + styles[reason.tone]}><ScenovaIcon name={reason.icon} size={19}/></span>
            <div><b>{reason.title}</b><p title={reason.detail}>{reason.detail.replace(/_/g, " ")}</p></div>
            <span className={styles.reasonBadge + " " + styles[reason.tone]} title={reason.badge}>{reason.badge}</span>
          </div>)}
        </div>
      </article>

      <article className={styles.card}>
        <CardHeading icon="pnl" title="MULTI-TIMEFRAME"/>
        <div className={styles.timeframes}>
          {timeframes.map(item => <div key={item.label} className={styles.timeframe + " " + styles[item.tone]}>
            <b>{item.label}</b>
            <span className={styles.directionIcon}>{item.direction === "BUY" || item.direction === "SELL" ? <ScenovaIcon name={item.direction === "BUY" ? "arrow-up" : "arrow-down"} size={24}/> : <span>—</span>}</span>
            <strong>{item.direction}</strong>
            <small>{item.value === null ? "รอข้อมูล" : item.direction === "BUY" ? "ขาขึ้น" : item.direction === "SELL" ? "ขาลง" : "เป็นกลาง"}</small>
            <span className={styles.trendLine}/>
          </div>)}
        </div>
        <p className={styles.alignment}>{alignmentLabel}</p>
        <div className={styles.marketContext}>
          <span>Regime <b title={regime}>{regime}</b></span>
          <span>Momentum <b className={momentum === null || momentum === 0 ? styles.muted : momentum > 0 ? styles.good : styles.bad}>{momentum !== null ? (momentum > 0 ? "+" : "") + momentum.toFixed(1) + " pt" : "—"}</b></span>
        </div>
      </article>
    </div>

    <section className={styles.readiness} aria-label="ความพร้อมที่ระบบรายงาน">
      <div className={styles.readinessTitle} title={liveStatus.detail || liveStatus.label}>
        <ScenovaIcon name="settings" size={23}/><div><span>EXECUTION READINESS</span><b className={styles[readinessTone]}>{readiness}</b></div>
      </div>
      {readinessItems.map(item => <div className={styles.readinessItem} key={item.label} title={item.value === "—" ? "รอข้อมูลจาก EA" : item.value}>
        <ScenovaIcon name={item.icon} size={20}/><div><span>{item.label}</span><b className={styles[item.tone]}>{item.value}</b></div>
      </div>)}
    </section>

    <section className={styles.timeline} aria-label="ประวัติการเปลี่ยนสถานะที่หน้าเว็บรับ">
      <div className={styles.timelineTitle}><ScenovaIcon name="clock" size={19}/><div><h3>DECISION TIMELINE</h3><small>สถานะที่รับตั้งแต่เปิดหน้านี้ · เวลาไทย</small></div></div>
      {observations.length ? <ol className={styles.events}>
        {observations.map((event, index) => <li key={event.key + event.time} className={styles.event + " " + styles[event.tone]}>
          <span className={styles.eventDot}><ScenovaIcon name={index === observations.length - 1 ? "clock" : "status"} size={15}/></span>
          <div><time dateTime={new Date(event.time).toISOString()}>{clockLabel(event.time)}</time><b>{event.title}</b><p title={event.detail}>{event.detail}</p></div>
        </li>)}
      </ol> : <p className={styles.timelineEmpty}>เหตุการณ์จะแสดงเมื่อได้รับสถานะจาก EA</p>}
    </section>
  </section>;
}
