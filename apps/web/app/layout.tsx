import type { Metadata } from "next";
import "./globals.css";
import "./premium-dashboard.css";
import "./dashboard-live.css";
import { Mt5ManualActionControls } from "../components/Mt5ManualActionControls";
import { SystemPopupProvider } from "../components/SystemPopupProvider";

const SITE_URL = "https://snvea-bot.online";
const ICON_URL = "/scenova-ea-icon.png";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "SCENOVA EA",
  title: {
    default: "SCENOVA EA",
    template: "%s | SCENOVA EA"
  },
  description: "ระบบควบคุม MT5 BOT EA ผ่านเว็บและมือถือ รองรับ Cloud และ Local",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: ICON_URL, type: "image/png" }],
    shortcut: [ICON_URL],
    apple: [{ url: ICON_URL, type: "image/png" }]
  },
  appleWebApp: {
    capable: true,
    title: "SCENOVA EA",
    statusBarStyle: "default"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>
        <SystemPopupProvider>
          <Mt5ManualActionControls />
          {children}
        </SystemPopupProvider>
      </body>
    </html>
  );
}
