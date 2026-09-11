import type { CSSProperties } from "react";
import SiteHeader from "../components/SiteHeader";
import { ScenovaBrand } from "../components/ScenovaBrand";
import { ScenovaIcon } from "../components/ScenovaIcon";
import { LandingControls } from "../components/LandingControls";
import styles from "./home.module.css";

const capabilities = [
  { icon: "control", title: "Control Center", detail: "ทุกคำสั่ง อยู่ในมือคุณ" },
  { icon: "cloud", title: "Cloud + Local", detail: "เลือกได้ตามรูปแบบการใช้งาน" },
  { icon: "strategy", title: "MT5 Connected", detail: "เชื่อมบัญชีเทรดของคุณ" },
  { icon: "shield", title: "Risk Management", detail: "กำหนดความเสี่ยงได้ด้วยตัวเอง" },
];
const steps = [
  { icon: "account", title: "สร้างบัญชี SCENOVA", detail: "สมัครด้วยอีเมล รับ User ID เพื่อเปิดใช้งาน Trial หรือแพ็กเกจสมาชิก", tag: "YOUR ACCOUNT" },
  { icon: "layers", title: "เชื่อมต่อบัญชี MT5", detail: "เลือก Cloud หรือ Local พร้อมระบุโบรกเกอร์และเซิร์ฟเวอร์ที่คุณใช้งาน", tag: "YOUR CONNECTION" },
  { icon: "control", title: "ตั้งค่า แล้วเริ่มควบคุม", detail: "กำหนดการออกออเดอร์และความเสี่ยง พร้อมติดตามสถานะจาก Control Center", tag: "YOUR CONTROL" },
];

