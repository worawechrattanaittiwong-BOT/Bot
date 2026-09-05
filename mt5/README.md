# FastBasketBot EA

## Logic V1

1. รับ START/SAFE_STOP/CLOSE_ALL และ settings จาก SaaS API ผ่าน heartbeat
2. Trading loop อยู่ใน OnTick ไม่รอ API
3. เปิด position ตาม BUY_ONLY / SELL_ONLY / AUTO_MOMENTUM
4. จำกัด Max Positions, Spread, interval ต่อ request และ requests/minute
5. คำนวณกำไรรวม Basket
6. เมื่อแตะ Basket Trigger → จำ Peak Profit
7. ราคายังไหลแรง → ขยาย trailing room ตาม momentum
8. กำไรย่อจาก Peak ตาม threshold → Close All
9. Max Basket Loss / Daily Equity Loss → ปิดและหยุด
10. Trial/Subscription หมด → SAFE_STOP
11. ตรวจ manual/external deal บน symbol แล้วเข้าสู่ SAFE_STOP

## ติดตั้ง Local

- Compile FastBasketBot.mq5 ด้วย MetaEditor เป็น EX5
- Attach EA บนกราฟ symbol ที่ต้องการ เช่น XAUUSD
- เปิด Algo Trading
- ใส่ Instance ID และ Install Token จาก Dashboard
- เพิ่ม API URL ใน Tools → Options → Expert Advisors → Allow WebRequest

## หมายเหตุ

- กลยุทธ์หลาย position ต้องใช้ Hedging account
- Broker อาจ throttle/reject trade requests จึงมี rate limits
- Close All ไม่รับประกันราคาเดียวกันทุก position เพราะ execution/slippage
- ทดสอบ Demo ก่อนเงินจริง
