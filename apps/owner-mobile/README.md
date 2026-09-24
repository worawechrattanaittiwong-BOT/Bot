# SCENOVA Owner Mobile

แอปมือถือแยกสำหรับ OWNER เท่านั้น ใช้ตรวจยอด Omise, ดูค่าคอม, อนุมัติคำขอถอน และถอน Safe Withdrawable Balance ของเจ้าของผ่าน Omise Transfer API

## Security flow

ครั้งแรก:
1. Email + Password ของ OWNER
2. TOTP 2FA 6 หลัก
3. ตั้ง PIN 6 หลัก
4. Device ถูกลงทะเบียนกับ API

ครั้งถัดไป:
1. เปิดแอป
2. ใส่ PIN
3. API ออก Owner Mobile session อายุ 30 นาที

การอนุมัติ/พัก/ปฏิเสธคำขอถอน และการถอนเงินเจ้าของ ต้องใส่ PIN ซ้ำทุกครั้ง

> ห้ามใส่ OMISE_SECRET_KEY ในแอปมือถือ Secret อยู่ที่ API server เท่านั้น

## Build APK

```bash
cd apps/owner-mobile
npm install
cp .env.example .env
# แก้ EXPO_PUBLIC_API_URL ให้เป็น API production
npx eas login
npm run build:android:apk
```

EAS จะสร้าง APK แบบ Internal Distribution แยกจากเว็บ SCENOVA

## Device safety

- ใช้งาน OWNER ได้ทีละ 1 โทรศัพท์ที่ Active
- ลงทะเบียนเครื่องใหม่ด้วย Password + TOTP จะยกเลิกสิทธิ์เครื่องเก่า
- หากลืม PIN สามารถตั้ง PIN ใหม่ด้วยขั้นตอนลงทะเบียนเต็มรูปแบบ
- แอปล็อกทันทีเมื่อออกไป background และพยายาม revoke server session
- การอนุมัติ/ปฏิเสธ/ถอนเงินต้องยืนยัน PIN ซ้ำ และ PIN ผิดซ้ำจะล็อกเครื่องชั่วคราว
