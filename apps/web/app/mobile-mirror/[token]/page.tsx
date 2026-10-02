"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { API_URL } from "../../../lib/api";

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

function waitForIceGathering(peer: RTCPeerConnection) {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      peer.removeEventListener("icegatheringstatechange", check);
      window.clearTimeout(timeout);
      resolve();
    };
    const check = () => {
      if (peer.iceGatheringState === "complete") finish();
    };
    const timeout = window.setTimeout(finish, 5_000);
    peer.addEventListener("icegatheringstatechange", check);
  });
}

async function mirrorRequest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const response = await fetch(API_URL + "/api" + path, {
    ...init,
    headers,
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || "Mirror session unavailable");
  return data;
}

export default function MobileMirrorSenderPage() {
  const params = useParams<{token:string}>();
  const token = String(params?.token || "");
  const [status, setStatus] = useState("พร้อมเชื่อมต่อ");
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState(true);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setAvailable(false);
      setStatus("ลิงก์เชื่อมต่อไม่ถูกต้อง");
      return;
    }

    mirrorRequest("/mobile-mirror/connect/" + encodeURIComponent(token))
      .then(() => {
        if (!cancelled) setStatus("พร้อมเชื่อมต่อ");
      })
      .catch(() => {
        if (!cancelled) {
          setAvailable(false);
          setStatus("QR หมดอายุหรือถูกยกเลิกแล้ว");
        }
      });

    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
      streamRef.current?.getTracks().forEach(track => track.stop());
      peerRef.current?.close();
    };
  }, [token]);

  async function startSharing() {
    if (!available || busy) return;
    const mediaDevices = navigator.mediaDevices as MediaDevices | undefined;
    if (!mediaDevices?.getDisplayMedia) {
      setStatus("เบราว์เซอร์นี้ยังไม่รองรับการแชร์หน้าจอ");
      return;
    }

    setBusy(true);
    setStatus("เลือกหน้าจอที่ต้องการแชร์...");

    try {
      const stream = await mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false
      });
      streamRef.current = stream;

      const peer = new RTCPeerConnection(ICE_CONFIG);
      peerRef.current = peer;
      stream.getTracks().forEach(track => peer.addTrack(track, stream));

      const stopLocal = () => {
        stream.getTracks().forEach(track => track.stop());
        peer.close();
        setBusy(false);
      };

      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        setStatus("หยุดแชร์หน้าจอแล้ว");
        stopLocal();
      }, { once: true });

      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "connected") {
          setStatus("เชื่อมต่อแล้ว");
          setBusy(false);
        } else if (peer.connectionState === "failed" || peer.connectionState === "closed") {
          setStatus("การเชื่อมต่อสิ้นสุดแล้ว");
          stopLocal();
        }
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await waitForIceGathering(peer);
      const local = peer.localDescription;
      if (!local) throw new Error("สร้างการเชื่อมต่อไม่สำเร็จ");

      await mirrorRequest("/mobile-mirror/connect/" + encodeURIComponent(token) + "/offer", {
        method: "POST",
        body: JSON.stringify({ type: local.type, sdp: local.sdp })
      });
      setStatus("กำลังเชื่อมต่อกับระบบ...");

      let answerApplied = false;
      const pollAnswer = async () => {
        if (answerApplied || peer.connectionState === "closed") return;
        try {
          const data = await mirrorRequest("/mobile-mirror/connect/" + encodeURIComponent(token) + "/answer");
          if (data?.answer?.sdp && data?.answer?.type === "answer") {
            answerApplied = true;
            await peer.setRemoteDescription({ type: "answer", sdp: String(data.answer.sdp) });
            return;
          }
        } catch {
          setStatus("QR ถูกยกเลิกหรือการเชื่อมต่อสิ้นสุดแล้ว");
          stopLocal();
          return;
        }
        pollRef.current = setTimeout(pollAnswer, 900);
      };
      pollAnswer();
    } catch (error: any) {
      streamRef.current?.getTracks().forEach(track => track.stop());
      peerRef.current?.close();
      peerRef.current = null;
      streamRef.current = null;
      setBusy(false);
      setStatus(
        error?.name === "NotAllowedError"
          ? "ไม่ได้อนุญาตให้แชร์หน้าจอ"
          : (error?.message || "เชื่อมต่อไม่สำเร็จ")
      );
    }
  }

  return (
    <main style={{
      minHeight:"100vh",display:"grid",placeItems:"center",padding:20,
      background:"#070b14",color:"#eef2ff",fontFamily:"system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
    }}>
      <section style={{
        width:"min(390px,100%)",padding:22,borderRadius:20,
        border:"1px solid rgba(124,111,214,.42)",
        background:"linear-gradient(145deg,#11172a,#0a0f1b)",
        boxShadow:"0 24px 80px rgba(0,0,0,.5)",textAlign:"center"
      }}>
        <div style={{fontSize:42,marginBottom:12}}>📱</div>
        <h1 style={{margin:"0 0 8px",fontSize:20}}>แชร์หน้าจอมือถือ</h1>
        <p style={{margin:"0 0 18px",fontSize:13,lineHeight:1.6,color:"#9ba8c2"}}>
          กดปุ่มด้านล่าง แล้วเลือกหน้าจอที่ต้องการให้แสดงบนระบบ
        </p>
        <button
          type="button"
          onClick={startSharing}
          disabled={!available || busy}
          style={{
            width:"100%",minHeight:48,borderRadius:12,
            border:"1px solid rgba(137,118,255,.7)",
            background:(!available || busy) ? "#25293a" : "linear-gradient(135deg,#6248d9,#3c63d7)",
            color:"#fff",fontWeight:800,fontSize:15,cursor:(!available || busy) ? "not-allowed" : "pointer",
            opacity:(!available || busy) ? .65 : 1
          }}
        >
          {busy ? "กำลังเชื่อมต่อ..." : "เริ่มแชร์หน้าจอ"}
        </button>
        <div style={{marginTop:14,fontSize:12,color:available ? "#aebbd3" : "#efb2b2"}}>
          {status}
        </div>
      </section>
    </main>
  );
}
