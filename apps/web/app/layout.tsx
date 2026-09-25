import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./premium-dashboard.css";
import "./dashboard-live.css";
import "./mobile-ui.css";
import { Mt5ManualActionControls } from "../components/Mt5ManualActionControls";
import { SystemPopupProvider } from "../components/SystemPopupProvider";
import { MobileExperience } from "../components/MobileExperience";

export const metadata: Metadata = {
  title: "SCENOVA — MT5 BOT EA",
  description: "ระบบควบคุม MT5 BOT EA ผ่านเว็บและมือถือ รองรับ Cloud และ Local",
  applicationName: "SCENOVA",
  appleWebApp: {
    capable: true,
    title: "SCENOVA",
    statusBarStyle: "black-translucent"
  },
  formatDetection: { telephone: false }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#050711" },
    { media: "(prefers-color-scheme: light)", color: "#f4f6fb" }
  ]
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>
        <SystemPopupProvider>
          <MobileExperience />
          <Mt5ManualActionControls />
          {children}
        </SystemPopupProvider>
      </body>
    </html>
  );
}
