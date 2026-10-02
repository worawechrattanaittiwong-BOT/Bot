import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  findNodeHandle,
  Linking,
  NativeModules,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  mediaDevices,
  RTCPeerConnection,
  RTCSessionDescription,
  ScreenCapturePickerView
} from "react-native-webrtc";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://snvea-bot.online/backend/api";
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

function tokenFromUrl(value: string | null | undefined) {
  const input = String(value || "");
  const match = input.match(/[?&]token=([^&]+)/i);
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return "";
  }
}

async function mirrorRequest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const response = await fetch(API_URL + "/api" + path, {
    ...init,
    headers
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || "Mirror session unavailable");
  return data;
}

function waitForIceGathering(peer: any) {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      peer.removeEventListener?.("icegatheringstatechange", check);
      resolve();
    };
    const check = () => {
      if (peer.iceGatheringState === "complete") finish();
    };
    const timeout = setTimeout(finish, 5000);
    peer.addEventListener?.("icegatheringstatechange", check);
  });
}

export default function App() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("สแกน QR จาก Dashboard เพื่อเชื่อมต่อ");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const peerRef = useRef<any>(null);
  const streamRef = useRef<any>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickerRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;

    const acceptUrl = async (url: string | null | undefined) => {
      const nextToken = tokenFromUrl(url);
      if (!mounted || !nextToken) return;
      setToken(nextToken);
      setStatus("พร้อมแชร์หน้าจอ");
      try {
        await mirrorRequest("/mobile-mirror/connect/" + encodeURIComponent(nextToken));
      } catch {
        if (!mounted) return;
        setToken("");
        setStatus("QR หมดอายุหรือถูกยกเลิกแล้ว กรุณาสแกนใหม่");
      }
    };

    Linking.getInitialURL().then(acceptUrl).catch(() => {});
    const subscription = Linking.addEventListener("url", event => {
      void acceptUrl(event.url);
    });

    return () => {
      mounted = false;
      subscription.remove();
      if (pollRef.current) clearTimeout(pollRef.current);
      streamRef.current?.getTracks?.().forEach((track: any) => track.stop?.());
      peerRef.current?.close?.();
    };
  }, []);

  async function showIosBroadcastPicker() {
    const manager = NativeModules.ScreenCapturePickerViewManager;
    const reactTag = findNodeHandle(pickerRef.current);
    if (!manager?.show || !reactTag) {
      throw new Error("ไม่พบ ReplayKit Broadcast Picker");
    }
    await manager.show(reactTag);
  }

  async function stopSharing(message = "หยุดแชร์หน้าจอแล้ว") {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
    streamRef.current?.getTracks?.().forEach((track: any) => track.stop?.());
    streamRef.current = null;
    peerRef.current?.close?.();
    peerRef.current = null;
    setConnected(false);
    setBusy(false);
    setStatus(message);
  }

  async function startSharing() {
    if (!token || busy || connected) return;
    setBusy(true);
    setStatus(Platform.OS === "ios" ? "กำลังเปิด ReplayKit..." : "กำลังขอสิทธิ์แชร์หน้าจอ...");

    try {
      let streamPromise: Promise<any>;

      if (Platform.OS === "ios") {
        // Start the RN WebRTC screen receiver before the ReplayKit extension
        // connects so the Unix-socket bridge is already listening.
        streamPromise = (mediaDevices as any).getDisplayMedia();
        await showIosBroadcastPicker();
      } else {
        streamPromise = (mediaDevices as any).getDisplayMedia({
          video: {
            frameRate: 30,
            android: {
              createConfigForDefaultDisplay: true,
              resolutionScale: 0.75
            }
          },
          audio: false
        });
      }

      const stream = await streamPromise;
      stream.getAudioTracks?.().forEach((track: any) => track.stop?.());
      const videoTracks = stream.getVideoTracks?.() || [];
      if (!videoTracks.length) throw new Error("ไม่พบภาพหน้าจอจากอุปกรณ์");

      streamRef.current = stream;
      const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS } as any);
      peerRef.current = peer;

      for (const track of videoTracks) {
        peer.addTrack(track, stream);
        track.addEventListener?.("ended", () => {
          void stopSharing("หยุดแชร์หน้าจอแล้ว");
        });
      }

      (peer as any).onconnectionstatechange = () => {
        if (peer.connectionState === "connected") {
          setConnected(true);
          setBusy(false);
          setStatus("กำลังแชร์หน้าจอ");
        } else if (peer.connectionState === "failed" || peer.connectionState === "closed") {
          void stopSharing("การเชื่อมต่อสิ้นสุดแล้ว");
        }
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await waitForIceGathering(peer);
      const local = peer.localDescription;
      if (!local?.sdp) throw new Error("สร้าง WebRTC offer ไม่สำเร็จ");

      await mirrorRequest("/mobile-mirror/connect/" + encodeURIComponent(token) + "/offer", {
        method: "POST",
        body: JSON.stringify({ type: "offer", sdp: local.sdp })
      });

      setStatus("กำลังเชื่อมต่อกับ Dashboard...");
      let applied = false;
      const pollAnswer = async () => {
        if (applied || peer.connectionState === "closed") return;
        try {
          const data = await mirrorRequest("/mobile-mirror/connect/" + encodeURIComponent(token) + "/answer");
          if (data?.answer?.type === "answer" && data?.answer?.sdp) {
            applied = true;
            await peer.setRemoteDescription(new RTCSessionDescription({
              type: "answer",
              sdp: String(data.answer.sdp)
            }));
            return;
          }
        } catch {
          await stopSharing("QR ถูกยกเลิกหรือหมดอายุ กรุณาสแกนใหม่");
          return;
        }
        pollRef.current = setTimeout(pollAnswer, 900);
      };
      void pollAnswer();
    } catch (error: any) {
      await stopSharing(
        error?.name === "NotAllowedError"
          ? "ไม่ได้อนุญาตให้แชร์หน้าจอ"
          : (error?.message || "เริ่มแชร์หน้าจอไม่สำเร็จ")
      );
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.card}>
        <Text style={styles.icon}>📱</Text>
        <Text style={styles.title}>SCENOVA Mirror</Text>
        <Text style={styles.subtitle}>
          {token
            ? "กดปุ่มเดียวเพื่อส่งภาพหน้าจอไปยัง Dashboard"
            : "สแกน QR จาก Dashboard แล้วระบบจะเปิดแอปนี้อัตโนมัติ"}
        </Text>

        {Platform.OS === "ios" && (
          <View style={styles.hiddenPicker}>
            <ScreenCapturePickerView ref={pickerRef} />
          </View>
        )}

        <TouchableOpacity
          activeOpacity={0.85}
          disabled={!token || busy}
          onPress={connected ? () => void stopSharing() : startSharing}
          style={[
            styles.button,
            (!token || busy) && styles.buttonDisabled,
            connected && styles.stopButton
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>
              {connected ? "หยุดแชร์หน้าจอ" : "เริ่มแชร์หน้าจอ"}
            </Text>
          )}
        </TouchableOpacity>

        <Text style={[styles.status, connected && styles.statusLive]}>{status}</Text>
        <Text style={styles.note}>ส่งเฉพาะภาพหน้าจอ · ไม่ส่งเสียง · ไม่ควบคุมมือถือ</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#070b14",
    justifyContent: "center",
    padding: 20
  },
  card: {
    borderWidth: 1,
    borderColor: "rgba(125,111,220,.42)",
    backgroundColor: "#101629",
    borderRadius: 22,
    padding: 24,
    alignItems: "center"
  },
  icon: { fontSize: 46, marginBottom: 12 },
  title: { color: "#f4f1ff", fontSize: 24, fontWeight: "800" },
  subtitle: {
    color: "#9aa8c4",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 9,
    marginBottom: 22
  },
  button: {
    width: "100%",
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: "#5b4ddd",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16
  },
  buttonDisabled: { opacity: 0.5 },
  stopButton: { backgroundColor: "#8d3447" },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  status: { color: "#b6c0d6", fontSize: 13, marginTop: 16, textAlign: "center" },
  statusLive: { color: "#8ee3a6" },
  note: { color: "#73809a", fontSize: 11, marginTop: 10, textAlign: "center" },
  hiddenPicker: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0.01
  }
});
