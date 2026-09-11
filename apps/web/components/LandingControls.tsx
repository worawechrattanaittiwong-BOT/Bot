"use client";

import { useId, useState } from "react";
import { ScenovaIcon } from "./ScenovaIcon";
import styles from "../app/home.module.css";

const modes = {
  cloud: { label: "Cloud", icon: "cloud", title: "เปิดโลกการเทรด จากมือถือ", detail: "MT5 และ EA ทำงานบน Trading Server ของระบบ คุณติดตามและสั่งงานผ่านเว็บได้จากทุกอุปกรณ์", tags: ["ใช้ผ่านมือถือได้", "ทำงานบนเซิร์ฟเวอร์", "ควบคุมผ่านเว็บ"], endpoint: "SCENOVA CLOUD", caption: "บอททำงานบน Trading Server ตามการตั้งค่าของคุณ" },
  local: { label: "Local", icon: "strategy", title: "ใช้ MT5 บนเครื่องของคุณ", detail: "ติดตั้ง SCENOVA Agent เพื่อเชื่อม MT5 บน PC หรือ VPS ของคุณ แล้วสั่งเริ่ม หยุด และตั้งค่าบอทผ่านเว็บ", tags: ["PC หรือ VPS ของคุณ", "เชื่อมด้วย Agent", "ควบคุมผ่านเว็บ"], endpoint: "YOUR PC / VPS", caption: "เปิดเครื่อง MT5 และ Agent ไว้ระหว่างการทำงาน" },
};

export function LandingControls() {
  const [mode, setMode] = useState<keyof typeof modes>("cloud");
  const id = useId();
  const selected = modes[mode];
  const keys = Object.keys(modes) as Array<keyof typeof modes>;
  return (
    <div className={styles.modePanel}>
      <div className={styles.modeTabs} role="tablist" aria-label="รูปแบบการเชื่อมต่อ">
        {keys.map(key => <button type="button" key={key} id={`${id}-${key}-tab`} role="tab" aria-selected={mode === key} aria-controls={`${id}-panel`} tabIndex={mode === key ? 0 : -1} className={mode === key ? styles.selectedTab : ""} onClick={() => setMode(key)} onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? "cloud" : event.key === "End" ? "local" : mode === "cloud" ? "local" : "cloud";
          setMode(next);
          document.getElementById(`${id}-${next}-tab`)?.focus();
        }}><ScenovaIcon name={modes[key].icon} size={18} /> {modes[key].label}<span>MODE</span></button>)}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${mode}-tab`} tabIndex={0} className={styles.modeContent}>
        <div className={styles.connectionDiagram} aria-label={`เว็บ SCENOVA เชื่อม ${selected.endpoint} และ MT5`}>
          <div className={styles.connectionNode}><ScenovaIcon name="control" size={28} /><span>YOUR CONTROL</span></div><div className={styles.connectionLine} aria-hidden="true"><i /></div><div className={`${styles.connectionNode} ${styles.connectionCore}`}><ScenovaIcon name={selected.icon} size={35} /><span>{selected.endpoint}</span></div><div className={styles.connectionLine} aria-hidden="true"><i /></div><div className={styles.connectionNode}><ScenovaIcon name="strategy" size={28} /><span>MT5 + EA</span></div>
        </div>
        <h3>{selected.title}</h3><p>{selected.detail}</p><div className={styles.modeTags}>{selected.tags.map(tag => <span key={tag}><ScenovaIcon name="status" size={13} />{tag}</span>)}</div><small className={styles.modeCaption}>{selected.caption}</small>
      </div>
      <details className={styles.motionControls}><summary>การแสดงผลแอนิเมชัน</summary><label><input type="checkbox" onChange={event => { event.currentTarget.closest(`.${styles.page}`)?.classList.toggle(styles.motionPaused, event.currentTarget.checked); }} /> หยุดภาพเคลื่อนไหว</label></details>
    </div>
  );
}
