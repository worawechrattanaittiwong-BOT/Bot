import { StatusBar } from "expo-status-bar";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

const API = String(process.env.EXPO_PUBLIC_API_URL || "").replace(/\/$/, "");
const DEVICE_KEY = "scenova.owner.deviceId";
const TOKEN_KEY = "scenova.owner.session";

type Summary = {
  paymentMode: string;
  omise: { configured: boolean; reachable: boolean; totalSatang: number; transferableSatang: number; minTransferSatang: number; maxTransferSatang: number };
  commission: { pendingSatang: number; availableSatang: number; lockedSatang: number; paidSatang: number };
  approvals: {
    requestedCount: number;
    holdCount: number;
    approvedCount: number;
    waitingSatang: number;
  };
  owner: {
    reserveSatang: number;
    commissionLiabilitySatang: number;
    safeWithdrawableSatang: number;
  };
  recentOwnerTransfers: Array<any>;
};

type Approval = {
  id: string;
  user_code: string;
  email: string;
  amount_satang: number;
  currency: string;
  status: string;
  created_at: string;
  risk_score: number;
  risk_level: string;
  risk_reasons?: any[];
  approval_required: number;
  approval_count: number;
  bank_code: string;
  bank_name: string;
  account_name: string;
  masked_account: string;
  destination_status: string;
  shared_account_users: number;
};

async function request(path: string, options: RequestInit = {}, token?: string) {
  if (!API) throw new Error("ยังไม่ได้ตั้ง EXPO_PUBLIC_API_URL");
  const response = await fetch(API + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(data?.message || data?.error || "ทำรายการไม่สำเร็จ"));
  }
  return data;
}

function money(satang: number | string | undefined) {
  const value = Number(satang || 0) / 100;
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2
  }).format(value);
}

function shortDate(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function PrimaryButton({
  label,
  onPress,
  disabled = false,
  danger = false
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        danger ? styles.dangerButton : styles.primaryButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = "default",
  autoCapitalize = "none"
}: any) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#766b86"
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        style={styles.input}
      />
    </View>
  );
}

function StatCard({
  title,
  value,
  caption,
  accent = false
}: {
  title: string;
  value: string;
  caption: string;
  accent?: boolean;
}) {
  return (
    <View style={[styles.statCard, accent && styles.statCardAccent]}>
      <Text style={styles.cardLabel}>{title}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.cardCaption}>{caption}</Text>
    </View>
  );
}

export default function App() {
  const [deviceId, setDeviceId] = useState("");
  const [token, setToken] = useState("");
  const [booting, setBooting] = useState(true);
  const [mode, setMode] = useState<"setup" | "pin" | "dashboard" | "approvals" | "detail" | "withdraw">("setup");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [selected, setSelected] = useState<Approval | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    (async () => {
      let id = await SecureStore.getItemAsync(DEVICE_KEY);
      if (!id) {
        id = Crypto.randomUUID();
        await SecureStore.setItemAsync(DEVICE_KEY, id);
      }
      setDeviceId(id);
      await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
      setMode("pin");
      setBooting(false);
    })();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", state => {
      if (state !== "active" && token) {
        setToken("");
        setSummary(null);
        setMode("pin");
        SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
      }
    });
    return () => sub.remove();
  }, [token]);

  async function authenticated(nextToken: string) {
    setToken(nextToken);
    await SecureStore.setItemAsync(TOKEN_KEY, nextToken);
    setMode("dashboard");
    await loadDashboard(nextToken);
  }

  async function loadDashboard(authToken = token) {
    const data = await request("/owner-mobile/summary", {}, authToken);
    setSummary(data);
  }

  async function loadApprovals() {
    setRefreshing(true);
    try {
      const data = await request("/owner-mobile/approvals", {}, token);
      setApprovals(Array.isArray(data?.items) ? data.items : []);
    } finally {
      setRefreshing(false);
    }
  }

  async function refreshDashboard() {
    setRefreshing(true);
    try {
      await loadDashboard();
    } catch (error: any) {
      Alert.alert("โหลดข้อมูลไม่สำเร็จ", error.message);
    } finally {
      setRefreshing(false);
    }
  }

  if (booting) {
    return (
      <View style={styles.center}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>กำลังเปิด SCENOVA Owner</Text>
      </View>
    );
  }

  if (mode === "pin") {
    return <PinLogin deviceId={deviceId} onSetup={() => setMode("setup")} onSuccess={authenticated} />;
  }

  if (mode === "setup") {
    return <FirstSetup deviceId={deviceId} onSuccess={authenticated} />;
  }

  if (mode === "approvals") {
    return (
      <ApprovalList
        approvals={approvals}
        refreshing={refreshing}
        onRefresh={loadApprovals}
        onBack={() => setMode("dashboard")}
        onOpen={item => {
          setSelected(item);
          setMode("detail");
        }}
      />
    );
  }

  if (mode === "detail" && selected) {
    return (
      <ApprovalDetail
        item={selected}
        token={token}
        onBack={() => setMode("approvals")}
        onChanged={async () => {
          await loadApprovals();
          setMode("approvals");
          await loadDashboard();
        }}
      />
    );
  }

  if (mode === "withdraw") {
    return (
      <OwnerWithdraw
        token={token}
        summary={summary}
        onBack={() => setMode("dashboard")}
        onDone={async () => {
          await loadDashboard();
          setMode("dashboard");
        }}
      />
    );
  }

  return (
    <Dashboard
      summary={summary}
      refreshing={refreshing}
      onRefresh={refreshDashboard}
      onApprovals={async () => {
        await loadApprovals();
        setMode("approvals");
      }}
      onWithdraw={() => setMode("withdraw")}
      onLock={async () => {
        await request("/owner-mobile/logout", { method: "POST" }, token).catch(() => {});
        setToken("");
        setSummary(null);
        await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
        setMode("pin");
      }}
    />
  );
}

