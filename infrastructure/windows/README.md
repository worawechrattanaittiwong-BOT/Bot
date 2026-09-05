# Windows Trading Worker

เป้าหมาย: หนึ่ง Windows VPS รัน MT5 portable หลาย instance โดยแต่ละ account แยก directory.

โครงสร้างแนะนำ:

C:\BotTrading\
- template\         MT5 terminal template + compiled FastBasketBot.ex5
- instances\        instance แยกตาม SaaS instanceId
- logs\
- worker\

## Worker flow
1. Windows service ส่ง POST /api/worker/heartbeat
2. ขอ POST /api/worker/claim-next
3. API atomically assign Cloud instance ให้ runner
4. Worker ได้ account number, broker server, trading password, instanceId, install token และ settings ผ่าน HTTPS
5. สร้าง MT5 portable instance จาก template
6. สร้าง startup configuration ของ MT5 และ attach compiled EA
7. เปิด terminal64.exe /portable
8. EA heartbeat กลับ API โดยตรง
9. Worker ไม่ควรเก็บ credential ใน log และ temporary config ต้องลบ/จำกัด ACL

## Beta recommendation
ช่วง Beta ให้ provision MT5 instance แบบกึ่งอัตโนมัติก่อน เพื่อยืนยัน Exness server name, terminal build, profile และ Expert startup format. เมื่อ flow นี้นิ่งค่อยเปิด auto-provision 100%.

compiled EX5 สำหรับ Cloud ต้องเก็บใน server build artifact ไม่เปิด public download.
