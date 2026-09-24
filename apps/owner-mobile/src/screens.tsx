import React, { useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Amount, Badge, Brand, Button, Copy, DetailRow, Empty, Field, Icon, IconButton, IconTile, Notice, Page, PinField, Surface, ThemeSwitch } from "./ui";
import { layout as s, useTheme } from "./theme";
import { type Approval, type ApprovalAction, type OwnerUpdateManifest, type Summary, canWithdraw, money, parseBaht, riskLabel, shortDate, statusLabel, systemStatus, withdrawLimit } from "./finance";

type SummaryProps = { summary: Summary | null; refreshing: boolean; error?: string; onRefresh: () => void };
const message = (error: unknown) => error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง";

function PaymentNotice({ summary }: { summary: Summary | null }) {
  if (summary?.paymentMode === "TEST") return <Notice text="โหมดทดสอบ · รายการในโหมดนี้ไม่ใช่เงินจริง" />;
  if (summary && !summary.omise.configured) return <Notice text="ยังไม่พร้อมโอนเงิน กรุณาตรวจสอบการเชื่อมต่อ" />;
  if (summary && !summary.omise.reachable) return <Notice text="บริการโอนเงินไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง" danger />;
  return null;
}
function SectionLabel({ title, aside }: { title: string; aside?: string }) {
  const { colors: c } = useTheme();
  return <View style={s.between}><Copy style={[s.label, { color: c.muted, fontWeight: "600" }]}>{title}</Copy>{aside && <Copy style={[s.small, { color: c.subtle }]}>{aside}</Copy>}</View>;
}

