"use client";

import { useEffect, useRef, useState } from "react";
import { ScenovaIcon } from "./ScenovaIcon";
import styles from "./Mt5ConnectionExperience.module.css";

type Props = {
  account?: { account_number?: string; broker?: string; broker_server?: string } | null;
  online: boolean;
  busy: boolean;
  downloadBlocked: boolean;
  apiBase: string;
  message: string;
  error: string;
  onDownload: () => Promise<void>;
};

const steps = [
  { title: "เตรียม MT5 และบัญชี", short: "เตรียม MT5", icon: "account" },
  { title: "ติดตั้ง SCENOVA", short: "ติดตั้ง", icon: "arrow-down" },
  { title: "ตั้งค่า MT5 ให้พร้อม", short: "ตั้งค่า MT5", icon: "settings" },
  { title: "เปิด FastBasketBot บนกราฟ", short: "เปิด EA", icon: "bot" },
  { title: "โหลดไฟล์ตั้งค่า .set", short: "โหลดค่า", icon: "layers" },
  { title: "ตรวจสถานะ แล้วเริ่มใช้งาน", short: "ตรวจสถานะ", icon: "status" },
];

export function Mt5ConnectionExperience(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [copyState, setCopyState] = useState("");
  const showGuide = (index = 0) => { setStep(index); setOpen(true); };
  useEffect(() => {
    if (!open) return;
    const el = dialog.current;
    const overflow = document.body.style.overflow;
    el?.showModal();
    document.body.style.overflow = "hidden";
    return () => { el?.close(); document.body.style.overflow = overflow; };
  }, [open]);
  useEffect(() => { content.current?.scrollTo({ top: 0 }); setCopyState(""); }, [step]);
  async function copyAddress() {
    try { await navigator.clipboard.writeText(props.apiBase); setCopyState("คัดลอกแล้ว"); }
    catch { setCopyState("คัดลอกไม่สำเร็จ กรุณาเลือกและคัดลอกที่อยู่ด้านบน"); }
  }
  const statusText = props.online ? "เชื่อมต่อแล้ว" : "รอเชื่อมต่อ MT5";
  return (
    <div className={styles.root}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1>เชื่อมต่อ <em>MT5</em><br/>ให้พร้อม<span>ใช้งาน</span></h1>
          <p>เริ่มใช้งาน SCENOVA EA ในไม่กี่ขั้นตอน<br/>เชื่อมบัญชีของคุณ แล้วควบคุมบอทได้จากหน้าเดียว</p>
          <div className={styles.benefits}>
            {[ ["shield", "บัญชีของคุณ", "ตรวจข้อมูลก่อนเริ่ม"], ["spark", "ใช้งานง่าย", "มีคู่มือทุกขั้นตอน"], ["pnl", "ควบคุมได้", "เริ่มและหยุดด้วยตัวคุณ"] ].map(([icon,title,desc]) => (
              <div key={title}><span><ScenovaIcon name={icon} size={23}/></span><div><b>{title}</b><small>{desc}</small></div></div>
            ))}
          </div>
        </div>
        <div className={styles.connect}>
          <div className={`${styles.connectionStatus} ${props.online ? styles.online : styles.waiting}`} role="status">
            <ScenovaIcon name={props.online ? "status" : "clock"} size={34}/>
            <div><b>{statusText}</b><small>{props.online ? "MT5 ส่งสถานะมายัง SCENOVA แล้ว" : "ทำตามคู่มือเพื่อเชื่อมบัญชีของคุณ"}</small></div>
          </div>
          <button className={styles.primary} onClick={() => showGuide()}>{props.online ? "ติดตั้ง / อัปเดต" : "เริ่มเชื่อมต่อ"}<span>→</span></button>
          <button className={styles.textButton} onClick={() => showGuide(2)}>ติดตั้งแล้ว? ดูวิธีตั้งค่า MT5</button>
        </div>
        <div className={styles.art}>
          <img src="/assets/scenova-mt5-companion-v2.png" alt="มาสคอต SCENOVA ตัวกลมสีขาวม่วง อยู่ข้างหน้าจอ MT5"/>
          <span className={styles.artCaption}>Your trading<br/>companion.</span>
        </div>
      </section>

      <div className={styles.middle}>
        <section className={styles.stepsPanel}>
          <h2>ทำตาม 3 ขั้นตอนนี้</h2><p>ตั้งแต่เปิด MT5 จนเชื่อมต่อสำเร็จ มีคำแนะนำให้ทุกขั้นตอน</p>
          <div className={styles.steps}>
            {[{icon:"strategy",title:"เปิด MT5 และเข้าสู่ระบบ",desc:"เปิดโปรแกรม MT5 แล้วเข้าสู่ระบบด้วยบัญชีเทรดของคุณ",index:0},
              {icon:"arrow-down",title:"ติดตั้ง SCENOVA",desc:"ดาวน์โหลดและเปิดตัวติดตั้งบนคอมพิวเตอร์ Windows",index:1},
              {icon:"bot",title:"เปิด EA แล้วเริ่มใช้งาน",desc:"โหลดไฟล์ตั้งค่า ตรวจการเชื่อมต่อ แล้วเริ่มบอทเมื่อพร้อม",index:3}].map((item,i) => (
              <button className={styles.stepCard} key={item.title} onClick={() => showGuide(item.index)}>
                <span className={styles.stepNumber}>{i+1}</span><span className={styles.stepIcon}><ScenovaIcon name={item.icon} size={30}/></span>
                <b>{item.title}</b><small>{item.desc}</small><span className={styles.stepLink}>ดูขั้นตอนละเอียด →</span>
              </button>
            ))}
          </div>
        </section>
        <section className={styles.tutorial}>
          <h2>ติดตั้งตามได้ทีละขั้น</h2><p>คู่มือพร้อมภาพประกอบ<br/>แม้เพิ่งเคยติดตั้ง EA ก็เริ่มได้</p>
          <img src="/assets/scenova-mt5-companion-v2.png" alt="หน้าจอ MT5 และผู้ช่วย SCENOVA" loading="lazy"/>
          <button className={styles.guideButton} onClick={() => showGuide()}><ScenovaIcon name="book" size={22}/>ดูวิธีติดตั้ง <span>→</span></button>
        </section>
      </div>

      <div className={styles.bottom}>
        <section className={styles.account}>
          <h2>ข้อมูลบัญชี MT5 ของคุณ</h2><p>ตรวจสอบบัญชีที่ผูกไว้และสถานะการเชื่อมต่อปัจจุบัน</p>
          <div className={styles.accountFields}>
            <div><ScenovaIcon name="account" size={27}/><span><small>หมายเลขบัญชี</small><b>{props.account?.account_number || "ยังไม่พบบัญชี"}</b></span></div>
            <div><ScenovaIcon name="wallet" size={27}/><span><small>โบรกเกอร์</small><b>{props.account?.broker || "—"}</b></span></div>
            <div><ScenovaIcon name="layers" size={27}/><span><small>เซิร์ฟเวอร์</small><b>{props.account?.broker_server || "—"}</b></span></div>
            <div><span><small>สถานะการเชื่อมต่อ</small><b className={props.online ? styles.good : styles.pending}>● {statusText}</b></span></div>
          </div>
        </section>
        <section className={styles.help}>
          <div><ScenovaIcon name="chat" size={30}/><div><h2>ติดตั้งไม่สำเร็จ?</h2><p>ดูวิธีแก้ปัญหาเชื่อมต่อ<br/>และสิ่งที่ต้องตรวจใน MT5</p></div></div>
          <button className={styles.secondary} onClick={() => showGuide(5)}>ดูวิธีแก้ปัญหา <span>→</span></button>
        </section>
      </div>

      <dialog ref={dialog} className={styles.dialog} aria-labelledby="mt5-guide-heading" onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
        <div className={styles.dialogInner}>
          <header><div><small>SCENOVA · INSTALLATION GUIDE</small><h2 id="mt5-guide-heading">วิธีติดตั้งและเชื่อมต่อ MT5</h2></div><button autoFocus className={styles.close} onClick={() => setOpen(false)} aria-label="ปิดคู่มือติดตั้ง"><ScenovaIcon name="close"/></button></header>
          <div className={styles.guideLayout}>
            <nav aria-label="ขั้นตอนติดตั้ง">{steps.map((s,i) => <button key={s.title} className={step === i ? styles.selected : ""} aria-current={step === i ? "step" : undefined} onClick={() => setStep(i)}><span>{String(i+1).padStart(2,"0")}</span>{s.short}</button>)}</nav>
            <div ref={content} className={styles.guideContent}>
              <div className={styles.guideHeading}><ScenovaIcon name={steps[step].icon} size={30}/><div><small>ขั้นตอน {step+1} / {steps.length}</small><h3>{steps[step].title}</h3></div></div>
              {step === 0 && <><ol>
                <li>เปิด <b>MetaTrader 5</b> แล้ว Login บัญชีที่ต้องการใช้ผ่าน <b>File → Login to Trade Account</b></li>
                <li>เช็กเลขบัญชีและ <b>Server</b> ให้ตรงกับบัญชีของคุณ</li>
                <li>เปิดกราฟที่ต้องการใช้งาน เช่น <b>XAUUSDm</b></li>
              </ol><aside>ถ้ามี MT5 หลายตัว ให้ทำขั้นตอนนี้บนตัวที่ Login บัญชีนี้อยู่</aside></>}
              {step === 1 && <><ol>
                <li>กด <b>ดาวน์โหลดตัวติดตั้ง</b> แล้วเปิดไฟล์ SCENOVA Setup</li>
                <li>ติดตั้งตามหน้าจอจนเสร็จ</li>
                <li>กลับมาที่ MT5 ตัวที่ต้องการใช้ แล้วไปขั้นตอนถัดไป</li>
              </ol>
                <button className={styles.primary} disabled={props.busy || props.downloadBlocked} onClick={() => void props.onDownload()}>
                  {props.busy ? "กำลังเตรียมไฟล์…" : "ดาวน์โหลดตัวติดตั้ง Windows"}<ScenovaIcon name="arrow-down"/>
                </button>
                {props.downloadBlocked && <aside>หยุดบอทและจัดการออเดอร์ที่เปิดอยู่ให้เรียบร้อยก่อนติดตั้งหรืออัปเดต</aside>}
                {props.message && <p role="status" className={styles.good}>{props.message}</p>}
                {props.error && <p role="alert" className={styles.failure}>{props.error}</p>}
              </>}
              {step === 2 && <><ol>
                <li>ที่ MT5 กด <b>Tools → Options</b></li>
                <li>เปิดแท็บ <b>Expert Advisors</b></li>
                <li>ติ๊ก <b>Allow algorithmic trading</b></li>
                <li>ติ๊ก <b>Allow WebRequest for listed URL</b> แล้วเพิ่ม URL ด้านล่าง จากนั้นกด <b>OK</b></li>
              </ol>
                <div className={styles.address}>
                  <code>{props.apiBase || "กำลังโหลดที่อยู่เชื่อมต่อ…"}</code>
                  <button className={styles.secondary} disabled={!props.apiBase} onClick={() => void copyAddress()}><ScenovaIcon name="copy"/>คัดลอก</button>
                </div>
                <small role="status">{copyState}</small>
                <div className={styles.screenshotGrid}>
                  <figure className={styles.screenshotCard}>
                    <img className={styles.screenshot} src="/assets/mt5-guide-tools-options.webp" alt="เมนู Tools ของ MT5 โดยมี Options อยู่ด้านล่าง"/>
                    <figcaption>1. Tools → Options</figcaption>
                  </figure>
                  <figure className={styles.screenshotCard}>
                    <img className={styles.screenshot} src="/assets/mt5-guide-experts-webrequest.webp" alt="หน้า Expert Advisors ของ MT5 ที่เปิด Algorithmic trading และ WebRequest"/>
                    <figcaption>2. เปิด Algorithmic trading และ WebRequest แล้วเพิ่ม URL ของ SCENOVA</figcaption>
                  </figure>
                </div>
                <aside>ไม่ต้องเปิด <b>Allow DLL imports</b> สำหรับขั้นตอนนี้</aside>
              </>}
              {step === 3 && <><ol>
                <li>กด <kbd>Ctrl</kbd> + <kbd>N</kbd> เพื่อเปิด <b>Navigator</b></li>
                <li>ไปที่ <b>Expert Advisors → SCENOVA → FastBasketBot</b></li>
                <li>ลาก <b>FastBasketBot</b> ลงบนกราฟ หากมี EA อยู่แล้วให้กด <kbd>F7</kbd></li>
                <li>แท็บ <b>Common</b> ให้ติ๊ก <b>Allow Algo Trading</b> แล้วไปแท็บ Inputs</li>
              </ol>
                <div className={styles.screenshotGrid}>
                  <figure className={styles.screenshotCard}>
                    <img className={styles.screenshot} src="/assets/mt5-guide-navigator.webp" alt="Navigator ของ MT5 แสดง Expert Advisors โฟลเดอร์ SCENOVA และ FastBasketBot"/>
                    <figcaption>หา FastBasketBot ใน Expert Advisors → SCENOVA</figcaption>
                  </figure>
                  <figure className={styles.screenshotCard}>
                    <img className={styles.screenshot} src="/assets/mt5-guide-common.png" alt="แท็บ Common ของ FastBasketBot พร้อมช่อง Allow Algo Trading"/>
                    <figcaption>เปิด Allow Algo Trading ก่อนโหลดค่าที่แท็บ Inputs</figcaption>
                  </figure>
                </div>
                <aside>หา FastBasketBot ไม่เจอ ให้คลิกขวาใน Navigator → Refresh และเช็กว่าเปิด MT5 ตัวเดียวกับที่ติดตั้งไว้</aside>
              </>}
              {step === 4 && <><ol>
                <li>เปิดแท็บ <b>Inputs</b> แล้วกด <b>Load</b></li>
                <li>เลือก <b>SCENOVA-FastBasketBot.set</b> ใน <b>MQL5 → Presets</b></li>
                <li>ตรวจว่า <b>InpApiBase</b>, <b>InpInstanceId</b> และ <b>InpInstallToken</b> มีค่าแล้ว</li>
                <li>กด <b>OK</b> เพื่อบันทึก</li>
              </ol>
                <img className={`${styles.screenshot} ${styles.screenshotSolo}`} src="/assets/mt5-guide-inputs.png" alt="แท็บ Inputs ของ FastBasketBot พร้อมปุ่ม Load"/>
                <div className={styles.example}>
                  <span>หลังโหลดไฟล์ .set ให้มีค่าประมาณนี้</span>
                  <b>InpApiBase</b><code>{props.apiBase}</code>
                  <b>InpInstanceId · ••••••••••</b>
                  <b>InpInstallToken · ••••••••••</b>
                </div>
                <aside>อย่าพิมพ์หรือเดา Install Token เอง และอย่าส่งต่อไฟล์ .set ของบัญชีคุณ</aside>
              </>}
              {step === 5 && <><ol>
                <li>เปิดปุ่ม <b>Algo Trading</b> บนแถบเครื่องมือ MT5</li>
                <li>รอให้ EA เชื่อมต่อ แล้วกลับมาดูสถานะในหน้า SCENOVA</li>
                <li>เช็กบัญชีและ Server ให้ตรงกับที่ต้องการใช้</li>
                <li>เมื่อขึ้นเชื่อมต่อแล้ว ไปที่ <b>Control Center → เริ่มบอท</b> เมื่อคุณพร้อม</li>
              </ol>
                <div className={`${styles.connectionStatus} ${props.online ? styles.online : styles.waiting}`} role="status">
                  <ScenovaIcon name={props.online ? "status" : "clock"} size={30}/>
                  <div><b>{statusText}</b><small>สถานะล่าสุดที่หน้าเว็บได้รับจาก EA</small></div>
                </div>
                <div className={styles.faq}>
                  <details><summary>Agent เชื่อมแล้ว แต่ยังรอ EA</summary><p>เช็ก FastBasketBot บนกราฟ, WebRequest และโหลดไฟล์ .set ของบัญชีนี้อีกครั้ง</p></details>
                  <details><summary>ยังไม่ขึ้น CONNECTED</summary><p>เช็ก URL ใน Tools → Options → Expert Advisors ให้ตรงทุกตัว แล้วดูข้อความในแท็บ Experts / Journal ของ MT5</p></details>
                  <details><summary>ไม่มีไฟล์ .set หรือช่องรหัสยังว่าง</summary><p>ไปที่ File → Open Data Folder → MQL5 → Presets ถ้าไม่มีไฟล์ ให้ติดตั้งใหม่สำหรับ MT5 ตัวนี้</p></details>
                  <details><summary>ต้องการเปลี่ยนบัญชี Demo / Real</summary><p>จัดการออเดอร์เดิมก่อน Login บัญชีใหม่ แล้วกลับมาหน้า SCENOVA เพื่อตรวจบัญชีอีกครั้ง</p></details>
                </div>
              </>}
            </div>
          </div>
          <footer><span>ขั้นตอน {step+1} จาก {steps.length}</span><div><button className={styles.secondary} disabled={step === 0} onClick={() => setStep(step-1)}>← ย้อนกลับ</button><button className={styles.primary} onClick={() => step === steps.length-1 ? setOpen(false) : setStep(step+1)}>{step === steps.length-1 ? "ปิดคู่มือ" : "ถัดไป →"}</button></div></footer>
        </div>
      </dialog>
    </div>
  );
}
