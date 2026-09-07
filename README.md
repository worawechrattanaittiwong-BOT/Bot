# SCENOVA Bot SaaS — MT5 Cloud + Local Trading Platform

แพลตฟอร์ม SaaS สำหรับควบคุม EA บน MetaTrader 5 ผ่านเว็บ/มือถือ รองรับ 2 โหมด:

- **Cloud Mode** — ลูกค้ามีแค่มือถือ กด Start แล้วปิดมือถือได้ เพราะ MT5 + EA รันบน Windows Trading VPS ของระบบ
- **Local PC Mode** — ลูกค้ามีคอม ติดตั้ง SCENOVA จากเว็บไซต์บน MT5 ของตัวเอง แล้วควบคุม Start / Stop / Settings / Access ผ่านเว็บเดียวกัน

## หลักการสำคัญ

1. EA เป็น execution engine หลักและจัดการออเดอร์ใน MT5 โดยตรง
2. เว็บ/API เป็น control plane ไม่อยู่ใน hot path ของทุก tick
3. ถ้าเว็บ/API ขัดข้อง EA ต้องยังจัดการ position ที่เปิดอยู่และ Safe Stop ได้
4. สมัคร SCENOVA ด้วย **Email + Password** ก่อน ไม่ต้องกรอก MT5 ตอนสมัคร
5. Local Mode ติดตั้งจากหน้า SCENOVA เท่านั้น ผ่าน `SCENOVA-Setup-<enrollment>.exe`; ลูกค้าไม่ต้องใช้ CMD/PowerShell และไม่ควรติดตั้งจาก EX5/.set ที่ส่งต่อกัน
6. Local installation ผูกกับ **License Slot + Registered Device**; Device Agent ใช้ secret ที่เก็บด้วย Windows DPAPI และยืนยันกับ Server
7. เปลี่ยน Demo → Real หรือ MT5 ใหม่บน Registered Device เดิมได้โดย Server-side Rebind: EA ตรวจพบบัญชีใหม่ → Safe Stop → ผู้ใช้กด **ใช้บัญชีนี้** → Binding เปลี่ยน โดยไม่ต้องเปลี่ยน `.set`
8. การ Rebind ต้องไม่มี Bot RUNNING/Position ค้าง, Device Agent ต้องออนไลน์ และบัญชีใหม่ต้องมาจาก Device ที่ลงทะเบียน
9. ประวัติ MT5/Trial เดิมไม่ถูกลบเมื่อต้องเปลี่ยนบัญชี
10. Subscription เป็นสิทธิ์ของ SCENOVA User/Slot และวันหมดอายุไม่รีเซ็ตเมื่อเปลี่ยน MT5
11. รองรับหลาย Slot: Personal 1/3/5 Local Slots และ Partner/Reseller 10/25/50 Local Slots
12. 1 Slot = 1 active installation/device + 1 active MT5 ในขณะเดียวกัน
13. Partner สามารถเปิด Slot ให้ SCENOVA User คนอื่นได้โดย Email/User ID โดยไม่แชร์รหัสผ่าน, EX5, `.set` หรือ Install Token
14. Trial ฟรี 3 ชั่วโมงต้องเชื่อม MT5, ส่งคำขอพร้อม LINE และ Owner อนุมัติ; User / LINE / MT5 ที่เคยได้รับ Trial แล้วห้ามรับซ้ำ
15. IP ถูกเก็บเป็นสัญญาณประกอบให้ Owner ตรวจ Trial แต่ไม่ใช้เป็น Hard Block เพียงอย่างเดียว
16. เมื่อ Trial/สมาชิกหมด ห้ามเปิด basket ใหม่ และเข้าสู่ Safe Stop
17. Cloud และ Local ห้ามรันพร้อมกันบน MT5 account เดียวกัน
18. OWNER/ADMIN มี Full Access แบบไม่หมดอายุ แต่ operation ที่เกี่ยวกับ Device/MT5 ยังผ่าน safety checks

## Package / Slot model

```text
SCENOVA User
   |
   +-- Subscription
          |
          +-- Slot 1 -> Device A -> MT5 A
          +-- Slot 2 -> Device B -> MT5 B
          +-- Slot 3 -> Device C -> MT5 C
```

Partner package เพิ่มการ Assign Slot:

```text
Partner Owner
   |
   +-- Slot 01 -> Customer A -> Device A -> MT5 A
   +-- Slot 02 -> Customer B -> Device B -> MT5 B
   +-- Slot 03 -> AVAILABLE
```

ผู้รับ Slot ต้องมี SCENOVA account ของตัวเองและ Login ด้วยบัญชีตัวเอง

## Local installation flow

```text
Login SCENOVA
   -> เลือก Local Slot
   -> กด "ติดตั้งจากเว็บไซต์"
   -> Server ออก Enrollment อายุสั้น ใช้ได้ครั้งเดียว
   -> ดาวน์โหลด SCENOVA-Setup-<code>.exe
   -> Installer ลง EA + preset + Device Agent
   -> Device ลงทะเบียนกับ Slot
   -> เปิด MT5 และ Load preset ครั้งแรก
   -> EA ส่ง MT5 ที่กำลัง Login
   -> กด "ใช้บัญชีนี้"
```

หลังติดตั้งครั้งแรก การเปลี่ยน MT5 ใช้ flow:

```text
Login MT5 ใหม่บนเครื่องเดิม
   -> EA รายงาน Account Mismatch
   -> Server SAFE_STOP + บันทึกบัญชีที่ตรวจพบ
   -> Device Agent ยืนยันเครื่อง
   -> หน้าเว็บแสดง "ใช้บัญชีนี้"
   -> Rebind
   -> ใช้ต่อด้วย EX5/.set/Instance เดิม
```

## Stack

- Web/PWA: Next.js + React + TypeScript
- API: NestJS + PostgreSQL
- MT5: MQL5 Expert Advisor
- Windows setup/agent: .NET 8 Windows Forms single-file EXE
- Cloud trading: Windows VPS + MT5 portable instances
- Dev: Docker Compose + GitHub Actions

## Database

Fresh/manual setup:

1. รัน `database/001_init.sql`
2. รัน `database/002_slots_devices.sql`

Production API มี idempotent startup migration สำหรับ schema Slots/Devices เพื่ออัปเกรดฐานข้อมูล live โดยไม่ลบข้อมูลเดิม

## Development

1. คัดลอก `.env.example` เป็น `.env`
2. `docker compose up -d`
3. รัน migration ตามหัวข้อ Database
4. `npm install`
5. `npm run dev:api` และ `npm run dev:web`

Windows Installer ปัจจุบัน: **v2.0.5** — อัปเดตล่าสุด **7 กันยายน 2026**

Windows Installer build:

```powershell
dotnet publish tools/windows-installer/ScenovaInstaller.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

GitHub workflow `Build SCENOVA Windows Installer` จะ Build ตัว `.exe`; เมื่อ merge เข้า `main` จะ publish binary ไปที่ `apps/web/public/downloads/SCENOVA-Setup.exe`

## ความปลอดภัย

Repository ต้องเป็น **Private** และห้าม commit password, MT5 credential, JWT secret, admin key, encryption key, Device Secret หรือ raw Install Token ลง Git

Device lock เป็นชั้นป้องกันการนำ EX5/.set ไปใช้เครื่องอื่น แต่สิทธิ์ใช้งานจริงต้องตัดสินที่ Server เสมอ

> ใช้ Demo/Strategy Tester/Forward Test ก่อนเงินจริงเสมอ ระบบนี้ไม่รับประกันผลตอบแทน
