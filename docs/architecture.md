# Architecture V1

## Control Plane
- Next.js Web/PWA: ลูกค้า + Admin
- NestJS API: Auth, Trial, Subscription, Commands, EA Heartbeat, Worker Claim
- PostgreSQL: users, MT5 accounts, entitlements, commands, audit
- Redis: เตรียมไว้สำหรับ realtime/queue ในระยะถัดไป

## Execution Plane

### Cloud Mode
มือถือ → Web → API → Windows Trading VPS → MT5 portable instance → FastBasketBot.ex5 → Broker

ลูกค้าปิดเว็บ/มือถือได้ เพราะ execution อยู่บน VPS.

### Local Mode
มือถือ/เว็บ → API → FastBasketBot.ex5 บน MT5 ของลูกค้า → Broker

ลูกค้าปิดเว็บได้ แต่คอม, MT5 และอินเทอร์เน็ตฝั่งลูกค้าต้องเปิดอยู่.

## สิ่งที่ EA ทำเอง
- Tick momentum
- Entry BUY/SELL
- Rate limit
- Basket P/L
- Dynamic peak-profit trailing
- Max basket loss
- Daily equity loss
- Close all
- Safe stop

API ไม่อยู่ใน hot path ของทุก order.

## Trial
- สมัครแล้วไม่ได้ Trial อัตโนมัติ
- ลูกค้าแจ้ง User ID ให้ Admin
- Admin Grant 180 นาทีให้ MT5 account + broker server
- UNIQUE(account_number, broker_server) กัน Trial ซ้ำ
- เริ่มนับตอน START ครั้งแรก
- หมดสิทธิ์ → SAFE_STOP

## Subscription
- ลูกค้าชำระเงินผ่านผู้ดูแล
- แจ้ง User ID
- Admin เลือก LOCAL/CLOUD plan และจำนวนวัน/วันหมดอายุ
- หมดอายุ → EA ห้ามเปิด basket ใหม่ และ SAFE_STOP

## Execution lock
หนึ่ง MT5 account มี bot instance เดียวใน V1. Cloud/Local ไม่ควรรันพร้อมกัน. ก่อนเพิ่ม multi-account จริงให้เพิ่ม switch-mode transaction และ lock lease.
