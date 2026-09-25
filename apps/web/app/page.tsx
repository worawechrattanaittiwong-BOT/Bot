import type { Metadata } from "next";
import WebsitePage from "./website/page";

const SITE_URL = "https://snvea-bot.online";

export const metadata: Metadata = {
  title: "SCENOVA | ระบบเทรดอัตโนมัติ MT5 BOT EA",
  description:
    "SCENOVA ระบบควบคุม MT5 BOT EA สำหรับการเทรดอัตโนมัติ รองรับ Cloud และ Local ใช้งานผ่านเว็บและมือถือ พร้อมระบบจัดการความเสี่ยง",
  alternates: {
    canonical: SITE_URL
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "SCENOVA",
    title: "SCENOVA | ระบบเทรดอัตโนมัติ MT5 BOT EA",
    description:
      "ระบบควบคุม MT5 BOT EA ผ่านเว็บและมือถือ รองรับ Cloud และ Local พร้อมระบบจัดการความเสี่ยง"
  },
  twitter: {
    card: "summary_large_image",
    title: "SCENOVA | ระบบเทรดอัตโนมัติ MT5 BOT EA",
    description:
      "ระบบควบคุม MT5 BOT EA ผ่านเว็บและมือถือ รองรับ Cloud และ Local พร้อมระบบจัดการความเสี่ยง"
  }
};

const websiteStructuredData = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "SCENOVA",
  alternateName: "SCENOVA MT5 BOT EA",
  url: SITE_URL,
  description:
    "ระบบควบคุม MT5 BOT EA ผ่านเว็บและมือถือ รองรับ Cloud และ Local"
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteStructuredData) }}
      />
      <WebsitePage />
    </>
  );
}
