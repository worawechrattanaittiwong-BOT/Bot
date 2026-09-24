import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, BackHandler, Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import appConfig from "./app.json";
import { type Approval, type ApprovalAction, type MainTab, type OwnerUpdateManifest, type Summary } from "./src/finance";
import { ThemeProvider, type ThemeMode, useTheme } from "./src/theme";
import { Button, Copy, Frame, Notice } from "./src/ui";
import { ApprovalDetail, ApprovalList, Dashboard, type Enrollment, FirstSetup, OwnerWithdraw, PinLogin, UpdateNotice } from "./src/screens";
import { AccountsScreen, PackagesScreen, PromotionsScreen } from "./src/management";

const API = String(process.env.EXPO_PUBLIC_API_URL || "").replace(/\/$/, "");
const DEVICE_KEY = "scenova.owner.deviceId";
const TOKEN_KEY = "scenova.owner.session";
const ENROLLED_KEY = "scenova.owner.enrolled";
const THEME_KEY = "scenova.owner.theme";
const OWNER_UPDATE_MANIFEST = "https://snvea-bot.online/downloads/SCENOVA-Owner.json";
const OWNER_UPDATE_APK = "https://snvea-bot.online/downloads/SCENOVA-Owner.apk";
const CURRENT_BUILD = Math.max(1, Number(process.env.EXPO_PUBLIC_OWNER_BUILD || 1));
type Screen = MainTab | "pin" | "setup" | "approvals" | "detail" | "withdraw";
class RequestError extends Error { constructor(message: string, readonly status: number) { super(message); } }
async function request(path: string, options: RequestInit = {}, token?: string) {
  if (!API) throw new Error("ยังไม่พร้อมเชื่อมต่อบริการ กรุณาติดต่อผู้ดูแล");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(API + path, { ...options, signal: controller.signal, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}), ...options.headers } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new RequestError(String(data?.message || data?.error || "ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง"), response.status);
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("การเชื่อมต่อใช้เวลานาน กรุณาตรวจสอบรายการล่าสุดก่อนลองอีกครั้ง");
    throw error;
  } finally { clearTimeout(timer); }
}
async function fetchOwnerUpdate(): Promise<OwnerUpdateManifest | null> {
  if (Platform.OS !== "android") return null;
  const response = await fetch(OWNER_UPDATE_MANIFEST + "?t=" + Date.now(), { cache: "no-store" });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  if (!data || !Number.isFinite(Number(data.versionCode))) return null;
  return { version: String(data.version || ""), versionCode: Number(data.versionCode), url: String(data.url || OWNER_UPDATE_APK), sha256: data.sha256 ? String(data.sha256) : undefined, releasedAt: data.releasedAt ? String(data.releasedAt) : undefined };
}
async function installOwnerUpdate(manifest: OwnerUpdateManifest) {
  if (Platform.OS !== "android") return;
  if (!FileSystem.cacheDirectory) throw new Error("ไม่พบพื้นที่ดาวน์โหลดของแอป");
  const target = FileSystem.cacheDirectory + "SCENOVA-Owner-update.apk";
  await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
  const result = await FileSystem.downloadAsync(manifest.url || OWNER_UPDATE_APK, target);
  if (result.status < 200 || result.status >= 300) throw new Error("ดาวน์โหลดอัปเดตไม่สำเร็จ");
  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  try {
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", { data: contentUri, type: "application/vnd.android.package-archive", flags: 1 });
  } catch {
    await IntentLauncher.startActivityAsync("android.settings.MANAGE_UNKNOWN_APP_SOURCES", { data: "package:com.scenova.owner" });
    throw new Error("กรุณาเปิดสิทธิ์ติดตั้งแอปจาก SCENOVA Owner แล้วกดอัปเดตอีกครั้ง");
  }
}
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง";

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const themeWrites = useRef(Promise.resolve());
  const changeTheme = useCallback((next: ThemeMode) => {
    setTheme(next);
    themeWrites.current = themeWrites.current.catch(() => {}).then(() => SecureStore.setItemAsync(THEME_KEY, next));
    void themeWrites.current.catch(() => {});
  }, []);
  return <SafeAreaProvider><ThemeProvider mode={theme} setMode={changeTheme}><OwnerApp restoreTheme={setTheme} /></ThemeProvider></SafeAreaProvider>;
}

