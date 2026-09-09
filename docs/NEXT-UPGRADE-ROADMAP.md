# SCENOVA — Next Upgrade Roadmap

หลักการของ Roadmap นี้: เพิ่มความฉลาดโดยไม่สร้าง Hidden Gate สำหรับไม้แรก เว้นแต่เป็นการป้องกันตำแหน่งเข้าแบบผิดหลักอย่างชัดเจนและต้องแสดงเหตุผลบน Dashboard/MT5 เสมอ

## Rescue / Recovery
1. **Adaptive Basket Rescue & Recovery Engine** — NORMAL → WARNING → RESCUE → RECOVERY → EXIT
2. **Smart Hedging** — Hedge เฉพาะเมื่อ Structure ยืนยันว่าฝั่งเดิมผิดจริง
3. **Weight Balance** — คำนวณ BUY/SELL exposure เพื่อแก้ Basket โดยไม่ Martingale
4. **Partial Close Recovery** — ใช้กำไรฝั่ง Rescue ค่อย ๆ ตัดไม้เสีย
5. **Recovery TP** — คำนวณ TP รวมของ Cycle เพื่อออกที่ Break-even / ขาดทุนน้อย / กำไร โดยไม่ต้องรอทุกไม้กลับมาบวก
6. **Time Rescue** — Position ติดลบนานและตลาดไม่กลับมา จะเข้าสู่ Recovery อัตโนมัติ
7. **Reversal Detection** — M1/M5/M15 + Structure + OB + Fib + Momentum/Price Action ยืนยันการกลับตัว
8. **Candlestick / Price Action Patterns** — Rejection, Engulfing, Pin Bar, Break/Retest ฯลฯ ใช้ประกอบ ไม่เป็น Hard Gate

## EMA Intelligence
9. **EMA 9 / 21 / 50 / 200 บนกราฟ** — วาดเส้นพร้อมชื่อและค่าปัจจุบัน
10. **EMA Intelligence** — Slope, Stack, Cross, Compression, Expansion, Reclaim/Loss
11. **Multi-TF EMA Analysis** — อ่าน EMA จาก M1/M5/M15/M30/H1 โดยไม่วาดทุก TF จนกราฟรก
12. **EMA + OB + Fib + S/R Confluence** — ใช้เพิ่มคุณภาพ Setup ไม่บังคับว่าต้องครบ
13. **EMA Dynamic Trailing** — ใช้ EMA21/50 ช่วยรักษากำไรตาม Market Regime
14. **Rescue Dashboard** — NORMAL/RESCUE/RECOVERY, Hedge Lot, Net Exposure, Recovery amount
15. **EMA Dashboard Telemetry** — เช่น 9>21>50, Slope UP, ราคาเหนือ/ใต้ EMA200, Compression/Expansion

## Price Location / Anti-Chase — เพิ่มจากเหตุการณ์ SELL ปลาย Impulse
16. **Price Location & Exhaustion Intelligence** — ตรวจตำแหน่งใน Impulse, Fib terminal zone, ATR extension, แนวรับ/แนวต้านปลายทาง และไส้สวน
17. **Anti-Chase Protection** — ไม่ SELL ไล่ก้น / ไม่ BUY ไล่ยอดเมื่อ Direction ถูกแต่ Location เสี่ยง โดยแสดง WAITING_PULLBACK_RETEST อย่างชัดเจน
18. **Breakout vs Liquidity Sweep** — แยก Clean Breakout ออกจากแท่งยาว/ไส้สวน/Exhaustion; กรณีเสี่ยงต้องรอ Retest ระดับที่แตก
19. **Pullback / Retest Entry** — หลังราคา Extended ให้กลับเข้าเมื่อย่อ 23.6–78.6 หรือมี Pullback ที่วัดได้ + Price Action/Momentum กลับทิศเดิม
20. **Pullback-Aware Basket Ladder** — ไม้ 2–10 ไม่เพิ่มตรง New High/New Low; รอ Progress → Pullback → Continuation ก่อนเพิ่ม Rung ถัดไป

### สถานะปัจจุบัน
- ข้อ 16–20: ลงโค้ดใน EA 1.025 (Price Location / Anti-Chase / Breakout Retest / Pullback-Aware Ladder)
- ข้อ 1–15: ลงโค้ดใน EA 1.026 (Intelligence v4 — Rescue & Recovery + EMA Suite)

### Intelligence v4 Implementation Notes
- Rescue ทำงานหลังมี Position เท่านั้น จึงไม่เป็น Hidden Gate ของไม้แรก
- Smart Hedge ใช้เฉพาะบัญชี MT5 แบบ Hedging และจำกัด Hedge Ratio ไม่เกิน Primary exposure; ไม่มี Martingale
- บัญชี Netting ยังใช้ Reversal Detection / Time Rescue / Dynamic Exit ได้ แต่จะไม่เปิด Hedge สวน
- Weight Balance คำนวณ Primary volume, Hedge volume และ Net Exposure แบบสด
- Partial Close จะทำเมื่อกำไรฝั่ง Rescue มีน้ำหนักเพียงพอชดเชยไม้ที่เสีย ไม่ตัดไม้จากกำไร Hedge เล็กน้อย
- Recovery TP คำนวณทั้งเป้าหมายเงินและราคาโดยอิง Net Exposure ปัจจุบัน
- EMA 9/21/50/200 วาดบนกราฟ พร้อม Multi-TF EMA จาก M1/M5/M15/M30/H1
- EMA / Candlestick / Price Action เป็น Confluence และ Quality intelligence ไม่เป็น first-entry hard gate
- EMA21/50 ใช้เป็น Dynamic Trailing reference หลัง Position มีกำไรแล้ว
