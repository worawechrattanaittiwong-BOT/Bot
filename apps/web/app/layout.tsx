import type { Metadata } from "next";
import "./globals.css";
import "./premium-dashboard.css";
import "./dashboard-live.css";
import "./mt5-dialog-premium.css";
import { Mt5ManualActionControls } from "../components/Mt5ManualActionControls";
import { SystemPopupProvider } from "../components/SystemPopupProvider";
import { SCENOVA_APPLE_TOUCH_ICON, SCENOVA_BRAND_NAME, SCENOVA_MASTER_MARK } from "../lib/brand";

const SITE_URL = "https://snvea-bot.online";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SCENOVA_BRAND_NAME,
  title: {
    default: SCENOVA_BRAND_NAME,
    template: "%s | SCENOVA EA"
  },
  description: "ระบบควบคุม MT5 BOT EA ผ่านเว็บและมือถือ รองรับ Cloud และ Local",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      {
        url: SCENOVA_MASTER_MARK,
        type: "image/png",
        sizes: "1254x1254"
      }
    ],
    shortcut: [SCENOVA_MASTER_MARK],
    apple: [
      {
        url: SCENOVA_APPLE_TOUCH_ICON,
        type: "image/png",
        sizes: "1254x1254"
      }
    ]
  },
  appleWebApp: {
    capable: true,
    title: SCENOVA_BRAND_NAME,
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