export default function Home() {
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#main-content">ข้ามไปยังเนื้อหา</a>
      <SiteHeader />
      <main id="main-content">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroGrid} aria-hidden="true" />
          <div className={`${styles.container} ${styles.heroInner}`}>
            <div className={styles.heroCopy}>
              <div className={styles.eyebrow}><span /> INTELLIGENT MT5 AUTOMATION</div>
              <ScenovaBrand className={styles.heroLogo} />
              <p className={styles.brandLine}>PRECISION IN MOTION.</p>
              <h1 id="hero-title">ระบบเทรดอัตโนมัติ<br /><span>ที่คุณควบคุมได้</span></h1>
              <p className={styles.heroDescription}>เชื่อมโลกการเทรดเข้ากับเทคโนโลยี SCENOVA<br className={styles.desktopBreak} /> ตั้งค่าบอท ดูสถานะ และจัดการความเสี่ยงบน MT5<br className={styles.desktopBreak} /> ผ่านพื้นที่ควบคุมเดียว ทั้งบนคอมพิวเตอร์และมือถือ</p>
              <div className={styles.actions}>
                <a className={styles.primaryButton} href="/login?mode=register">เริ่มต้นกับ SCENOVA <span aria-hidden="true">↗</span></a>
                <a className={styles.secondaryButton} href="#how"><ScenovaIcon name="play" size={16} /> รู้จักการทำงาน</a>
              </div>
              <div className={styles.heroNote}><ScenovaIcon name="clock" size={15} /> ทดลองใช้งาน 3 ชั่วโมง หลังผู้ดูแลอนุมัติ</div>
            </div>
            <div className={styles.mascotStage}>
              <div className={styles.mascotAura} aria-hidden="true" />
              <div className={styles.orbit} aria-hidden="true" />
              <div className={styles.particles} aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ "--x": `${7 + ((i * 29) % 86)}%`, "--y": `${12 + ((i * 37) % 76)}%`, "--delay": `${-(i * 0.8)}s`, "--duration": `${5 + (i % 5)}s` } as CSSProperties} />)}</div>
              <img className={styles.mascotImage} src="/assets/scenova-nova-mascot-v1.webp" width={1536} height={1024} alt="NOVA มาสคอตเสือดำเกราะจักรกลของ SCENOVA คู่กับกล่องผลิตภัณฑ์ ท่ามกลางวงแหวนพลังงานสีฟ้า" fetchPriority="high" />
              <div className={`${styles.artLabel} ${styles.artLabelTop}`}><ScenovaIcon name="brain" size={20} /><div><small>BUILT FOR AUTOMATION</small><b>เทคโนโลยีที่พร้อมเคียงข้าง</b></div></div>
              <div className={styles.mascotIdentity}><span className={styles.identityRule} /><div><small>MEET YOUR DIGITAL GUARDIAN</small><b>NOVA<span> / SCENOVA MASCOT</span></b></div><span className={styles.identityIndex}>01</span></div>
            </div>
          </div>
          <div className={`${styles.container} ${styles.heroFoot}`}><span>DESIGNED FOR YOUR TRADING JOURNEY</span><a href="#how">สำรวจ SCENOVA <span aria-hidden="true">↓</span></a></div>
        </section>
        <div className={styles.capabilities}><div className={`${styles.container} ${styles.capabilityGrid}`}>{capabilities.map(item => <div className={styles.capability} key={item.title}><span className={styles.iconTile}><ScenovaIcon name={item.icon} size={23} /></span><div><b>{item.title}</b><p>{item.detail}</p></div></div>)}</div></div>
        <section className={`${styles.container} ${styles.section}`} id="how" aria-labelledby="how-title">
          <div className={styles.sectionHeader}><div><div className={styles.kicker}>01 / GET CONNECTED</div><h2 id="how-title">จากบัญชีของคุณ<br /><span>สู่การควบคุมที่เป็นระบบ</span></h2></div><p>เริ่มต้นเพียง 3 ขั้นตอน<br />พร้อมดูแลทุกการทำงานจากหน้าเว็บเดียว</p></div>
          <div className={styles.steps}>{steps.map((step, index) => <article className={styles.step} key={step.title}><div className={styles.stepTop}><span className={styles.stepNumber}>0{index + 1}</span><ScenovaIcon name={step.icon} size={28} /><span className={styles.stepArrow} aria-hidden="true">↗</span></div><small>{step.tag}</small><h3>{step.title}</h3><p>{step.detail}</p></article>)}</div>
        </section>
        <section className={`${styles.container} ${styles.deploymentSection}`} id="modes" aria-labelledby="modes-title">
          <div className={styles.deploymentCopy}><div className={styles.kicker}>02 / YOUR WAY TO CONNECT</div><h2 id="modes-title">อุปกรณ์ต่างกัน<br /><span>ประสบการณ์เดียวกัน</span></h2><p>เลือกการเชื่อมต่อที่เข้ากับคุณ<br />แล้วให้ SCENOVA เป็นศูนย์กลางการสั่งงาน</p><a className={styles.textLink} href="/login?mode=register">สร้างบัญชีเพื่อเริ่มเชื่อมต่อ <span aria-hidden="true">↗</span></a></div>
          <LandingControls />
        </section>
        <section className={`${styles.container} ${styles.trialSection}`} aria-labelledby="trial-title">
          <div className={styles.trialGlow} aria-hidden="true" />
          <div className={styles.trialCopy}><div className={styles.kicker}>YOUR NEXT CHAPTER</div><h2 id="trial-title">พบกับ SCENOVA<br /><span>ในแบบของคุณ</span></h2><p>สร้างบัญชีและรับ User ID เพื่อขอทดลองใช้งาน 3 ชั่วโมง<br />เริ่มนับเมื่อใช้งานครั้งแรก หลังได้รับอนุมัติจากผู้ดูแล</p></div>
          <div className={styles.trialAction}><a className={styles.primaryButton} href="/login?mode=register">สร้างบัญชี SCENOVA <span aria-hidden="true">↗</span></a><a href="/login">มีบัญชีอยู่แล้ว? <span>เข้าสู่ระบบ →</span></a></div>
        </section>
      </main>
      <footer className={`${styles.container} ${styles.footer}`}><a href="/" aria-label="SCENOVA หน้าแรก"><ScenovaBrand className={styles.footerLogo} /></a><span>MT5 AUTOMATION. HUMAN CONTROL.</span><a href="#how">วิธีเริ่มใช้งาน ↗</a></footer>
    </div>
  );
}
