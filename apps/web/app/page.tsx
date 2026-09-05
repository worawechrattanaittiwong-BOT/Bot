export default function Home() {
  return (
    <>
      <header className="topbar">
        <div className="shell" style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div className="brand"><b>◆</b> BOT // MT5</div>
          <nav className="nav">
            <a className="btn ghost hide-sm" href="#modes">โหมดใช้งาน</a>
            <a className="btn" href="/login">เข้าสู่ระบบ</a>
            <a className="btn primary" href="/login?mode=register">สมัครใช้งาน</a>
          </nav>
        </div>
      </header>

      <main className="shell">
        <section className="hero">
          <div>
            <div className="eyebrow">MT5 AUTOMATION // CLOUD + LOCAL</div>
            <h1>ควบคุมบอทเทรด<br/>จากมือถือได้</h1>
            <p className="lead">
              ระบบ SaaS สำหรับ MetaTrader 5 ที่แยกการควบคุมออกจากเครื่องเทรดจริง
              ลูกค้าเลือกได้ว่าจะใช้ Cloud 24/7 หรือรัน EA บนคอมตัวเอง
              พร้อม Trial 3 ชั่วโมงแบบอนุมัติโดยผู้ดูแลและระบบสมาชิกกำหนดวันได้
            </p>
            <div className="hero-actions">
              <a className="btn primary" href="/login?mode=register">เริ่มสมัครบัญชี</a>
              <a className="btn purple" href="#modes">ดูวิธีทำงาน</a>
            </div>
          </div>

          <div className="tech-card">
            <div className="flow-title">SYSTEM EXECUTION FLOW</div>
            <div className="flow-node">
              <b>WEB / MOBILE CONTROL</b>
              <small>Start, Stop, Risk, Subscription, Status</small>
            </div>
            <div className="flow-arrow">↓</div>
            <div className="flow-node purple">
              <b>CONTROL API</b>
              <small>License, Trial, Commands, Audit</small>
            </div>
            <div className="flow-arrow">↓</div>
            <div className="grid2">
              <div className="flow-node">
                <b>CLOUD MT5</b>
                <small>Windows VPS + EA</small>
              </div>
              <div className="flow-node purple">
                <b>LOCAL MT5</b>
                <small>Customer PC + EA</small>
              </div>
            </div>
            <div className="flow-arrow">↓</div>
            <div className="flow-node">
              <b>EXNESS / MT5 BROKER</b>
              <small>Orders execute on customer trading account</small>
            </div>
          </div>
        </section>

        <section className="section" id="modes">
          <div className="section-head">
            <div className="eyebrow">TWO EXECUTION MODES</div>
            <h2>เว็บเดียว ใช้งานได้สองแบบ</h2>
          </div>
          <div className="grid2">
            <div className="tech-card purple">
              <div className="badge"><span className="dot purple"/> CLOUD MODE</div>
              <h2 style={{marginTop:18}}>มีแต่มือถือก็ใช้ได้</h2>
              <p className="lead" style={{fontSize:15}}>
                MT5 + EA รันบน Trading VPS ของระบบ ลูกค้ากด Start แล้วปิดมือถือได้
                บอทยังทำงานต่อ และเปิด MT5 ของตัวเองเพื่อดูออเดอร์ได้ตลอด
              </p>
            </div>
            <div className="tech-card">
              <div className="badge"><span className="dot blue"/> LOCAL PC MODE</div>
              <h2 style={{marginTop:18}}>มีคอม ใช้ MT5 ของตัวเอง</h2>
              <p className="lead" style={{fontSize:15}}>
                ติดตั้ง EA ลง MT5 ของลูกค้าเพียงครั้งเดียว จากนั้น Start / Stop /
                Settings และสถานะสมาชิกควบคุมจากเว็บเดียวกัน
              </p>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="tech-card">
            <div className="eyebrow">FREE ACCESS</div>
            <h2 style={{marginTop:10}}>ทดลองฟรี 3 ชั่วโมงแบบ Admin อนุมัติ</h2>
            <p className="lead" style={{fontSize:15}}>
              สมัครแล้วแจ้ง User ID กับผู้ดูแล เมื่ออนุมัติ Trial จะเริ่มนับตอนกด Start ครั้งแรก
              บัญชี MT5 + Broker Server ที่เคยรับ Trial แล้วจะรับซ้ำไม่ได้
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
