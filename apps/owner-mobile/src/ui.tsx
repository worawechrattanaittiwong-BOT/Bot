import React, { useId, useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type TextProps, type ViewStyle, type StyleProp, useWindowDimensions } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { amountLabel, type MainTab } from "./finance";
import { fontFamily, layout as s, useTheme } from "./theme";

const paths = {
  wallet: "M3 7V5a2 2 0 0 1 2-2h13v4M3 7h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm18 5h-5a2 2 0 0 0 0 4h5m-4-2h.01",
  home: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z",
  list: "M8 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2Zm0 5h8m-8 4h8m-8 4h5",
  shield: "m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6l8-3Zm-4 9 3 3 5-6",
  bank: "m2 8 10-5 10 5H2Zm3 3v7m5-7v7m4-7v7m5-7v7M3 21h18",
  lock: "M7 10V7a5 5 0 0 1 10 0v3M6 10h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Zm6 5v2",
  sun: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  moon: "M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  eyeOff: "m3 3 18 18M10 5h2c6 0 10 7 10 7a18 18 0 0 1-4 4M6 6a21 21 0 0 0-4 6s4 7 10 7a14 14 0 0 0 5-1M10 10a3 3 0 0 0 4 4",
  chevron: "m9 5 7 7-7 7", back: "m15 5-7 7 7 7", arrow: "M12 20V4m-6 6 6-6 6 6",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-5v5l3 2",
  percent: "m5 19 14-14M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  settings: "M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6",
  check: "m5 12 4 4L19 6", close: "m6 6 12 12M6 18 18 6",
  alert: "m12 3 10 18H2L12 3Zm0 6v5m0 3h.01",
  refresh: "M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M5 15a8 8 0 0 0 13 3",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  search: "M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-1 5 6 6", user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-3a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v3",
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 21, color }: { name: IconName; size?: number; color?: string }) {
  const { colors: c } = useTheme();
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || c.accent} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Path d={paths[name]} /></Svg>;
}
export function Copy({ style, ...props }: TextProps) {
  const { colors: c } = useTheme();
  return <Text {...props} style={[{ color: c.text, fontFamily }, style]} />;
}
export function IconTile({ name, tone = "accent", size = 42 }: { name: IconName; tone?: "accent" | "success" | "warning" | "blue"; size?: number }) {
  const { colors: c } = useTheme();
  return <View style={{ width: size, height: size, borderRadius: 14, backgroundColor: c[`${tone}Soft`], alignItems: "center", justifyContent: "center" }}><Icon name={name} color={c[tone]} size={size * .48} /></View>;
}
export function IconButton({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  const { colors: c } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} onPress={onPress} disabled={disabled} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", opacity: disabled ? .45 : pressed ? .65 : 1 })}><Icon name={icon} color={c.muted} size={19} /></Pressable>;
}
export function ThemeSwitch() {
  const { colors: c, mode, setMode } = useTheme();
  return <View style={{ flexDirection: "row", borderWidth: 1, borderColor: c.border, backgroundColor: c.input, borderRadius: 15, padding: 3 }}>{(["light", "dark"] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value === "light" ? "ธีมสว่าง" : "ธีมมืด"} accessibilityState={{ selected: value === mode }} onPress={() => setMode(value)} style={{ width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: value === mode ? c.accentSoft : "transparent" }}><Icon name={value === "light" ? "sun" : "moon"} color={value === mode ? c.accent : c.subtle} size={18} /></Pressable>)}</View>;
}
export function Brand({ large = false }: { large?: boolean }) {
  const { colors: c } = useTheme();
  const compact = useWindowDimensions().width < 360;
  return <View style={[s.row, { gap: compact ? 5 : 10 }]}><Image source={require("../assets/scenova-owner-icon-v2.png")} accessibilityLabel="SCENOVA" style={{ width: large ? 58 : compact ? 28 : 38, height: large ? 58 : compact ? 28 : 38, borderRadius: large ? 18 : 12 }} /><View><Copy style={{ fontSize: large ? 25 : compact ? 16 : 19, fontWeight: "800", letterSpacing: compact ? .8 : 1.5 }}>SCENOVA</Copy><Copy style={{ color: c.accent, fontSize: large ? 11 : 9, letterSpacing: 4, fontWeight: "700", marginTop: 2 }}>OWNER</Copy></View></View>;
}
export function Surface({ children, style, variant = "plain" }: React.PropsWithChildren<{ style?: StyleProp<ViewStyle>; variant?: "plain" | "hero" | "owner" }>) {
  const { colors: c, mode } = useTheme();
  const id = useId().replace(/:/g, "");
  return <View style={[s.card, { backgroundColor: c.surface, borderColor: variant === "plain" ? c.border : variant === "hero" ? c.heroBorder : c.ownerBorder }, mode === "light" && s.shadow, style]}>
    {variant !== "plain" && <View pointerEvents="none" style={StyleSheet.absoluteFill}><Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 400 230"><Defs><LinearGradient id={id} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={variant === "hero" ? c.hero : c.owner} /><Stop offset="1" stopColor={variant === "hero" ? c.heroEnd : c.ownerEnd} /></LinearGradient></Defs><Rect width={400} height={230} fill={`url(#${id})`} /><Path d="M400 30C285 85 340 175 150 250M420 60C300 100 330 195 195 250M430 85C360 120 350 230 250 260" stroke={c.accent} strokeWidth={1} opacity={.12} fill="none" /></Svg></View>}
    {children}
  </View>;
}
export function Amount({ value, hidden, size = 30, color, currency = true }: { value: number | string | undefined | null; hidden?: boolean; size?: number; color?: string; currency?: boolean }) {
  const { colors: c } = useTheme();
  const { width } = useWindowDimensions();
  size = width < 360 ? Math.round(size * .84) : size;
  return <View style={{ minWidth: 0 }}><Copy numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.62} style={[s.number, { color: color || c.text, fontSize: size, lineHeight: size * 1.35 }]}>{hidden ? "••••••" : amountLabel(value)}{currency && <Copy style={{ color: c.muted, fontSize: Math.max(10, size * .38), fontWeight: "500", letterSpacing: 0 }}>  THB</Copy>}</Copy></View>;
}
export function Badge({ text, tone = "neutral", dot = true }: { text: string; tone?: "neutral" | "success" | "warning" | "danger"; dot?: boolean }) {
  const { colors: c } = useTheme();
  const color = tone === "neutral" ? c.muted : c[tone];
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, backgroundColor: tone === "neutral" ? c.raised : c[`${tone}Soft`], alignSelf: "flex-start" }}>{dot && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }} />}<Copy style={{ color, fontSize: 10, lineHeight: 16, fontWeight: "600" }}>{text}</Copy></View>;
}
export function Button({ label, onPress, busy = false, disabled = false, icon, variant = "primary" }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean; icon?: IconName; variant?: "primary" | "secondary" | "danger" }) {
  const { colors: c } = useTheme();
  const fg = variant === "primary" ? c.onPrimary : variant === "danger" ? c.danger : c.accent;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => ({ minHeight: 50, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 15, backgroundColor: variant === "primary" ? c.primary : variant === "danger" ? c.dangerSoft : c.accentSoft, opacity: disabled || busy ? .45 : pressed ? .75 : 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 })}>{busy ? <ActivityIndicator color={fg} size="small" /> : icon && <Icon name={icon} color={fg} size={18} />}<Copy style={{ color: fg, fontSize: 14, fontWeight: "700", textAlign: "center" }}>{label}</Copy></Pressable>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const { colors: c } = useTheme();
  const [focus, setFocus] = useState(false);
  return <View style={{ gap: 7 }}><Copy style={[s.label, { color: c.muted, fontWeight: "600" }]}>{label}</Copy><TextInput {...props} accessibilityLabel={label} placeholderTextColor={c.subtle} autoCapitalize={props.autoCapitalize || "none"} autoCorrect={false} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} style={[{ color: c.text, backgroundColor: c.input, borderColor: focus ? c.accent : c.border, borderWidth: 1, borderRadius: 14, minHeight: 52, paddingHorizontal: 15, paddingVertical: 12, fontFamily, fontSize: 16 }, props.style]} /></View>;
}
export function PinField({ value, onChange, label = "ยืนยัน PIN 6 หลัก", editable = true }: { value: string; onChange: (value: string) => void; label?: string; editable?: boolean }) {
  return <Field label={label} value={value} onChangeText={v => onChange(v.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry maxLength={6} placeholder="••••••" editable={editable} style={{ letterSpacing: 8, textAlign: "center", fontSize: 23 }} />;
}
export function Notice({ text, danger, onRetry }: { text: string; danger?: boolean; onRetry?: () => void }) {
  const { colors: c } = useTheme();
  return <View accessibilityRole="alert" style={{ backgroundColor: danger ? c.dangerSoft : c.warningSoft, padding: 13, borderRadius: 14, gap: 8 }}><View style={s.row}><Icon name="alert" size={17} color={danger ? c.danger : c.warning} /><Copy style={[s.label, s.grow, { color: danger ? c.danger : c.warning }]}>{text}</Copy></View>{onRetry && <Button label="ลองอีกครั้ง" icon="refresh" onPress={onRetry} variant="secondary" />}</View>;
}
export function Empty({ title, caption, icon = "list" }: { title: string; caption: string; icon?: IconName }) {
  const { colors: c } = useTheme();
  return <View style={{ alignItems: "center", paddingVertical: 34, gap: 12 }}><IconTile name={icon} size={52} /><Copy style={s.heading}>{title}</Copy><Copy style={[s.label, { color: c.muted, textAlign: "center" }]}>{caption}</Copy></View>;
}
export function DetailRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  const { colors: c } = useTheme();
  return <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, paddingVertical: 13, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderColor: c.border }}><Copy style={[s.label, { color: c.muted, flex: 1 }]}>{label}</Copy><Copy style={[s.label, { fontWeight: "600", textAlign: "right", flex: 1.5 }]}>{value}</Copy></View>;
}
export function Page({ children, title, subtitle, onBack, refreshing = false, onRefresh }: React.PropsWithChildren<{ title?: string; subtitle?: string; onBack?: () => void; refreshing?: boolean; onRefresh?: () => void }>) {
  const { colors: c } = useTheme();
  return <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={s.content} refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} colors={[c.primary]} /> : undefined}>{title && <View style={s.row}>{onBack && <IconButton icon="back" label="กลับ" onPress={onBack} />}<View style={s.grow}><Copy accessibilityRole="header" style={s.title}>{title}</Copy>{subtitle && <Copy style={[s.label, { color: c.muted }]}>{subtitle}</Copy>}</View></View>}{children}</ScrollView></KeyboardAvoidingView>;
}
export function Frame({ children, tab, onNavigate, count = 0, onLock, auth = false }: React.PropsWithChildren<{ tab?: MainTab; onNavigate?: (tab: MainTab) => void; count?: number; onLock?: () => void; auth?: boolean }>) {
  const { colors: c } = useTheme();
  const { width } = useWindowDimensions();
  const items: Array<[MainTab, IconName, string]> = [["dashboard", "home", "เงิน"], ["packages", "list", "แพ็กเกจ"], ["promotions", "percent", "โปรโมชั่น"], ["accounts", "user", "บัญชี"]];
  return <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={["top", "bottom", "left", "right"]}>
    <View style={{ paddingHorizontal: width < 360 ? 14 : 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.border }}><View style={[s.between, { width: "100%", maxWidth: 560, alignSelf: "center" }]}><Brand /><View style={{ flexDirection: "row", gap: 8 }}><ThemeSwitch />{onLock && <IconButton icon="lock" label="ล็อกแอป" onPress={onLock} />}</View></View></View>
    <View style={s.fill}>{children}</View>
    {!auth && tab && onNavigate && <View accessibilityRole="tablist" style={{ flexDirection: "row", borderTopWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingTop: 8, paddingBottom: 6, paddingHorizontal: 12 }}>{items.map(([key, icon, label]) => <Pressable key={key} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: tab === key }} onPress={() => onNavigate(key)} style={{ flex: 1, minHeight: 59, alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 15, backgroundColor: key === tab ? c.accentSoft : "transparent" }}><View><Icon name={icon} color={tab === key ? c.accent : c.subtle} size={22} />{key === "dashboard" && count > 0 && <View style={{ position: "absolute", top: -5, right: -10, minWidth: 15, height: 15, borderRadius: 8, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" }}><Copy style={{ color: c.onPrimary, fontSize: 8, fontWeight: "700" }}>{count > 99 ? "99+" : count}</Copy></View>}</View><Copy style={{ color: tab === key ? c.accent : c.muted, fontSize: 10, fontWeight: tab === key ? "700" : "500" }}>{label}</Copy></Pressable>)}</View>}
  </SafeAreaView>;
}
