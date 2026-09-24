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
      const data = await request(`/owner-mobile/withdrawals/${item.id}`, {}, mobileToken);
      if (data?.item) setSelected(data.item);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "โหลดรายละเอียดไม่สำเร็จ");
    }
  }

  async function withdrawalAction(action: "approve" | "hold" | "reject") {
    if (!selected) return;
    if (!/^\d{6}$/.test(action2fa)) return setMessage("กรอก 2FA 6 หลักเพื่อยืนยัน");
    if (action === "reject" && !actionReason.trim()) return setMessage("Reject ต้องระบุเหตุผล");
    setBusy(true);
    setMessage("");
    try {
      await request(
        `/owner-mobile/withdrawals/${selected.id}/${action}`,
        {
          method: "POST",
          body: JSON.stringify({
            twoFactorCode: action2fa,
            note: actionReason,
            reason: actionReason
          })
        },
        mobileToken
      );
      setAction2fa("");
      setActionReason("");
      await loadDashboard();
      setScreen("queue");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function ownerWithdraw() {
    const baht = Number(String(withdrawAmount).replace(/,/g, ""));
    const amountSatang = Math.round(baht * 100);
    if (!Number.isFinite(amountSatang) || amountSatang < 100) return setMessage("กรอกยอดถอนอย่างน้อย 1 บาท");
    if (!/^\d{6}$/.test(action2fa)) return setMessage("กรอก 2FA 6 หลักเพื่อยืนยัน");
    const safe = Number(dashboard?.omise?.safeWithdrawableSatang || 0);
    if (amountSatang > safe) return setMessage(`ถอนได้สูงสุด ${money(safe)}`);

    setBusy(true);
    setMessage("");
    try {
      const key = `mobile-${Date.now()}-${Crypto.randomUUID().slice(0, 8)}`;
      await request(
        "/owner-mobile/owner-transfers",
        {
          method: "POST",
          body: JSON.stringify({ amountSatang, twoFactorCode: action2fa, clientRequestKey: key })
        },
        mobileToken
      );
      setWithdrawAmount("");
      setAction2fa("");
      await loadDashboard();
      setScreen("home");
      Alert.alert("ส่งคำสั่งถอนแล้ว", "SCENOVA ส่งรายการไป Omise แล้ว สามารถดูสถานะในหน้าหลักได้");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ถอนเงินไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function changePin() {
    if (!/^\d{6}$/.test(newPin) || newPin !== newPinConfirm) return setMessage("PIN ใหม่ต้องมี 6 หลักและตรงกัน");
    if (!/^\d{6}$/.test(action2fa)) return setMessage("กรอก 2FA 6 หลัก");
    setBusy(true);
    try {
      await request(
        "/owner-mobile/pin/change",
        { method: "POST", body: JSON.stringify({ newPin, twoFactorCode: action2fa }) },
        mobileToken
      );
      setNewPin("");
      setNewPinConfirm("");
      setAction2fa("");
      setMobileToken("");
      setPin("");
      setScreen("pin");
      Alert.alert("เปลี่ยน PIN แล้ว", "กรุณาเข้าแอปด้วย PIN ใหม่");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เปลี่ยน PIN ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function revokeThisDevice() {
    if (!/^\d{6}$/.test(action2fa)) return setMessage("กรอก 2FA 6 หลัก");
    setBusy(true);
    try {
      await request(
        "/owner-mobile/device/revoke",
        { method: "POST", body: JSON.stringify({ twoFactorCode: action2fa }) },
        mobileToken
      );
      await SecureStore.deleteItemAsync(STORE_DEVICE_ID);
      await SecureStore.deleteItemAsync(STORE_DEVICE_SECRET);
      setDeviceId("");
      setDeviceSecret("");
      setMobileToken("");
      setAction2fa("");
      setScreen("login");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Revoke ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const safePercent = useMemo(() => {
    const total = Number(dashboard?.omise?.transferableSatang || 0);
    const safe = Number(dashboard?.omise?.safeWithdrawableSatang || 0);
    return total > 0 ? Math.min(100, Math.max(0, Math.round((safe / total) * 100))) : 0;
  }, [dashboard]);

  if (screen === "boot") {
    return <Center><ActivityIndicator size="large" color="#9a7cff"/><Text style={styles.muted}>กำลังเปิด SCENOVA Owner</Text></Center>;
  }

  if (screen === "api") {
    return (
      <AuthShell title="เชื่อมต่อ SCENOVA" subtitle="ตั้งค่าเพียงครั้งแรกบนเครื่องนี้">
        <Field label="API URL" value={apiInput} onChangeText={setApiInput} placeholder="https://api.example.com/api" autoCapitalize="none"/>
        <Primary label="บันทึกและดำเนินการต่อ" onPress={saveApi}/>
        <Message text={message}/>
      </AuthShell>
    );
  }

  if (screen === "login") {
    return (
      <AuthShell title="SCENOVA OWNER" subtitle="เข้าสู่ระบบครั้งแรกเพื่อผูกมือถือเครื่องนี้">
        <Field label="อีเมล" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"/>
        <Field label="รหัสผ่าน" value={password} onChangeText={setPassword} secureTextEntry/>
        <Primary label={busy ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"} onPress={login} disabled={busy}/>
        <Pressable onPress={() => setScreen("api")}><Text style={styles.link}>เปลี่ยน API URL</Text></Pressable>
        <Message text={message}/>
      </AuthShell>
    );
  }

  if (screen === "login2fa") {
    return (
      <AuthShell title="ยืนยันตัวตน 2 ชั้น" subtitle="กรอกรหัสจาก Authenticator ของบัญชี OWNER">
        <PinField value={twoFactor} onChangeText={setTwoFactor} label="2FA 6 หลัก"/>
        <Primary label={busy ? "กำลังยืนยัน..." : "ยืนยัน 2FA"} onPress={verifyLogin2fa} disabled={busy || twoFactor.length !== 6}/>
        <Message text={message}/>
      </AuthShell>
    );
  }

  if (screen === "enroll") {
    return (
      <AuthShell title="ตั้ง PIN สำหรับมือถือ" subtitle="ครั้งต่อไปเปิดแอปด้วย PIN 6 หลัก ไม่เก็บรหัสผ่านไว้ในเครื่อง">
        <PinField value={pin} onChangeText={setPin} label="PIN ใหม่" secureTextEntry/>
        <PinField value={pinConfirm} onChangeText={setPinConfirm} label="ยืนยัน PIN" secureTextEntry/>
        <PinField value={twoFactor} onChangeText={setTwoFactor} label="2FA เพื่อยืนยันการผูกเครื่อง"/>
        <View style={styles.securityNote}><Text style={styles.securityText}>ห้ามใช้ 123456, 654321 หรือเลขซ้ำ 6 ตัว ระบบจะล็อก 15 นาทีเมื่อใส่ PIN ผิดครบ 5 ครั้ง</Text></View>
        <Primary label={busy ? "กำลังผูกเครื่อง..." : "ลงทะเบียนมือถือเครื่องนี้"} onPress={enroll} disabled={busy}/>
        <Message text={message}/>
      </AuthShell>
    );
  }

  if (screen === "pin") {
    return (
      <AuthShell title="SCENOVA OWNER" subtitle="ใส่ PIN เพื่อเข้าแอป">
        <View style={styles.lockCircle}><Text style={styles.lockIcon}>◆</Text></View>
        <PinField value={pin} onChangeText={setPin} label="PIN 6 หลัก" secureTextEntry autoFocus/>
        <Primary label={busy ? "กำลังปลดล็อก..." : "ปลดล็อก"} onPress={() => unlock()} disabled={busy || pin.length !== 6}/>
        <Pressable onPress={() => setScreen("api")}><Text style={styles.link}>ตั้งค่า API</Text></Pressable>
        <Message text={message}/>
      </AuthShell>
    );
  }

  if (!dashboard && ["home", "queue", "withdraw", "security"].includes(screen)) {
    return <Center><ActivityIndicator size="large" color="#9a7cff"/><Text style={styles.muted}>กำลังโหลดข้อมูลการเงิน...</Text></Center>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#070710"/>
      <View style={styles.appHeader}>
        <View><Text style={styles.brand}>SCENOVA</Text><Text style={styles.brandSub}>OWNER CONTROL</Text></View>
        {dashboard?.omise?.mode === "TEST" && <View style={styles.testBadge}><Text style={styles.testBadgeText}>TEST</Text></View>}
      </View>

      {screen === "home" && dashboard && (
        <ScrollView
          contentContainerStyle={styles.page}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#9a7cff"/>}
        >
          <Text style={styles.pageTitle}>ภาพรวมเงิน</Text>
          <Text style={styles.pageLead}>ดูเฉพาะยอดที่จำเป็นสำหรับการตัดสินใจบนมือถือ</Text>

          {dashboard.omise.error ? <Message text={dashboard.omise.error}/> : null}
          <View style={styles.heroCard}>
            <Text style={styles.cardEyebrow}>SAFE WITHDRAWABLE</Text>
            <Text style={styles.heroAmount}>{money(dashboard.omise.safeWithdrawableSatang)}</Text>
            <Text style={styles.cardHint}>ยอดที่ถอนได้หลังกันเงินค่าคอมลูกค้าและ Buffer แล้ว</Text>
            <View style={styles.progress}><View style={[styles.progressBar, { width: `${safePercent}%` }]}/></View>
            <View style={styles.rowBetween}><Text style={styles.meta}>Omise ถอนได้ {money(dashboard.omise.transferableSatang)}</Text><Text style={styles.meta}>Safe {safePercent}%</Text></View>
            <Primary label="ถอนเงินของเรา" onPress={() => { setAction2fa(""); setWithdrawAmount(""); setScreen("withdraw"); }} disabled={dashboard.omise.safeWithdrawableSatang < 100}/>
          </View>

          <View style={styles.twoCols}>
            <MiniCard label="Omise ทั้งหมด" value={money(dashboard.omise.totalSatang)} note={dashboard.omise.mode}/>
            <MiniCard label="กันไว้ให้ลูกค้า" value={money(dashboard.omise.customerReserveSatang)} note="Commission reserve"/>
            <MiniCard label="ค่าคอมรอเคลียร์" value={money(dashboard.commissions.pendingSatang)} note="Pending"/>
            <MiniCard label="ค่าคอมถอนได้" value={money(dashboard.commissions.availableSatang)} note="Available"/>
          </View>

          <SectionTitle title="รายการที่ต้องจัดการ" action={`${dashboard.commissions.awaitingApprovalCount} รออนุมัติ`}/>
          <Pressable style={styles.queueSummary} onPress={() => setScreen("queue")}>
            <View><Text style={styles.queueNumber}>{dashboard.commissions.awaitingApprovalCount}</Text><Text style={styles.queueLabel}>คำขอรอตรวจสอบ</Text></View>
            <View style={styles.queueDivider}/>
            <View><Text style={styles.queueNumber}>{dashboard.commissions.approvedWaitingPayoutCount}</Text><Text style={styles.queueLabel}>อนุมัติแล้วรอจ่าย</Text></View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>

          {dashboard.queue.slice(0, 3).map(item => <QueueCard key={item.id} item={item} onPress={() => loadDetail(item)}/>)}

          <SectionTitle title="ถอนเงินของ Owner ล่าสุด"/>
          {dashboard.ownerTransfers.length ? dashboard.ownerTransfers.slice(0, 5).map(item => (
            <View key={item.id} style={styles.transferRow}>
              <View><Text style={styles.transferAmount}>{money(item.amount_satang)}</Text><Text style={styles.meta}>{shortDate(item.created_at)}</Text></View>
              <StatusPill value={item.status}/>
            </View>
          )) : <Empty text="ยังไม่มีรายการถอนจากแอป"/>}
        </ScrollView>
      )}

      {screen === "queue" && dashboard && (
        <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#9a7cff"/>}>
          <Back title="คำขอถอนค่าคอม" onPress={() => setScreen("home")}/>
          <Text style={styles.pageLead}>กดรายการเพื่อดู Risk, บัญชีปลายทาง และประวัติการอนุมัติ</Text>
          {dashboard.queue.length ? dashboard.queue.map(item => <QueueCard key={item.id} item={item} onPress={() => loadDetail(item)}/>) : <Empty text="ไม่มีรายการรออนุมัติ"/>}
          <SectionTitle title="อนุมัติแล้วรอจ่าย"/>
          {dashboard.approvedWaitingPayout.length ? dashboard.approvedWaitingPayout.map(item => <QueueCard key={item.id} item={item} onPress={() => loadDetail(item)}/>) : <Empty text="ไม่มีรายการค้างจ่าย"/>}
        </ScrollView>
      )}

      {screen === "detail" && selected && (
        <ScrollView contentContainerStyle={styles.page}>
          <Back title="ตรวจสอบคำขอถอน" onPress={() => setScreen("queue")}/>
          <View style={styles.detailCard}>
            <View style={styles.rowBetween}><Text style={styles.cardEyebrow}>{selected.user_code}</Text><RiskPill level={selected.risk_level} score={selected.risk_score}/></View>
            <Text style={styles.detailAmount}>{money(selected.amount_satang)}</Text>
            <Text style={styles.detailEmail}>{selected.email}</Text>
            <View style={styles.detailGrid}>
              <Detail label="ธนาคาร" value={`${selected.bank_name || selected.bank_code}`}/>
              <Detail label="บัญชี" value={`${selected.account_name} ${selected.masked_account}`}/>
              <Detail label="Approval" value={`${selected.approval_count}/${selected.approval_required}`}/>
              <Detail label="บัญชีซ้ำ" value={`${selected.shared_account_users || 0} User`}/>
              <Detail label="สถานะบัญชี" value={selected.destination_status || "-"}/>
              <Detail label="สร้างเมื่อ" value={shortDate(selected.created_at)}/>
            </View>
            <Text style={styles.reasonTitle}>Risk signals</Text>
            <View style={styles.chips}>{(selected.risk_reasons || []).map(reason => <Text key={reason} style={styles.chip}>{reason}</Text>)}</View>
          </View>
          <View style={styles.actionCard}>
            <Text style={styles.actionTitle}>ยืนยันการตัดสินใจ</Text>
            <Field label="หมายเหตุ / เหตุผล" value={actionReason} onChangeText={setActionReason} placeholder="ระบุเมื่อ Hold หรือ Reject" multiline/>
            <PinField value={action2fa} onChangeText={setAction2fa} label="2FA 6 หลัก"/>
            <View style={styles.actionRow}>
              <SmallButton label="พักรายการ" onPress={() => withdrawalAction("hold")} disabled={busy}/>
              <SmallButton label="ปฏิเสธ" tone="danger" onPress={() => withdrawalAction("reject")} disabled={busy}/>
            </View>
            <Primary label={busy ? "กำลังยืนยัน..." : "อนุมัติรายการ"} onPress={() => withdrawalAction("approve")} disabled={busy}/>
            <Text style={styles.cardHint}>รายการ Risk สูงหรือยอดเกิน Threshold อาจต้องใช้ผู้ดูแลอีกบัญชีอนุมัติรอบสอง</Text>
          </View>
          <Message text={message}/>
        </ScrollView>
      )}

      {screen === "withdraw" && dashboard && (
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <Back title="ถอนเงินของเรา" onPress={() => setScreen("home")}/>
          <View style={styles.heroCard}>
            <Text style={styles.cardEyebrow}>ถอนได้อย่างปลอดภัย</Text>
            <Text style={styles.heroAmount}>{money(dashboard.omise.safeWithdrawableSatang)}</Text>
            <Text style={styles.cardHint}>ระบบกัน {money(dashboard.omise.customerReserveSatang)} สำหรับค่าคอมลูกค้าไว้แล้ว</Text>
          </View>
          <View style={styles.actionCard}>
            <Field label="จำนวนเงิน (บาท)" value={withdrawAmount} onChangeText={setWithdrawAmount} keyboardType="decimal-pad" placeholder="0.00"/>
            <PinField value={action2fa} onChangeText={setAction2fa} label="2FA 6 หลัก"/>
            <View style={styles.securityNote}><Text style={styles.securityText}>เงินจะถูกส่งไปบัญชีธนาคาร Default ที่ยืนยันไว้กับ Omise เท่านั้น Secret Key อยู่ที่ Server ไม่อยู่ในมือถือ</Text></View>
            <Primary label={busy ? "กำลังส่ง Omise..." : "ยืนยันถอนเงิน"} onPress={ownerWithdraw} disabled={busy}/>
          </View>
          <Message text={message}/>
        </ScrollView>
      )}

      {screen === "security" && (
        <ScrollView contentContainerStyle={styles.page}>
          <Back title="ความปลอดภัย" onPress={() => setScreen("home")}/>
          <View style={styles.actionCard}>
            <Text style={styles.actionTitle}>เปลี่ยน PIN</Text>
            <PinField value={newPin} onChangeText={setNewPin} label="PIN ใหม่" secureTextEntry/>
            <PinField value={newPinConfirm} onChangeText={setNewPinConfirm} label="ยืนยัน PIN ใหม่" secureTextEntry/>
            <PinField value={action2fa} onChangeText={setAction2fa} label="2FA 6 หลัก"/>
            <Primary label="เปลี่ยน PIN" onPress={changePin} disabled={busy}/>
          </View>
          <View style={styles.actionCard}>
            <Text style={styles.actionTitle}>ยกเลิกมือถือเครื่องนี้</Text>
            <Text style={styles.cardHint}>หลัง Revoke ต้อง Login ด้วยรหัสผ่าน + 2FA และตั้ง PIN ใหม่ก่อนใช้งานอีกครั้ง</Text>
            <PinField value={action2fa} onChangeText={setAction2fa} label="2FA 6 หลัก"/>
            <SmallButton label="Revoke เครื่องนี้" tone="danger" onPress={() => Alert.alert("ยืนยัน Revoke", "เครื่องนี้จะเข้าแอปไม่ได้จนกว่าจะลงทะเบียนใหม่", [{ text:"ยกเลิก" }, { text:"Revoke", style:"destructive", onPress:revokeThisDevice }])}/>
          </View>
          <Message text={message}/>
        </ScrollView>
      )}

      {["home", "queue"].includes(screen) && (
        <View style={styles.bottomNav}>
          <Nav label="ภาพรวม" active={screen === "home"} onPress={() => setScreen("home")}/>
          <Nav label={`อนุมัติ ${dashboard?.commissions?.awaitingApprovalCount || 0}`} active={screen === "queue"} onPress={() => setScreen("queue")}/>
          <Nav label="ความปลอดภัย" active={false} onPress={() => { setAction2fa(""); setScreen("security"); }}/>
        </View>
      )}
    </SafeAreaView>
  );
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#070710"/>
      <KeyboardAvoidingView style={styles.authWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.authInner} keyboardShouldPersistTaps="handled">
          <Text style={styles.logo}>SCENOVA</Text>
          <Text style={styles.authTitle}>{title}</Text>
          <Text style={styles.authSub}>{subtitle}</Text>
          <View style={styles.authCard}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <SafeAreaView style={styles.safe}><View style={styles.center}>{children}</View></SafeAreaView>;
}

function Field(props: any) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{props.label}</Text><TextInput {...props} label={undefined} style={[styles.input, props.multiline && styles.textarea]} placeholderTextColor="#5f6072"/></View>;
}

function PinField(props: any) {
  return <Field {...props} value={props.value} onChangeText={(v: string) => props.onChangeText(v.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" maxLength={6}/>;
}

function Primary({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.primary, (pressed || disabled) && styles.buttonDim]}><Text style={styles.primaryText}>{label}</Text></Pressable>;
}

function SmallButton({ label, onPress, disabled = false, tone = "normal" }: { label: string; onPress: () => void; disabled?: boolean; tone?: "normal" | "danger" }) {
  return <Pressable onPress={onPress} disabled={disabled} style={[styles.smallButton, tone === "danger" && styles.smallDanger, disabled && styles.buttonDim]}><Text style={[styles.smallButtonText, tone === "danger" && styles.smallDangerText]}>{label}</Text></Pressable>;
}

function Message({ text }: { text: string }) {
  if (!text) return null;
  return <View style={styles.message}><Text style={styles.messageText}>{text}</Text></View>;
}

function MiniCard({ label, value, note }: { label: string; value: string; note: string }) {
  return <View style={styles.miniCard}><Text style={styles.miniLabel}>{label}</Text><Text style={styles.miniValue}>{value}</Text><Text style={styles.meta}>{note}</Text></View>;
}

function SectionTitle({ title, action }: { title: string; action?: string }) {
  return <View style={styles.sectionTitle}><Text style={styles.sectionTitleText}>{title}</Text>{actio