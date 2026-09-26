import Link from "next/link";
import { ScenovaBrand } from "../../../components/ScenovaBrand";
import { ScenovaIcon } from "../../../components/ScenovaIcon";
import styles from "./details.module.css";

const flow = [
  {
    number: "1",
    icon: "copy",
    title: "แชร์ลิงก์เชิญ",
    copy: "ส่งลิงก์หรือรหัสเชิญส่วนตัวของคุณให้คนที่ต้องการแนะนำเข้าสู่ SCENOVA"
  },
  {
    number: "2",
    icon: "users",
    title: "สมาชิกสมัครผ่านลิงก์",
    copy: "เมื่อสมัครผ่านลิงก์ ระบบจะเชื่อมสมาชิกคนนั้นเข้ากับเครือข่ายของคุณ"
  },
  {
    number: "3",
    icon: "wallet",
    title: "เกิดรายการที่เข้าเงื่อนไข",
    copy: "คอมมิชชั่นจะเกิดจากรายการชำระเงินที่ระบบกำหนดว่าเข้าเงื่อนไขเท่านั้น"
  },
  {
    number: "4",
    icon: "layers",
    title: "รับคอมมิชชั่นตามระดับ",
    copy: "ระบบคำนวณคอมมิชชั่นตามความสัมพันธ์ของสมาชิกในเครือข่ายสูงสุด 4 ระดับ"
  }
];

const levels = [
  { level: 1, rate: 7, label: "สมาชิกที่คุณเชิญโดยตรง" },
  { level: 2, rate: 5, label: "สมาชิกที่ถูกเชิญโดยระดับ 1" },
  { level: 3, rate: 3, label: "สมาชิกที่ถูกเชิญโดยระดับ 2" },
  { level: 4, rate: 1, label: "สมาชิกที่ถูกเชิญโดยระดับ 3" }
];

