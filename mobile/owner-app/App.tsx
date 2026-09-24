import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";

const STORE_API = "scenova.owner.api";
const STORE_DEVICE_ID = "scenova.owner.device.id";
const STORE_DEVICE_SECRET = "scenova.owner.device.secret";

type Screen =
  | "boot"
  | "api"
  | "login"
  | "login2fa"
  | "enroll"
  | "pin"
  | "home"
  | "queue"
  | "detail"
  | "withdraw"
  | "security";

type QueueItem = {
  id: string;
  user_id: string;
  user_code: string;
  email: string;
  amount_satang: number;
  currency: string;
  status: string;
  risk_score: number;
  risk_level: string;
  risk_reasons: string[];
  approval_required: number;
  approval_count: number;
  bank_code: string;
  bank_name: string;
  account_name: string;
  masked_account: string;
  shared_account_users: number;
  created_at: string;
  destination_status: string;
  usable_at: string;
};

type Dashboard = {
  omise: {
    configured: boolean;
    mode: string;
    totalSatang: number;
    transferableSatang: number;
    customerReserveSatang: number;
    cashBufferSatang: number;
    safeWithdrawableSatang: number;
    error?: string;
  };
  commissions: {
    pendingSatang: number;
    availableSatang: number;
    lockedSatang: number;
    paidSatang: number;
    reserveSatang: number;
    awaitingApprovalCount: number;
    approvedWaitingPayoutCount: number;
    lockedWithdrawalSatang: number;
    paidWithdrawalSatang: number;
  };
  queue: QueueItem[];
  approvedWaitingPayout: QueueItem[];
  alerts: any[];
  ownerTransfers: any[];
};

function money(satang: number | string | null | undefined) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2
  }).format(Number(satang || 0) / 100);
}

function shortDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

function cleanApiUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("boot");
  const [apiUrl, setApiUrl] = useState("");
  const [apiInput, setApiInput] = useState(process.env.EXPO_PUBLIC_API_URL || "");
  const [deviceId, setDeviceId] = useState("");
  const [deviceSecret, setDeviceSecret] = useState("");
  const [mobileToken, setMobileToken] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState("");
  const [twoFactor, setTwoFactor] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [selected, setSelected] = useState<QueueItem | null>(null);
  const [action2fa, setAction2fa] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newPinConfirm, setNewPinConfirm] = useState("");

  useEffect(() => {
    void bootstrap();
  }, []);

  async function bootstrap() {
    const storedApi = cleanApiUrl((await SecureStore.getItemAsync(STORE_API)) || process.env.EXPO_PUBLIC_API_URL || "");
    const storedId = (await SecureStore.getItemAsync(STORE_DEVICE_ID)) || "";
    const storedSecret = (await SecureStore.getItemAsync(STORE_DEVICE_SECRET)) || "";
    setApiUrl(storedApi);
    setApiInput(storedApi);
    setDeviceId(storedId);
    setDeviceSecret(storedSecret);
    if (!storedApi) setScreen("api");
    else if (storedId && storedSecret) setScreen("pin");
    else setScreen("login");
  }

  async function request(path: string, options: RequestInit = {}, token?: string) {
    const base = cleanApiUrl(apiUrl || apiInput);
    if (!base) throw new Error("ยังไม่ได้ตั้ง API URL");
    const response = await fetch(base + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && token === mobileToken) {
        setMobileToken("");
        setScreen("pin");
      }
      throw new Error(String(data?.message || data?.error || `HTTP ${response.status}`));
    }
    return data;
  }

  async function saveApi() {
    const normalized = cleanApiUrl(apiInput);
    if (!/^https:\/\//i.test(normalized) && !/^http:\/\/10\.|^http:\/\/192\.168\.|^http:\/\/127\.0\.0\.1/.test(normalized)) {
      setMessage("Production API ต้องใช้ https://");
      return;
    }
    await SecureStore.setItemAsync(STORE_API, normalized);
    setApiUrl(normalized);
    setMessage("");
    setScreen(deviceId && deviceSecret ? "pin" : "login");
  }

  async function login() {
    setBusy(true);
    setMessage("");
    try {
      const result = await request("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim().toLowerCase(), password })
      });
      if (result.requiresEmailVerification) throw new Error("กรุณายืนยันอีเมลใน SCENOVA ก่อน");
      if (result.requiresTwoFactor) {
        setChallenge(String(result.twoFactorChallenge || ""));
        setTwoFactor("");
        setScreen("login2fa");
        return;
      }
      await finishLogin(String(result.token || ""));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function verifyLogin2fa() {
    if (!/^\d{6}$/.test(twoFactor)) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await request("/auth/verify-2fa-login", {
        method: "POST",
        body: JSON.stringify({ challenge, code: twoFactor })
      });
      await finishLogin(String(result.token || ""));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ยืนยัน 2FA ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function finishLogin(token: string) {
    if (!token) throw new Error("ไม่ได้รับ Login token");
    const account = await request("/auth/account", {}, token);
    if (String(account?.user?.role || "") !== "OWNER") {
      throw new Error("แอปนี้เปิดให้บัญชี OWNER เท่านั้น");
    }
    if (!account?.security?.twoFactorEnabled) {
      throw new Error("ต้องเปิด Two-Factor Authentication ในเว็บ SCENOVA ก่อนลงทะเบียนมือถือ");
    }
    setSetupToken(token);
    setPin("");
    setPinConfirm("");
    setTwoFactor("");
    setScreen("enroll");
  }

  async function enroll() {
    if (!/^\d{6}$/.test(pin)) return setMessage("PIN ต้องมี 6 หลัก");
    if (pin !== pinConfirm) return setMessage("PIN ทั้งสองช่องไม่ตรงกัน");
    if (!/^\d{6}$/.test(twoFactor)) return setMessage("กรอก 2FA 6 หลัก");
    setBusy(true);
    setMessage("");
    try {
      const id = deviceId || Crypto.randomUUID();
      const name = `${Device.manufacturer || "Mobile"} ${Device.modelName || Platform.OS}`.trim();
      const result = await request(
        "/owner-mobile/enroll",
        {
          method: "POST",
          body: JSON.stringify({
            deviceId: id,
            deviceName: name,
            pin,
            currentPassword: password,
            twoFactorCode: twoFactor
          })
        },
        setupToken
      );
      const secret = String(result.deviceSecret || "");
      if (!secret) throw new Error("ไม่ได้รับ Device Secret");
      await SecureStore.setItemAsync(STORE_DEVICE_ID, id);
      await SecureStore.setItemAsync(STORE_DEVICE_SECRET, secret);
      setDeviceId(id);
      setDeviceSecret(secret);
      setPassword("");
      setSetupToken("");
      setTwoFactor("");
      await unlock(pin, id, secret);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ลงทะเบียนเครื่องไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function unlock(pinValue = pin, id = deviceId, secret = deviceSecret) {
    if (!/^\d{6}$/.test(pinValue)) return setMessage("กรอก PIN 6 หลัก");
    setBusy(true);
    setMessage("");
    try {
      const result = await request("/owner-mobile/unlock", {
        method: "POST",
        body: JSON.stringify({ deviceId: id, deviceSecret: secret, pin: pinValue })
      });
      const token = String(result.token || "");
      if (!token) throw new Error("ไม่ได้รับ Mobile Session");
      setMobileToken(token);
      setPin("");
      setScreen("home");
      await loadDashboard(token);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PIN ไม่ถูกต้อง");
    } finally {
      setBusy(false);
    }
  }

  async function loadDashboard(token = mobileToken) {
    const data = await request("/owner-mobile/dashboard", {}, token);
    setDashboard(data);
  }

  async function refresh() {
    if (!mobileToken) return;
    setRefreshing(true);
    try {
      await loadDashboard();
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Refresh ไม่สำเร็จ");
    } finally {
      setRefreshing(false);
    }
  }

  async function loadDetail(item: QueueItem) {
    setSelected(item);
    setAction2fa("");
    setActionReason("");
    setScreen("detail");
    try {
      const data = await request(`/owner-mobile/withdrawals/