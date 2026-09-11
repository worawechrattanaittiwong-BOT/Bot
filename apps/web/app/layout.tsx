import type { Metadata } from "next";
import "./globals.css";
import { CustomerNavigationLabels } from "../components/CustomerNavigationLabels";
import { Mt5AccountSwitchAssistant } from "../components/Mt5AccountSwitchAssistant";
import { Mt5ManualActionControls } from "../components/Mt5ManualActionControls";

export const metadata: Metadata = {
  title: "SCENOVA — MT5 BOT EA",
  description: "ระบบควบคุม MT5 BOT EA ผ่านเว็บและมือถือ รองรับ Cloud และ Local"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>
        {children}
        <CustomerNavigationLabels />
        <Mt5AccountSwitchAssistant />
        <Mt5ManualActionControls />
      </body>
    </html>
  );
}