export default function ReferralDetailsPage() {
  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/referrals" aria-label="กลับไปหน้าระบบแนะนำเพื่อน">
          <ScenovaBrand className={styles.brand}/>
        </Link>
        <Link className={styles.backButton} href="/referrals">
          ← กลับหน้าระบบแนะนำเพื่อน
        </Link>
      </header>

      <section className={styles.hero}>
        <span className={styles.kicker}>คู่มือระบบแนะนำเพื่อน</span>
        <h1>ระบบแนะนำเพื่อนทำงานอย่างไร</h1>
        <p>
          ทำความเข้าใจตั้งแต่การแชร์ลิงก์ การเชื่อมสมาชิกเข้ากับเครือข่าย
          ไปจนถึงการคำนวณและถอนคอมมิชชั่น
        </p>
        <div className={styles.rateBanner}>
          <b>โครงสร้างคอมมิชชั่นสูงสุด 4 ระดับ</b>
          <span>อัตราคอมมิชชั่นของแต่ละระดับแสดงแยกอย่างชัดเจนด้านล่าง</span>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <span>01</span>
          <div>
            <h2>ขั้นตอนการทำงาน</h2>
            <p>ตั้งแต่แชร์ลิงก์จนถึงได้รับคอมมิชชั่น</p>
          </div>
        </div>

        <div className={styles.flow}>
          {flow.map((step, index) => (
            <div className={styles.flowItem} key={step.number}>
              <article className={styles.flowCard}>
                <span className={styles.stepNumber}>{step.number}</span>
                <div className={styles.flowIcon}><ScenovaIcon name={step.icon} size={22}/></div>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </article>
              {index < flow.length - 1 && <span className={styles.arrow}>→</span>}
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <span>02</span>
          <div>
            <h2>โครงสร้างเครือข่าย 4 ระดับ</h2>
            <p>ระดับจะอ้างอิงจากความสัมพันธ์ระหว่างสมาชิกแต่ละคนกับคุณ</p>
          </div>
        </div>

        <div className={styles.pyramidWrap}>
          <div className={styles.pyramid}>
            <div className={`${styles.pyramidRow} ${styles.youRow}`}>
              <div className={styles.youCard}>
                <small>บัญชีของคุณ</small>
                <b>เครือข่ายการแนะนำของคุณ</b>
              </div>
            </div>

            {levels.map(item => (
              <div
                key={item.level}
                className={`${styles.pyramidRow} ${styles["level" + item.level]}`}
              >
                <div className={styles.levelLabel}>
                  <span>ระดับ {item.level}</span>
                  <b>{item.rate}%</b>
                  <small>{item.label}</small>
                </div>
                <div className={styles.people} aria-hidden="true">
                  {Array.from({ length: item.level * 2 + 1 }).map((_, index) => (
                    <span key={index}><ScenovaIcon name="account" size={15}/></span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <aside className={styles.relativeNote}>
            <ScenovaIcon name="info" size={19}/>
            <div>
              <b>ระดับของสมาชิกเป็นแบบสัมพันธ์</b>
              <p>
                สมาชิกที่เป็นระดับ 2 ของคุณ ยังสามารถมีสมาชิกระดับ 1 ของตัวเองได้
                ระบบจะคำนวณระดับตามสายการแนะนำของแต่ละบัญชี
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <span>03</span>
          <div>
            <h2>ตัวอย่างการคำนวณคอมมิชชั่น</h2>
            <p>ตัวอย่างกรณีมีรายการชำระเงินที่เข้าเงื่อนไขจำนวน 1,000 บาท</p>
          </div>
        </div>

        <div className={styles.exampleGrid}>
          {levels.map(item => (
            <article className={styles.exampleCard} key={item.level}>
              <span>สมาชิกระดับ {item.level} ชำระ</span>
              <strong>1,000 บาท</strong>
              <small>คอมมิชชั่นของคุณ</small>
              <b>{item.rate * 10} บาท</b>
              <em>อัตรา {item.rate}%</em>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <span>04</span>
          <div>
            <h2>ตัวอย่างการกระจายคอมมิชชั่น</h2>
            <p>หนึ่งรายการสามารถสร้างคอมมิชชั่นให้สมาชิกที่อยู่เหนือผู้ซื้อได้สูงสุด 4 ระดับ</p>
          </div>
        </div>

        <div className={styles.saleExample}>
          <div className={styles.chain}>
            <div><b>A</b><small>ระดับ 4</small><strong>10 บาท</strong></div>
            <span>←</span>
            <div><b>B</b><small>ระดับ 3</small><strong>30 บาท</strong></div>
            <span>←</span>
            <div><b>C</b><small>ระดับ 2</small><strong>50 บาท</strong></div>
            <span>←</span>
            <div><b>D</b><small>ระดับ 1</small><strong>70 บาท</strong></div>
            <span>←</span>
            <div className={styles.buyer}><b>E</b><small>ผู้ซื้อ</small><strong>1,000 บาท</strong></div>
          </div>
          <div className={styles.totalLine}>
            <span>คอมมิชชั่นรวมจากตัวอย่างรายการนี้</span>
            <b>160 บาท</b>
            <em>คำนวณตามโครงสร้าง 4 ระดับ</em>
          </div>
        </div>

        <p className={styles.exampleExplanation}>
          ในตัวอย่างนี้ E เป็นระดับ 1 ของ D, ระดับ 2 ของ C, ระดับ 3 ของ B และระดับ 4 ของ A
          จึงเห็นได้ว่าระดับเดียวกันไม่ได้ตายตัว แต่ขึ้นอยู่กับตำแหน่งของสมาชิกแต่ละคนในเครือข่าย
        </p>
      </section>

      <section className={styles.rules}>
        <div className={styles.sectionTitle}>
          <span>05</span>
          <div>
            <h2>เงื่อนไขสำคัญ</h2>
            <p>หลักเกณฑ์ที่ควรรู้ก่อนใช้งานระบบแนะนำเพื่อน</p>
          </div>
        </div>

        <div className={styles.ruleGrid}>
          <div><ScenovaIcon name="status" size={17}/><span>คอมมิชชั่นเกิดจากรายการชำระเงินที่เข้าเงื่อนไขเท่านั้น</span></div>
          <div><ScenovaIcon name="close" size={17}/><span>Trial และสิทธิ์ใช้งานฟรีไม่สร้างคอมมิชชั่น</span></div>
          <div><ScenovaIcon name="wallet" size={17}/><span>คอมมิชชั่นคำนวณจากยอดชำระจริงที่เข้าเงื่อนไข</span></div>
          <div><ScenovaIcon name="clock" size={17}/><span>ยอดคอมมิชชั่นจะผ่านช่วงตรวจสอบก่อนเปลี่ยนเป็นยอดที่ถอนได้</span></div>
          <div><ScenovaIcon name="shield" size={17}/><span>ผู้แนะนำจะถูกผูกกับบัญชีตั้งแต่ขั้นตอนสมัครสมาชิก</span></div>
          <div><ScenovaIcon name="refresh" size={17}/><span>รายการคืนเงินหรือยกเลิกอาจทำให้คอมมิชชั่นที่เกี่ยวข้องถูกยกเลิก</span></div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div>
          <ScenovaBrand className={styles.footerBrand}/>
          <p>แชร์ลิงก์ สร้างเครือข่าย และติดตามคอมมิชชั่นได้จากบัญชีของคุณ</p>
        </div>
        <Link className={styles.primaryButton} href="/referrals">
          ไปหน้าระบบแนะนำเพื่อน <span>→</span>
        </Link>
      </footer>
    </main>
  );
}
