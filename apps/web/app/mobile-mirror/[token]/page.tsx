"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { API_URL } from "../../../lib/api";

type MobilePlatform = "ANDROID" | "IOS" | "OTHER";

function detectPlatform(): MobilePlatform {
  if (typeof navigator === "undefined") return "OTHER";
  const ua = navigator.userAgent || "";
  if (/android/i.test(ua)) return "ANDROID";
  if (/iphone|ipad|ipod/i.test(ua)) return "IOS";
  return "OTHER";
}

async function validateSession(token: string) {
  const response = await fetch(
    API_URL + "/api/mobile-mirror/connect/" + encodeURIComponent(token),
    { cache: "no-store" }
  );
  if (!response.ok) throw new Error("Mirror session unavailable");
}

export default function MobileMirrorLauncherPage() {
  const params = useParams<{token:string}>();
  const token = String(params?.token || "");
  const [platform, setPlatform] = useState<MobilePlatform>("OTHER");
  const [valid, setValid] = useState(false);
  const [status, setStatus] = useState("กำลังตรวจสอบ QR...");

  useEffect(() => {
    setPlatform(detectPlatform());
    let cancelled = false;

    if (!token) {
      setStatus("ลิงก์เชื่อมต่อไม่ถูกต้อง");
      return;
    }

    validateSession(token)
      .then(() => {
        if (cancelled) return;
        setValid(true);
        setStatus("พร้อมเปิด SCENOVA Mirror");
      })
      .catch(() => {
        if (cancelled) return;
        setValid(false);
        setStatus("QR หมดอายุหรือถูกยกเลิกแล้ว กรุณาสแกนใหม่");
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const deepLink = useMemo(
    () => "scenova-mirror://connect?token=" + encodeURIComponent(token),
    [token]
  );

  function openMirrorApp() {
    if (!valid) return;
    window.location.href = deepLink;
  }

  return (
    <main style={{
      minHeight:"100vh",display:"grid",placeItems:"center",padding:20,
      background:"#070b14",color:"#eef2ff",
      fontFamily:"system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
    }}>
      <section style={{
        width:"min(390px,100%)",padding:22,borderRadius:20,
        border:"1px solid rgba(124,111,214,.42)",
        background:"linear-gradient(145deg,#11172a,#0a0f1b)",
        boxShadow:"0 24px 80px rgba(0,0,0,.5)",textAlign:"center"
      }}>
        <div style={{fontSize:44,marginBottom:12}}>📱</div>
        <h1 style={{margin:"0 0 8px",fontSize:21}}>SCENOVA Mirror</h1>
        <p style={{margin:"0 0 18px",fontSize:13,lineHeight:1.65,color:"#9ba8c2"}}>
          เปิดแอปเพื่อแชร์หน้าจอมือถือไปยัง Dashboard
        </p>

        <button
          type="button"
          onClick={openMirrorApp}
          disabled={!valid}
          style={{
            width:"100%",minHeight:50,borderRadius:13,
            border:"1px solid rgba(137,118,255,.7)",
            background:valid ? "linear-gradient(135deg,#6248d9,#3c63d7)" : "#25293a",
            color:"#fff",fontWeight:800,fontSize:15,
            cursor:valid ? "pointer" : "not-allowed",
            opacity:valid ? 1 : .65
          }}
        >
          เปิด SCENOVA Mirror
        </button>

        {platform === "ANDROID" && (
          <a
            href="/downloads/SCENOVA-Mirror.apk"
            style={{
              display:"block",marginTop:12,padding:"12px 14px",borderRadius:12,
              border:"1px solid rgba(255,255,255,.12)",color:"#cbd5e1",
              textDecoration:"none",fontSize:13,fontWeight:700
            }}
          >
            ยังไม่มีแอป? ดาวน์โหลด Android APK
          </a>
        )}

        {platform === "IOS" && (
          <div style={{marginTop:12,fontSize:12,lineHeight:1.6,color:"#9ba8c2"}}>
            iPhone/iPad ใช้ SCENOVA Mirror ที่ติดตั้งและเซ็นด้วย Apple Developer
            เพื่อเปิด ReplayKit Screen Broadcast
          </div>
        )}

        {platform === "OTHER" && (
          <div style={{marginTop:12,fontSize:12,lineHeight:1.6,color:"#9ba8c2"}}>
            กรุณาเปิด QR นี้บน Android หรือ iPhone/iPad
          </div>
        )}

        <div style={{
          marginTop:16,paddingTop:14,borderTop:"1px solid rgba(255,255,255,.08)",
          fontSize:12,color:valid ? "#aebbd3" : "#efb2b2"
        }}>
          {status}
        </div>
      </section>
    </main>
  );
}
