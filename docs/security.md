# Security Checklist

ก่อน production:

- เปลี่ยน GitHub repository เป็น Private
- ห้าม commit .env, MT5 password, JWT secret, ADMIN_KEY, WORKER_KEY, encryption key
- HTTPS เท่านั้น
- เก็บ CREDENTIAL_MASTER_KEY ใน secret manager
- Cloud MT5 password เข้ารหัส AES-256-GCM at rest
- Cloud install token เข้ารหัส; Local install token เก็บเฉพาะ SHA-256 ที่ server
- Admin และ Worker แยก secret กัน
- เพิ่ม IP/rate limit สำหรับ Admin/Worker API
- เพิ่ม 2FA สำหรับ Admin
- เพิ่ม refresh-token rotation สำหรับลูกค้า
- แยก Linux Web/API ออกจาก Windows Trading VPS
- แยก MT5 portable data directory ต่อ account
- ไม่ log trading password/install token
- สำรอง PostgreSQL และทดสอบ restore
- เพิ่ม worker heartbeat / stale runner recovery
- เพิ่ม idempotency สำหรับ command
- ทำ Demo + Forward Test + failure test ก่อนเงินจริง

## Failure principle
ถ้า SaaS API ล่ม EA ต้องไม่ทิ้ง position. Local risk logic ต้องยังทำงาน และห้ามสร้าง dependency ที่ต้องถาม server ก่อนทุก tick.
