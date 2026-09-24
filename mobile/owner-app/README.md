# SCENOVA Owner Mobile

แอปมือถือแยกสำหรับ OWNER เท่านั้น ใช้ดูยอด Omise, เงินค่าคอมที่ต้องสำรอง, คำขอถอนค่าคอมที่รออนุมัติ และสั่งถอนเงินของ Owner ผ่าน Omise Transfer API.

## Security model

- ครั้งแรก: SCENOVA email/password -> 2FA -> ตั้ง PIN 6 หลัก -> ผูก Device Secret.
- ครั้งถัดไป: PIN 6 หลักเพื่อขอ mobile session อายุสั้น.
- การอนุมัติ/Reject/Hold และการถอนเงินจริงต้องยืนยัน 2FA อีกครั้ง.
- Device Secret เก็บใน Expo SecureStore; OMISE_SECRET_KEY ไม่อยู่ในแอปและไม่ถูกส่งลงมือถือ.
- PIN ผิด 5 ครั้งล็อกอุปกรณ์ 15 นาที.
- ถอนเงิน Owner ได้ไม่เกิน Safe Withdrawable = Omise Transferable - Commission Reserve - Owner Cash Buffer.

## API URL

แอปถาม API URL ครั้งแรกและเก็บใน SecureStore เช่น `https://api.example.com/api`. Production ควรใช้ HTTPS เท่านั้น.

## Android APK

Workflow `Build SCENOVA Owner APK` สร้าง Debug APK ที่ติดตั้งแยกจากเว็บ/EA ได้โดยไม่ต้องใช้ Expo account. สำหรับเผยแพร่ Play Store ให้เพิ่ม production signing ภายหลัง.
