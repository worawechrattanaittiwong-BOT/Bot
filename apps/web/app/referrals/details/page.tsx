import Link from "next/link";
import { ScenovaBrand } from "../../../components/ScenovaBrand";
import { ScenovaIcon } from "../../../components/ScenovaIcon";
import styles from "./details.module.css";

const levels = [
  { level: 1, rate: 7, label: "สมาชิกที่คุณเชิญโดยตรง" },
  { level: 2, rate: 5, label: "สมาชิกที่ระดับ 1 ของคุณเชิญมา" },
  { level: 3, rate: 3, label: "สมาชิกที่ระดับ 2 ของคุณเชิญมา" },
  { level: 4, rate: 1, label: "สมาชิกที่ระดับ 3 ของคุณเชิญมา" }
];

const steps = [
  { icon: "copy", title: "แชร์ลิงก์ของคุณ", copy: "ส่งลิงก์หรือรหัสเชิญจากหน้าระบบแนะนำเพื่อนให้คนที่คุณต้องการแนะนำ" },
  { icon: "users", title: "เพื่อนสมัครผ่านลิงก์", copy: "สมาชิกจะเชื่อมกับผู้แนะนำตั้งแต่สมัคร และเป็นระดับ 1 ของผู้ที่เชิญโดยตรง" },
  { icon: "wallet", title: "มีรายการชำระเงิน", copy: "เมื่อสมาชิกชำระแพ็กเกจที่เข้าเงื่อนไข จะคำนวณคอมมิชชั่นจากยอดชำระจริง" },
  { icon: "check", title: "ติดตามและถอนยอด", copy: "คอมมิชชั่นเข้ายอดรอตรวจสอบ ก่อนเปลี่ยนเป็นยอดที่ถอนได้เมื่อผ่านเงื่อนไข" }
];

const questions = [
  { title: "สมาชิกในระดับเดียวกันมีได้กี่คน?", answer: "ไม่จำกัดจำนวนสมาชิกในแต่ละระดับ คุณรับคอมมิชชั่นจากรายการชำระเงินที่เข้าเงื่อนไขของสมาชิกทุกคนในระดับนั้น โดยนับลึกสูงสุด 4 ระดับจากบัญชีของคุณ" },
  { title: "คนที่เป็น L4 ของฉัน เป็น L1 ของคนอื่นได้ไหม?", answer: "ได้ ระดับนับจากบัญชีของผู้รับคอมมิชชั่นเสมอ เช่น คุณ → L1 → L2 → L3 → L4 คนที่อยู่ L4 ของคุณเป็นผู้ที่ L3 เชิญโดยตรง สำหรับรายการของคนนี้ คุณได้ 1% และผู้ที่เชิญเขาโดยตรงได้ 7%" },
  { title: "สมัครหรือเชิญเพื่อนแล้วได้เงินทันทีไหม?", answer: "การสมัครหรือการเชิญเพียงอย่างเดียวยังไม่สร้างคอมมิชชั่น ต้องมีรายการชำระเงินที่เข้าเงื่อนไขก่อน โดย Trial และสิทธิ์ใช้งานฟรีไม่สร้างคอมมิชชั่น" },
  { title: "ได้รับครบทั้ง 7% + 5% + 3% + 1% ต่อรายการไหม?", answer: "ไม่ใช่ สำหรับรายการชำระเงินหนึ่งรายการ คุณได้รับอัตราเดียวตามระดับของผู้ชำระเงินเมื่อเทียบกับคุณ เช่น ผู้ชำระเป็น L4 ของคุณ คุณได้ 1% ส่วนอัตราระดับอื่นเป็นของผู้แนะนำคนอื่นตามสายการแนะนำ" },
  { title: "ทำไมยอดคอมมิชชั่นยังถอนไม่ได้?", answer: "ยอดใหม่จะอยู่ในสถานะรอตรวจสอบก่อน เมื่อผ่านเงื่อนไขจึงเปลี่ยนเป็นยอดที่ถอนได้ ดูยอด สถานะ บัญชีรับเงิน และเงื่อนไขการถอนปัจจุบันได้ที่หน้าระบบแนะนำเพื่อน" }
];

