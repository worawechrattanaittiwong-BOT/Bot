"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { api } from "../lib/api";
import { usePathname } from "next/navigation";
import { ScenovaMascotLauncher } from "./mascot/ScenovaMascotLauncher";

type MirrorSession = {
  sessionId: string;
  token: string;
  expiresAt: string;
};

type MirrorOffer = {
  type: "offer";
  sdp: string;
  revision: number;
};

type CardFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

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

function clampFrame(frame: CardFrame): CardFrame {
  if (typeof window === "undefined") return frame;
  const width = Math.max(180, Math.min(frame.width, Math.max(180, window.innerWidth - 24)));
  const height = Math.max(240, Math.min(frame.height, Math.max(240, window.innerHeight - 24)));
  return {
    width,
    height,
    x: Math.max(8, Math.min(frame.x, Math.max(8, window.innerWidth - width - 8))),
    y: Math.max(8, Math.min(frame.y, Math.max(8, window.innerHeight - height - 8)))
  };
}

export function MobileMirrorOverlay() {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  const [session, setSession] = useState<MirrorSession | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [pairing, setPairing] = useState(false);
  const [live, setLive] = useState(false);
  const [message, setMessage] = useState("");
  const [frame, setFrame] = useState<CardFrame>({ x: 24, y: 90, width: 260, height: 460 });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const sessionRef = useRef<MirrorSession | null>(null);
  const handledOfferRevisionRef = useRef(0);
  const dragRef = useRef<{x:number;y:number;startX:number;startY:number} | null>(null);
  const resizeRef = useRef<{width:number;height:number;startX:number;startY:number} | null>(null);

  useEffect(() => {
    const active = typeof window !== "undefined" && window.location.pathname === "/dashboard";
    setEnabled(active);
    if (!active) return;

    try {
      const saved = localStorage.getItem("scenova_mobile_mirror_frame");
      if (saved) setFrame(clampFrame(JSON.parse(saved)));
      else setFrame(clampFrame({
        x: Math.max(12, window.innerWidth - 292),
        y: 90,
        width: 260,
        height: 460
      }));
    } catch {}

    const resize = () => setFrame(current => clampFrame(current));
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [pathname]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!live || !videoRef.current || !remoteStreamRef.current) return;
    videoRef.current.srcObject = remoteStreamRef.current;
    void videoRef.current.play().catch(() => {});
  }, [live]);

  useEffect(() => {
    if (!enabled || !pairing || !session) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let requestInFlight = false;

    const schedule = () => {
      if (!cancelled) timer = setTimeout(poll, 900);
    };

    const poll = async () => {
      if (cancelled || requestInFlight) return;
      requestInFlight = true;
      try {
        const state = await api("/mobile-mirror/sessions/" + encodeURIComponent(session.sessionId)) as {
          state: string;
          offer: MirrorOffer | null;
        };
        if (cancelled) return;

        const offer = state.offer;
        if (offer && offer.revision > handledOfferRevisionRef.current) {
          handledOfferRevisionRef.current = offer.revision;
          setMessage("กำลังเชื่อมต่อ...");

          peerRef.current?.close();
          const peer = new RTCPeerConnection(ICE_CONFIG);
          peerRef.current = peer;

          peer.ontrack = event => {
            if (cancelled) return;
            const stream = event.streams[0] || new MediaStream([event.track]);
            remoteStreamRef.current = stream;
            setLive(true);
            setPairing(false);
            setMessage("");
          };

          peer.onconnectionstatechange = () => {
            if (cancelled) return;
            if (peer.connectionState === "failed" || peer.connectionState === "closed") {
              setLive(false);
              setMessage("การเชื่อมต่อหลุด");
            }
          };

          await peer.setRemoteDescription({ type: "offer", sdp: offer.sdp });
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          await waitForIceGathering(peer);
          const local = peer.localDescription;
          if (!local) throw new Error("สร้างการเชื่อมต่อไม่สำเร็จ");

          await api("/mobile-mirror/sessions/" + encodeURIComponent(session.sessionId) + "/answer", {
            method: "POST",
            body: JSON.stringify({ type: local.type, sdp: local.sdp })
          });
        }
      } catch (error: any) {
        if (!cancelled) setMessage(error?.message || "เชื่อมต่อไม่สำเร็จ");
      } finally {
        requestInFlight = false;
        schedule();
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, pairing, session]);

  useEffect(() => {
    return () => {
      peerRef.current?.close();
      peerRef.current = null;
    };
  }, []);

  async function startPairing() {
    setMessage("");
    setQrDataUrl("");
    setLive(false);
    handledOfferRevisionRef.current = 0;
    peerRef.current?.close();
    peerRef.current = null;

    try {
      const next = await api("/mobile-mirror/sessions", { method: "POST", body: "{}" }) as MirrorSession;
      const url = window.location.origin + "/mobile-mirror/" + encodeURIComponent(next.token);
      const qr = await QRCode.toDataURL(url, {
        width: 232,
        margin: 1,
        errorCorrectionLevel: "M"
      });
      setSession(next);
      setQrDataUrl(qr);
      setPairing(true);
      return true;
    } catch (error: any) {
      setMessage(error?.message || "สร้าง QR ไม่สำเร็จ");
      return false;
    }
  }

  async function stopMirror() {
    const current = sessionRef.current;
    setPairing(false);
    setLive(false);
    setQrDataUrl("");
    setSession(null);
    setMessage("");
    handledOfferRevisionRef.current = 0;

    remoteStreamRef.current?.getTracks().forEach(track => track.stop());
    remoteStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;

    peerRef.current?.close();
    peerRef.current = null;

    if (current) {
      try {
        await api("/mobile-mirror/sessions/" + encodeURIComponent(current.sessionId), { method: "DELETE" });
      } catch {}
    }
  }

  function saveFrame(next: CardFrame) {
    const safe = clampFrame(next);
    setFrame(safe);
    try {
      localStorage.setItem("scenova_mobile_mirror_frame", JSON.stringify(safe));
    } catch {}
  }

  function beginDrag(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    dragRef.current = { x: frame.x, y: frame.y, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    saveFrame({
      ...frame,
      x: drag.x + event.clientX - drag.startX,
      y: drag.y + event.clientY - drag.startY
    });
  }

  function endDrag() {
    dragRef.current = null;
  }

  function beginResize(event: React.PointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    resizeRef.current = {
      width: frame.width,
      height: frame.height,
      startX: event.clientX,
      startY: event.clientY
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveResize(event: React.PointerEvent<HTMLDivElement>) {
    const resize = resizeRef.current;
    if (!resize) return;
    saveFrame({
      ...frame,
      width: resize.width + event.clientX - resize.startX,
      height: resize.height + event.clientY - resize.startY
    });
  }

  function endResize() {
    resizeRef.current = null;
  }

  if (!enabled) return null;

  return (
    <>
      {!pairing && !live && (
        <ScenovaMascotLauncher className="cc-mobile-mirror-launch" onConnectMobile={startPairing} error={message} />
      )}

      {pairing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="เชื่อมต่อหน้าจอมือถือ"
          style={{
            position:"fixed", inset:0, zIndex:120,
            display:"grid", placeItems:"center",
            background:"rgba(3,6,14,.66)", padding:18
          }}
        >
          <div style={{
            width:"min(340px,100%)", border:"1px solid rgba(133,121,207,.42)",
            borderRadius:18, background:"#0d1220", color:"#eef2ff",
            boxShadow:"0 24px 80px rgba(0,0,0,.55)", padding:18,
            textAlign:"center", position:"relative"
          }}>
            <button
              type="button"
              onClick={stopMirror}
              aria-label="ปิด"
              style={{
                position:"absolute", right:10, top:10, width:34, height:34,
                borderRadius:10, border:"1px solid rgba(255,255,255,.12)",
                background:"rgba(255,255,255,.04)", color:"#cbd5e1", cursor:"pointer"
              }}
            >
              ×
            </button>
            <div style={{fontWeight:850,fontSize:16,marginBottom:12}}>สแกนเพื่อแสดงหน้าจอมือถือ</div>
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR สำหรับเชื่อมต่อหน้าจอมือถือ"
                width={232}
                height={232}
                style={{display:"block",margin:"0 auto",background:"#fff",borderRadius:12,padding:7}}
              />
            ) : (
              <div style={{height:246,display:"grid",placeItems:"center",color:"#94a3b8"}}>กำลังสร้าง QR...</div>
            )}
            <div style={{marginTop:12,fontSize:12,color:"#94a3b8"}}>
              QR ใช้ได้ประมาณ 10 นาที · สแกนแล้วเปิด SCENOVA Mirror เพื่ออนุญาตแชร์หน้าจอ
            </div>
            {message && <div style={{marginTop:10,fontSize:12,color:"#f0c875"}}>{message}</div>}
          </div>
        </div>
      )}

      {live && (
        <div
          style={{
            position:"fixed", left:frame.x, top:frame.y,
            width:frame.width, height:frame.height,
            zIndex:110, display:"flex", flexDirection:"column",
            overflow:"hidden", borderRadius:16,
            border:"1px solid rgba(122,110,210,.55)",
            background:"#070a12", boxShadow:"0 20px 55px rgba(0,0,0,.48)"
          }}
        >
          <div
            onPointerDown={beginDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{
              height:38, flex:"0 0 38px", display:"flex", alignItems:"center",
              justifyContent:"space-between", padding:"0 8px 0 11px",
              background:"linear-gradient(90deg,#15172b,#111628)",
              color:"#dfe6ff", cursor:"grab", touchAction:"none",
              userSelect:"none", borderBottom:"1px solid rgba(255,255,255,.08)"
            }}
          >
            <span style={{fontSize:12,fontWeight:800}}>📱 MOBILE</span>
            <button
              type="button"
              onClick={stopMirror}
              aria-label="ตัดการเชื่อมต่อมือถือ"
              title="ตัดการเชื่อมต่อ"
              style={{
                width:28,height:28,borderRadius:8,border:"1px solid rgba(255,255,255,.1)",
                background:"rgba(255,255,255,.04)",color:"#cbd5e1",cursor:"pointer",fontSize:18
              }}
            >
              ×
            </button>
          </div>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{width:"100%",height:"calc(100% - 38px)",objectFit:"contain",background:"#000"}}
          />
          <div
            aria-label="ปรับขนาดการ์ด"
            onPointerDown={beginResize}
            onPointerMove={moveResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            style={{
              position:"absolute",right:0,bottom:0,width:24,height:24,
              cursor:"nwse-resize",touchAction:"none"
            }}
          >
            <span style={{
              position:"absolute",right:5,bottom:5,width:9,height:9,
              borderRight:"2px solid rgba(255,255,255,.58)",
              borderBottom:"2px solid rgba(255,255,255,.58)"
            }}/>
          </div>
        </div>
      )}

    </>
  );
}
