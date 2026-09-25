import type { Metadata } from "next";
import "./globals.css";
import "./premium-dashboard.css";
import "./dashboard-live.css";
import { Mt5ManualActionControls } from "../components/Mt5ManualActionControls";
import { SystemPopupProvider } from "../components/SystemPopupProvider";

const SITE_URL = "https://snvea-bot.online";
const FAVICON_URL = "/favicon.png";

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
    icon: [
      {
        url: FAVICON_URL,
        type: "image/png",
        sizes: "512x512"
      }
    ],
    shortcut: [FAVICON_URL],
    apple: [
      {
        url: "/apple-touch-icon.png",
        type: "image/png",
        sizes: "512x512"
      }
    ]
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
