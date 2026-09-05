# Deployment Plan

## Server A — Linux Control Plane
รัน:
- Next.js Web/PWA
- NestJS API
- PostgreSQL
- Redis
- Reverse proxy + HTTPS

Production แนะนำให้ Web/API ใช้ domain แยก เช่น:
- app.example.com
- api.example.com

ห้าม expose PostgreSQL/Redis ออก internet.

## Server B+ — Windows Trading Nodes
รัน:
- MT5 portable instances
- compiled FastBasketBot.ex5
- secured worker service

หนึ่ง account = หนึ่ง MT5 data directory. จำนวน account ต่อ VPS ต้องกำหนดจาก load test จริง ไม่ hard-code.

## Database migrations
รันตามลำดับ:
1. database/001_init.sql
2. database/002_cloud_worker.sql
3. database/003_trial_history_lock.sql

## Secrets
ใช้ node scripts/generate-secrets.mjs เพื่อสร้างค่าเริ่มต้น แล้วเก็บค่าจริงใน secret manager / server environment เท่านั้น.

## Reverse proxy
ใช้ Caddy/Nginx/Cloudflare ได้. API production ต้อง HTTPS ก่อนรับ MT5 credentials หรือ install tokens.

## MT5 Cloud template
เตรียม Windows template นอก Program Files เพื่อใช้ /portable และต้อง:
- มี terminal64.exe
- มี FastBasketBot.ex5 ที่ MQL5/Experts
- Allow Algo Trading
- Allow WebRequest ไปยัง api domain ของระบบ
- ทดสอบ Exness server mapping บน Demo ก่อน

## Deployment gate ก่อนเงินจริง
- CI Web/API ผ่าน
- MetaEditor compile 0 errors
- Demo forward test
- Cloud worker restart test
- API outage test
- Database restart test
- Trial expiry test
- Subscription expiry Safe Stop test
- Manual Close test
- Spread spike / reject / throttle test