function OwnerApp({ restoreTheme }: { restoreTheme: (theme: ThemeMode) => void }) {
  const { mode: theme, colors: c } = useTheme();
  const [deviceId, setDeviceId] = useState("");
  const [enrolled, setEnrolled] = useState(false);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState("");
  const [screen, setScreen] = useState<Screen>("setup");
  const [token, setToken] = useState("");
  const tokenRef = useRef("");
  const generation = useRef(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const [approvals, setApprovals] = useState<Approval[] | null>(null);
  const [approvalsError, setApprovalsError] = useState("");
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [selected, setSelected] = useState<Approval | null>(null);
  const [updateManifest, setUpdateManifest] = useState<OwnerUpdateManifest | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const updateAttempted = useRef(0);
  const updateInFlight = useRef(false);
  const summaryInFlight = useRef<number | null>(null);
  const approvalsInFlight = useRef<number | null>(null);

  const boot = useCallback(async () => {
    setBooting(true); setBootError("");
    try {
      let id = await SecureStore.getItemAsync(DEVICE_KEY);
      if (!id) { id = Crypto.randomUUID(); await SecureStore.setItemAsync(DEVICE_KEY, id); }
      const wasEnrolled = await SecureStore.getItemAsync(ENROLLED_KEY) === "1";
      const savedTheme = await SecureStore.getItemAsync(THEME_KEY);
      if (savedTheme === "dark" || savedTheme === "light") restoreTheme(savedTheme);
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      setDeviceId(id); setEnrolled(wasEnrolled); setScreen(wasEnrolled ? "pin" : "setup");
    } catch { setBootError("เปิดข้อมูลในเครื่องไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setBooting(false); }
  }, [restoreTheme]);
  useEffect(() => { void boot(); }, [boot]);

  const lock = useCallback(() => {
    const previous = tokenRef.current;
    generation.current += 1;
    tokenRef.current = "";
    setToken(""); setSummary(null); setApprovals(null); setSelected(null); setUpdatedAt(undefined);
    setSummaryError(""); setApprovalsError(""); setRefreshing(false); setApprovalsLoading(false); setScreen("pin");
    void SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
    if (previous) void request("/owner-mobile/logout", { method: "POST" }, previous).catch(() => {});
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => {
      // Invalidate an in-flight login too: returning from background still requires PIN.
      if (state !== "active") { if (tokenRef.current) lock(); else generation.current += 1; }
    });
    return () => subscription.remove();
  }, [lock]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (screen === "detail") { setSelected(null); setScreen("approvals"); return true; }
      if (screen === "withdraw") { setScreen("dashboard"); return true; }
      if (tokenRef.current && screen !== "dashboard") { setScreen("dashboard"); return true; }
      if (screen === "setup" && enrolled) { setScreen("pin"); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [screen, enrolled]);

  async function authorized(path: string, options: RequestInit = {}) {
    const active = tokenRef.current;
    if (!active) throw new Error("กรุณาเข้าสู่ระบบอีกครั้ง");
    try { return await request(path, options, active); }
    catch (error) { if (error instanceof RequestError && error.status === 401 && tokenRef.current === active) lock(); throw error; }
  }
  async function loadDashboard() {
    if (!tokenRef.current) return;
    const run = generation.current;
    if (summaryInFlight.current === run) return;
    summaryInFlight.current = run; setRefreshing(true);
    try {
      const data = await authorized("/owner-mobile/summary");
      if (run !== generation.current) return;
      setSummary(data); setUpdatedAt(new Date().toISOString()); setSummaryError("");
    } catch (error) { if (run === generation.current) setSummaryError(errorMessage(error)); }
    finally { if (summaryInFlight.current === run) summaryInFlight.current = null; if (run === generation.current) setRefreshing(false); }
  }
  async function loadApprovals() {
    if (!tokenRef.current) return;
    const run = generation.current;
    if (approvalsInFlight.current === run) return;
    approvalsInFlight.current = run; setApprovalsLoading(true);
    try {
      const data = await authorized("/owner-mobile/approvals");
      if (run !== generation.current) return;
      setApprovals(Array.isArray(data?.items) ? data.items : []); setApprovalsError("");
    } catch (error) { if (run === generation.current) setApprovalsError(errorMessage(error)); }
    finally { if (approvalsInFlight.current === run) approvalsInFlight.current = null; if (run === generation.current) setApprovalsLoading(false); }
  }
  async function authenticated(nextToken: string, attempt: number, enrollment = false) {
    if (attempt !== generation.current || AppState.currentState !== "active") { void request("/owner-mobile/logout", { method: "POST" }, nextToken).catch(() => {}); throw new Error("กรุณายืนยันตัวตนอีกครั้ง"); }
    if (enrollment) { await SecureStore.setItemAsync(ENROLLED_KEY, "1"); setEnrolled(true); }
    await SecureStore.setItemAsync(TOKEN_KEY, nextToken);
    if (attempt !== generation.current) { void SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {}); void request("/owner-mobile/logout", { method: "POST" }, nextToken).catch(() => {}); return; }
    tokenRef.current = nextToken; setToken(nextToken); setScreen("dashboard");
    await loadDashboard();
  }
  async function login(pin: string) {
    const attempt = generation.current;
    const result = await request("/owner-mobile/pin-login", { method: "POST", body: JSON.stringify({ deviceId, pin }) });
    await authenticated(result.token, attempt);
  }
  async function enroll(data: Enrollment) {
    const attempt = generation.current;
    const result = await request("/owner-mobile/enroll", { method: "POST", body: JSON.stringify({ ...data, deviceId, deviceName: Platform.OS === "ios" ? "SCENOVA Owner iPhone" : "SCENOVA Owner Android" }) });
    await authenticated(result.token, attempt, true);
  }
  function navigate(next: MainTab) {
    setSelected(null);
    setScreen(next);
    if (next === "dashboard") void loadDashboard();
  }
  async function approvalAction(kind: ApprovalAction, pin: string, reason: string) {
    if (!selected) return;
    const run = generation.current;
    await authorized(`/owner-mobile/approvals/${encodeURIComponent(selected.id)}/${kind}`, { method: "POST", body: JSON.stringify({ pin, reason }) });
    if (run !== generation.current) return;
    setSelected(null); setScreen("approvals");
    Alert.alert("เรียบร้อย", kind === "approve" ? "บันทึกการอนุมัติแล้ว" : kind === "hold" ? "พักรายการแล้ว" : "ปฏิเสธรายการแล้ว");
    await Promise.all([loadApprovals(), loadDashboard()]);
  }
  async function withdraw(amountSatang: number, pin: string) {
    const run = generation.current;
    await authorized("/owner-mobile/withdraw", { method: "POST", body: JSON.stringify({ amountSatang, pin, clientRequestKey: Crypto.randomUUID() }) });
    if (run !== generation.current) return;
    setScreen("dashboard");
    Alert.alert("ส่งคำสั่งถอนแล้ว", "ระบบบันทึกรายการถอนเรียบร้อย");
    await loadDashboard();
  }

  const runOwnerUpdate = useCallback(async (manifest: OwnerUpdateManifest) => {
    if (updateInFlight.current) return;
    updateInFlight.current = true; setUpdateBusy(true);
    try { await installOwnerUpdate(manifest); } catch (error) { Alert.alert("อัปเดตแอป", errorMessage(error)); }
    finally { updateInFlight.current = false; setUpdateBusy(false); }
  }, []);
  useEffect(() => {
    let cancelled = false;
    async function checkForUpdate() {
      try {
        const manifest = await fetchOwnerUpdate();
        if (!cancelled && manifest && manifest.versionCode > CURRENT_BUILD) {
          setUpdateManifest(manifest);
          // Preserve the existing signed-APK update flow; Android confirms installation.
          if (updateAttempted.current !== manifest.versionCode) { updateAttempted.current = manifest.versionCode; await runOwnerUpdate(manifest); }
        }
      } catch { /* An update check must not block the finance app. */ }
    }
    void checkForUpdate(); const timer = setInterval(checkForUpdate, 6 * 60 * 60 * 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [runOwnerUpdate]);

  const auth = !token;
  const tab: MainTab = ["dashboard", "packages", "promotions", "accounts"].includes(screen) ? screen as MainTab : "dashboard";
  const subpage = screen === "detail" || screen === "withdraw" || screen === "approvals";
  let body;
  if (booting || bootError) body = <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 20 }}>{bootError ? <><Notice text={bootError} danger /><Button label="ลองอีกครั้ง" onPress={() => void boot()} /></> : <><ActivityIndicator size="large" color={c.accent} /><Copy style={{ color: c.muted }}>กำลังเปิด SCENOVA Owner</Copy></>}</View>;
  else if (auth) body = screen === "setup" ? <FirstSetup onSubmit={enroll} onBack={enrolled ? () => setScreen("pin") : undefined} /> : <PinLogin onSetup={() => setScreen("setup")} onLogin={login} />;
  else if (screen === "detail" && selected) body = <ApprovalDetail item={selected} onBack={() => setScreen("approvals")} onAction={approvalAction} />;
  else if (screen === "withdraw") body = <OwnerWithdraw summary={summary} onBack={() => setScreen("dashboard")} onSubmit={withdraw} stale={!!summaryError || refreshing} />;
  else if (screen === "approvals") body = <ApprovalList items={approvals} loading={approvalsLoading} error={approvalsError} onBack={() => setScreen("dashboard")} onRefresh={() => void loadApprovals()} onOpen={item => { setSelected(item); setScreen("detail"); }} />;
  else if (screen === "packages") body = <PackagesScreen api={authorized} />;
  else if (screen === "promotions") body = <PromotionsScreen api={authorized} />;
  else if (screen === "accounts") body = <AccountsScreen api={authorized} version={`v${appConfig.expo.version}`} update={updateManifest} updateBusy={updateBusy} onInstall={() => { if (updateManifest) void runOwnerUpdate(updateManifest); }} onLock={lock} />;
  else body = <Dashboard summary={summary} refreshing={refreshing} error={summaryError} updatedAt={updatedAt} onRefresh={() => void loadDashboard()} onApprovals={() => { setScreen("approvals"); void loadApprovals(); }} onWithdraw={() => setScreen("withdraw")} />;
  return <><StatusBar style={theme === "light" ? "dark" : "light"} /><Frame auth={auth || booting || !!bootError} tab={tab} onNavigate={subpage ? undefined : navigate} count={summary?.approvals.requestedCount || 0} onLock={auth ? undefined : lock}>{updateManifest && !auth && !subpage && screen !== "accounts" && <UpdateNotice manifest={updateManifest} busy={updateBusy} onInstall={() => void runOwnerUpdate(updateManifest)} />}{body}</Frame></>;
}