export function Dashboard({ summary, refreshing, error, onRefresh, onApprovals, onWithdraw, updatedAt }: SummaryProps & { onApprovals: () => void; onWithdraw: () => void; updatedAt?: string }) {
  const { colors: c } = useTheme();
  const [hidden, setHidden] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const status = systemStatus(summary, !!error);
  const connected = !!summary?.omise.configured && summary.omise.reachable;
  const ready = connected && !error && !!summary && withdrawLimit(summary) >= summary.omise.minTransferSatang;
  return <Page refreshing={refreshing} onRefresh={onRefresh}>
    <View style={s.between}><View><Copy style={[s.small, { color: c.accent, letterSpacing: 2, fontWeight: "700" }]}>FINANCE OVERVIEW</Copy><Copy accessibilityRole="header" style={[s.title, { fontSize: 23 }]}>ศูนย์ควบคุมการเงิน</Copy></View><View style={{ alignItems: "flex-end", gap: 3 }}><Copy style={[s.small, { color: c.subtle }]}>System</Copy><Badge {...status} /></View></View>
    {!!error && <Notice text={error} danger onRetry={onRefresh} />}
    <PaymentNotice summary={summary} />
    <Surface variant="hero" style={{ padding: 19 }}>
      <View style={s.between}><View style={s.row}><IconTile name="wallet" size={38} /><Copy style={[s.label, { color: c.muted }]}>ยอดรวมในระบบ</Copy></View><Pressable accessibilityRole="button" accessibilityLabel={hidden ? "แสดงยอดเงิน" : "ซ่อนยอดเงิน"} accessibilityState={{ selected: hidden }} onPress={() => setHidden(!hidden)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Icon name={hidden ? "eyeOff" : "eye"} color={c.muted} size={18} /></Pressable></View>
      <View style={{ marginVertical: 10 }}><Amount value={connected ? summary?.omise.totalSatang : undefined} hidden={hidden} size={37} /></View>
      <View style={[s.between, { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.heroBorder, paddingTop: 10 }]}><Copy style={[s.small, { color: c.muted }]}>Omise / Opn</Copy><View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><Icon name="clock" color={c.subtle} size={12} /><Copy style={[s.small, { color: c.subtle }]}>{updatedAt ? `อัปเดต ${new Date(updatedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}` : "รอข้อมูลล่าสุด"}</Copy></View></View>
    </Surface>
    <View style={{ flexDirection: "row", gap: 12 }}>
      <Surface style={[s.grow, { padding: 14, borderRadius: 19 }]}><View style={{ gap: 9 }}><IconTile name="bank" tone="blue" size={32} /><Copy style={[s.small, { color: c.muted }]}>ยอดพร้อมโอน</Copy><Amount value={connected ? summary?.omise.transferableSatang : undefined} hidden={hidden} size={21} currency={false} /><Copy style={{ fontSize: 10, color: c.subtle }}>THB · ก่อนหักยอดกันไว้</Copy></View></Surface>
      <Surface style={[s.grow, { padding: 14, borderRadius: 19 }]}><View style={{ gap: 9 }}><IconTile name="percent" size={32} /><Copy style={[s.small, { color: c.muted }]}>คอมมิชชันรอเคลียร์</Copy><Amount value={summary?.commission.pendingSatang} hidden={hidden} size={21} currency={false} /><Copy style={{ fontSize: 10, color: c.subtle }}>THB · คอมมิชชันลูกค้า</Copy></View></Surface>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="ดูคำขอถอนรออนุมัติ" onPress={onApprovals} style={({ pressed }) => ({ opacity: pressed ? .7 : 1 })}>
      <Surface style={{ borderColor: c.warning + "55", backgroundColor: c.warningSoft, padding: 16 }}><View style={s.between}><View style={s.row}><Icon name="list" color={c.warning} size={19} /><Copy style={[s.heading, { fontSize: 14 }]}>คำขอถอนรออนุมัติ</Copy></View><Icon name="chevron" color={c.warning} size={18} /></View><View style={[s.between, { marginTop: 12, alignItems: "flex-end" }]}><View style={{ flex: 1 }}><Copy style={[s.number, { fontSize: 29 }]}>{summary?.approvals.requestedCount ?? "—"}<Copy style={[s.label, { color: c.muted }]}> รายการ</Copy></Copy><Copy style={{ fontSize: 10, color: c.muted, marginTop: 2 }}>พัก {summary?.approvals.holdCount ?? "—"} · อนุมัติแล้ว {summary?.approvals.approvedCount ?? "—"}</Copy></View><View style={{ flex: 1.35, alignItems: "flex-end" }}><Copy style={{ color: c.muted, fontSize: 10, marginBottom: 3 }}>ยอดรวมคิวทั้งหมด</Copy><Amount value={summary?.approvals.waitingSatang} hidden={hidden} size={20} /></View></View></Surface>
    </Pressable>
    <Surface variant="owner" style={{ padding: 17 }}><View style={s.row}><IconTile name="shield" tone="success" size={38} /><View style={s.grow}><Copy style={[s.heading, { fontSize: 15 }]}>เงินของเจ้าของ</Copy><Copy style={[s.small, { color: c.muted }]}>ยอดที่ถอนได้หลังหักเงินกันไว้</Copy></View></View><View style={{ marginTop: 12, marginBottom: 12 }}><Amount value={connected ? summary?.owner.safeWithdrawableSatang : undefined} hidden={hidden} size={29} color={c.success} /></View><Button label="ถอนเงินเข้าบัญชี" icon="arrow" onPress={onWithdraw} disabled={!ready} /></Surface>
    <Pressable accessibilityRole="button" accessibilityLabel="รายละเอียดคอมมิชชัน" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={[s.between, { minHeight: 44 }]}><Copy style={[s.label, { color: c.muted }]}>รายละเอียดคอมมิชชัน</Copy><Icon name={expanded ? "close" : "chevron"} size={16} color={c.subtle} /></Pressable>
    {expanded && <Surface><DetailRow label="พร้อมถอน" value={hidden ? "••••••" : money(summary?.commission.availableSatang)} /><DetailRow label="กันไว้รอจ่าย" value={hidden ? "••••••" : money(summary?.commission.lockedSatang)} /><DetailRow label="จ่ายแล้ว" value={hidden ? "••••••" : money(summary?.commission.paidSatang)} last /></Surface>}
  </Page>;
}

export function OwnerMoney({ summary, refreshing, error, onRefresh, onWithdraw }: SummaryProps & { onWithdraw: () => void }) {
  const { colors: c } = useTheme();
  const connected = summary?.omise.configured && summary.omise.reachable;
  return <Page title="เงินของเจ้าของ" subtitle="ยอดคงเหลือและประวัติการถอน" refreshing={refreshing} onRefresh={onRefresh}>
    {!!error && <Notice text={error} danger onRetry={onRefresh} />}<PaymentNotice summary={summary} />
    <Surface variant="owner"><View style={s.row}><IconTile name="shield" tone="success" /><Copy style={[s.label, { color: c.muted }]}>ยอดที่ถอนได้</Copy></View><View style={{ marginVertical: 16 }}><Amount value={connected ? summary?.owner.safeWithdrawableSatang : undefined} size={34} color={c.success} /></View><Button label="ถอนเงินเข้าบัญชี" icon="arrow" onPress={onWithdraw} disabled={!connected || !!error || !summary || withdrawLimit(summary) < summary.omise.minTransferSatang} /></Surface>
    <SectionLabel title="สรุปยอดเงิน" /><Surface><DetailRow label="ยอดพร้อมโอน" value={money(connected ? summary?.omise.transferableSatang : undefined)} /><DetailRow label="กันไว้สำหรับค่าคอมมิชชัน" value={money(summary?.owner.commissionLiabilitySatang)} /><DetailRow label="เงินสำรอง" value={money(summary?.owner.reserveSatang)} last /></Surface>
    <SectionLabel title="การถอนล่าสุด" aside="10 รายการล่าสุด" /><Surface style={{ paddingVertical: 4 }}>{!summary ? <Empty title="ยังไม่มีข้อมูล" caption="ดึงหน้าจอลงเพื่อโหลดข้อมูลใหม่" /> : !summary.recentOwnerTransfers.length ? <Empty title="ยังไม่มีรายการถอน" caption="รายการถอนเงินของคุณจะแสดงที่นี่" icon="wallet" /> : summary.recentOwnerTransfers.map((item, index) => <View key={item.id} style={{ paddingVertical: 15, gap: 7, borderBottomWidth: index === summary.recentOwnerTransfers.length - 1 ? 0 : StyleSheet.hairlineWidth, borderColor: c.border }}><View style={s.between}><View style={s.row}><IconTile name="arrow" tone="blue" size={33} /><Copy style={s.label}>ถอนเข้าบัญชีหลัก</Copy></View><Amount value={item.amount_satang} size={18} /></View><View style={s.between}><Copy style={[s.small, { color: c.muted }]}>{shortDate(item.created_at)}</Copy><Badge text={statusLabel(item.status)} tone={["FAILED", "REJECTED"].includes(item.status) ? "danger" : ["PAID", "COMPLETED"].includes(item.status) ? "success" : "neutral"} /></View></View>)}</Surface>
  </Page>;
}

export function ApprovalList({ items, loading, error, onRefresh, onOpen, onBack }: { items: Approval[] | null; loading: boolean; error?: string; onRefresh: () => void; onOpen: (item: Approval) => void; onBack?: () => void }) {
  const { colors: c } = useTheme();
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const visible = (items || []).filter(item => (filter === "ALL" || item.status === filter) && `${item.user_code} ${item.email} ${item.account_name}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <Page title="คำขอถอน" subtitle="ตรวจสอบและจัดการรายการของลูกค้า" onBack={onBack} refreshing={loading} onRefresh={onRefresh}>
    <Field label="ค้นหารายการ" placeholder="รหัสลูกค้า ชื่อ หรืออีเมล" value={search} onChangeText={setSearch} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>{[["ALL", "ทั้งหมด"], ["REQUESTED", "รออนุมัติ"], ["HOLD", "พักรายการ"], ["APPROVED", "อนุมัติแล้ว"]].map(([key, label]) => <Pressable key={key} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: key === filter }} onPress={() => setFilter(key)} style={{ minHeight: 44, paddingHorizontal: 13, justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: key === filter ? c.accent : c.border, backgroundColor: key === filter ? c.accentSoft : c.surface }}><Copy style={{ fontSize: 12, color: key === filter ? c.accent : c.muted, fontWeight: "600" }}>{label}</Copy></Pressable>)}</ScrollView>
    {!!error && <Notice text={error} danger onRetry={onRefresh} />}
    {loading && !items ? <ActivityIndicator color={c.accent} style={{ margin: 28 }} /> : !visible.length && !error ? <Empty title={items ? "ไม่มีรายการในขณะนี้" : "ยังไม่มีข้อมูลคำขอถอน"} caption={search ? "ลองค้นหาด้วยชื่อหรือรหัสอื่น" : "รายการใหม่จะแสดงในหน้านี้"} /> : visible.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`ตรวจคำขอ ${item.user_code} ${money(item.amount_satang)}`} onPress={() => onOpen(item)}><Surface style={{ gap: 13 }}><View style={s.between}><View style={[s.row, s.grow]}><IconTile name="user" tone="blue" size={36} /><View style={s.grow}><Copy style={[s.heading, { fontSize: 14 }]}>{item.user_code}</Copy><Copy numberOfLines={1} style={[s.small, { color: c.muted }]}>{item.email}</Copy></View></View><Icon name="chevron" size={18} color={c.subtle} /></View><Amount value={item.amount_satang} size={28} /><View style={s.between}><Copy style={[s.small, { color: c.muted }]}>{item.bank_code} · {item.masked_account}</Copy><Badge text={statusLabel(item.status)} tone={item.status === "APPROVED" ? "success" : "warning"} /></View><View style={[s.between, { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.border, paddingTop: 10 }]}><Copy style={[s.small, { color: c.subtle }]}>{shortDate(item.created_at)}</Copy><Copy style={[s.small, { color: ["HIGH", "CRITICAL"].includes(item.risk_level) ? c.danger : c.muted }]}>{riskLabel(item.risk_level)} · {item.risk_score}</Copy></View></Surface></Pressable>)}
  </Page>;
}

export function ApprovalDetail({ item, onBack, onAction }: { item: Approval; onBack: () => void; onAction: (kind: ApprovalAction, pin: string, reason: string) => Promise<void> }) {
  const { colors: c } = useTheme();
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<ApprovalAction | null>(null);
  const [error, setError] = useState("");
  const guard = useRef(false);
  async function act(kind: ApprovalAction) {
    if (guard.current || !/^\d{6}$/.test(pin)) return;
    if (kind === "reject" && !reason.trim()) { setError("กรุณาระบุเหตุผลในการปฏิเสธรายการ"); return; }
    guard.current = true; setBusy(kind); setError("");
    try { await onAction(kind, pin, reason.trim()); }
    catch (e) { setError(message(e)); }
    finally { guard.current = false; setBusy(null); setPin(""); }
  }
  return <Page title="ตรวจคำขอถอน" onBack={busy ? undefined : onBack}>
    <Surface variant="hero"><View style={s.between}><Copy style={s.heading}>{item.user_code}</Copy><Badge text={statusLabel(item.status)} tone="warning" /></View><View style={{ marginVertical: 12 }}><Amount value={item.amount_satang} size={36} /></View><Copy style={[s.small, { color: c.muted }]}>{shortDate(item.created_at)}</Copy></Surface>
    <Surface><SectionLabel title="บัญชีรับเงิน" /><DetailRow label="ผู้ใช้" value={item.email} /><DetailRow label="ธนาคาร" value={`${item.bank_name} (${item.bank_code})`} /><DetailRow label="ชื่อบัญชี" value={item.account_name} /><DetailRow label="เลขที่บัญชี" value={item.masked_account} /><DetailRow label="สถานะบัญชี" value={statusLabel(item.destination_status)} last /></Surface>
    <Surface><SectionLabel title="ข้อมูลประกอบการอนุมัติ" /><DetailRow label="ความเสี่ยง" value={`${riskLabel(item.risk_level)} · ${item.risk_score}/100`} /><DetailRow label="ผู้ใช้ที่ใช้บัญชีนี้" value={`${item.shared_account_users} คน`} /><DetailRow label="การอนุมัติ" value={`${item.approval_count} / ${item.approval_required}`} last /></Surface>
    <Surface style={s.stack}><Field label="หมายเหตุ / เหตุผล" placeholder="จำเป็นเมื่อปฏิเสธรายการ" value={reason} onChangeText={setReason} multiline editable={!busy} /><PinField value={pin} onChange={setPin} editable={!busy} />{!!error && <Notice text={error} danger />}<Button label={busy === "approve" ? "กำลังอนุมัติ" : "อนุมัติคำขอ"} icon="check" onPress={() => void act("approve")} busy={busy === "approve"} disabled={!!busy || pin.length !== 6 || item.status === "APPROVED"} /><View style={{ flexDirection: "row", gap: 10 }}><View style={s.grow}><Button label="พักรายการ" onPress={() => void act("hold")} variant="secondary" busy={busy === "hold"} disabled={!!busy || pin.length !== 6} /></View><View style={s.grow}><Button label="ปฏิเสธ" onPress={() => void act("reject")} variant="danger" busy={busy === "reject"} disabled={!!busy || pin.length !== 6} /></View></View></Surface>
  </Page>;
}

export function OwnerWithdraw({ summary, onBack, onSubmit, stale = false }: { summary: Summary | null; onBack: () => void; onSubmit: (satang: number, pin: string) => Promise<void>; stale?: boolean }) {
  const { colors: c } = useTheme();
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const guard = useRef(false);
  const satang = parseBaht(amount);
  const max = withdrawLimit(summary);
  const valid = canWithdraw(summary, satang, pin) && !stale;
  async function submit() {
    if (guard.current || !valid || satang === null) return;
    guard.current = true; setBusy(true); setError("");
    try { await onSubmit(satang, pin); }
    catch (e) { setError(message(e)); }
    finally { guard.current = false; setBusy(false); setPin(""); setConfirm(false); }
  }
  const amountError = amount && satang === null ? "กรอกจำนวนเงินให้ถูกต้อง ทศนิยมไม่เกิน 2 ตำแหน่ง" : satang !== null && satang > max ? "จำนวนเงินเกินวงเงินที่ถอนได้" : satang !== null && satang < (summary?.omise.minTransferSatang || 3000) ? `ยอดถอนขั้นต่ำ ${money(summary?.omise.minTransferSatang || 3000)}` : "";
  return <Page title="ถอนเงิน" onBack={busy ? undefined : onBack} subtitle="โอนเข้าบัญชีหลักของเจ้าของ">
    <PaymentNotice summary={summary} />{stale && <Notice text="กรุณาอัปเดตยอดเงินก่อนทำรายการ" />}
    <Surface variant="owner"><View style={s.row}><IconTile name="wallet" tone="success" /><Copy style={[s.label, { color: c.muted }]}>ถอนได้สูงสุดต่อรายการ</Copy></View><View style={{ marginTop: 14 }}><Amount value={summary?.omise.reachable ? max : undefined} size={34} color={c.success} /></View></Surface>
    <Surface style={s.stack}><Field label="จำนวนเงิน (บาท)" value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" editable={!busy} style={{ fontSize: 29, fontWeight: "600" }} /><Pressable accessibilityRole="button" disabled={busy || !summary?.omise.reachable || stale} onPress={() => setAmount((max / 100).toFixed(2))} style={{ minHeight: 44, alignSelf: "flex-end", justifyContent: "center", paddingHorizontal: 8 }}><Copy style={{ color: c.accent, fontSize: 12, fontWeight: "700" }}>ใช้ยอดสูงสุด</Copy></Pressable>{!!amountError && <Notice text={amountError} danger />}<View style={[s.row, { padding: 13, borderRadius: 14, backgroundColor: c.raised }]}><Icon name="bank" color={c.muted} /><View style={s.grow}><Copy style={[s.label, { fontWeight: "700" }]}>บัญชีหลักที่ยืนยันแล้ว</Copy><Copy style={[s.small, { color: c.muted }]}>บัญชีรับเงินที่ผูกไว้กับ Omise / Opn</Copy></View></View><PinField value={pin} onChange={setPin} editable={!busy} />{!!error && <Notice text={error} danger />}<Button label="ตรวจสอบการถอน" icon="arrow" disabled={!valid || busy} onPress={() => setConfirm(true)} /></Surface>
    <View style={[s.row, { alignItems: "flex-start", paddingHorizontal: 8 }]}><Icon name="lock" size={16} color={c.muted} /><Copy style={[s.small, s.grow, { color: c.muted }]}>เงินจะเข้าบัญชีหลักที่ยืนยันไว้เท่านั้น คุณจะได้ตรวจสอบอีกครั้งก่อนยืนยัน</Copy></View>
    <Modal visible={confirm} transparent animationType="fade" onRequestClose={() => { if (!busy) setConfirm(false); }}><View style={{ flex: 1, padding: 24, justifyContent: "center", backgroundColor: "rgba(2,8,20,.72)" }}><Surface style={{ width: "100%", maxWidth: 400, alignSelf: "center", gap: 18 }}><IconTile name="bank" tone="blue" size={50} /><Copy style={s.title}>ยืนยันการถอนเงิน</Copy><Amount value={satang} size={32} /><Copy style={[s.body, { color: c.muted }]}>โอนเข้าบัญชีหลักที่ยืนยันไว้กับ Omise / Opn</Copy><Button label={busy ? "กำลังส่งคำสั่ง" : "ยืนยันถอนเงิน"} busy={busy} disabled={!valid} onPress={() => void submit()} icon="check" /><Button label="กลับไปแก้ไข" disabled={busy} variant="secondary" onPress={() => setConfirm(false)} /></Surface></View></Modal>
  </Page>;
}

export function PinLogin({ onSetup, onLogin }: { onSetup: () => void; onLogin: (pin: string) => Promise<void> }) {
  const { colors: c } = useTheme();
  const [pin, setPin] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const guard = useRef(false);
  async function login() { if (guard.current || pin.length !== 6) return; guard.current = true; setBusy(true); setError(""); try { await onLogin(pin); } catch (e) { setError(message(e)); } finally { guard.current = false; setBusy(false); setPin(""); } }
  return <Page><View style={{ alignItems: "center", paddingTop: 32, paddingBottom: 14, gap: 16 }}><Image source={require("../assets/scenova-owner-icon-v2.png")} style={{ width: 96, height: 96, borderRadius: 29 }} /><Copy style={[s.small, { color: c.accent, letterSpacing: 3 }]}>SCENOVA OWNER</Copy><Copy style={s.title}>ยินดีต้อนรับกลับ</Copy><Copy style={[s.body, { color: c.muted }]}>เข้าสู่ศูนย์ควบคุมการเงินของคุณ</Copy></View><Surface style={{ gap: 20, padding: 24 }}><PinField value={pin} onChange={setPin} label="ใส่ PIN 6 หลัก" editable={!busy} />{!!error && <Notice text={error} danger />}<Button label="เข้าใช้งาน" icon="lock" disabled={pin.length !== 6} busy={busy} onPress={() => void login()} /><Pressable accessibilityRole="button" disabled={busy} onPress={onSetup} style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}><Copy style={{ color: c.accent, fontSize: 12 }}>ลืม PIN / ลงทะเบียนเครื่องใหม่</Copy></Pressable></Surface><View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 12 }}><Icon name="shield" size={15} color={c.subtle} /><Copy style={[s.small, { color: c.subtle }]}>สำหรับเจ้าของบัญชีเท่านั้น</Copy></View></Page>;
}

export type Enrollment = { email: string; password: string; twoFactorCode: string; pin: string };
export function FirstSetup({ onSubmit, onBack }: { onSubmit: (data: Enrollment) => Promise<void>; onBack?: () => void }) {
  const { colors: c } = useTheme(); const [step, setStep] = useState(1); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [twoFactorCode, setTwoFactorCode] = useState(""); const [pin, setPin] = useState(""); const [confirmPin, setConfirmPin] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const guard = useRef(false);
  const accountReady = email.includes("@") && password.length >= 8 && twoFactorCode.length === 6;
  async function enroll() { if (guard.current || !accountReady || pin.length !== 6 || pin !== confirmPin) return; guard.current = true; setBusy(true); setError(""); try { await onSubmit({ email: email.trim(), password, twoFactorCode, pin }); } catch (e) { setError(message(e)); } finally { guard.current = false; setBusy(false); setPin(""); setConfirmPin(""); } }
  return <Page title="เริ่มใช้งาน Owner" subtitle="เชื่อมบัญชีของคุณกับโทรศัพท์เครื่องนี้" onBack={busy ? undefined : step === 2 ? () => setStep(1) : onBack}><View style={s.row}>{[1, 2].map(value => <View key={value} style={{ flex: 1, gap: 9 }}><View style={{ height: 3, borderRadius: 3, backgroundColor: step >= value ? c.primary : c.border }} /><Copy style={[s.small, { color: step === value ? c.accent : c.subtle }]}>{value === 1 ? "01  ยืนยันตัวตน" : "02  ตั้งรหัส PIN"}</Copy></View>)}</View><Surface style={{ gap: 18 }}><IconTile name={step === 1 ? "user" : "lock"} /><Copy style={s.heading}>{step === 1 ? "บัญชีเจ้าของ" : "ตั้ง PIN สำหรับเข้าใช้งาน"}</Copy>{step === 1 ? <><Field label="อีเมล" placeholder="owner@example.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" /><Field label="รหัสผ่าน" placeholder="รหัสผ่านบัญชี SCENOVA" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" /><Field label="รหัสยืนยัน 2FA" value={twoFactorCode} onChangeText={v => setTwoFactorCode(v.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" maxLength={6} placeholder="รหัส 6 หลัก" /><Button label="ถัดไป" icon="chevron" disabled={!accountReady} onPress={() => setStep(2)} /></> : <><PinField value={pin} onChange={setPin} label="ตั้ง PIN 6 หลัก" editable={!busy} /><PinField value={confirmPin} onChange={setConfirmPin} label="ยืนยัน PIN อีกครั้ง" editable={!busy} />{confirmPin.length === 6 && pin !== confirmPin && <Notice text="PIN ไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง" danger />}{!!error && <Notice text={error} danger />}<Button label="ยืนยันและเข้าใช้งาน" icon="check" busy={busy} disabled={!accountReady || pin.length !== 6 || pin !== confirmPin} onPress={() => void enroll()} /></>}</Surface><Copy style={[s.small, { color: c.muted, textAlign: "center" }]}>ลงทะเบียนเครื่องใหม่จะยกเลิกการเข้าถึงจากเครื่องเดิม</Copy></Page>;
}

export function Settings({ summary, error, version, update, updateBusy, onInstall, onLock }: { summary: Summary | null; error?: string; version: string; update: OwnerUpdateManifest | null; updateBusy: boolean; onInstall: () => void; onLock: () => void }) {
  const { colors: c } = useTheme(); const status = systemStatus(summary, !!error);
  return <Page title="ตั้งค่า" subtitle="จัดการหน้าตาและการเข้าถึง"><Surface><View style={[s.between, { marginBottom: 12 }]}><View style={s.row}><IconTile name="sun" /><Copy style={s.heading}>ธีมแอป</Copy></View><ThemeSwitch /></View><Copy style={[s.label, { color: c.muted }]}>เลือกหน้าตาที่สบายตาสำหรับคุณ</Copy></Surface><Surface><View style={s.between}><View style={s.row}><IconTile name="shield" tone="success" /><Copy style={s.heading}>System</Copy></View><Badge {...status} /></View><DetailRow label="การชำระเงิน" value={summary?.paymentMode === "TEST" ? "โหมดทดสอบ" : summary?.paymentMode === "LIVE" ? "ใช้งานจริง" : "รอข้อมูล"} /><DetailRow label="การเข้าใช้งาน" value="PIN 6 หลัก" /><DetailRow label="ยืนยันเครื่องใหม่" value="รหัสผ่านและ 2FA" /><DetailRow label="ล็อกอัตโนมัติ" value="เมื่อออกจากแอป" last /></Surface><Surface style={s.stack}><View style={s.row}><Brand /><View style={s.grow} /><Copy style={[s.small, { color: c.muted }]}>{version}</Copy></View>{update && <><Copy style={s.label}>เวอร์ชัน {update.version} พร้อมอัปเดต</Copy><Button label="อัปเดตแอป" icon="download" busy={updateBusy} onPress={onInstall} /></>}</Surface><Button label="ล็อกแอป" icon="lock" variant="secondary" onPress={onLock} /></Page>;
}

export function UpdateNotice({ manifest, busy, onInstall }: { manifest: OwnerUpdateManifest; busy: boolean; onInstall: () => void }) {
  const { colors: c } = useTheme();
  return <View style={{ marginHorizontal: 20, marginTop: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}><View style={s.between}><View style={s.grow}><Copy style={[s.label, { fontWeight: "700" }]}>มีเวอร์ชันใหม่ {manifest.version}</Copy><Copy style={[s.small, { color: c.muted }]}>{busy ? "กำลังดาวน์โหลดอัปเดต" : "พร้อมอัปเดตแอปของคุณ"}</Copy></View><IconButton icon="download" label="อัปเดตแอป" onPress={onInstall} disabled={busy} /></View></View>;
}
