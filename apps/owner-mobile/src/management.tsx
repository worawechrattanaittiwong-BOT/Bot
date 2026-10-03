import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { layout as s, useTheme } from "./theme";
import {
  Badge, Button, Copy, DetailRow, Empty, Field, Icon, IconTile,
  Notice, Page, PinField, Surface
} from "./ui";

export type OwnerApi = (path: string, options?: RequestInit) => Promise<any>;

type PackageRow = {
  months: number;
  price_satang: number;
  price_usd_cents: number;
  enabled: boolean;
  updated_at: string;
};

function when(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("th-TH", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง";
}

function PackageEditor({
  mode,
  item,
  onSaved,
  api
}: {
  mode: "LOCAL" | "CLOUD";
  item: PackageRow;
  onSaved: () => Promise<void>;
  api: OwnerApi;
}) {
  const { colors: c } = useTheme();
  const [price, setPrice] = useState((Number(item.price_usd_cents || 0) / 100).toFixed(2));
  const [enabled, setEnabled] = useState(Boolean(item.enabled));
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    const number = Number(price);
    if (!Number.isFinite(number) || number < 0) {
      Alert.alert("ราคาไม่ถูกต้อง", "กรุณาใส่ราคาเป็น USD");
      return;
    }
    setBusy(true);
    try {
      await api("/owner-mobile/packages", {
        method: "POST",
        body: JSON.stringify({
          mode,
          months: item.months,
          priceUsdCents: Math.round(number * 100),
          enabled,
          pin
        })
      });
      setPin("");
      await onSaved();
      Alert.alert("บันทึกแล้ว", mode + " " + item.months + " เดือน");
    } catch (error) {
      Alert.alert("บันทึกไม่สำเร็จ", message(error));
    } finally {
      setBusy(false);
    }
  }

  return <Surface style={{ gap: 12 }}>
    <View style={s.between}>
      <View style={s.row}>
        <IconTile name={mode === "LOCAL" ? "bank" : "wallet"} tone={mode === "LOCAL" ? "blue" : "accent"} size={36} />
        <View>
          <Copy style={s.heading}>{mode} · {item.months} เดือน</Copy>
          <Copy style={[s.small, { color: c.muted }]}>ปัจจุบัน ${(Number(item.price_usd_cents || 0) / 100).toFixed(2)} USD</Copy>
        </View>
      </View>
      <Badge text={enabled ? "เปิดขาย" : "ปิดขาย"} tone={enabled ? "success" : "neutral"} />
    </View>
    <Field label="ราคา (USD)" value={price} onChangeText={v => setPrice(v.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" />
    <Button
      label={enabled ? "สถานะ: เปิดขาย" : "สถานะ: ปิดขาย"}
      icon="check"
      variant="secondary"
      onPress={() => setEnabled(!enabled)}
    />
    <PinField value={pin} onChange={setPin} />
    <Button label="บันทึกราคาและสถานะ" icon="check" busy={busy} disabled={pin.length !== 6} onPress={() => void save()} />
  </Surface>;
}

export function PackagesScreen({ api }: { api: OwnerApi }) {
  const [data, setData] = useState<{ local: PackageRow[]; cloud: PackageRow[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      setData(await api("/owner-mobile/packages"));
      setError("");
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  return <Page title="แพ็กเกจและราคา" subtitle="กำหนดราคาและเปิด/ปิดการขาย" refreshing={loading} onRefresh={() => void load()}>
    {!!error && <Notice text={error} danger onRetry={() => void load()} />}
    <Copy style={s.heading}>Local MT5</Copy>
    {(data?.local || []).map(item => <PackageEditor key={"L" + item.months} mode="LOCAL" item={item} api={api} onSaved={load} />)}
    <Copy style={[s.heading, { marginTop: 6 }]}>Cloud MT5</Copy>
    {(data?.cloud || []).map(item => <PackageEditor key={"C" + item.months} mode="CLOUD" item={item} api={api} onSaved={load} />)}
  </Page>;
}

type Promotion = {
  id: string;
  code: string;
  discount_percent: number;
  usage_limit: number;
  per_user_limit: number;
  starts_at: string;
  ends_at: string;
  applies_to_all_packages: boolean;
  active: boolean;
  used_count: number;
  reserved_count: number;
  packages: Array<{ mode: "LOCAL" | "CLOUD"; months: number }>;
};

const packageChoices = [
  { mode: "LOCAL" as const, months: 1 }, { mode: "LOCAL" as const, months: 3 },
  { mode: "LOCAL" as const, months: 6 }, { mode: "LOCAL" as const, months: 12 },
  { mode: "CLOUD" as const, months: 1 }, { mode: "CLOUD" as const, months: 3 },
  { mode: "CLOUD" as const, months: 6 }, { mode: "CLOUD" as const, months: 12 }
];

function localDateInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function PromotionsScreen({ api }: { api: OwnerApi }) {
  const { colors: c } = useTheme();
  const [items, setItems] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [code, setCode] = useState("");
  const [discount, setDiscount] = useState("20");
  const [usageLimit, setUsageLimit] = useState("100");
  const [perUserLimit, setPerUserLimit] = useState("1");
  const [startsAt, setStartsAt] = useState(localDateInput(new Date()));
  const [endsAt, setEndsAt] = useState(localDateInput(new Date(Date.now() + 30 * 86400000)));
  const [allPackages, setAllPackages] = useState(true);
  const [selectedPackages, setSelectedPackages] = useState<Array<{ mode: "LOCAL" | "CLOUD"; months: number }>>([]);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const result = await api("/owner-mobile/promotions");
      setItems(Array.isArray(result?.items) ? result.items : []);
      setError("");
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }

  async function generateCode() {
    try {
      const result = await api("/owner-mobile/promotions/generate-code", { method: "POST" });
      setCode(String(result?.code || ""));
    } catch (e) {
      Alert.alert("สร้างรหัสไม่สำเร็จ", message(e));
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => { if (createOpen && !code) void generateCode(); }, [createOpen]);

  function togglePackage(mode: "LOCAL" | "CLOUD", months: number) {
    setSelectedPackages(current => {
      const exists = current.some(x => x.mode === mode && x.months === months);
      return exists
        ? current.filter(x => !(x.mode === mode && x.months === months))
        : [...current, { mode, months }];
    });
  }

  async function create() {
    setBusy(true);
    try {
      await api("/owner-mobile/promotions", {
        method: "POST",
        body: JSON.stringify({
          code,
          discountPercent: Number(discount),
          usageLimit: Number(usageLimit),
          perUserLimit: Number(perUserLimit),
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          appliesToAllPackages: allPackages,
          packages: allPackages ? [] : selectedPackages,
          active: true,
          pin
        })
      });
      setCreateOpen(false);
      setCode("");
      setPin("");
      await load();
      Alert.alert("สร้างโปรโมชั่นแล้ว", "รหัส " + code);
    } catch (e) {
      Alert.alert("สร้างโปรโมชั่นไม่สำเร็จ", message(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(item: Promotion, cardPin: string) {
    try {
      await api("/owner-mobile/promotions/" + encodeURIComponent(item.id), {
        method: "POST",
        body: JSON.stringify({
          code: item.code,
          discountPercent: item.discount_percent,
          usageLimit: item.usage_limit,
          perUserLimit: item.per_user_limit,
          startsAt: item.starts_at,
          endsAt: item.ends_at,
          appliesToAllPackages: item.applies_to_all_packages,
          packages: item.packages || [],
          active: !item.active,
          pin: cardPin
        })
      });
      await load();
    } catch (e) {
      Alert.alert("เปลี่ยนสถานะไม่สำเร็จ", message(e));
    }
  }

  return <Page title="โปรโมชั่น" subtitle="สร้างและควบคุมรหัสส่วนลด" refreshing={loading} onRefresh={() => void load()}>
    {!!error && <Notice text={error} danger onRetry={() => void load()} />}
    <Button label={createOpen ? "ปิดแบบฟอร์ม" : "สร้างรหัสโปรโมชั่น"} icon={createOpen ? "close" : "percent"} onPress={() => setCreateOpen(!createOpen)} />
    {createOpen && <Surface style={s.stack}>
      <View style={s.between}>
        <View>
          <Copy style={s.heading}>รหัสโปรโมชั่น</Copy>
          <Copy style={[s.small, { color: c.muted }]}>รูปแบบ SNV-XXXX-XXXX</Copy>
        </View>
        <Button label="สุ่มใหม่" icon="refresh" variant="secondary" onPress={() => void generateCode()} />
      </View>
      <Field label="รหัส" value={code} editable={false} />
      <Field label="ส่วนลด (%)" value={discount} onChangeText={v => setDiscount(v.replace(/\D/g, "").slice(0, 3))} keyboardType="number-pad" />
      <Field label="จำนวนสิทธิ์ทั้งหมด" value={usageLimit} onChangeText={v => setUsageLimit(v.replace(/\D/g, ""))} keyboardType="number-pad" />
      <Field label="จำกัดต่อ 1 บัญชี" value={perUserLimit} onChangeText={v => setPerUserLimit(v.replace(/\D/g, ""))} keyboardType="number-pad" />
      <Field label="เริ่มใช้ (YYYY-MM-DDTHH:mm)" value={startsAt} onChangeText={setStartsAt} autoCapitalize="none" />
      <Field label="หมดอายุ (YYYY-MM-DDTHH:mm)" value={endsAt} onChangeText={setEndsAt} autoCapitalize="none" />
      <Button label={allPackages ? "ใช้กับ: ทุกแพ็กเกจ" : "ใช้กับ: แพ็กเกจที่เลือก"} variant="secondary" onPress={() => setAllPackages(!allPackages)} />
      {!allPackages && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {packageChoices.map(item => {
          const selected = selectedPackages.some(x => x.mode === item.mode && x.months === item.months);
          return <Pressable key={item.mode + item.months} onPress={() => togglePackage(item.mode, item.months)}
            style={{ paddingHorizontal: 11, paddingVertical: 8, borderRadius: 12, backgroundColor: selected ? c.accentSoft : c.raised }}>
            <Copy style={{ color: selected ? c.accent : c.muted, fontSize: 11, fontWeight: "700" }}>{item.mode} {item.months}M</Copy>
          </Pressable>;
        })}
      </View>}
      <PinField value={pin} onChange={setPin} />
      <Button label="บันทึกโปรโมชั่น" icon="check" busy={busy} disabled={pin.length !== 6 || !code} onPress={() => void create()} />
    </Surface>}

    {!items.length && !loading ? <Empty title="ยังไม่มีโปรโมชั่น" caption="สร้างรหัสแรกได้จากปุ่มด้านบน" icon="percent" /> :
      items.map(item => <PromotionCard key={item.id} item={item} onToggle={toggleActive} />)}
  </Page>;
}

function PromotionCard({ item, onToggle }: { item: Promotion; onToggle: (item: Promotion, pin: string) => Promise<void> }) {
  const { colors: c } = useTheme();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const used = Number(item.used_count || 0);
  const remaining = Math.max(0, Number(item.usage_limit || 0) - used - Number(item.reserved_count || 0));
  async function toggle() {
    setBusy(true);
    try {
      await onToggle(item, pin);
      setPin("");
    } finally {
      setBusy(false);
    }
  }
  return <Surface style={{ gap: 12 }}>
    <View style={s.between}>
      <View style={s.row}>
        <IconTile name="percent" />
        <View>
          <Copy style={[s.heading, { letterSpacing: .5 }]}>{item.code}</Copy>
          <Copy style={[s.small, { color: c.muted }]}>ลด {item.discount_percent}% · ใช้แล้ว {used}/{item.usage_limit}</Copy>
        </View>
      </View>
      <Badge text={item.active ? "ACTIVE" : "PAUSED"} tone={item.active ? "success" : "neutral"} />
    </View>
    <DetailRow label="สิทธิ์คงเหลือ" value={String(remaining)} />
    <DetailRow label="ต่อบัญชี" value={item.per_user_limit + " ครั้ง"} />
    <DetailRow label="หมดอายุ" value={when(item.ends_at)} last />
    <PinField value={pin} onChange={setPin} />
    <Button label={item.active ? "พักโปรโมชั่น" : "เปิดโปรโมชั่น"} variant="secondary" busy={busy} disabled={pin.length !== 6} onPress={() => void toggle()} />
  </Surface>;
}

type AccountListItem = {
  id: string;
  user_code: string;
  email: string;
  status: string;
  subscription_id?: string | null;
  plan_code?: string | null;
  subscription_mode?: string | null;
  subscription_status?: string | null;
  subscription_expires_at?: string | null;
  account_number?: string | null;
};

type AccountDetail = {
  user: { id: string; user_code: string; email: string; status: string; email_verified_at?: string | null };
  subscriptions: Array<{ id: string; status: string; starts_at: string; expires_at: string; plan_code: string; name_th: string; mode: string }>;
  slots: Array<{
    id: string; mode: string; slot_number: number; status: string; subscription_id?: string | null;
    instance_id?: string | null; mt5_account_id?: string | null; actual_state?: string | null; desired_state?: string | null;
    positions?: number; pending_orders?: number; active_symbol?: string | null; requested_symbol?: string | null;
    market_watch_symbols?: string[]; account_number?: string | null; broker?: string | null; broker_server?: string | null;
  }>;
  mt5Accounts: Array<{ id: string; account_number: string; broker: string; broker_server: string; mode: string; status: string }>;
};

export function AccountsScreen({ api }: { api: OwnerApi }) {
  const { colors: c } = useTheme();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<AccountListItem[]>([]);
  const [selected, setSelected] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [pin, setPin] = useState("");
  const [mode, setMode] = useState<"LOCAL" | "CLOUD">("LOCAL");
  const [months, setMonths] = useState(1);
  const [days, setDays] = useState("30");
  const [slotEditorId, setSlotEditorId] = useState("");
  const [symbolValue, setSymbolValue] = useState("");
  const [symbolChoicesOpen, setSymbolChoicesOpen] = useState(false);
  const [error, setError] = useState("");

  async function search() {
    setLoading(true);
    try {
      const result = await api("/owner-mobile/accounts?q=" + encodeURIComponent(q.trim()));
      setItems(Array.isArray(result?.items) ? result.items : []);
      setError("");
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }

  async function open(id: string) {
    setLoading(true);
    try {
      setSelected(await api("/owner-mobile/accounts/" + encodeURIComponent(id)));
      setPin("");
      setSlotEditorId("");
      setSymbolValue("");
      setSymbolChoicesOpen(false);
      setError("");
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void search(); }, []);

  const activeSub = useMemo(() =>
    selected?.subscriptions.find(item => item.status === "ACTIVE" && new Date(item.expires_at).getTime() > Date.now())
      || selected?.subscriptions[0] || null
  , [selected]);

  async function grant() {
    if (!selected) return;
    setLoading(true);
    try {
      setSelected(await api("/owner-mobile/accounts/" + selected.user.id + "/access", {
        method: "POST",
        body: JSON.stringify({ mode, months, pin })
      }));
      setPin("");
      Alert.alert("เปิดสิทธิ์แล้ว", mode + " " + months + " เดือน");
    } catch (e) {
      Alert.alert("เปิดสิทธิ์ไม่สำเร็จ", message(e));
    } finally {
      setLoading(false);
    }
  }

  async function adjustDays(sign: 1 | -1) {
    if (!selected || !activeSub) return;
    const amount=Math.max(1,Math.trunc(Number(days||0)));
    setLoading(true);
    try {
      setSelected(await api("/owner-mobile/accounts/" + selected.user.id + "/adjust-days", {
        method: "POST",
        body: JSON.stringify({ subscriptionId: activeSub.id, days: sign * amount, pin })
      }));
      setPin("");
      Alert.alert(sign>0 ? "เพิ่มวันแล้ว" : "ลดวันแล้ว", (sign>0 ? "เพิ่ม " : "ลด ") + amount + " วัน");
    } catch (e) {
      Alert.alert(sign>0 ? "เพิ่มวันไม่สำเร็จ" : "ลดวันไม่สำเร็จ", message(e));
    } finally {
      setLoading(false);
    }
  }

  function editSlotSymbol(slot: AccountDetail["slots"][number]) {
    if (slotEditorId===slot.id) {
      setSlotEditorId("");
      setSymbolChoicesOpen(false);
      return;
    }
    setSlotEditorId(slot.id);
    setSymbolValue(String(slot.requested_symbol||slot.active_symbol||""));
    setSymbolChoicesOpen(false);
    setPin("");
  }

  async function saveSymbol(slot: AccountDetail["slots"][number]) {
    if (!selected) return;
    const symbol=String(symbolValue||"").trim();
    if (!symbol) {
      Alert.alert("ยังไม่ได้เลือก Symbol","เลือกจากรายการ MT5 หรือพิมพ์ Symbol ก่อน");
      return;
    }
    setLoading(true);
    try {
      setSelected(await api("/owner-mobile/accounts/" + selected.user.id + "/slots/symbol", {
        method:"POST",
        body:JSON.stringify({ slotId:slot.id, symbol, pin })
      }));
      setPin("");
      setSlotEditorId("");
      setSymbolChoicesOpen(false);
      Alert.alert("บันทึก Symbol แล้ว",symbol);
    } catch(e) {
      Alert.alert("เปลี่ยน Symbol ไม่สำเร็จ",message(e));
    } finally {
      setLoading(false);
    }
  }

  function resetMt5(slot: AccountDetail["slots"][number]) {
    if (!selected) return;
    if (pin.length!==6) {
      Alert.alert("กรุณายืนยัน PIN","ใส่ Owner PIN 6 หลักก่อนรีเซ็ต MT5");
      return;
    }
    Alert.alert(
      "รีเซ็ตการเชื่อมต่อ MT5",
      "ระบบจะตัดการเชื่อมต่อบัญชี MT5 ของ Slot นี้ และลูกค้าต้องเชื่อมใหม่",
      [
        { text:"ยกเลิก", style:"cancel" },
        { text:"รีเซ็ต", style:"destructive", onPress:()=>void (async()=>{
          setLoading(true);
          try {
            setSelected(await api("/owner-mobile/accounts/" + selected.user.id + "/slots/reset-mt5", {
              method:"POST",
              body:JSON.stringify({ slotId:slot.id, pin })
            }));
            setPin("");
            setSlotEditorId("");
            Alert.alert("รีเซ็ตแล้ว","รอลูกค้าเชื่อม MT5 ใหม่");
          } catch(e) {
            Alert.alert("รีเซ็ตไม่สำเร็จ",message(e));
          } finally {
            setLoading(false);
          }
        })() }
      ]
    );
  }

  async function setStatus(status: "ACTIVE" | "SUSPENDED") {
    if (!selected) return;
    setLoading(true);
    try {
      setSelected(await api("/owner-mobile/accounts/" + selected.user.id + "/status", {
        method: "POST",
        body: JSON.stringify({ status, pin })
      }));
      setPin("");
    } catch (e) {
      Alert.alert("เปลี่ยนสถานะไม่สำเร็จ", message(e));
    } finally {
      setLoading(false);
    }
  }

  if (selected) {
    return <Page title={selected.user.user_code} subtitle={selected.user.email} onBack={() => setSelected(null)} refreshing={loading}
      onRefresh={() => void open(selected.user.id)}>
      {!!error && <Notice text={error} danger />}
      <Surface>
        <View style={s.between}>
          <View style={s.row}><IconTile name="user" /><Copy style={s.heading}>บัญชีลูกค้า</Copy></View>
          <Badge text={selected.user.status} tone={selected.user.status === "ACTIVE" ? "success" : "warning"} />
        </View>
        <DetailRow label="Email verified" value={selected.user.email_verified_at ? "ยืนยันแล้ว" : "ยังไม่ยืนยัน"} />
        <DetailRow label="แพ็กเกจ" value={activeSub?.plan_code || "ไม่มี"} />
        <DetailRow label="หมดอายุ" value={when(activeSub?.expires_at)} />
        <DetailRow label="MT5" value={selected.mt5Accounts[0]?.account_number || "ยังไม่ผูก"} last />
      </Surface>

      {selected.slots.map(slot=>{
        const choices=Array.isArray(slot.market_watch_symbols)
          ? slot.market_watch_symbols.map(item=>String(item||"").trim()).filter(Boolean).slice(0,40)
          : [];
        const editing=slotEditorId===slot.id;
        const state=String(slot.actual_state||"OFFLINE").toUpperCase();
        return <Surface key={slot.id} style={s.stack}>
          <View style={s.between}>
            <View style={s.row}><IconTile name="list" tone={slot.mode==="CLOUD"?"accent":"blue"} size={36}/><View><Copy style={s.heading}>{slot.mode} · Slot #{slot.slot_number}</Copy><Copy style={[s.small,{color:c.muted}]}>{slot.account_number||"ยังไม่เชื่อม MT5"}</Copy></View></View>
            <Badge text={state} tone={state==="RUNNING"?"success":state==="SAFE_STOP"?"warning":state==="OFFLINE"?"danger":"neutral"}/>
          </View>
          <DetailRow label="Symbol ปัจจุบัน" value={String(slot.requested_symbol||slot.active_symbol||"—")}/>
          <DetailRow label="Position / Pending" value={Number(slot.positions||0)+" / "+Number(slot.pending_orders||0)}/>
          <Button label={editing?"ปิดการจัดการ MT5":"จัดการ Symbol / รีเซ็ต MT5"} icon="settings" variant="secondary" onPress={()=>editSlotSymbol(slot)}/>
          {editing&&<>
            <Pressable
              accessibilityRole="button"
              onPress={()=>setSymbolChoicesOpen(v=>!v)}
              style={{minHeight:48,paddingHorizontal:14,borderRadius:13,borderWidth:1,borderColor:c.border,backgroundColor:c.input,flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10}}>
              <View style={s.grow}><Copy style={[s.small,{color:c.muted}]}>เลือกจาก MT5 บัญชีนี้</Copy><Copy style={s.label}>{choices.length?choices.length+" Symbol":"ยังไม่มีรายการจาก MT5"}</Copy></View>
              <Icon name="chevron" color={c.subtle} size={17}/>
            </Pressable>
            {symbolChoicesOpen&&choices.length>0&&<View style={{borderWidth:1,borderColor:c.border,borderRadius:13,overflow:"hidden"}}>
              {choices.map((item,index)=><Pressable key={item} onPress={()=>{setSymbolValue(item);setSymbolChoicesOpen(false);}}
                style={{minHeight:44,paddingHorizontal:13,justifyContent:"center",backgroundColor:item===symbolValue?c.accentSoft:c.surface,borderBottomWidth:index===choices.length-1?0:1,borderBottomColor:c.border}}>
                <Copy style={{color:item===symbolValue?c.accent:c.text,fontWeight:item===symbolValue?"700":"500"}}>{item}</Copy>
              </Pressable>)}
            </View>}
            <Field label="Symbol (เลือกหรือพิมพ์เอง)" value={symbolValue} onChangeText={setSymbolValue} placeholder="เช่น XAUUSD, XAUUSDm"/>
            <PinField value={pin} onChange={setPin}/>
            <Button label="บันทึก Symbol" icon="check" disabled={pin.length!==6||!symbolValue.trim()} onPress={()=>void saveSymbol(slot)}/>
            <Button label="รีเซ็ตการเชื่อมต่อ MT5" icon="refresh" variant="danger" disabled={pin.length!==6||!slot.mt5_account_id} onPress={()=>resetMt5(slot)}/>
          </>}
        </Surface>;
      })}

      <Surface style={s.stack}>
        <Copy style={s.heading}>เปิดสิทธิ์ / เปลี่ยนแพ็กเกจ</Copy>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["LOCAL","CLOUD"] as const).map(value => <Pressable key={value} onPress={() => setMode(value)}
            style={{ flex: 1, padding: 11, borderRadius: 12, backgroundColor: mode === value ? c.accentSoft : c.raised }}>
            <Copy style={{ textAlign: "center", color: mode === value ? c.accent : c.muted, fontWeight: "700" }}>{value}</Copy>
          </Pressable>)}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[1,3,6,12].map(value => <Pressable key={value} onPress={() => setMonths(value)}
            style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: months === value ? c.accentSoft : c.raised }}>
            <Copy style={{ color: months === value ? c.accent : c.muted, fontWeight: "700" }}>{value} เดือน</Copy>
          </Pressable>)}
        </View>
        <PinField value={pin} onChange={setPin} />
        <Button label="เปิดสิทธิ์" icon="check" disabled={pin.length !== 6} onPress={() => void grant()} />
      </Surface>

      <Surface style={s.stack}>
        <Copy style={s.heading}>เพิ่ม / ลดวันใช้งาน</Copy>
        <Field label="จำนวนวัน" value={days} onChangeText={v => setDays(v.replace(/\D/g, ""))} keyboardType="number-pad" />
        <PinField value={pin} onChange={setPin} />
        <View style={{flexDirection:"row",gap:8}}>
          <View style={s.grow}><Button label="เพิ่มวัน" icon="clock" variant="secondary" disabled={!activeSub || pin.length !== 6} onPress={() => void adjustDays(1)} /></View>
          <View style={s.grow}><Button label="ลดวัน" icon="clock" variant="danger" disabled={!activeSub || pin.length !== 6} onPress={() => void adjustDays(-1)} /></View>
        </View>
        <Button label="รีเฟรชข้อมูลบัญชี" icon="refresh" variant="secondary" onPress={() => void open(selected.user.id)} />
      </Surface>

      <Surface style={s.stack}>
        <Copy style={s.heading}>สถานะบัญชี</Copy>
        <PinField value={pin} onChange={setPin} />
        <Button
          label={selected.user.status === "ACTIVE" ? "ระงับบัญชี" : "เปิดบัญชีกลับมา"}
          icon="lock"
          variant={selected.user.status === "ACTIVE" ? "danger" : "secondary"}
          disabled={pin.length !== 6}
          onPress={() => void setStatus(selected.user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE")}
        />
      </Surface>
    </Page>;
  }

  return <Page title="ลูกค้า" subtitle="สิทธิ์ใช้งานและบัญชี MT5" refreshing={loading} onRefresh={() => void search()}>
    {!!error && <Notice text={error} danger onRetry={() => void search()} />}
    <Surface style={s.stack}>
      <View style={s.row}><IconTile name="search" /><Copy style={s.heading}>ค้นหาบัญชีลูกค้า</Copy></View>
      <Field label="User ID / Email / MT5 Account" value={q} onChangeText={setQ} placeholder="ค้นหาลูกค้า" />
      <Button label="ค้นหา" icon="search" onPress={() => void search()} />
    </Surface>
    {!items.length && !loading ? <Empty title="ไม่พบบัญชี" caption="ลองค้นหาด้วย User ID, Email หรือ MT5 Account" icon="user" /> :
      items.map(item => <Pressable key={item.id} onPress={() => void open(item.id)} style={({ pressed }) => ({ opacity: pressed ? .7 : 1 })}>
        <Surface>
          <View style={s.between}>
            <View style={s.row}>
              <IconTile name="user" size={36} />
              <View>
                <Copy style={s.heading}>{item.user_code}</Copy>
                <Copy style={[s.small, { color: c.muted }]}>{item.email}</Copy>
              </View>
            </View>
            <Icon name="chevron" color={c.subtle} size={17} />
          </View>
          <View style={[s.between, { marginTop: 12 }]}>
            <Badge text={item.status} tone={item.status === "ACTIVE" ? "success" : "warning"} />
            <Copy style={[s.small, { color: c.muted }]}>{item.plan_code || "ไม่มีแพ็กเกจ"} · {when(item.subscription_expires_at)}</Copy>
          </View>
        </Surface>
      </Pressable>)}

  </Page>;
}
