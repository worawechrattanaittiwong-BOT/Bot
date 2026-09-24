import React, { createContext, useContext } from "react";
import { Platform, StyleSheet } from "react-native";

export type ThemeMode = "dark" | "light";
const palettes = {
  dark: {
    background: "#080F1E", surface: "#101A2D", raised: "#162137", input: "#0B1426", border: "#24324A",
    text: "#F2F5FD", muted: "#99A7BF", subtle: "#7485A3", accent: "#B7A2FF", accentSoft: "#26223F",
    primary: "#8057F5", primaryEnd: "#6240D5", hero: "#272046", heroEnd: "#111C32", heroBorder: "#47366D",
    success: "#72DDC0", successSoft: "#12342F", warning: "#F1C778", warningSoft: "#322B22", danger: "#FF9BAF", dangerSoft: "#392235",
    blue: "#8EBBFF", blueSoft: "#172D49", owner: "#102C37", ownerEnd: "#101D30", ownerBorder: "#255062", onPrimary: "#FFFFFF",
  },
  light: {
    background: "#F3F6FC", surface: "#FFFFFF", raised: "#EDF2FA", input: "#F7F9FD", border: "#DDE5F2",
    text: "#142444", muted: "#596C88", subtle: "#687D99", accent: "#215FD7", accentSoft: "#EAF0FD",
    primary: "#2675EC", primaryEnd: "#155BCF", hero: "#FFFFFF", heroEnd: "#EAF2FF", heroBorder: "#D6E4F9",
    success: "#087B61", successSoft: "#E4F5EE", warning: "#92620A", warningSoft: "#FFF5DC", danger: "#BB3157", dangerSoft: "#FDEDF2",
    blue: "#266BCE", blueSoft: "#E8F1FE", owner: "#F1FAF9", ownerEnd: "#EAF3FC", ownerBorder: "#CCE3EB", onPrimary: "#FFFFFF",
  },
};
export type Palette = typeof palettes.dark;
const ThemeContext = createContext({ mode: "dark" as ThemeMode, colors: palettes.dark, setMode: (_mode: ThemeMode) => {} });
export function ThemeProvider({ mode, setMode, children }: React.PropsWithChildren<{ mode: ThemeMode; setMode: (mode: ThemeMode) => void }>) {
  return <ThemeContext.Provider value={{ mode, setMode, colors: palettes[mode] }}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
export const layout = StyleSheet.create({
  fill: { flex: 1 }, row: { flexDirection: "row", alignItems: "center", gap: 10 }, between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  stack: { gap: 14 }, grow: { flex: 1, minWidth: 0 }, content: { width: "100%", maxWidth: 600, alignSelf: "center", padding: 18, gap: 12, paddingBottom: 28 },
  card: { borderWidth: 1, borderRadius: 22, padding: 18, overflow: "hidden" },
  title: { fontSize: 24, lineHeight: 34, fontWeight: "700", letterSpacing: -0.4 }, heading: { fontSize: 16, lineHeight: 24, fontWeight: "700" },
  label: { fontSize: 12, lineHeight: 19 }, small: { fontSize: 11, lineHeight: 18 }, body: { fontSize: 14, lineHeight: 22 },
  number: { fontWeight: "700", fontVariant: ["tabular-nums"], letterSpacing: -0.7 },
  shadow: { shadowColor: "#142C5A", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.045, shadowRadius: 18, elevation: 1 },
});
export const fontFamily = Platform.OS === "web" ? '"Leelawadee UI", "Noto Sans Thai", Tahoma, sans-serif' : undefined;
