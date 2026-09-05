# Bot SaaS — MT5 Cloud + Local Trading Platform

แพลตฟอร์ม SaaS สำหรับควบคุม EA บน MetaTrader 5 ผ่านเว็บ/มือถือ รองรับ 2 โหมด:

- **Cloud Mode** — ลูกค้ามีแค่มือถือ กด Start แล้วปิดมือถือได้ เพราะ MT5 + EA รันบน Windows Trading VPS ของระบบ
- **Local PC Mode** — ลูกค้ามีคอม ติดตั้ง EA บน MT5 ของตัวเอง แต่ควบคุม Start / Stop / Settings / Subscription ผ่านเว็บเดียวกัน

## หลักการสำคัญ
1. EA เป็น execution engine หลักและจัดการออเดอร์ใน MT5 โดยตรง
2. เว็บ/API เป็น control plane ไม่อยู่ใน hot path ของทุก tick
3. ถ้าเว็บ/API ขัดข้อง EA ต้องยังจัดการ position ที่เปิดอยู่และ Safe Stop ได้
4. Trial ฟรี 3 ชั่วโมงต้องให้ Admin อนุมัติ และ MT5 account + broker server ที่เคยได้ Trial แล้วห้ามรับซ้ำ
5. สมาชิก V1 เปิดสิทธิ์ด้วยมือ: ลูกค้าชำระเงิน แจ้ง User ID แล้ว Admin เลือกแพ็กเกจ/จำนวนวัน/วันหมดอายุ
6. เมื่อ Trial/สมาชิกหมด ห้ามเปิด basket ใหม่ และเข้าสู่ Safe Stop
7. Cloud และ Local ห้ามรันพร้อมกันบน MT5 account เดียวกัน

## Stack
- Web/PWA: Next.js + React + TypeScript
- API: NestJS + PostgreSQL
- MT5: MQL5 Expert Advisor
- Cloud trading: Windows VPS + MT5 portable instances
- Database: PostgreSQL
- Dev: Docker Compose + GitHub Actions

## เริ่ม Development
1. คัดลอก .env.example เป็น .env
2. docker compose up -d
3. รัน database/001_init.sql
4. npm install
5. npm run dev:api และ npm run dev:web

## ความปลอดภัย
Repository นี้มี source code ของผลิตภัณฑ์ จึงควรตั้งเป็น **Private** ก่อนเปิดใช้งานเชิงพาณิชย์ ห้าม commit password, MT5 credential, JWT secret, admin key หรือ encryption key ลง Git

> ใช้ Demo/Strategy Tester/Forward Test ก่อนเงินจริงเสมอ ระบบนี้ไม่รับประกันผลตอบแทน