function PinLogin({
  deviceId,
  onSetup,
  onSuccess
}: {
  deviceId: string;
  onSetup: () => void;
  onSuccess: (token: string) => Promise<void>;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  async function login() {
    if (pin.length !== 6 || busy) return;
    setBusy(true);
    try {
      const result = await request("/owner-mobile/pin-login", {
        method: "POST",
        body: JSON.stringify({ deviceId, pin })
      });
      setPin("");
      await onSuccess(result.token);
    } catch (error: any) {
      Alert.alert("เข้าแอปไม่ได้", error.message);
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.authPage} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StatusBar style="light" />
      <View style={styles.brandMark}><Text style={styles.brandS}>S</Text></View>
      <Text style={styles.brand}>SCENOVA</Text>
      <Text style={styles.title}>Owner</Text>
      <Text style={styles.subtitle}>ใส่ PIN เพื่อเข้าศูนย์ควบคุมการเงิน</Text>

      <View style={styles.authCard}>
        <Field
          label="PIN 6 หลัก"
          value={pin}
          onChangeText={(v: string) => setPin(v.replace(/\D/g, "").slice(0, 6))}
          placeholder="••••••"
          secureTextEntry
          keyboardType="number-pad"
        />
        <PrimaryButton label={busy ? "กำลังตรวจสอบ…" : "เข้าใช้งาน"} onPress={login} disabled={busy || pin.length !== 6} />
        <Pressable onPress={onSetup} style={styles.linkButton}>
          <Text style={styles.linkText}>ตั้งค่าเครื่องนี้ใหม่ด้วย Password + 2FA</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function FirstSetup({
  deviceId,
  onSuccess
}: {
  deviceId: string;
  onSuccess: (token: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);

  async function enroll() {
    if (pin !== confirmPin) {
      Alert.alert("PIN ไม่ตรงกัน", "กรุณายืนยัน PIN ให้ตรงกัน");
      return;
    }
    setBusy(true);
    try {
      const result = await request("/owner-mobile/enroll", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          twoFactorCode,
          deviceId,
          deviceName: Platform.OS === "ios" ? "SCENOVA Owner iPhone" : "SCENOVA Owner Android",
          pin
        })
      });
      await onSuccess(result.token);
    } catch (error: any) {
      Alert.alert("ลงทะเบียนไม่สำเร็จ", error.message);
    } finally {
      setBusy(false);
    }
  }

  const ready =
    email.includes("@") &&
    password.length >= 8 &&
    twoFactorCode.length === 6 &&
    pin.length === 6 &&
    confirmPin.length === 6;

  return (
    <KeyboardAvoidingView style={styles.authPage} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.setupScroll} keyboardShouldPersistTaps="handled">
        <View style={styles.brandMark}><Text style={styles.brandS}>S</Text></View>
        <Text style={styles.brand}>SCENOVA</Text>
        <Text style={styles.title}>ตั้งค่า Owner Mobile</Text>
        <Text style={styles.subtitle}>ทำครั้งแรกบนโทรศัพท์เครื่องนี้เท่านั้น</Text>

        <View style={styles.authCard}>
          <Field label="Owner Email" value={email} onChangeText={setEmail} placeholder="owner@example.com" keyboardType="email-address" />
          <Field label="Password" value={password} onChangeText={setPassword} placeholder="รหัสผ่าน SCENOVA" secureTextEntry />
          <Field
            label="2FA 6 หลัก"
            value={twoFactorCode}
            onChangeText={(v: string) => setTwoFactorCode(v.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            keyboardType="number-pad"
          />
          <View style={styles.divider} />
          <Text style={styles.sectionMini}>ตั้ง PIN สำหรับเครื่องนี้</Text>
          <Field
            label="PIN"
            value={pin}
            onChangeText={(v: string) => setPin(v.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••••"
            secureTextEntry
            keyboardType="number-pad"
          />
          <Field
            label="ยืนยัน PIN"
            value={confirmPin}
            onChangeText={(v: string) => setConfirmPin(v.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••••"
            secureTextEntry
            keyboardType="number-pad"
          />
          <PrimaryButton label={busy ? "กำลังลงทะเบียน…" : "ลงทะเบียนโทรศัพท์"} onPress={enroll} disabled={busy || !ready} />
          <Text style={styles.securityHint}>Secret Key ของ Omise จะไม่ถูกเก็บบนโทรศัพท์เครื่องนี้</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Dashboard({
  summary,
  refreshing,
  onRefresh,
  onApprovals,
  onWithdraw,
  onLock
}: {
  summary: Summary | null;
  refreshing: boolean;
  onRefresh: () => void;
  onApprovals: () => void;
  onWithdraw: () => void;
  onLock: () => void;
}) {
  return (
    <View style={styles.page}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.pageContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#b38cff" />}
      >
        <View style={styles.topbar}>
          <View>
            <Text style={styles.brandSmall}>SCENOVA OWNER</Text>
            <Text style={styles.pageTitle}>Money Control</Text>
          </View>
          <Pressable onPress={onLock} style={styles.lockButton}><Text style={styles.lockText}>ล็อก</Text></Pressable>
        </View>

        {summary?.paymentMode === "TEST" && (
          <View style={styles.testBadge}><Text style={styles.testText}>OMISE TEST MODE · ยังไม่ใช่เงินจริง</Text></View>
        )}
        {summary && !summary.omise.configured && (
          <View style={styles.warningBadge}><Text style={styles.warningText}>ยังไม่ได้ตั้งค่า OMISE_SECRET_KEY · ดูรายการได้ แต่ถอนเงินจริงไม่ได้</Text></View>
        )}
        {summary?.omise.configured && !summary.omise.reachable && (
          <View style={styles.warningBadge}><Text style={styles.warningText}>ติดต่อ Omise ไม่สำเร็จ · ระบบปิดการถอนชั่วคราวเพื่อความปลอดภัย</Text></View>
        )}

        <Text style={styles.sectionTitle}>Omise / Opn</Text>
        <StatCard
          title="ยอดทั้งหมด"
          value={money(summary?.omise.totalSatang)}
          caption="ยอดที่อยู่ในระบบ Omise"
        />
        <StatCard
          title="ยอดที่ถอนได้"
          value={money(summary?.omise.transferableSatang)}
          caption="Transferable Balance"
          accent
        />

        <Text style={styles.sectionTitle}>ค่าคอมลูกค้า</Text>
        <View style={styles.grid}>
          <View style={styles.half}>
            <StatCard title="รอเคลียร์" value={money(summary?.commission.pendingSatang)} caption="Pending commission" />
          </View>
          <View style={styles.half}>
            <StatCard title="ถอนได้แล้ว" value={money(summary?.commission.availableSatang)} caption="Available commission" />
          </View>
        </View>
        <StatCard
          title="ล็อกไว้รอจ่าย"
          value={money(summary?.commission.lockedSatang)}
          caption="คำขอถอนของลูกค้าที่กันยอดไว้แล้ว"
        />

        <Pressable onPress={onApprovals} style={styles.queueCard}>
          <View>
            <Text style={styles.cardLabel}>คำขอถอนรอจัดการ</Text>
            <Text style={styles.queueCount}>{summary?.approvals.requestedCount || 0} รายการ</Text>
            <Text style={styles.cardCaption}>
              รวม {money(summary?.approvals.waitingSatang)} · แตะเพื่อตรวจสอบ
            </Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>เงินของเจ้าของ</Text>
        <View style={styles.ownerCard}>
          <Text style={styles.cardLabel}>SAFE WITHDRAWABLE</Text>
          <Text style={styles.ownerAmount}>{money(summary?.owner.safeWithdrawableSatang)}</Text>
          <Text style={styles.cardCaption}>
            หักเงินสำรองค่าคอม {money(summary?.owner.commissionLiabilitySatang)} แล้ว
          </Text>
          {Number(summary?.owner.reserveSatang || 0) > 0 && (
            <Text style={styles.cardCaption}>Safety buffer {money(summary?.owner.reserveSatang)}</Text>
          )}
          <View style={styles.cardAction}>
            <PrimaryButton
              label="ถอนเงินเข้าบัญชีเรา"
              onPress={onWithdraw}
              disabled={!summary || !summary.omise.reachable || summary.owner.safeWithdrawableSatang < summary.omise.minTransferSatang}
            />
          </View>
        </View>

        <Text style={styles.footerNote}>
          ทุกการอนุมัติและถอนเงินถูกบันทึกบน Server · PIN ต้องยืนยันซ้ำก่อนเงินออก
        </Text>
      </ScrollView>
    </View>
  );
}

function ApprovalList({
  approvals,
  refreshing,
  onRefresh,
  onBack,
  onOpen
}: {
  approvals: Approval[];
  refreshing: boolean;
  onRefresh: () => void;
  onBack: () => void;
  onOpen: (item: Approval) => void;
}) {
  return (
    <View style={styles.page}>
      <StatusBar style="light" />
      <View style={styles.listHeader}>
        <Pressable onPress={onBack}><Text style={styles.back}>‹ กลับ</Text></Pressable>
        <Text style={styles.pageTitle}>รออนุมัติ</Text>
        <View style={{ width: 48 }} />
      </View>
      <FlatList
        data={approvals}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#b38cff" />}
        ListEmptyComponent={<Text style={styles.empty}>ไม่มีรายการรอจัดการ</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.approvalCard} onPress={() => onOpen(item)}>
            <View style={styles.approvalTop}>
              <View>
                <Text style={styles.userCode}>{item.user_code}</Text>
                <Text style={styles.cardCaption}>{item.email}</Text>
              </View>
              <View style={[styles.riskPill, item.risk_level === "CRITICAL" || item.risk_level === "HIGH" ? styles.riskHigh : null]}>
                <Text style={styles.riskText}>{item.risk_level} · {item.risk_score}</Text>
              </View>
            </View>
            <Text style={styles.approvalAmount}>{money(item.amount_satang)}</Text>
            <View style={styles.rowBetween}>
              <Text style={styles.cardCaption}>{item.bank_code} · {item.masked_account}</Text>
              <Text style={styles.statusText}>{item.status}</Text>
            </View>
            <Text style={styles.dateText}>{shortDate(item.created_at)}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

function ApprovalDetail({
  item,
  token,
  onBack,
  onChanged
}: {
  item: Approval;
  token: string;
  onBack: () => void;
  onChanged: () => Promise<void>;
}) {
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");

  async function action(kind: "approve" | "hold" | "reject") {
    if (pin.length !== 6 || busy) return;
    if (kind === "reject" && !reason.trim()) {
      Alert.alert("ต้องใส่เหตุผล", "การปฏิเสธรายการต้องระบุเหตุผล");
      return;
    }
    setBusy(kind);
    try {
      await request(`/owner-mobile/approvals/${item.id}/${kind}`, {
        method: "POST",
        body: JSON.stringify({ pin, reason })
      }, token);
      Alert.alert("เรียบร้อย", kind === "approve" ? "อนุมัติรายการแล้ว" : kind === "hold" ? "พักรายการแล้ว" : "ปฏิเสธรายการแล้ว");
      await onChanged();
    } catch (error: any) {
      Alert.alert("ทำรายการไม่สำเร็จ", error.message);
    } finally {
      setBusy("");
      setPin("");
    }
  }

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.pageContent}>
        <Pressable onPress={onBack}><Text style={styles.back}>‹ กลับ</Text></Pressable>
        <Text style={styles.pageTitle}>ตรวจคำขอถอน</Text>

        <View style={styles.detailHero}>
          <Text style={styles.cardLabel}>{item.user_code}</Text>
          <Text style={styles.heroAmount}>{money(item.amount_satang)}</Text>
          <Text style={styles.cardCaption}>{item.status} · {shortDate(item.created_at)}</Text>
        </View>

        <View style={styles.detailCard}>
          <Detail label="ผู้ใช้" value={item.email} />
          <Detail label="ธนาคาร" value={`${item.bank_name} (${item.bank_code})`} />
          <Detail label="ชื่อบัญชี" value={item.account_name} />
          <Detail label="บัญชี" value={item.masked_account} />
          <Detail label="สถานะบัญชี" value={item.destination_status} />
          <Detail label="บัญชีนี้ใช้กับ User" value={`${item.shared_account_users} คน`} />
          <Detail label="Risk" value={`${item.risk_level} · ${item.risk_score}/100`} />
          <Detail label="Approval" value={`${item.approval_count}/${item.approval_required}`} />
        </View>

        <View style={styles.actionCard}>
          <Field label="หมายเหตุ / เหตุผล" value={reason} onChangeText={setReason} placeholder="ใส่เมื่อจำเป็น" autoCapitalize="sentences" />
          <Field
            label="ยืนยัน PIN 6 หลัก"
            value={pin}
            onChangeText={(v: string) => setPin(v.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••••"
            secureTextEntry
            keyboardType="number-pad"
          />
          <PrimaryButton
            label={busy === "approve" ? "กำลังอนุมัติ…" : "อนุมัติ"}
            onPress={() => action("approve")}
            disabled={Boolean(busy) || pin.length !== 6 || item.status === "APPROVED"}
          />
          <View style={styles.twoButtons}>
            <View style={styles.half}><PrimaryButton label="พักรายการ" onPress={() => action("hold")} disabled={Boolean(busy) || pin.length !== 6} /></View>
            <View style={styles.half}><PrimaryButton label="ปฏิเสธ" onPress={() => action("reject")} disabled={Boolean(busy) || pin.length !== 6} danger /></View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function OwnerWithdraw({
  token,
  summary,
  onBack,
  onDone
}: {
  token: string;
  summary: Summary | null;
  onBack: () => void;
  onDone: () => Promise<void>;
}) {
  const max = Number(summary?.owner.safeWithdrawableSatang || 0);\n  const min = Number(summary?.omise.minTransferSatang || 3000);
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const satang = useMemo(() => Math.round(Number(amount || 0) * 100), [amount]);

  async function withdraw() {
    if (satang < min || satang > max || pin.length !== 6 || busy) return;
    Alert.alert(
      "ยืนยันการถอนเงิน",
      `ถอน ${money(satang)} เข้าบัญชีหลักที่ผูกกับ Omise?`,
      [
        { text: "ยกเลิก", style: "cancel" },
        {
          text: "ยืนยันถอน",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await request("/owner-mobile/withdraw", {
                method: "POST",
                body: JSON.stringify({
                  amountSatang: satang,
                  pin,
                  clientRequestKey: Crypto.randomUUID()
                })
              }, token);
              Alert.alert("ส่งคำสั่งถอนแล้ว", "ระบบบันทึก Omise Transfer เรียบร้อย");
              await onDone();
            } catch (error: any) {
              Alert.alert("ถอนเงินไม่สำเร็จ", error.message);
            } finally {
              setBusy(false);
              setPin("");
            }
          }
        }
      ]
    );
  }

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.pageContent}>
        <Pressable onPress={onBack}><Text style={styles.back}>‹ กลับ</Text></Pressable>
        <Text style={styles.pageTitle}>ถอนเงินของเรา</Text>

        <View style={styles.ownerCard}>
          <Text style={styles.cardLabel}>ถอนได้สูงสุดอย่างปลอดภัย</Text>
          <Text style={styles.ownerAmount}>{money(max)}</Text>
          <Text style={styles.cardCaption}>ระบบกันเงินค่าคอมลูกค้าออกจากยอดนี้แล้ว</Text>
        </View>

        <View style={styles.actionCard}>
          <Field
            label="จำนวนเงิน (บาท)"
            value={amount}
            onChangeText={(v: string) => setAmount(v.replace(/[^0-9.]/g, ""))}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />
          <Pressable onPress={() => setAmount((max / 100).toFixed(2))} style={styles.maxButton}>
            <Text style={styles.maxText}>ใช้ยอดสูงสุด</Text>
          </Pressable>
          <Field
            label="ยืนยัน PIN 6 หลัก"
            value={pin}
            onChangeText={(v: string) => setPin(v.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••••"
            secureTextEntry
            keyboardType="number-pad"
          />
          <PrimaryButton
            label={busy ? "กำลังส่งคำสั่ง…" : `ถอน ${satang > 0 ? money(satang) : ""}`}
            onPress={withdraw}
            disabled={busy || satang < min || satang > max || pin.length !== 6 || !summary?.omise.reachable}
            danger
          />
          {satang > max && <Text style={styles.errorText}>ยอดนี้สูงกว่า Safe Withdrawable Balance</Text>}
          {satang > 0 && satang < min && <Text style={styles.errorText}>ยอดถอนขั้นต่ำ {money(min)}</Text>}
        </View>

        <Text style={styles.footerNote}>
          เงินจะถูกส่งไปบัญชีธนาคารหลักที่ยืนยันไว้กับ Omise เท่านั้น แอปไม่สามารถเปลี่ยนบัญชีปลายทางได้
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#09070d" },
  pageContent: { paddingTop: 58, paddingHorizontal: 18, paddingBottom: 44 },
  center: { flex: 1, backgroundColor: "#09070d", alignItems: "center", justifyContent: "center", gap: 14 },
  loadingText: { color: "#b7aec1", fontSize: 14 },
  authPage: { flex: 1, backgroundColor: "#09070d", paddingHorizontal: 20, justifyContent: "center" },
  setupScroll: { paddingTop: 66, paddingBottom: 40 },
  brandMark: {
    width: 54, height: 54, borderRadius: 18, backgroundColor: "#6d3fe6",
    alignItems: "center", justifyContent: "center", marginBottom: 12
  },
  brandS: { color: "white", fontSize: 26, fontWeight: "900" },
  brand: { color: "#b38cff", fontSize: 13, fontWeight: "800", letterSpacing: 3 },
  title: { color: "white", fontSize: 34, fontWeight: "800", marginTop: 5 },
  subtitle: { color: "#93889f", fontSize: 14, marginTop: 7, marginBottom: 24 },
  authCard: {
    backgroundColor: "#120e19", borderColor: "#272032", borderWidth: 1,
    borderRadius: 24, padding: 18
  },
  fieldWrap: { marginBottom: 14 },
  fieldLabel: { color: "#a99fb3", fontSize: 12, fontWeight: "700", marginBottom: 7 },
  input: {
    backgroundColor: "#0b0810", borderWidth: 1, borderColor: "#2d2438", borderRadius: 15,
    color: "white", paddingHorizontal: 14, paddingVertical: 14, fontSize: 16
  },
  button: {
    minHeight: 50, borderRadius: 16, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 16, marginTop: 6
  },
  primaryButton: { backgroundColor: "#6d3fe6" },
  dangerButton: { backgroundColor: "#8e2942" },
  disabled: { opacity: 0.38 },
  pressed: { opacity: 0.82 },
  buttonText: { color: "white", fontWeight: "800", fontSize: 15 },
  linkButton: { paddingVertical: 15, alignItems: "center" },
  linkText: { color: "#a78ae8", fontSize: 13 },
  divider: { height: 1, backgroundColor: "#2a2134", marginVertical: 8 },
  sectionMini: { color: "#ede7f5", fontWeight: "800", marginBottom: 12 },
  securityHint: { color: "#736b7e", fontSize: 11, textAlign: "center", marginTop: 12 },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  brandSmall: { color: "#a67df6", fontWeight: "800", fontSize: 11, letterSpacing: 1.8 },
  pageTitle: { color: "white", fontSize: 27, fontWeight: "800", marginTop: 3 },
  lockButton: { backgroundColor: "#17121f", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  lockText: { color: "#c5b8d3", fontWeight: "700" },
  testBadge: { backgroundColor: "#2f2510", borderRadius: 12, padding: 11, marginBottom: 18 },
  testText: { color: "#f2cf69", fontSize: 11, fontWeight: "800", textAlign: "center" },\n  warningBadge: { backgroundColor: "#35171d", borderRadius: 12, padding: 11, marginBottom: 18 },\n  warningText: { color: "#f0a0ad", fontSize: 11, fontWeight: "800", textAlign: "center", lineHeight: 16 },
  sectionTitle: { color: "#8b8197", fontSize: 12, fontWeight: "800", letterSpacing: 1.2, marginTop: 18, marginBottom: 9 },
  statCard: {
    backgroundColor: "#120e19", borderRadius: 20, padding: 17, marginBottom: 10,
    borderColor: "#272032", borderWidth: 1
  },
  statCardAccent: { borderColor: "#5a3f83", backgroundColor: "#151021" },
  cardLabel: { color: "#91879c", fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  statValue: { color: "white", fontSize: 27, fontWeight: "900", marginTop: 7 },
  cardCaption: { color: "#786f82", fontSize: 12, marginTop: 5 },
  grid: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  queueCard: {
    backgroundColor: "#171022", borderWidth: 1, borderColor: "#3e2b58", borderRadius: 22,
    padding: 18, marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between"
  },
  queueCount: { color: "white", fontSize: 24, fontWeight: "900", marginTop: 7 },
  arrow: { color: "#b48cff", fontSize: 36 },
  ownerCard: {
    backgroundColor: "#160f24", borderColor: "#6847a0", borderWidth: 1,
    borderRadius: 24, padding: 20
  },
  ownerAmount: { color: "#c7a9ff", fontSize: 34, fontWeight: "900", marginTop: 8 },
  cardAction: { marginTop: 14 },
  footerNote: { color: "#655d6e", fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 24 },
  listHeader: {
    paddingTop: 58, paddingHorizontal: 18, paddingBottom: 12,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between"
  },
  back: { color: "#b38cff", fontSize: 15, fontWeight: "700", marginBottom: 14 },
  listContent: { padding: 18, paddingBottom: 40 },
  empty: { color: "#887d93", textAlign: "center", marginTop: 70 },
  approvalCard: {
    backgroundColor: "#120e19", borderColor: "#282032", borderWidth: 1, borderRadius: 20,
    padding: 16, marginBottom: 12
  },
  approvalTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  userCode: { color: "white", fontSize: 15, fontWeight: "800" },
  riskPill: { backgroundColor: "#183321", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  riskHigh: { backgroundColor: "#4a1d2a" },
  riskText: { color: "#e7deed", fontSize: 10, fontWeight: "800" },
  approvalAmount: { color: "#c9adff", fontSize: 28, fontWeight: "900", marginVertical: 13 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusText: { color: "#a988ed", fontSize: 11, fontWeight: "800" },
  dateText: { color: "#5f5768", fontSize: 10, marginTop: 10 },
  detailHero: {
    backgroundColor: "#171022", borderRadius: 24, borderWidth: 1, borderColor: "#4a316d",
    padding: 20, marginTop: 12
  },
  heroAmount: { color: "white", fontSize: 36, fontWeight: "900", marginTop: 8 },
  detailCard: {
    backgroundColor: "#120e19", borderRadius: 20, borderWidth: 1, borderColor: "#282032",
    marginTop: 14, paddingHorizontal: 16
  },
  detailRow: {
    minHeight: 50, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#2b2334",
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 18
  },
  detailLabel: { color: "#83798e", fontSize: 12 },
  detailValue: { color: "#eee8f3", fontSize: 12, fontWeight: "700", flexShrink: 1, textAlign: "right" },
  actionCard: {
    backgroundColor: "#120e19", borderRadius: 20, borderWidth: 1, borderColor: "#282032",
    padding: 16, marginTop: 14
  },
  twoButtons: { flexDirection: "row", gap: 10, marginTop: 5 },
  maxButton: { alignSelf: "flex-end", paddingVertical: 3, marginTop: -8, marginBottom: 12 },
  maxText: { color: "#b38cff", fontSize: 12, fontWeight: "800" },
  errorText: { color: "#ef8495", fontSize: 12, marginTop: 10, textAlign: "center" }
});
