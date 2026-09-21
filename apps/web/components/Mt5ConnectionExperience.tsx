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
  { title: "เตรียม MT5 และบัญชี", short: "เตรียมบัญชี", icon: "account" },
  { title: "ดาวน์โหลดและติดตั้ง SCENOVA", short: "ติดตั้ง", icon: "arrow-down" },
  { title: "ตั้งค่า Tools → Options", short: "ตั้งค่า MT5", icon: "settings" },
  { title: "เพิ่ม EA ลงบนกราฟ", short: "เปิด EA", icon: "bot" },
  { title: "Common: อนุญาต Algo Trading", short: "อนุญาต EA", icon: "shield" },
  { title: "Inputs: กด Load เพื่อเลือกไฟล์", short: "โหลดค่า", icon: "layers" },
  { title: "เลือก SCENOVA-FastBasketBot.set", short: "เลือกไฟล์ .set", icon: "report" },
  { title: "ตรวจค่า แล้วกด OK", short: "ยืนยันค่า", icon: "status" },
  { title: "ตรวจการเชื่อมต่อและเริ่มใช้งาน", short: "ตรวจสถานะ", icon: "control" },
  { title: "ติดตรงไหน? ลองตรวจตามนี้", short: "แก้ปัญหา", icon: "info" },
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
          <button className={styles.secondary} onClick={() => showGuide(9)}>ดูวิธีแก้ปัญหา <span>→</span></button>
        </section>
      </div>

      <dialog ref={dialog} className={styles.dialog} aria-labelledby="mt5-guide-heading" onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
        <div className={styles.dialogInner}>
          <header><div><small>SCENOVA · INSTALLATION GUIDE</small><h2 id="mt5-guide-heading">วิธีติดตั้งและเชื่อมต่อ MT5</h2></div><button autoFocus className={styles.close} onClick={() => setOpen(false)} aria-label="ปิดคู่มือติดตั้ง"><ScenovaIcon name="close"/></button></header>
          <div className={styles.guideLayout}>
            <nav aria-label="ขั้นตอนติดตั้ง">{steps.map((s,i) => <button key={s.title} className={step === i ? styles.selected : ""} aria-current={step === i ? "step" : undefined} onClick={() => setStep(i)}><span>{String(i+1).padStart(2,"0")}</span>{s.short}</button>)}</nav>
            <div ref={content} className={styles.guideContent}>
              <div className={styles.guideHeading}><ScenovaIcon name={steps[step].icon} size={30}/><div><small>ขั้นตอน {step+1} / {steps.length}</small><h3>{steps[step].title}</h3></div></div>
              {step === 0 && <><ol><li>เปิด MetaTrader 5 บนคอมพิวเตอร์ Windows</li><li>ไปที่ <b>File → Login to Trade Account</b> ใส่เลขบัญชี รหัสผ่าน และเลือก Server ตามที่โบรกเกอร์ให้มา</li><li>ตรวจว่าเลขบัญชีและ Server ตรงกับบัญชีที่ต้องการใช้</li><li>เปิดกราฟสินค้าที่ต้องการ เช่น XAUUSDm จาก Market Watch โดยคลิกขวา → Chart Window</li></ol><aside>เริ่มจากบัญชี Demo ได้ หากใช้ MT5 หลายตัว ให้ติดตั้งและตั้งค่าบนตัวที่ Login บัญชีนี้อยู่</aside></>}
              {step === 1 && <><ol><li>กด <b>ดาวน์โหลดตัวติดตั้ง</b> ด้านล่าง แล้วเปิดโฟลเดอร์ Downloads</li><li>ดับเบิลคลิก SCENOVA Setup ที่เพิ่งดาวน์โหลด และทำตามขั้นตอนบนหน้าจอ</li><li>รอให้ติดตั้งเสร็จ จากนั้นกลับไป MT5 ตัวที่ต้องการใช้งาน</li><li>ถ้าบอทถูกเพิ่มบนกราฟแล้ว ข้ามขั้นตอนลาก EA แล้วตรวจ Common และ Inputs ต่อได้เลย</li></ol><button className={styles.primary} disabled={props.busy || props.downloadBlocked} onClick={() => void props.onDownload()}>{props.busy ? "กำลังเตรียมไฟล์…" : "ดาวน์โหลดตัวติดตั้ง Windows"}<ScenovaIcon name="arrow-down"/></button>{props.downloadBlocked && <aside>หยุดบอทและจัดการออเดอร์ที่เปิดอยู่ให้เรียบร้อยก่อนติดตั้งหรืออัปเดต</aside>}{props.message && <p role="status" className={styles.good}>{props.message}</p>}{props.error && <p role="alert" className={styles.failure}>{props.error}</p>}</>}
              {step === 2 && <><ol><li>คลิก <b>Tools → Options</b> ที่แถบเมนูด้านบน หรือกด <kbd>Ctrl</kbd> + <kbd>O</kbd></li><li>เลือกแท็บ <b>Expert Advisors</b></li><li>ติ๊ก <b>Allow algorithmic trading</b> เพื่ออนุญาตให้ EA ส่งคำสั่งเมื่อคุณเริ่มใช้งาน</li><li>ติ๊ก <b>Allow WebRequest for listed URL</b> แล้วกดเพิ่มที่อยู่ด้านล่างลงในรายการ</li></ol><div className={styles.address}><code>{props.apiBase || "กำลังโหลดที่อยู่เชื่อมต่อ…"}</code><button className={styles.secondary} disabled={!props.apiBase} onClick={() => void copyAddress()}><ScenovaIcon name="copy"/>คัดลอก</button></div><small role="status">{copyState}</small><p>เพิ่ม URL แล้วกด <b>OK</b> เพื่อบันทึก ไม่ต้องเปิด Allow DLL imports เพื่อทำขั้นตอน WebRequest</p><div className={styles.example}><span>Tools → Options → Expert Advisors</span><b>☑ Allow algorithmic trading</b><b>☑ Allow WebRequest for listed URL</b><code>{props.apiBase}</code><small>ภาพอธิบายตำแหน่งตั้งค่า ไม่ใช่สถานะจริงของ MT5</small></div></>}
              {step === 3 && <><ol><li>เปิดแถบ <b>Navigator</b> โดยกด <kbd>Ctrl</kbd> + <kbd>N</kbd></li><li>ขยาย <b>Expert Advisors → SCENOVA</b> แล้วหา <b>FastBasketBot</b></li><li>ลาก FastBasketBot ลงบนกราฟที่เปิดไว้ จะมีหน้าต่างตั้งค่า EA ปรากฏขึ้น</li><li>หากมี EA อยู่บนกราฟแล้ว ให้กด <kbd>F7</kbd> ขณะเลือกกราฟนั้นเพื่อเปิดการตั้งค่า</li></ol><aside>หา EA ไม่เจอ: คลิกขวาใน Navigator → Refresh หากยังไม่พบ ให้ตรวจว่าติดตั้งลง MT5 ตัวเดียวกับที่เปิดใช้อยู่</aside></>}
              {step === 4 && <><ol><li>ที่หน้าต่าง FastBasketBot เลือกแท็บ <b>Common</b></li><li>ติ๊ก <b>Allow Algo Trading</b> ตามภาพ</li><li>ยังไม่ต้องกด OK ให้ไปแท็บ Inputs เพื่อโหลดไฟล์ตั้งค่าก่อน</li></ol><img className={styles.screenshot} src="/assets/mt5-guide-common.png" alt="แท็บ Common ของ FastBasketBot พร้อมช่อง Allow Algo Trading"/><aside>ภาพเป็นตัวอย่างจากเวอร์ชันก่อนหน้า เลขเวอร์ชันในเครื่องคุณอาจต่างกัน</aside></>}
              {step === 5 && <><ol><li>เลือกแท็บ <b>Inputs</b> ข้าง Common</li><li>กดปุ่ม <b>Load</b> ทางขวาของตาราง</li><li>หน้าต่างเลือกไฟล์จะเปิดขึ้น ให้เลือกไฟล์ของบัญชี SCENOVA ที่คุณเพิ่งติดตั้ง</li></ol><img className={styles.screenshot} src="/assets/mt5-guide-inputs.png" alt="แท็บ Inputs ก่อนโหลดไฟล์ตั้งค่า มีปุ่ม Load ทางขวา"/><aside>ช่อง InpInstanceId และ InpInstallToken ที่ว่างในภาพ จะได้รับค่าจากไฟล์ .set ในขั้นตอนถัดไป</aside></>}
              {step === 6 && <><ol><li>มองหาไฟล์ <b>SCENOVA-FastBasketBot.set</b> ในโฟลเดอร์ <b>MQL5 → Presets</b></li><li>เลือกไฟล์นี้ แล้วกด <b>Open</b> เพื่อโหลดค่า</li><li>หากหาโฟลเดอร์ไม่เจอ กลับไป MT5 → <b>File → Open Data Folder</b> แล้วเปิด MQL5 → Presets</li><li>ถ้าไม่มีไฟล์ ให้กลับไปขั้นตอนติดตั้งและติดตั้งใหม่สำหรับ MT5 ตัวนี้ อย่าใช้ไฟล์ของบัญชีคนอื่น</li></ol><div className={styles.example}><span>MQL5 / Presets</span><b>▤ SCENOVA-FastBasketBot.set</b><small>เลือกไฟล์ → Open</small></div></>}
              {step === 7 && <><ol><li>หลังโหลดไฟล์ ตรวจว่า <b>InpApiBase</b> ตรงกับที่อยู่เชื่อมต่อของระบบ</li><li>ตรวจว่า <b>InpInstanceId</b> และ <b>InpInstallToken</b> มีค่าแล้ว ไม่ต้องพิมพ์หรือเดาค่าเอง</li><li>ถ้าค่ายังว่าง ให้กลับไป Load แล้วเลือกไฟล์ .set ที่ได้จากการติดตั้งล่าสุด</li><li>ตรวจ Common ว่าติ๊ก Allow Algo Trading จากนั้นกด <b>OK</b></li></ol><div className={styles.example}><span>ตัวอย่างหลังโหลดไฟล์ — ซ่อนข้อมูลส่วนตัว</span><b>InpApiBase</b><code>{props.apiBase}</code><b>InpInstanceId · ••••••••••</b><b>InpInstallToken · ••••••••••</b></div><aside>ไฟล์ .set และ Install Token เป็นรหัสเชื่อมต่อของคุณ ไม่ควรส่งต่อหรือโพสต์ภาพที่เห็นค่า</aside></>}
              {step === 8 && <><ol><li>ตรวจปุ่ม <b>Algo Trading</b> บนแถบเครื่องมือ MT5 ให้เปิดใช้งาน</li><li>รอให้ EA ติดต่อระบบ มุมกราฟควรแสดง <b>SCENOVA · CONNECTED</b></li><li>กลับมาดูหมายเลขบัญชีและ Server ในหน้า MT5 & EA ให้ตรงกับที่เลือกไว้</li><li>ถ้าขึ้น <b>STOPPED</b> แต่เชื่อมต่อแล้ว แปลว่าบอทยังหยุดอยู่ ไม่ใช่ติดตั้งผิด</li><li>เมื่อตรวจการตั้งค่าครบและต้องการให้บอททำงาน ไปที่ <b>Control Center → เริ่มบอท</b></li></ol><div className={`${styles.connectionStatus} ${props.online ? styles.online : styles.waiting}`} role="status"><ScenovaIcon name={props.online ? "status" : "clock"} size={30}/><div><b>{statusText}</b><small>สถานะล่าสุดที่หน้าเว็บได้รับจาก EA</small></div></div></>}
              {step === 9 && <div className={styles.faq}>
                <details open><summary>Agent เชื่อมแล้ว แต่ยังรอ EA</summary><p>ตรวจ FastBasketBot บนกราฟ, URL ใน Tools → Options → Expert Advisors และโหลดไฟล์ .set ของบัญชีนี้อีกครั้ง การเชื่อมต่อ Agent อย่างเดียวไม่ได้แปลว่า EA เชื่อมแล้ว</p></details>
                <details><summary>WebRequest ไม่ผ่าน หรือยังไม่ขึ้น CONNECTED</summary><p>ตรวจ URL ในขั้นตอน 3 ให้ตรงทุกตัว ไม่มีช่องว่าง แล้วกด OK ตรวจอินเทอร์เน็ต และดูข้อความในแท็บ Experts / Journal ด้านล่าง MT5</p></details>
                <details><summary>ไม่มีไฟล์ .set หรือช่องรหัสยังว่าง</summary><p>ตรวจ File → Open Data Folder → MQL5 → Presets ของ MT5 ตัวที่ใช้งาน ถ้าไม่พบ ให้ติดตั้งใหม่จากบัญชี SCENOVA นี้ แล้วโหลด SCENOVA-FastBasketBot.set อีกครั้ง</p></details>
                <details><summary>ต้องการเปลี่ยนบัญชี Demo / Real</summary><p>จัดการออเดอร์เดิมก่อน Login บัญชีใหม่ใน MT5 แล้วกลับมาหน้านี้ ระบบจะแสดงบัญชีใหม่ให้กด “ใช้บัญชีนี้” เมื่อพร้อมเปลี่ยน</p></details>
              </div>}
            </div>
          </div>
          <footer><span>ขั้นตอน {step+1} จาก {steps.length}</span><div><button className={styles.secondary} disabled={step === 0} onClick={() => setStep(step-1)}>← ย้อนกลับ</button><button className={styles.primary} onClick={() => step === steps.length-1 ? setOpen(false) : setStep(step+1)}>{step === steps.length-1 ? "ปิดคู่มือ" : "ถัดไป →"}</button></div></footer>
        </div>
      </dialog>
    </div>
  );
}
