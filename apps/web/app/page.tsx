export default function Home() {
  return (
    <>
      <header className="topbar">
        <div className="shell topbar-inner">
          <a className="brand-lockup" href="/">
            <span className="brand-mark">◆</span>
            <span><strong>SCENOVA</strong><small>MT5 BOT EA</small></span>
          </a>
          <nav className="nav">
            <a className="btn ghost hide-sm" href="#how">วิธีใช้งาน</a>
            <a className="btn" href="/login">เข้าสู่ระบบ</a>
            <a className="btn primary" href="/login?mode=register">เริ่มใช้งาน</a>
          </nav>
        </div>
      </header>

      <main className="shell">
        <section className="hero">
          <div>
            <div className="eyebrow">SCENOVA // MT5 AUTOMATION</div>
            <h1>ควบคุมบอทเทรด<br/>ให้เข้าใจง่าย</h1>
            <p className="lead">
              เชื่อมบัญชี MT5 ครั้งเดียว แล้วควบคุมการทำงาน สถานะ ความเสี่ยง และสิทธิ์ใช้งานจากหน้าเว็บเดียว
              เลือกได้ทั้ง Cloud สำหรับผู้ใช้มือถือ หรือ Local สำหรับผู้ที่มีคอมพิวเตอร์ของตัวเอง
            </p>
            <div className="hero-actions">
              <a className="btn primary" href="/login?mode=register">สร้างบัญชี SCENOVA</a>
              <a className="btn purple" href="#how">ดูขั้นตอนใช้งาน</a>
            </div>
            <div className="trust-row">
              <span className="status-chip"><span className="dot green"/> Cloud + Local</span>
              <span className="status-chip">Trial 3 ชั่วโมงแบบอนุมัติ</span>
              <span className="status-chip">ควบคุมจากมือถือ</span>
            </div>
          </div>

          <div className="tech-card hero-console">
            <div className="flow-title">การทำงานของระบบ</div>
            <div className="human-flow">
              <div className="human-flow-step"><span>1</span><div><b>คุณสั่งงานจากเว็บ</b><small>เริ่ม / หยุด / ตั้งค่าความเสี่ยง</small></div></div>
              <div className="flow-arrow">↓</div>
              <div className="human-flow-step purple"><span>2</span><div><b>SCENOVA ส่งคำสั่งไป MT5</b><small>ตรวจสิทธิ์และสถานะก่อนทำงาน</small></div></div>
              <div className="flow-arrow">↓</div>
              <div className="human-flow-step"><span>3</span><div><b>EA ทำงานบนบัญชีของคุณ</b><small>ออเดอร์เกิดบนบัญชี MT5 ที่เชื่อมไว้</small></div></div>
            </div>
          </div>
        </section>

        <section className="section" id="how">
          <div className="section-head">
            <div className="eyebrow">เริ่มใช้งานแบบเป็นขั้นตอน</div>
            <h2>รู้ว่าต้องทำอะไรต่อในทุกหน้า</h2>
            <p className="muted section-copy">ระบบจะแสดงเฉพาะสิ่งที่จำเป็นในแต่ละช่วง เพื่อลดความสับสนและการตั้งค่าผิด</p>
          </div>
          <div className="grid3">
            <div className="task-card">
              <span className="task-number">01</span>
              <h3>สร้างบัญชี</h3>
              <p>สมัครด้วยอีเมล แล้วรับ User ID สำหรับติดต่อผู้ดูแลเรื่อง Trial หรือสมาชิก</p>
            </div>
            <div className="task-card">
              <span className="task-number">02</span>
              <h3>เชื่อม MT5</h3>
              <p>เลือก Cloud หรือ Local แล้วเลือก Broker และ Server จากรายการมาตรฐาน</p>
            </div>
            <div className="task-card">
              <span className="task-number">03</span>
              <h3>เริ่มควบคุมบอท</h3>
              <p>ดู Balance, Equity, Position และสั่ง Start / Safe Stop จาก Control Center</p>
            </div>
          </div>
        </section>

        <section className="section" id="modes">
          <div className="section-head">
            <div className="eyebrow">เลือกแบบที่ตรงกับอุปกรณ์ของคุณ</div>
            <h2>สองโหมด แต่ใช้หน้าเว็บเดียวกัน</h2>
          </div>
          <div className="grid2">
            <div className="tech-card purple mode-card">
              <div className="badge"><span className="dot purple"/> CLOUD MODE</div>
              <h2>มีแต่มือถือก็ใช้ได้</h2>
              <p>MT5 + EA ทำงานบน Trading Server ของระบบ ปิดมือถือได้ บอทยังทำงานต่อ</p>
              <div className="mode-fit">เหมาะกับ: ผู้ใช้มือถือ / ต้องการทำงาน 24/7</div>
            </div>
            <div className="tech-card mode-card">
              <div className="badge"><span className="dot blue"/> LOCAL MODE</div>
              <h2>มีคอม ใช้ MT5 ของตัวเอง</h2>
              <p>ติดตั้ง EA บน MT5 ของคุณครั้งเดียว แล้วควบคุม Start / Stop / Settings ผ่านเว็บ</p>
              <div className="mode-fit">เหมาะกับ: ผู้มี PC หรือ VPS ของตัวเอง</div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="tech-card callout-card">
            <div>
              <div className="eyebrow">TRIAL ACCESS</div>
              <h2>ทดลองฟรี 3 ชั่วโมง หลังผู้ดูแลอนุมัติ</h2>
              <p className="muted">Trial จะเริ่มนับเมื่อเริ่มใช้งานครั้งแรก และบัญชี MT5 เดิมไม่สามารถรับ Trial ซ้ำได้</p>
            </div>
            <a className="btn primary" href="/login?mode=register">สมัครเพื่อรับ User ID</a>
          </div>
        </section>
      </main>
    </>
  );
}
