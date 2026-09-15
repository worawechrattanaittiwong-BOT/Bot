# SCENOVA Smart Installer — Generation V3

**Current installer runtime version: 1.0.8**

`Smart Installer V3` เป็นชื่อ generation ของสถาปัตยกรรมและชุดความสามารถ ไม่ใช่ semantic runtime version ของไฟล์ติดตั้ง ส่วนชื่อ 3.0/3.1 ที่พบในประวัติเดิมให้ถือเป็น feature milestone ภายใน Generation V3 เท่านั้น

Runtime compatibility ปัจจุบันใช้ release line `1.0.x`. ค่าใน API, Device Agent และ Windows project ต้องตรงกัน และ `tests/release-version-consistency.ps1` จะตรวจ contract นี้ใน CI

## Core capabilities

Generation V3 ครอบคลุม Auto Detect MT5, health check, install/repair, component update, rollback, Multi-MT5 profiles, hash verification, post-install verification, preset migration, advanced diagnostics และ release-channel controls

## Safety invariants

- การ update ต้องเคารพ SafeToRestart จาก Server
- Existing customer settings ต้องไม่ถูก reset ระหว่าง preset migration
- Stable เป็น default release channel
- Compatibility ใช้ runtime version `1.0.x` ไม่ใช้ชื่อ generation V3/V3.1

## Publishing

Windows Installer/Device Agent runtime ปัจจุบันคือ **1.0.8**. Build workflow สร้าง `SCENOVA-Setup.exe` เป็น stable alias และ `SCENOVA-Setup-v<current>.exe` เป็น current versioned binary

หลัง publish เข้า `main`, cleanup workflow จะลบ versioned installer รุ่นเก่าที่ไม่ใช่ current อัตโนมัติ เพื่อไม่ให้ repository สะสม binary ที่เลิกใช้แล้ว
