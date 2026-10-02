# SCENOVA Mirror

Companion app ขนาดเล็กสำหรับส่งภาพหน้าจอมือถือไปยัง Mobile Mirror card บน SCENOVA Dashboard เท่านั้น

## Platform

- Android: ใช้ MediaProjection ผ่าน react-native-webrtc
- iOS: ใช้ ReplayKit Broadcast Upload Extension ที่สร้างโดย @apirtc/expo-apirtc-options-plugin
- ไม่มีการจับเสียง กล้อง รีโมตคอนโทรล หรือข้อมูล Bot/MT5

## Flow

1. Dashboard สร้าง QR
2. มือถือสแกน QR และหน้าเว็บเปิด `scenova-mirror://connect?token=...`
3. SCENOVA Mirror ตรวจ token กับ API
4. ผู้ใช้กดเริ่มแชร์หน้าจอ
5. แอปส่ง video track ผ่าน WebRTC ไปยัง Dashboard
6. Dashboard แสดงภาพในการ์ดลอยเดิม

## Android

`npm install` แล้ว `npm run prebuild:android`

MediaProjection foreground service และ permissions ถูกตั้งโดย native config plugin

## iOS

`npm install` แล้ว `npm run prebuild:ios`

การ build สำหรับเครื่องจริงต้องมี Apple Developer Team / provisioning ที่รองรับ:
- App ID `com.scenova.mirror`
- Broadcast Upload Extension ที่ plugin สร้าง
- App Group ที่ extension ใช้ร่วมกับตัวแอป

CI สามารถตรวจ native prebuild/compile แบบไม่ sign ได้ แต่การติดตั้งบน iPhone จริงต้องใช้ Apple signing ตามข้อกำหนดของ iOS
