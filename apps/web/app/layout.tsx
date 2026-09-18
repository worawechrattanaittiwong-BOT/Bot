import type { Metadata } from "next";
import "./globals.css";
import "./premium-dashboard.css";
import "./dashboard-live.css";
import { CustomerNavigationLabels } from "../components/CustomerNavigationLabels";
import { Mt5ManualActionControls } from "../components/Mt5ManualActionControls";
import { SystemPopupProvider } from "../components/SystemPopupProvider";

export const metadata: Metadata = {
  title: "SCENOVA — MT5 BOT EA",
  description: "ระบบควบคุม MT5 BOT EA ผ่านเว็บและมือถือ รองรับ Cloud และ Local"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>
        <SystemPopupProvider>
          <CustomerNavigationLabels />
          <Mt5ManualActionControls />
          {children}
        </SystemPopupProvider>
      </body>
    </html>
  );
}