export default function ReferralDetailsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <Link href="/referrals" aria-label="กลับหน้าระบบแนะนำเพื่อน"><ScenovaBrand className={styles.brand}/></Link>
          <Link className={styles.backButton} href="/referrals">← กลับหน้าระบบแนะนำเพื่อน</Link>
        </header>

        <section className={styles.hero} aria-labelledby="referral-title">
          <div className={styles.heroCopy}>
            <span className={styles.kicker}>SCENOVA / INVITE & EARN</span>
            <h1 id="referral-title">แนะนำเพื่อน<br/><span>ต่อยอดทุกการเชื่อมต่อ</span></h1>
            <p>รับคอมมิชชั่นจากยอดชำระที่เข้าเงื่อนไขของสมาชิกทุกคนในเครือข่าย นับจากคุณได้สูงสุด 4 ระดับ</p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryButton} href="/referrals">ไปที่ลิงก์เชิญของคุณ <span aria-hidden="true">↗</span></Link>
              <a className={styles.textLink} href="#commission-example">ดูตัวอย่างการคำนวณ ↓</a>
            </div>
            <div className={styles.heroNote}><ScenovaIcon name="users" size={16}/><span>ไม่จำกัดจำนวนสมาชิกในแต่ละระดับ · คิดตามยอดชำระจริง</span></div>
          </div>
          <aside className={styles.ratePreview} aria-label="อัตราคอมมิชชั่นของคุณ">
            <div className={styles.previewHeading}><span className={styles.kicker}>YOUR COMMISSION</span><ScenovaIcon name="layers" size={22}/></div>
            <h2>ทุกระดับ มีโอกาสให้คุณ</h2>
            <div className={styles.rateGrid}>
              {levels.map(item => <div key={item.level}><span>ระดับ {item.level}</span><strong>{item.rate}<small>%</small></strong></div>)}
            </div>
            <p>อัตราที่คุณได้รับต่อรายการของสมาชิก<br/>ตามระดับของสมาชิกคนนั้นเมื่อเทียบกับคุณ</p>
          </aside>
        </section>

        <nav className={styles.guideNav} aria-label="หัวข้อในคู่มือ">
          <a href="#how-it-works">01 <span>เริ่มต้นอย่างไร</span></a>
          <a href="#network">02 <span>เครือข่าย 4 ระดับ</span></a>
          <a href="#commission-example">03 <span>คำนวณรายได้</span></a>
          <a href="#conditions">04 <span>เงื่อนไขและคำถาม</span></a>
        </nav>

        <section className={styles.section} id="how-it-works">
          <div className={styles.sectionTitle}><span>01</span><div><h2>เริ่มจากลิงก์เดียวของคุณ</h2><p>จากการแนะนำเพื่อน สู่คอมมิชชั่นที่ติดตามได้ในบัญชี</p></div></div>
          <ol className={styles.flow}>
            {steps.map((step, index) => <li key={step.title} className={styles.flowCard}>
              <div className={styles.stepTop}><ScenovaIcon name={step.icon} size={23}/><span>0{index + 1}</span></div>
              <h3>{step.title}</h3><p>{step.copy}</p>
            </li>)}
          </ol>
        </section>

        <section className={styles.section} id="network">
          <div className={styles.sectionTitle}><span>02</span><div><h2>เข้าใจเครือข่ายจากมุมของคุณ</h2><p>รับจากสมาชิกทุกคนในแต่ละระดับ เมื่อมีรายการชำระเงินที่เข้าเงื่อนไข</p></div></div>
          <div className={styles.networkLayout}>
            <div className={styles.network}>
              <div className={styles.youCard}><span className={styles.youIcon}><ScenovaIcon name="account" size={22}/></span><div><b>คุณ</b><small>จุดเริ่มต้นในการนับระดับ</small></div><span className={styles.networkBadge}>สูงสุด 4 ระดับ</span></div>
              <div className={styles.levelList}>
                {levels.map(item => <article className={styles.levelRow} key={item.level}>
                  <span className={styles.levelNumber}>L{item.level}</span>
                  <div className={styles.levelCopy}><h3>{item.label}</h3><span>คิดจากรายการของทุกคนในระดับนี้</span></div>
                  <div className={styles.members} aria-hidden="true">{[0, 1, 2].map(index => <span key={index}><ScenovaIcon name="account" size={14}/></span>)}<small>···</small></div>
                  <strong className={styles.levelRate}>{item.rate}<small>%</small></strong>
                </article>)}
              </div>
            </div>
            <aside className={styles.networkNote}>
              <span className={styles.noteIcon}><ScenovaIcon name="users" size={24}/></span>
              <h3>หลายคนในระดับเดียวกัน<br/>ก็รับได้จากทุกคน</h3>
              <p>ถ้า L3 เชิญสมาชิกมา 100 คน ทั้ง 100 คนจะเป็น L4 ของคุณ คุณได้รับ 1% จากรายการชำระเงินที่เข้าเงื่อนไขของแต่ละคน</p>
              <div className={styles.noteDivider}/>
              <b>ระดับนับจากผู้รับแต่ละคน</b>
              <p>สมาชิกกลุ่มนี้เป็น L1 ของผู้ที่เชิญโดยตรง ผู้เชิญจึงได้ 7% ส่วนคุณได้ 1% จากรายการเดียวกัน</p>
              <a className={styles.textLink} href="#commission-example">ดูตัวอย่าง 100 คน ↓</a>
            </aside>
          </div>
        </section>

        <section className={styles.section} id="commission-example">
          <div className={styles.sectionTitle}><span>03</span><div><h2>เห็นภาพรายได้ ด้วยตัวเลขที่ชัดเจน</h2><p>ตัวอย่างต่อไปนี้ใช้ยอดชำระที่เข้าเงื่อนไข เพื่ออธิบายวิธีคำนวณ</p></div></div>
          <div className={styles.featuredExample}>
            <div className={styles.exampleIntro}><span className={styles.kicker}>100 MEMBERS / LEVEL 4</span><h3>L4 มี 100 คน คุณรับจากทั้ง 100 คน</h3><p>สมมติแต่ละคนชำระคนละ 1,000 บาท และทุกรายการเข้าเงื่อนไข</p></div>
            <div className={styles.formula} aria-label="100 คน คูณ 1,000 บาท คูณ 1 เปอร์เซ็นต์ เท่ากับคอมมิชชั่น 1,000 บาท">
              <div><b>100</b><span>สมาชิกระดับ 4</span></div><i aria-hidden="true">×</i>
              <div><b>1,000</b><span>บาท / คน</span></div><i aria-hidden="true">×</i>
              <div><b>1<small>%</small></b><span>อัตราของคุณ</span></div><i aria-hidden="true">=</i>
              <div className={styles.formulaResult}><b>1,000<small> บาท</small></b><span>คอมมิชชั่นรวมของคุณ</span></div>
            </div>
            <p className={styles.exampleFootnote}>คำนวณแยกต่อรายการแล้วรวมยอด หากมีเพียงบางคนชำระ จะคิดเฉพาะรายการที่เข้าเงื่อนไขของคนเหล่านั้น</p>
          </div>
          <div className={styles.subheading}><h3>ถ้ามีสมาชิกชำระ 1,000 บาท หนึ่งคน</h3><span>คุณได้เท่าไร ขึ้นอยู่กับระดับของเขา</span></div>
          <div className={styles.exampleGrid}>{levels.map(item => <article className={styles.exampleCard} key={item.level}>
            <div><span>สมาชิกระดับ {item.level}</span><em>{item.rate}%</em></div>
            <p>ยอดชำระ 1,000 บาท</p><strong>{item.rate * 10}<small> บาท</small></strong><span className={styles.exampleCaption}>คอมมิชชั่นของคุณต่อรายการ</span>
          </article>)}</div>
          <details className={styles.distribution}>
            <summary>หนึ่งรายการ แบ่งให้ผู้แนะนำแต่ละคนอย่างไร?<span aria-hidden="true">+</span></summary>
            <div className={styles.distributionBody}>
              <p>สมมติสายการแนะนำคือ A → B → C → D → E และ E ชำระ 1,000 บาท โดยผู้รับทุกคนมีสิทธิ์รับคอมมิชชั่น</p>
              <div className={styles.tableWrap}><table><caption>คอมมิชชั่นจากรายการของ E</caption><thead><tr><th scope="col">ผู้รับ</th><th scope="col">E เป็นระดับใดของผู้รับ</th><th scope="col">อัตรา</th><th scope="col">ได้รับ</th></tr></thead><tbody>
                <tr><th scope="row">D · ผู้เชิญ E โดยตรง</th><td>ระดับ 1</td><td>7%</td><td>70 บาท</td></tr>
                <tr><th scope="row">C</th><td>ระดับ 2</td><td>5%</td><td>50 บาท</td></tr>
                <tr><th scope="row">B</th><td>ระดับ 3</td><td>3%</td><td>30 บาท</td></tr>
                <tr><th scope="row">A</th><td>ระดับ 4</td><td>1%</td><td>10 บาท</td></tr>
              </tbody></table></div>
              <p>รวม 160 บาท แบ่งให้ผู้รับ 4 คนตามสายการแนะนำ แต่ละคนได้รับอัตราเดียวตามความสัมพันธ์กับ E</p>
            </div>
          </details>
        </section>

        <section className={styles.section} id="conditions">
          <div className={styles.sectionTitle}><span>04</span><div><h2>รู้เงื่อนไข ก่อนเริ่มแนะนำ</h2><p>รายละเอียดที่ช่วยให้คุณติดตามคอมมิชชั่นได้อย่างเข้าใจ</p></div></div>
          <div className={styles.ruleGrid}>
            <div><ScenovaIcon name="wallet" size={20}/><div><b>คิดจากยอดชำระจริง</b><p>เฉพาะรายการที่เข้าเงื่อนไข ไม่รวม Trial หรือสิทธิ์ฟรี และการสมัครอย่างเดียวไม่เกิดคอมมิชชั่น</p></div></div>
            <div><ScenovaIcon name="account" size={20}/><div><b>บัญชีผู้รับต้องพร้อมใช้งาน</b><p>บัญชีผู้รับคอมมิชชั่นต้องมีสถานะใช้งานอยู่ (ACTIVE) เมื่อคำนวณรายการ</p></div></div>
            <div><ScenovaIcon name="clock" size={20}/><div><b>ตรวจสอบก่อนถอน</b><p>ยอดใหม่เข้ารอตรวจสอบ ก่อนเปลี่ยนเป็นยอดที่ถอนได้ ติดตามสถานะได้จากกระเป๋าคอมมิชชั่น</p></div></div>
            <div><ScenovaIcon name="refresh" size={20}/><div><b>ยอดอาจเปลี่ยนตามรายการ</b><p>รายการที่คืนเงินหรือยกเลิกอาจทำให้คอมมิชชั่นที่เกี่ยวข้องถูกยกเลิกด้วย</p></div></div>
          </div>
          <div className={styles.subheading}><h3>คำถามที่พบบ่อย</h3></div>
          <div className={styles.faq}>{questions.map(question => <details key={question.title}><summary>{question.title}<span aria-hidden="true">+</span></summary><p>{question.answer}</p></details>)}</div>
        </section>

        <footer className={styles.footer}>
          <div><span className={styles.kicker}>YOUR NEXT CONNECTION</span><h2>เริ่มต้นจากการแนะนำของคุณ</h2><p>คัดลอกลิงก์เชิญ ดูสมาชิกในเครือข่าย และติดตามยอดคอมมิชชั่นได้ในที่เดียว</p></div>
          <Link className={styles.primaryButton} href="/referrals">ไปหน้าระบบแนะนำเพื่อน <span aria-hidden="true">↗</span></Link>
        </footer>
      </div>
    </main>
  );
}
