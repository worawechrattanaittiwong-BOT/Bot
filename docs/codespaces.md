# Test on GitHub Codespaces

ใช้สำหรับเปิดเว็บทดสอบจาก GitHub โดยไม่ต้องติดตั้งอะไรบนคอม

## ขั้นตอน

1. เปิด Repo
2. Code → Codespaces → Create codespace on main
3. รอ Codespace สร้างและ npm install จบ
4. เปิด Terminal แล้วรัน:

```bash
bash scripts/codespace-start.sh
```

5. เปิดแท็บ Ports
6. ที่ Port 3000 กด Open in Browser

ระบบจะรัน:
- Web :3000
- API :4000
- PostgreSQL :5432
- Redis :6379

## หมายเหตุ
Codespaces เหมาะสำหรับ Preview/Development เท่านั้น ไม่ใช่ Production และไม่ใช้สำหรับรัน MT5/EA.
